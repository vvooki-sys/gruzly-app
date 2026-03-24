export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export async function PATCH(req: NextRequest) {
  const projectId = BRAND_ID;
  const { industryCopyRules } = await req.json();
  await getDb()`UPDATE projects SET industry_copy_rules = ${JSON.stringify(industryCopyRules)}::jsonb WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const projectId = BRAND_ID;
  await getDb()`UPDATE projects SET industry_copy_rules = NULL WHERE id = ${projectId}`;
  return NextResponse.json({ ok: true });
}
