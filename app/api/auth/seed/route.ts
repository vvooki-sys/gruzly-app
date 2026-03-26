import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST() {
  await getDb()`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'klient',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;
  await getDb()`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `;

  const seedUsers = [
    { email: 'lukasz.gumowski@plej.pl', name: 'Łukasz Gumowski', role: 'agencja', password: 'MaczfitBear#91' },
    { email: 'marcin.rossa@creait.me', name: 'Marcin Rossa', role: 'agencja', password: 'CreAItFlow$47' },
    { email: 'klient@creait.me', name: 'Klient CreAIt', role: 'klient', password: 'BrandView&23' },
  ];

  const results = [];
  for (const u of seedUsers) {
    const hash = await bcrypt.hash(u.password, 10);
    const existing = await getDb()`SELECT id FROM users WHERE email = ${u.email}`;
    if (existing.length > 0) {
      await getDb()`UPDATE users SET password_hash = ${hash} WHERE email = ${u.email}`;
      results.push({ email: u.email, status: 'password updated' });
      continue;
    }
    await getDb()`INSERT INTO users (email, password_hash, name, role) VALUES (${u.email}, ${hash}, ${u.name}, ${u.role})`;
    results.push({ email: u.email, status: 'created' });
  }

  return NextResponse.json({ ok: true, results });
}
