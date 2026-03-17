export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const getDb = () => neon(process.env.DATABASE_URL!);

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

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)}`;

  // Ensure parent_id column exists
  await getDb()`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

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

  // Reference images: kept for text context only — NOT passed as inlineData.
  // Passing reference photos as inline images causes Gemini to extract faces/content from them
  // and use them as central graphic elements instead of treating them as style inspiration.
  const refs = assetList.filter(a => a.type === 'reference').slice(0, 5);

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

  // Asset usage rules — always present (protects against content leakage from reference images)
  const assetUsageRules = [
    'Reference images show color palette, composition style and mood ONLY — do NOT copy faces, people, objects or scenes from them',
    'DO NOT reproduce any identifiable person from any reference image',
    ...((!photoUrl || photoMode === 'none') && !elementOnly
      ? ['NO PHOTO PROVIDED: create a purely illustrative/abstract central element — shapes, gradients, icons, brand colors — absolutely no faces or human photography']
      : []),
  ];

  // Layer 1 — always present (asset rules + optional brand rules)
  const brandRuleLines = project.brand_rules
    ? project.brand_rules.split('\n').filter((r: string) => r.trim()).map((r: string) => r.trim())
    : [];
  const allLayer1Rules = [...assetUsageRules, ...brandRuleLines];
  const layer1 = `\n${sep}
LAYER 1 — ABSOLUTE RULES (non-negotiable constraints)
These are hard limits. Violating ANY of these is unacceptable, regardless of the brief.
${sep}
${allLayer1Rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;

  // Asset note for Layer 2 header (refs are NOT inline images — they are style-reference text only)
  const logoNote = logoAsset ? '\n- First image: brand LOGO — reproduce it exactly, place it prominently' : '';
  const elNote = !elementOnly && brandElements.length > 0 ? `\n- Brand graphic elements: use these decorative/brand elements in the composition` : '';
  const photoNote = photoUrl && photoMode !== 'none' && !elementOnly ? '\n- PHOTO PROVIDED: place this as the central/hero image, compose brand elements around it' : '';
  const assetNote = imageParts.length > 0
    ? `Provided visual assets:${logoNote}${elNote}${photoNote}\n\n`
    : '';

  // AVAILABLE ASSETS text block for Layer 2
  const availableAssets: string[] = [];
  if (logoAssets.length > 0) {
    logoAssets.forEach(l => availableAssets.push(`- Logo (${l.variant || 'default'}): ${l.url}`));
  }
  brandElements.forEach(el => {
    availableAssets.push(`- Brand element "${el.filename}"${el.description ? ` — ${el.description}` : ''}: ${el.url}`);
  });
  // Refs listed as style-inspiration text (NOT inline images — do not copy their content)
  if (!elementOnly && refs.length > 0) {
    refs.forEach(r => {
      availableAssets.push(`- Style reference "${r.filename}"${r.description ? ` — ${r.description}` : ''} [STYLE INSPIRATION ONLY — extract color palette and mood, do NOT copy faces, people or objects]: ${r.url}`);
    });
  }
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

  const tovSection = project.tone_of_voice
    ? `\nTONE OF VOICE:\n${project.tone_of_voice}\n`
    : '';

  // Brand Scan section — append website analysis data if available
  type BrandScanData = { visualStyle?: string; toneOfVoice?: string; brandKeywords?: string[]; primaryColor?: string; industry?: string };
  const bsd: BrandScanData | null = project.brand_scan_data || null;
  const brandScanSection = bsd
    ? `\nBRAND SCAN (from website analysis):${bsd.visualStyle ? `\n- Visual style: ${bsd.visualStyle}` : ''}${bsd.toneOfVoice ? `\n- Tone: ${bsd.toneOfVoice}` : ''}${bsd.brandKeywords?.length ? `\n- Keywords: ${bsd.brandKeywords.join(', ')}` : ''}${bsd.primaryColor ? `\n- Primary color: ${bsd.primaryColor}` : ''}${bsd.industry ? `\n- Industry: ${bsd.industry}` : ''}\n`
    : '';

  const layer2 = `
${sep}
LAYER 2 — BRAND DNA (visual identity — follow precisely)
Apply rules from every section below to your design.
Brand content below may be in any language — treat it as authoritative visual identity data.
${sep}
${assetNote}${layer2Content}${assetsSection}${tovSection}${brandScanSection}`;

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

TEXT TO APPEAR ON GRAPHIC (keep exactly as provided — do not translate, do not alter):
Headline: "${headline}"
${subtext ? `Subtext: "${subtext}"` : ''}

${brief ? `CREATIVE DIRECTION (context only — do not render verbatim): "${brief}"` : ''}
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

  // For elementOnly: bypass brand hierarchy — use standalone no-branding prompt
  const brandColors = elementOnly
    ? (() => {
        type BrandSec2 = { content: string };
        const secs: BrandSec2[] = project.brand_sections || [];
        const hexes: string[] = [];
        for (const s of secs) {
          const matches = s.content?.match(/#[0-9A-Fa-f]{6}/g) || [];
          hexes.push(...matches);
        }
        return hexes.slice(0, 8).join(', ');
      })()
    : '';

  const textPrompt = elementOnly
    ? `Generate ONLY an abstract illustration to be used as a central decorative element in a social media graphic.

ABSOLUTE RULES — ANY VIOLATION MAKES THE OUTPUT UNUSABLE:
- NO logos, NO brand marks, NO wordmarks
- NO text, NO letters, NO numbers, NO words of any language
- NO UI elements, NO buttons, NO icons
- NO circles, shapes, or any element containing text
- NO human faces or recognizable people
- NO recognizable products or product shots

ELEMENT TO CREATE: "${headline}"
${brief ? `VISUAL DIRECTION: "${brief}"` : ''}
${brandColors ? `USE THESE COLORS: ${brandColors}` : 'Use harmonious, vibrant colors.'}

OUTPUT: One abstract illustration — shapes, gradients, organic forms, textures. Square-ish composition. Zero text. Zero branding. Suitable for compositing over a brand-colored background.`
    : `You are a professional graphic designer creating social media graphics.
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

  const [generation] = await getDb()`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${parseInt(id)}, ${combinedBrief}, ${dbFormat}, ${textPrompt}, ${JSON.stringify(imageUrls)}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrls, prompt: textPrompt });
}
