export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const getDb = () => neon(process.env.DATABASE_URL!);

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  fb_post: { width: 1080, height: 1080 },
  ln_post: { width: 1200, height: 628 },
  story:   { width: 1080, height: 1920 },
  banner:  { width: 1200, height: 400 },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { format = 'fb_post' } = await req.json();
  const projectId = parseInt(id);

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sections = (project.brand_sections || []) as Array<{ title: string; content: string }>;
  const rules = project.brand_rules || '';
  const dims = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.fb_post;

  const brandContext = sections
    .map(s => `[${s.title}]: ${s.content}`)
    .join('\n');

  if (!brandContext) {
    return NextResponse.json({ error: 'No brand sections — analyze brand first' }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a graphic design system engineer. Based on the brand identity data below, generate a precise template layout JSON for a ${dims.width}x${dims.height}px social media graphic.

BRAND IDENTITY:
${brandContext}

BRAND RULES:
${rules}

FORMAT: ${dims.width}x${dims.height}px

CRITICAL: Return JSON using ONLY the zones-based schema below. Do NOT use fields like centralElement, decoration, copy.position, copy.alignment — they are not supported.

Generate this exact structure:

{
  "background": {
    "type": "solid",
    "color": "#hex"
  },
  "whiteSpace": {
    "enabled": false,
    "position": "bottom",
    "height": 0,
    "borderRadius": 0,
    "color": "#ffffff"
  },
  "logo": {
    "size": 70,
    "margin": 36,
    "variant": "default"
  },
  "copy": {
    "fontFamily": "sans-serif",
    "headlineFontSize": 56,
    "headlineFontWeight": 800,
    "headlineColor": "#ffffff",
    "subtextFontSize": 24,
    "subtextFontWeight": 400,
    "subtextColor": "#ffffffcc",
    "lineHeight": 1.15,
    "letterSpacing": 0,
    "textTransform": "none"
  },
  "cta": {
    "enabled": false,
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "fontSize": 18,
    "borderRadius": 24,
    "paddingH": 24,
    "paddingV": 12
  },
  "sticker": {
    "enabled": false,
    "shape": "circle",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "fontSize": 14,
    "size": 100
  },
  "legal": { "enabled": false, "fontSize": 11, "color": "#ffffff80" },
  "padding": { "top": 36, "right": 36, "bottom": 36, "left": 36 },
  "zones": [
    {
      "id": "header",
      "gridArea": "1 / 1 / 2 / 13",
      "flexDirection": "row",
      "justifyContent": "flex-start",
      "alignItems": "center",
      "children": [{ "type": "logo" }]
    },
    {
      "id": "central",
      "gridArea": "2 / 1 / 10 / 13",
      "flexDirection": "column",
      "justifyContent": "center",
      "alignItems": "center",
      "children": [{ "type": "central-image" }]
    },
    {
      "id": "copy",
      "gridArea": "10 / 1 / 13 / 13",
      "flexDirection": "column",
      "justifyContent": "flex-end",
      "alignItems": "flex-start",
      "gap": 12,
      "children": [
        { "type": "headline" },
        { "type": "subtext" }
      ]
    }
  ]
}

RULES:
- Return ONLY valid JSON — no markdown, no code blocks, no explanation
- Use exact hex colors from brand identity
- All pixel values as plain numbers (no units, no strings)
- gridArea format: "rowStart / colStart / rowEnd / colEnd" on a 12-row x 12-column grid
- Full width = columns 1 to 13, full height = rows 1 to 13
- logo zone: always "justifyContent": "flex-start" if brand has top-left logo placement
- Adapt zones to brand — if brand uses white space at bottom, enable whiteSpace and add a footer zone
- DO NOT include centralElement or decoration as top-level fields
- background.type can be "gradient" — if so add gradientFrom, gradientTo, gradientAngle (degrees)`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('') || '';

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const layout = JSON.parse(cleaned);

    const [template] = await getDb()`
      INSERT INTO templates (project_id, name, format, width, height, layout)
      VALUES (${projectId}, ${format + ' – ' + project.name}, ${format}, ${dims.width}, ${dims.height}, ${JSON.stringify(layout)}::jsonb)
      RETURNING *
    `;

    return NextResponse.json({ template, layout });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Template generation error:', msg);
    return NextResponse.json({ error: msg.substring(0, 200) }, { status: 500 });
  }
}
