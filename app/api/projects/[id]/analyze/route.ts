import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const sql = neon(process.env.DATABASE_URL!);

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

  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${projectId}`;
  const refs = (assets as Array<{ type: string; url: string; filename: string }>)
    .filter(a => a.type === 'reference' && !a.url.endsWith('.svg'));

  if (refs.length === 0) {
    return NextResponse.json({ error: 'No reference images to analyze. Upload at least one reference graphic.' }, { status: 400 });
  }

  // Konwertuj referencje na base64
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
  for (const ref of refs) {
    const b64 = await urlToBase64(ref.url);
    if (b64) imageParts.push({ inlineData: b64 });
  }

  if (imageParts.length === 0) {
    return NextResponse.json({ error: 'Failed to load reference images' }, { status: 500 });
  }

  const analysisPrompt = `You are a senior brand visual identity analyst. Analyze the ${imageParts.length} reference graphics provided and extract a precise, actionable visual style guide for the brand "${project.name}".

RULES FOR YOUR ANALYSIS:
- Be concise: maximum 200 words total
- Only describe elements that appear in ALL or MOST references (recurring patterns only)
- Never describe exceptions, one-off choices, or "sometimes" elements
- Resolve ambiguities: pick ONE font name, ONE background color hex, ONE layout rule
- Use specific hex codes when visible, or closest approximation
- Write in imperative style ("Use X", "Always Y", "Never Z")

Structure your response in exactly these 5 sections (no other sections):

BACKGROUND: [Single sentence. The exact background color/treatment used in every graphic. Include hex.]

TYPOGRAPHY: [Single sentence. The one primary font family + weights used. Case style (all-caps/mixed). Color.]

LAYOUT: [1-2 sentences. The repeating compositional pattern — where is the focal element, where is the logo, how is space divided.]

GRAPHIC ELEMENTS: [1-2 sentences. The 1-2 signature decorative/graphic elements that appear consistently. Describe shape, color, position.]

TONE: [Single sentence. The visual mood in 3-4 adjectives. What this brand looks like, not what it values.]`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

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

    const analysis = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('\n') || '';

    if (!analysis) throw new Error('Empty analysis response');

    // Zapisz do DB
    await sql`UPDATE projects SET brand_analysis = ${analysis} WHERE id = ${projectId}`;

    return NextResponse.json({ analysis });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Analysis error:', msg);
    return NextResponse.json({ error: 'Analysis failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
