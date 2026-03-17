export type BrandSectionInput = {
  id: string;
  title: string;
  content: string;
  order: number;
  icon?: string;
  source?: string;
  confidence?: string;
  type?: string;
};

export type MergedBrandSection = {
  id: string;            // primary section id (used for saving edits)
  canonicalType: string;
  title: string;         // canonical Polish title
  content: string;       // merged content for display + prompt
  primaryContent: string; // primary source content only (for edit textarea)
  order: number;
  icon?: string;
  sources: string[];     // all contributing sources
  source?: string;       // primary source (highest priority)
  type?: string;
  confidence?: string;
};

// Canonical type → list of title aliases (lowercase, partial match)
const CANONICAL_SECTION_TYPES: Record<string, string[]> = {
  colors: [
    'colors', 'kolory', 'kolory marki', 'background', 'color palette',
    'paleta kolorów', 'barwy', 'palette', 'kolorystyka',
  ],
  typography: [
    'typography', 'typografia', 'fonts', 'fonty', 'font', 'typeface', 'czcionki',
  ],
  tone: [
    'tone of voice', 'tone & mood', 'ton głosu i komunikacja', 'ton głosu',
    'brand voice', 'komunikacja', 'nastrój', 'mood', 'voice', 'tone',
  ],
  visual_style: [
    'styl wizualny', 'visual style', 'graphic elements', 'elementy graficzne',
    'imagery', 'photo style', 'visual_style',
  ],
  values: [
    'wartości marki', 'brand values', 'wartości', 'values', 'modul',
  ],
  target_audience: [
    'grupa docelowa', 'target audience', 'target_audience', 'odbiorcy', 'target',
  ],
  cta: [
    'call to action', 'call-to-action', 'wezwanie do działania', 'cta_style', 'cta',
  ],
  layout: [
    'kompozycja i layout', 'composition', 'kompozycja', 'grid', 'structure', 'struktura', 'layout',
  ],
};

// Canonical display order in UI and prompt
const CANONICAL_ORDER = [
  'colors', 'typography', 'tone', 'visual_style', 'values', 'target_audience', 'cta', 'layout',
];

const CANONICAL_TITLES: Record<string, string> = {
  colors:          'Kolory marki',
  typography:      'Typografia',
  tone:            'Ton głosu i komunikacja',
  visual_style:    'Styl wizualny',
  values:          'Wartości marki',
  target_audience: 'Grupa docelowa',
  cta:             'Call to Action',
  layout:          'Kompozycja i layout',
};

const SOURCE_PRIORITY: Record<string, number> = {
  brandbook:  4,
  manual:     3,
  references: 2,
  brand_scan: 1,
};

export function getCanonicalType(sectionTitle: string): string {
  const normalized = sectionTitle.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(CANONICAL_SECTION_TYPES)) {
    if (aliases.some(alias => normalized === alias || normalized.includes(alias) || alias.includes(normalized))) {
      return canonical;
    }
  }
  return normalized;
}

export function getCanonicalTitle(type: string): string {
  return CANONICAL_TITLES[type] || type;
}

export function mergeBrandSections(sections: BrandSectionInput[]): MergedBrandSection[] {
  // Sort by source priority descending, then by order
  const sorted = [...sections].sort((a, b) => {
    const pa = SOURCE_PRIORITY[a.source || 'manual'] ?? 0;
    const pb = SOURCE_PRIORITY[b.source || 'manual'] ?? 0;
    if (pa !== pb) return pb - pa;
    return a.order - b.order;
  });

  const mergedMap = new Map<string, MergedBrandSection>();

  for (const section of sorted) {
    const canonicalType = getCanonicalType(section.title);

    if (!mergedMap.has(canonicalType)) {
      mergedMap.set(canonicalType, {
        id: section.id,
        canonicalType,
        title: getCanonicalTitle(canonicalType),
        content: section.content,
        primaryContent: section.content,
        order: section.order,
        icon: section.icon,
        sources: section.source ? [section.source] : [],
        source: section.source,
        type: section.type,
        confidence: section.confidence,
      });
    } else {
      const existing = mergedMap.get(canonicalType)!;
      if (section.source && !existing.sources.includes(section.source)) {
        existing.sources.push(section.source);
      }
      // Append secondary content (primary stays first, separator makes it clear)
      if (section.content && section.content.trim() !== existing.primaryContent.trim()) {
        existing.content = `${existing.primaryContent}\n\n---\n\n${section.content}`;
      }
    }
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    const oa = CANONICAL_ORDER.indexOf(a.canonicalType);
    const ob = CANONICAL_ORDER.indexOf(b.canonicalType);
    if (oa !== -1 && ob !== -1) return oa - ob;
    if (oa !== -1) return -1;
    if (ob !== -1) return 1;
    return a.order - b.order;
  });
}
