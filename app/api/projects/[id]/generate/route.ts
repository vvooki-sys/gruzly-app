import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const sql = neon(process.env.DATABASE_URL!);

const FORMAT_SIZES: Record<string, string> = {
  fb_post: 'square 1:1 aspect ratio, 1080x1080px',
  ln_post: 'landscape 1.91:1 aspect ratio, 1200x628px',
  story: 'vertical 9:16 aspect ratio, 1080x1920px',
  banner: 'wide banner 3:1 aspect ratio, 1200x400px',
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
  const { headline: rawHeadline, subtext, brief, format } = await req.json();
  const headline = rawHeadline || brief; // fallback: stare pole "brief" działa jako headline

  if (!headline || !format) {
    return NextResponse.json({ error: 'headline and format required' }, { status: 400 });
  }

  const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)}`;

  // Kolumna parent_id
  await sql`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

  // Zbierz obrazy jako inlineData
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  const logoAsset = (assets as Array<{ type: string; url: string }>).find(a => a.type === 'logo');
  if (logoAsset && !logoAsset.url.toLowerCase().endsWith('.svg')) {
    const b64 = await urlToBase64(logoAsset.url);
    if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
  }

  const refs = (assets as Array<{ type: string; url: string }>)
    .filter(a => a.type === 'reference')
    .slice(0, 3);
  for (const ref of refs) {
    const b64 = await urlToBase64(ref.url);
    if (b64) imageParts.push({ inlineData: b64 });
  }

  // Mandatory rules — najwyższy priorytet
  const mandatoryBlock = project.brand_rules
    ? `⚠️ MANDATORY BRAND RULES — THESE ARE ABSOLUTE CONSTRAINTS, NOT SUGGESTIONS. VIOLATING ANY OF THESE IS NOT ACCEPTABLE:
${project.brand_rules.split('\n').map((r: string, i: number) => r.trim() ? `${i + 1}. ${r.trim()}` : '').filter(Boolean).join('\n')}

`
    : '';

  // Brand context — preferuj auto-analizę, fallback na ręczne pola
  const brandContext = project.brand_analysis
    ? `BRAND ANALYSIS (generated from your reference images — follow this precisely):\n${project.brand_analysis}`
    : `BRAND GUIDELINES:
- Visual style: ${project.style_description || 'modern, professional, event agency aesthetic'}
- Color palette: ${project.color_palette || 'dark navy background #103958, coral accent #EF4853'}
- Typography: ${project.typography_notes || 'bold geometric sans-serif, clean hierarchy'}`;

  const textPrompt = `You are a professional graphic designer creating social media graphics.

${mandatoryBlock}${imageParts.length > 0 ? `BRAND ASSETS PROVIDED:
${logoAsset ? '- First image: the brand LOGO — reproduce it exactly, place it prominently' : ''}
${refs.length > 0 ? `- Next ${refs.length} image(s): brand reference graphics — match this visual style closely` : ''}

` : ''}${brandContext}

CREATE THIS GRAPHIC:
- Brand: ${project.name}
- Headline (large, prominent): "${headline}"
${subtext ? `- Subtext (smaller): "${subtext}"` : ''}
${brief ? `- Additional context: ${brief}` : ''}
- Format: ${FORMAT_SIZES[format] || '1080x1080px square'}

ADDITIONAL RULES:
1. Use the EXACT logo from provided image — never invent a new one
2. Follow color palette and visual style from reference images and brand analysis
3. No random stock photos of people unless specifically requested
4. Text must be accurate — no typos
5. Professional graphic design quality`;

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

  const combinedBrief = [headline, subtext, brief].filter(Boolean).join(' | ');
  const [generation] = await sql`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${parseInt(id)}, ${combinedBrief}, ${format}, ${textPrompt}, ${JSON.stringify(imageUrls)}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrls, prompt: textPrompt });
}
