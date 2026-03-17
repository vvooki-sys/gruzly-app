export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;
const getDb = () => neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const formData = await req.formData();

  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const format = formData.get('format') as string || 'general';

  if (!file && !text) {
    return NextResponse.json({ error: 'file or text required' }, { status: 400 });
  }

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Prepare brief text
  let briefText = text || '';
  let filePart: { inlineData: { data: string; mimeType: string } } | null = null;

  if (file) {
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = file.type;

    if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
      filePart = { inlineData: { data: base64, mimeType: 'application/pdf' } };
    } else if (mimeType === 'text/plain') {
      briefText = Buffer.from(buffer).toString('utf-8');
    } else {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
        briefText = result.value;
      } catch {
        briefText = '[DOCX content could not be parsed]';
      }
    }
  }

  // Brand DNA
  type BrandSec = { title: string; content: string; order: number };
  const brandSections: BrandSec[] = project.brand_sections || [];
  const brandDna = brandSections.length > 0
    ? [...brandSections].sort((a, b) => a.order - b.order).map(s => `[${s.title.toUpperCase()}]\n${s.content}`).join('\n\n')
    : (project.brand_analysis || `Brand: ${project.name}`);

  const tov = project.tone_of_voice || 'Professional, creative, impactful. Stay true to the brand identity.';

  const formatMap: Record<string, string> = {
    facebook: 'Facebook post (engaging, 1-3 short paragraphs, emoji OK, clear CTA)',
    linkedin: 'LinkedIn post (professional tone, insight-driven, no excessive emoji)',
    instagram: 'Instagram caption (punchy headline, short body, hashtag space at end)',
    general: 'general social media post (versatile, works across platforms)',
    ogólny: 'general social media post (versatile, works across platforms)',
  };
  const formatDesc = formatMap[format] || formatMap['general'];

  const copyPrompt = `You are a senior creative director at a top-tier marketing agency.
Your job is not just to write copy — you CONCEIVE the idea and direct the visual.

BRAND IDENTITY:
${brandDna}

TONE OF VOICE:
${tov}

CLIENT BRIEF:
${briefText || '[No brief provided — generate based on brand identity]'}

FORMAT: ${formatDesc}

YOUR TASK:

1. CONCEPT — Define a single creative idea that drives this communication.
   What's the hook? What emotion does it trigger? (1-2 sentences)

2. CREATIVE BRIEF — Describe the emotional/conceptual direction for this graphic.
   Focus ONLY on:
   - The mood, atmosphere, feeling the image should evoke
   - The visual story or metaphor (what scene, what moment, what emotion)
   - What to avoid in terms of tone or associations
   (2-4 sentences max)

   STRICT RULES — these will BREAK the output if violated:
   - NO logo placement, NO "logo in corner", NO brand mark instructions
   - NO hex color codes, NO specific brand colors, NO background color specs
   - NO layout instructions (no "place X in Y corner", no composition rules)
   - NO branding or technical design guidance of any kind
   Brand identity, colors, logo placement are handled separately by the design system.
   The brief is ONLY about mood, concept, and emotional direction.

3. COPY VARIANTS — Write 3 variants. Each variant must:
   - Match the concept
   - Respect the tone of voice
   - Be in the same language as the client brief
   - Feel like it was written by a human who understands the brand

   COPY LENGTH RULES — these are non-negotiable:
   - "headline": MAX 8 words. Punchy, memorable, works as a standalone statement on a graphic.
   - "subtext": MAX 15 words / 1 short sentence. This is a GRAPHIC CAPTION, not post body copy.
     It must complement the headline, not explain or expand it into a paragraph.
     Think tagline, not description. If you can't say it in 15 words — cut it.
   - "cta": MAX 4 words. A button label, not a sentence.

   The full post copy (LinkedIn post body, Facebook post description) belongs OUTSIDE the graphic.
   The graphic carries only: headline + one short supporting line + CTA.

Return ONLY valid JSON, no markdown, no explanation:
{
  "concept": "...",
  "creative_brief": "...",
  "variants": [
    { "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." }
  ]
}

Write copy in the same language as the client brief. These instructions are in English — that is fine, keep them as internal guidance only.`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
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

    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // Return new format if present, fallback for backward compat
    if (parsed.variants) {
      return NextResponse.json({
        results: parsed.variants,
        concept: parsed.concept || '',
        creative_brief: parsed.creative_brief || '',
      });
    }
    // Old format fallback (plain array)
    return NextResponse.json({ results: Array.isArray(parsed) ? parsed : [] });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Copy generation error:', msg);
    return NextResponse.json({ error: 'Copy generation failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
