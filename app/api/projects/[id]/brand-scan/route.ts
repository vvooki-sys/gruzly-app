export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { put } from '@vercel/blob';

export const maxDuration = 60;

const getDb = () => neon(process.env.DATABASE_URL!);

const SYSTEM_FONTS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'cursive', 'fantasy',
  '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial',
  'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma',
]);

function extractColors(html: string): string[] {
  const colors: string[] = [];
  const themeColor =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i)?.[1];
  if (themeColor) colors.push(themeColor);
  const hexMatches = html.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  const hexSet = new Set(hexMatches);
  hexSet.forEach(h => { if (!colors.includes(h)) colors.push(h); });
  return colors.slice(0, 10);
}

function extractFonts(html: string): string[] {
  const all: string[] = [];

  // Google Fonts from link tags
  const gfMatches = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"'&\s>]+)/gi) || [];
  for (const gf of gfMatches) {
    const fam = gf.match(/family=([^:&"'\s>]+)/)?.[1];
    if (fam) {
      fam.split('|').forEach(f => {
        const name = f.split(':')[0].replace(/\+/g, ' ').trim();
        if (name && !SYSTEM_FONTS.has(name)) all.push(name);
      });
    }
  }

  // font-family from CSS
  const cssFontMatches = html.match(/font-family:\s*([^;'"<>{}]+)/gi) || [];
  for (const match of cssFontMatches) {
    const raw = match.replace(/font-family:\s*/i, '').trim();
    const first = raw.split(',')[0].replace(/['"]/g, '').trim();
    if (first && first.length > 1 && first.length < 60 && !SYSTEM_FONTS.has(first)) {
      all.push(first);
    }
  }

  return [...new Set(all)].slice(0, 8);
}

function extractBrandText(html: string): { title: string; description: string; h1: string; paragraphs: string[] } {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    '';
  const h1 = html.match(/<h1[^>]*>([^<]{1,100})<\/h1>/i)?.[1]?.trim() || '';
  const pMatches = [...html.matchAll(/<p[^>]*>([^<]{10,300})<\/p>/gi)].map(m => m[1].trim());
  return {
    title: title.substring(0, 100),
    description: description.substring(0, 300),
    h1: h1.substring(0, 100),
    paragraphs: pMatches.slice(0, 3),
  };
}

function resolveUrl(url: string, base: string): string {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    const baseUrl = new URL(base);
    if (url.startsWith('/')) return baseUrl.origin + url;
    return baseUrl.origin + '/' + url;
  } catch {
    return url;
  }
}

function extractLogoUrl(html: string, baseUrl: string): string {
  const logoImg = html.match(/<img[^>]+(?:class|alt|id)=["'][^"']*logo[^"']*["'][^>]*>/gi)?.[0];
  if (logoImg) {
    const src = logoImg.match(/src=["']([^"']+)["']/i)?.[1];
    if (src) return resolveUrl(src, baseUrl);
  }
  return '';
}

function extractFaviconUrl(html: string, baseUrl: string): string {
  const favicon =
    html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i)?.[1] ||
    html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+\.(?:png|jpg|webp))[^"']*["']/i)?.[1] ||
    html.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut)[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|shortcut)[^"']*["']/i)?.[1];
  if (favicon) return resolveUrl(favicon, baseUrl);
  return '';
}

function extractOgImage(html: string, baseUrl: string): string {
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (ogImage) return resolveUrl(ogImage, baseUrl);
  return '';
}

function extractSocialLinks(html: string): { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string } {
  const links: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string } = {};
  const fb = html.match(/https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>)]+/i)?.[0];
  const ig = html.match(/https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>)]+/i)?.[0];
  const li = html.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>)]+/i)?.[0];
  const tt = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/[^\s"'<>)]+/i)?.[0];
  if (fb) links.facebook = fb;
  if (ig) links.instagram = ig;
  if (li) links.linkedin = li;
  if (tt) links.tiktok = tt;
  return links;
}

function extractFBPostTexts(fbHtml: string): string[] {
  const texts: string[] = [];
  // og:description often contains page description
  const ogDesc = fbHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,}?)["']/i)?.[1];
  if (ogDesc) texts.push(ogDesc.substring(0, 500));
  // Look for post content in JSON-LD or data attributes
  const jsonLdMatches = [...fbHtml.matchAll(/"message":"([^"]{20,300})"/g)];
  jsonLdMatches.slice(0, 5).forEach(m => texts.push(m[1]));
  return texts.filter(Boolean).slice(0, 6);
}

function extractFBPostImages(fbHtml: string, baseUrl: string): string[] {
  const images: string[] = [];
  // og:image
  const ogImg = fbHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogImg) images.push(resolveUrl(ogImg, baseUrl));
  return images.slice(0, 3);
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (ct.includes('svg')) return null;
    const buffer = await res.arrayBuffer();
    return { data: Buffer.from(buffer).toString('base64'), mimeType: ct.split(';')[0] };
  } catch {
    return null;
  }
}

async function downloadAndSaveAsset(
  projectId: number,
  assetUrl: string,
  type: 'logo' | 'reference',
  variant: string,
  description: string
): Promise<boolean> {
  try {
    // Check for duplicate by description (to avoid re-downloading on re-scan)
    const existing = await getDb()`
      SELECT id FROM brand_assets
      WHERE project_id = ${projectId} AND type = ${type} AND description = ${description}
      LIMIT 1
    `;
    if (existing.length > 0) return false;

    const res = await fetch(assetUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;

    const ct = res.headers.get('content-type') || 'image/png';
    // Skip tiny favicons (ICO) that Gemini won't use anyway
    if (ct.includes('x-icon') || ct.includes('vnd.microsoft')) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) return false; // skip suspiciously small files

    const ext = ct.includes('svg') ? 'svg' : ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const filename = `brand-scan-${type}-${Date.now()}.${ext}`;
    const blobPath = `gruzly/assets/${projectId}/${type}/${filename}`;

    const blob = await put(blobPath, buffer, { access: 'public', contentType: ct.split(';')[0] });

    await getDb()`
      INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
      VALUES (${projectId}, ${type}, ${blob.url}, ${filename}, ${variant}, ${description}, ${ct.split(';')[0]})
    `;

    // Sync logo_url if this is first logo
    if (type === 'logo') {
      const logos = await getDb()`
        SELECT url FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' ORDER BY created_at ASC LIMIT 1
      `;
      if (logos[0]) {
        await getDb()`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${projectId}`;
      }
    }

    return true;
  } catch (e) {
    console.error(`Failed to download asset ${assetUrl}:`, e);
    return false;
  }
}

export interface BrandDna {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  visualStyle: string;
  toneOfVoice: string;
  brandKeywords: string[];
  industry: string;
  brandName: string;
  brandDescription: string;
  fonts: string[];
  headingFont: string;
  bodyFont: string;
  brandValues: string[];
  ctaExamples: string[];
  photoStyle: string;
  targetAudience: string;
  logoUrl: string;
  faviconUrl: string;
  socialLinks: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string };
  socialMediaAnalysis?: {
    tone?: string;
    languageStyle?: string;
    commonTopics?: string[];
    ctaStyle?: string;
    postingPatterns?: string;
  } | null;
  scannedUrl: string;
  scannedAt: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  let url: string;
  try {
    ({ url } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!url || !url.startsWith('http')) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_scan_data JSONB`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scanned_url TEXT`.catch(() => {});

  // ── Stage 1: Fetch HTML ──────────────────────────────────────────────────
  let html: string;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const status = response.status;
      if (status === 403 || status === 429 || status === 503) {
        return NextResponse.json({ error: 'Website blocked scanning', fallback: true });
      }
      return NextResponse.json({ error: 'Cannot reach website' });
    }
    html = await response.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('block') || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('403')) {
      return NextResponse.json({ error: 'Website blocked scanning', fallback: true });
    }
    return NextResponse.json({ error: 'Cannot reach website' });
  }

  // Extract from HTML
  const extractedColors = extractColors(html);
  const brandText = extractBrandText(html);
  const logoUrl = extractLogoUrl(html, url);
  const faviconUrl = extractFaviconUrl(html, url);
  const ogImageUrl = extractOgImage(html, url);
  const socialLinks = extractSocialLinks(html);
  const fonts = extractFonts(html);

  // ── Stage 2: Gemini analysis ─────────────────────────────────────────────
  type GeminiResult = {
    PRIMARY_COLOR?: string;
    SECONDARY_COLOR?: string;
    ACCENT_COLOR?: string;
    VISUAL_STYLE?: string;
    TONE_OF_VOICE?: string;
    BRAND_KEYWORDS?: string[];
    INDUSTRY?: string;
    HEADING_FONT?: string;
    BODY_FONT?: string;
    BRAND_VALUES?: string[];
    CTA_EXAMPLES?: string[];
    PHOTO_STYLE?: string;
    TARGET_AUDIENCE?: string;
  };
  let geminiResult: GeminiResult = {};

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];

    if (ogImageUrl) {
      const imgData = await urlToBase64(ogImageUrl);
      if (imgData) parts.push({ inlineData: imgData });
    }

    const textContext = [
      `Website: ${url}`,
      brandText.title && `Title: ${brandText.title}`,
      brandText.description && `Description: ${brandText.description}`,
      brandText.h1 && `Main heading: ${brandText.h1}`,
      brandText.paragraphs.length > 0 && `Content: ${brandText.paragraphs.join(' | ')}`,
      extractedColors.length > 0 && `Colors found on page: ${extractedColors.slice(0, 5).join(', ')}`,
      fonts.length > 0 && `Fonts found on page: ${fonts.join(', ')}`,
    ].filter(Boolean).join('\n');

    const prompt = `Analyze this website and extract brand identity information.${parts.length > 0 ? ' An image from the website is attached.' : ''}

Website data:
${textContext}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "PRIMARY_COLOR": "hex color of the most dominant brand color",
  "SECONDARY_COLOR": "hex color of secondary brand color",
  "ACCENT_COLOR": "hex color of call-to-action or highlight color",
  "VISUAL_STYLE": "one of: minimalist / bold / elegant / playful / corporate / warm / technical",
  "TONE_OF_VOICE": "one of: formal / casual / friendly / professional / inspirational / technical",
  "BRAND_KEYWORDS": ["word1", "word2", "word3", "word4", "word5", "word6", "word7", "word8"],
  "INDUSTRY": "industry or sector of this business",
  "HEADING_FONT": "name of the heading/display font (from fonts found on page, or infer from visual style)",
  "BODY_FONT": "name of the body/paragraph font",
  "BRAND_VALUES": ["value1", "value2", "value3"],
  "CTA_EXAMPLES": ["example CTA phrase 1", "example CTA phrase 2"],
  "PHOTO_STYLE": "describe dominant photography style (e.g. studio product shots, lifestyle outdoor, corporate portraits)",
  "TARGET_AUDIENCE": "who this website is targeting (e.g. business professionals, young families, luxury consumers)"
}`;

    parts.push({ text: prompt });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    geminiResult = JSON.parse(cleaned);
  } catch (e) {
    console.error('Gemini brand scan error:', e);
  }

  // ── Stage 2.5: Social media scan (fire-and-forget, fully fallback-safe) ──
  let socialMediaAnalysis: BrandDna['socialMediaAnalysis'] = null;

  const socialScanPromises: Promise<void>[] = [];
  const collectedPosts: string[] = [];
  const collectedImages: string[] = [];

  if (socialLinks.facebook) {
    socialScanPromises.push(
      (async () => {
        try {
          const fbHtml = await fetch(socialLinks.facebook!, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.text() : '');
          if (fbHtml) {
            const posts = extractFBPostTexts(fbHtml);
            collectedPosts.push(...posts);
            const images = extractFBPostImages(fbHtml, socialLinks.facebook!);
            collectedImages.push(...images);
          }
        } catch {
          // FB blocked — skip silently
        }
      })()
    );
  }

  if (socialLinks.instagram) {
    socialScanPromises.push(
      (async () => {
        try {
          const igHtml = await fetch(socialLinks.instagram!, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.text() : '');
          const igDesc = igHtml?.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,}?)["']/i)?.[1];
          if (igDesc) collectedPosts.push(igDesc.substring(0, 500));
        } catch {
          // IG blocked — skip silently
        }
      })()
    );
  }

  await Promise.allSettled(socialScanPromises);

  if (collectedPosts.length > 0) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const tonePrompt = `Analyze these social media posts/descriptions from a brand. Return ONLY valid JSON (no markdown):
{
  "tone": "formal/casual/friendly/professional/inspirational/humorous",
  "languageStyle": "brief description of writing style",
  "commonTopics": ["topic1", "topic2", "topic3"],
  "ctaStyle": "how they phrase calls-to-action",
  "postingPatterns": "promotional vs educational vs behind-the-scenes ratio"
}

Posts:
${collectedPosts.map((p, i) => `[${i + 1}] ${p}`).join('\n')}`;

      const res = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: tonePrompt }] }] });
      const raw = res.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      socialMediaAnalysis = JSON.parse(raw);
    } catch {
      // Gemini failed on social analysis — skip
    }
  }

  // ── Stage 3: Build brandDna ──────────────────────────────────────────────
  const brandDna: BrandDna = {
    primaryColor: (geminiResult.PRIMARY_COLOR as string) || extractedColors[0] || '',
    secondaryColor: (geminiResult.SECONDARY_COLOR as string) || extractedColors[1] || '',
    accentColor: (geminiResult.ACCENT_COLOR as string) || extractedColors[2] || '',
    visualStyle: (geminiResult.VISUAL_STYLE as string) || '',
    toneOfVoice: (geminiResult.TONE_OF_VOICE as string) || '',
    brandKeywords: (geminiResult.BRAND_KEYWORDS as string[]) || [],
    industry: (geminiResult.INDUSTRY as string) || '',
    fonts,
    headingFont: (geminiResult.HEADING_FONT as string) || fonts[0] || '',
    bodyFont: (geminiResult.BODY_FONT as string) || fonts[1] || '',
    brandValues: (geminiResult.BRAND_VALUES as string[]) || [],
    ctaExamples: (geminiResult.CTA_EXAMPLES as string[]) || [],
    photoStyle: (geminiResult.PHOTO_STYLE as string) || '',
    targetAudience: (geminiResult.TARGET_AUDIENCE as string) || '',
    brandName: brandText.title.split('|')[0].split('-')[0].trim(),
    brandDescription: brandText.description,
    logoUrl,
    faviconUrl,
    socialLinks,
    socialMediaAnalysis,
    scannedUrl: url,
    scannedAt: new Date().toISOString(),
  };

  // Save to DB
  await getDb()`
    UPDATE projects
    SET brand_scan_data = ${JSON.stringify(brandDna)}::jsonb,
        scanned_url = ${url},
        updated_at = NOW()
    WHERE id = ${projectId}
  `;

  // ── Stage 4: Auto-download assets (after DB save — don't block response) ─
  const assetPromises: Promise<boolean>[] = [];

  if (logoUrl) {
    assetPromises.push(downloadAndSaveAsset(projectId, logoUrl, 'logo', 'default', 'Auto-downloaded logo from website scan'));
  }
  if (faviconUrl && faviconUrl !== logoUrl) {
    assetPromises.push(downloadAndSaveAsset(projectId, faviconUrl, 'logo', 'icon', 'Auto-downloaded icon/favicon from website scan'));
  }
  for (const imgUrl of collectedImages.slice(0, 3)) {
    assetPromises.push(downloadAndSaveAsset(projectId, imgUrl, 'reference', 'default', 'Auto-downloaded from social media post'));
  }

  await Promise.allSettled(assetPromises);

  return NextResponse.json({ success: true, brandDna, message: 'Brand DNA extracted successfully' });
}
