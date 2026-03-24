export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
  const formData = await req.formData();

  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const format = formData.get('format') as string || 'general';
  const visualType = formData.get('visualType') as string || 'graphic'; // 'graphic' | 'photo' | 'photo_text'

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

  const formatMap: Record<string, { name: string; copyGuide: string }> = {
    facebook: {
      name: 'Facebook',
      copyGuide: 'Post na FB: 1-3 krótkie akapity, angażujący ton, emoji OK ale z umiarem, wyraźne CTA. Optymalnie 80-150 słów.',
    },
    linkedin: {
      name: 'LinkedIn',
      copyGuide: 'Post na LinkedIn: profesjonalny ale ludzki ton, oparty na insightach/wartości, bez nadmiaru emoji, storytelling mile widziany. Optymalnie 100-200 słów. Może być dłuższy jeśli treść tego wymaga.',
    },
    instagram: {
      name: 'Instagram',
      copyGuide: 'Caption na Instagram: chwytliwy pierwszy wiersz (hook), krótka treść, hashtagi na końcu (5-10 trafnych). Optymalnie 50-120 słów + hashtagi.',
    },
    general: {
      name: 'Social media',
      copyGuide: 'Uniwersalny post social media. Optymalnie 80-150 słów.',
    },
  };
  const formatInfo = formatMap[format] || formatMap['general'];

  const visualBriefInstructions: Record<string, string> = {
    graphic: `BRIEF DLA GRAFIKA:
   Napisz brief kreatywny (3-5 zdań). Opisz:
   - Nastrój i emocja grafiki
   - Wizualna metafora / motyw przewodni
   - Typ ilustracji (abstrakcyjna, ikonograficzna, typograficzna, kolażowa...)
   - Sugerowana atmosfera
   BEZ instrukcji logo, BEZ kolorów hex, BEZ zasad layoutu — to brief na koncept wizualny.`,
    photo: `BRIEF DLA FOTOGRAFA:
   Napisz szczegółowy brief fotograficzny (3-5 zdań). Opisz:
   - Typ zdjęcia (packshot, lifestyle, flatlay, portret, reportaż...)
   - Kadrowanie i kompozycja
   - Oświetlenie i mood (naturalne, studyjne, ciepłe, zimne...)
   - Stylizacja / props / tło
   - Inspiracja / referencja nastroju
   BEZ kolorów marki, BEZ logo — to brief na samo zdjęcie. Na tym zdjęciu NIE będzie żadnego tekstu.`,
    photo_text: `BRIEF DLA FOTOGRAFA (zdjęcie pod tekst):
   Napisz brief fotograficzny (3-5 zdań). Opisz:
   - Typ zdjęcia (packshot, lifestyle, flatlay, portret, reportaż...)
   - Kadrowanie i kompozycja — UWZGLĘDNIJ przestrzeń na nałożenie tekstu (np. jasna/ciemna strefa, bokeh, negatywna przestrzeń)
   - Oświetlenie i mood (naturalne, studyjne, ciepłe, zimne...)
   - Stylizacja / props / tło
   Zadbaj o to, żeby zdjęcie dobrze działało jako tło pod tekst — wskaż gdzie tekst powinien być umieszczony.`,
  };
  const visualBriefInstruction = visualBriefInstructions[visualType] || visualBriefInstructions['graphic'];

  const copyPrompt = `Jesteś doświadczonym copywriterem i strategiem komunikacji. Tworzysz treści w głosie marki.

════════════════════════════════════════
KROK 1 — WYKRYJ TYP KOMUNIKACJI
════════════════════════════════════════
Zaklasyfikuj zadanie klienta jako:
- MARKETING: promocja, kampania, oferta, produkt, lead gen, budowanie świadomości
- LUDZKI GŁOS: życzenia, podziękowania, kultura firmy, komunikacja wewnętrzna, celebracja

════════════════════════════════════════
ZASADY PISANIA
════════════════════════════════════════
MARKETING:
- Framework P-A-S (Problem → Agitacja → Rozwiązanie) lub A-I-D-A
- Konkrety, zero korporacyjnych przymiotników
- Zakazane: "kompleksowy", "innowacyjny", "kluczowy", "synergia", "w dzisiejszym świecie"

LUDZKI GŁOS:
- Porzuć frameworki. Pisz jak człowiek do człowieka.
- Krótkie zdania, naturalny rytm, autentyczność
- Emoji: maks. 1-2, tam gdzie dodają ciepła
- Podpis: nazwa marki, nigdy "Zespół...", "Dział..."
- Zakazane: "zasłużona odnowa", "doceniamy waszą pasję", cokolwiek z newslettera HR

════════════════════════════════════════
TOŻSAMOŚĆ MARKI:
${brandDna}

TON KOMUNIKACJI:
${tov}
${voiceCardBlock}

════════════════════════════════════════
ZADANIE KLIENTA:
${briefText || '[Brak zadania — generuj na podstawie tożsamości marki]'}

PLATFORMA: ${formatInfo.name}
WYTYCZNE: ${formatInfo.copyGuide}
TYP WIZUALA: ${{ graphic: 'Grafika (z tekstem)', photo: 'Zdjęcie (bez tekstu)', photo_text: 'Zdjęcie z nałożonym tekstem' }[visualType] || 'Grafika'}

════════════════════════════════════════
TWÓJ OUTPUT — 3 WARIANTY

Dla każdego wariantu wygeneruj:

1. "post_copy" — Gotowy tekst posta do opublikowania. Napisz go tak, jakby brand manager wpisał go właśnie teraz. W głosie marki, odpowiedniej długości dla platformy. To jest GŁÓWNY output.

2. "visual_brief" — ${visualBriefInstruction}

${visualType === 'photo' ? `UWAGA: Typ wizuala to CZYSTE ZDJĘCIE — bez żadnego tekstu na obrazie. NIE generuj headline, subtext ani cta. Ustaw je na puste stringi "".` : `3. "headline" — MAKS. 8 słów. Tekst na ${visualType === 'photo_text' ? 'zdjęcie' : 'grafikę'}. Samodzielne stwierdzenie, chwytliwe i zwięzłe.

4. "subtext" — MAKS. 15 słów. Podpis pod nagłówkiem. Uzupełnia go, nie wyjaśnia.

5. "cta" — MAKS. 4 słowa. Etykieta CTA lub końcowy sentyment.`}

6. "rationale" — MAKS. 10 słów. Dlaczego ten wariant zadziała.

Zwróć WYŁĄCZNIE poprawny JSON:
{
  "concept": "Jeden pomysł, jedna emocja (1-2 zdania)",
  "variants": [
    { "post_copy": "...", "visual_brief": "...", "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." },
    { "post_copy": "...", "visual_brief": "...", "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." },
    { "post_copy": "...", "visual_brief": "...", "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." }
  ]
}

Pisz CAŁY tekst po polsku.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userContent: any[] = [];

    if (filePart) {
      userContent.push({ type: 'text', text: 'Poniżej brief w formie dokumentu PDF:' });
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: filePart.inlineData.data },
      });
    }

    userContent.push({ type: 'text', text: copyPrompt });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: userContent }],
    });

    const responseText = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('');

    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      results: parsed.variants || [],
      concept: parsed.concept || '',
      visualType,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Copy generation error:', msg);
    return NextResponse.json({ error: 'Copy generation failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
