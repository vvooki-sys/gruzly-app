import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const sql = neon(process.env.DATABASE_URL!);

interface BrandSection {
  id: string;
  title: string;
  content: string;
  type: 'standard' | 'custom';
  order: number;
  icon?: string;
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (mimeType.includes('svg')) return null;
    return { data, mimeType };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const { source } = await req.json().catch(() => ({}));

  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${projectId}`;

  let analysisPrompt: string;
  let imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  if (source === 'brandbook') {
    const brandbook = (assets as Array<{ type: string; url: string; filename: string }>)
      .find(a => a.type === 'brandbook');

    if (!brandbook) {
      return NextResponse.json({ error: 'No brandbook uploaded' }, { status: 400 });
    }

    const b64 = await urlToBase64(brandbook.url);
    if (!b64) {
      return NextResponse.json({ error: 'Failed to load brandbook PDF' }, { status: 500 });
    }

    imageParts.push({ inlineData: { data: b64.data, mimeType: 'application/pdf' } });

    analysisPrompt = `You are a senior brand identity analyst. Read this brand book PDF for "${project.name}" and extract ALL brand identity information into structured sections.

CRITICAL RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no text outside the JSON
2. Extract EVERY section you find in the brand book
3. For standard sections (listed below), use the exact IDs provided
4. For anything unique/special not in the standard list — create a custom section with id starting with "custom_"
5. Content must be precise and actionable — include exact hex codes, exact measurements, exact rules
6. Write content in Polish if the brand book is in Polish

STANDARD SECTION IDs (use these exact ids when the content matches):
- "modul" — Construction module, margins, safety fields, measurements
- "tlo" — Background color/treatment
- "gradient" — Brand gradient (colors, direction, usage rules)
- "kolorystyka" — Primary color palette with hex codes
- "kolorystyka_dodatkowa" — Secondary/additional colors
- "typografia" — Typography — fonts, weights, sizes, kerning, line height, rules
- "logo" — Logotype — versions, placement, size, safety zone
- "blob" — Decorative elements, shapes, organic elements
- "copy" — Text/copy rules — case, alignment, hierarchy
- "cta" — Call to Action — construction, colors, sizes, placement
- "stickery" — Stickers, badges, labels, stamps, tabs (patki)
- "packshot" — Product photography rules
- "legal" — Legal text — size, color, placement
- "animacje" — Animation rules (if present)

Return this exact JSON structure:
{
  "sections": [
    {
      "id": "gradient",
      "title": "Gradient NCO",
      "content": "Gradient przechodzi od #6e46a0 (jasny, góra) do #2d1464 (ciemny, dół). Dla formatów 1200x1200px i 360x640px: góra jasna, dół ciemna. Dla formatów 336x280px i 750x300px: lewa jasna, prawa ciemna.",
      "type": "standard",
      "order": 1,
      "icon": "🎨"
    }
  ],
  "brandRules": [
    "Gradient NCO jest obowiązkowy we wszystkich kampaniach",
    "Font tylko Manrope Regular i Extra Bold — bez wyjątków"
  ]
}`;

  } else {
    const refs = (assets as Array<{ type: string; url: string; filename: string }>)
      .filter(a => a.type === 'reference' && !a.url.endsWith('.svg'));

    if (refs.length === 0) {
      return NextResponse.json({ error: 'No reference images to analyze. Upload at least one reference graphic.' }, { status: 400 });
    }

    for (const ref of refs) {
      const b64 = await urlToBase64(ref.url);
      if (b64) imageParts.push({ inlineData: b64 });
    }

    if (imageParts.length === 0) {
      return NextResponse.json({ error: 'Failed to load reference images' }, { status: 500 });
    }

    analysisPrompt = `You are a brand visual identity analyst. Analyze the ${imageParts.length} reference graphics for brand "${project.name}".

RULES:
- Return ONLY valid JSON — no markdown, no explanation
- Maximum 30 words per section content
- Only describe recurring, non-optional patterns
- Include exact hex codes when visible

Return this exact JSON:
{
  "sections": [
    { "id": "tlo", "title": "Tło", "content": "...", "type": "standard", "order": 1, "icon": "🖼" },
    { "id": "typografia", "title": "Typografia", "content": "...", "type": "standard", "order": 2, "icon": "📝" },
    { "id": "modul", "title": "Kompozycja i layout", "content": "...", "type": "standard", "order": 3, "icon": "📐" },
    { "id": "blob", "title": "Elementy graficzne", "content": "...", "type": "standard", "order": 4, "icon": "✨" },
    { "id": "copy", "title": "Ton i nastrój", "content": "...", "type": "standard", "order": 5, "icon": "💬" }
  ],
  "brandRules": []
}`;
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  // Use multimodal text model — NOT the image-generation model (which returns empty text parts)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          ...imageParts,
          { text: analysisPrompt },
        ],
      }],
    });

    const responseText = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('\n') || '';

    if (!responseText) throw new Error('Empty analysis response');

    // Parse JSON response
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: { sections: BrandSection[]; brandRules: string[] };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: wrap plain text as a single section
      parsed = {
        sections: [{ id: 'analiza', title: 'Analiza marki', content: cleaned, type: 'standard', order: 1 }],
        brandRules: [],
      };
    }

    // Build brand_analysis text fallback (for generate route backward compat)
    const brandAnalysis = [...parsed.sections]
      .sort((a, b) => a.order - b.order)
      .map(s => `${s.title.toUpperCase()}: ${s.content}`)
      .join('\n\n');

    // Save brand_sections and brand_analysis
    await sql`
      UPDATE projects
      SET brand_sections = ${JSON.stringify(parsed.sections)}::jsonb,
          brand_analysis = ${brandAnalysis},
          updated_at = NOW()
      WHERE id = ${projectId}
    `;

    let brandRules: string | null = null;
    let suggestedRules: string | null = null;

    if (parsed.brandRules && parsed.brandRules.length > 0) {
      const rulesText = parsed.brandRules.join('\n');
      if (project.brand_rules) {
        suggestedRules = rulesText;
      } else {
        brandRules = rulesText;
        await sql`UPDATE projects SET brand_rules = ${rulesText} WHERE id = ${projectId}`;
      }
    }

    return NextResponse.json({
      sections: parsed.sections,
      analysis: brandAnalysis,
      brandRules: brandRules || undefined,
      suggestedRules: suggestedRules || undefined,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Analysis error:', msg);
    return NextResponse.json({ error: 'Analysis failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
