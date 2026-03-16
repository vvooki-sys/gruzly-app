import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const sql = neon(process.env.DATABASE_URL!);

const ALLOWED_TYPES = ['logo', 'reference', 'brandbook', 'brand-element', 'photo'];

// POST /api/projects/[id]/assets — upload file (FormData) or register existing URL (JSON)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  const contentType = req.headers.get('content-type') || '';

  // JSON body: register an existing URL as an asset
  if (contentType.includes('application/json')) {
    const { url, type, filename, variant = 'default', description = '' } = await req.json();
    if (!url || !type || !filename) {
      return NextResponse.json({ error: 'url, type and filename required' }, { status: 400 });
    }
    if (type === 'reference') {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int as count FROM brand_assets
        WHERE project_id = ${projectId} AND type = 'reference'
      `;
      if (count >= 5) {
        return NextResponse.json({ error: 'Max 5 reference images allowed' }, { status: 400 });
      }
    }
    const [asset] = await sql`
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
    const [{ count }] = await sql`
      SELECT COUNT(*)::int as count FROM brand_assets
      WHERE project_id = ${projectId} AND type = 'reference'
    `;
    if (count >= 5) {
      return NextResponse.json({ error: 'Max 5 reference images allowed' }, { status: 400 });
    }
  }

  // For logo: delete same variant only (multiple variants can coexist)
  if (type === 'logo') {
    await sql`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' AND variant = ${variant}`;
  }

  // For brandbook: replace previous (only one allowed)
  if (type === 'brandbook') {
    await sql`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = 'brandbook'`;
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = assetName || file.name;
  const blobPath = `gruzly/assets/${projectId}/${type}/${Date.now()}-${file.name}`;

  const blob = await put(blobPath, buffer, {
    access: 'public',
    contentType: file.type,
  });

  const [asset] = await sql`
    INSERT INTO brand_assets (project_id, type, url, filename, variant, description, mime_type)
    VALUES (${projectId}, ${type}, ${blob.url}, ${safeName}, ${variant}, ${description}, ${file.type})
    RETURNING *
  `;

  // Sync logo_url on projects with the oldest/default logo
  if (type === 'logo') {
    const logos = await sql`SELECT url FROM brand_assets WHERE project_id = ${projectId} AND type = 'logo' ORDER BY created_at ASC LIMIT 1`;
    if (logos[0]) {
      await sql`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${projectId}`;
    }
  }

  return NextResponse.json(asset, { status: 201 });
}

// DELETE /api/projects/[id]/assets?assetId=X
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get('assetId');

  if (!assetId) return NextResponse.json({ error: 'assetId required' }, { status: 400 });

  const [asset] = await sql`
    DELETE FROM brand_assets WHERE id = ${parseInt(assetId)} AND project_id = ${parseInt(id)} RETURNING *
  `;

  // Re-sync logo_url after logo deletion
  if (asset?.type === 'logo') {
    const logos = await sql`SELECT url FROM brand_assets WHERE project_id = ${parseInt(id)} AND type = 'logo' ORDER BY created_at ASC LIMIT 1`;
    if (logos[0]) {
      await sql`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${parseInt(id)}`;
    } else {
      await sql`UPDATE projects SET logo_url = NULL WHERE id = ${parseInt(id)}`;
    }
  }

  return NextResponse.json({ ok: true });
}
