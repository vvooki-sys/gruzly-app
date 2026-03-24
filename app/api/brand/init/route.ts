export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export async function GET() {
  // Migrations
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_sections JSONB DEFAULT '[]'::jsonb`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(20) DEFAULT 'creative'`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS tone_of_voice TEXT`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT`.catch(() => {});
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
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS logo_position TEXT DEFAULT 'top-left'`.catch(() => {});
  await getDb()`ALTER TABLE brand_assets ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS voice_card JSONB`.catch(() => {});
  await getDb()`ALTER TABLE projects ADD COLUMN IF NOT EXISTS industry_rules JSONB`.catch(() => {});

  // Copy generations table
  await getDb()`
    CREATE TABLE IF NOT EXISTS copy_generations (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task TEXT,
      format TEXT,
      visual_type TEXT,
      prompt TEXT,
      concept TEXT,
      variants JSONB DEFAULT '[]'::jsonb,
      selected_variant INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `.catch(() => {});

  // Auto-seed the single brand row
  await getDb()`INSERT INTO projects (id, name) VALUES (${BRAND_ID}, 'Moja Marka') ON CONFLICT (id) DO NOTHING`.catch(() => {});

  // Return single brand data
  const [project] = await getDb()`
    SELECT p.*,
           COUNT(g.id)::int as generation_count,
           COALESCE(
             (SELECT url FROM brand_assets WHERE project_id = p.id AND type = 'logo' AND variant != 'icon' ORDER BY created_at ASC LIMIT 1),
             p.logo_url
           ) as logo_url
    FROM projects p
    LEFT JOIN generations g ON g.project_id = p.id
    WHERE p.id = ${BRAND_ID}
    GROUP BY p.id
  `;

  return NextResponse.json(project || {});
}
