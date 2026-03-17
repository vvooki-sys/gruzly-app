import React from 'react';

export type LayoutPreset = 'classic' | 'centered' | 'minimal' | 'bold';
export type BrandColors = { primary?: string; secondary?: string; accent?: string };

export const COMPOSITOR_FORMAT_SIZES: Record<string, [number, number]> = {
  fb_post: [1080, 1080],
  ln_post: [1200, 628],
  story: [1080, 1920],
  banner: [1200, 400],
};

export interface ComposeOptions {
  illustrationUrl: string;
  headline: string;
  subtext: string;
  ctaText: string;
  logoUrl: string;
  format: string;
  layoutPreset: LayoutPreset;
  brandColors: BrandColors;
}

/** Build a Satori-compatible React element: illustration bg + text/logo overlay */
export function buildCompositeElement(
  opts: ComposeOptions & { width: number; height: number }
): React.ReactElement {
  const { illustrationUrl, headline, subtext, ctaText, logoUrl, width, height, layoutPreset, brandColors } = opts;

  const accent = brandColors.accent || brandColors.primary || '#00a589';
  const primary = brandColors.primary || '#1B334B';

  // Format type flags
  const isBanner = height < width * 0.45;   // 1200×400
  const isStory  = height > width * 1.5;    // 1080×1920

  // Responsive sizing
  const pad     = isBanner ? Math.round(width * 0.04) : Math.round(width * 0.065);
  const logoH   = isBanner ? Math.round(height * 0.32) : isStory ? Math.round(height * 0.045) : Math.round(height * 0.07);
  const hlSize  = isBanner ? Math.round(height * 0.24) : Math.round(width * 0.068);
  const stSize  = isBanner ? Math.round(height * 0.14) : Math.round(width * 0.032);
  const ctaSize = isBanner ? Math.round(height * 0.13) : Math.round(width * 0.030);

  // Shared background illustration (always full-bleed)
  const bgEl = React.createElement('img', {
    src: illustrationUrl,
    style: { position: 'absolute', top: 0, left: 0, width, height, objectFit: 'cover' } as React.CSSProperties,
  });

  // ── Banner: side-by-side layout ───────────────────────────────────────────
  if (isBanner) {
    const overlay = React.createElement('div', {
      style: { position: 'absolute', top: 0, left: 0, width, height, background: 'rgba(0,0,0,0.50)', display: 'flex' },
    });
    const logoEl = logoUrl ? React.createElement('div', {
      style: { position: 'absolute', top: 0, bottom: 0, left: pad, display: 'flex', alignItems: 'center' },
    }, React.createElement('img', {
      src: logoUrl,
      height: logoH,
      style: { objectFit: 'contain', maxWidth: Math.round(width * 0.28) } as React.CSSProperties,
    })) : null;
    const textEl = React.createElement('div', {
      style: { position: 'absolute', top: 0, bottom: 0, right: pad, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-end', gap: 8 },
    },
      headline && React.createElement('div', { style: { fontSize: hlSize, fontWeight: 800, color: '#fff', lineHeight: 1.0, display: 'flex', textAlign: 'right' as const } }, headline),
      subtext   && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.85)', display: 'flex', textAlign: 'right' as const } }, subtext),
      ctaText   && React.createElement('div', { style: { backgroundColor: accent, color: '#fff', fontSize: ctaSize, fontWeight: 700, borderRadius: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 20, paddingRight: 20, display: 'flex', marginTop: 6 } }, ctaText),
    );
    return React.createElement('div', { style: { width, height, position: 'relative', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif' } },
      bgEl, overlay, logoEl, textEl
    );
  }

  // ── Vertical formats (fb_post / ln_post / story) ───────────────────────────
  switch (layoutPreset) {

    // ── CENTERED: logo top-center, text center-aligned ─────────────────────
    case 'centered': {
      const overlay = React.createElement('div', {
        style: { position: 'absolute', top: 0, left: 0, width, height, background: 'rgba(0,0,0,0.42)', display: 'flex' },
      });
      const logoEl = logoUrl ? React.createElement('div', {
        style: { position: 'absolute', top: pad, left: 0, right: 0, display: 'flex', justifyContent: 'center' },
      }, React.createElement('img', {
        src: logoUrl,
        height: logoH,
        style: { objectFit: 'contain', maxWidth: Math.round(width * 0.4) } as React.CSSProperties,
      })) : null;

      const textTop = isStory ? height * 0.36 : height * 0.38;
      const textEl = React.createElement('div', {
        style: { position: 'absolute', top: textTop, left: pad, right: pad, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
      },
        headline && React.createElement('div', { style: { fontSize: hlSize, fontWeight: 800, color: '#ffffff', lineHeight: 1.1, textAlign: 'center' as const, display: 'flex' } }, headline),
        subtext   && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3, textAlign: 'center' as const, display: 'flex' } }, subtext),
        ctaText   && React.createElement('div', { style: { display: 'flex', marginTop: 12 } },
          React.createElement('div', { style: { backgroundColor: accent, color: '#fff', fontSize: ctaSize, fontWeight: 700, borderRadius: 12, paddingTop: 14, paddingBottom: 14, paddingLeft: 32, paddingRight: 32, display: 'flex' } }, ctaText)
        ),
      );
      return React.createElement('div', { style: { width, height, position: 'relative', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif' } },
        bgEl, overlay, logoEl, textEl
      );
    }

    // ── MINIMAL: subtle gradient, no CTA button, clean typography ──────────
    case 'minimal': {
      const overlay = React.createElement('div', {
        style: { position: 'absolute', top: 0, left: 0, width, height, background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 45%, rgba(0,0,0,0.60) 100%)', display: 'flex' },
      });
      const logoEl = logoUrl ? React.createElement('div', {
        style: { position: 'absolute', top: pad, left: pad, display: 'flex' },
      }, React.createElement('img', {
        src: logoUrl,
        height: Math.round(logoH * 0.78),
        style: { objectFit: 'contain', maxWidth: Math.round(width * 0.3) } as React.CSSProperties,
      })) : null;
      const textEl = React.createElement('div', {
        style: { position: 'absolute', bottom: pad, left: pad, right: pad, display: 'flex', flexDirection: 'column', gap: 10 },
      },
        headline && React.createElement('div', { style: { fontSize: Math.round(hlSize * 0.88), fontWeight: 800, color: '#ffffff', lineHeight: 1.1, display: 'flex' } }, headline),
        subtext   && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.8)', lineHeight: 1.3, display: 'flex' } }, subtext),
        ctaText   && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, display: 'flex', marginTop: 4 } }, `→ ${ctaText}`),
      );
      return React.createElement('div', { style: { width, height, position: 'relative', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif' } },
        bgEl, overlay, logoEl, textEl
      );
    }

    // ── BOLD: big headline, solid color bar at bottom with logo + CTA ───────
    case 'bold': {
      const colorBarH = Math.round(height * (isStory ? 0.16 : 0.22));
      const overlay = React.createElement('div', {
        style: { position: 'absolute', top: 0, left: 0, width, height: height - colorBarH, background: 'linear-gradient(to bottom, rgba(0,0,0,0.0) 15%, rgba(0,0,0,0.75) 100%)', display: 'flex' },
      });
      const colorBar = React.createElement('div', {
        style: { position: 'absolute', bottom: 0, left: 0, width, height: colorBarH, backgroundColor: primary, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: pad, paddingRight: pad },
      },
        ctaText && React.createElement('div', {
          style: { fontSize: Math.round(ctaSize * 1.1), fontWeight: 700, color: '#ffffff', display: 'flex', backgroundColor: accent, paddingTop: 10, paddingBottom: 10, paddingLeft: 24, paddingRight: 24, borderRadius: 10 },
        }, ctaText),
        logoUrl && React.createElement('img', {
          src: logoUrl,
          height: Math.round(colorBarH * 0.48),
          style: { objectFit: 'contain', maxWidth: Math.round(width * 0.3) } as React.CSSProperties,
        }),
      );
      const headlineEl = headline ? React.createElement('div', {
        style: { position: 'absolute', bottom: colorBarH + pad, left: pad, right: pad, display: 'flex', flexDirection: 'column', gap: 12 },
      },
        React.createElement('div', { style: { fontSize: Math.round(hlSize * 1.15), fontWeight: 900, color: '#ffffff', lineHeight: 1.0, display: 'flex' } }, headline),
        subtext && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3, display: 'flex' } }, subtext),
      ) : null;
      return React.createElement('div', { style: { width, height, position: 'relative', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif' } },
        bgEl, overlay, headlineEl, colorBar
      );
    }

    // ── CLASSIC (default): heavy bottom gradient, logo top-left, text bottom ─
    default: {
      const overlay = React.createElement('div', {
        style: { position: 'absolute', top: 0, left: 0, width, height, background: 'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.0) 25%, rgba(0,0,0,0.65) 70%, rgba(0,0,0,0.88) 100%)', display: 'flex' },
      });
      const logoEl = logoUrl ? React.createElement('div', {
        style: { position: 'absolute', top: Math.round(pad * 0.85), left: pad, display: 'flex' },
      }, React.createElement('img', {
        src: logoUrl,
        height: logoH,
        style: { objectFit: 'contain', maxWidth: Math.round(width * 0.38) } as React.CSSProperties,
      })) : null;
      const textEl = React.createElement('div', {
        style: { position: 'absolute', bottom: pad, left: pad, right: pad, display: 'flex', flexDirection: 'column', gap: 14 },
      },
        headline && React.createElement('div', { style: { fontSize: hlSize, fontWeight: 800, color: '#ffffff', lineHeight: 1.1, display: 'flex' } }, headline),
        subtext   && React.createElement('div', { style: { fontSize: stSize, color: 'rgba(255,255,255,0.85)', lineHeight: 1.3, display: 'flex' } }, subtext),
        ctaText   && React.createElement('div', { style: { display: 'flex', marginTop: 6 } },
          React.createElement('div', { style: { backgroundColor: accent, color: '#fff', fontSize: ctaSize, fontWeight: 700, borderRadius: 10, paddingTop: 13, paddingBottom: 13, paddingLeft: 28, paddingRight: 28, display: 'flex' } }, ctaText)
        ),
      );
      return React.createElement('div', { style: { width, height, position: 'relative', display: 'flex', overflow: 'hidden', fontFamily: 'sans-serif' } },
        bgEl, overlay, logoEl, textEl
      );
    }
  }
}
