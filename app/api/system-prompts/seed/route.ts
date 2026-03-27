export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { invalidateCache } from '@/lib/system-prompts';

interface SeedEntry {
  id: string;
  category: string;
  label: string;
  description: string;
  content: string;
  content_type: 'text' | 'json' | 'list';
  sort_order: number;
}

const SEED_DATA: SeedEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATOR — FOTO
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gen.photo.role',
    category: 'generator_photo',
    label: 'Rola systemowa',
    description: 'Początek promptu foto — rola AI',
    content: 'Jesteś profesjonalnym fotografem. Generujesz zdjęcia do social media.',
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'gen.photo.rules',
    category: 'generator_photo',
    label: 'Zasady bezwzględne',
    description: 'photoLayer1Rules — tablica reguł foto',
    content: [
      'Obrazy referencyjne dostarczają paletę kolorów, styl kompozycji i nastrój. Użyj ich jako inspiracji stylistycznej.',
      'NIE umieszczaj żadnego tekstu, liter, cyfr, logo ani watermarków na zdjęciu.',
      'Wypełnij całe płótno — bez białych obramowań ani paddingu.',
    ].join('\n'),
    content_type: 'list',
    sort_order: 2,
  },
  {
    id: 'gen.photo.creativity.1',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 1',
    description: 'PHOTO_CREATIVITY_BLOCKS[1]',
    content: 'Czysta, minimalna kompozycja fotograficzna. Główny obiekt ostry, centralne kadrowanie, neutralne tło, równomierne miękkie oświetlenie. ZERO rekwizytów, ZERO stylizacji otoczenia. Sam obiekt na czystym tle.',
    content_type: 'text',
    sort_order: 3,
  },
  {
    id: 'gen.photo.creativity.2',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 2',
    description: 'PHOTO_CREATIVITY_BLOCKS[2]',
    content: 'Prosta, uporządkowana kompozycja z kontekstem. Główny obiekt ostry, tło w delikatnym bokeh (f/2.8-4). Ciepłe oświetlenie boczne, miękkie cienie. 1-2 rekwizyty kontekstowe w tle (nieostre, nieprzytłaczające). Naturalna stylizacja — bez nadmiernej inscenizacji.',
    content_type: 'text',
    sort_order: 4,
  },
  {
    id: 'gen.photo.creativity.3',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 3',
    description: 'PHOTO_CREATIVITY_BLOCKS[3]',
    content: 'Precyzyjny, świadomy kadr z minimalną liczbą elementów — ale każdy na idealnym miejscu. Celowa asymetria, negatywna przestrzeń jako element kompozycji. Ostrość krytyczna na głównym obiekcie, reszta podporządkowana. Światło modelowane z jednego kierunku. Mniej elementów niż na poziomie 4, ale każdy perfekcyjnie umiejscowiony.',
    content_type: 'text',
    sort_order: 5,
  },
  {
    id: 'gen.photo.creativity.4',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 4',
    description: 'PHOTO_CREATIVITY_BLOCKS[4]',
    content: 'Wielowarstwowy kadr z wyczuwalną głębią. Elementy na pierwszym planie, obiekcie głównym i w tle tworzące trzy plany ostrości. Kierunkowe oświetlenie z wyraźnymi cieniami budującymi głębię. Świadoma praca z teksturami i materiałami. Stylizacja celowa — rekwizyty, powierzchnie, otoczenie współtworzą nastrój marki. Każdy element kadru ma swoje miejsce w hierarchii wizualnej.',
    content_type: 'text',
    sort_order: 6,
  },
  {
    id: 'gen.photo.creativity.5',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 5',
    description: 'PHOTO_CREATIVITY_BLOCKS[5]',
    content: 'Produkcja na poziomie profesjonalnej sesji reklamowej. Dramatyczne światło z wyraźnym kierunkiem i kontrowym podświetleniem. Kinowa kolorystyka. Precyzyjna głębia ostrości — ostre detale przechodzą w kremowy bokeh. Dynamiczna, nieszablonowa perspektywa. Stylizacja na poziomie art directora — każdy rekwizyt, tekstura i powierzchnia służy konceptowi. Zero przypadkowości.',
    content_type: 'text',
    sort_order: 7,
  },
  {
    id: 'gen.photo.creativity.6',
    category: 'generator_photo',
    label: 'Jakość foto — poziom 6',
    description: 'PHOTO_CREATIVITY_BLOCKS[6]',
    content: 'Arcydzieło fotograficzne. Kinowe światło, filmowa kolorystyka, immersyjna atmosfera z wyczuwalną głębią ostrości na każdym planie. Perfekcyjna równowaga między ostrością a bokeh. Kompozycja, światło i kolor tworzą spójną narrację emocjonalną. Zdjęcie, przy którym zatrzymujesz scroll. Każdy piksel jest celowy. Poziom kampanii globalnych marek.',
    content_type: 'text',
    sort_order: 8,
  },
  {
    id: 'gen.photo.label.1',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 1',
    description: 'CREATIVITY_LABELS[1] w Generator.tsx',
    content: JSON.stringify({ name: 'Minimalny', desc: 'Jak szybkie zdjęcie telefonem — czyste, proste, spełnia zadanie.' }),
    content_type: 'json',
    sort_order: 9,
  },
  {
    id: 'gen.photo.label.2',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 2',
    description: 'CREATIVITY_LABELS[2] w Generator.tsx',
    content: JSON.stringify({ name: 'Prosty', desc: 'Jak amator z dobrym aparatem — widać intencję, staranny kadr.' }),
    content_type: 'json',
    sort_order: 10,
  },
  {
    id: 'gen.photo.label.3',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 3',
    description: 'CREATIVITY_LABELS[3] w Generator.tsx',
    content: JSON.stringify({ name: 'Precyzyjny', desc: 'Jak zawodowiec z komórką — mało elementów, ale każdy perfekcyjnie na miejscu.' }),
    content_type: 'json',
    sort_order: 11,
  },
  {
    id: 'gen.photo.label.4',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 4',
    description: 'CREATIVITY_LABELS[4] w Generator.tsx',
    content: JSON.stringify({ name: 'Głębia', desc: 'Jak fotograf z lustrzanką — warstwy, światło, cień, wszystko pod kontrolą.' }),
    content_type: 'json',
    sort_order: 12,
  },
  {
    id: 'gen.photo.label.5',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 5',
    description: 'CREATIVITY_LABELS[5] w Generator.tsx',
    content: JSON.stringify({ name: 'Reklamowy', desc: 'Jak profesjonalna sesja reklamowa — dramatyczne światło, odważna kompozycja.' }),
    content_type: 'json',
    sort_order: 13,
  },
  {
    id: 'gen.photo.label.6',
    category: 'generator_photo',
    label: 'Etykieta slidera lvl 6',
    description: 'CREATIVITY_LABELS[6] w Generator.tsx',
    content: JSON.stringify({ name: 'Arcydzieło', desc: 'Jak zdjęcie, przy którym zatrzymujesz scroll — kinowa atmosfera, każdy detal celowy.' }),
    content_type: 'json',
    sort_order: 14,
  },
  {
    id: 'gen.photo.layer2_exclude',
    category: 'generator_photo',
    label: 'Sekcje wykluczone w foto',
    description: 'PHOTO_EXCLUDE_KEYWORDS — filtrowanie brand_sections',
    content: [
      'ton', 'tone', 'voice', 'głos', 'komunikac',
      'cta', 'call to action', 'wezwani',
      'copy', 'tekst', 'treść', 'wartości', 'values',
      'typo', 'font', 'czcion', 'typography',
      'kolor', 'color', 'palette', 'paleta',
    ].join('\n'),
    content_type: 'list',
    sort_order: 15,
  },
  {
    id: 'gen.photo.brief_template',
    category: 'generator_photo',
    label: 'Szablon briefu foto',
    description: 'Fragment budujący photoLayer3 — BRIEF FOTOGRAFICZNY',
    content: `WARSTWA 3 — BRIEF FOTOGRAFICZNY
Zrealizuj poniższą wizję. To jest cel tej grafiki.

⭐ GŁÓWNA WIZJA:
"\${brief}"

MARKA: \${project.name}
FORMAT: \${format}`,
    content_type: 'text',
    sort_order: 16,
  },
  {
    id: 'gen.photo.closing',
    category: 'generator_photo',
    label: 'Tekst zamykający',
    description: 'Fragment końcowy promptu foto',
    content: `PRZYPOMNIENIE O PRIORYTETACH: Warstwa 1 > Warstwa 2 > Warstwa 3.
Jeśli DNA marki koliduje z briefem — DNA marki wygrywa.
Jeśli zasady bezwzględne kolidują z czymkolwiek — zasady bezwzględne wygrywają.
Wygeneruj JEDNO kompletne, gotowe do publikacji zdjęcie.`,
    content_type: 'text',
    sort_order: 17,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATOR — GRAFICZNY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gen.graphic.role',
    category: 'generator_graphic',
    label: 'Rola systemowa',
    description: 'Początek promptu graficznego — rola AI',
    content: 'Jesteś profesjonalnym grafikiem tworzącym grafiki do social media.\nStosuj poniższą trójwarstwową hierarchię instrukcji. Wyższe warstwy nadpisują niższe.',
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'gen.graphic.rules',
    category: 'generator_graphic',
    label: 'Zasady bezwzględne',
    description: 'graphicLayer1Rules — tablica reguł graficznych',
    content: [
      'REFERENCJE STYLISTYCZNE: Obrazy referencyjne dostarczają TYLKO paletę kolorów, styl kompozycji i nastrój. NIE odtwarzaj twarzy, osób ani rozpoznawalnych postaci z referencji.',
      'RENDERUJ TYLKO tekst wymieniony pod "TEKST DO UMIESZCZENIA NA GRAFICE" — żaden inny tekst, podpisy ani etykiety',
    ].join('\n'),
    content_type: 'list',
    sort_order: 2,
  },
  {
    id: 'gen.graphic.creativity.1',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 1',
    description: 'CREATIVITY_BLOCKS[1]',
    content: 'Minimalistyczna kompozycja. Jedno tło (solid kolor lub prosty dwukolorowy gradient). Tekst wycentrowany z czystą hierarchią. ZERO elementów dekoracyjnych — żadnych kształtów, ikon, patternów, tekstur. Maksimum negatywnej przestrzeni. Czytelność jest jedynym celem.',
    content_type: 'text',
    sort_order: 3,
  },
  {
    id: 'gen.graphic.creativity.2',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 2',
    description: 'CREATIVITY_BLOCKS[2]',
    content: 'Prosty, uporządkowany design. Tło: gradient brandowy (max 3 kolory). Dozwolony JEDEN element dekoracyjny (kształt geometryczny, linia, subtelny pattern). Dozwolona subtelna tekstura (grain, noise). Kompozycja centralna, bezpieczna. Dużo powietrza wokół tekstu.',
    content_type: 'text',
    sort_order: 4,
  },
  {
    id: 'gen.graphic.creativity.3',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 3',
    description: 'CREATIVITY_BLOCKS[3]',
    content: 'Świadoma, precyzyjna kompozycja z minimalną liczbą elementów — ale każdy doskonale umiejscowiony. Asymetryczny layout. Celowe użycie negatywnej przestrzeni jako elementu designu. Typografia z charakterem — zróżnicowane wielkości, kontrastujące grubości. Max 2-3 elementy dekoracyjne, ale rozmieszczone z intencją. Mniej znaczy więcej — ale to "mniej" musi być perfekcyjne.',
    content_type: 'text',
    sort_order: 5,
  },
  {
    id: 'gen.graphic.creativity.4',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 4',
    description: 'CREATIVITY_BLOCKS[4]',
    content: 'Wielowarstwowa kompozycja graficzna z głębią. Elementy na pierwszym i drugim planie tworzące wrażenie przestrzeni. Tło jest aktywnym elementem designu — nie tylko podkład. Tekstury, nakładające się kształty z różną przezroczystością. 4-6 elementów wizualnych współpracujących ze sobą. Kontrasty wielkości w typografii. Celowa praca z gradientami i cieniami. Każdy element ma swoje miejsce w hierarchii wizualnej.',
    content_type: 'text',
    sort_order: 6,
  },
  {
    id: 'gen.graphic.creativity.5',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 5',
    description: 'CREATIVITY_BLOCKS[5]',
    content: 'Projekt graficzny na poziomie agencji kreatywnej. Wszystko służy konceptowi kreatywnego briefu. Dramatyczne kontrasty kolorystyczne, śmiały color blocking. Editorial layout z odważną typografią zintegrowaną z elementami wizualnymi. Dynamiczna, nieszablonowa kompozycja łamiąca siatki i konwencje. Złożone wielowarstwowe tła. Zero przypadkowości — każdy element ma uzasadnienie.',
    content_type: 'text',
    sort_order: 7,
  },
  {
    id: 'gen.graphic.creativity.6',
    category: 'generator_graphic',
    label: 'Bogactwo wizualne — poziom 6',
    description: 'CREATIVITY_BLOCKS[6]',
    content: 'Arcydzieło projektowania graficznego. Immersyjna, wielowarstwowa kompozycja, w której typografia i warstwa wizualna tworzą nierozerwalną całość. Złożone połączenie ilustracji, tekstur, gradientów i kształtów geometrycznych w jednej spójnej wizji. Każdy centymetr powierzchni zaprojektowany z intencją. Poziom kampanii globalnych marek — grafika, przy której zatrzymujesz scroll. Każdy piksel jest celowy.',
    content_type: 'text',
    sort_order: 8,
  },
  {
    id: 'gen.graphic.logo_zone.top-left',
    category: 'generator_graphic',
    label: 'Strefa logo — lewy górny',
    description: 'LOGO_EMPTY_ZONE["top-left"]',
    content: 'lewy górny obszar (pierwsze 25% szerokości, pierwsze 20% wysokości)',
    content_type: 'text',
    sort_order: 9,
  },
  {
    id: 'gen.graphic.logo_zone.top-right',
    category: 'generator_graphic',
    label: 'Strefa logo — prawy górny',
    description: 'LOGO_EMPTY_ZONE["top-right"]',
    content: 'prawy górny obszar (ostatnie 25% szerokości, pierwsze 20% wysokości)',
    content_type: 'text',
    sort_order: 10,
  },
  {
    id: 'gen.graphic.logo_zone.bottom-left',
    category: 'generator_graphic',
    label: 'Strefa logo — lewy dolny',
    description: 'LOGO_EMPTY_ZONE["bottom-left"]',
    content: 'lewy dolny obszar (pierwsze 25% szerokości, ostatnie 20% wysokości)',
    content_type: 'text',
    sort_order: 11,
  },
  {
    id: 'gen.graphic.logo_zone.bottom-right',
    category: 'generator_graphic',
    label: 'Strefa logo — prawy dolny',
    description: 'LOGO_EMPTY_ZONE["bottom-right"]',
    content: 'prawy dolny obszar (ostatnie 25% szerokości, ostatnie 20% wysokości)',
    content_type: 'text',
    sort_order: 12,
  },
  {
    id: 'gen.graphic.brief_template',
    category: 'generator_graphic',
    label: 'Szablon briefu graficznego',
    description: 'Fragment budujący graphicLayer3 — BRIEF KREATYWNY',
    content: `WARSTWA 3 — BRIEF KREATYWNY
Stwórz grafikę spełniającą wymagania wszystkich warstw powyżej. Bądź kreatywny w ramach ograniczeń.`,
    content_type: 'text',
    sort_order: 13,
  },
  {
    id: 'gen.graphic.closing',
    category: 'generator_graphic',
    label: 'Tekst zamykający',
    description: 'Closing — PRZYPOMNIENIE O PRIORYTETACH',
    content: `PRZYPOMNIENIE O PRIORYTETACH: Warstwa 1 > Warstwa 2 > Warstwa 3.
Jeśli DNA marki koliduje z briefem — DNA marki wygrywa.
Jeśli zasady bezwzględne kolidują z czymkolwiek — zasady bezwzględne wygrywają.
Wygeneruj JEDNĄ kompletną, gotową do publikacji grafikę.`,
    content_type: 'text',
    sort_order: 14,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATOR — ELEMENT DEKORACYJNY
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gen.element.prompt',
    category: 'generator_element',
    label: 'Pełny prompt elementu',
    description: 'Standalone prompt gdy elementOnly = true',
    content: `Wygeneruj TYLKO abstrakcyjną ilustrację do użycia jako centralny element dekoracyjny w grafice social media.

ZASADY BEZWZGLĘDNE — KAŻDE NARUSZENIE CZYNI OUTPUT BEZUŻYTECZNYM:
- BEZ logo, BEZ znaków marki, BEZ wordmarków
- BEZ tekstu, BEZ liter, BEZ cyfr, BEZ słów w jakimkolwiek języku
- BEZ elementów UI, BEZ przycisków, BEZ ikon
- BEZ kół, kształtów ani elementów zawierających tekst
- BEZ ludzkich twarzy ani rozpoznawalnych osób
- BEZ rozpoznawalnych produktów ani zdjęć produktów

OUTPUT: Jedna abstrakcyjna ilustracja — kształty, gradienty, organiczne formy, tekstury. Kwadratowa kompozycja. Zero tekstu. Zero brandingu. Odpowiednia do nałożenia na tło w kolorach marki.`,
    content_type: 'text',
    sort_order: 1,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERATOR — COMPOSITOR
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'gen.compositor.illustration_prompt',
    category: 'generator_compositor',
    label: 'Prompt ilustracji tła',
    description: 'illustrationPrompt w generateWithCompositor()',
    content: `Tworzysz ilustrację tła dla grafiki social media.

ZASADY BEZWZGLĘDNE — nadpisują wszystko:
1. NIE umieszczaj żadnego tekstu, słów, liter, cyfr ani typografii
2. NIE umieszczaj żadnych logo, znaków marki ani wordmarków
3. NIE umieszczaj żadnych elementów UI, przycisków, ramek ani obramowań
4. Dolne 35% obrazu zostaw względnie proste/niezagracone — tekst będzie tam nałożony
5. Górne 15% zostaw względnie czyste — logo będzie tam umieszczone
6. NIE umieszczaj żadnych ludzkich twarzy ani rozpoznawalnych osób

OUTPUT: Jedna ilustracja tła. Czysto wizualna — bez tekstu, bez logo. Ilustracja powinna budować atmosferę i tożsamość marki wyłącznie poprzez kolor, kształt i kompozycję.`,
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'gen.compositor.creativity.1',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 1',
    description: 'CREATIVITY_BLOCKS_ILL[1]',
    content: 'Minimalistyczna kompozycja. Solid tło, czysta hierarchia, zero dekoracji.',
    content_type: 'text',
    sort_order: 2,
  },
  {
    id: 'gen.compositor.creativity.2',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 2',
    description: 'CREATIVITY_BLOCKS_ILL[2]',
    content: 'Prosty design. Gradient brandowy, max jeden element dekoracyjny, dużo powietrza.',
    content_type: 'text',
    sort_order: 3,
  },
  {
    id: 'gen.compositor.creativity.3',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 3',
    description: 'CREATIVITY_BLOCKS_ILL[3]',
    content: 'Precyzyjna kompozycja. Asymetria, celowa negatywna przestrzeń, typografia z charakterem.',
    content_type: 'text',
    sort_order: 4,
  },
  {
    id: 'gen.compositor.creativity.4',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 4',
    description: 'CREATIVITY_BLOCKS_ILL[4]',
    content: 'Wielowarstwowy kadr z głębią. Tekstury, nakładające się kształty, światło i cień.',
    content_type: 'text',
    sort_order: 5,
  },
  {
    id: 'gen.compositor.creativity.5',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 5',
    description: 'CREATIVITY_BLOCKS_ILL[5]',
    content: 'Profesjonalna sesja reklamowa. Dramatyczne światło, editorial layout, dynamiczna kompozycja.',
    content_type: 'text',
    sort_order: 6,
  },
  {
    id: 'gen.compositor.creativity.6',
    category: 'generator_compositor',
    label: 'Dyrektywy ilustracyjne — poziom 6',
    description: 'CREATIVITY_BLOCKS_ILL[6]',
    content: 'Arcydzieło. Kinowe światło, immersyjna wielowarstwowość, każdy piksel celowy.',
    content_type: 'text',
    sort_order: 7,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COPYWRITER
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'copy.role',
    category: 'copywriter',
    label: 'Rola systemowa',
    description: 'Początek buildCopyPrompt() — rola AI',
    content: 'Jesteś copywriterem marki ${project.name}. Piszesz treści gotowe do publikacji — w głosie marki, bez sztuczności.',
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'copy.rules.marketing',
    category: 'copywriter',
    label: 'Zasady pisania — marketing',
    description: 'Blok MARKETING w buildCopyPrompt',
    content: `MARKETING (promocja, oferta, produkt, kampania):
- Zdanie 1: nazwij problem lub pragnienie odbiorcy
- Zdanie 2-3: pokaż rozwiązanie konkretnie, w języku branży
- Zdanie końcowe: CTA
- Zakazane: "kompleksowy", "kluczowy", "synergia", "w dzisiejszym świecie"`,
    content_type: 'text',
    sort_order: 2,
  },
  {
    id: 'copy.rules.human',
    category: 'copywriter',
    label: 'Zasady pisania — ludzki głos',
    description: 'Blok LUDZKI GŁOS w buildCopyPrompt',
    content: `LUDZKI GŁOS (życzenia, podziękowania, kultura firmy, celebracja):
- Pisz jak człowiek do człowieka — bez frameworków
- Krótkie zdania, naturalny rytm
- Podpis: nazwa marki, nigdy "Zespół...", "Dział..."
- Zakazane: "zasłużona odnowa", "doceniamy waszą pasję", cokolwiek z newslettera HR`,
    content_type: 'text',
    sort_order: 3,
  },
  {
    id: 'copy.hook.1',
    category: 'copywriter',
    label: 'Hook — zmysłowy',
    description: 'Wariant 1: hook zmysłowy',
    content: 'hook zmysłowy — otwórz obrazem, doznaniem zmysłowym pasującym do branży. Krótki, punchline.',
    content_type: 'text',
    sort_order: 4,
  },
  {
    id: 'copy.hook.2',
    category: 'copywriter',
    label: 'Hook — nostalgiczny',
    description: 'Wariant 2: hook nostalgiczny/storytelling',
    content: 'hook nostalgiczny/storytelling — odwołaj się do wspomnienia, tradycji, emocji. Dłuższy.',
    content_type: 'text',
    sort_order: 5,
  },
  {
    id: 'copy.hook.3',
    category: 'copywriter',
    label: 'Hook — pytanie',
    description: 'Wariant 3: hook pytanie/interakcja',
    content: 'hook pytanie/interakcja — zacznij od KONKRETNEGO pytania, na które łatwo odpowiedzieć (wybór A vs B, dokończ zdanie, podziel się jednym wspomnieniem). Unikaj pytań tak szerokich, że nie dają impulsu do odpowiedzi.',
    content_type: 'text',
    sort_order: 6,
  },
  {
    id: 'copy.output_schema.with_text',
    category: 'copywriter',
    label: 'Schema outputu (z tekstem)',
    description: 'variantFields gdy hasTextOnVisual = true',
    content: '"post_copy", "visual_brief", "headline" (maks. 8 słów), "subtext" (maks. 15 słów), "cta" (maks. 4 słowa), "rationale"',
    content_type: 'text',
    sort_order: 7,
  },
  {
    id: 'copy.output_schema.photo',
    category: 'copywriter',
    label: 'Schema outputu (bez tekstu)',
    description: 'variantFields gdy visualType = photo',
    content: '"post_copy", "visual_brief", "rationale"',
    content_type: 'text',
    sort_order: 8,
  },
  {
    id: 'copy.visual_brief.graphic',
    category: 'copywriter',
    label: 'Instrukcja visual brief — grafika',
    description: 'visualBriefInstructions["graphic"]',
    content: 'Brief dla grafika (3-5 zdań): nastrój, wizualna metafora, typ ilustracji (abstrakcyjna/ikonograficzna/typograficzna/kolażowa), atmosfera. BEZ logo, BEZ hex kolorów, BEZ layoutu.',
    content_type: 'text',
    sort_order: 9,
  },
  {
    id: 'copy.visual_brief.photo',
    category: 'copywriter',
    label: 'Instrukcja visual brief — foto',
    description: 'visualBriefInstructions["photo"]',
    content: 'Brief dla fotografa (3-5 zdań): typ zdjęcia, kadrowanie, oświetlenie i mood, stylizacja/props/tło. BEZ logo, BEZ kolorów marki. Na zdjęciu NIE będzie tekstu.',
    content_type: 'text',
    sort_order: 10,
  },
  {
    id: 'copy.visual_brief.photo_text',
    category: 'copywriter',
    label: 'Instrukcja visual brief — foto+tekst',
    description: 'visualBriefInstructions["photo_text"]',
    content: 'Brief dla fotografa pod tekst (3-5 zdań): typ zdjęcia, kadrowanie z przestrzenią na nałożenie tekstu (jasna/ciemna strefa, bokeh, negatywna przestrzeń), oświetlenie, stylizacja. Wskaż gdzie powinien być tekst.',
    content_type: 'text',
    sort_order: 11,
  },
  {
    id: 'copy.banned_words',
    category: 'copywriter',
    label: 'Zakazane klisze marketingowe',
    description: 'Zakazane słowa w sekcji MARKETING',
    content: 'kompleksowy\nkluczowy\nsynergia\nw dzisiejszym świecie',
    content_type: 'list',
    sort_order: 12,
  },
  {
    id: 'copy.banned_words_hr',
    category: 'copywriter',
    label: 'Zakazane klisze HR',
    description: 'Zakazane w sekcji LUDZKI GŁOS',
    content: 'zasłużona odnowa\ndoceniamy waszą pasję',
    content_type: 'list',
    sort_order: 13,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE CARD
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'vc.analyzer_prompt',
    category: 'voice_card',
    label: 'Prompt analizy głosu',
    description: 'analyzerPrompt w voice-card/route.ts — framework 10 wymiarów',
    content: `Jesteś światowej klasy lingwistą marki i strategiem komunikacji. Twoim zadaniem jest odtworzenie unikalnego głosu i tonu marki na podstawie prawdziwych próbek treści.

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
5. Zwróć CAŁĄ treść (opisy, podsumowania, przykłady) po polsku.`,
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'vc.json_schema',
    category: 'voice_card',
    label: 'Schema JSON odpowiedzi',
    description: 'Oczekiwana struktura JSON na końcu analyzerPrompt',
    content: `{
  "brand_name": "",
  "voice_summary": "Jedno zdanie oddające cały głos marki",
  "archetype": "Archetyp komunikacji",
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
}`,
    content_type: 'json',
    sort_order: 2,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BRAND SCAN / ANALIZA
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'brand.analyze.brandbook',
    category: 'brand_analysis',
    label: 'Prompt analizy brandbooka',
    description: 'analysisPrompt gdy source = brandbook',
    content: `Jesteś doświadczonym analitykiem identyfikacji wizualnej marki. Przeczytaj ten brand book (PDF) i wyodrębnij WSZYSTKIE informacje o identyfikacji wizualnej w uporządkowane sekcje.

KRYTYCZNE ZASADY:
1. Zwróć WYŁĄCZNIE poprawny JSON — bez markdown, bez wyjaśnień, bez tekstu poza JSON-em
2. Wyodrębnij KAŻDĄ sekcję, którą znajdziesz w brand booku
3. Dla standardowych sekcji (lista poniżej) użyj dokładnych podanych ID
4. Dla treści unikalnych/specjalnych spoza listy standardowej — utwórz sekcję niestandardową z id zaczynającym się od "custom_"
5. Treść musi być precyzyjna i konkretna — podawaj dokładne hex codes, dokładne wymiary, dokładne zasady
6. Zwróć CAŁĄ treść (tytuły sekcji, opisy, brandRules) po polsku`,
    content_type: 'text',
    sort_order: 1,
  },
  {
    id: 'brand.analyze.references',
    category: 'brand_analysis',
    label: 'Prompt analizy referencji',
    description: 'analysisPrompt gdy source != brandbook',
    content: `Jesteś analitykiem identyfikacji wizualnej marki. Przeanalizuj grafiki referencyjne.

ZASADY:
- Zwróć WYŁĄCZNIE poprawny JSON — bez markdown, bez wyjaśnień
- Bądź dokładny i precyzyjny — każda sekcja powinna mieć 2-5 zdań z konkretnymi wartościami
- Opisuj tylko powtarzające się, niezmienne wzorce
- Podawaj dokładne hex codes, dokładne nazwy fontów, dokładne wymiary, gdy są widoczne
- Im więcej szczegółów, tym lepiej — to napędza jakość generowania grafik przez AI
- Zwróć CAŁĄ treść (tytuły, opisy) po polsku`,
    content_type: 'text',
    sort_order: 2,
  },
  {
    id: 'brand.analyze.section_ids',
    category: 'brand_analysis',
    label: 'Standardowe ID sekcji',
    description: 'Lista ID sekcji w prompcie analizy',
    content: JSON.stringify([
      { id: 'modul', desc: 'Moduł konstrukcyjny, marginesy, pola ochronne, wymiary' },
      { id: 'tlo', desc: 'Kolor/obróbka tła' },
      { id: 'gradient', desc: 'Gradient marki (kolory, kierunek, zasady użycia)' },
      { id: 'kolorystyka', desc: 'Główna paleta kolorów z hex codes' },
      { id: 'kolorystyka_dodatkowa', desc: 'Kolory dodatkowe/uzupełniające' },
      { id: 'typografia', desc: 'Typografia — fonty, grubości, rozmiary, kerning, interlinia, zasady' },
      { id: 'logo', desc: 'Logotyp — wersje, umiejscowienie, rozmiar, pole ochronne' },
      { id: 'blob', desc: 'Elementy dekoracyjne, kształty, elementy organiczne' },
      { id: 'copy', desc: 'Zasady tekstu/copy — wielkość liter, wyrównanie, hierarchia' },
      { id: 'cta', desc: 'Call to Action — konstrukcja, kolory, rozmiary, umiejscowienie' },
      { id: 'stickery', desc: 'Stickery, badge, etykiety, stemple, patki' },
      { id: 'packshot', desc: 'Zasady fotografii produktowej' },
      { id: 'legal', desc: 'Tekst prawny — rozmiar, kolor, umiejscowienie' },
      { id: 'animacje', desc: 'Zasady animacji (jeśli występują)' },
    ], null, 2),
    content_type: 'json',
    sort_order: 3,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPLATE / PRECISION
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'template.generate_prompt',
    category: 'template',
    label: 'Prompt generowania layoutu',
    description: 'prompt w template/generate/route.ts',
    content: `You are a graphic design system engineer. Based on the brand identity data below, generate a precise template layout JSON for a social media graphic.

CRITICAL: Return JSON using ONLY the zones-based schema below. Do NOT use fields like centralElement, decoration, copy.position, copy.alignment — they are not supported.

RULES:
- Return ONLY valid JSON — no markdown, no code blocks, no explanation
- Use exact hex colors from brand identity
- All pixel values as plain numbers (no units, no strings)
- gridArea format: "rowStart / colStart / rowEnd / colEnd" on a 12-row x 12-column grid
- Full width = columns 1 to 13, full height = rows 1 to 13
- logo zone: always "justifyContent": "flex-start" if brand has top-left logo placement
- Adapt zones to brand — if brand uses white space at bottom, enable whiteSpace and add a footer zone
- DO NOT include centralElement or decoration as top-level fields
- background.type can be "gradient" — if so add gradientFrom, gradientTo, gradientAngle (degrees)`,
    content_type: 'text',
    sort_order: 1,
  },
];

export async function POST() {
  let inserted = 0;
  let skipped = 0;

  for (const entry of SEED_DATA) {
    const existing = await getDb()`SELECT id FROM system_prompts WHERE id = ${entry.id}`;
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await getDb()`
      INSERT INTO system_prompts (id, category, label, description, content, content_type, sort_order)
      VALUES (${entry.id}, ${entry.category}, ${entry.label}, ${entry.description}, ${entry.content}, ${entry.content_type}, ${entry.sort_order})
    `;
    inserted++;
  }

  invalidateCache();

  return NextResponse.json({
    ok: true,
    inserted,
    skipped,
    total: SEED_DATA.length,
  });
}
