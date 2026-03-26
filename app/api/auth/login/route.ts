import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email i hasło są wymagane' }, { status: 400 });
  }

  const users = await getDb()`SELECT * FROM users WHERE email = ${email}`;
  if (users.length === 0) {
    return NextResponse.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
  }

  const user = users[0];
  const valid = await bcrypt.compare(password, user.password_hash as string);
  if (!valid) {
    return NextResponse.json({ error: 'Nieprawidłowy email lub hasło' }, { status: 401 });
  }

  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await getDb()`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionId}, ${user.id}, ${expiresAt.toISOString()})`;

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
  res.cookies.set('session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return res;
}
