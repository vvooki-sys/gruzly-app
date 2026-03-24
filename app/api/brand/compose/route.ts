export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';
import { put } from '@vercel/blob';

import { buildCompositeElement, COMPOSITOR_FORMAT_SIZES, type LayoutPreset, type BrandColors } from '@/lib/compositor';

/**
 * POST /api/brand/compose
 *
 * Standalone compositor: takes an illustration URL + text/logo data,
 * renders pixel-perfect overlay via Satori, saves PNG to Vercel Blob.
 *
 * Used for re-compositing without re-generating the illustration.
 */
export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;

  const {
    illustrationUrl,
    headline = '',
    subtext = '',
    ctaText = '',
    logoUrl = '',
    format = 'fb_post',
    layoutPreset = 'classic',
    brandColors = {},
    brief = '',
  }: {
    illustrationUrl: string;
    headline?: string;
    subtext?: string;
    ctaText?: string;
    logoUrl?: string;
    format?: string;
    layoutPreset?: LayoutPreset;
    brandColors?: BrandColors;
    brief?: string;
  } = await req.json();

  if (!illustrationUrl) {
    return NextResponse.json({ error: 'illustrationUrl required' }, { status: 400 });
  }

  const [width, height] = COMPOSITOR_FORMAT_SIZES[format] || [1080, 1080];

  const element = buildCompositeElement({
    illustrationUrl,
    headline,
    subtext,
    ctaText,
    logoUrl,
    format,
    layoutPreset,
    brandColors,
    width,
    height,
  });

  const imageResponse = new ImageResponse(element, { width, height });
  const arrayBuffer = await imageResponse.arrayBuffer();

  const filename = `gruzly/${BRAND_ID}/compose-${Date.now()}.png`;
  const blob = await put(filename, arrayBuffer, { access: 'public', contentType: 'image/png' });

  const combinedBrief = [headline, subtext].filter(Boolean).join(' | ') || brief;
  const [generation] = await getDb()`
    INSERT INTO generations (project_id, brief, format, prompt, image_urls, status)
    VALUES (${projectId}, ${combinedBrief}, ${`compose:${format}:${layoutPreset}`}, ${JSON.stringify({ illustrationUrl, layoutPreset, brandColors })}, ${JSON.stringify([blob.url])}, 'done')
    RETURNING *
  `;

  return NextResponse.json({ imageUrl: blob.url, generation });
}
