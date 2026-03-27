export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { updateSystemPrompt } from '@/lib/system-prompts';
import { getDb } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content } = await req.json();

  if (content === undefined || content === null) {
    return NextResponse.json({ error: 'content required' }, { status: 400 });
  }

  // Check exists
  const rows = await getDb()`SELECT id FROM system_prompts WHERE id = ${id}`;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await updateSystemPrompt(id, content);

  return NextResponse.json({ ok: true, id });
}
