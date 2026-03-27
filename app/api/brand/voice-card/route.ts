export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemPrompt } from '@/lib/system-prompts';

export const maxDuration = 60;

// POST /api/brand/voice-card — analyze samples, generate Voice Card
export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;

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

  const FALLBACK_ANALYZER = `Jesteś światowej klasy lingwistą marki i strategiem komunikacji. Twoim zadaniem jest odtworzenie unikalnego głosu i tonu marki na podstawie prawdziwych próbek treści.

Otrzymasz próbki tekstów marki (posty w social media, teksty ze strony www, e-maile, opisy kampanii). Na ich podstawie wyodrębnij precyzyjną Voice Card — profil czytelny maszynowo, który pozwoli AI pisać NOWE treści nieodróżnialne od autentycznego głosu marki.

## FRAMEWORK ANALIZY

Przeanalizuj każdy wymiar w skali 1-10 z konkretnymi dowodami:

### 1. SPEKTRUM FORMALNOŚCI (1=slang uliczny, 10=dokument prawny)
Gdzie dokładnie na spektrum? Czy zmienia się w zależności od kontekstu? Zacytuj 2 przykłady.

### 2. CIEPŁO I DYSTANS (1=zimny korporat, 10=najlepszy przyjaciel)
Jak marka traktuje czytelnika? Dynamika władzy: równy, wyżej czy niżej?

### 3. ARCHITEKTURA ZDAŃ
Średnia długość zdania, struktura akapitów, rytm, urywki, pytania.

### 4. DNA SŁOWNICTWA
Charakterystyczne słowa/frazy (pojawiające się 3+ razy), słowa-klucze, słowa zakazane, poziom żargonu, mieszanie języków.

### 5. REJESTR EMOCJONALNY
Główna emocja, styl humoru, typ autorytetu, emocjonalne minimum i maksimum.

### 6. WZORCE STRUKTURALNE
Jak ZACZYNAJĄ? Jak KOŃCZĄ? Narzędzia podkreślania? Łamanie linii?

### 7. EMOJI I INTERPUNKCJA WIZUALNA
Częstotliwość, które emoji i w jakiej funkcji, inne elementy wizualne.

### 8. OSOBA I ZWRACANIE SIĘ
Ja czy my? Ty czy wy? Jak zwracają się do ludzi?

### 9. STYL PERSWAZJI
Jak przekonują? Poziom bezpośredniości, użycie kwalifikatorów.

### 10. TABU I ANTY-WZORCE
Czego ta marka NIGDY nie robi? Co natychmiast brzmiałoby nie-na-miejscu?

## KRYTYCZNE INSTRUKCJE
1. Bądź KONKRETNY. "Luźny ton" jest bezużyteczne. "Używa urywków zdań dla podkreślenia, naturalnie miesza polski z angielskimi terminami technicznymi" jest użyteczne.
2. Każde twierdzenie musi mieć DOWÓD z próbek. Cytuj konkretne frazy.
3. Voice Card musi być OPERACYJNA — inne AI czytające tylko tę kartę powinno tworzyć treści nieodróżnialne od oryginału.
4. Lista tabu jest TAK SAMO WAŻNA jak pozytywne wzorce.
5. Zwróć CAŁĄ treść (opisy, podsumowania, przykłady) po polsku.`;

  const FALLBACK_JSON_SCHEMA = `{
  "brand_name": "",
  "voice_summary": "Jedno zdanie oddające cały głos marki",
  "archetype": "Archetyp komunikacji (np. 'Ciepły autorytet', 'Prowokujący ekspert', 'Skromny lider')",
  "dimensions": {
    "formality": {"score": 0, "description": ""},
    "warmth": {"score": 0, "description": ""},
    "humor": {"score": 0, "description": ""},
    "authority": {"score": 0, "description": ""},
    "directness": {"score": 0, "description": ""}
  },
  "sentence_style": { "avg_length": "short|medium|long", "structure": "", "rhythm": "", "fragments_ok": true, "questions_frequency": "never|rare|moderate|frequent" },
  "vocabulary": { "signature_phrases": [], "power_words": [], "forbidden_words": [], "jargon_level": "none|light|moderate|heavy", "english_mixing": "never|rare|moderate|frequent" },
  "emoji_usage": { "frequency": "never|surgical|decorative|heavy", "function": "", "preferred_emoji": [], "emoji_rules": "" },
  "person_address": { "self_reference": "I|we|brand name|mixed", "audience_address": "singular you|plural you|name|mixed", "name_usage": "" },
  "structure_patterns": { "opening_style": "", "closing_style": "", "paragraph_density": "spacious|moderate|dense", "emphasis_tools": [] },
  "persuasion": { "primary_method": "", "qualifier_usage": "", "directness_level": "" },
  "taboos": [], "golden_rules": [], "example_good": [], "example_bad": []
}`;

  const analyzerFramework = await getSystemPrompt('vc.analyzer_prompt', FALLBACK_ANALYZER);
  const jsonSchema = await getSystemPrompt('vc.json_schema', FALLBACK_JSON_SCHEMA);

  const analyzerPrompt = `${analyzerFramework}

## PRÓBKI OD: ${project.name}

${samplesText}

Zwróć WYŁĄCZNIE poprawny JSON, bez markdown, bez wyjaśnień:
${jsonSchema.replace(/"brand_name": ""/, `"brand_name": "${project.name}"`)}`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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

// PATCH /api/brand/voice-card — save edited Voice Card
export async function PATCH(req: NextRequest) {
  const projectId = BRAND_ID;
  const { voiceCard } = await req.json();
  if (!voiceCard) return NextResponse.json({ error: 'voiceCard required' }, { status: 400 });
  await getDb()`UPDATE projects SET voice_card = ${JSON.stringify(voiceCard)}::jsonb WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}

// DELETE /api/brand/voice-card — remove Voice Card
export async function DELETE(_req: NextRequest) {
  const projectId = BRAND_ID;
  await getDb()`UPDATE projects SET voice_card = NULL WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}
