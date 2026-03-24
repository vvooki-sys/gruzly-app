-- Gruzly 0.2 — Database Schema
-- Run this against a fresh Neon database to initialize

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  client_name VARCHAR(255),
  logo_url TEXT,
  style_description TEXT,
  typography_notes TEXT,
  color_palette TEXT,
  brand_rules TEXT,
  brand_analysis TEXT,
  brand_sections JSONB DEFAULT '[]'::jsonb,
  generation_mode VARCHAR(20) DEFAULT 'creative',
  tone_of_voice TEXT,
  description TEXT,
  brand_scan_data JSONB,
  scanned_url TEXT,
  logo_position TEXT DEFAULT 'top-left',
  voice_card JSONB,
  industry_rules JSONB,
  industry_copy_rules JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brand_assets (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  variant TEXT DEFAULT 'default',
  description TEXT,
  mime_type TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generations (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  brief TEXT,
  format TEXT,
  prompt TEXT,
  image_urls TEXT,
  status TEXT DEFAULT 'pending',
  parent_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  name VARCHAR(255) NOT NULL,
  format VARCHAR(50) NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  layout JSONB NOT NULL DEFAULT '{}',
  is_user_template BOOLEAN DEFAULT false,
  thumbnail_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed the single brand row
INSERT INTO projects (id, name) VALUES (1, 'Moja Marka') ON CONFLICT (id) DO NOTHING;
