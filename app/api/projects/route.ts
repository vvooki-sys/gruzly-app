import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  // Migrations
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_sections JSONB DEFAULT '[]'::jsonb`.catch(() => {});
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(20) DEFAULT 'creative'`.catch(() => {});
  await sql`
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

  const rows = await sql`
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
  const rows = await sql`
    INSERT INTO projects (name, client_name) VALUES (${name}, ${clientName ?? null}) RETURNING *
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
