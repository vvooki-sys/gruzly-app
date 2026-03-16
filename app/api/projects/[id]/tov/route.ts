import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  type BrandSec = { title: string; content: string; order: number };
  const brandSections: BrandSec[] = project.brand_sections || [];

  const brandContext = brandSections.length > 0
    ? [...brandSections]
        .sort((a, b) => a.order - b.order)
        .map(s => `[${s.title.toUpperCase()}]\n${s.content}`)
        .join('\n\n')
    : (project.brand_analysis || '');

  if (!brandContext) {
    return NextResponse.json({ error: 'No brand analysis — run brand analysis first' }, { status: 400 });
  }

  const prompt = `Based on this brand identity analysis for "${project.name}", define the brand's tone of voice in 3-5 sentences.
Cover: communication style, emotional register, vocabulary choices, what to avoid.
Write in Polish. Be specific and actionable — this will directly guide a copywriter.
${project.brand_rules ? `\nBrand rules:\n${project.brand_rules}` : ''}

Brand identity:
${brandContext}

Return ONLY the tone of voice description — no JSON, no headers, just the plain text paragraph(s).`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const tov = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('') || '';

    if (!tov) throw new Error('Empty response');

    return NextResponse.json({ tov: tov.trim() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.substring(0, 200) }, { status: 500 });
  }
}
