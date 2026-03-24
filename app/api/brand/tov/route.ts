export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  const projectId = BRAND_ID;

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
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

  const prompt = `Na podstawie tej analizy identyfikacji marki "${project.name}", zdefiniuj ton głosu marki w 3-5 zdaniach.
Opisz: styl komunikacji, rejestr emocjonalny, wybór słownictwa, czego unikać.
Pisz po polsku. Bądź konkretny i praktyczny — to bezpośrednio poprowadzi copywritera.
${project.brand_rules ? `\nZasady marki:\n${project.brand_rules}` : ''}

Identyfikacja marki:
${brandContext}

Zwróć WYŁĄCZNIE opis tonu głosu — bez JSON, bez nagłówków, tylko zwykłe akapity tekstu.`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
