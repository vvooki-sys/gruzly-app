import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';
import React from 'react';

export const runtime = 'edge';

const sql = neon(process.env.DATABASE_URL!);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Layout = Record<string, any>;

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
  const fontOptions: { name: string; data: ArrayBuffer; weight: number; style: 'normal' }[] = [];
  try {
    const [regRes, boldRes] = await Promise.all([
      fetch(`${origin}/fonts/Manrope-Regular.ttf`),
      fetch(`${origin}/fonts/Manrope-ExtraBold.ttf`),
    ]);
    if (regRes.ok) fontOptions.push({ name: 'Manrope', data: await regRes.arrayBuffer(), weight: 400, style: 'normal' });
    if (boldRes.ok) fontOptions.push({ name: 'Manrope', data: await boldRes.arrayBuffer(), weight: 800, style: 'normal' });
  } catch { /* fallback to Satori default */ }

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
