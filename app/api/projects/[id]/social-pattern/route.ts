export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

const getDb = () => neon(process.env.DATABASE_URL!);

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\\//g, '/');
}

function extractOgImage(html: string, baseUrl: string): string {
  const raw =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
    html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1];
  if (!raw) return '';
  const decoded = decodeHtmlEntities(raw);
  try {
    if (decoded.startsWith('http')) return decoded;
    if (decoded.startsWith('//')) return 'https:' + decoded;
    return new URL(decoded, baseUrl).href;
  } catch {
    return decoded;
  }
}

function isDefaultSocialIcon(url: string): boolean {
  return (
    url.includes('instagram.com/images/') ||
    url.includes('static.cdninstagram.com/rsrc') ||
    url.includes('facebook.com/images/') ||
    url.includes('static.xx.fbcdn.net/rsrc') ||
    url.includes('linkedin.com/sc/h/') ||
    url.includes('/static/images/')
  );
}

async function isValidImage(url: string): Promise<boolean> {
  try {
    if (isDefaultSocialIcon(url)) return false;
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return false;
    const cl = parseInt(res.headers.get('content-length') || '0');
    if (cl > 0 && cl < 5000) return false;
    return true;
  } catch {
    return false;
  }
}

export interface PlatformResult {
  platform: string;
  images: string[];
  postsAnalyzed: number;
  method: string | null;
  error: string | null;
}

async function analyzeFacebook(fbUrl: string): Promise<PlatformResult> {
  try {
    const html = await fetch(fbUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok ? r.text() : '');
    if (!html) return { platform: 'facebook', images: [], postsAnalyzed: 0, method: null, error: 'Blocked or unreachable' };

    const images: string[] = [];

    // Cover photo from embedded JSON
    const coverMatch = html.match(/"cover_photo":\{"photo":\{"image":\{"uri":"([^"]+)"/);
    if (coverMatch) {
      images.push(decodeHtmlEntities(coverMatch[1]));
    }

    // og:image (profile picture / page preview)
    const ogImg = extractOgImage(html, fbUrl);
    if (ogImg && !images.includes(ogImg)) images.push(ogImg);

    // Timeline scontent images (high-res posts)
    const timelineMatches = [...html.matchAll(/"uri":"(https:\/\/scontent[^"]+\.(?:jpg|png|webp)[^"]*)"(?:[^}]*"width":(?:720|960|1080))/g)];
    const timelineImages = timelineMatches
      .map(m => decodeHtmlEntities(m[1]))
      .filter(u => !u.includes('/profile') && !u.includes('rsrc'))
      .slice(0, 4);
    for (const img of timelineImages) {
      if (!images.includes(img)) images.push(img);
    }

    // Validate all collected
    const validImages: string[] = [];
    for (const img of [...new Set(images)]) {
      if (await isValidImage(img)) validImages.push(img);
    }

    return { platform: 'facebook', images: validImages, postsAnalyzed: validImages.length, method: 'html-scrape', error: null };
  } catch (e) {
    return { platform: 'facebook', images: [], postsAnalyzed: 0, method: null, error: String(e) };
  }
}

async function analyzeInstagram(igUrl: string): Promise<PlatformResult> {
  try {
    if (!igUrl.match(/instagram\.com\/[^/?#]{2,}/)) {
      return { platform: 'instagram', images: [], postsAnalyzed: 0, method: null, error: 'Not a profile URL' };
    }
    const html = await fetch(igUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok ? r.text() : '');
    if (!html) return { platform: 'instagram', images: [], postsAnalyzed: 0, method: null, error: 'Blocked or unreachable' };

    const images: string[] = [];
    const ogImg = extractOgImage(html, igUrl);
    if (ogImg && !isDefaultSocialIcon(ogImg)) images.push(ogImg);

    return { platform: 'instagram', images, postsAnalyzed: images.length, method: 'html-fallback', error: null };
  } catch (e) {
    return { platform: 'instagram', images: [], postsAnalyzed: 0, method: null, error: String(e) };
  }
}

async function analyzeLinkedIn(liUrl: string): Promise<PlatformResult> {
  try {
    const html = await fetch(liUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok ? r.text() : '');
    if (!html) return { platform: 'linkedin', images: [], postsAnalyzed: 0, method: null, error: 'Blocked or unreachable' };

    const images: string[] = [];

    const ogImg = extractOgImage(html, liUrl);
    if (ogImg && !isDefaultSocialIcon(ogImg)) images.push(ogImg);

    // Background cover image
    const bgMatch = html.match(/backgroundImage[^:]*:\s*url\("([^"]+)"\)/);
    if (bgMatch) {
      const bgUrl = decodeHtmlEntities(bgMatch[1]);
      if (bgUrl.startsWith('http') && !images.includes(bgUrl)) images.push(bgUrl);
    }

    // data-delayed-url (LinkedIn lazy-loaded images)
    const delayedMatches = [...html.matchAll(/data-delayed-url="([^"]+media[^"]+)"/g)]
      .map(m => decodeHtmlEntities(m[1]))
      .filter(u => u.startsWith('http'))
      .slice(0, 3);
    for (const img of delayedMatches) {
      if (!images.includes(img)) images.push(img);
    }

    const validImages: string[] = [];
    for (const img of [...new Set(images)]) {
      if (await isValidImage(img)) validImages.push(img);
    }

    return { platform: 'linkedin', images: validImages, postsAnalyzed: validImages.length, method: 'html-scrape', error: null };
  } catch (e) {
    return { platform: 'linkedin', images: [], postsAnalyzed: 0, method: null, error: String(e) };
  }
}

async function analyzeTikTok(ttUrl: string): Promise<PlatformResult> {
  try {
    const html = await fetch(ttUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok ? r.text() : '');
    if (!html) return { platform: 'tiktok', images: [], postsAnalyzed: 0, method: null, error: 'Blocked or unreachable' };

    const images: string[] = [];
    const ogImg = extractOgImage(html, ttUrl);
    if (ogImg && !isDefaultSocialIcon(ogImg)) images.push(ogImg);

    return { platform: 'tiktok', images, postsAnalyzed: images.length, method: 'html-fallback', error: null };
  } catch (e) {
    return { platform: 'tiktok', images: [], postsAnalyzed: 0, method: null, error: String(e) };
  }
}

async function analyzeYouTube(ytUrl: string): Promise<PlatformResult> {
  try {
    const html = await fetch(ytUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
      signal: AbortSignal.timeout(8000),
    }).then(r => r.ok ? r.text() : '');
    if (!html) return { platform: 'youtube', images: [], postsAnalyzed: 0, method: null, error: 'Blocked or unreachable' };

    const images: string[] = [];
    const ogImg = extractOgImage(html, ytUrl);
    if (ogImg && !isDefaultSocialIcon(ogImg)) images.push(ogImg);

    // Channel banner from ytInitialData
    const bannerMatch = html.match(/"banner":\{"imageBanner":\{"bannerImageUrl":"([^"]+)"/);
    if (bannerMatch) {
      const bannerUrl = decodeHtmlEntities(bannerMatch[1]);
      if (!images.includes(bannerUrl)) images.push(bannerUrl);
    }

    return { platform: 'youtube', images, postsAnalyzed: images.length, method: 'html-fallback', error: null };
  } catch (e) {
    return { platform: 'youtube', images: [], postsAnalyzed: 0, method: null, error: String(e) };
  }
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    if (ct.includes('svg') || !ct.startsWith('image/')) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < 5000) return null;
    return { data: Buffer.from(buffer).toString('base64'), mimeType: ct.split(';')[0] };
  } catch {
    return null;
  }
}

export interface CommunicationPattern {
  summary: string;
  content_types: string[];
  dominant_visual_style: string;
  people_in_content: boolean;
  product_focus: string;
  text_in_posts: string;
  production_quality: string;
  platform_differences: string;
  tags: string[];
  gemini_recommendation: string;
  use_photos_over_graphics: boolean;
  suggested_gruzly_mode: 'creative' | 'photo' | 'precision';
}

async function analyzeVisualPattern(
  images: { url: string; source: string }[],
  brandScanData: { brandName?: string; industry?: string } | null
): Promise<CommunicationPattern | null> {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const imagesBySource: Record<string, string[]> = {};
    for (const { url, source } of images) {
      if (!imagesBySource[source]) imagesBySource[source] = [];
      imagesBySource[source].push(url);
    }

    const parts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];

    // Load max 6 images (spread across sources)
    const selectedImages = images.slice(0, 6);
    for (const { url } of selectedImages) {
      const imgData = await urlToBase64(url);
      if (imgData) parts.push({ inlineData: imgData });
    }

    const sourceSummary = Object.entries(imagesBySource)
      .map(([src, imgs]) => `${src}: ${imgs.length} obrazów`)
      .join(', ');

    const prompt = `Analizujesz obecność marki na mediach społecznościowych.
Marka: ${brandScanData?.brandName || 'Nieznana'}
Branża: ${brandScanData?.industry || 'Nieznana'}
Źródła analizowanych obrazów: ${sourceSummary}

Przeanalizuj WSZYSTKIE te obrazy jako całość — jaki jest wizualny wzorzec komunikacji tej marki?

Odpowiedz TYLKO poprawnym JSON (bez markdown):
{
  "summary": "2-3 zdania opisujące jak ta marka komunikuje się wizualnie",
  "content_types": ["lifestyle photography", "product shots", "behind the scenes"],
  "dominant_visual_style": "1 zdanie — kolory, nastrój, kompozycja",
  "people_in_content": true,
  "product_focus": "high",
  "text_in_posts": "moderate",
  "production_quality": "professional",
  "platform_differences": "opis różnic między platformami lub 'brak wyraźnych różnic'",
  "tags": ["dark premium", "lifestyle", "urban"],
  "gemini_recommendation": "2 zdania — jaki typ grafik Gruzly najlepiej pasuje do tego stylu?",
  "use_photos_over_graphics": true,
  "suggested_gruzly_mode": "photo"
}`;

    parts.push({ text: prompt });

    if (parts.length === 1) return null; // no images loaded

    const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const raw = res.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(raw) as CommunicationPattern;
  } catch (e) {
    console.error('Gemini visual pattern error:', e);
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const [project] = await getDb()`SELECT brand_scan_data FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const brandScanData = project.brand_scan_data as {
    socialLinks?: Record<string, string | undefined>;
    brandName?: string;
    industry?: string;
  } | null;

  const socialLinks = brandScanData?.socialLinks || {};

  const results: Record<string, PlatformResult> = {};
  const allImages: { url: string; source: string }[] = [];

  const platformTasks: Promise<void>[] = [];

  if (socialLinks.facebook) {
    platformTasks.push(
      analyzeFacebook(socialLinks.facebook).then(r => {
        results.facebook = r;
        allImages.push(...r.images.map(url => ({ url, source: 'facebook' })));
      })
    );
  }

  if (socialLinks.instagram) {
    platformTasks.push(
      analyzeInstagram(socialLinks.instagram).then(r => {
        results.instagram = r;
        allImages.push(...r.images.map(url => ({ url, source: 'instagram' })));
      })
    );
  }

  if (socialLinks.linkedin) {
    platformTasks.push(
      analyzeLinkedIn(socialLinks.linkedin).then(r => {
        results.linkedin = r;
        allImages.push(...r.images.map(url => ({ url, source: 'linkedin' })));
      })
    );
  }

  if (socialLinks.tiktok) {
    platformTasks.push(
      analyzeTikTok(socialLinks.tiktok).then(r => {
        results.tiktok = r;
        allImages.push(...r.images.map(url => ({ url, source: 'tiktok' })));
      })
    );
  }

  if (socialLinks.youtube) {
    platformTasks.push(
      analyzeYouTube(socialLinks.youtube).then(r => {
        results.youtube = r;
        allImages.push(...r.images.map(url => ({ url, source: 'youtube' })));
      })
    );
  }

  await Promise.allSettled(platformTasks);

  // Gemini Vision: analyze visual communication pattern
  let communicationPattern: CommunicationPattern | null = null;
  if (allImages.length > 0) {
    communicationPattern = await analyzeVisualPattern(allImages, brandScanData);
  }

  // Save to DB
  await getDb()`
    UPDATE projects
    SET brand_scan_data = brand_scan_data || ${JSON.stringify({ platformResults: results, communicationPattern })}::jsonb,
        updated_at = NOW()
    WHERE id = ${projectId}
  `;

  return NextResponse.json({
    success: true,
    results,
    communicationPattern,
    totalImages: allImages.length,
  });
}
