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
  const projectId = parseInt(id);
  const body = await req.json();
  const { name, clientName, styleDescription, typographyNotes, colorPalette, logoUrl, brandRules, brandAnalysis, brandSections, sectionId, sectionContent } = body;

  // Full brand sections replace
  if (brandSections !== undefined) {
    await sql`UPDATE projects SET brand_sections = ${JSON.stringify(brandSections)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // Single section content update
  if (sectionId !== undefined && sectionContent !== undefined) {
    const [proj] = await sql`SELECT brand_sections FROM projects WHERE id = ${projectId}`;
    const sections = (proj?.brand_sections || []) as Array<{ id: string; [key: string]: unknown }>;
    const updated = sections.map(s => s.id === sectionId ? { ...s, content: sectionContent } : s);
    await sql`UPDATE projects SET brand_sections = ${JSON.stringify(updated)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // Regular fields update
  const rows = await sql`
    UPDATE projects SET
      name = COALESCE(${name ?? null}, name),
      client_name = COALESCE(${clientName ?? null}, client_name),
      style_description = COALESCE(${styleDescription ?? null}, style_description),
      typography_notes = COALESCE(${typographyNotes ?? null}, typography_notes),
      color_palette = COALESCE(${colorPalette ?? null}, color_palette),
      brand_rules = COALESCE(${brandRules ?? null}, brand_rules),
      brand_analysis = COALESCE(${brandAnalysis ?? null}, brand_analysis),
      logo_url = COALESCE(${logoUrl ?? null}, logo_url),
      updated_at = NOW()
    WHERE id = ${projectId} RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`DELETE FROM projects WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
