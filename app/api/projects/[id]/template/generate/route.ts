import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

const FORMAT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  fb_post: { width: 1080, height: 1080 },
  ln_post: { width: 1200, height: 628 },
  story:   { width: 1080, height: 1920 },
  banner:  { width: 1200, height: 400 },
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { format = 'fb_post' } = await req.json();
  const projectId = parseInt(id);

  const [project] = await sql`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sections = (project.brand_sections || []) as Array<{ title: string; content: string }>;
  const rules = project.brand_rules || '';
  const dims = FORMAT_DIMENSIONS[format] || FORMAT_DIMENSIONS.fb_post;

  const brandContext = sections
    .map(s => `[${s.title}]: ${s.content}`)
    .join('\n');

  if (!brandContext) {
    return NextResponse.json({ error: 'No brand sections — analyze brand first' }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are a graphic design system engineer. Based on the brand identity data below, generate a precise template layout JSON for a ${dims.width}x${dims.height}px social media graphic.

BRAND IDENTITY:
${brandContext}

BRAND RULES:
${rules}

FORMAT: ${dims.width}x${dims.height}px

Generate a JSON object matching this TypeScript interface exactly (all pixel values as numbers):

interface TemplateLayout {
  background: { type: 'solid' | 'gradient'; color?: string; gradientFrom?: string; gradientTo?: string; gradientDirection?: 'top-bottom' | 'left-right' | 'diagonal' };
  whiteSpace: { enabled: boolean; position: 'bottom' | 'top'; height: number; borderRadius: number };
  logo: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; size: number; margin: number; variant: 'light' | 'dark' };
  cta: { enabled: boolean; position: 'below-copy' | 'bottom-center' | 'bottom-right'; backgroundColor: string; textColor: string; borderRadius: number; fontSize: number; defaultText: string };
  copy: { position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center'; alignment: 'left' | 'right' | 'center'; fontFamily: string; headlineFontWeight: number; headlineFontSize: number; headlineColor: string; subtextFontWeight: number; subtextFontSize: number; subtextColor: string; textTransform: 'none' | 'lowercase' | 'uppercase'; letterSpacing: number; lineHeight: number; margin: number };
  centralElement: { type: 'circle' | 'rectangle' | 'full'; position: 'center' | 'left' | 'right'; size: number; borderRadius?: number; mask?: boolean };
  decoration: { enabled: boolean; type: 'blob' | 'circle' | 'ring' | 'none'; position: 'bottom-right' | 'top-left' | 'edge'; color?: string; size: number };
  padding: { top: number; right: number; bottom: number; left: number };
  legal: { enabled: boolean; position: 'bottom-white' | 'bottom-overlay'; fontSize: number; color: string };
  sticker: { enabled: boolean; shape: 'circle' | 'rounded-rect'; position: 'top-right' | 'top-left' | 'custom'; backgroundColor: string; textColor: string; fontSize: number; borderRadius?: number };
}

RULES:
- Return ONLY valid JSON — no markdown, no explanation, no text outside JSON
- Use exact hex colors from brand identity
- All pixel values scaled to ${dims.width}x${dims.height} format
- Follow brand rules strictly`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('') || '';

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const layout = JSON.parse(cleaned);

    const [template] = await sql`
      INSERT INTO templates (project_id, name, format, width, height, layout)
      VALUES (${projectId}, ${format + ' – ' + project.name}, ${format}, ${dims.width}, ${dims.height}, ${JSON.stringify(layout)}::jsonb)
      RETURNING *
    `;

    return NextResponse.json({ template, layout });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Template generation error:', msg);
    return NextResponse.json({ error: msg.substring(0, 200) }, { status: 500 });
  }
}
