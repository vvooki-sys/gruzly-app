export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300;

interface BrandSection {
  id: string;
  title: string;
  content: string;
  type: 'standard' | 'custom';
  order: number;
  icon?: string;
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const data = Buffer.from(buffer).toString('base64');
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (mimeType.includes('svg')) return null;
    return { data, mimeType };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;

  const { source } = await req.json().catch(() => ({}));

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${projectId}`;

  let analysisPrompt: string;
  let imageParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];

  if (source === 'brandbook') {
    const brandbook = (assets as Array<{ type: string; url: string; filename: string }>)
      .find(a => a.type === 'brandbook');

    if (!brandbook) {
      return NextResponse.json({ error: 'No brandbook uploaded' }, { status: 400 });
    }

    const b64 = await urlToBase64(brandbook.url);
    if (!b64) {
      return NextResponse.json({ error: 'Failed to load brandbook PDF' }, { status: 500 });
    }

    imageParts.push({ inlineData: { data: b64.data, mimeType: 'application/pdf' } });

    analysisPrompt = `Jesteś doświadczonym analitykiem identyfikacji wizualnej marki. Przeczytaj ten brand book (PDF) dla marki "${project.name}" i wyodrębnij WSZYSTKIE informacje o identyfikacji wizualnej w uporządkowane sekcje.

KRYTYCZNE ZASADY:
1. Zwróć WYŁĄCZNIE poprawny JSON — bez markdown, bez wyjaśnień, bez tekstu poza JSON-em
2. Wyodrębnij KAŻDĄ sekcję, którą znajdziesz w brand booku
3. Dla standardowych sekcji (lista poniżej) użyj dokładnych podanych ID
4. Dla treści unikalnych/specjalnych spoza listy standardowej — utwórz sekcję niestandardową z id zaczynającym się od "custom_"
5. Treść musi być precyzyjna i konkretna — podawaj dokładne hex codes, dokładne wymiary, dokładne zasady
6. Zwróć CAŁĄ treść (tytuły sekcji, opisy, brandRules) po polsku

STANDARDOWE ID SEKCJI (użyj tych dokładnych id, gdy treść pasuje):
- "modul" — Moduł konstrukcyjny, marginesy, pola ochronne, wymiary
- "tlo" — Kolor/obróbka tła
- "gradient" — Gradient marki (kolory, kierunek, zasady użycia)
- "kolorystyka" — Główna paleta kolorów z hex codes
- "kolorystyka_dodatkowa" — Kolory dodatkowe/uzupełniające
- "typografia" — Typografia — fonty, grubości, rozmiary, kerning, interlinia, zasady
- "logo" — Logotyp — wersje, umiejscowienie, rozmiar, pole ochronne
- "blob" — Elementy dekoracyjne, kształty, elementy organiczne
- "copy" — Zasady tekstu/copy — wielkość liter, wyrównanie, hierarchia
- "cta" — Call to Action — konstrukcja, kolory, rozmiary, umiejscowienie
- "stickery" — Stickery, badge, etykiety, stemple, patki
- "packshot" — Zasady fotografii produktowej
- "legal" — Tekst prawny — rozmiar, kolor, umiejscowienie
- "animacje" — Zasady animacji (jeśli występują)

Zwróć dokładnie taką strukturę JSON:
{
  "sections": [
    {
      "id": "gradient",
      "title": "Gradient NCO",
      "content": "Gradient przechodzi od #6e46a0 (jasny, góra) do #2d1464 (ciemny, dół). Dla formatów 1200x1200px i 360x640px: góra jasna, dół ciemna. Dla formatów 336x280px i 750x300px: lewa jasna, prawa ciemna.",
      "type": "standard",
      "order": 1,
      "icon": "🎨"
    }
  ],
  "brandRules": [
    "Gradient NCO jest obowiązkowy we wszystkich kampaniach",
    "Font tylko Manrope Regular i Extra Bold — bez wyjątków"
  ]
}`;

  } else {
    const refs = (assets as Array<{ type: string; url: string; filename: string }>)
      .filter(a => a.type === 'reference' && !a.url.endsWith('.svg'));

    if (refs.length === 0) {
      return NextResponse.json({ error: 'No reference images to analyze. Upload at least one reference graphic.' }, { status: 400 });
    }

    for (const ref of refs) {
      const b64 = await urlToBase64(ref.url);
      if (b64) imageParts.push({ inlineData: b64 });
    }

    if (imageParts.length === 0) {
      return NextResponse.json({ error: 'Failed to load reference images' }, { status: 500 });
    }

    analysisPrompt = `Jesteś analitykiem identyfikacji wizualnej marki. Przeanalizuj ${imageParts.length} grafik referencyjnych dla marki "${project.name}".

ZASADY:
- Zwróć WYŁĄCZNIE poprawny JSON — bez markdown, bez wyjaśnień
- Bądź dokładny i precyzyjny — każda sekcja powinna mieć 2-5 zdań z konkretnymi wartościami
- Opisuj tylko powtarzające się, niezmienne wzorce
- Podawaj dokładne hex codes, dokładne nazwy fontów, dokładne wymiary, gdy są widoczne
- Im więcej szczegółów, tym lepiej — to napędza jakość generowania grafik przez AI
- Zwróć CAŁĄ treść (tytuły, opisy) po polsku

Zwróć dokładnie taki JSON:
{
  "sections": [
    { "id": "tlo", "title": "Tło", "content": "...", "type": "standard", "order": 1, "icon": "🖼" },
    { "id": "typografia", "title": "Typografia", "content": "...", "type": "standard", "order": 2, "icon": "📝" },
    { "id": "modul", "title": "Kompozycja i układ", "content": "...", "type": "standard", "order": 3, "icon": "📐" },
    { "id": "blob", "title": "Elementy graficzne", "content": "...", "type": "standard", "order": 4, "icon": "✨" },
    { "id": "copy", "title": "Ton i nastrój", "content": "...", "type": "standard", "order": 5, "icon": "💬" }
  ],
  "brandRules": []
}`;
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          ...imageParts,
          { text: analysisPrompt },
        ],
      }],
    });

    const responseText = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('\n') || '';

    if (!responseText) throw new Error('Empty analysis response');

    // Parse JSON response
    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: { sections: BrandSection[]; brandRules: string[] };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: wrap plain text as a single section
      parsed = {
        sections: [{ id: 'analiza', title: 'Analiza marki', content: cleaned, type: 'standard', order: 1 }],
        brandRules: [],
      };
    }

    // Add source field to all new sections
    const sectionSource = source === 'brandbook' ? 'brandbook' : 'references';
    const sectionsWithSource = parsed.sections.map(s => ({ ...s, source: sectionSource, confidence: 'high' }));

    // Build brand_analysis text fallback (for generate route backward compat)
    const brandAnalysis = [...sectionsWithSource]
      .sort((a, b) => a.order - b.order)
      .map(s => `${s.title.toUpperCase()}: ${s.content}`)
      .join('\n\n');

    // Merge with existing sections — new source replaces same-id sections only if priority >=
    const SOURCE_PRIORITY: Record<string, number> = { brandbook: 3, references: 2, brand_scan: 1, manual: 0 };
    type ExistingSec = Record<string, unknown>;
    const existingSections: ExistingSec[] = project.brand_sections || [];
    const mergedSections = [...existingSections];

    for (const newSec of sectionsWithSource) {
      const existingIdx = mergedSections.findIndex(s => s.id === newSec.id);
      const newPriority = SOURCE_PRIORITY[sectionSource] ?? 0;
      if (existingIdx >= 0) {
        const existingSource = (mergedSections[existingIdx].source as string) || 'manual';
        const existingPriority = SOURCE_PRIORITY[existingSource] ?? 0;
        if (newPriority >= existingPriority) {
          mergedSections[existingIdx] = newSec;
        }
      } else {
        mergedSections.push(newSec);
      }
    }

    // Save brand_sections and brand_analysis
    await getDb()`
      UPDATE projects
      SET brand_sections = ${JSON.stringify(mergedSections)}::jsonb,
          brand_analysis = ${brandAnalysis},
          updated_at = NOW()
      WHERE id = ${projectId}
    `;

    let brandRules: string | null = null;
    let suggestedRules: string | null = null;

    if (parsed.brandRules && parsed.brandRules.length > 0) {
      const rulesText = parsed.brandRules.join('\n');
      if (project.brand_rules) {
        suggestedRules = rulesText;
      } else {
        brandRules = rulesText;
        await getDb()`UPDATE projects SET brand_rules = ${rulesText} WHERE id = ${projectId}`;
      }
    }

    return NextResponse.json({
      sections: mergedSections,
      analysis: brandAnalysis,
      brandRules: brandRules || undefined,
      suggestedRules: suggestedRules || undefined,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Analysis error:', msg);
    return NextResponse.json({ error: 'Analysis failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
