export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const getDb = () => neon(process.env.DATABASE_URL!);

export async function GET() {
  // Migrations
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_sections JSONB DEFAULT '[]'::jsonb`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(20) DEFAULT 'creative'`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS tone_of_voice TEXT`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE`.catch(() => {});
  await getDb()`ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT 'default'`.catch(() => {});
  await getDb()`ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS description TEXT`.catch(() => {});
  await getDb()`ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS mime_type TEXT`.catch(() => {});
  await getDb()`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      name VARCHAR(255) NOT NULL,
      format VARCHAR(50) NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      layout JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `.catch(() => {});
  await getDb()`ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_user_template BOOLEAN DEFAULT false`.catch(() => {});
  await getDb()`ALTER TABLE templates ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_scan_data JSONB`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS scanned_url TEXT`.catch(() => {});

  const rows = await getDb()`
    SELECT p.*, COUNT(g.id)::int as generation_count
    FROM projects p
    LEFT JOIN generations g ON g.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { name, clientName } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const rows = await getDb()`
    INSERT INTO projects (name, client_name) VALUES (${name}, ${clientName ?? null}) RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
