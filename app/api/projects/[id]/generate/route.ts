export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ImageResponse } from 'next/og';
import { buildCompositeElement, COMPOSITOR_FORMAT_SIZES, type LayoutPreset, type BrandColors } from '@/lib/compositor';
import sharp from 'sharp';

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

// ── Logo compositor ───────────────────────────────────────────────────────────

type AssetRow = { type: string; url: string; filename: string; variant?: string; description?: string; mime_type?: string };

async function getTopLeftBrightness(imageBuffer: Buffer, width: number, height: number): Promise<number> {
  try {
    const region = await sharp(imageBuffer)
      .extract({
        left: 0,
        top: 0,
        width: Math.round(width * 0.30),
        height: Math.round(height * 0.25),
      })
      .greyscale()
      .raw()
      .toBuffer();
    const avg = region.reduce((sum: number, px: number) => sum + px, 0) / region.length;
    return avg;
  } catch {
    return 0;
  }
}

async function selectLogoAsset(
  brandAssets: AssetRow[],
  imageBuffer: Buffer,
  width: number,
  height: number
): Promise<AssetRow | null> {
  const logoAssets = brandAssets.filter(a => a.type === 'logo');
  if (logoAssets.length === 0) return null;
  if (logoAssets.length === 1) return logoAssets[0];

  const brightness = await getTopLeftBrightness(imageBuffer, width, height);
  const isDark = brightness < 128;

  if (isDark) {
    return logoAssets.find(a => a.variant === 'dark-bg')
      || logoAssets.find(a => a.variant === 'default')
      || logoAssets[0];
  } else {
    return logoAssets.find(a => a.variant === 'light-bg')
      || logoAssets.find(a => a.variant === 'default')
      || logoAssets[0];
  }
}

async function addLogoBackground(
  imageBuffer: Buffer,
  logoX: number,
  logoY: number,
  logoW: number,
  logoH: number,
  isDark: boolean
): Promise<Buffer> {
  const padding = 16;
  const gradientSvg = `<svg width="${logoW + padding * 2}" height="${logoH + padding * 2}">
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stop-color="${isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'}" />
        <stop offset="100%" stop-color="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" rx="8" />
  </svg>`;

  return sharp(imageBuffer)
    .composite([{
      input: Buffer.from(gradientSvg),
      left: Math.max(0, logoX - padding),
      top: Math.max(0, logoY - padding),
    }])
    .toBuffer();
}

async function applyLogoOverlay(
  geminiImageBuffer: Buffer,
  brandAssets: AssetRow[],
  format: string
): Promise<Buffer> {
  const meta = await sharp(geminiImageBuffer).metadata();
  const width = meta.width || 1080;
  const height = meta.height || 1080;

  const logoAsset = await selectLogoAsset(brandAssets, geminiImageBuffer, width, height);
  if (!logoAsset) {
    console.log('Logo overlay: no logo asset found, skipping');
    return geminiImageBuffer;
  }

  try {
    const logoArrayBuffer = await fetch(logoAsset.url).then(r => r.arrayBuffer());
    const logoBuffer = Buffer.from(new Uint8Array(logoArrayBuffer));

    const logoWidthRatio = format === 'banner' ? 0.15 : 0.22;
    const logoWidth = Math.round(width * logoWidthRatio);

    const logoResized = await sharp(logoBuffer)
      .resize(logoWidth, null, { fit: 'inside', withoutEnlargement: true })
      .toBuffer();

    const logoX = Math.round(width * 0.04);
    const logoY = Math.round(height * 0.04);

    const brightness = await getTopLeftBrightness(geminiImageBuffer, width, height);
    const isDark = brightness < 128;
    const logoMeta = await sharp(logoResized).metadata();
    const logoH = logoMeta.height || Math.round(height * 0.08);

    const onlyOneVariant = brandAssets.filter(a => a.type === 'logo').length === 1;
    const needsBackground = onlyOneVariant && !isDark;

    let baseImage = geminiImageBuffer;
    if (needsBackground) {
      baseImage = await addLogoBackground(geminiImageBuffer, logoX, logoY, logoWidth, logoH, false);
    }

    const finalImage = await sharp(baseImage)
      .composite([{ input: logoResized, top: logoY, left: logoX }])
      .png()
      .toBuffer();

    console.log(`Logo overlay applied: ${logoAsset.variant || 'default'}, brightness: ${brightness.toFixed(0)}, needsBg: ${needsBackground}`);
    return finalImage;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Logo overlay failed, returning without logo:', msg);
    return geminiImageBuffer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

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
    useCompositor = false,
    compositorLayout = 'classic',
    compositorCta = '',
  } = await req.json();

  if (!headline || !format) {
    return NextResponse.json({ error: 'headline and format required' }, { status: 400 });
  }

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)}`;

  // Ensure parent_id column exists
  await getDb()`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

  const assetList = assets as AssetRow[];

  // ── Build image parts ────────────────────────────────────────────────────
  const imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  // Logo: reserved for compositor overlay only — NOT sent to Gemini as inlineData
  const logoAssets = assetList.filter(a => a.type === 'logo');
  const logoAsset = logoAssets.find(a => a.variant === 'dark-bg')
    || logoAssets.find(a => a.variant === 'default')
    || logoAssets[0];

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
    'RENDER ONLY text listed under "TEXT TO APPEAR ON GRAPHIC" — no other text, captions or labels',
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
  const logoNote = '';
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

  const SOURCE_PRIORITY_GEN: Record<string, number> = { brandbook: 3, references: 2, brand_scan: 1, manual: 0 };
  if (brandSections.length > 0) {
    layer2Content = [...brandSections]
      .sort((a: BrandSec, b: BrandSec) => {
        const pa = SOURCE_PRIORITY_GEN[(a as BrandSec & { source?: string }).source || 'manual'] ?? 0;
        const pb = SOURCE_PRIORITY_GEN[(b as BrandSec & { source?: string }).source || 'manual'] ?? 0;
        if (pa !== pb) return pb - pa; // higher priority first
        return a.order - b.order;
      })
      .map((s: BrandSec) => {
        const sec = s as BrandSec & { source?: string };
        const reliability = sec.source === 'brandbook' ? ' [CONFIRMED]'
          : sec.source === 'references' ? ' [FROM REFERENCES]'
          : sec.source === 'brand_scan' ? ' [AUTO-DETECTED]'
          : '';
        return `[${s.title.toUpperCase()}${reliability}]\n${s.content}`;
      })
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
- DO NOT render any logo — top-left area (25% × 20%) must remain completely empty per Layer 1 rules
- Logo overlay will be applied programmatically after generation
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

  // ── TWO-STAGE PIPELINE (useCompositor) ───────────────────────────────────
  if (useCompositor && !elementOnly && (photoMode === 'none' || !photoUrl)) {
    return await generateWithCompositor({
      req, id, project, assetList, headline, subtext, brief, format, creativity,
      compositorLayout: compositorLayout as LayoutPreset,
      compositorCta,
    });
  }

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
          const rawBuffer = Buffer.from(p.inlineData.data, 'base64');
          const finalBuffer = await applyLogoOverlay(rawBuffer, assetList, format);
          const filename = `gruzly/${id}/${Date.now()}.png`;
          const blob = await put(filename, finalBuffer, {
            access: 'public',
            contentType: 'image/png',
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

// ── Two-stage pipeline helper ─────────────────────────────────────────────────
async function generateWithCompositor({
  req, id, project, assetList, headline, subtext, brief, format, creativity,
  compositorLayout, compositorCta,
}: {
  req: NextRequest;
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  project: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assetList: Array<{ type: string; url: string; filename: string; variant?: string; description?: string; mime_type?: string }>;
  headline: string;
  subtext: string;
  brief: string;
  format: string;
  creativity: number;
  compositorLayout: LayoutPreset;
  compositorCta: string;
}): Promise<NextResponse> {
  const projectId = parseInt(id);
  const [width, height] = COMPOSITOR_FORMAT_SIZES[format] || [1080, 1080];

  // Extract brand colors for compositor (prefer brand_scan_data, then brand_sections hex)
  type BsdType = { primaryColor?: string; secondaryColor?: string; accentColor?: string };
  const bsd: BsdType | null = project.brand_scan_data || null;
  let brandColors: BrandColors = {
    primary: bsd?.primaryColor || '',
    secondary: bsd?.secondaryColor || '',
    accent: bsd?.accentColor || '',
  };

  // Fallback: extract hex colors from brand_sections
  if (!brandColors.primary) {
    type Sec = { content: string };
    const secs: Sec[] = project.brand_sections || [];
    const hexes: string[] = [];
    for (const s of secs) {
      const matches = s.content?.match(/#[0-9A-Fa-f]{6}/g) || [];
      hexes.push(...matches);
    }
    if (hexes[0]) brandColors = { primary: hexes[0], secondary: hexes[1], accent: hexes[2] };
  }

  // ── Stage 1: Build illustration-only Gemini prompt ───────────────────────
  const FORMAT_LABELS: Record<string, string> = {
    fb_post: '1080x1080px square',
    ln_post: '1200x628px landscape',
    story:   '1080x1920px vertical',
    banner:  '1200x400px wide banner',
  };

  const CREATIVITY_BLOCKS_ILL: Record<number, string> = {
    1: 'Clean, minimal composition.',
    2: 'Add subtle decorative elements that complement the brand style.',
    3: 'Visually rich composition with layered graphic elements and full brand palette.',
    4: 'Editorial complexity — layered shapes, depth, bold composition.',
    5: 'Maximum visual richness. Cinematic, immersive, every detail intentional.',
  };

  // Collect brand DNA context for illustration prompt
  type BrandSec = { title: string; content: string; order: number };
  const brandSections: BrandSec[] = project.brand_sections || [];
  const brandContext = brandSections.length > 0
    ? brandSections.sort((a, b) => a.order - b.order).map(s => `[${s.title.toUpperCase()}]\n${s.content}`).join('\n\n')
    : project.brand_analysis || [
        project.style_description && `Visual style: ${project.style_description}`,
        project.color_palette && `Colors: ${project.color_palette}`,
      ].filter(Boolean).join('\n') || '';

  const illustrationPrompt = `You are creating a background illustration for a social media graphic.

ABSOLUTE RULES — these override everything:
1. DO NOT include any text, words, letters, numbers, or typography
2. DO NOT include any logos, brand marks, or wordmarks
3. DO NOT include any UI elements, buttons, frames, or borders
4. Leave the bottom 35% of the image relatively simple/uncluttered — text will be overlaid there
5. Leave the top 15% relatively clean — logo will be placed there
6. DO NOT include any human faces or recognizable people

BRAND CONTEXT:
${brandContext || `Visual style: professional, modern`}
${brandColors.primary ? `Primary color: ${brandColors.primary}` : ''}
${brandColors.secondary ? `Secondary color: ${brandColors.secondary}` : ''}
${brandColors.accent ? `Accent color: ${brandColors.accent}` : ''}

FORMAT: ${FORMAT_LABELS[format] || '1080x1080px'} — fill this exact canvas

VISUAL BRIEF: ${brief || headline}

RICHNESS: ${CREATIVITY_BLOCKS_ILL[creativity] || CREATIVITY_BLOCKS_ILL[2]}

OUTPUT: A single background illustration. Pure visual — no text, no logo. The illustration should create atmosphere and brand identity through color, shape, and composition only.`;

  // ── Stage 1: Generate illustration via Gemini ─────────────────────────────
  // For illustration mode: only include brand elements (no logo — handled by compositor)
  const illParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];

  const brandElements = assetList.filter(a => a.type === 'brand-element').slice(0, 2);
  for (const el of brandElements) {
    if (el.url.toLowerCase().endsWith('.svg')) continue;
    const b64 = await urlToBase64(el.url);
    if (b64 && !b64.mimeType.includes('svg')) illParts.push({ inlineData: b64 });
  }
  illParts.push({ text: illustrationPrompt });

  let illustrationUrl = '';
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: illParts }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as object,
    });

    const candidate = result.response.candidates?.[0];
    if (candidate) {
      for (const part of candidate.content.parts) {
        const p = part as { inlineData?: { data: string; mimeType: string }; text?: string };
        if (p.inlineData) {
          const buffer = Buffer.from(p.inlineData.data, 'base64');
          const ext = p.inlineData.mimeType === 'image/png' ? 'png' : 'jpg';
          const blob = await put(`gruzly/${id}/ill-${Date.now()}.${ext}`, buffer, {
            access: 'public',
            contentType: p.inlineData.mimeType,
          });
          illustrationUrl = blob.url;
          break;
        }
      }
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Illustration generation error:', msg);
    return NextResponse.json({ error: 'Generation error: ' + msg.substring(0, 200) }, { status: 500 });
  }

  if (!illustrationUrl) {
    return NextResponse.json({ error: 'Illustration generation failed — no image in response' }, { status: 500 });
  }

  // ── Stage 2: Composite text + logo via Satori ─────────────────────────────
  const logoAssets = assetList.filter(a => a.type === 'logo');
  const logoAsset = logoAssets.find(a => a.variant === 'default') || logoAssets[0];
  // Skip SVG logos — Satori can't render SVG src
  const logoUrl = logoAsset && !logoAsset.url.toLowerCase().endsWith('.svg') ? logoAsset.url : '';

  const compositeEl = buildCompositeElement({
    illustrationUrl,
    headline,
    subtext,
    ctaText: compositorCta,
    logoUrl,
    format,
    layoutPreset: compositorLayout,
    brandColors,
    width,
    height,
  });

  let finalImageUrl = '';
  try {
    const imageResponse = new ImageResponse(compositeEl, { width, height });
    const arrayBuffer = await imageResponse.arrayBuffer();
    const finalBlob = await put(`gruzly/${id}/compose-${Date.now()}.png`, arrayBuffer, {
      access: 'public',
      contentType: 'image/png',
    });
    finalImageUrl = finalBlob.url;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Compositor error:', msg);
    // Fallback: return the raw illustration if compositor fails
    finalImageUrl = illustrationUrl;
  }

  const combinedBrief = [headline, subtext].filter(Boolean).join(' | ');
  const dbFormat = `${format}:c${creativity}:compose:${compositorLayout}`;
  const promptMeta = JSON.stringify({ illustrationUrl, layoutPreset: compositorLayout, brandColors });

  await getDb()`ALTER TABLE generations ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES generations(id)`.catch(() => {});

  const [generation] = await getDb()`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${projectId}, ${combinedBrief}, ${dbFormat}, ${promptMeta}, ${JSON.stringify([finalImageUrl])}, 'done')
    RETURNING *
  `;

  return NextResponse.json({
    generation,
    imageUrls: [finalImageUrl],
    illustrationUrl,
    compositorLayout,
  });
}
