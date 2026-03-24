export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST() {
  const projectId = BRAND_ID;

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${projectId} ORDER BY created_at ASC`;
  const bsd = project.brand_scan_data || {};

  const logoAssets = (assets as Array<{ type: string; url: string; variant?: string }>).filter(a => a.type === 'logo');
  const logoAsset = logoAssets.find(a => a.variant === 'default') || logoAssets[0];

  const brandBookData = {
    brandName: project.name,
    primaryColor: bsd.primaryColor || '',
    secondaryColor: bsd.secondaryColor || '',
    accentColor: bsd.accentColor || '',
    fonts: bsd.fonts || [],
    headingFont: bsd.headingFont || '',
    bodyFont: bsd.bodyFont || '',
    visualStyle: bsd.visualStyle || '',
    toneOfVoice: bsd.toneOfVoice || '',
    brandKeywords: bsd.brandKeywords || [],
    industry: bsd.industry || '',
    targetAudience: bsd.targetAudience || '',
    brandValues: bsd.brandValues || [],
    ctaExamples: bsd.ctaExamples || [],
    photoStyle: bsd.photoStyle || '',
    logoUrl: logoAsset?.url || '',
    description: project.description || bsd.brandDescription || '',
    websiteUrl: (project.scanned_url as string) || bsd.scannedUrl || '',
    socialTone: bsd.socialMediaAnalysis || null,
  };

  const prompt = `Jesteś strategiem marki. Wygeneruj treść wytycznych brandowych na podstawie poniższych danych marki.
Pisz po polsku.

Dane marki:
${JSON.stringify(brandBookData, null, 2)}

Wygeneruj poniższe sekcje. Zwróć WYŁĄCZNIE poprawny JSON, bez markdown, bez wyjaśnień:
{
  "hero": {
    "tagline": "Odważny tagline marki, 5-8 słów",
    "description": "2-3 zdania pozycjonujące markę"
  },
  "mission": "1-2 zdania o tym, co marka robi i dlaczego",
  "vision": "1-2 zdania o tym, dokąd zmierza marka",
  "values": [
    { "name": "Nazwa Wartości", "description": "Jednoliniowy opis" }
  ],
  "logo_guidelines": {
    "usage_rules": ["zasada 1", "zasada 2", "zasada 3"],
    "do_list": ["co robić 1", "co robić 2", "co robić 3"],
    "dont_list": ["czego unikać 1", "czego unikać 2", "czego unikać 3"]
  },
  "color_descriptions": {
    "primary": "2-3 słowa opisujące zastosowanie",
    "secondary": "2-3 słowa opisujące zastosowanie",
    "accent": "2-3 słowa opisujące zastosowanie"
  },
  "typography_guidelines": {
    "heading": "opis zastosowania fontu nagłówkowego",
    "body": "opis zastosowania fontu treści",
    "rules": ["zasada 1", "zasada 2"]
  },
  "imagery_guidelines": {
    "do_list": ["zasada 1", "zasada 2", "zasada 3", "zasada 4"],
    "dont_list": ["zasada 1", "zasada 2", "zasada 3", "zasada 4"],
    "style_description": "Jedno zdanie opisujące idealny styl wizualny"
  },
  "tone_of_voice": {
    "description": "2 zdania o tym, jak marka się komunikuje",
    "do_list": ["rób 1", "rób 2", "rób 3"],
    "dont_list": ["nie rób 1", "nie rób 2", "nie rób 3"],
    "example_phrases": ["fraza 1", "fraza 2", "fraza 3"]
  }
}`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  let content: Record<string, unknown>;
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    content = JSON.parse(text);
  } catch (e) {
    console.error('Brandbook generation error:', e);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }

  const updatedBsd = {
    ...bsd,
    brandbook_content: content,
    brandbook_generated_at: new Date().toISOString(),
  };

  await getDb()`UPDATE projects SET brand_scan_data = ${JSON.stringify(updatedBsd)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;

  return NextResponse.json({ content, url: `/brandbook` });
}
