export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const getDb = () => neon(process.env.DATABASE_URL!);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${parseInt(id)}`;
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${parseInt(id)} ORDER BY created_at ASC`;
  const generations = await getDb()`SELECT * FROM generations WHERE project_id = ${parseInt(id)} ORDER BY created_at DESC`;
  return NextResponse.json({ project, assets, generations });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);
  const body = await req.json();
  const { name, clientName, description, archived, styleDescription, typographyNotes, colorPalette, logoUrl, brandRules, brandAnalysis, brandSections, sectionId, sectionContent, generationMode, toneOfVoice, logoPosition } = body;

  // Full brand sections replace
  if (brandSections !== undefined) {
    await getDb()`UPDATE projects SET brand_sections = ${JSON.stringify(brandSections)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // Single section content update
  if (sectionId !== undefined && sectionContent !== undefined) {
    const [proj] = await getDb()`SELECT brand_sections FROM projects WHERE id = ${projectId}`;
    const sections = (proj?.brand_sections || []) as Array<{ id: string; [key: string]: unknown }>;
    const updated = sections.map(s => s.id === sectionId ? { ...s, content: sectionContent } : s);
    await getDb()`UPDATE projects SET brand_sections = ${JSON.stringify(updated)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // archived fast-path
  if (archived !== undefined) {
    await getDb()`UPDATE projects SET archived = ${archived}, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // generation_mode fast-path
  if (generationMode !== undefined) {
    await getDb()`UPDATE projects SET generation_mode = ${generationMode}, updated_at = NOW() WHERE id = ${projectId}`;
    return NextResponse.json({ ok: true });
  }

  // Regular fields update
  const rows = await getDb()`
    UPDATE projects SET
      name = COALESCE(${name ?? null}, name),
      client_name = COALESCE(${clientName ?? null}, client_name),
      style_description = COALESCE(${styleDescription ?? null}, style_description),
      typography_notes = COALESCE(${typographyNotes ?? null}, typography_notes),
      color_palette = COALESCE(${colorPalette ?? null}, color_palette),
      brand_rules = COALESCE(${brandRules ?? null}, brand_rules),
      brand_analysis = COALESCE(${brandAnalysis ?? null}, brand_analysis),
      logo_url = COALESCE(${logoUrl ?? null}, logo_url),
      tone_of_voice = COALESCE(${toneOfVoice ?? null}, tone_of_voice),
      description = COALESCE(${description ?? null}, description),
      logo_position = COALESCE(${logoPosition ?? null}, logo_position),
      updated_at = NOW()
    WHERE id = ${projectId} RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getDb()`DELETE FROM projects WHERE id = ${parseInt(id)}`;
  return NextResponse.json({ ok: true });
}
