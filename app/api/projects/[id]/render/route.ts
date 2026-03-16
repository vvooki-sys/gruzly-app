import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import React from 'react';

export const runtime = 'edge';

const sql = neon(process.env.DATABASE_URL!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Layout = Record<string, any>;

interface ZoneChild {
  type: 'logo' | 'headline' | 'subtext' | 'cta' | 'sticker' | 'central-image' | 'legal' | 'decoration' | 'partner-logos' | 'spacer' | 'text';
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  padding?: number;
  maxWidth?: string;
  textAlign?: 'left' | 'right' | 'center';
  flex?: number;
  text?: string;
}

interface Zone {
  id: string;
  gridArea: string;
  display?: 'flex';
  flexDirection?: 'row' | 'column';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  children: ZoneChild[];
}

interface RenderData {
  headline: string;
  subtext: string;
  ctaText: string;
  legalText: string;
  stickerText: string;
  centralImageUrl: string;
  logoUrl: string;
}

function renderZoneChild(
  child: ZoneChild,
  layout: Layout,
  data: RenderData,
): React.ReactElement | null {
  switch (child.type) {
    case 'logo': {
      if (!data.logoUrl) return null;
      const logoSize = layout.logo?.size || 80;
      return React.createElement('img', {
        src: data.logoUrl,
        height: logoSize,
        width: logoSize * 2.5,
        style: { objectFit: 'contain' as const },
      });
    }

    case 'headline': {
      if (!data.headline) return null;
      const processedHL = layout.copy?.textTransform === 'lowercase'
        ? data.headline.toLowerCase()
        : layout.copy?.textTransform === 'uppercase'
          ? data.headline.toUpperCase()
          : data.headline;
      return React.createElement('div', {
        style: {
          fontSize: child.fontSize || layout.copy?.headlineFontSize || 56,
          fontWeight: child.fontWeight || layout.copy?.headlineFontWeight || 800,
          color: child.color || layout.copy?.headlineColor || '#ffffff',
          lineHeight: layout.copy?.lineHeight || 1.1,
          letterSpacing: layout.copy?.letterSpacing || 0,
          maxWidth: child.maxWidth || '100%',
          display: 'flex',
        },
      }, processedHL);
    }

    case 'subtext': {
      if (!data.subtext) return null;
      return React.createElement('div', {
        style: {
          fontSize: child.fontSize || layout.copy?.subtextFontSize || 24,
          fontWeight: child.fontWeight || layout.copy?.subtextFontWeight || 400,
          color: child.color || layout.copy?.subtextColor || '#ffffffcc',
          lineHeight: 1.3,
          display: 'flex',
        },
      }, data.subtext);
    }

    case 'cta': {
      if (!data.ctaText || !layout.cta?.enabled) return null;
      return React.createElement('div', {
        style: {
          backgroundColor: child.backgroundColor || layout.cta.backgroundColor || '#ffffff',
          color: child.color || layout.cta.textColor || '#48227c',
          fontSize: child.fontSize || layout.cta.fontSize || 24,
          fontWeight: 700,
          borderRadius: child.borderRadius || layout.cta.borderRadius || 16,
          paddingTop: 12,
          paddingBottom: 12,
          paddingLeft: 32,
          paddingRight: 32,
          display: 'flex',
        },
      }, data.ctaText);
    }

    case 'sticker': {
      if (!data.stickerText || !layout.sticker?.enabled) return null;
      const isCircle = layout.sticker.shape === 'circle';
      const pad = child.padding || (isCircle ? 28 : 20);
      return React.createElement('div', {
        style: {
          backgroundColor: child.backgroundColor || layout.sticker.backgroundColor || '#d2050a',
          color: child.color || layout.sticker.textColor || '#ffffff',
          fontSize: child.fontSize || layout.sticker.fontSize || 28,
          fontWeight: 800,
          borderRadius: child.borderRadius !== undefined
            ? child.borderRadius
            : (isCircle ? 9999 : layout.sticker.borderRadius || 16),
          paddingTop: pad,
          paddingBottom: pad,
          paddingLeft: pad,
          paddingRight: pad,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center' as const,
        },
      }, data.stickerText);
    }

    case 'central-image': {
      if (!data.centralImageUrl) return null;
      return React.createElement('img', {
        src: data.centralImageUrl,
        style: {
          maxWidth: child.maxWidth || '100%',
          maxHeight: '100%',
          objectFit: 'contain' as const,
          borderRadius: layout.centralElement?.mask
            ? '50%'
            : `${layout.centralElement?.borderRadius || 0}px`,
        },
      });
    }

    case 'legal': {
      if (!data.legalText || !layout.legal?.enabled) return null;
      return React.createElement('div', {
        style: {
          fontSize: child.fontSize || layout.legal.fontSize || 11,
          color: child.color || layout.legal.color || '#48227c',
          display: 'flex',
          textAlign: (child.textAlign || 'center') as 'left' | 'center' | 'right' | 'justify',
        },
      }, data.legalText);
    }

    case 'decoration':
      // Future: render brand blob/decoration image
      return null;

    case 'partner-logos':
      // Future: render row of partner logo images
      return null;

    case 'spacer':
      return React.createElement('div', {
        style: { display: 'flex', flex: child.flex || 1 },
      });

    case 'text': {
      if (!child.text) return null;
      return React.createElement('div', {
        style: {
          fontSize: child.fontSize || 18,
          fontWeight: child.fontWeight || 400,
          color: child.color || '#ffffffcc',
          textAlign: (child.textAlign || 'left') as 'left' | 'center' | 'right' | 'justify',
          lineHeight: 1.3,
          display: 'flex',
        },
      }, child.text);
    }

    default:
      return null;
  }
}

function buildPositionStyle(position: string, margin: number, extra = 0): Record<string, number | string> {
  const style: Record<string, number | string> = { position: 'absolute', display: 'flex' };
  if (position.includes('top')) style.top = margin;
  else style.bottom = margin + extra;
  if (position.includes('left')) style.left = margin;
  else style.right = margin;
  return style;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const {
    templateId,
    layout: overrideLayout,
    headline = '',
    subtext = '',
    ctaText = '',
    legalText = '',
    stickerText = '',
    centralImageUrl = '',
    logoUrl = '',
  } = await req.json();

  let layout: Layout;
  let width = 1080;
  let height = 1080;

  if (templateId) {
    const [template] = await sql`SELECT * FROM templates WHERE id = ${templateId} AND project_id = ${projectId}`;
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    layout = template.layout as Layout;
    width = template.width;
    height = template.height;
  } else if (overrideLayout) {
    layout = overrideLayout as Layout;
  } else {
    return NextResponse.json({ error: 'templateId or layout required' }, { status: 400 });
  }

  // Load Manrope fonts
  const origin = new URL(req.url).origin;
  const fontOptions: { name: string; data: ArrayBuffer; weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style: 'normal' | 'italic' }[] = [];
  try {
    const [regRes, boldRes] = await Promise.all([
      fetch(`${origin}/fonts/Manrope-Regular.ttf`),
      fetch(`${origin}/fonts/Manrope-ExtraBold.ttf`),
    ]);
    if (regRes.ok) fontOptions.push({ name: 'Manrope', data: await regRes.arrayBuffer(), weight: 400, style: 'normal' });
    if (boldRes.ok) fontOptions.push({ name: 'Manrope', data: await boldRes.arrayBuffer(), weight: 800, style: 'normal' });
  } catch { /* fallback to Satori default */ }

  // ── ZONE-BASED RENDER (new) ────────────────────────────────────────────────
  if (layout.zones && Array.isArray(layout.zones) && layout.zones.length > 0) {
    const data: RenderData = { headline, subtext, ctaText, legalText, stickerText, centralImageUrl, logoUrl };
    const bg = layout.background || {};
    const copyConf = layout.copy || {};
    const whiteSpaceHeight = layout.whiteSpace?.enabled ? (layout.whiteSpace.height || 0) : 0;

    const bgValue = bg.type === 'gradient'
      ? `linear-gradient(${bg.gradientDirection === 'left-right' ? '90deg' : bg.gradientDirection === 'diagonal' ? '135deg' : '180deg'}, ${bg.gradientFrom || '#6e46a0'}, ${bg.gradientTo || '#2d1464'})`
      : (bg.color || '#1B334B');

    // Helper: build a zone as a flex container with its children
    function buildZoneEl(zone: Zone | undefined, key: string, extraStyle: Record<string, string | number> = {}): React.ReactElement | null {
      if (!zone) return null;
      const pad = zone.padding || { top: 0, right: 0, bottom: 0, left: 0 };
      const children = zone.children
        .map((child: ZoneChild, ci: number) => {
          const el = renderZoneChild(child, layout, data);
          return el ? React.createElement('div', { key: `${key}-${ci}`, style: { display: 'flex' } }, el) : null;
        })
        .filter((el: React.ReactElement | null): el is React.ReactElement => el !== null);

      return React.createElement('div', {
        key,
        style: {
          display: 'flex',
          flexDirection: zone.flexDirection || 'column',
          justifyContent: zone.justifyContent || 'flex-start',
          alignItems: zone.alignItems || 'flex-start',
          gap: zone.gap || 0,
          paddingTop: pad.top,
          paddingRight: pad.right,
          paddingBottom: pad.bottom,
          paddingLeft: pad.left,
          ...extraStyle,
        },
      }, ...children);
    }

    const headerZone = layout.zones.find((z: Zone) => z.id === 'header');
    const mainLeftZone = layout.zones.find((z: Zone) => z.id === 'main-left');
    const mainRightZone = layout.zones.find((z: Zone) => z.id === 'main-right');
    const footerZone = layout.zones.find((z: Zone) => z.id === 'footer');

    // Main row: left column + optional right column side by side
    const mainRowChildren: (React.ReactElement | null)[] = [
      buildZoneEl(mainLeftZone, 'ml', { flex: 1 }),
      mainRightZone ? buildZoneEl(mainRightZone, 'mr', { flex: 1 }) : null,
    ].filter((el: React.ReactElement | null): el is React.ReactElement => el !== null);

    const mainRow = React.createElement('div', {
      key: 'main',
      style: { display: 'flex', flexDirection: 'row', flex: 1, width: '100%' },
    }, ...mainRowChildren);

    // Footer/white-space row
    let bottomEl: React.ReactElement | null = null;
    if (layout.whiteSpace?.enabled && whiteSpaceHeight > 0) {
      // Render footer zone children inside white background
      const footerChildren = (footerZone?.children || [])
        .map((child: ZoneChild, ci: number) => {
          const el = renderZoneChild(child, layout, data);
          return el ? React.createElement('div', { key: `fc${ci}`, style: { display: 'flex' } }, el) : null;
        })
        .filter((el: React.ReactElement | null): el is React.ReactElement => el !== null);

      bottomEl = React.createElement('div', {
        key: 'ws',
        style: {
          width: '100%',
          height: whiteSpaceHeight,
          backgroundColor: '#ffffff',
          borderTopLeftRadius: layout.whiteSpace.borderRadius || 0,
          borderTopRightRadius: layout.whiteSpace.borderRadius || 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 32,
          paddingRight: 32,
          gap: 16,
        },
      }, ...footerChildren);
    } else if (footerZone) {
      // No white space — render footer as a normal row
      bottomEl = buildZoneEl(footerZone, 'ftr', { width: '100%' });
    }

    const rootChildren: (React.ReactElement | null)[] = [
      headerZone ? buildZoneEl(headerZone, 'hdr', { width: '100%' }) : null,
      mainRow,
      bottomEl,
    ].filter((el: React.ReactElement | null): el is React.ReactElement => el !== null);

    const element = React.createElement('div', {
      style: {
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: copyConf.fontFamily || 'Manrope',
        overflow: 'hidden',
        background: bgValue,
      },
    }, ...rootChildren);

    const imageResponse = new ImageResponse(element, {
      width,
      height,
      ...(fontOptions.length ? { fonts: fontOptions } : {}),
    });

    const arrayBuffer = await imageResponse.arrayBuffer();
    const filename = `gruzly/${id}/precision-${Date.now()}.png`;
    const blobResult = await put(filename, arrayBuffer, { access: 'public', contentType: 'image/png' });

    const combinedBrief = [headline, subtext].filter(Boolean).join(' | ');
    const [generation] = await sql`
      INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
      VALUES (${projectId}, ${combinedBrief}, ${'precision'}, ${JSON.stringify(layout)}, ${JSON.stringify([blobResult.url])}, 'done')
      RETURNING *
    `;

    return NextResponse.json({ generation, imageUrl: blobResult.url });
  }

  // ── FALLBACK: Simple flow layout (backward compatible) ────────────────────
  const bg = layout.background || {};
  const bgStyle: Record<string, string> = bg.type === 'gradient'
    ? {
        background: `linear-gradient(${
          bg.gradientDirection === 'left-right' ? '90deg'
          : bg.gradientDirection === 'diagonal' ? '135deg'
          : '180deg'
        }, ${bg.gradientFrom || '#1B334B'}, ${bg.gradientTo || '#223D55'})`,
      }
    : { backgroundColor: bg.color || '#1B334B' };

  const whiteSpaceHeight = layout.whiteSpace?.enabled ? (layout.whiteSpace.height || 0) : 0;
  const pad = layout.padding || { top: 60, right: 60, bottom: 60, left: 60 };

  const processedHeadline = layout.copy?.textTransform === 'uppercase'
    ? headline.toUpperCase()
    : layout.copy?.textTransform === 'lowercase'
      ? headline.toLowerCase()
      : headline;

  const element = React.createElement('div', {
    style: {
      width,
      height,
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: layout.copy?.fontFamily || 'Manrope',
      ...bgStyle,
    },
  },
    // Inner padding wrapper
    React.createElement('div', {
      style: {
        display: 'flex',
        flex: 1,
        position: 'relative',
        paddingTop: pad.top,
        paddingRight: pad.right,
        paddingBottom: pad.bottom,
        paddingLeft: pad.left,
      },
    },
      // Logo
      logoUrl && layout.logo ? React.createElement('div', {
        style: buildPositionStyle(layout.logo.position || 'top-right', layout.logo.margin || 60),
      },
        React.createElement('img', {
          src: logoUrl,
          height: layout.logo.size || 60,
          width: (layout.logo.size || 60) * 3,
          style: { objectFit: 'contain' },
        })
      ) : null,

      // Central element image
      centralImageUrl && layout.centralElement ? React.createElement('div', {
        style: {
          display: 'flex',
          flex: 1,
          justifyContent: layout.centralElement.position === 'center' ? 'center'
            : layout.centralElement.position === 'right' ? 'flex-end'
            : 'flex-start',
          alignItems: 'center',
        },
      },
        React.createElement('img', {
          src: centralImageUrl,
          width: Math.round(width * (layout.centralElement.size || 50) / 100),
          height: Math.round(width * (layout.centralElement.size || 50) / 100),
          style: {
            objectFit: 'cover',
            borderRadius: layout.centralElement.mask
              ? '50%'
              : `${layout.centralElement.borderRadius || 0}px`,
          },
        })
      ) : null,

      // Copy block
      headline && layout.copy ? React.createElement('div', {
        style: {
          ...buildPositionStyle(
            layout.copy.position || 'bottom-left',
            layout.copy.margin || 60,
            whiteSpaceHeight
          ),
          flexDirection: 'column',
          maxWidth: '65%',
          textAlign: layout.copy.alignment || 'left',
        },
      },
        // Headline
        React.createElement('div', {
          style: {
            fontSize: layout.copy.headlineFontSize || 72,
            fontWeight: layout.copy.headlineFontWeight || 800,
            color: layout.copy.headlineColor || '#ffffff',
            lineHeight: layout.copy.lineHeight || 1.1,
            letterSpacing: layout.copy.letterSpacing || 0,
            display: 'flex',
          },
        }, processedHeadline),

        // Subtext
        subtext ? React.createElement('div', {
          style: {
            fontSize: layout.copy.subtextFontSize || 36,
            fontWeight: layout.copy.subtextFontWeight || 400,
            color: layout.copy.subtextColor || '#ffffff',
            marginTop: 16,
            lineHeight: layout.copy.lineHeight || 1.3,
            opacity: 0.85,
            display: 'flex',
          },
        }, subtext) : null,

        // CTA below copy
        ctaText && layout.cta?.enabled && layout.cta?.position === 'below-copy'
          ? React.createElement('div', { style: { display: 'flex', marginTop: 20 } },
              React.createElement('div', {
                style: {
                  backgroundColor: layout.cta.backgroundColor || '#B3F5DC',
                  color: layout.cta.textColor || '#1B334B',
                  fontSize: layout.cta.fontSize || 28,
                  fontWeight: 700,
                  borderRadius: layout.cta.borderRadius || 50,
                  paddingTop: 12,
                  paddingBottom: 12,
                  paddingLeft: 32,
                  paddingRight: 32,
                  display: 'flex',
                },
              }, ctaText)
            )
          : null,
      ) : null,

      // Sticker
      stickerText && layout.sticker?.enabled ? React.createElement('div', {
        style: {
          ...buildPositionStyle(
            layout.sticker.position || 'top-right',
            layout.padding?.right || 60,
            whiteSpaceHeight
          ),
          backgroundColor: layout.sticker.backgroundColor || '#ffffff',
          color: layout.sticker.textColor || '#1B334B',
          borderRadius: layout.sticker.shape === 'circle'
            ? '50%'
            : `${layout.sticker.borderRadius || 24}px`,
          fontSize: layout.sticker.fontSize || 32,
          fontWeight: 800,
          paddingTop: layout.sticker.shape === 'circle' ? 28 : 14,
          paddingBottom: layout.sticker.shape === 'circle' ? 28 : 14,
          paddingLeft: layout.sticker.shape === 'circle' ? 28 : 24,
          paddingRight: layout.sticker.shape === 'circle' ? 28 : 24,
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        },
      }, stickerText) : null,
    ),

    // White space overlay
    layout.whiteSpace?.enabled ? React.createElement('div', {
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: whiteSpaceHeight,
        backgroundColor: '#ffffff',
        borderTopLeftRadius: layout.whiteSpace.borderRadius || 0,
        borderTopRightRadius: layout.whiteSpace.borderRadius || 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 40,
        paddingRight: 40,
      },
    },
      legalText && layout.legal?.enabled ? React.createElement('div', {
        style: {
          fontSize: layout.legal.fontSize || 18,
          color: layout.legal.color || '#666666',
          textAlign: 'center',
          display: 'flex',
        },
      }, legalText) : null,
    ) : null,
  );

  const imageResponse = new ImageResponse(element, {
    width,
    height,
    ...(fontOptions.length ? { fonts: fontOptions } : {}),
  });

  const arrayBuffer = await imageResponse.arrayBuffer();

  const filename = `gruzly/${id}/precision-${Date.now()}.png`;
  const blobResult = await put(filename, arrayBuffer, {
    access: 'public',
    contentType: 'image/png',
  });

  const combinedBrief = [headline, subtext].filter(Boolean).join(' | ');
  const [generation] = await sql`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (
      ${projectId},
      ${combinedBrief},
      ${'precision'},
      ${JSON.stringify(layout)},
      ${JSON.stringify([blobResult.url])},
      'done'
    )
    RETURNING *
  `;

  return NextResponse.json({ generation, imageUrl: blobResult.url });
}
