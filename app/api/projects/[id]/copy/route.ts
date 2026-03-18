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

  const copyPrompt = `[STEP 1 — BRIEF TYPE DETECTION]
Before writing anything, classify the client brief as ONE of:
- MARKETING: product/service promotion, campaign, offer, external audience, lead gen, awareness
- HUMAN VOICE: team/employee communication, holiday wishes, birthday, anniversary, celebration, thank-you, internal culture moment, any message directed at your own people

This classification is mandatory and overrides all other instructions.

════════════════════════════════════════
MARKETING MODE
════════════════════════════════════════
Framework: P-A-S (Problem → Agitation → Solution) or A-I-D-A.
Voice: Direct Response — concrete specifics, zero corporate adjectives.
Banned words: "comprehensive", "innovative", "leverage", "key", "synergy", "in today's world".

════════════════════════════════════════
HUMAN VOICE MODE
════════════════════════════════════════
Drop all marketing frameworks. You are a person writing to people they actually like.

Rules — violating these ruins the output:
- Write how humans talk: short sentences, natural rhythm, direct
- If the brief mentions a specific element (animal, symbol, metaphor) — USE IT. Do not replace it with something "more sophisticated".
- Humor: use it when the brief has playful energy. Earned humor, not puns.
- Emoji: 1-2 max, only where they add warmth or act as punctuation. Not decoration.
- "cta" field: closing sentiment, not a button label. "Wesołych Świąt!" is valid. "Kliknij tutaj!" is not.
- Sign-off: brand name only. Never "Brand Team", "Brand Communication", or any corporate suffix.
- Forbidden phrases: "zasłużona odnowa", "doceniamy waszą pasję", "słodka regeneracja", "wiosenna nadzieja", anything that sounds like an HR newsletter.

════════════════════════════════════════

BRAND IDENTITY:
${brandDna}

TONE OF VOICE:
${tov}

CLIENT BRIEF:
${briefText || '[No brief provided — generate based on brand identity]'}

FORMAT: ${formatDesc}

════════════════════════════════════════
YOUR OUTPUT:

1. CONCEPT — The single idea. What emotion does it create? (1-2 sentences, English OK)

2. CREATIVE BRIEF — For the graphic designer. Mood and visual metaphor ONLY.
   2-4 sentences. NO logo instructions, NO hex colors, NO layout rules, NO composition directions.

3. THREE VARIANTS. For each:
   - "headline": MAX 8 words. Standalone statement. Works on a graphic without context.
   - "subtext": MAX 15 words. Graphic caption — one thought, not a paragraph. Complements headline, doesn't explain it.
   - "cta": MAX 4 words. MARKETING=button label. HUMAN VOICE=closing sentiment.
   - "post_copy": The actual social media post body (3-6 sentences). Lives OUTSIDE the graphic. Write as if the brand manager typed it right now — in the brand's real voice, matching the mode (marketing or human). Include emoji if appropriate for the brand.
   - "rationale": MAX 8 words. Single key creative decision. Nothing else.

Return ONLY valid JSON, no markdown, no explanation:
{
  "concept": "...",
  "creative_brief": "...",
  "variants": [
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." }
  ]
}

Write ALL copy in the same language as the client brief. These instructions are in English — internal guidance only.`;

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
