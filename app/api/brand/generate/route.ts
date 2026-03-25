export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ImageResponse } from 'next/og';
import { buildCompositeElement, COMPOSITOR_FORMAT_SIZES, type LayoutPreset, type BrandColors } from '@/lib/compositor';
import sharp from 'sharp';
import { mergeBrandSections, getCanonicalTitle } from '@/lib/brand-sections';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';

export const maxDuration = 30;

const FORMAT_SIZES: Record<string, string> = {
  fb_post: 'square 1:1 aspect ratio, 1080x1080px',
  ln_post: 'landscape 1.91:1 aspect ratio, 1200x628px',
  story:   'vertical 9:16 aspect ratio, 1080x1920px',
  banner:  'wide banner 3:1 aspect ratio, 1200x400px',
};

const CREATIVITY_BLOCKS: Record<number, string> = {
  1: '',
  2: 'Dodaj drugorzędne geometryczne lub dekoracyjne elementy uzupełniające styl marki. Wzbogać kompozycję subtelną teksturą lub warstwowością.',
  3: 'Stwórz wizualnie bogatą kompozycję z wieloma warstwowymi elementami graficznymi. Użyj pełnej palety gradientów marki na wielu dekoracyjnych kształtach i tłach.',
  4: 'Zaprojektuj uderzającą grafikę na poziomie edytorialnym. Zwiększ złożoność wizualną — warstwowe kształty, głębia, odważna typografia, dynamiczna kompozycja. Pozostań w palecie marki i zasadach layoutu.',
  5: 'Stwórz premium grafikę wartą nagrody. Maksymalne bogactwo wizualne w ramach zasad marki. Kinowa kompozycja, złożony wielowarstwowy design, immersyjne użycie kolorów i elementów graficznych marki. Każdy piksel celowy.',
};

// G7 — Photo-specific creativity blocks (industry-neutral — directives describe TECHNIQUE, not subject)
const PHOTO_CREATIVITY_BLOCKS: Record<number, string> = {
  1: `Czysta, minimalna kompozycja fotograficzna.
Ostrość na głównym obiekcie, neutralne tło, równomierne oświetlenie.
Bez dodatkowej stylizacji — sam produkt/scena.`,
  2: `Naturalna kompozycja z kontekstem.
Główny obiekt ostry, tło w delikatnym bokeh (f/2.8-4).
Oświetlenie boczne, ciepłe, miękkie cienie.
Dodaj 1-2 kontekstowe rekwizyty w tle (nieostre, nieprzytłaczające).`,
  3: `Przemyślana sesja fotograficzna.
Precyzyjna głębia ostrości — pierwszy plan tack-sharp, tło storytellingowe.
Oświetlenie modelowane: główne + fill + ewentualny rim.
Stylizacja: tekstury, materiały, rekwizyty budujące nastrój marki.
Kolory marki subtelnie obecne w otoczeniu (tło, rekwizyty, oświetlenie).`,
  4: `Edytorialna jakość — zdjęcie godne magazynu branżowego.
Dramatic lighting z wyraźnym kierunkiem i cieniami budującymi głębię.
Negatywna przestrzeń jako element kompozycji.
Wielowarstwowa scena: pierwszy plan / obiekt / kontekst / tło.
Detale tekstur widoczne i celowo podkreślone oświetleniem.`,
  5: `Premium, award-level photography.
Kinematograficzna kompozycja — każdy element kadru celowy i uzasadniony.
Perfekcyjna równowaga między ostrością a bokeh.
Oświetlenie na poziomie Leibovitz/Richardson — dramatyczne, ale naturalne.
Kolor, światło i kompozycja tworzą spójną narrację emocjonalną.
Zdjęcie, które zatrzymuje scroll.`,
};

// ── Logo compositor ───────────────────────────────────────────────────────────

type AssetRow = { type: string; url: string; filename: string; variant?: string; description?: string; mime_type?: string; is_featured?: boolean };

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

async function getLogoBrightness(url: string): Promise<number> {
  try {
    const ab = await fetch(url, { signal: AbortSignal.timeout(8000) }).then(r => r.arrayBuffer());
    // Flatten transparent pixels to mid-grey so they don't skew the average
    const data = await sharp(Buffer.from(new Uint8Array(ab)))
      .flatten({ background: '#808080' })
      .greyscale()
      .raw()
      .toBuffer();
    return data.reduce((s: number, p: number) => s + p, 0) / data.length;
  } catch {
    return 128; // unknown → neutral
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

  const bgBrightness = await getTopLeftBrightness(imageBuffer, width, height);
  const isDark = bgBrightness < 128;

  // Measure actual brightness of each logo — pick the one with best contrast against bg
  // isDark bg → want lightest logo; light bg → want darkest logo
  const withBrightness = await Promise.all(
    logoAssets.map(async a => ({ asset: a, brightness: await getLogoBrightness(a.url) }))
  );

  withBrightness.forEach(({ asset, brightness }) => {
    console.log(`Logo brightness: ${asset.variant || 'default'} = ${brightness.toFixed(0)}`);
  });

  const sorted = withBrightness.sort((a, b) =>
    isDark ? b.brightness - a.brightness : a.brightness - b.brightness
  );

  return sorted[0].asset;
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
  format: string,
  logoPosition: string = 'top-left'
): Promise<Buffer> {
  if (logoPosition === 'none') {
    console.log('Logo overlay: position=none, skipping');
    return geminiImageBuffer;
  }

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

    const logoMeta = await sharp(logoResized).metadata();
    const logoH = logoMeta.height || Math.round(height * 0.08);

    const margin = Math.round(width * 0.04);
    const logoX = logoPosition.includes('right') ? width - logoWidth - margin : margin;
    const logoY = logoPosition.includes('bottom') ? height - logoH - margin : margin;

    const brightness = await getTopLeftBrightness(geminiImageBuffer, width, height);

    // Sharp fix: patch logo zone with sampled adjacent background color
    // This eliminates the "dark rectangle" artifact Gemini renders in the logo zone
    const zoneW = Math.round(width * 0.25);
    const zoneH = Math.round(height * 0.20);
    const zoneLeft = logoPosition.includes('right') ? width - zoneW : 0;
    const zoneTop = logoPosition.includes('bottom') ? height - zoneH : 0;
    const isRight = logoPosition.includes('right');
    const isBottom = logoPosition.includes('bottom');
    const sampleSize = Math.round(Math.min(width, height) * 0.06);
    const sampleLeft = isRight
      ? Math.max(0, zoneLeft - sampleSize)
      : Math.min(width - sampleSize - 1, zoneW + 4);
    const sampleTop = isBottom
      ? Math.max(0, zoneTop - sampleSize)
      : Math.min(height - sampleSize - 1, zoneH + 4);

    let patchedBuffer = geminiImageBuffer;
    try {
      const sampleBuf = await sharp(geminiImageBuffer)
        .extract({ left: sampleLeft, top: sampleTop, width: sampleSize, height: sampleSize })
        .resize(1, 1, { fit: 'fill' })
        .raw()
        .toBuffer();
      const [r, g, b] = [sampleBuf[0], sampleBuf[1], sampleBuf[2]];
      const fill = await sharp({
        create: { width: zoneW, height: zoneH, channels: 3, background: { r, g, b } },
      }).png().toBuffer();
      patchedBuffer = await sharp(geminiImageBuffer)
        .composite([{ input: fill, left: zoneLeft, top: zoneTop }])
        .toBuffer();
      console.log(`Logo zone patched: rgb(${r},${g},${b}) sampled from (${sampleLeft},${sampleTop})`);
    } catch (e) {
      console.log('Logo zone patch failed, skipping:', e);
    }

    const finalImage = await sharp(patchedBuffer)
      .composite([{ input: logoResized, top: logoY, left: logoX }])
      .png()
      .toBuffer();

    console.log(`Logo overlay applied: pos=${logoPosition}, variant=${logoAsset.variant || 'default'}, brightness: ${brightness.toFixed(0)}`);
    return finalImage;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Logo overlay failed, returning without logo:', msg);
    return geminiImageBuffer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function urlToBase64(
  url: string,
  forceJpeg = false
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const rawBuffer = Buffer.from(raw);
    const contentType = (res.headers.get('content-type') || 'image/png').split(';')[0];

    // Gemini does not support image/webp — convert to JPEG via sharp
    if (forceJpeg || contentType === 'image/webp') {
      const jpegBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
      return { data: jpegBuffer.toString('base64'), mimeType: 'image/jpeg' };
    }

    return { data: rawBuffer.toString('base64'), mimeType: contentType };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
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
    visualType = 'graphic',
    isFromCopywriter = false,
  } = await req.json();

  if (!format) {
    return NextResponse.json({ error: 'format required' }, { status: 400 });
  }

  // G1 — Detect photo mode from explicit visualType or brief content
  const briefDescribesPhoto = brief && /\b(foto|zdjęci|makro|lifestyle|hero.?shot|flatlay|portret|action.?shot|wnętrz|packshot|kadr|oświetlenie|przy stole)\b/i.test(brief);
  const isPhotoMode = visualType === 'photo' || visualType === 'photo_text' || !!briefDescribesPhoto;

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${projectId}`;

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

  // Reference images — always send as inlineData so Gemini sees actual style
  const allRefs = assetList.filter(a => a.type === 'reference').slice(0, 5);
  const featuredRefs = allRefs.filter(a => a.is_featured);
  const regularRefs = allRefs.filter(a => !a.is_featured);

  const refParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];
  if (!elementOnly && allRefs.length > 0) {
    refParts.push({ text: '⚠️ REFERENCJE STYLISTYCZNE — Te obrazy pokazują paletę kolorów, styl kompozycji i nastrój. NIE odtwarzaj żadnej twarzy, osoby ani treści fotograficznej z nich w wynikowej grafice. Wyodrębnij TYLKO styl wizualny.' });
    for (const ref of regularRefs) {
      if (ref.url.toLowerCase().endsWith('.svg')) continue;
      const b64 = await urlToBase64(ref.url, true);
      if (b64) refParts.push({ inlineData: b64 });
    }
    if (featuredRefs.length > 0) {
      refParts.push({ text: 'PRIORYTETOWY CEL STYLISTYCZNY — dopasuj dokładnie tę estetykę wizualną, paletę kolorów i nastrój w swoim wyniku:' });
      for (const ref of featuredRefs) {
        if (ref.url.toLowerCase().endsWith('.svg')) continue;
        const b64 = await urlToBase64(ref.url, true);
        if (b64) refParts.push({ inlineData: b64 });
      }
    }
  }
  const imageRefCount = refParts.filter(p => 'inlineData' in p).length;

  // Photo assets (packshots etc.) — always send as inline images
  const photoAssetsList = assetList.filter(a => a.type === 'photo').slice(0, 3);
  if (!elementOnly && photoAssetsList.length > 0) {
    refParts.push({ text: 'ZDJĘCIA / PACKSHOTY MARKI — te produkty/zdjęcia są częścią marki. Możesz je wykorzystać jako elementy wizualne kompozycji:' });
    for (const p of photoAssetsList) {
      if (p.url.toLowerCase().endsWith('.svg')) continue;
      const b64 = await urlToBase64(p.url, true);
      if (b64) refParts.push({ inlineData: b64 });
    }
  }
  console.log(`Sending to Gemini: ${imageRefCount} refs, ${photoAssetsList.length} photo assets`);

  // Brand elements: include as inline images (max 2, skip large SVGs)
  const brandElements = assetList.filter(a => a.type === 'brand-element').slice(0, 2);
  if (!elementOnly) {
    for (const el of brandElements) {
      if (el.url.toLowerCase().endsWith('.svg')) continue;
      const b64 = await urlToBase64(el.url);
      if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
    }
  }

  // User-provided photo: include as inline image
  if (photoUrl && photoMode !== 'none' && !elementOnly) {
    const b64 = await urlToBase64(photoUrl);
    if (b64) imageParts.push({ inlineData: b64 });
  }

  // ── Build 3-layer prompt ─────────────────────────────────────────────────
  const sep = '════════════════════════════════════════';

  const logoPosition: string = project.logo_position || 'top-left';

  const LOGO_EMPTY_ZONE: Record<string, string | null> = {
    'top-left':     'lewy górny obszar (pierwsze 25% szerokości, pierwsze 20% wysokości)',
    'top-right':    'prawy górny obszar (ostatnie 25% szerokości, pierwsze 20% wysokości)',
    'bottom-left':  'lewy dolny obszar (pierwsze 25% szerokości, ostatnie 20% wysokości)',
    'bottom-right': 'prawy dolny obszar (ostatnie 25% szerokości, ostatnie 20% wysokości)',
    'none':         null,
  };
  const emptyZone = LOGO_EMPTY_ZONE[logoPosition] ?? LOGO_EMPTY_ZONE['top-left'];

  // Layer 1 — two separate paths: photo vs graphic
  const photoLayer1Rules = [
    'Obrazy referencyjne dostarczają paletę kolorów, styl kompozycji i nastrój. Użyj ich jako inspiracji stylistycznej.',
    ...(photoAssetsList.length > 0
      ? ['Zdjęcia produktowe/packshoty marki dostarczone jako inline images MOGĄ być użyte jako wizualne elementy kompozycji.']
      : []),
    'NIE umieszczaj żadnego tekstu, liter, cyfr, logo ani watermarków na zdjęciu.',
    'Wypełnij całe płótno — bez białych obramowań ani paddingu.',
  ];

  const graphicLayer1Rules = [
    'REFERENCJE STYLISTYCZNE: Obrazy referencyjne dostarczają TYLKO paletę kolorów, styl kompozycji i nastrój. NIE odtwarzaj twarzy, osób ani rozpoznawalnych postaci z referencji.',
    ...(photoAssetsList.length > 0
      ? ['ZDJĘCIA/PACKSHOTY MARKI: Dostarczone zdjęcia produktowe i packshoty MOGĄ być wykorzystane jako elementy wizualne w kompozycji — to oficjalne assety marki.']
      : []),
    ...((!photoUrl || photoMode === 'none') && !elementOnly
      ? ['BRAK ZDJĘCIA: Centralny element MUSI być abstrakcyjny lub ilustracyjny — geometryczne kształty, gradienty, ikony, elementy graficzne marki, kompozycje typograficzne. BEZ twarzy, BEZ ludzi.']
      : []),
    'RENDERUJ TYLKO tekst wymieniony pod "TEKST DO UMIESZCZENIA NA GRAFICE" — żaden inny tekst, podpisy ani etykiety',
    ...(emptyZone
      ? [`[STREFA LOGO — ${emptyZone}]: Zostaw ten obszar PUSTY — kontynuuj tło bez żadnych obiektów, kształtów, tekstu ani bloków koloru. Logo zostanie nałożone po generacji.`]
      : ['Logo nie jest wymagane — możesz swobodnie wykorzystać całe płótno']),
  ];

  // Layer 1 — select path + append brand rules
  const brandRuleLines = project.brand_rules
    ? project.brand_rules.split('\n').filter((r: string) => r.trim()).map((r: string) => r.trim())
    : [];
  const allLayer1Rules = [...(isPhotoMode ? photoLayer1Rules : graphicLayer1Rules), ...brandRuleLines];
  const layer1 = `\n${sep}
WARSTWA 1 — ZASADY BEZWZGLĘDNE (niepodlegające negocjacji ograniczenia)
To są twarde limity. Złamanie KTÓREGOKOLWIEK z nich jest niedopuszczalne, niezależnie od briefu.
${sep}
${allLayer1Rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}
`;

  const refNote = !elementOnly && imageRefCount > 0
    ? `\n- Obrazy referencyjne stylu (${imageRefCount} dostarczonych${featuredRefs.length > 0 ? `, ${featuredRefs.length} oznaczonych jako PRIORYTETOWY CEL STYLISTYCZNY` : ''}): wyodrębnij paletę kolorów, nastrój i styl wizualny — NIE kopiuj twarzy, ludzi, obiektów ani scen`
    : '';
  const elNote = !elementOnly && brandElements.length > 0 ? `\n- Elementy graficzne marki: użyj tych dekoracyjnych/brandowych elementów w kompozycji` : '';
  const photoNote = photoUrl && photoMode !== 'none' && !elementOnly ? '\n- ZDJĘCIE DOSTARCZONE: umieść je jako centralny/główny obraz, skomponuj elementy marki wokół niego' : '';
  const allParts = [...refParts, ...imageParts];
  const assetNote = allParts.length > 0
    ? `Dostarczone zasoby wizualne:${refNote}${elNote}${photoNote}\n\n`
    : '';

  // G6 — Available assets: counts only, no URLs (Gemini can't fetch URLs, assets sent as inlineData)
  const assetSummary: string[] = [];
  if (logoAssets.length > 0) assetSummary.push(`- Logo: ${logoAssets.length} wariant(ów) (nakładane po generacji)`);
  if (brandElements.length > 0) assetSummary.push(`- Elementy dekoracyjne marki: ${brandElements.length}`);
  if (!elementOnly && imageRefCount > 0) assetSummary.push(`- Referencje stylistyczne: ${imageRefCount} (wyodrębnij styl, NIE kopiuj treści)`);
  if (photoAssetsList.length > 0) assetSummary.push(`- Zdjęcia/Packshoty: ${photoAssetsList.length} (oficjalne assety — UŻYJ w kompozycji)`);
  const assetsSection = assetSummary.length > 0
    ? `\nDOSTARCZONE ZASOBY (wysłane jako obrazy inline):\n${assetSummary.join('\n')}\n`
    : '';

  // F1 — Filter copy-only sections in photo mode
  const COPY_KEYWORDS = ['ton', 'tone', 'voice', 'głos', 'komunikac', 'cta', 'call to action', 'wezwani', 'copy', 'tekst', 'treść', 'wartości', 'values'];
  function isVisualSection(section: { id?: string; title?: string; canonicalType?: string }): boolean {
    const key = `${section.id || ''} ${section.title || ''} ${section.canonicalType || ''}`.toLowerCase();
    return !COPY_KEYWORDS.some(kw => key.includes(kw));
  }

  // Brand DNA — merge sections by canonical type to eliminate duplicates
  type RawBrandSec = { id: string; title: string; content: string; order: number; source?: string; icon?: string; type?: string; confidence?: string };
  const rawSections: RawBrandSec[] = project.brand_sections || [];
  let layer2Content: string;

  if (rawSections.length > 0) {
    const merged = mergeBrandSections(rawSections);
    const sectionsForLayer2 = isPhotoMode ? merged.filter(isVisualSection) : merged;
    console.log(`Brand sections: ${rawSections.length} raw → ${merged.length} merged${isPhotoMode ? ` → ${sectionsForLayer2.length} visual-only` : ''}`);

    layer2Content = sectionsForLayer2
      .map(s => {
        const sourceTag = s.sources.length > 1
          ? ` [${s.sources.map(src => ({ brandbook: 'CONFIRMED', manual: 'MANUAL', references: 'FROM REFERENCES', brand_scan: 'AUTO-DETECTED' }[src] || src.toUpperCase())).join(' + ')}]`
          : s.source === 'brandbook' ? ' [CONFIRMED]'
          : s.source === 'references' ? ' [FROM REFERENCES]'
          : s.source === 'brand_scan' ? ' [AUTO-DETECTED]'
          : '';
        return `[${getCanonicalTitle(s.canonicalType).toUpperCase()}${sourceTag}]\n${s.content}`;
      })
      .join('\n\n');
  } else if (project.brand_analysis) {
    layer2Content = project.brand_analysis;
  } else {
    layer2Content = [
      project.style_description && `Visual style: ${project.style_description}`,
      project.color_palette && `Colors: ${project.color_palette}`,
      project.typography_notes && `Typography: ${project.typography_notes}`,
    ].filter(Boolean).join('\n') || 'nowoczesna, profesjonalna estetyka agencji eventowej';
  }

  // G3 — Skip full tone_of_voice text (copywriting instructions, not visual).
  // Voice Card visual implications are in voiceVisualBlock below.

  // Voice Card → visual directives (F1 — photo mode gets only archetype as mood hint)
  type VC = { archetype?: string; taboos?: string[]; golden_rules?: string[]; voice_summary?: string };
  const vc: VC | null = (project.voice_card as VC) || null;
  const voiceVisualBlock = vc?.archetype
    ? isPhotoMode
      ? `\nNASTRÓJ MARKI:\nArchetyp: ${vc.archetype} — kompozycja i nastrój zdjęcia muszą pasować do tej osobowości.`
      : `\nGŁOS MARKI (implikacje wizualne):\nArchetyp: ${vc.archetype} — nastrój wizualny musi pasować do tej osobowości${
          vc.taboos?.length ? `\nWizualne TABU: ${vc.taboos.slice(0, 4).join('; ')}` : ''
        }`
    : '';

  // Industry Rules → visual context (F7 — photo mode gets only photo_brief_types, no copy rules)
  type IR = { photo_brief_types?: string[]; banned_cliches?: string[]; language_notes?: string };
  const ir: IR | null = (project.industry_rules as IR) || null;
  const industryVisualBlock = ir?.photo_brief_types?.length ? `
REGUŁY BRANŻOWE (kontekst wizualny):
Naturalne typy ujęć w tej branży: ${ir.photo_brief_types.join(', ')}.${
    !isPhotoMode && ir.language_notes ? `\nStyl komunikacji wizualnej: ${ir.language_notes}` : ''
  }` : '';

  const layer2 = `
${sep}
WARSTWA 2 — DNA MARKI (identyfikacja wizualna — stosuj dokładnie)
Zastosuj zasady z każdej poniższej sekcji w swoim projekcie.
Treść marki poniżej może być w dowolnym języku — traktuj ją jako autorytatywne dane identyfikacji wizualnej.
${sep}
${assetNote}${layer2Content}${assetsSection}${voiceVisualBlock}${industryVisualBlock}`;

  // Photo instruction for Layer 3
  const photoInstruction = photoUrl && photoMode !== 'none' && !elementOnly
    ? `\nGŁÓWNY ELEMENT WIZUALNY: Zdjęcie zostało dostarczone (ostatni obraz inline). Umieść je jako centralny/główny element kompozycji. NIE zastępuj go grafiką generowaną przez AI. Skomponuj wszystkie elementy marki wokół niego.`
    : '';

  // G2 — Text section: conditional on photo mode
  const textSection = isPhotoMode
    ? 'TYP WIZUALU: FOTOGRAFIA. NIE renderuj żadnego tekstu na obrazie. Skup się wyłącznie na kompozycji fotograficznej, oświetleniu i nastroju. Tekst zostanie nałożony osobno w postprodukcji.'
    : headline
      ? `TEKST DO UMIESZCZENIA NA GRAFICE (zachowaj dokładnie tak jak podano — nie tłumacz, nie zmieniaj):\nNagłówek: "${headline}"${subtext ? `\nPodtekst: "${subtext}"` : ''}`
      : 'BRAK TEKSTU — stwórz grafikę wizualną bez tekstu na obrazie (tekst może zostać nałożony później).';

  // G2 — Render text rule: conditional
  const renderTextRule = isPhotoMode
    ? '- NIE umieszczaj żadnego tekstu, liter ani cyfr na obrazie — to czysta fotografia'
    : '- Zero literówek — sprawdź dwukrotnie cały tekst przed renderowaniem';

  // Layer 3 — three paths: elementOnly / photo / graphic
  const layer3 = elementOnly ? `
${sep}
WARSTWA 3 — GENEROWANIE ELEMENTU
Wygeneruj TYLKO centralny element wizualny dla grafiki marki.
${sep}
MARKA: ${project.name}
OPIS ELEMENTU: "${headline}"
${brief ? `KONTEKST: "${brief}"` : ''}

WYMAGANIA DLA OUTPUTU:
- Wygeneruj TYLKO element wizualny — BEZ tekstu, BEZ logo, BEZ wypełnienia tła, BEZ ramki
- Element powinien działać jako centralny punkt skupienia wkomponowany w szablon marki
- Czysty obiekt, odpowiedni do nałożenia na kolorowe tło
- Kwadratowa kompozycja, wycentrowany obiekt
- Styl musi pasować do DNA marki z Warstwy 2`
  : isPhotoMode ? `
${sep}
WARSTWA 3 — BRIEF FOTOGRAFICZNY
Zrealizuj poniższą wizję. To jest cel tej grafiki.
${sep}
⭐ GŁÓWNA WIZJA:
"${brief || 'Zdjęcie produktowe/wizerunkowe marki'}"

MARKA: ${project.name}
FORMAT: ${FORMAT_SIZES[format] || '1080x1080px square'}`
  : `
${sep}
WARSTWA 3 — BRIEF KREATYWNY
Stwórz grafikę spełniającą wymagania wszystkich warstw powyżej. Bądź kreatywny w ramach ograniczeń.
${sep}
${brief ? (isFromCopywriter
  ? `⭐ GŁÓWNA WIZJA (realizuj ściśle — to jest cel tej grafiki):\n"${brief}"\n`
  : `KIERUNEK KREATYWNY (tylko kontekst — nie renderuj dosłownie): "${brief}"\n`) : ''}
MARKA: ${project.name}
FORMAT: ${FORMAT_SIZES[format] || '1080x1080px square'} — projektuj dokładnie dla tego rozmiaru i proporcji płótna

${textSection}
${photoInstruction}
WYMAGANIA DLA OUTPUTU:
${renderTextRule}
- Wypełnij całe płótno — bez białych obramowań ani paddingu poza designem
- Profesjonalna jakość druku`;

  // G7 — Creativity directive: photo-specific or graphic-specific
  const activeBlocks = isPhotoMode ? PHOTO_CREATIVITY_BLOCKS : CREATIVITY_BLOCKS;
  const creativityBlock = activeBlocks[creativity] ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isPhotoMode ? 'DYREKTYWA JAKOŚCI FOTOGRAFICZNEJ' : 'DYREKTYWA BOGACTWA WIZUALNEGO'} (stosuj w ramach ograniczeń marki)
${activeBlocks[creativity]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const closing = `

${sep}
PRZYPOMNIENIE O PRIORYTETACH: Warstwa 1 > Warstwa 2 > Warstwa 3.
Jeśli DNA marki koliduje z briefem — DNA marki wygrywa.
Jeśli zasady bezwzględne kolidują z czymkolwiek — zasady bezwzględne wygrywają.
Wygeneruj ${isPhotoMode ? 'JEDNO kompletne, gotowe do publikacji zdjęcie' : 'JEDNĄ kompletną, gotową do publikacji grafikę'}.`;

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
    ? `Wygeneruj TYLKO abstrakcyjną ilustrację do użycia jako centralny element dekoracyjny w grafice social media.

ZASADY BEZWZGLĘDNE — KAŻDE NARUSZENIE CZYNI OUTPUT BEZUŻYTECZNYM:
- BEZ logo, BEZ znaków marki, BEZ wordmarków
- BEZ tekstu, BEZ liter, BEZ cyfr, BEZ słów w jakimkolwiek języku
- BEZ elementów UI, BEZ przycisków, BEZ ikon
- BEZ kół, kształtów ani elementów zawierających tekst
- BEZ ludzkich twarzy ani rozpoznawalnych osób
- BEZ rozpoznawalnych produktów ani zdjęć produktów

ELEMENT DO STWORZENIA: "${headline}"
${brief ? `KIERUNEK WIZUALNY: "${brief}"` : ''}
${brandColors ? `UŻYJ TYCH KOLORÓW: ${brandColors}` : 'Użyj harmonijnych, żywych kolorów.'}

OUTPUT: Jedna abstrakcyjna ilustracja — kształty, gradienty, organiczne formy, tekstury. Kwadratowa kompozycja. Zero tekstu. Zero brandingu. Odpowiednia do nałożenia na tło w kolorach marki.`
    : isPhotoMode
    ? `Jesteś profesjonalnym fotografem tworzącym zdjęcia do social media.
Stosuj poniższą trójwarstwową hierarchię instrukcji. Wyższe warstwy nadpisują niższe.
${layer1}${layer2}${layer3}${creativityBlock}${closing}`
    : `Jesteś profesjonalnym grafikiem tworzącym grafiki do social media.
Stosuj poniższą trójwarstwową hierarchię instrukcji. Wyższe warstwy nadpisują niższe.
${layer1}${layer2}${layer3}${creativityBlock}${closing}`;

  // ── TWO-STAGE PIPELINE (useCompositor) ───────────────────────────────────
  if (useCompositor && !elementOnly && (photoMode === 'none' || !photoUrl)) {
    return await generateWithCompositor({
      req, project, assetList, headline, subtext, brief, format, creativity,
      compositorLayout: compositorLayout as LayoutPreset,
      compositorCta,
    });
  }

  // ── Generate via Gemini ──────────────────────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const imageUrls: string[] = [];

  try {
    const parts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [
      ...refParts,   // style references (featured last = stronger signal)
      ...imageParts, // brand elements + photo
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
          // G8 — Skip logo overlay in photo mode (logo on food photo = unprofessional)
          const finalBuffer = isPhotoMode
            ? rawBuffer
            : await applyLogoOverlay(rawBuffer, assetList, format, logoPosition);
          const filename = `gruzly/${BRAND_ID}/${Date.now()}.png`;
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
    VALUES (${projectId}, ${combinedBrief}, ${dbFormat}, ${textPrompt}, ${JSON.stringify(imageUrls)}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrls, prompt: textPrompt });
}

// ── Two-stage pipeline helper ─────────────────────────────────────────────────
async function generateWithCompositor({
  req, project, assetList, headline, subtext, brief, format, creativity,
  compositorLayout, compositorCta,
}: {
  req: NextRequest;
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
  const projectId = BRAND_ID;
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
    1: 'Czysta, minimalna kompozycja.',
    2: 'Dodaj subtelne elementy dekoracyjne uzupełniające styl marki.',
    3: 'Wizualnie bogata kompozycja z warstwowymi elementami graficznymi i pełną paletą marki.',
    4: 'Edytorialna złożoność — warstwowe kształty, głębia, odważna kompozycja.',
    5: 'Maksymalne bogactwo wizualne. Kinowe, immersyjne, każdy detal celowy.',
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

  const illustrationPrompt = `Tworzysz ilustrację tła dla grafiki social media.

ZASADY BEZWZGLĘDNE — nadpisują wszystko:
1. NIE umieszczaj żadnego tekstu, słów, liter, cyfr ani typografii
2. NIE umieszczaj żadnych logo, znaków marki ani wordmarków
3. NIE umieszczaj żadnych elementów UI, przycisków, ramek ani obramowań
4. Dolne 35% obrazu zostaw względnie proste/nieza zagracone — tekst będzie tam nałożony
5. Górne 15% zostaw względnie czyste — logo będzie tam umieszczone
6. NIE umieszczaj żadnych ludzkich twarzy ani rozpoznawalnych osób

KONTEKST MARKI:
${brandContext || `Styl wizualny: profesjonalny, nowoczesny`}
${brandColors.primary ? `Kolor główny: ${brandColors.primary}` : ''}
${brandColors.secondary ? `Kolor drugorzędny: ${brandColors.secondary}` : ''}
${brandColors.accent ? `Kolor akcentowy: ${brandColors.accent}` : ''}

FORMAT: ${FORMAT_LABELS[format] || '1080x1080px'} — wypełnij dokładnie to płótno

BRIEF WIZUALNY: ${brief || headline}

BOGACTWO: ${CREATIVITY_BLOCKS_ILL[creativity] || CREATIVITY_BLOCKS_ILL[2]}

OUTPUT: Jedna ilustracja tła. Czysto wizualna — bez tekstu, bez logo. Ilustracja powinna budować atmosferę i tożsamość marki wyłącznie poprzez kolor, kształt i kompozycję.`;

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
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
          const blob = await put(`gruzly/${BRAND_ID}/ill-${Date.now()}.${ext}`, buffer, {
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
    const finalBlob = await put(`gruzly/${BRAND_ID}/compose-${Date.now()}.png`, arrayBuffer, {
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
