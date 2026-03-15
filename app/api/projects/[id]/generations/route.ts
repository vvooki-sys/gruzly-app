import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// DELETE /api/projects/[id]/generations?generationId=123
// Removes the DB record only — does not delete from Vercel Blob
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const generationId = searchParams.get('generationId');

  if (!generationId) {
    return NextResponse.json({ error: 'generationId required' }, { status: 400 });
  }

  await sql`
    DELETE FROM generations
    WHERE id = ${parseInt(generationId)} AND project_id = ${parseInt(id)}
  `;

  return NextResponse.json({ ok: true });
}
