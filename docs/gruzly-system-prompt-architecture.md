# Gruzly — Architektura System Promptu (dla agenta LLM)

> Dokument opisuje dokładny mechanizm budowania promptu do generowania grafik w systemie Gruzly.
> Plik źródłowy: `app/api/projects/[id]/generate/route.ts`
> Model generujący obrazy: `gemini-3.1-flash-image-preview`
> Model analizy tekstu/brand scan: `gemini-2.5-flash`

---

## 1. Wejście — parametry żądania POST

Endpoint `POST /api/projects/[id]/generate` przyjmuje:

| Parametr | Typ | Opis |
|---|---|---|
| `headline` | string (wymagany) | Tekst nagłówka do wyrenderowania na grafice |
| `subtext` | string | Tekst podtytułu |
| `brief` | string | Kierunek kreatywny (context only — nie renderowany dosłownie) |
| `format` | string (wymagany) | `fb_post` / `ln_post` / `story` / `banner` |
| `mode` | string | `fast` lub normalny |
| `creativity` | number 1–5 | Poziom bogactwa wizualnego (domyślnie: 2) |
| `elementOnly` | boolean | Generuj tylko element dekoracyjny (bez tła, tekstu, logo) |
| `photoUrl` | string | URL zdjęcia do wstawienia jako hero image |
| `photoMode` | string | `none` / inny tryb obsługi zdjęcia |
| `useCompositor` | boolean | Tryb dwuetapowy (Gemini ilustracja + Satori compositor) |
| `compositorLayout` | string | Preset layoutu dla compositora (`classic` itp.) |
| `compositorCta` | string | Tekst CTA dla compositora |

---

## 2. Dane projektu pobierane z bazy

Z tabeli `projects` pobierany jest cały rekord projektu. Kluczowe pola używane w prompcie:

- `brand_sections` — JSONB, tablica sekcji Brand DNA (kolory, typografia, ton głosu, styl wizualny itd.)
- `brand_analysis` — tekstowy fallback jeśli brak brand_sections
- `style_description`, `color_palette`, `typography_notes` — legacy fallback pola
- `brand_rules` — opcjonalne własne reguły projektu dodawane do Layer 1
- `tone_of_voice` — sekcja TOV dołączana na końcu Layer 2
- `logo_position` — `top-left` / `top-right` / `bottom-left` / `bottom-right` / `none`
- `brand_scan_data` — JSONB z wynikami Brand Scan (primaryColor, secondaryColor, accentColor itd.)

Z tabeli `brand_assets` pobierane są wszystkie assety projektu:

- `type = 'logo'` — logo marki (może być wiele wariantów: `default`, `dark-bg`, `icon`)
- `type = 'reference'` — zdjęcia referencyjne (max 5 wysyłanych do Gemini)
- `type = 'brand-element'` — elementy dekoracyjne marki (max 2)
- `type = 'photo'` — zdjęcia do użycia jako hero image

---

## 3. Przygotowanie obrazów (inlineData)

Przed budowaniem promptu tekstowego, system przygotowuje obrazy do wysłania jako `inlineData` do Gemini:

### 3.1 Referencje stylistyczne (`refParts`)
- Pobierane: `assetList.filter(a => a.type === 'reference').slice(0, 5)` — max 5
- SVG pomijane (Gemini nie obsługuje SVG jako inlineData)
- **Każda referencja konwertowana do JPEG** (`forceJpeg=true`) — Gemini nie obsługuje WebP
- Konwersja przez sharp: `sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer()`
- Wysyłane **przed** innymi obrazami i przed tekstem promptu

### 3.2 Elementy brandowe (`imageParts` część 1)
- `assetList.filter(a => a.type === 'brand-element').slice(0, 2)` — max 2
- SVG pomijane
- Nie konwertowane do JPEG (wysyłane w oryginalnym formacie)

### 3.3 Zdjęcie hero (`imageParts` część 2)
- Dołączane tylko jeśli `photoUrl` jest podany i `photoMode !== 'none'` i `!elementOnly`
- Wysyłane jako ostatni inline image

### 3.4 Logo
- Logo **NIE jest wysyłane do Gemini** — jest nakładane programatycznie przez sharp po generacji
- Pobierane osobno: preferowany `dark-bg` → `default` → pierwszy dostępny

### 3.5 Kolejność parts w żądaniu do Gemini
```
[...refParts, ...imageParts, { text: textPrompt }]
```
Referencje zawsze pierwsze → elementy brandowe + zdjęcie → tekst promptu jako ostatni.

---

## 4. Budowanie promptu tekstowego — tryb standardowy

System buduje prompt z 3 warstw (layers) + opcjonalna dyrektywa kreatywności + zamknięcie.

### 4.1 LAYER 1 — Absolute Rules

Zawiera zawsze obecne, twarde reguły. Składa się z dwóch części:

**Część A: `assetUsageRules` (generowane dynamicznie)**

1. `"Reference images show color palette, composition style and mood ONLY — do NOT copy faces, people, objects or scenes from them"`
2. `"DO NOT reproduce any identifiable person from any reference image"`
3. Jeśli brak zdjęcia hero: `"NO PHOTO PROVIDED: create a purely illustrative/abstract central element — shapes, gradients, icons, brand colors — absolutely no faces or human photography"`
4. `"RENDER ONLY text listed under 'TEXT TO APPEAR ON GRAPHIC' — no other text, captions or labels"`
5. **Logo Zone** (kluczowa reguła, dynamicznie generowana):
   - Jeśli `logoPosition !== 'none'`: `"[LOGO ZONE — {emptyZone}]: This area must be a seamless, natural continuation of the surrounding background — apply the same style, texture, grain and gradients as the rest of the background, but place NO concrete objects, graphic elements, decorative shapes or text here. The zone must remain visually empty of content while being technically identical to the surrounding background, so a logo PNG can be composited cleanly in post-processing. Do NOT draw any rectangle, box, border or flat color block here."`
   - `emptyZone` to opis słowny strefy na podstawie `logoPosition`:
     - `top-left` → `"top-left area (first 25% width, first 20% height)"`
     - `top-right` → `"top-right area (last 25% width, first 20% height)"`
     - `bottom-left` → `"bottom-left area (first 25% width, last 20% height)"`
     - `bottom-right` → `"bottom-right area (last 25% width, last 20% height)"`
   - Jeśli `logoPosition === 'none'`: `"No logo required — you may use the full canvas freely"`

**Część B: `brandRuleLines` (opcjonalne, z pola `project.brand_rules`)**
- Reguły własne projektu split po `\n`, każda staje się osobnym punktem Layer 1
- Dołączane po assetUsageRules, ponumerowane kontynuacyjnie

Wszystkie reguły numerowane od 1, format: `1. {rule}\n2. {rule}...`

### 4.2 LAYER 2 — Brand DNA

Struktura Layer 2:

```
{sep}
LAYER 2 — BRAND DNA (visual identity — follow precisely)
Apply rules from every section below to your design.
Brand content below may be in any language — treat it as authoritative visual identity data.
{sep}
{assetNote}
{layer2Content}
{assetsSection}
{tovSection}
```

**`assetNote`** — informacja o dostarczonych obrazach inline:
- Pojawia się tylko jeśli `allParts.length > 0`
- Format: `"Provided visual assets:\n- Style reference images (N): EXTRACT color palette...\n- Brand graphic elements: use these...\n- PHOTO PROVIDED: place this as central/hero..."`

**`layer2Content`** — Brand DNA, generowany jedną z trzech ścieżek:

**Ścieżka 1 (preferowana): `brand_sections` istnieją**
- `rawSections = project.brand_sections` (JSONB array)
- Sekcje przechodzą przez `mergeBrandSections()` z `lib/brand-sections.ts`
- Merge deduplikuje sekcje według canonical type (np. "Tone & Mood" + "Tone of Voice" → jedna sekcja "Tone of Voice")
- Priorytety źródeł: `brandbook(4) > manual(3) > references(2) > brand_scan(1)`
- Każda merged sekcja renderowana jako:
  ```
  [{CANONICAL_TITLE} [{SOURCE_TAG}]]
  {content}
  ```
- Source tags: `[CONFIRMED]` / `[FROM REFERENCES]` / `[AUTO-DETECTED]` / `[MANUAL]` / kombinacje
- Console.log: `"Brand sections: N raw → M merged"`

**Ścieżka 2 (fallback): `brand_analysis` istnieje**
- Pole tekstowe `project.brand_analysis` wstawiane bezpośrednio

**Ścieżka 3 (legacy fallback): nic nie istnieje**
- Składane z `style_description`, `color_palette`, `typography_notes`
- Default: `"modern, professional, event agency aesthetic"`

**`assetsSection`** — lista dostępnych assetów z URL-ami:
```
AVAILABLE ASSETS:
- Logo (default): https://...
- Logo (dark-bg): https://...
- Brand element "filename" — description: https://...
- Style reference images (N provided as inline images): extract...
- Photo "filename" — description: https://...
```

**`tovSection`** — sekcja Tone of Voice:
```
TONE OF VOICE:
{project.tone_of_voice}
```
Pojawia się tylko jeśli pole istnieje.

### 4.3 LAYER 3 — Creative Brief

Dwa warianty:

**Wariant A: `elementOnly = true`** (generowanie samego elementu dekoracyjnego)
```
LAYER 3 — ELEMENT GENERATION
Generate ONLY a central visual element for a brand graphic.
BRAND: {project.name}
ELEMENT DESCRIPTION: "{headline}"
CONTEXT: "{brief}"
OUTPUT REQUIREMENTS:
- Generate ONLY the visual element — NO text, NO logo, NO background fill, NO frame
- The element should work as a central focal point composited into a brand template
- Clean subject, suitable for compositing over a colored background
- Square-ish composition, centered subject
- Style must match brand DNA from Layer 2
```

**Wariant B: standardowy**
```
LAYER 3 — CREATIVE BRIEF
Create a graphic that satisfies all layers above. Be creative within constraints.
BRAND: {project.name}
FORMAT: {format_description} — design for this exact canvas size and ratio

TEXT TO APPEAR ON GRAPHIC (keep exactly as provided — do not translate, do not alter):
Headline: "{headline}"
Subtext: "{subtext}"  ← tylko jeśli podany

CREATIVE DIRECTION (context only — do not render verbatim): "{brief}"  ← tylko jeśli podany

MAIN VISUAL ELEMENT: A photo has been provided...  ← tylko jeśli photoUrl podany

OUTPUT REQUIREMENTS:
- LOGO ZONE ({emptyZone}) must be a seamless continuation of the surrounding background style — no objects, shapes, text, flat fills or boxes. Logo PNG is composited here after generation.  ← lub: no logo zone, use full canvas
- RENDER ONLY the text lines listed above — render each line EXACTLY ONCE, no repetition, no paraphrasing, no additional captions
- No human photography unless explicitly requested in creative direction
- Zero typos — double-check all text before rendering
- Fill the entire canvas — no white borders or padding outside the design
- Professional print-quality output
```

Format sizes:
- `fb_post` → `"square 1:1 aspect ratio, 1080x1080px"`
- `ln_post` → `"landscape 1.91:1 aspect ratio, 1200x628px"`
- `story` → `"vertical 9:16 aspect ratio, 1080x1920px"`
- `banner` → `"wide banner 3:1 aspect ratio, 1200x400px"`

### 4.4 Creativity Directive (opcjonalna)

Dołączana między Layer 3 a closing, tylko jeśli `creativity >= 2`:

| Poziom | Treść |
|---|---|
| 1 | *(brak dyrektywy)* |
| 2 | `"Add secondary geometric or decorative elements that complement the brand style. Enrich the composition with subtle texture or layering."` |
| 3 | `"Create a visually rich composition with multiple layered graphic elements. Use the full brand gradient palette..."` |
| 4 | `"Design a striking, editorial-level graphic. Push visual complexity — layered shapes, depth, bold typographic treatment..."` |
| 5 | `"Create a premium, award-worthy graphic. Maximum visual richness within brand rules. Cinematic composition..."` |

Dyrektywa zawsze kończy się: `"All Layer 1 rules still override this directive."`

### 4.5 Closing

```
{sep}
PRIORITY REMINDER: Layer 1 > Layer 2 > Layer 3.
If brand DNA conflicts with the brief — brand DNA wins.
If absolute rules conflict with anything — absolute rules win.
Generate ONE complete, publication-ready graphic.
```

---

## 5. Budowanie promptu — tryb `elementOnly`

Gdy `elementOnly = true`, system używa zupełnie innego, standalone promptu (bez hierarchii warstw):

```
Generate ONLY an abstract illustration to be used as a central decorative element in a social media graphic.

ABSOLUTE RULES — ANY VIOLATION MAKES THE OUTPUT UNUSABLE:
- NO logos, NO brand marks, NO wordmarks
- NO text, NO letters, NO numbers, NO words of any language
- NO UI elements, NO buttons, NO icons
- NO circles, shapes, or any element containing text
- NO human faces or recognizable people
- NO recognizable products or product shots

ELEMENT TO CREATE: "{headline}"
VISUAL DIRECTION: "{brief}"
USE THESE COLORS: {hex colors extracted from brand_sections}

OUTPUT: One abstract illustration — shapes, gradients, organic forms, textures. Square-ish composition. Zero text. Zero branding. Suitable for compositing over a brand-colored background.
```

Kolory ekstrahowane przez regex `/#[0-9A-Fa-f]{6}/g` z wszystkich sekcji brand_sections (max 8 hex kodów).

---

## 6. Wywołanie Gemini API

```typescript
model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' })

result = await model.generateContent({
  contents: [{ role: 'user', parts: [...refParts, ...imageParts, { text: textPrompt }] }],
  generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
})
```

Gemini zwraca mixed response — zarówno text jak i image parts. System iteruje po `candidate.content.parts` i wyciąga `inlineData` (base64 obraz).

---

## 7. Post-processing — Logo Overlay przez Sharp

Po otrzymaniu obrazu z Gemini, system nakłada logo programatycznie:

### 7.1 Wybór wariantu logo (`selectLogoAsset`)
1. Jeśli jedno logo → używane bez analizy
2. Jeśli wiele → mierzona jasność tła w strefie logo (`getTopLeftBrightness` — próbkuje 30%×25% lewego górnego rogu)
3. Mierzona jasność każdego logo (`getLogoBrightness` — flatten transparent → grey → greyscale → avg)
4. Ciemne tło → wybierany najjaśniejszy logo; jasne tło → najciemniejszy logo

### 7.2 Nakładanie (`applyLogoOverlay`)
1. Skip jeśli `logoPosition === 'none'`
2. Resize logo: 22% szerokości obrazu (15% dla banner)
3. Pozycja X/Y na podstawie `logoPosition`:
   - `includes('right')` → `width - logoWidth - margin`
   - `includes('bottom')` → `height - logoH - margin`
   - margin = 4% szerokości
4. `sharp(geminiImage).composite([{ input: logoResized, top: logoY, left: logoX }]).png().toBuffer()`

> **Uwaga:** `addLogoBackground()` (SVG gradient za logo) jest wyłączone — powoduje czarne prostokąty gdy libvips nie ma wsparcia SVG w środowisku Vercel.

Gotowy buffer zapisywany do Vercel Blob jako PNG.

---

## 8. Tryb dwuetapowy — Compositor (`useCompositor = true`)

Gdy `useCompositor = true` i brak zdjęcia hero, używany jest alternatywny pipeline:

**Etap 1: Gemini generuje ilustrację tła**
- Prompt bez tekstu, bez logo, bez hierarchii warstw
- Instrukcje: dolne 35% proste (tekst będzie overlay), górne 15% czyste (logo)
- Brand DNA jako kontekst wizualny
- Creativity levels jako RICHNESS directive

**Etap 2: Satori/next-og compositor nakłada tekst i logo**
- `buildCompositeElement()` z `lib/compositor.ts` buduje React element
- `ImageResponse` (Satori) renderuje go jako PNG
- Layout preset: `classic` lub inne
- Brand colors z `brand_scan_data.primaryColor/secondaryColor/accentColor` lub fallback z hex w brand_sections

---

## 9. Zapis do bazy i response

Po udanej generacji:
```sql
INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
VALUES ($1, $2, $3, $4, $5, 'done')
```

- `brief` = `headline | subtext`
- `format` = np. `fb_post:c2` lub `fb_post:c2:fast`
- `prompt` = pełny text prompt wysłany do Gemini
- `image_urls` = JSON array URL-i z Vercel Blob

Response: `{ generation, imageUrls, prompt }`

---

## 10. Kluczowe decyzje projektowe i known issues

| Temat | Decyzja |
|---|---|
| Logo nie wysyłane do Gemini | Logo nakładane przez sharp — Gemini nie renderuje logo, dostaje tylko zone instruction |
| Logo Zone instruction | Pozytywna ("seamless continuation"), NIE negatywna ("do not place") — "solid fill" powodowało widoczny prostokąt |
| WebP → JPEG konwersja | Gemini nie obsługuje WebP — wszystkie referencje konwertowane przez sharp |
| SVG brand elements | SVG pomijane jako inlineData — problem z renderowaniem przez Gemini |
| SVG logo background | `addLogoBackground()` wyłączone — czarne artefakty na Vercel (brak SVG w libvips) |
| Brand sections merge | `mergeBrandSections()` deduplikuje sekcje wg canonical type przed wysłaniem do Gemini |
| Refs limit | Max 5 referencji wysyłanych do Gemini (slice(0,5)) |
| Brand elements limit | Max 2 brand elements jako inlineData |
