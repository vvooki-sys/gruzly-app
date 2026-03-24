export const dynamic = 'force-dynamic';
export const maxDuration = 30;
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';
import { put } from '@vercel/blob';

const ALLOWED_TYPES = ['logo', 'reference', 'brandbook', 'brand-element', 'photo'];

// POST /api/brand/assets — upload file (FormData) or register existing URL (JSON)
export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;

  const contentType = req.headers.get('content-type') || '';

  // JSON body: register an existing URL as an asset
  if (contentType.includes('application/json')) {
    const { url, type, filename, variant = 'default', description = '' } = await req.json();
    if (!url || !type || !filename) {
      return NextResponse.json({ error: 'url, type and filename required' }, { status: 400 });
    }
    if (type === 'reference') {
      const [{ count }] = await getDb()`
        SELECT COUNT(*)::int as count FROM brand_assets
        WHERE project_id = ${projectId} AND type = 'reference'
      `;
      if (count >= 10) {
        return NextResponse.json({ error: 'Max 10 reference images allowed' }, { status: 400 });
      }
    }
    const [asset] = await getDb()`
      INSERT INTO brand_assets (project_id, type, url, filename, variant, description)
      VALUES (${projectId}, ${type}, ${url}, ${filename}, ${variant}, ${description})
      RETURNING *
    `;
    return NextResponse.json(asset, { status: 201 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const type = formData.get('type') as string | null;
  const variant = (formData.get('variant') as string | null) || 'default';
  const description = (formData.get('description') as string | null) || '';
  const assetName = (formData.get('name') as string | null) || '';

  if (!file || !type) {
    return NextResponse.json({ error: 'file and type required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: `type must be one of: ${ALLOWED_TYPES.join(', ')}` }, { status: 400 });
  }

  // Max 5 references
  if (type === 'reference') {
    const [{ count }] = await getDb()`
      SELECT COUNT(*)::int as count FROM brand_assets
      WHERE project_id = ${projectId} AND type = 'reference'
    `;
    if (count >= 5) {
      return NextResponse.json({ error: 'Max 5 reference images allowed' }, { status: 400 });
    }
  }

  // For logo: delete same variant only (multiple variants can coexist)
  if (type === 'logo') {
    await getDb()`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' AND variant = ${variant}`;
  }

  // For brandbook: replace previous (only one allowed)
  if (type === 'brandbook') {
    await getDb()`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'brandbook'`;
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = assetName || file.name;
  const blobPath = `gruzly/assets/${projectId}/${type}/${Date.now()}-${file.name}`;

  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: file.type,
  });

  const [asset] = await getDb()`
    INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
    VALUES (${projectId}, ${type}, ${blob.url}, ${safeName}, ${variant}, ${description}, ${file.type})
    RETURNING *
  `;

  // Sync logo_url on projects with the oldest/default logo
  if (type === 'logo') {
    const logos = await getDb()`SELECT url FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' ORDER BY created_at ASC LIMIT 1`;
    if (logos[0]) {
      await getDb()`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${projectId}`;
    }
  }

  return NextResponse.json(asset, { status: 201 });
}

// PATCH /api/brand/assets?assetId=X — toggle is_featured
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get('assetId');

  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  const [asset] = await getDb()`
    UPDATE brand_assets
    SET is_featured = NOT COALESCE(is_featured, false)
    WHERE id = ${parseInt(assetId)} AND project_id = ${BRAND_ID}
    RETURNING *
  `;

  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(asset);
}

// DELETE /api/brand/assets?assetId=X
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get('assetId');

  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  const [asset] = await getDb()`
    DELETE FROM brand_assets WHERE id = ${parseInt(assetId)} AND project_id = ${BRAND_ID} RETURNING *
  `;

  // Re-sync logo_url after logo deletion
  if (asset?.type === 'logo') {
    const logos = await getDb()`SELECT url FROM brand_assets WHERE project_id = ${BRAND_ID} AND type = 'logo' ORDER BY created_at ASC LIMIT 1`;
    if (logos[0]) {
      await getDb()`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${BRAND_ID}`;
    } else {
      await getDb()`UPDATE projects SET logo_url = NULL WHERE id = ${BRAND_ID}`;
    }
  }

  return NextResponse.json({ ok: true });
}
