export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const generationId = searchParams.get('generationId');

  if (!generationId) {
    return NextResponse.json({ error: 'generationId required' }, { status: 400 });
  }

  await getDb()`
    DELETE FROM generations
    WHERE id = ${parseInt(generationId)} AND project_id = ${BRAND_ID}
  `;

  return NextResponse.json({ ok: true });
}
