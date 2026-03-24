export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

export async function POST() {
  const projectId = BRAND_ID;
  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scanData = project.brand_scan_data as Record<string, any> | null;
  const industry = scanData?.industry || 'Ogólna / Nieznana';
  const brandName = project.name as string;
  const brandDescription = scanData?.brandDescription || (project.description as string) || '';
  const targetAudience = scanData?.targetAudience || '';

  const metaPrompt = `Jesteś ekspertem od komunikacji marek i copywritingu. Twoim zadaniem jest wygenerowanie reguł copywriterskich dostosowanych do konkretnej branży.

KONTEKST:
- Marka: ${brandName}
- Branża: ${industry}
- Opis: ${brandDescription}
- Grupa docelowa: ${targetAudience}

INSTRUKCJE:
Wygeneruj zestaw reguł copywriterskich specyficznych dla tej branży. Każdy element musi być KONKRETNY i OPERACYJNY — inne AI czytające te reguły powinno od razu wiedzieć, jak pisać copy i briefy fotograficzne dla tej marki.

Zwróć WYŁĄCZNIE poprawny JSON:

{
  "banned_cliches": [
    // MAKS 6-8 pozycji. Każda w formacie: "klisza → pozytywny zamiennik"
    // Łącz warianty w jedną pozycję. NIE duplikuj wzorców, które się pokrywają.
    // Przykład gastro: "uczta dla podniebienia / niebo w gębie → nazwij konkretną teksturę lub zapach"
    // Przykład moto: "oddaj się w ręce profesjonalistów → opisz konkretną czynność, np. wymiana oleju w 20 min"
  ],
  "banned_marketing_words": [
    // 5-8 konkretnych słów/wyrażeń nadużywanych w TEJ branży
    // Przykład gastro: "innowacyjny", "kompozycja smaków", "kulinarna podróż"
    // Przykład moto: "profesjonalna obsługa", "konkurencyjne ceny", "fachowa diagnoza"
    // Przykład prawo: "indywidualne podejście", "skuteczna pomoc", "wieloletnie doświadczenie"
  ],
  "photo_brief_types": [
    // 5-7 typów ujęć fotograficznych naturalnych dla TEJ branży
    // Przykład gastro: "flatlay dania z góry", "makro/detail tekstury", "lifestyle przy stole", "kulisy kuchni", "wnętrze lokalu"
    // Przykład moto: "before/after naprawy", "detail pracy mechanika", "hero shot samochodu", "narzędzia/workspace", "klient odbierający auto"
    // Przykład florystyka: "bukiet w kontekście wnętrza", "makro płatków", "flatlay kompozycji", "proces wiązania", "dostawa/unboxing"
  ],
  "language_notes": "Lista 2-4 punktów (każdy zaczyna się od '- '). Każdy punkt to JEDNA konkretna instrukcja: co robić lub czego unikać. Przykład: '- Opisuj doznania KONKRETNIE: tekstura, temperatura, kontrast — nie ogólnikami (pyszne, dobre)'. Nie pisz akapitów."
}

Pisz CAŁY tekst po polsku. Zwróć TYLKO JSON, bez komentarzy.`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: metaPrompt }] }],
    });

    const responseText = result.response.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      ?.map((p: { text?: string }) => p.text)
      ?.join('') || '';

    const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const industryRules = {
      ...parsed,
      generated_at: new Date().toISOString(),
    };

    await getDb()`UPDATE projects SET industry_rules = ${JSON.stringify(industryRules)}::jsonb WHERE id = ${projectId}`;

    return NextResponse.json({ industryRules });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Industry rules generation error:', msg);
    return NextResponse.json({ error: 'Generation failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const projectId = BRAND_ID;
  const { industryRules } = await req.json();
  await getDb()`UPDATE projects SET industry_rules = ${JSON.stringify(industryRules)}::jsonb WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const projectId = BRAND_ID;
  await getDb()`UPDATE projects SET industry_rules = NULL WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}
