import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await sql`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const assets = await sql`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)} ORDER BY created_at ASC`;
  const generations = await sql`SELECT * FROM generations WHERE project_id = ${parseInt(id)} ORDER BY created_at DESC`;
  return NextResponse.json({ project, assets, generations });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { name, clientName, styleDescription, typographyNotes, colorPalette, logoUrl, brandRules } = body;
  const rows = await sql`
    UPDATE projects SET
      name = COALESCE(${name}, name),
      client_name = COALESCE(${clientName}, client_name),
      style_description = COALESCE(${styleDescription}, style_description),
      typography_notes = COALESCE(${typographyNotes}, typography_notes),
      color_palette = COALESCE(${colorPalette}, color_palette),
      brand_rules = COALESCE(${brandRules ?? null}, brand_rules),
      logo_url = COALESCE(${logoUrl}, logo_url),
      updated_at = NOW()
    WHERE id = ${parseInt(id)} RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM projects WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
