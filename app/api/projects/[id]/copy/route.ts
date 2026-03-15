import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;
const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();

  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const format = formData.get('format') as string || 'ogólny';

  if (!file && !text) {
    return NextResponse.json({ error: 'file or text required' }, { status: 400 });
  }

  const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Prepare brief text
  let briefText = text || '';
  let filePart: { inlineData: { data: string; mimeType: string } } | null = null;

  if (file) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;

    if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
      // PDF: send as inlineData
      filePart = { inlineData: { data: base64, mimeType: 'application/pdf' } };
    } else {
      // DOCX: convert to text using mammoth
      // TXT: decode directly
      if (mimeType === 'text/plain') {
        briefText = Buffer.from(buffer).toString('utf-8');
      } else {
        // DOCX — convert via mammoth
        try {
          const mammoth = await import('mammoth');
          const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
          briefText = result.value;
        } catch {
          briefText = '[DOCX content could not be parsed]';
        }
      }
    }
  }

  const brandContext = project.brand_analysis
    ? `Brand context for ${project.name}:\n${project.brand_analysis}`
    : `Brand: ${project.name}`;

  const formatInstructions: Record<string, string> = {
    facebook: 'Facebook post (engaging, 1-3 short paragraphs, emoji OK, CTA at end)',
    linkedin: 'LinkedIn post (professional tone, insight-driven, no excessive emoji)',
    instagram: 'Instagram caption (punchy headline, short body, hashtag space at end)',
    ogólny: 'general social media post (versatile, works across platforms)',
  };

  const copyPrompt = `You are a senior copywriter for a brand communications agency.

${brandContext}

Based on the brief below, write 3 DIFFERENT copy variants for a ${formatInstructions[format] || formatInstructions['ogólny']}.

Each variant must have:
- headline: punchy, attention-grabbing (max 10 words)
- subtext: supporting copy (1-3 sentences)
- cta: call to action (optional, max 5 words)

Return ONLY valid JSON array, no markdown, no explanation:
[
  { "headline": "...", "subtext": "...", "cta": "..." },
  { "headline": "...", "subtext": "...", "cta": "..." },
  { "headline": "...", "subtext": "...", "cta": "..." }
]

BRIEF:
${briefText}`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  // Use text-only model for copy (cheaper, faster)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  try {
    const parts = filePart ? [filePart, { text: copyPrompt }] : [{ text: copyPrompt }];

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const responseText = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('') || '';

    // Parse JSON (handle markdown code blocks)
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const copyResults = JSON.parse(cleaned);

    return NextResponse.json({ results: copyResults });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Copy generation error:', msg);
    return NextResponse.json({ error: 'Copy generation failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
