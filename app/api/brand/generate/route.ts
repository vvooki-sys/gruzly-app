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
import { getSystemPrompt } from '@/lib/system-prompts';

export const maxDuration = 30;

const FORMAT_SIZES: Record<string, string> = {
  fb_post: 'square 1:1 aspect ratio, 1080x1080px',
  ln_post: 'landscape 1.91:1 aspect ratio, 1200x628px',
  story:   'vertical 9:16 aspect ratio, 1080x1920px',
  banner:  'wide banner 3:1 aspect ratio, 1200x400px',
};

// Fallback creativity blocks — overridden by DB values when available
const CREATIVITY_BLOCKS_FALLBACK: Record<number, string> = {
  1: 'Minimalistyczna kompozycja. Jedno tło (solid kolor lub prosty dwukolorowy gradient). Tekst wycentrowany z czystą hierarchią. ZERO elementów dekoracyjnych — żadnych kształtów, ikon, patternów, tekstur. Maksimum negatywnej przestrzeni. Czytelność jest jedynym celem.',
  2: 'Prosty, uporządkowany design. Tło: gradient brandowy (max 3 kolory). Dozwolony JEDEN element dekoracyjny (kształt geometryczny, linia, subtelny pattern). Dozwolona subtelna tekstura (grain, noise). Kompozycja centralna, bezpieczna. Dużo powietrza wokół tekstu.',
  3: 'Świadoma, precyzyjna kompozycja z minimalną liczbą elementów — ale każdy doskonale umiejscowiony. Asymetryczny layout. Celowe użycie negatywnej przestrzeni jako elementu designu. Typografia z charakterem — zróżnicowane wielkości, kontrastujące grubości. Max 2-3 elementy dekoracyjne, ale rozmieszczone z intencją. Mniej znaczy więcej — ale to "mniej" musi być perfekcyjne.',
  4: 'Wielowarstwowa kompozycja graficzna z głębią. Elementy na pierwszym i drugim planie tworzące wrażenie przestrzeni. Tło jest aktywnym elementem designu — nie tylko podkład. Tekstury, nakładające się kształty z różną przezroczystością. 4-6 elementów wizualnych współpracujących ze sobą. Kontrasty wielkości w typografii. Celowa praca z gradientami i cieniami. Każdy element ma swoje miejsce w hierarchii wizualnej.',
  5: 'Projekt graficzny na poziomie agencji kreatywnej. Wszystko służy konceptowi kreatywnego briefu. Dramatyczne kontrasty kolorystyczne, śmiały color blocking. Editorial layout z odważną typografią zintegrowaną z elementami wizualnymi. Dynamiczna, nieszablonowa kompozycja łamiąca siatki i konwencje. Złożone wielowarstwowe tła. Zero przypadkowości — każdy element ma uzasadnienie.',
  6: 'Arcydzieło projektowania graficznego. Immersyjna, wielowarstwowa kompozycja, w której typografia i warstwa wizualna tworzą nierozerwalną całość. Złożone połączenie ilustracji, tekstur, gradientów i kształtów geometrycznych w jednej spójnej wizji. Każdy centymetr powierzchni zaprojektowany z intencją. Poziom kampanii globalnych marek — grafika, przy której zatrzymujesz scroll. Każdy piksel jest celowy.',
};

const PHOTO_CREATIVITY_BLOCKS_FALLBACK: Record<number, string> = {
  1: 'Czysta, minimalna kompozycja fotograficzna. Główny obiekt ostry, centralne kadrowanie, neutralne tło, równomierne miękkie oświetlenie. ZERO rekwizytów, ZERO stylizacji otoczenia. Sam obiekt na czystym tle.',
  2: 'Prosta, uporządkowana kompozycja z kontekstem. Główny obiekt ostry, tło w delikatnym bokeh (f/2.8-4). Ciepłe oświetlenie boczne, miękkie cienie. 1-2 rekwizyty kontekstowe w tle (nieostre, nieprzytłaczające). Naturalna stylizacja — bez nadmiernej inscenizacji.',
  3: 'Precyzyjny, świadomy kadr z minimalną liczbą elementów — ale każdy na idealnym miejscu. Celowa asymetria, negatywna przestrzeń jako element kompozycji. Ostrość krytyczna na głównym obiekcie, reszta podporządkowana. Światło modelowane z jednego kierunku. Mniej elementów niż na poziomie 4, ale każdy perfekcyjnie umiejscowiony.',
  4: 'Wielowarstwowy kadr z wyczuwalną głębią. Elementy na pierwszym planie, obiekcie głównym i w tle tworzące trzy plany ostrości. Kierunkowe oświetlenie z wyraźnymi cieniami budującymi głębię. Świadoma praca z teksturami i materiałami. Stylizacja celowa — rekwizyty, powierzchnie, otoczenie współtworzą nastrój marki. Każdy element kadru ma swoje miejsce w hierarchii wizualnej.',
  5: 'Produkcja na poziomie profesjonalnej sesji reklamowej. Dramatyczne światło z wyraźnym kierunkiem i kontrowym podświetleniem. Kinowa kolorystyka. Precyzyjna głębia ostrości — ostre detale przechodzą w kremowy bokeh. Dynamiczna, nieszablonowa perspektywa. Stylizacja na poziomie art directora — każdy rekwizyt, tekstura i powierzchnia służy konceptowi. Zero przypadkowości.',
  6: 'Arcydzieło fotograficzne. Kinowe światło, filmowa kolorystyka, immersyjna atmosfera z wyczuwalną głębią ostrości na każdym planie. Perfekcyjna równowaga między ostrością a bokeh. Kompozycja, światło i kolor tworzą spójną narrację emocjonalną. Zdjęcie, przy którym zatrzymujesz scroll. Każdy piksel jest celowy. Poziom kampanii globalnych marek.',
};

// Load creativity block from DB with fallback
async function loadCreativityBlock(prefix: string, level: number, fallbacks: Record<number, string>): Promise<string> {
  return getSystemPrompt(`${prefix}${level}`, fallbacks[level] || '');
}

// ── Logo compositor ───────────────────────────────────────────────────────────

type AssetRow = { type: string; url: string; filename: string; variant?: string; description?: string; mime_type?: string; is_featured?: boolean };

function getLogoCoordinates(
  position: string,
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
  margin: number
): { x: number; y: number } {
  const left = margin;
  const centerX = Math.round((imageWidth - logoWidth) / 2);
  const right = imageWidth - logoWidth - margin;
  const top = margin;
  const centerY = Math.round((imageHeight - logoHeight) / 2);
  const bottom = imageHeight - logoHeight - margin;

  const map: Record<string, { x: number; y: number }> = {
    'top-left':       { x: left,    y: top },
    'top-center':     { x: centerX, y: top },
    'top-right':      { x: right,   y: top },
    'middle-left':    { x: left,    y: centerY },
    'middle-center':  { x: centerX, y: centerY },
    'middle-right':   { x: right,   y: centerY },
    'bottom-left':    { x: left,    y: bottom },
    'bottom-center':  { x: centerX, y: bottom },
    'bottom-right':   { x: right,   y: bottom },
  };

  return map[position] || map['top-left'];
}

async function getRegionBrightness(
  imageBuffer: Buffer,
  width: number,
  height: number,
  position: string
): Promise<number> {
  try {
    const isRight = position.includes('right');
    const isBottom = position.includes('bottom');
    const isCenterX = position.includes('center') && !position.includes('middle');
    const isCenterY = position.includes('middle');

    const sampleW = Math.round(width * 0.30);
    const sampleH = Math.round(height * 0.25);

    const left = isCenterX ? Math.round((width - sampleW) / 2)
      : isRight ? width - sampleW : 0;
    const top = isCenterY ? Math.round((height - sampleH) / 2)
      : isBottom ? height - sampleH : 0;

    const region = await sharp(imageBuffer)
      .extract({ left, top, width: sampleW, height: sampleH })
      .greyscale()
      .raw()
      .toBuffer();

    return region.reduce((sum: number, px: number) => sum + px, 0) / region.length;
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
  height: number,
  position: string = 'top-left'
): Promise<AssetRow | null> {
  const logoAssets = brandAssets.filter(a => a.type === 'logo');
  if (logoAssets.length === 0) return null;
  if (logoAssets.length === 1) return logoAssets[0];

  const bgBrightness = await getRegionBrightness(imageBuffer, width, height, position);
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

  const logoAsset = await selectLogoAsset(brandAssets, geminiImageBuffer, width, height, logoPosition);
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
    const { x: logoX, y: logoY } = getLogoCoordinates(logoPosition, width, height, logoWidth, logoH, margin);

    // Sharp fix: patch logo zone with sampled adjacent background color
    // This eliminates the "dark rectangle" artifact Gemini renders in the logo zone
    const zoneW = Math.round(width * 0.25);
    const zoneH = Math.round(height * 0.20);
    const isRight = logoPosition.includes('right');
    const isBottom = logoPosition.includes('bottom');
    const isCenterX = logoPosition.includes('center') && !logoPosition.includes('middle');
    const isCenterY = logoPosition.includes('middle');
    const zoneLeft = isCenterX ? Math.round((width - zoneW) / 2) : isRight ? width - zoneW : 0;
    const zoneTop = isCenterY ? Math.round((height - zoneH) / 2) : isBottom ? height - zoneH : 0;
    const sampleSize = Math.round(Math.min(width, height) * 0.06);
    const sampleLeft = isCenterX
      ? Math.max(0, zoneLeft - sampleSize)
      : isRight ? Math.max(0, zoneLeft - sampleSize) : Math.min(width - sampleSize - 1, zoneW + 4);
    const sampleTop = isCenterY
      ? Math.max(0, zoneTop - sampleSize)
      : isBottom ? Math.max(0, zoneTop - sampleSize) : Math.min(height - sampleSize - 1, zoneH + 4);

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

    console.log(`Logo overlay applied: pos=${logoPosition}, variant=${logoAsset.variant || 'default'}`);
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
    logoOnPhoto = false,
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

  // ── Asset selection: photo mode vs graphic mode ──
  const allRefs = assetList.filter(a => a.type === 'reference').slice(0, 5);
  const featuredRefs = allRefs.filter(a => a.is_featured);
  const regularRefs = allRefs.filter(a => !a.is_featured);
  const photoAssetsList = assetList.filter(a => a.type === 'photo').slice(0, 3);
  const brandElements = assetList.filter(a => a.type === 'brand-element').slice(0, 2);

  const refParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];

  if (isPhotoMode && !elementOnly) {
    // PHOTO MODE: packshots first (max 3), then references only if no packshots
    if (photoAssetsList.length > 0) {
      refParts.push({ text: 'PACKSHOTY / ZDJĘCIA PRODUKTOWE MARKI — użyj w kompozycji:' });
      for (const p of photoAssetsList) {
        if (p.url.toLowerCase().endsWith('.svg')) continue;
        const b64 = await urlToBase64(p.url, true);
        if (b64) refParts.push({ inlineData: b64 });
      }
    } else if (allRefs.length > 0) {
      // Fallback: references only when no packshots
      refParts.push({ text: 'REFERENCJE STYLISTYCZNE — wyodrębnij paletę, nastrój, styl:' });
      const refsToSend = [...featuredRefs, ...regularRefs].slice(0, 3);
      for (const ref of refsToSend) {
        if (ref.url.toLowerCase().endsWith('.svg')) continue;
        const b64 = await urlToBase64(ref.url, true);
        if (b64) refParts.push({ inlineData: b64 });
      }
    }
    // Photo mode: NO brand-elements, NO logo images
  } else if (!elementOnly) {
    // GRAPHIC MODE: references + packshots + brand-elements (existing behavior)
    if (allRefs.length > 0) {
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
    if (photoAssetsList.length > 0) {
      refParts.push({ text: 'ZDJĘCIA / PACKSHOTY MARKI — te produkty/zdjęcia są częścią marki. Możesz je wykorzystać jako elementy wizualne kompozycji:' });
      for (const p of photoAssetsList) {
        if (p.url.toLowerCase().endsWith('.svg')) continue;
        const b64 = await urlToBase64(p.url, true);
        if (b64) refParts.push({ inlineData: b64 });
      }
    }
    for (const el of brandElements) {
      if (el.url.toLowerCase().endsWith('.svg')) continue;
      const b64 = await urlToBase64(el.url);
      if (b64 && !b64.mimeType.includes('svg')) imageParts.push({ inlineData: b64 });
    }
  }

  const imageRefCount = refParts.filter(p => 'inlineData' in p).length;

  // User-provided photo: include as inline image (graphic mode only — photo mode doesn't use this)
  if (photoUrl && photoMode !== 'none' && !elementOnly && !isPhotoMode) {
    const b64 = await urlToBase64(photoUrl);
    if (b64) imageParts.push({ inlineData: b64 });
  }

  console.log(`[ASSETS] mode=${isPhotoMode ? 'photo' : 'graphic'} | inline images sent: ${imageRefCount} | packshots in DB: ${photoAssetsList.length} | refs in DB: ${allRefs.length} | brand-elements: ${brandElements.length}`);
  refParts.filter(p => 'text' in p).forEach(p => console.log(`[ASSETS] label: ${(p as { text: string }).text.substring(0, 60)}...`));

  // ── Build 3-layer prompt ─────────────────────────────────────────────────
  const sep = '════════════════════════════════════════';

  const logoPosition: string = project.logo_position || 'top-left';

  const LOGO_EMPTY_ZONE: Record<string, string | null> = {
    'top-left':       'lewy górny obszar (pierwsze 25% szerokości, pierwsze 20% wysokości)',
    'top-center':     'górny środkowy obszar (środkowe 30% szerokości, pierwsze 20% wysokości)',
    'top-right':      'prawy górny obszar (ostatnie 25% szerokości, pierwsze 20% wysokości)',
    'middle-left':    'lewy środkowy obszar (pierwsze 25% szerokości, środkowe 20% wysokości)',
    'middle-center':  'centralny obszar (środkowe 30% szerokości, środkowe 20% wysokości)',
    'middle-right':   'prawy środkowy obszar (ostatnie 25% szerokości, środkowe 20% wysokości)',
    'bottom-left':    'lewy dolny obszar (pierwsze 25% szerokości, ostatnie 20% wysokości)',
    'bottom-center':  'dolny środkowy obszar (środkowe 30% szerokości, ostatnie 20% wysokości)',
    'bottom-right':   'prawy dolny obszar (ostatnie 25% szerokości, ostatnie 20% wysokości)',
    'none':           null,
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

  // F1 — Filter non-photo sections in photo mode (copy + typography + colors)
  const excludeStr = await getSystemPrompt('gen.photo.layer2_exclude', 'ton\ntone\nvoice\ngłos\nkomunikac\ncta\ncall to action\nwezwani\ncopy\ntekst\ntreść\nwartości\nvalues\ntypo\nfont\nczcion\ntypography\nkolor\ncolor\npalette\npaleta');
  const PHOTO_EXCLUDE_KEYWORDS = excludeStr.split('\n').map(s => s.trim()).filter(Boolean);
  function isVisualSection(section: { id?: string; title?: string; canonicalType?: string }): boolean {
    const key = `${section.id || ''} ${section.title || ''} ${section.canonicalType || ''}`.toLowerCase();
    return !PHOTO_EXCLUDE_KEYWORDS.some(kw => key.includes(kw));
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
  const activeFallbacks = isPhotoMode ? PHOTO_CREATIVITY_BLOCKS_FALLBACK : CREATIVITY_BLOCKS_FALLBACK;
  const activePrefix = isPhotoMode ? 'gen.photo.creativity.' : 'gen.graphic.creativity.';
  const activeCreativityText = await loadCreativityBlock(activePrefix, creativity, activeFallbacks);
  const creativityBlock = activeCreativityText ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${isPhotoMode ? 'DYREKTYWA JAKOŚCI FOTOGRAFICZNEJ' : 'DYREKTYWA BOGACTWA WIZUALNEGO'} (poziom ${creativity}/6)
${activeCreativityText}
Wszystkie zasady Warstwy 1 nadal nadpisują tę dyrektywę.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const closingId = isPhotoMode ? 'gen.photo.closing' : 'gen.graphic.closing';
  const closingFallback = isPhotoMode
    ? 'PRZYPOMNIENIE O PRIORYTETACH: Warstwa 1 > Warstwa 2 > Warstwa 3.\nJeśli DNA marki koliduje z briefem — DNA marki wygrywa.\nJeśli zasady bezwzględne kolidują z czymkolwiek — zasady bezwzględne wygrywają.\nWygeneruj JEDNO kompletne, gotowe do publikacji zdjęcie.'
    : 'PRZYPOMNIENIE O PRIORYTETACH: Warstwa 1 > Warstwa 2 > Warstwa 3.\nJeśli DNA marki koliduje z briefem — DNA marki wygrywa.\nJeśli zasady bezwzględne kolidują z czymkolwiek — zasady bezwzględne wygrywają.\nWygeneruj JEDNĄ kompletną, gotową do publikacji grafikę.';
  const closingText = await getSystemPrompt(closingId, closingFallback);
  const closing = `\n\n${sep}\n${closingText}`;

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

  const elementPromptTemplate = await getSystemPrompt('gen.element.prompt', `Wygeneruj TYLKO abstrakcyjną ilustrację do użycia jako centralny element dekoracyjny w grafice social media.

ZASADY BEZWZGLĘDNE — KAŻDE NARUSZENIE CZYNI OUTPUT BEZUŻYTECZNYM:
- BEZ logo, BEZ znaków marki, BEZ wordmarków
- BEZ tekstu, BEZ liter, BEZ cyfr, BEZ słów w jakimkolwiek języku
- BEZ elementów UI, BEZ przycisków, BEZ ikon
- BEZ kół, kształtów ani elementów zawierających tekst
- BEZ ludzkich twarzy ani rozpoznawalnych osób
- BEZ rozpoznawalnych produktów ani zdjęć produktów

OUTPUT: Jedna abstrakcyjna ilustracja — kształty, gradienty, organiczne formy, tekstury. Kwadratowa kompozycja. Zero tekstu. Zero brandingu. Odpowiednia do nałożenia na tło w kolorach marki.`);

  const textPrompt = elementOnly
    ? `${elementPromptTemplate}

ELEMENT DO STWORZENIA: "${headline}"
${brief ? `KIERUNEK WIZUALNY: "${brief}"` : ''}
${brandColors ? `UŻYJ TYCH KOLORÓW: ${brandColors}` : 'Użyj harmonijnych, żywych kolorów.'}`
    : isPhotoMode
    ? (() => {
      // Flat photo prompt — no layers, no meta-instructions
      const photoRules = [
        'Referencje stylistyczne → wyodrębnij paletę, nastrój, styl. NIE kopiuj twarzy, osób, obiektów ani scen.',
        ...(photoAssetsList.length > 0 ? ['Packshoty/zdjęcia produktowe marki → MOŻESZ użyć w kompozycji.'] : []),
        'NIE umieszczaj tekstu, liter, cyfr, logo ani watermarków.',
        'Wypełnij całe płótno — bez białych obramowań.',
        ...brandRuleLines,
      ];

      const assetParts: string[] = [];
      if (imageRefCount > 0) assetParts.push(`Referencje stylu: ${imageRefCount}`);
      if (photoAssetsList.length > 0) assetParts.push(`Packshoty: ${photoAssetsList.length}`);
      if (logoAssets.length > 0) assetParts.push(`Logo: ${logoAssets.length} (nakładane po generacji)`);
      if (brandElements.length > 0) assetParts.push(`Elementy dekoracyjne: ${brandElements.length}`);
      const assetsLine = assetParts.length > 0 ? `\nDOSTARCZONE ZASOBY (inline):\n${assetParts.join(' · ')}` : '';

      const moodLine = vc?.archetype ? `\nNASTRÓJ: ${vc.archetype}` : '';
      const photoTypesLine = ir?.photo_brief_types?.length
        ? `\nTYPY UJĘĆ BRANŻOWYCH: ${ir.photo_brief_types.join(', ')}`
        : '';

      const photoRole = await getSystemPrompt('gen.photo.role', 'Jesteś profesjonalnym fotografem. Generujesz zdjęcia do social media.');
      const photoCreativityText = await loadCreativityBlock('gen.photo.creativity.', creativity, PHOTO_CREATIVITY_BLOCKS_FALLBACK);

      return `${photoRole}

ZASADY BEZWZGLĘDNE:
${photoRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

DNA MARKI:
${layer2Content}
${assetsLine}
${moodLine}${photoTypesLine}

⭐ BRIEF:
"${brief || 'Zdjęcie produktowe/wizerunkowe marki'}"

FORMAT: ${FORMAT_SIZES[format] || '1080x1080px square'}

JAKOŚĆ FOTOGRAFICZNA (${creativity}/6):
${photoCreativityText}`;
    })()
    : await (async () => {
      const graphicRole = await getSystemPrompt('gen.graphic.role', 'Jesteś profesjonalnym grafikiem tworzącym grafiki do social media.\nStosuj poniższą trójwarstwową hierarchię instrukcji. Wyższe warstwy nadpisują niższe.');
      return `${graphicRole}\n${layer1}${layer2}${layer3}${creativityBlock}${closing}`;
    })();

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
          // G8 — Photo: simple composite (no zone patching). Graphic: full overlay.
          let finalBuffer: Buffer;
          if (isPhotoMode && logoOnPhoto) {
            const meta = await sharp(rawBuffer).metadata();
            const w = meta.width || 1080;
            const h = meta.height || 1080;
            const logoAsset = await selectLogoAsset(assetList, rawBuffer, w, h, logoPosition);
            if (logoAsset) {
              const logoArr = await fetch(logoAsset.url).then(r => r.arrayBuffer());
              const logoRaw = Buffer.from(new Uint8Array(logoArr));
              const logoWidth = Math.round(w * 0.15);
              const margin = Math.round(logoWidth / 2);
              const logoResized = await sharp(logoRaw)
                .resize(logoWidth, null, { fit: 'inside', withoutEnlargement: true })
                .toBuffer();
              const logoMeta = await sharp(logoResized).metadata();
              const logoH = logoMeta.height || Math.round(h * 0.06);
              const { x, y } = getLogoCoordinates(logoPosition, w, h, logoWidth, logoH, margin);
              finalBuffer = await sharp(rawBuffer)
                .composite([{ input: logoResized, top: y, left: x }])
                .png()
                .toBuffer();
              console.log(`Photo logo: ${logoAsset.variant || 'default'}, ${logoWidth}px, ${logoPosition}`);
            } else {
              finalBuffer = rawBuffer;
            }
          } else if (!isPhotoMode) {
            finalBuffer = await applyLogoOverlay(rawBuffer, assetList, format, logoPosition);
          } else {
            finalBuffer = rawBuffer;
          }
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

  const CREATIVITY_BLOCKS_ILL_FALLBACK: Record<number, string> = {
    1: 'Minimalistyczna kompozycja. Solid tło, czysta hierarchia, zero dekoracji.',
    2: 'Prosty design. Gradient brandowy, max jeden element dekoracyjny, dużo powietrza.',
    3: 'Precyzyjna kompozycja. Asymetria, celowa negatywna przestrzeń, typografia z charakterem.',
    4: 'Wielowarstwowy kadr z głębią. Tekstury, nakładające się kształty, światło i cień.',
    5: 'Profesjonalna sesja reklamowa. Dramatyczne światło, editorial layout, dynamiczna kompozycja.',
    6: 'Arcydzieło. Kinowe światło, immersyjna wielowarstwowość, każdy piksel celowy.',
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

  const illPromptTemplate = await getSystemPrompt('gen.compositor.illustration_prompt', `Tworzysz ilustrację tła dla grafiki social media.

ZASADY BEZWZGLĘDNE — nadpisują wszystko:
1. NIE umieszczaj żadnego tekstu, słów, liter, cyfr ani typografii
2. NIE umieszczaj żadnych logo, znaków marki ani wordmarków
3. NIE umieszczaj żadnych elementów UI, przycisków, ramek ani obramowań
4. Dolne 35% obrazu zostaw względnie proste/niezagracone — tekst będzie tam nałożony
5. Górne 15% zostaw względnie czyste — logo będzie tam umieszczone
6. NIE umieszczaj żadnych ludzkich twarzy ani rozpoznawalnych osób

OUTPUT: Jedna ilustracja tła. Czysto wizualna — bez tekstu, bez logo. Ilustracja powinna budować atmosferę i tożsamość marki wyłącznie poprzez kolor, kształt i kompozycję.`);

  const illCreativityText = await loadCreativityBlock('gen.compositor.creativity.', creativity, CREATIVITY_BLOCKS_ILL_FALLBACK);

  const illustrationPrompt = `${illPromptTemplate}

KONTEKST MARKI:
${brandContext || `Styl wizualny: profesjonalny, nowoczesny`}
${brandColors.primary ? `Kolor główny: ${brandColors.primary}` : ''}
${brandColors.secondary ? `Kolor drugorzędny: ${brandColors.secondary}` : ''}
${brandColors.accent ? `Kolor akcentowy: ${brandColors.accent}` : ''}

FORMAT: ${FORMAT_LABELS[format] || '1080x1080px'} — wypełnij dokładnie to płótno

BRIEF WIZUALNY: ${brief || headline}

BOGACTWO: ${illCreativityText || CREATIVITY_BLOCKS_ILL_FALLBACK[2]}`;

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
