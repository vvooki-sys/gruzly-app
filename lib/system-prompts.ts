import { getDb } from '@/lib/db';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SystemPrompt {
  id: string;
  category: string;
  label: string;
  description: string | null;
  content: string;
  content_type: 'text' | 'json' | 'list';
  sort_order: number;
  updated_at: string;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, { content: string; ts: number }>();
const TTL = 60_000; // 60s

export function invalidateCache(id?: string) {
  if (id) {
    cache.delete(id);
  } else {
    cache.clear();
  }
}

// ── Getters ──────────────────────────────────────────────────────────────────

export async function getSystemPrompt(id: string, fallback: string): Promise<string> {
  const cached = cache.get(id);
  if (cached && Date.now() - cached.ts < TTL) return cached.content;

  const rows = await getDb()`SELECT content FROM system_prompts WHERE id = ${id}`;
  const content = rows[0]?.content ?? fallback;
  cache.set(id, { content, ts: Date.now() });
  return content;
}

export async function getSystemPromptsList(prefix: string): Promise<Record<string, string>> {
  const rows = await getDb()`SELECT id, content FROM system_prompts WHERE id LIKE ${prefix + '%'}`;
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = (row.id as string).replace(prefix, '');
    result[key] = row.content as string;
    cache.set(row.id as string, { content: row.content as string, ts: Date.now() });
  }
  return result;
}

export async function getAllSystemPrompts(): Promise<SystemPrompt[]> {
  const rows = await getDb()`SELECT * FROM system_prompts ORDER BY category, sort_order`;
  return rows as unknown as SystemPrompt[];
}

export async function updateSystemPrompt(id: string, content: string): Promise<void> {
  await getDb()`UPDATE system_prompts SET content = ${content}, updated_at = NOW() WHERE id = ${id}`;
  invalidateCache(id);
}
