export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;
const getDb = () => neon(process.env.DATABASE_URL!);

// POST /api/projects/[id]/voice-card — analyze samples, generate Voice Card
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const { samples } = await req.json();
  if (!samples || !Array.isArray(samples) || samples.filter((s: unknown) => typeof s === 'string' && s.trim()).length < 3) {
    return NextResponse.json({ error: 'At least 3 text samples required' }, { status: 400 });
  }

  const [project] = await getDb()`SELECT name FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const samplesText = (samples as string[])
    .filter(s => typeof s === 'string' && s.trim())
    .map((s, i) => `[${i + 1}] ${s.trim()}`)
    .join('\n\n');

  const analyzerPrompt = `You are a world-class brand linguist and communication strategist. Your job is to reverse-engineer a brand's unique voice and tone from real content samples.

You will receive text samples from a brand (social media posts, website copy, emails, campaign descriptions). From these samples, extract a precise Voice Card — a machine-readable profile that allows AI to write NEW content indistinguishable from the brand's authentic voice.

## ANALYSIS FRAMEWORK

Analyze each dimension on a 1-10 scale with concrete evidence:

### 1. FORMALITY SPECTRUM (1=street talk, 10=legal document)
Where exactly on the spectrum? Does it shift between contexts? Quote 2 examples.

### 2. WARMTH & DISTANCE (1=cold corporate, 10=best friend)
How does the brand treat the reader? Power dynamic: equal, above, or below?

### 3. SENTENCE ARCHITECTURE
Average sentence length, paragraph structure, rhythm, fragments, questions.

### 4. VOCABULARY DNA
Signature words/phrases (appear 3+ times), power words, forbidden words, jargon level, language mixing.

### 5. EMOTIONAL REGISTER
Primary emotion, humor style, authority type, emotional floor and ceiling.

### 6. STRUCTURAL PATTERNS
How do they START? How do they END? Emphasis tools? Line breaks?

### 7. EMOJI & VISUAL PUNCTUATION
Frequency, which emoji and what function, other visual elements.

### 8. PERSON & ADDRESS
I or we? Singular or plural you? How are people addressed?

### 9. PERSUASION STYLE
How do they convince? Directness level, qualifiers used.

### 10. TABOOS & ANTI-PATTERNS
What does this brand NEVER do? What would feel instantly off-brand?

## CRITICAL INSTRUCTIONS
1. Be SPECIFIC. "Casual tone" is useless. "Uses sentence fragments for emphasis, mixes Polish with English tech terms naturally" is useful.
2. Every claim must have EVIDENCE from the samples. Quote specific phrases.
3. The Voice Card must be ACTIONABLE — another AI reading only this card should produce content indistinguishable from the original.
4. Taboos list is AS IMPORTANT as positive patterns.

## SAMPLES FROM: ${project.name}

${samplesText}

Return ONLY valid JSON, no markdown, no explanation:
{
  "brand_name": "${project.name}",
  "voice_summary": "One sentence capturing the entire voice",
  "archetype": "The communication archetype (e.g. 'Warm Authority', 'Provocative Expert', 'Humble Leader')",
  "dimensions": {
    "formality": {"score": 0, "description": ""},
    "warmth": {"score": 0, "description": ""},
    "humor": {"score": 0, "description": ""},
    "authority": {"score": 0, "description": ""},
    "directness": {"score": 0, "description": ""}
  },
  "sentence_style": {
    "avg_length": "short|medium|long",
    "structure": "",
    "rhythm": "",
    "fragments_ok": true,
    "questions_frequency": "never|rare|moderate|frequent"
  },
  "vocabulary": {
    "signature_phrases": [],
    "power_words": [],
    "forbidden_words": [],
    "jargon_level": "none|light|moderate|heavy",
    "english_mixing": "never|rare|moderate|frequent"
  },
  "emoji_usage": {
    "frequency": "never|surgical|decorative|heavy",
    "function": "",
    "preferred_emoji": [],
    "emoji_rules": ""
  },
  "person_address": {
    "self_reference": "I|we|brand name|mixed",
    "audience_address": "singular you|plural you|name|mixed",
    "name_usage": ""
  },
  "structure_patterns": {
    "opening_style": "",
    "closing_style": "",
    "paragraph_density": "spacious|moderate|dense",
    "emphasis_tools": []
  },
  "persuasion": {
    "primary_method": "",
    "qualifier_usage": "",
    "directness_level": ""
  },
  "taboos": [],
  "golden_rules": [],
  "example_good": [],
  "example_bad": []
}`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: analyzerPrompt }] }],
    });

    const text = result.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const voiceCard = JSON.parse(text);

    await getDb()`UPDATE projects SET voice_card = ${JSON.stringify(voiceCard)}::jsonb WHERE id = ${projectId}`;

    return NextResponse.json({ voiceCard });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Voice Card analysis failed:', msg);
    return NextResponse.json({ error: 'Analysis failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}

// PATCH /api/projects/[id]/voice-card — save edited Voice Card
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { voiceCard } = await req.json();
  if (!voiceCard) return NextResponse.json({ error: 'voiceCard required' }, { status: 400 });
  await getDb()`UPDATE projects SET voice_card = ${JSON.stringify(voiceCard)}::jsonb WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/[id]/voice-card — remove Voice Card
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getDb()`UPDATE projects SET voice_card = NULL WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
