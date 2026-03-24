export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;

function buildCopyPrompt(project: Record<string, unknown>, briefText: string, format: string, visualType: string) {

  // ══════════════════════════════════════════════════════════════
  // WARSTWA 2 — MARKA (z Settings, brand_sections, Voice Card)
  // ══════════════════════════════════════════════════════════════

  type BrandSec = { title: string; content: string; order: number; id?: string };
  const brandSections: BrandSec[] = (project.brand_sections as BrandSec[]) || [];
  const tonalIds = ['ton_glosu'];
  const identitySections = brandSections
    .filter(s => !tonalIds.includes(s.id || ''))
    .sort((a, b) => a.order - b.order);

  const brandIdentity = identitySections.length > 0
    ? identitySections.map(s => `[${s.title.toUpperCase()}]\n${s.content}`).join('\n\n')
    : ((project.brand_analysis as string) || `Marka: ${project.name}`);

  type VoiceCard = {
    voice_summary?: string; archetype?: string;
    golden_rules?: string[]; taboos?: string[];
    sentence_style?: { structure?: string };
    emoji_usage?: { emoji_rules?: string };
    person_address?: { self_reference?: string; audience_address?: string };
    vocabulary?: { forbidden_words?: string[]; signature_phrases?: string[] };
    example_good?: string[]; example_bad?: string[];
  };
  const vc: VoiceCard | null = (project.voice_card as VoiceCard) || null;

  const voiceBlock = vc ? `
════════════════════════════════════════
GŁOS MARKI
════════════════════════════════════════
Archetyp: ${vc.archetype || ''}
${vc.voice_summary || ''}

Złote zasady (niepodlegające negocjacji):
${(vc.golden_rules || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Styl zdań: ${vc.sentence_style?.structure || ''}
Emoji: ${vc.emoji_usage?.emoji_rules || 'Z umiarem, tam gdzie dodają wartości.'}
Odwołanie do siebie: ${vc.person_address?.self_reference || ''}
Zwracanie się do odbiorcy: ${vc.person_address?.audience_address || ''}
${vc.vocabulary?.forbidden_words?.length ? `Zakazane słowa: ${vc.vocabulary.forbidden_words.join(', ')}` : ''}
${vc.vocabulary?.signature_phrases?.length ? `Firmowe frazy: ${vc.vocabulary.signature_phrases.join(', ')}` : ''}

TABU — marka NIGDY tego nie robi:
${(vc.taboos || []).map(t => `• ${t}`).join('\n')}

Marka BRZMI TAK (wzorzec):
${(vc.example_good || []).map(e => `→ "${e}"`).join('\n')}

Marka NIGDY TAK NIE BRZMI (anty-wzorzec):
${(vc.example_bad || []).map(e => `✗ "${e}"`).join('\n')}` : '';

  // ══════════════════════════════════════════════════════════════
  // WARSTWA 3 — BRANŻOWA (z industry_rules, generowana jednorazowo)
  // ══════════════════════════════════════════════════════════════

  type IR = { banned_cliches?: string[]; banned_marketing_words?: string[]; photo_brief_types?: string[]; language_notes?: string };
  const ir: IR | null = (project.industry_rules as IR) || null;

  // Zakazane wzorce: uniwersalne + branżowe
  const universalBanned = [
    '"to nie jest zwykłe [cokolwiek]"',
    '"zasłużyliście / pozwólcie sobie / dokładnie tego potrzebujesz" — protekcjonalny ton',
    '"uczta dla podniebienia / niebo w gębie / symfonia smaków"',
    '"odkryj nowy wymiar / kulinarna podróż"',
    '"smakuje jak u mamy/babci"',
    '"tylko świeże i lokalne składniki"',
  ];
  const industryBanned = ir?.banned_cliches?.map(c => `"${c}"`) || [];
  // Dedup: skip industry clichés already covered by universal patterns, cap total at 8
  const allBannedPatterns = [...universalBanned];
  for (const ic of industryBanned) {
    if (allBannedPatterns.length >= 8) break;
    const icClean = ic.replace(/"/g, '').toLowerCase();
    const covered = universalBanned.some(ub => {
      const ubClean = ub.replace(/"/g, '').toLowerCase();
      return ubClean.includes(icClean) || icClean.includes(ubClean);
    });
    if (!covered) allBannedPatterns.push(ic);
  }
  const clicheSentinel = ir ? 'Jeśli zdanie brzmi jak z folderu każdej firmy w tej branży — przepisz je.' : 'Jeśli zdanie brzmi jak z broszury reklamowej — przepisz je.';

  const industryRulesBlock = ir ? `
════════════════════════════════════════
REGUŁY BRANŻOWE
════════════════════════════════════════
Zakazane wzorce (nie tylko dosłowne frazy — także ich warianty):
${allBannedPatterns.map(p => `• ${p}`).join('\n')}
${clicheSentinel}

${ir.banned_marketing_words?.length ? `\nZakazane słowa w tej branży: ${ir.banned_marketing_words.join(', ')}` : ''}

Jak pisać w tej branży:
${ir.language_notes || '- Opisuj konkretnie, bez ogólników'}` : `
Zakazane wzorce (uniwersalne):
${universalBanned.map(p => `• ${p}`).join('\n')}
${clicheSentinel}`;

  // Typy ujęć foto: z industry_rules lub generyczne
  const photoTypes = ir?.photo_brief_types?.length
    ? ir.photo_brief_types.join(', ')
    : 'hero shot produktu/usługi, detail/makro, lifestyle z kontekstem';

  // ══════════════════════════════════════════════════════════════
  // WARSTWA 1 — UNIWERSALNA (stała struktura)
  // ══════════════════════════════════════════════════════════════

  const platformData: Record<string, { rule: string; photoFormat: string }> = {
    facebook: {
      rule: `Facebook | TWARDY LIMIT: 80-150 słów (policz przed zwróceniem — jeśli >150 skróć, jeśli <80 rozbuduj) | 1-3 krótkie akapity | CTA z bezpośrednim linkiem lub zachętą do komentarza/wiadomości — NIGDY "link w bio"`,
      photoFormat: `Kadr: 1200×630 px (landscape 1.91:1) lub 1080×1080 (kwadrat).`,
    },
    linkedin: {
      rule: `LinkedIn | TWARDY LIMIT: 100-200 słów (policz przed zwróceniem — jeśli >200 skróć, jeśli <100 rozbuduj) | profesjonalny ale ludzki ton | storytelling mile widziany | emoji z umiarem | CTA: zachęta do komentarza, udostępnienia lub przejścia na stronę`,
      photoFormat: `Kadr: 1200×627 px (landscape 1.91:1).`,
    },
    instagram: {
      rule: `Instagram | TWARDY LIMIT: 50-120 słów + hashtagi (policz przed zwróceniem — jeśli >120 skróć, jeśli <50 rozbuduj) | chwytliwy pierwszy wiersz (hook) | 5-10 trafnych hashtagów na końcu | CTA: "link w bio", "napisz DM" lub "zapisz post"`,
      photoFormat: `Kadr: 1080×1350 px (portrait 4:5).`,
    },
    general: {
      rule: `Social media | TWARDY LIMIT: 80-150 słów (policz przed zwróceniem — jeśli >150 skróć, jeśli <80 rozbuduj) | ton dopasowany do marki | CTA dopasowane do kontekstu`,
      photoFormat: `Kadr: 1080×1080 px (kwadrat).`,
    },
  };
  const platform = platformData[format] || platformData['general'];

  // Visual brief — z dynamicznymi typami ujęć
  const photoDiversityInstruction = `
WAŻNE: Każdy z 3 briefów MUSI mieć INNY typ ujęcia.
Dostępne typy ujęć: ${photoTypes}.
Wybierz 3 RÓŻNE z powyższej listy. NIE powtarzaj tego samego schematu we wszystkich trzech.`;

  const visualBriefInstructions: Record<string, string> = {
    graphic: `Brief dla grafika (3-5 zdań): nastrój, wizualna metafora, typ ilustracji (abstrakcyjna/ikonograficzna/typograficzna/kolażowa), atmosfera. BEZ logo, BEZ hex kolorów, BEZ layoutu. ${platform.photoFormat}`,
    photo: `Brief dla fotografa (3-5 zdań): typ zdjęcia, kadrowanie, oświetlenie i mood, stylizacja/props/tło. BEZ logo, BEZ kolorów marki. Na zdjęciu NIE będzie tekstu. ${platform.photoFormat}
${photoDiversityInstruction}`,
    photo_text: `Brief dla fotografa pod tekst (3-5 zdań): typ zdjęcia, kadrowanie z przestrzenią na nałożenie tekstu (jasna/ciemna strefa, bokeh, negatywna przestrzeń), oświetlenie, stylizacja. Wskaż gdzie powinien być tekst. ${platform.photoFormat}
${photoDiversityInstruction}`,
  };
  const visualBriefInstruction = visualBriefInstructions[visualType] || visualBriefInstructions['graphic'];

  // Output schema
  const hasTextOnVisual = visualType !== 'photo';

  const variantFields = hasTextOnVisual
    ? `"post_copy", "visual_brief", "headline" (maks. 8 słów — tekst na ${visualType === 'photo_text' ? 'zdjęcie' : 'grafikę'}), "subtext" (maks. 15 słów — uzupełnia nagłówek), "cta" (maks. 4 słowa), "rationale"`
    : `"post_copy", "visual_brief", "rationale"`;

  const jsonExample = hasTextOnVisual
    ? `{ "post_copy": "...", "visual_brief": "...", "headline": "...", "subtext": "...", "cta": "...", "rationale": "..." }`
    : `{ "post_copy": "...", "visual_brief": "...", "rationale": "..." }`;

  // ══════════════════════════════════════════════════════════════
  // ASSEMBLER — łączenie 3 warstw w finalny prompt
  // ══════════════════════════════════════════════════════════════

  return `Jesteś copywriterem marki ${project.name}. Piszesz treści gotowe do publikacji — w głosie marki, bez sztuczności.

════════════════════════════════════════
TOŻSAMOŚĆ MARKI
════════════════════════════════════════
${brandIdentity}
${voiceBlock}
${industryRulesBlock}

════════════════════════════════════════
ZASADY PISANIA
════════════════════════════════════════
Wykryj typ zadania i dopasuj podejście:

MARKETING (promocja, oferta, produkt, kampania):
- Zdanie 1: nazwij problem lub pragnienie odbiorcy
- Zdanie 2-3: pokaż rozwiązanie konkretnie, w języku branży
- Zdanie końcowe: CTA
- Zakazane: "kompleksowy", "kluczowy", "synergia", "w dzisiejszym świecie"

LUDZKI GŁOS (życzenia, podziękowania, kultura firmy, celebracja):
- Pisz jak człowiek do człowieka — bez frameworków
- Krótkie zdania, naturalny rytm
- Podpis: nazwa marki, nigdy "Zespół...", "Dział..."
- Zakazane: "zasłużona odnowa", "doceniamy waszą pasję", cokolwiek z newslettera HR

════════════════════════════════════════
ZADANIE
════════════════════════════════════════
${briefText || '[Brak zadania — generuj na podstawie tożsamości marki]'}

OPIS PRODUKTU/USŁUGI JEST ŹRÓDŁEM PRAWDY — zarówno w post_copy, jak i w visual_brief. Nie dodawaj cech, których nie ma w opisie. Nie wymyślaj. Dotyczy też parafraz: "świeżo wypiekana" ≠ "prosto z pieca" (to dodaje temperaturę). "Ze szczypiorkiem" ≠ "z dużą ilością szczypiorku" (to dodaje ilość).

Platforma: ${platform.rule}
Wizual: ${{ graphic: 'Grafika z tekstem', photo: 'Czyste zdjęcie (bez tekstu)', photo_text: 'Zdjęcie z nałożonym tekstem' }[visualType] || 'Grafika'}
${vc ? `
WAŻNE — elementy głosu marki obowiązkowe w KAŻDYM wariancie post_copy:
${(vc.golden_rules || []).map((r, i) => {
    const rule = r.replace(
      /[Zz]awsze używ[a-ząćęłńóśźż]+ przynajmniej jednego żółtego serca \(💛\)/,
      'Dokładnie jedno 💛 w treści posta (nie w nagłówku, nie dwa razy). Umieść je w zdaniu, które mówi o emocji lub komforcie — tam ma największą siłę'
    );
    return `${i + 1}. ${rule}`;
  }).join('\n')}` : ''}

════════════════════════════════════════
OUTPUT — 3 WARIANTY (każdy INNY w hooku i podejściu)
════════════════════════════════════════
Wariant 1: hook zmysłowy — otwórz obrazem, doznaniem zmysłowym pasującym do branży. Krótki, punchline.
Wariant 2: hook nostalgiczny/storytelling — odwołaj się do wspomnienia, tradycji, emocji. Dłuższy.
Wariant 3: hook pytanie/interakcja — zacznij od KONKRETNEGO pytania, na które łatwo odpowiedzieć (wybór A vs B, dokończ zdanie, podziel się jednym wspomnieniem). Unikaj pytań tak szerokich, że nie dają impulsu do odpowiedzi.

Każdy wariant zawiera: ${variantFields}

"post_copy" — gotowy tekst posta. Napisz go tak, jakby brand manager wpisał go właśnie teraz.
"visual_brief" — ${visualBriefInstruction}
"rationale" — maks. 10 słów. Napisz MECHANIZM DZIAŁANIA na odbiorcę, nie opis wariantu.
Dobrze: "Konkretny benefit budzi zaufanie, CTA domyka konwersję"
Źle: "Zmysłowy obraz zamienia się w emocjonalny spokój"

Zwróć WYŁĄCZNIE poprawny JSON:
{
  "concept": "Maks. 15 słów. Jedna emocja + jeden konkretny detal TEGO produktu/usługi. Jeśli pasuje do dowolnej firmy z tej branży, jest za ogólny.",
  "variants": [
    ${jsonExample},
    ${jsonExample},
    ${jsonExample}
  ]
}

Pisz CAŁY tekst po polsku.`;
}

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
  const formData = await req.formData();

  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const format = formData.get('format') as string || 'general';
  const visualType = formData.get('visualType') as string || 'graphic';
  const mode = formData.get('mode') as string || 'generate'; // 'preview' | 'generate'
  const customPrompt = formData.get('customPrompt') as string | null;

  if (!file && !text && !customPrompt) {
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

  const copyPrompt = customPrompt || buildCopyPrompt(project, briefText, format, visualType);

  // Preview mode — just return the prompt
  if (mode === 'preview') {
    return NextResponse.json({ prompt: copyPrompt });
  }

  // Generate mode — call Claude and save to DB
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

    const variants = parsed.variants || [];
    const concept = parsed.concept || '';

    // Save to DB
    const [saved] = await getDb()`
      INSERT INTO copy_generations (project_id, task, format, visual_type, prompt, concept, variants)
      VALUES (${projectId}, ${text || ''}, ${format}, ${visualType}, ${copyPrompt}, ${concept}, ${JSON.stringify(variants)}::jsonb)
      RETURNING *
    `;

    return NextResponse.json({
      results: variants,
      concept,
      visualType,
      generation: saved,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Copy generation error:', msg);
    return NextResponse.json({ error: 'Copy generation failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}

// Select variant or delete
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { generationId, selectedVariant } = body;

  if (!generationId || selectedVariant === undefined) {
    return NextResponse.json({ error: 'generationId and selectedVariant required' }, { status: 400 });
  }

  await getDb()`
    UPDATE copy_generations
    SET selected_variant = ${selectedVariant}
    WHERE id = ${generationId} AND project_id = ${BRAND_ID}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const generationId = searchParams.get('generationId');

  if (!generationId) {
    return NextResponse.json({ error: 'generationId required' }, { status: 400 });
  }

  await getDb()`
    DELETE FROM copy_generations
    WHERE id = ${parseInt(generationId)} AND project_id = ${BRAND_ID}
  `;

  return NextResponse.json({ ok: true });
}
