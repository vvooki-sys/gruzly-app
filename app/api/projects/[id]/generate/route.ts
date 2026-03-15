import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const sql = neon(process.env.DATABASE_URL!);

const FORMAT_SIZES: Record<string, string> = {
  fb_post: 'square 1:1 aspect ratio, 1080x1080px',
  ln_post: 'landscape 1.91:1 aspect ratio, 1200x628px',
  story:   'vertical 9:16 aspect ratio, 1080x1920px',
  banner:  'wide banner 3:1 aspect ratio, 1200x400px',
};

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    const mimeType = res.headers.get('content-type') || 'image/png';
    return { data, mimeType: mimeType.split(';')[0] };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { headline, subtext, brief, format, mode } = await req.json();

  if (!headline || !format) {
    return NextResponse.json({ error: 'headline and format required' }, { status: 400 });
  }

  const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)}`;

  // Ensure parent_id column exists
  await sql`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

  // ── Build image parts ──────────────────────────────────────────────────────
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  const logoAsset = (assets as Array<{ type: string; url: string }>).find(a => a.type === 'logo');
  if (logoAsset && !logoAsset.url.toLowerCase().endsWith('.svg')) {
    const b64 = await urlToBase64(logoAsset.url);
    if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
  }

  // In fast mode skip reference images (logo always included)
  if (mode !== 'fast') {
    const refs = (assets as Array<{ type: string; url: string }>)
      .filter(a => a.type === 'reference')
      .slice(0, 3);
    for (const ref of refs) {
      const b64 = await urlToBase64(ref.url);
      if (b64) imageParts.push({ inlineData: b64 });
    }
  }

  const refs = (assets as Array<{ type: string; url: string }>).filter(a => a.type === 'reference').slice(0, 3);

  // ── Build 3-layer prompt (PR 3b) ───────────────────────────────────────────
  const sep = '════════════════════════════════════════';

  // Layer 1 — omit entirely if no brand rules
  const layer1 = project.brand_rules
    ? `\n${sep}
LAYER 1 — ABSOLUTE RULES (non-negotiable constraints)
These are hard limits. Violating ANY of these is unacceptable, regardless of the brief.
${sep}
${project.brand_rules.split('\n').filter((r: string) => r.trim()).map((r: string, i: number) => `${i + 1}. ${r.trim()}`).join('\n')}
`
    : '';

  // Brand asset context note (inside Layer 2)
  const assetNote = imageParts.length > 0
    ? `Provided visual assets:${logoAsset ? '\n- First image: brand LOGO — reproduce it exactly, place it prominently' : ''}${mode !== 'fast' && refs.length > 0 ? `\n- Next ${refs.length} image(s): brand reference graphics — match this visual style closely` : ''}\n\n`
    : '';

  // Brand DNA content — prefer auto-analysis, fallback to manual fields
  const brandDna = project.brand_analysis
    ? project.brand_analysis
    : `Visual style: ${project.style_description || 'modern, professional, event agency aesthetic'}
Color palette: ${project.color_palette || 'dark navy background #103958, coral accent #EF4853'}
Typography: ${project.typography_notes || 'bold geometric sans-serif, clean hierarchy'}`;

  const layer2 = `
${sep}
LAYER 2 — BRAND DNA (visual identity to replicate)
Study and follow this brand style. The provided reference images and logo are visual references.
${sep}
${assetNote}${brandDna}
`;

  const layer3 = `
${sep}
LAYER 3 — CREATIVE BRIEF (what to create)
Interpret creatively within the constraints above.
${sep}
Brand: ${project.name}
Headline (large, prominent on graphic): "${headline}"
${subtext ? `Subtext (smaller, secondary): "${subtext}"\n` : ''}${brief ? `Creative context (for AI only, do not render verbatim): "${brief}"\n` : ''}Format: ${FORMAT_SIZES[format] || '1080x1080px square'}

ADDITIONAL RULES:
1. Reproduce the provided logo exactly — never invent a new one
2. No random stock people unless explicitly requested in the brief
3. Typography must be accurate — no typos
4. Professional graphic design quality`;

  const textPrompt = `You are a professional graphic designer creating social media graphics.
Follow the three-layer instruction hierarchy below. Higher layers override lower ones.
${layer1}${layer2}${layer3}`;

  // ── Generate via Gemini ────────────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

  const imageUrls: string[] = [];

  try {
    const parts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [
      ...imageParts,
      { text: textPrompt },
    ];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      } as object,
    });

    const candidate = result.response.candidates?.[0];
    if (candidate) {
      for (const part of candidate.content.parts) {
        const p = part as { inlineData?: { data: string; mimeType: string }; text?: string };
        if (p.inlineData) {
          const buffer = Buffer.from(p.inlineData.data, 'base64');
          const ext = p.inlineData.mimeType === 'image/png' ? 'png' : 'jpg';
          const filename = `gruzly/${id}/${Date.now()}.${ext}`;
          const blob = await put(filename, buffer, {
            access: 'public',
            contentType: p.inlineData.mimeType,
          });
          imageUrls.push(blob.url);
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Generation error:', msg);
    return NextResponse.json({ error: 'Generation error: ' + msg.substring(0, 200) }, { status: 500 });
  }

  if (imageUrls.length === 0) {
    return NextResponse.json({ error: 'Image generation failed — no image in response' }, { status: 500 });
  }

  // Store format with :fast suffix when in fast mode (for history display)
  const dbFormat = mode === 'fast' ? `${format}:fast` : format;
  const combinedBrief = [headline, subtext].filter(Boolean).join(' | ');

  const [generation] = await sql`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${parseInt(id)}, ${combinedBrief}, ${dbFormat}, ${textPrompt}, ${JSON.stringify(imageUrls)}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrls, prompt: textPrompt });
}
