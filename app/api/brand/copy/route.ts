export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
  const formData = await req.formData();

  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const format = formData.get('format') as string || 'general';

  if (!file && !text) {
    return NextResponse.json({ error: 'file or text required' }, { status: 400 });
  }

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
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

  // Voice Card injection block — overrides generic ToV when present
  type VoiceCard = {
    voice_summary?: string; archetype?: string;
    golden_rules?: string[]; taboos?: string[];
    sentence_style?: { structure?: string };
    emoji_usage?: { emoji_rules?: string };
    person_address?: { self_reference?: string; audience_address?: string };
    vocabulary?: { forbidden_words?: string[]; signature_phrases?: string[] };
    example_good?: string[]; example_bad?: string[];
  };
  const vc: VoiceCard | null = project.voice_card || null;
  const voiceCardBlock = vc ? `
════════════════════════════════════════
KARTA GŁOSU MARKI (najwyższy priorytet — nadpisuje wszystkie ogólne instrukcje tonalne)
════════════════════════════════════════
Archetyp: ${vc.archetype || ''}
Głos: ${vc.voice_summary || ''}

Złote Zasady (niepodlegające negocjacji):
${(vc.golden_rules || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Styl:
- Zdania: ${vc.sentence_style?.structure || ''}
- Emoji: ${vc.emoji_usage?.emoji_rules || ''}
- Odwołanie do siebie: ${vc.person_address?.self_reference || ''}
- Zwracanie się do odbiorcy: ${vc.person_address?.audience_address || ''}
${vc.vocabulary?.forbidden_words?.length ? `- Zakazane słowa: ${vc.vocabulary.forbidden_words.join(', ')}` : ''}
${vc.vocabulary?.signature_phrases?.length ? `- Firmowe frazy: ${vc.vocabulary.signature_phrases.join(', ')}` : ''}

TABU — marka NIGDY tego nie robi:
${(vc.taboos || []).map(t => `• ${t}`).join('\n')}

Marka BRZMI TAK (wzorcowy styl):
${(vc.example_good || []).map(e => `→ "${e}"`).join('\n')}

Marka NIGDY NIE BRZMI TAK (anty-wzorzec):
${(vc.example_bad || []).map(e => `✗ "${e}"`).join('\n')}
════════════════════════════════════════` : '';

  const formatMap: Record<string, string> = {
    facebook: 'Post na Facebooka (angażujący, 1-3 krótkie akapity, emoji OK, wyraźne CTA)',
    linkedin: 'Post na LinkedIn (profesjonalny ton, oparty na insightach, bez nadmiaru emoji)',
    instagram: 'Opis na Instagram (chwytliwy nagłówek, krótka treść, miejsce na hashtagi na końcu)',
    general: 'ogólny post w social media (uniwersalny, działa na różnych platformach)',
    ogólny: 'ogólny post w social media (uniwersalny, działa na różnych platformach)',
  };
  const formatDesc = formatMap[format] || formatMap['general'];

  const copyPrompt = `[KROK 1 — WYKRYWANIE TYPU BRIEFU]
Zanim cokolwiek napiszesz, zaklasyfikuj brief klienta jako JEDEN z:
- MARKETING: promocja produktu/usługi, kampania, oferta, odbiorcy zewnętrzni, generowanie leadów, budowanie świadomości
- LUDZKI GŁOS: komunikacja zespołowa/pracownicza, życzenia świąteczne, urodziny, rocznica, celebracja, podziękowania, moment kultury wewnętrznej, każda wiadomość skierowana do własnych ludzi

Ta klasyfikacja jest obowiązkowa i nadpisuje wszystkie inne instrukcje.

════════════════════════════════════════
TRYB MARKETINGOWY
════════════════════════════════════════
Framework: P-A-S (Problem → Agitacja → Rozwiązanie) lub A-I-D-A.
Głos: Direct Response — konkrety, zero korporacyjnych przymiotników.
Zakazane słowa: "comprehensive", "innovative", "leverage", "key", "synergy", "in today's world", "kompleksowy", "innowacyjny", "kluczowy", "synergia", "w dzisiejszym świecie".

════════════════════════════════════════
TRYB LUDZKIEGO GŁOSU
════════════════════════════════════════
Porzuć wszystkie frameworki marketingowe. Jesteś osobą piszącą do ludzi, których naprawdę lubisz.

Zasady — złamanie ich psuje wynik:
- Pisz jak ludzie mówią: krótkie zdania, naturalny rytm, bezpośrednio
- Jeśli brief wspomina konkretny element (zwierzę, symbol, metaforę) — UŻYJ GO. Nie zamieniaj na coś "bardziej wyrafinowanego".
- Humor: stosuj, gdy brief ma zabawną energię. Naturalny humor, nie kalambury.
- Emoji: maks. 1-2, tylko tam gdzie dodają ciepła lub działają jak interpunkcja. Nie jako dekoracja.
- Pole "cta": końcowy sentyment, nie etykieta przycisku. "Wesołych Świąt!" jest OK. "Kliknij tutaj!" nie jest.
- Podpis: tylko nazwa marki. Nigdy "Zespół Marki", "Dział Komunikacji" ani żaden korporacyjny przyrostek.
- Zakazane frazy: "zasłużona odnowa", "doceniamy waszą pasję", "słodka regeneracja", "wiosenna nadzieja", cokolwiek brzmiące jak newsletter HR.

════════════════════════════════════════

TOŻSAMOŚĆ MARKI:
${brandDna}

TON KOMUNIKACJI:
${tov}
${voiceCardBlock}
BRIEF KLIENTA:
${briefText || '[Brak briefu — generuj na podstawie tożsamości marki]'}

FORMAT: ${formatDesc}

════════════════════════════════════════
TWÓJ OUTPUT:

1. CONCEPT — Pojedynczy pomysł. Jaką emocję wywołuje? (1-2 zdania)

2. CREATIVE BRIEF — Dla grafika. TYLKO nastrój i wizualna metafora.
   2-4 zdania. BEZ instrukcji logo, BEZ kolorów hex, BEZ zasad layoutu, BEZ wskazówek kompozycji.

3. TRZY WARIANTY. Dla każdego:
   - "headline": MAKS. 8 słów. Samodzielne stwierdzenie. Działa na grafice bez kontekstu.
   - "subtext": MAKS. 15 słów. Podpis grafiki — jedna myśl, nie akapit. Uzupełnia nagłówek, nie wyjaśnia go.
   - "cta": MAKS. 4 słowa. MARKETING=etykieta przycisku. LUDZKI GŁOS=końcowy sentyment.
   - "post_copy": Właściwa treść posta w social media (3-6 zdań). Żyje POZA grafiką. Pisz jakby brand manager wpisał to właśnie teraz — prawdziwym głosem marki, dopasowanym do trybu (marketing lub ludzki). Dodaj emoji jeśli pasują do marki.
   - "rationale": MAKS. 8 słów. Jedna kluczowa decyzja kreatywna. Nic więcej.

Zwróć WYŁĄCZNIE poprawny JSON, bez markdown, bez wyjaśnień:
{
  "concept": "...",
  "creative_brief": "...",
  "variants": [
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." },
    { "headline": "...", "subtext": "...", "cta": "...", "post_copy": "...", "rationale": "..." }
  ]
}

Pisz CAŁY tekst po polsku.`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
