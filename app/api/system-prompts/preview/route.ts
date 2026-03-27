export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSystemPrompt } from '@/lib/system-prompts';
import { BRAND_ID } from '@/lib/constants';

const FORMAT_SIZES: Record<string, string> = {
  fb_post: 'square 1:1 aspect ratio, 1080x1080px',
  ln_post: 'landscape 1.91:1 aspect ratio, 1200x628px',
  story: 'vertical 9:16 aspect ratio, 1080x1920px',
  banner: 'wide banner 3:1 aspect ratio, 1200x400px',
};

interface Segment {
  source: 'system' | 'brand' | 'dynamic';
  label: string;
  content: string;
}

export async function POST(req: NextRequest) {
  const { pipeline = 'photo', format = 'fb_post', creativity = 3 } = await req.json();

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${BRAND_ID}`;
  if (!project) return NextResponse.json({ error: 'No project' }, { status: 404 });

  const segments: Segment[] = [];
  const sep = '════════════════════════════════════════';

  if (pipeline === 'photo') {
    // Photo pipeline preview
    const role = await getSystemPrompt('gen.photo.role', 'Jesteś profesjonalnym fotografem. Generujesz zdjęcia do social media.');
    segments.push({ source: 'system', label: 'Rola', content: role });

    const rulesStr = await getSystemPrompt('gen.photo.rules', '');
    const rules = rulesStr.split('\n').filter(Boolean);
    const brandRuleLines = project.brand_rules ? project.brand_rules.split('\n').filter((r: string) => r.trim()) : [];
    const allRules = [...rules, ...brandRuleLines];
    segments.push({
      source: 'system',
      label: 'Zasady bezwzględne',
      content: `ZASADY BEZWZGLĘDNE:\n${allRules.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`,
    });

    // Brand DNA
    type BrandSec = { title: string; content: string; order: number };
    const brandSections: BrandSec[] = project.brand_sections || [];
    if (brandSections.length > 0) {
      const dna = brandSections
        .sort((a, b) => a.order - b.order)
        .map(s => `[${s.title.toUpperCase()}]\n${s.content}`)
        .join('\n\n');
      segments.push({ source: 'brand', label: 'DNA Marki', content: `DNA MARKI:\n${dna}` });
    }

    segments.push({
      source: 'dynamic',
      label: 'Brief',
      content: `⭐ BRIEF:\n"\${brief}"\n\nFORMAT: ${FORMAT_SIZES[format] || '1080x1080px'}`,
    });

    const creativityText = await getSystemPrompt(`gen.photo.creativity.${creativity}`, '');
    if (creativityText) {
      segments.push({
        source: 'system',
        label: `Jakość foto (${creativity}/6)`,
        content: `JAKOŚĆ FOTOGRAFICZNA (${creativity}/6):\n${creativityText}`,
      });
    }

    const closing = await getSystemPrompt('gen.photo.closing', '');
    if (closing) {
      segments.push({ source: 'system', label: 'Closing', content: closing });
    }

  } else if (pipeline === 'graphic') {
    // Graphic pipeline preview
    const role = await getSystemPrompt('gen.graphic.role', 'Jesteś profesjonalnym grafikiem tworzącym grafiki do social media.');
    segments.push({ source: 'system', label: 'Rola', content: role });

    const rulesStr = await getSystemPrompt('gen.graphic.rules', '');
    const rules = rulesStr.split('\n').filter(Boolean);
    const brandRuleLines = project.brand_rules ? project.brand_rules.split('\n').filter((r: string) => r.trim()) : [];
    segments.push({
      source: 'system',
      label: 'Warstwa 1 — Zasady',
      content: `${sep}\nWARSTWA 1 — ZASADY BEZWZGLĘDNE\n${sep}\n${[...rules, ...brandRuleLines].map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}`,
    });

    type BrandSec = { title: string; content: string; order: number };
    const brandSections: BrandSec[] = project.brand_sections || [];
    if (brandSections.length > 0) {
      const dna = brandSections
        .sort((a, b) => a.order - b.order)
        .map(s => `[${s.title.toUpperCase()}]\n${s.content}`)
        .join('\n\n');
      segments.push({
        source: 'brand',
        label: 'Warstwa 2 — DNA Marki',
        content: `${sep}\nWARSTWA 2 — DNA MARKI\n${sep}\n${dna}`,
      });
    }

    segments.push({
      source: 'dynamic',
      label: 'Warstwa 3 — Brief',
      content: `${sep}\nWARSTWA 3 — BRIEF KREATYWNY\n${sep}\nMARKA: ${project.name}\nFORMAT: ${FORMAT_SIZES[format] || '1080x1080px'}\n\n\${headline}\n\${brief}`,
    });

    const creativityText = await getSystemPrompt(`gen.graphic.creativity.${creativity}`, '');
    if (creativityText) {
      segments.push({
        source: 'system',
        label: `Bogactwo wizualne (${creativity}/6)`,
        content: `DYREKTYWA BOGACTWA WIZUALNEGO (${creativity}/6):\n${creativityText}`,
      });
    }

    const closing = await getSystemPrompt('gen.graphic.closing', '');
    if (closing) {
      segments.push({ source: 'system', label: 'Closing', content: closing });
    }

  } else if (pipeline === 'copywriter') {
    const role = await getSystemPrompt('copy.role', 'Jesteś copywriterem marki ${project.name}.');
    segments.push({ source: 'system', label: 'Rola', content: role.replace('${project.name}', project.name) });

    type BrandSec = { title: string; content: string; order: number };
    const brandSections: BrandSec[] = project.brand_sections || [];
    if (brandSections.length > 0) {
      const identity = brandSections
        .sort((a, b) => a.order - b.order)
        .map(s => `[${s.title.toUpperCase()}]\n${s.content}`)
        .join('\n\n');
      segments.push({ source: 'brand', label: 'Tożsamość marki', content: identity });
    }

    if (project.voice_card) {
      segments.push({ source: 'brand', label: 'Voice Card', content: '[Dane z Voice Card marki]' });
    }

    const marketing = await getSystemPrompt('copy.rules.marketing', '');
    const human = await getSystemPrompt('copy.rules.human', '');
    segments.push({
      source: 'system',
      label: 'Zasady pisania',
      content: `${sep}\nZASADY PISANIA\n${sep}\n${marketing}\n\n${human}`,
    });

    segments.push({ source: 'dynamic', label: 'Zadanie', content: '${briefText}' });

    const hook1 = await getSystemPrompt('copy.hook.1', '');
    const hook2 = await getSystemPrompt('copy.hook.2', '');
    const hook3 = await getSystemPrompt('copy.hook.3', '');
    segments.push({
      source: 'system',
      label: 'Warianty hooków',
      content: `Wariant 1: ${hook1}\nWariant 2: ${hook2}\nWariant 3: ${hook3}`,
    });
  }

  const prompt = segments.map(s => s.content).join('\n\n');

  return NextResponse.json({ prompt, segments });
}
