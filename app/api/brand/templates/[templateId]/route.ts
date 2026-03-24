export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const { name, layout } = await req.json();

  const rows = await getDb()`
    UPDATE templates SET
      name = COALESCE(${name ?? null}, name),
      is_user_template = true,
      updated_at = NOW()
    WHERE id = ${parseInt(templateId)} AND project_id = ${BRAND_ID}
    RETURNING *
  `;
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (layout) {
    await getDb()`UPDATE templates SET layout = ${JSON.stringify(layout)}::jsonb WHERE id = ${parseInt(templateId)}`;
  }

  return NextResponse.json(rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  await getDb()`DELETE FROM templates WHERE id = ${parseInt(templateId)} AND project_id = ${BRAND_ID}`;
  return NextResponse.json({ ok: true });
}
