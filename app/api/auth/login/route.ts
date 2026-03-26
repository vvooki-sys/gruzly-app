import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

async function ensureAuthTables() {
  await getDb()`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'klient',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `.catch(() => {});
  await getDb()`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `.catch(() => {});

  // Auto-seed if users table is empty
  const count = await getDb()`SELECT COUNT(*)::int as c FROM users`;
  if (count[0].c === 0) {
    const seedUsers = [
      { email: 'lukasz.gumowski@plej.pl', name: 'Łukasz Gumowski', role: 'agencja', password: 'MaczfitBear#91' },
      { email: 'marcin.rossa@creait.me', name: 'Marcin Rossa', role: 'agencja', password: 'CreAItFlow$47' },
      { email: 'klient@creait.me', name: 'Klient CreAIt', role: 'klient', password: 'BrandView&23' },
    ];
    for (const u of seedUsers) {
      const hash = await bcrypt.hash(u.password, 10);
      await getDb()`INSERT INTO users (email, password_hash, name, role) VALUES (${u.email}, ${hash}, ${u.name}, ${u.role}) ON CONFLICT (email) DO NOTHING`.catch(() => {});
    }
    console.log('[AUTH] Auto-seeded users table');
  }
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email i hasło są wymagane' }, { status: 400 });
  }

  await ensureAuthTables();

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
