export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

const getDb = () => neon(process.env.DATABASE_URL!);

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
  const fontMatches = html.match(/font-family:\s*([^;'"<>{}]+)/gi) || [];
  const fontSet = new Set(
    fontMatches.map(f =>
      f.replace(/font-family:\s*/i, '').trim().split(',')[0].replace(/['"]/g, '').trim()
    )
  );
  const fonts: string[] = [];
  fontSet.forEach(f => { if (f && f.length > 1 && f.length < 50) fonts.push(f); });
  return fonts.slice(0, 5);
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
  const favicon =
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
  logoUrl: string;
  socialLinks: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string };
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

  // Ensure columns exist
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_scan_data JSONB`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scanned_url TEXT`.catch(() => {});

  // Stage 1: Fetch HTML
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
  const ogImageUrl = extractOgImage(html, url);
  const socialLinks = extractSocialLinks(html);
  const fonts = extractFonts(html);

  // Stage 2: Gemini analysis
  type GeminiResult = {
    PRIMARY_COLOR?: string;
    SECONDARY_COLOR?: string;
    ACCENT_COLOR?: string;
    VISUAL_STYLE?: string;
    TONE_OF_VOICE?: string;
    BRAND_KEYWORDS?: string[];
    INDUSTRY?: string;
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
      fonts.length > 0 && `Fonts: ${fonts.join(', ')}`,
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
  "INDUSTRY": "industry or sector of this business"
}`;

    parts.push({ text: prompt });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const text = result.response.text();
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    geminiResult = JSON.parse(cleaned);
  } catch (e) {
    console.error('Gemini brand scan error:', e);
    // Continue with HTML-extracted data only
  }

  // Stage 3: Build brandDna
  const brandDna: BrandDna = {
    primaryColor: (geminiResult.PRIMARY_COLOR as string) || extractedColors[0] || '',
    secondaryColor: (geminiResult.SECONDARY_COLOR as string) || extractedColors[1] || '',
    accentColor: (geminiResult.ACCENT_COLOR as string) || extractedColors[2] || '',
    visualStyle: (geminiResult.VISUAL_STYLE as string) || '',
    toneOfVoice: (geminiResult.TONE_OF_VOICE as string) || '',
    brandKeywords: (geminiResult.BRAND_KEYWORDS as string[]) || [],
    industry: (geminiResult.INDUSTRY as string) || '',
    brandName: brandText.title.split('|')[0].split('-')[0].trim(),
    brandDescription: brandText.description,
    logoUrl,
    socialLinks,
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

  return NextResponse.json({ success: true, brandDna, message: 'Brand DNA extracted successfully' });
}
