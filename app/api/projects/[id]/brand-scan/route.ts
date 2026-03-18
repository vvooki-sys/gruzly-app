export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { put } from '@vercel/blob';
import { decrypt } from '@/lib/encrypt';

export const maxDuration = 60;

const getDb = () => neon(process.env.DATABASE_URL!);

const SYSTEM_FONTS = new Set([
  'inherit', 'initial', 'unset', 'revert', 'sans-serif', 'serif', 'monospace',
  'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'cursive', 'fantasy',
  '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial',
  'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Tahoma',
]);

function getLuminance(hex: string): number {
  const h = hex.replace('#', '');
  if (h.length < 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const GENERIC_COLORS = new Set([
  '#ffffff', '#000000', '#333333', '#666666', '#999999', '#cccccc',
  '#eeeeee', '#f0f0f0', '#f5f5f5', '#fafafa', '#1a1a1a', '#222222',
  '#fff', '#000', '#333', '#666',
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

function extractTopColors(html: string): Array<{ color: string; count: number }> {
  const hexMatches = html.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  const freq: Record<string, number> = {};
  for (const c of hexMatches) {
    const norm = c.toLowerCase();
    if (!GENERIC_COLORS.has(norm)) freq[norm] = (freq[norm] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([color, count]) => ({ color, count }));
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

const cleanSocialUrl = (u: string) => u.replace(/[?#].*$/, '').replace(/\/+$/, '');

function extractSocialLinks(html: string): { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; youtube?: string } {
  const links: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; youtube?: string } = {};
  // Use href= to avoid matching FB SDK / analytics URLs
  const fb = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[^"']+)["']/i)?.[1];
  const ig = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[^"']+)["']/i)?.[1];
  const li = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[^"']+)["']/i)?.[1];
  const tt = html.match(/href=["'](https?:\/\/(?:www\.)?tiktok\.com\/@[^"']+)["']/i)?.[1];
  const yt = html.match(/href=["'](https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[^"']+)["']/i)?.[1];
  if (fb) links.facebook = cleanSocialUrl(fb);
  if (ig) links.instagram = cleanSocialUrl(ig);
  if (li) links.linkedin = cleanSocialUrl(li);
  if (tt) links.tiktok = cleanSocialUrl(tt);
  if (yt) links.youtube = cleanSocialUrl(yt);
  return links;
}

function decodeHtmlEntities(str: string): string {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractOgImageFromHtml(html: string, baseUrl: string): string {
  const raw =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
    html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1];
  if (!raw) return '';
  return resolveUrl(decodeHtmlEntities(raw), baseUrl);
}

// Returns true if the URL is a known IG/FB default icon (not a real brand image)
function isDefaultSocialIcon(imgUrl: string): boolean {
  return (
    imgUrl.includes('instagram.com/images/') ||
    imgUrl.includes('static.cdninstagram.com/rsrc') ||
    imgUrl.includes('facebook.com/images/') ||
    imgUrl.includes('static.xx.fbcdn.net/rsrc') ||
    imgUrl.includes('/assets/') && imgUrl.includes('facebook')
  );
}

// HEAD-checks an image URL: must be > 5 KB and not a known placeholder asset
async function isValidBrandImage(imageUrl: string): Promise<boolean> {
  try {
    if (isDefaultSocialIcon(imageUrl)) return false;
    // IG/CDN thumbnail size patterns: s100x100, s150x150, s240x240, etc.
    if (imageUrl.match(/s\d{2,3}x\d{2,3}/)) return false;
    if (imageUrl.includes('cdninstagram.com') && imageUrl.includes('s100x100')) return false;
    if (imageUrl.includes('instagram.com/static')) return false;
    const res = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    const contentLength = parseInt(res.headers.get('content-length') || '0');
    if (contentLength > 0 && contentLength < 5000) return false;
    return res.ok;
  } catch {
    return false;
  }
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
  const ogImg = extractOgImageFromHtml(fbHtml, baseUrl);
  return ogImg ? [ogImg] : [];
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

    const res = await fetch(assetUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    if (!res.ok) return false;

    const ct = res.headers.get('content-type') || '';
    // Must be an actual image — reject HTML, JSON, text, redirects, ICO
    if (!ct.startsWith('image/') && !ct.includes('svg')) return false;
    if (ct.includes('x-icon') || ct.includes('vnd.microsoft')) return false;

    const buffer = Buffer.from(await res.arrayBuffer());
    const minSize = type === 'reference' ? 5000 : 500; // social images < 5KB = default icon
    if (buffer.length < minSize) {
      console.log(`Asset too small (${buffer.length} bytes), skipping:`, assetUrl);
      return false;
    }

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
  socialLinks: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; youtube?: string };
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

  // Load current project for merge
  const [currentProject] = await getDb()`SELECT id, brand_sections, fb_token FROM projects WHERE id = ${projectId}`;
  if (!currentProject) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

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
  const topColors = extractTopColors(html);
  const brandText = extractBrandText(html);
  const logoUrl = extractLogoUrl(html, url);
  const faviconUrl = extractFaviconUrl(html, url);
  const ogImageUrl = extractOgImage(html, url);
  const socialLinks = extractSocialLinks(html);
  const fonts = extractFonts(html);

  // Detect body background color from CSS
  const bodyBg =
    html.match(/body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/i)?.[1] ||
    html.match(/html\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})/i)?.[1] || '';

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

    const colorContext = topColors.length > 0
      ? `\nEXTRACTED CSS COLORS (sorted by frequency of use):\n${topColors.map(c => `${c.color} (${c.count}x)`).join(', ')}${bodyBg ? `\nBody/page background: ${bodyBg}` : ''}\n\nCOLOR RULES:\n- PRIMARY = dominant background or main brand color (dark for dark-theme sites)\n- SECONDARY = supporting color (text, borders, cards)\n- ACCENT = CTA / highlight / interactive element color\n- All three MUST be DIFFERENT hex values`
      : '';

    const textContext = [
      `Website: ${url}`,
      brandText.title && `Title: ${brandText.title}`,
      brandText.description && `Description: ${brandText.description}`,
      brandText.h1 && `Main heading: ${brandText.h1}`,
      brandText.paragraphs.length > 0 && `Content: ${brandText.paragraphs.join(' | ')}`,
      extractedColors.length > 0 && `Theme/meta colors: ${extractedColors.slice(0, 5).join(', ')}`,
      fonts.length > 0 && `Fonts found on page: ${fonts.join(', ')}`,
    ].filter(Boolean).join('\n');

    const prompt = `Analyze this website and extract brand identity information.${parts.length > 0 ? ' An image from the website is attached.' : ''}

Website data:
${textContext}
${colorContext}

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "PRIMARY_COLOR": "hex — dominant background or main brand color (use dark color for dark-theme sites)",
  "SECONDARY_COLOR": "hex — supporting color, MUST differ from PRIMARY",
  "ACCENT_COLOR": "hex — CTA/highlight color, MUST differ from both PRIMARY and SECONDARY",
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

    // ── Post-Gemini color validation ──────────────────────────────────────
    // Ensure primary/secondary/accent are all distinct
    const pri = (geminiResult.PRIMARY_COLOR || '').toLowerCase();
    const sec = (geminiResult.SECONDARY_COLOR || '').toLowerCase();
    const acc = (geminiResult.ACCENT_COLOR || '').toLowerCase();

    // If primary === accent: one of them is wrong — reclassify
    if (pri && acc && pri === acc) {
      const priLum = getLuminance(pri);
      if (priLum > 0.3) {
        // Primary is light/colorful — likely it's actually the accent; find dark primary
        geminiResult.ACCENT_COLOR = geminiResult.PRIMARY_COLOR;
        const darkCandidate = topColors.find(c => getLuminance(c.color) < 0.15 && c.color !== acc);
        geminiResult.PRIMARY_COLOR = darkCandidate?.color || (bodyBg || '#1a1a2e');
      } else {
        // Primary is dark — find a different accent (lighter, colorful)
        const accentCandidate = topColors.find(c =>
          c.color !== pri && c.color !== sec && getLuminance(c.color) > 0.2
        );
        if (accentCandidate) geminiResult.ACCENT_COLOR = accentCandidate.color;
      }
    }

    // If primary === secondary: pick a different secondary
    if (geminiResult.PRIMARY_COLOR?.toLowerCase() === geminiResult.SECONDARY_COLOR?.toLowerCase()) {
      const secCandidate = topColors.find(c =>
        c.color !== geminiResult.PRIMARY_COLOR?.toLowerCase() &&
        c.color !== geminiResult.ACCENT_COLOR?.toLowerCase()
      );
      geminiResult.SECONDARY_COLOR = secCandidate?.color || '#555555';
    }
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

            // Extract cover photo from embedded JSON: cover_photo.photo.image.uri
            const coverMatch = fbHtml.match(/"cover_photo":\{"photo":\{"image":\{"uri":"([^"]+)"/);
            if (coverMatch) {
              const fbCoverUrl = coverMatch[1].replace(/\\\//g, '/').replace(/&amp;/g, '&');
              console.log('FB cover photo:', fbCoverUrl);
              if (!isDefaultSocialIcon(fbCoverUrl)) collectedImages.push(fbCoverUrl);
            }

            // og:image (profile picture / page preview) as additional reference
            const fbOgImage = extractOgImageFromHtml(fbHtml, socialLinks.facebook!);
            console.log('FB og:image:', fbOgImage || '(none)');
            if (fbOgImage && !isDefaultSocialIcon(fbOgImage) && !collectedImages.includes(fbOgImage)) {
              collectedImages.push(fbOgImage);
            }
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
          const igUrl = socialLinks.instagram!;
          // Must be a profile URL (not just instagram.com root)
          if (!igUrl.match(/instagram\.com\/[^/?#]{2,}/)) {
            console.log('IG URL is not a profile page, skipping:', igUrl);
            return;
          }
          console.log('Fetching IG profile:', igUrl);
          const igHtml = await fetch(igUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.text() : '');
          const igDesc = igHtml?.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{20,}?)["']/i)?.[1];
          if (igDesc) collectedPosts.push(igDesc.substring(0, 500));
          // Try og:image from IG profile — skip default IG icons
          if (igHtml) {
            const igOgImage = extractOgImageFromHtml(igHtml, igUrl);
            console.log('IG og:image:', igOgImage || '(none)');
            if (igOgImage && !isDefaultSocialIcon(igOgImage)) {
              collectedImages.push(igOgImage);
            }
          }
        } catch {
          // IG blocked — skip silently
        }
      })()
    );
  }

  // LinkedIn og:image as reference — company pages only (/company/), skip personal profiles (/in/)
  if (socialLinks.linkedin && socialLinks.linkedin.includes('/company/')) {
    socialScanPromises.push(
      (async () => {
        try {
          const liHtml = await fetch(socialLinks.linkedin!, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
            signal: AbortSignal.timeout(5000),
          }).then(r => r.ok ? r.text() : '');
          if (liHtml) {
            const liOgImage = extractOgImageFromHtml(liHtml, socialLinks.linkedin!);
            console.log('LinkedIn og:image:', liOgImage || '(none)');
            if (liOgImage && !isDefaultSocialIcon(liOgImage) && !collectedImages.includes(liOgImage)) {
              collectedImages.push(liOgImage);
            }
          }
        } catch {
          // LinkedIn blocked — skip silently
        }
      })()
    );
  } else if (socialLinks.linkedin) {
    console.log('LinkedIn: personal profile (/in/) — skipping og:image to avoid profile photo');
  }

  // FB Graph API: public profile picture (no token needed)
  if (socialLinks.facebook) {
    socialScanPromises.push(
      (async () => {
        try {
          const pageId = socialLinks.facebook!.match(/facebook\.com\/([^/?#]+)/)?.[1];
          if (pageId && pageId !== 'pages' && pageId !== 'groups') {
            const picRes = await fetch(
              `https://graph.facebook.com/${pageId}/picture?type=large&redirect=false`,
              { signal: AbortSignal.timeout(3000) }
            );
            if (picRes.ok) {
              const picData = await picRes.json() as { data?: { url?: string } };
              if (picData?.data?.url) collectedImages.push(picData.data.url);
            }
          }
        } catch {
          // Graph API unavailable — skip silently
        }
      })()
    );
  }

  // FB Graph API (authenticated): cover photo + profile picture using stored token
  if (socialLinks.facebook && currentProject.fb_token) {
    socialScanPromises.push(
      (async () => {
        try {
          const token = decrypt(currentProject.fb_token as string);
          const pageSlug = socialLinks.facebook!.match(/facebook\.com\/([^/?#]+)/)?.[1];
          if (pageSlug && pageSlug !== 'pages' && pageSlug !== 'groups') {
            const graphRes = await fetch(
              `https://graph.facebook.com/v19.0/${pageSlug}?fields=cover%7Bsource%7D%2Cpicture%7Burl%7D&access_token=${token}`,
              { signal: AbortSignal.timeout(5000) }
            );
            if (graphRes.ok) {
              const data = await graphRes.json() as {
                cover?: { source?: string };
                picture?: { data?: { url?: string } };
              };
              const coverUrl = data?.cover?.source;
              const pictureUrl = data?.picture?.data?.url;
              console.log('FB Graph cover:', coverUrl || '(none)', '| picture:', pictureUrl || '(none)');
              if (coverUrl && !collectedImages.includes(coverUrl)) collectedImages.push(coverUrl);
              if (pictureUrl && !isDefaultSocialIcon(pictureUrl) && !collectedImages.includes(pictureUrl)) {
                collectedImages.push(pictureUrl);
              }
            } else {
              console.log('FB Graph API error:', graphRes.status, await graphRes.text().catch(() => ''));
            }

            // Fetch last 8 posts with images
            const postsRes = await fetch(
              `https://graph.facebook.com/v19.0/${pageSlug}/posts?fields=full_picture,message&limit=8&access_token=${token}`,
              { signal: AbortSignal.timeout(8000) }
            );
            if (postsRes.ok) {
              const postsData = await postsRes.json() as { data?: Array<{ full_picture?: string; message?: string }> };
              const posts = postsData?.data || [];
              console.log(`FB Graph posts: ${posts.length} fetched`);
              for (const post of posts) {
                if (post.full_picture && !collectedImages.includes(post.full_picture)) {
                  collectedImages.push(post.full_picture);
                }
                if (post.message && post.message.length > 20) {
                  collectedPosts.push(post.message.substring(0, 500));
                }
              }
            } else {
              console.log('FB Graph posts error:', postsRes.status, await postsRes.text().catch(() => ''));
            }
          }
        } catch (e) {
          console.error('FB Graph API (authenticated) failed:', e);
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

  // ── Stage 2b: Generate Voice & Tone guide from real posts ────────────────
  let generatedTov = '';
  if (collectedPosts.length > 0 || socialMediaAnalysis) {
    try {
      const genAI2 = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
      const tovModel = genAI2.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const postsBlock = collectedPosts.length > 0
        ? `REAL POSTS FROM THIS BRAND'S SOCIAL MEDIA:\n${collectedPosts.slice(0, 12).map((p, i) => `[${i + 1}] ${p}`).join('\n')}`
        : '';

      const analysisBlock = socialMediaAnalysis
        ? `STRUCTURED ANALYSIS:\n- Tone: ${socialMediaAnalysis.tone || ''}\n- Language style: ${socialMediaAnalysis.languageStyle || ''}\n- Common topics: ${(socialMediaAnalysis.commonTopics || []).join(', ')}\n- CTA style: ${socialMediaAnalysis.ctaStyle || ''}`
        : '';

      const tovPrompt = `You are building a Voice & Tone guide for a copywriter AI. Analyze this brand's real communication data.

${postsBlock}

${analysisBlock}

Based ONLY on the evidence above — not on generic assumptions — write a practical Voice & Tone guide that a copywriter can immediately apply.

Write the guide in the SAME LANGUAGE as the posts above.

Format exactly as follows (keep the bold labels):
**VOICE:** 1-2 sentences describing the brand's communication character. Use concrete traits, not labels like "professional" or "friendly".

**RULES:** 4-5 specific writing rules derived from the actual posts. Be evidence-based: "their posts use short paragraphs and direct questions" not "write concisely".

**AVOID:** 3-4 specific phrases, patterns or registers this brand clearly does NOT use. Base on contrast with the actual posts.

**EMOJI:** How this brand uses emoji (or doesn't) based on the post evidence.

**EXAMPLE:** Write 1 short sentence in this brand's authentic voice on a neutral topic (e.g. announcing a new project).`;

      const tovResult = await tovModel.generateContent({ contents: [{ role: 'user', parts: [{ text: tovPrompt }] }] });
      generatedTov = tovResult.response.text().trim();
      console.log('Voice & Tone guide generated:', generatedTov.length, 'chars');
    } catch (e) {
      console.log('ToV guide generation failed, skipping:', e);
    }
  }

  // ── Stage 3: Build brandDna ──────────────────────────────────────────────
  const brandDna: BrandDna = {
    primaryColor: (geminiResult.PRIMARY_COLOR as string) || extractedColors[0] || '',
    secondaryColor: (geminiResult.SECONDARY_COLOR as string) || extractedColors[1] || '',
    accentColor: (geminiResult.ACCENT_COLOR as string) || extractedColors[2] || '',
    visualStyle: (geminiResult.VISUAL_STYLE as string) || '',
    toneOfVoice: generatedTov || (geminiResult.TONE_OF_VOICE as string) || '',
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

  // ── Stage 3b: Build structured brand sections from scan data ──────────────
  const SOURCE_PRIORITY: Record<string, number> = { brandbook: 3, references: 2, brand_scan: 1, manual: 0 };

  const newScanSections: Array<{
    id: string; title: string; content: string;
    type: 'standard'; order: number; icon: string;
    source: string; confidence: string;
  }> = [];

  if (brandDna.primaryColor || brandDna.secondaryColor || brandDna.accentColor) {
    newScanSections.push({
      id: 'kolorystyka', title: 'Kolory marki',
      content: [
        brandDna.primaryColor && `Primary color: ${brandDna.primaryColor}`,
        brandDna.secondaryColor && `Secondary color: ${brandDna.secondaryColor}`,
        brandDna.accentColor && `Accent color: ${brandDna.accentColor}`,
      ].filter(Boolean).join('\n'),
      type: 'standard', order: 10, icon: '🎨', source: 'brand_scan', confidence: 'auto',
    });
  }

  if (brandDna.headingFont || brandDna.bodyFont || brandDna.fonts.length > 0) {
    newScanSections.push({
      id: 'typografia', title: 'Typografia',
      content: [
        brandDna.headingFont && `Heading font: ${brandDna.headingFont}`,
        brandDna.bodyFont && `Body font: ${brandDna.bodyFont}`,
        brandDna.fonts.length > 0 && `All detected fonts: ${brandDna.fonts.join(', ')}`,
      ].filter(Boolean).join('\n'),
      type: 'standard', order: 11, icon: '📝', source: 'brand_scan', confidence: 'auto',
    });
  }

  if (brandDna.toneOfVoice || brandDna.brandKeywords.length > 0) {
    newScanSections.push({
      id: 'tone', title: 'Tone of Voice',
      content: [
        brandDna.toneOfVoice && `Tone of voice: ${brandDna.toneOfVoice}`,
        brandDna.brandKeywords.length > 0 && `Brand keywords: ${brandDna.brandKeywords.join(', ')}`,
        socialMediaAnalysis?.languageStyle && `Language style: ${socialMediaAnalysis.languageStyle}`,
        socialMediaAnalysis?.tone && `Social media tone: ${socialMediaAnalysis.tone}`,
      ].filter(Boolean).join('\n'),
      type: 'standard', order: 12, icon: '💬', source: 'brand_scan',
      confidence: socialMediaAnalysis ? 'medium' : 'auto',
    });
  }

  if (brandDna.brandValues.length > 0) {
    newScanSections.push({
      id: 'values', title: 'Wartości marki',
      content: `Brand values: ${brandDna.brandValues.join(', ')}`,
      type: 'standard', order: 13, icon: '⭐', source: 'brand_scan', confidence: 'auto',
    });
  }

  if (brandDna.visualStyle || brandDna.photoStyle) {
    newScanSections.push({
      id: 'visual_style', title: 'Styl wizualny',
      content: [
        brandDna.visualStyle && `Visual style: ${brandDna.visualStyle}`,
        brandDna.photoStyle && `Photo style: ${brandDna.photoStyle}`,
        brandDna.industry && `Industry: ${brandDna.industry}`,
      ].filter(Boolean).join('\n'),
      type: 'standard', order: 14, icon: '🖼', source: 'brand_scan', confidence: 'auto',
    });
  }

  if (brandDna.targetAudience) {
    newScanSections.push({
      id: 'target', title: 'Grupa docelowa',
      content: `Target audience: ${brandDna.targetAudience}`,
      type: 'standard', order: 15, icon: '👥', source: 'brand_scan', confidence: 'auto',
    });
  }

  if (brandDna.ctaExamples.length > 0) {
    newScanSections.push({
      id: 'cta_style', title: 'Call to Action',
      content: `CTA examples: ${brandDna.ctaExamples.join(' | ')}`,
      type: 'standard', order: 16, icon: '🎯', source: 'brand_scan', confidence: 'auto',
    });
  }

  // Merge: remove old-style monolith "brand_scan" section, then merge new structured sections
  // brand_scan does NOT overwrite sections with source brandbook or references
  type ExistingSec = Record<string, unknown>;
  const existingSections: ExistingSec[] = (currentProject.brand_sections || []).filter(
    (s: ExistingSec) => s.id !== 'brand_scan'
  );
  const mergedSections = [...existingSections];

  for (const newSec of newScanSections) {
    const existingIdx = mergedSections.findIndex(s => s.id === newSec.id);
    if (existingIdx >= 0) {
      const existingSource = (mergedSections[existingIdx].source as string) || 'manual';
      const existingPriority = SOURCE_PRIORITY[existingSource] ?? 0;
      // brand_scan only overwrites brand_scan or manual, not brandbook/references
      if (SOURCE_PRIORITY['brand_scan'] >= existingPriority) {
        mergedSections[existingIdx] = newSec;
      }
    } else {
      mergedSections.push(newSec);
    }
  }

  // Save to DB
  await getDb()`
    UPDATE projects
    SET brand_scan_data = ${JSON.stringify(brandDna)}::jsonb,
        brand_sections = ${JSON.stringify(mergedSections)}::jsonb,
        scanned_url = ${url},
        updated_at = NOW()
    WHERE id = ${projectId}
  `;

  // Save generated Voice & Tone guide (separate query to avoid overwriting manual edits when guide not generated)
  if (generatedTov) {
    await getDb()`UPDATE projects SET tone_of_voice = ${generatedTov} WHERE id = ${projectId}`;
  }

  // ── Stage 4: Auto-download assets (after DB save — don't block response) ─
  const assetPromises: Promise<boolean>[] = [];

  if (logoUrl) {
    assetPromises.push(downloadAndSaveAsset(projectId, logoUrl, 'logo', 'default', 'Auto-downloaded logo from website scan'));
  }
  if (faviconUrl && faviconUrl !== logoUrl) {
    assetPromises.push(downloadAndSaveAsset(projectId, faviconUrl, 'logo', 'icon', 'Auto-downloaded icon/favicon from website scan'));
  }
  // Exclude logo/favicon URLs from references — they're already saved as type='logo'
  const logoUrls = new Set([logoUrl, faviconUrl].filter(Boolean));
  const referenceImages = collectedImages.filter(u => !logoUrls.has(u)).slice(0, 5);
  for (const imgUrl of referenceImages) {
    // Use last 40 chars of URL as unique key — avoids dedup blocking all images with same generic description
    const urlKey = imgUrl.replace(/[?#].*$/, '').slice(-40);
    assetPromises.push(downloadAndSaveAsset(projectId, imgUrl, 'reference', 'social', `Social media image: ${urlKey}`));
  }

  // Product images from main site HTML — /cars/, /products/, /gallery/, /portfolio/ paths
  // Exclude logoUrl/faviconUrl to prevent the site logo ending up in references
  const productImageMatches = [...html.matchAll(/src=["']\s*(https?:\/\/[^"']*\/(?:cars|products|gallery|portfolio|photos)[^"']*\.(?:webp|jpg|jpeg|png))["']/gi)];
  const productImages = productImageMatches
    .map(m => m[1].trim())
    .filter((u, i, arr) => arr.indexOf(u) === i && !logoUrls.has(u))
    .slice(0, 3);
  for (const imgUrl of productImages) {
    const urlKey = imgUrl.replace(/[?#].*$/, '').slice(-40);
    assetPromises.push(downloadAndSaveAsset(projectId, imgUrl, 'reference', 'product', `Product image: ${urlKey}`));
  }

  await Promise.allSettled(assetPromises);

  const freshAssets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${projectId} ORDER BY created_at ASC`;

  return NextResponse.json({ success: true, brandDna, brandSections: mergedSections, assets: freshAssets, message: 'Brand DNA extracted successfully' });
}
