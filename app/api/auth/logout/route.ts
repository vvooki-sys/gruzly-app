import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  if (sessionId) {
    await getDb()`DELETE FROM sessions WHERE id = ${sessionId}`.catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('session', '', { path: '/', expires: new Date(0) });
  return res;
}
