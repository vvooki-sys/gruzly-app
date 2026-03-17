import { neon } from '@neondatabase/serverless';

const getDb = () => neon(process.env.DATABASE_URL!);

function isLightColor(hex: string): boolean {
  try {
    const h = hex.replace('#', '');
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128;
  } catch {
    return false;
  }
}

function ensureHex(color: string): string {
  if (!color) return '';
  if (color.startsWith('#')) return color;
  return '#' + color;
}

interface BrandContent {
  hero: { tagline: string; description: string };
  mission: string;
  vision: string;
  values: Array<{ name: string; description: string }>;
  logo_guidelines: { usage_rules: string[]; do_list: string[]; dont_list: string[] };
  color_descriptions: { primary: string; secondary: string; accent: string };
  typography_guidelines: { heading: string; body: string; rules: string[] };
  imagery_guidelines: { do_list: string[]; dont_list: string[]; style_description: string };
  tone_of_voice: { description: string; do_list: string[]; dont_list: string[]; example_phrases: string[] };
}

function ColorSwatch({ color, name, description, textColor }: { color: string; name: string; description: string; textColor: string }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${textColor}22` }}>
      <div className="h-28" style={{ backgroundColor: color }} />
      <div className="p-5" style={{ backgroundColor: `${textColor}0a` }}>
        <p className="font-bold text-sm" style={{ color: textColor }}>{name}</p>
        <p className="text-xs mt-0.5 font-mono" style={{ color: `${textColor}70` }}>{color}</p>
        <p className="text-sm mt-2" style={{ color: `${textColor}90` }}>{description}</p>
      </div>
    </div>
  );
}

export default async function BrandBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${parseInt(id)}`;

  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center text-white">
          <p className="text-2xl font-bold">Brand Guide not found</p>
          <p className="opacity-50 mt-2">This project does not exist.</p>
        </div>
      </div>
    );
  }

  const bsd = (project.brand_scan_data || {}) as Record<string, unknown>;
  const content = (bsd.brandbook_content as BrandContent) || null;

  const primaryColor = ensureHex((bsd.primaryColor as string) || '') || '#1B334B';
  const secondaryColor = ensureHex((bsd.secondaryColor as string) || '') || '#223D55';
  const accentColor = ensureHex((bsd.accentColor as string) || '') || '#B3F5DC';

  const isLight = isLightColor(primaryColor);
  const textColor = isLight ? '#111827' : '#F5F5F0';
  const textMuted = isLight ? '#11182799' : '#F5F5F0AA';

  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)} AND type = 'logo' ORDER BY created_at ASC`;
  const logoAssets = assets as Array<{ url: string; variant?: string }>;
  const logoUrl = logoAssets.find(a => a.variant === 'default')?.url || logoAssets[0]?.url || '';

  const headingFont = (bsd.headingFont as string) || (bsd.fonts as string[])?.[0] || '';
  const bodyFont = (bsd.bodyFont as string) || (bsd.fonts as string[])?.[1] || (bsd.fonts as string[])?.[0] || '';

  if (!content) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8" style={{ backgroundColor: primaryColor }}>
        <div className="text-center max-w-md">
          {logoUrl && <img src={logoUrl} alt={project.name as string} className="h-14 object-contain mx-auto mb-8" />}
          <h1 className="text-3xl font-black mb-4" style={{ color: textColor }}>{project.name as string}</h1>
          <p className="text-base mb-3" style={{ color: textMuted }}>Brand Book has not been generated yet.</p>
          <p className="text-sm" style={{ color: textMuted }}>Open the project in Gruzly and click &ldquo;Generate Brand Book&rdquo;.</p>
        </div>
      </div>
    );
  }

  const divider = <div className="w-full max-w-5xl mx-auto" style={{ height: 1, backgroundColor: `${textColor}18` }} />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: primaryColor, color: textColor }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-8 py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse 90% 60% at 50% 40%, ${accentColor}1a 0%, transparent 70%)`
        }} />
        {logoUrl && (
          <img src={logoUrl} alt={project.name as string} className="h-14 mb-10 object-contain relative z-10" />
        )}
        <p className="text-xs font-bold tracking-[0.3em] uppercase mb-5 relative z-10" style={{ color: accentColor }}>
          Brand Guidelines
        </p>
        <h1 className="text-5xl sm:text-7xl font-black mb-6 leading-none relative z-10 max-w-3xl" style={{ color: textColor }}>
          {project.name as string}
        </h1>
        <p className="text-xl sm:text-2xl font-bold mb-6 relative z-10 max-w-2xl" style={{ color: accentColor }}>
          {content.hero.tagline}
        </p>
        <p className="text-base sm:text-lg max-w-xl leading-relaxed relative z-10" style={{ color: textMuted }}>
          {content.hero.description}
        </p>
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1" style={{ color: textMuted }}>
          <div className="w-px h-14" style={{ background: `linear-gradient(to bottom, transparent, ${accentColor}80)` }} />
          <span className="text-xs tracking-widest uppercase" style={{ color: `${accentColor}80` }}>scroll</span>
        </div>
      </section>

      {divider}

      {/* ── MISSION / VISION / VALUES ─────────────────────────────────────── */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 mb-20">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] uppercase mb-5" style={{ color: accentColor }}>Mission</p>
            <p className="text-xl leading-relaxed" style={{ color: textColor }}>{content.mission}</p>
          </div>
          <div>
            <p className="text-xs font-bold tracking-[0.25em] uppercase mb-5" style={{ color: accentColor }}>Vision</p>
            <p className="text-xl leading-relaxed" style={{ color: textColor }}>{content.vision}</p>
          </div>
        </div>
        <p className="text-xs font-bold tracking-[0.25em] uppercase mb-10" style={{ color: accentColor }}>Values</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {(content.values || []).map((v, i) => (
            <div key={i} className="p-6 rounded-2xl" style={{ backgroundColor: `${textColor}08`, border: `1px solid ${textColor}12` }}>
              <div className="w-8 h-0.5 mb-5" style={{ backgroundColor: accentColor }} />
              <p className="font-bold text-lg mb-2" style={{ color: textColor }}>{v.name}</p>
              <p className="text-sm leading-relaxed" style={{ color: textMuted }}>{v.description}</p>
            </div>
          ))}
        </div>
      </section>

      {divider}

      {/* ── LOGO ─────────────────────────────────────────────────────────── */}
      {logoUrl && (
        <>
          <section className="py-24 px-8 max-w-5xl mx-auto">
            <p className="text-xs font-bold tracking-[0.25em] uppercase mb-10" style={{ color: accentColor }}>Logo</p>
            <div className="grid sm:grid-cols-2 gap-5 mb-12">
              <div className="p-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: isLight ? '#111827' : '#F5F5F0' }}>
                <img src={logoUrl} alt={project.name as string} className="max-h-20 max-w-full object-contain" />
              </div>
              <div className="p-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: isLight ? '#F5F5F0' : '#111827' }}>
                <img src={logoUrl} alt={project.name as string} className="max-h-20 max-w-full object-contain" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-10">
              <div>
                <p className="font-semibold text-sm mb-4" style={{ color: accentColor }}>✓ Do</p>
                <ul className="space-y-3">
                  {content.logo_guidelines.do_list.map((d, i) => (
                    <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                      <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>→</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-sm mb-4" style={{ color: textMuted }}>✗ Don&apos;t</p>
                <ul className="space-y-3">
                  {content.logo_guidelines.dont_list.map((d, i) => (
                    <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                      <span className="shrink-0 mt-0.5" style={{ color: `${textColor}50` }}>×</span>{d}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
          {divider}
        </>
      )}

      {/* ── COLORS ───────────────────────────────────────────────────────── */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <p className="text-xs font-bold tracking-[0.25em] uppercase mb-10" style={{ color: accentColor }}>Colors</p>
        <div className="grid sm:grid-cols-3 gap-5">
          {primaryColor && (
            <ColorSwatch color={primaryColor} name="Primary" description={content.color_descriptions?.primary || ''} textColor={textColor} />
          )}
          {secondaryColor && secondaryColor !== primaryColor && (
            <ColorSwatch color={secondaryColor} name="Secondary" description={content.color_descriptions?.secondary || ''} textColor={textColor} />
          )}
          {accentColor && (
            <ColorSwatch color={accentColor} name="Accent" description={content.color_descriptions?.accent || ''} textColor={textColor} />
          )}
        </div>
      </section>

      {divider}

      {/* ── TYPOGRAPHY ────────────────────────────────────────────────────── */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <p className="text-xs font-bold tracking-[0.25em] uppercase mb-12" style={{ color: accentColor }}>Typography</p>
        <div className="space-y-14">
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <span className="text-8xl font-black leading-none shrink-0" style={{ color: textColor, fontFamily: headingFont || undefined }}>
              Aa
            </span>
            <div className="pb-2">
              <p className="font-bold text-xl mb-1" style={{ color: textColor }}>{headingFont || 'Heading Font'}</p>
              <p className="text-sm" style={{ color: textMuted }}>{content.typography_guidelines?.heading}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-5">
            <span className="text-5xl font-normal leading-none shrink-0" style={{ color: textColor, fontFamily: bodyFont || undefined }}>
              Aa
            </span>
            <div className="pb-2">
              <p className="font-bold text-xl mb-1" style={{ color: textColor }}>{bodyFont || 'Body Font'}</p>
              <p className="text-sm" style={{ color: textMuted }}>{content.typography_guidelines?.body}</p>
            </div>
          </div>
        </div>
        {(content.typography_guidelines?.rules?.length ?? 0) > 0 && (
          <ul className="mt-12 space-y-2">
            {content.typography_guidelines.rules.map((r, i) => (
              <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                <span style={{ color: accentColor }}>→</span>{r}
              </li>
            ))}
          </ul>
        )}
      </section>

      {divider}

      {/* ── IMAGERY ───────────────────────────────────────────────────────── */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <p className="text-xs font-bold tracking-[0.25em] uppercase mb-4" style={{ color: accentColor }}>Imagery</p>
        <p className="text-lg mb-12 max-w-2xl leading-relaxed" style={{ color: textMuted }}>{content.imagery_guidelines?.style_description}</p>
        <div className="grid sm:grid-cols-2 gap-10">
          <div>
            <p className="font-semibold text-sm mb-5" style={{ color: accentColor }}>✓ Do</p>
            <ul className="space-y-3">
              {(content.imagery_guidelines?.do_list || []).map((d, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                  <span className="shrink-0 mt-0.5" style={{ color: accentColor }}>→</span>{d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-sm mb-5" style={{ color: textMuted }}>✗ Don&apos;t</p>
            <ul className="space-y-3">
              {(content.imagery_guidelines?.dont_list || []).map((d, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                  <span className="shrink-0 mt-0.5" style={{ color: `${textColor}50` }}>×</span>{d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {divider}

      {/* ── TONE OF VOICE ─────────────────────────────────────────────────── */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <p className="text-xs font-bold tracking-[0.25em] uppercase mb-5" style={{ color: accentColor }}>Tone of Voice</p>
        <p className="text-xl mb-14 max-w-2xl leading-relaxed" style={{ color: textColor }}>{content.tone_of_voice?.description}</p>
        <div className="grid sm:grid-cols-2 gap-10 mb-14">
          <div>
            <p className="font-semibold text-sm mb-5" style={{ color: accentColor }}>Always</p>
            <ul className="space-y-3">
              {(content.tone_of_voice?.do_list || []).map((d, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                  <span style={{ color: accentColor }}>→</span>{d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-semibold text-sm mb-5" style={{ color: textMuted }}>Never</p>
            <ul className="space-y-3">
              {(content.tone_of_voice?.dont_list || []).map((d, i) => (
                <li key={i} className="flex gap-3 text-sm" style={{ color: textMuted }}>
                  <span style={{ color: `${textColor}50` }}>×</span>{d}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {(content.tone_of_voice?.example_phrases?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs font-bold tracking-[0.25em] uppercase mb-6" style={{ color: textMuted }}>Example phrases</p>
            <div className="space-y-3">
              {content.tone_of_voice.example_phrases.map((p, i) => (
                <div key={i} className="px-6 py-4 rounded-xl text-sm italic" style={{
                  backgroundColor: `${accentColor}15`,
                  color: textColor,
                  borderLeft: `3px solid ${accentColor}60`,
                }}>
                  &ldquo;{p}&rdquo;
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="py-14 text-center px-8" style={{ borderTop: `1px solid ${textColor}18` }}>
        <p className="text-sm" style={{ color: textMuted }}>
          {project.name as string} Brand Guidelines &middot; Generated by{' '}
          <span className="font-bold" style={{ color: accentColor }}>Gruzly</span>
          {' '}&middot; {new Date().getFullYear()}
        </p>
        {(project.scanned_url as string) && (
          <p className="text-xs mt-2" style={{ color: `${textColor}50` }}>
            <a href={project.scanned_url as string} target="_blank" rel="noopener noreferrer">
              {project.scanned_url as string}
            </a>
          </p>
        )}
      </footer>
    </div>
  );
}
