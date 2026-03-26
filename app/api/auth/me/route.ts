import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const sessionId = req.cookies.get('session')?.value;
  if (!sessionId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const rows = await getDb()`
    SELECT u.id, u.email, u.name, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW()
  `;

  if (rows.length === 0) {
    const res = NextResponse.json({ user: null }, { status: 401 });
    res.cookies.set('session', '', { path: '/', expires: new Date(0) });
    return res;
  }

  return NextResponse.json({ user: rows[0] });
}
