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

const CREATIVITY_BLOCKS: Record<number, string> = {
  1: '',
  2: 'Add secondary geometric or decorative elements that complement the brand style. Enrich the composition with subtle texture or layering.',
  3: 'Create a visually rich composition with multiple layered graphic elements. Use the full brand gradient palette across multiple decorative shapes and background treatments.',
  4: 'Design a striking, editorial-level graphic. Push visual complexity — layered shapes, depth, bold typographic treatment, dynamic composition. Stay within brand palette and layout rules.',
  5: 'Create a premium, award-worthy graphic. Maximum visual richness within brand rules. Cinematic composition, complex multi-layer design, immersive use of brand colors and graphic elements. Every pixel intentional.',
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
  const {
    headline,
    subtext,
    brief,
    format,
    mode,
    creativity = 2,
    elementOnly = false,
    photoUrl = '',
    photoMode = 'none',
  } = await req.json();

  if (!headline || !format) {
    return NextResponse.json({ error: 'headline and format required' }, { status: 400 });
  }

  const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)}`;

  // Ensure parent_id column exists
  await sql`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

  type AssetRow = { type: string; url: string; filename: string; variant?: string; description?: string; mime_type?: string };
  const assetList = assets as AssetRow[];

  // ── Build image parts ────────────────────────────────────────────────────
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  // Logo: pick best variant for background context
  // Prefer dark-bg variant (most social graphics have colored bg), fallback to default, then any
  const logoAssets = assetList.filter(a => a.type === 'logo');
  const logoAsset = logoAssets.find(a => a.variant === 'dark-bg')
    || logoAssets.find(a => a.variant === 'default')
    || logoAssets[0];

  if (!elementOnly && logoAsset && !logoAsset.url.toLowerCase().endsWith('.svg')) {
    const b64 = await urlToBase64(logoAsset.url);
    if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
  }

  // Reference images (skip in fast/elementOnly)
  const refs = assetList.filter(a => a.type === 'reference').slice(0, 3);
  if (!elementOnly && mode !== 'fast') {
    for (const ref of refs) {
      const b64 = await urlToBase64(ref.url);
      if (b64) imageParts.push({ inlineData: b64 });
    }
  }

  // Brand elements: include as inline images (max 2, skip large SVGs)
  const brandElements = assetList.filter(a => a.type === 'brand-element').slice(0, 2);
  if (!elementOnly) {
    for (const el of brandElements) {
      if (el.url.toLowerCase().endsWith('.svg')) continue;
      const b64 = await urlToBase64(el.url);
      if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
    }
  }

  // Photo: include as inline image if provided
  if (photoUrl && photoMode !== 'none' && !elementOnly) {
    const b64 = await urlToBase64(photoUrl);
    if (b64) imageParts.push({ inlineData: b64 });
  }

  // ── Build 3-layer prompt ─────────────────────────────────────────────────
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

  // Asset note for Layer 2 header
  const logoNote = logoAsset ? '\n- First image: brand LOGO — reproduce it exactly, place it prominently' : '';
  const refNote = !elementOnly && mode !== 'fast' && refs.length > 0 ? `\n- Next ${refs.length} image(s): brand reference graphics — match this visual style closely` : '';
  const elNote = !elementOnly && brandElements.length > 0 ? `\n- Brand graphic elements: use these decorative/brand elements in the composition` : '';
  const photoNote = photoUrl && photoMode !== 'none' && !elementOnly ? '\n- PHOTO PROVIDED: place this as the central/hero image, compose brand elements around it' : '';
  const assetNote = imageParts.length > 0
    ? `Provided visual assets:${logoNote}${refNote}${elNote}${photoNote}\n\n`
    : '';

  // AVAILABLE ASSETS text block for Layer 2
  const availableAssets: string[] = [];
  if (logoAssets.length > 0) {
    logoAssets.forEach(l => availableAssets.push(`- Logo (${l.variant || 'default'}): ${l.url}`));
  }
  brandElements.forEach(el => {
    availableAssets.push(`- Brand element "${el.filename}"${el.description ? ` — ${el.description}` : ''}: ${el.url}`);
  });
  const photoAssets = assetList.filter(a => a.type === 'photo');
  photoAssets.forEach(p => {
    availableAssets.push(`- Photo "${p.filename}"${p.description ? ` — ${p.description}` : ''}: ${p.url}`);
  });
  const assetsSection = availableAssets.length > 0
    ? `\nAVAILABLE ASSETS:\n${availableAssets.join('\n')}\n`
    : '';

  // Brand DNA — prefer brand_sections, then brand_analysis text, then manual fields
  type BrandSec = { id: string; title: string; content: string; order: number };
  const brandSections: BrandSec[] = project.brand_sections || [];
  let layer2Content: string;

  if (brandSections.length > 0) {
    layer2Content = [...brandSections]
      .sort((a: BrandSec, b: BrandSec) => a.order - b.order)
      .map((s: BrandSec) => `[${s.title.toUpperCase()}]\n${s.content}`)
      .join('\n\n');
  } else if (project.brand_analysis) {
    layer2Content = project.brand_analysis;
  } else {
    layer2Content = [
      project.style_description && `Visual style: ${project.style_description}`,
      project.color_palette && `Colors: ${project.color_palette}`,
      project.typography_notes && `Typography: ${project.typography_notes}`,
    ].filter(Boolean).join('\n') || 'modern, professional, event agency aesthetic';
  }

  const layer2 = `
${sep}
LAYER 2 — BRAND DNA (visual identity — follow precisely)
Apply rules from every section below to your design.
${sep}
${assetNote}${layer2Content}${assetsSection}`;

  // Photo instruction for Layer 3
  const photoInstruction = photoUrl && photoMode !== 'none' && !elementOnly
    ? `\nMAIN VISUAL ELEMENT: A photo has been provided (last inline image). Place it as the central/hero element of the composition. Do NOT replace it with AI-generated imagery. Compose all brand elements around it.`
    : '';

  // Layer 3 — Creative Brief or element-only
  const layer3 = elementOnly ? `
${sep}
LAYER 3 — ELEMENT GENERATION
Generate ONLY a central visual element for a brand graphic.
${sep}
BRAND: ${project.name}
ELEMENT DESCRIPTION: "${headline}"
${brief ? `CONTEXT: "${brief}"` : ''}

OUTPUT REQUIREMENTS:
- Generate ONLY the visual element — NO text, NO logo, NO background fill, NO frame
- The element should work as a central focal point composited into a brand template
- Clean subject, suitable for compositing over a colored background
- Square-ish composition, centered subject
- Style must match brand DNA from Layer 2` : `
${sep}
LAYER 3 — CREATIVE BRIEF
Create a graphic that satisfies all layers above. Be creative within constraints.
${sep}
BRAND: ${project.name}
FORMAT: ${FORMAT_SIZES[format] || '1080x1080px square'} — design for this exact canvas size and ratio
HEADLINE TEXT (render prominently on the graphic): "${headline}"
${subtext ? `SUBTEXT (render smaller, secondary): "${subtext}"` : ''}
${brief ? `CREATIVE DIRECTION (context for you, do not render verbatim): "${brief}"` : ''}
${photoInstruction}
OUTPUT REQUIREMENTS:
- Reproduce the exact provided logo — placement per brand DNA rules, or top-left if unspecified
- No human photography unless explicitly requested in creative direction
- Zero typos — double-check all text before rendering
- Fill the entire canvas — no white borders or padding outside the design
- Professional print-quality output`;

  // Creativity directive (optional)
  const creativityBlock = CREATIVITY_BLOCKS[creativity] ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISUAL RICHNESS DIRECTIVE (apply within brand constraints)
${CREATIVITY_BLOCKS[creativity]}
All Layer 1 rules still override this directive.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const closing = `

${sep}
PRIORITY REMINDER: Layer 1 > Layer 2 > Layer 3.
If brand DNA conflicts with the brief — brand DNA wins.
If absolute rules conflict with anything — absolute rules win.
Generate ONE complete, publication-ready graphic.`;

  const textPrompt = `You are a professional graphic designer creating social media graphics.
Follow the three-layer instruction hierarchy below. Higher layers override lower ones.
${layer1}${layer2}${layer3}${creativityBlock}${closing}`;

  // ── Generate via Gemini ──────────────────────────────────────────────────
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

  const formatWithCreativity = `${format.replace(/:c\d$/, '')}:c${creativity}`;
  const dbFormat = mode === 'fast' ? `${formatWithCreativity}:fast` : formatWithCreativity;
  const combinedBrief = [headline, subtext].filter(Boolean).join(' | ');

  const [generation] = await sql`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${parseInt(id)}, ${combinedBrief}, ${dbFormat}, ${textPrompt}, ${JSON.stringify(imageUrls)}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrls, prompt: textPrompt });
}
