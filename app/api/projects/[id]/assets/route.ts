import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { put } from '@vercel/blob';

const sql = neon(process.env.DATABASE_URL!);

// POST /api/projects/[id]/assets — upload file (FormData) or register existing URL (JSON)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);

  // JSON body: register an existing URL as an asset (e.g. "add generated image as reference")
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const { url, type, filename } = await req.json();
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
      INSERT INTO brand_assets (project_id, type, url, filename)
      VALUES (${projectId}, ${type}, ${url}, ${filename})
      RETURNING *
    `;
    return NextResponse.json(asset, { status: 201 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const type = formData.get('type') as string | null; // 'logo' | 'reference' | 'brandbook'

  if (!file || !type) {
    return NextResponse.json({ error: 'file and type required' }, { status: 400 });
  }

  const allowedTypes = ['logo', 'reference', 'brandbook'];
  if (!allowedTypes.includes(type)) {
    return NextResponse.json({ error: 'type must be logo, reference, or brandbook' }, { status: 400 });
  }

  // Limit: max 5 referencji
  if (type === 'reference') {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int as count FROM brand_assets
      WHERE project_id = ${projectId} AND type = 'reference'
    `;
    if (count >= 5) {
      return NextResponse.json({ error: 'Max 5 reference images allowed' }, { status: 400 });
    }
  }

  // Usuń stare logo/brandbook przed dodaniem nowego
  if (type === 'logo' || type === 'brandbook') {
    await sql`DELETE FROM brand_assets WHERE project_id = ${projectId} AND type = ${type}`;
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const filename = `gruzly/assets/${projectId}/${type}/${Date.now()}-${file.name}`;

  const blob = await put(filename, buffer, {
    access: 'public',
    contentType: file.type,
  });

  const [asset] = await sql`
    INSERT INTO brand_assets (project_id, type, url, filename)
    VALUES (${projectId}, ${type}, ${blob.url}, ${file.name})
    RETURNING *
  `;

  // Jeśli logo — aktualizuj też projects.logo_url
  if (type === 'logo') {
    await sql`UPDATE projects SET logo_url = ${blob.url} WHERE id = ${projectId}`;
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

  // Wyczyść logo_url jeśli usuwamy logo
  if (asset?.type === 'logo') {
    await sql`UPDATE projects SET logo_url = NULL WHERE id = ${parseInt(id)}`;
  }

  return NextResponse.json({ ok: true });
}
