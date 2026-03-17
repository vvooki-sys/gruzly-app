export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const getDb = () => neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

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

  const prompt = `You are a brand strategist. Generate brand guidelines content based on this brand data.
Write in the SAME LANGUAGE as the brand's website (detect from description/keywords — if Polish brand, write in Polish; if English, write in English).

Brand data:
${JSON.stringify(brandBookData, null, 2)}

Generate the following sections. Return ONLY valid JSON, no markdown, no explanation:
{
  "hero": {
    "tagline": "A bold 5-8 word brand tagline",
    "description": "2-3 sentence brand positioning statement"
  },
  "mission": "1-2 sentences about what the brand does and why",
  "vision": "1-2 sentences about where the brand is heading",
  "values": [
    { "name": "Value Name", "description": "One-line description" }
  ],
  "logo_guidelines": {
    "usage_rules": ["rule 1", "rule 2", "rule 3"],
    "do_list": ["thing to do 1", "thing to do 2", "thing to do 3"],
    "dont_list": ["thing to avoid 1", "thing to avoid 2", "thing to avoid 3"]
  },
  "color_descriptions": {
    "primary": "2-3 word usage description",
    "secondary": "2-3 word usage description",
    "accent": "2-3 word usage description"
  },
  "typography_guidelines": {
    "heading": "usage description for heading font",
    "body": "usage description for body font",
    "rules": ["rule 1", "rule 2"]
  },
  "imagery_guidelines": {
    "do_list": ["rule 1", "rule 2", "rule 3", "rule 4"],
    "dont_list": ["rule 1", "rule 2", "rule 3", "rule 4"],
    "style_description": "One sentence describing ideal visual style"
  },
  "tone_of_voice": {
    "description": "2 sentences about how the brand communicates",
    "do_list": ["do 1", "do 2", "do 3"],
    "dont_list": ["dont 1", "dont 2", "dont 3"],
    "example_phrases": ["phrase 1", "phrase 2", "phrase 3"]
  }
}`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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

  return NextResponse.json({ content, url: `/brandbook/${projectId}` });
}
