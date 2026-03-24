export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export async function GET() {
  const templates = await getDb()`
    SELECT id, name, format, width, height, layout, is_user_template, thumbnail_url, created_at
    FROM templates
    WHERE project_id = ${BRAND_ID}
    ORDER BY created_at DESC
  `;
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const { name, format = 'fb_post', layout, is_user_template = true } = await req.json();
  if (!name || !layout) return NextResponse.json({ error: 'name and layout required' }, { status: 400 });

  const dims: Record<string, { width: number; height: number }> = {
    fb_post: { width: 1080, height: 1080 },
    ln_post: { width: 1200, height: 628 },
    story:   { width: 1080, height: 1920 },
    banner:  { width: 1200, height: 400 },
  };
  const { width, height } = dims[format] || dims.fb_post;

  const [template] = await getDb()`
    INSERT INTO templates (project_id, name, format, width, height, layout, is_user_template)
    VALUES (${BRAND_ID}, ${name}, ${format}, ${width}, ${height}, ${JSON.stringify(layout)}::jsonb, ${is_user_template})
    RETURNING *
  `;
  return NextResponse.json(template, { status: 201 });
}
