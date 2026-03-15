import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  // Migration: add brand_sections column if not yet present
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_sections JSONB DEFAULT '[]'::jsonb`.catch(() => {});

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
