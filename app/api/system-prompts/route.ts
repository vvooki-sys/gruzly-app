export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAllSystemPrompts, type SystemPrompt } from '@/lib/system-prompts';

export async function GET() {
  const prompts = await getAllSystemPrompts();

  // Group by category
  const grouped: Record<string, SystemPrompt[]> = {};
  for (const p of prompts) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }

  return NextResponse.json({ prompts: grouped });
}
