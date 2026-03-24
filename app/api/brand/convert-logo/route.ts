export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';
import { put } from '@vercel/blob';
import sharp from 'sharp';

/**
 * POST /api/brand/convert-logo
 *
 * Accepts an SVG file + background info, produces:
 * 1. Stores the original SVG as brand_asset (logo, variant=svg)
 * 2. Renders PNG from SVG (for LLM use)
 * 3. Attempts auto-inversion for the opposite background variant
 *
 * Body (FormData):
 *   file: SVG file
 *   background: 'light' | 'dark' — what background this logo is designed for
 */
export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const background = (formData.get('background') as string) || 'light';

  if (!file) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const svgString = buffer.toString('utf-8');
  const isSvg = file.type === 'image/svg+xml' || svgString.trim().startsWith('<');

  // ── 1. Store original SVG ─────────────────────────────────────────────
  const svgBlob = await put(
    `gruzly/${projectId}/logo-source-${Date.now()}.${isSvg ? 'svg' : 'png'}`,
    buffer,
    { access: 'public', contentType: file.type }
  );

  // Delete old SVG variant
  await getDb()`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' AND variant = 'svg'`;
  const [svgAsset] = await getDb()`
    INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
    VALUES (${projectId}, 'logo', ${svgBlob.url}, ${file.name}, 'svg', 'Logo źródłowe', ${file.type})
    RETURNING *
  `;

  // ── 2. Render PNG from SVG ────────────────────────────────────────────
  let pngBuffer: Buffer;
  if (isSvg) {
    pngBuffer = await sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } else {
    // Already raster — just ensure PNG
    pngBuffer = await sharp(buffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  }

  // The original is for the specified background
  const originalVariant = background === 'dark' ? 'dark' : 'light';
  const pngBlob = await put(
    `gruzly/${projectId}/logo-${originalVariant}-${Date.now()}.png`,
    pngBuffer,
    { access: 'public', contentType: 'image/png' }
  );

  // Delete old variant and insert
  await getDb()`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' AND variant = ${originalVariant}`;
  const [pngAsset] = await getDb()`
    INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
    VALUES (${projectId}, 'logo', ${pngBlob.url}, ${'logo-' + originalVariant + '.png'}, ${originalVariant}, ${'Logo na ' + (originalVariant === 'light' ? 'jasne' : 'ciemne') + ' tło'}, 'image/png')
    RETURNING *
  `;

  // Update project logo_url
  await getDb()`UPDATE projects SET logo_url = ${pngBlob.url} WHERE id = ${projectId}`;

  // ── 3. Auto-inversion attempt ─────────────────────────────────────────
  let invertedAsset = null;
  const invertedVariant = originalVariant === 'light' ? 'dark' : 'light';

  if (isSvg) {
    try {
      // Extract unique non-transparent colors from the rendered PNG
      const { data: rawData, info } = await sharp(pngBuffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixels = info.width * info.height;
      const colorSet = new Set<string>();

      for (let i = 0; i < pixels; i++) {
        const r = rawData[i * 4];
        const g = rawData[i * 4 + 1];
        const b = rawData[i * 4 + 2];
        const a = rawData[i * 4 + 3];
        if (a > 10) {
          colorSet.add(`${r},${g},${b}`);
        }
      }

      // If logo has ≤ 50 unique colors → simple enough to invert
      const isSimple = colorSet.size <= 50;

      if (isSimple) {
        // Negate the image (invert colors), preserve alpha
        const invertedBuffer = await sharp(pngBuffer)
          .negate({ alpha: false })
          .png()
          .toBuffer();

        const invertedBlob = await put(
          `gruzly/${projectId}/logo-${invertedVariant}-${Date.now()}.png`,
          invertedBuffer,
          { access: 'public', contentType: 'image/png' }
        );

        await getDb()`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' AND variant = ${invertedVariant}`;
        const [inv] = await getDb()`
          INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
          VALUES (${projectId}, 'logo', ${invertedBlob.url}, ${'logo-' + invertedVariant + '.png'}, ${invertedVariant}, ${'Logo na ' + (invertedVariant === 'light' ? 'jasne' : 'ciemne') + ' tło (auto-inwersja)'}, 'image/png')
          RETURNING *
        `;
        invertedAsset = inv;
      }
    } catch (e) {
      console.error('Auto-inversion failed:', e);
      // Non-critical — continue without inverted variant
    }
  }

  // ── Return all created assets ─────────────────────────────────────────
  const allAssets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${projectId} ORDER BY created_at ASC`;

  return NextResponse.json({
    svgAsset,
    pngAsset,
    invertedAsset,
    autoInverted: !!invertedAsset,
    assets: allAssets,
  });
}
