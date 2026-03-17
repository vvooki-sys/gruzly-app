export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { getCanonicalType } from '@/lib/brand-sections';

const getDb = () => neon(process.env.DATABASE_URL!);

const SOURCE_PRIORITY: Record<string, number> = {
  brandbook:  4,
  manual:     3,
  references: 2,
  brand_scan: 1,
};

type SectionInput = {
  id?: string;
  title: string;
  content: string;
  order?: number;
  icon?: string;
  type?: string;
};

type StoredSection = {
  id: string;
  title: string;
  content: string;
  order: number;
  source?: string;
  icon?: string;
  type?: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id);
  const { sections: newSections }: { sections: SectionInput[] } = await req.json();

  const [proj] = await getDb()`SELECT brand_sections FROM projects WHERE id = ${projectId}`;
  const current: StoredSection[] = proj?.brand_sections || [];

  // Map canonical type → highest-priority existing section (to avoid overwriting brandbook/manual)
  const existingPriorityByType = new Map<string, number>();
  for (const s of current) {
    const ct = getCanonicalType(s.title);
    const p = SOURCE_PRIORITY[s.source || 'manual'] ?? 0;
    const prev = existingPriorityByType.get(ct) ?? -1;
    if (p > prev) existingPriorityByType.set(ct, p);
  }

  const updated = [...current];
  let appliedCount = 0;

  for (const ns of newSections) {
    const ct = getCanonicalType(ns.title);
    const existingPriority = existingPriorityByType.get(ct) ?? -1;

    // Do not overwrite sections with higher priority (brandbook, manual, references)
    if (existingPriority > SOURCE_PRIORITY['brand_scan']) continue;

    const sectionObj: StoredSection = {
      id: `scan_${ct}`,
      title: ns.title,
      content: ns.content,
      order: ns.order ?? 50,
      source: 'brand_scan',
      icon: ns.icon,
      type: ns.type || 'standard',
    };

    const idx = updated.findIndex(s => s.id === `scan_${ct}` || (getCanonicalType(s.title) === ct && s.source === 'brand_scan'));
    if (idx >= 0) {
      updated[idx] = sectionObj;
    } else {
      updated.push(sectionObj);
    }
    appliedCount++;
  }

  await getDb()`UPDATE projects SET brand_sections = ${JSON.stringify(updated)}::jsonb, updated_at = NOW() WHERE id = ${projectId}`;

  return NextResponse.json({ ok: true, appliedCount });
}
