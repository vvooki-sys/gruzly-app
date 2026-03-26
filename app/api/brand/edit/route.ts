export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { BRAND_ID, GEMINI_MODEL } from '@/lib/constants';
import { put } from '@vercel/blob';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const projectId = BRAND_ID;
  const { imageUrl, instruction, generationId } = await req.json();

  if (!imageUrl || !instruction) {
    return NextResponse.json({ error: 'imageUrl and instruction required' }, { status: 400 });
  }

  const [project] = await getDb()`SELECT * FROM projects WHERE id = ${projectId}`;
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Pobierz obraz do edycji jako base64
  let imageBase64: string;
  let imageMimeType: string;
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error('Failed to fetch image');
    const buffer = await res.arrayBuffer();
    imageBase64 = Buffer.from(buffer).toString('base64');
    imageMimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch source image' }, { status: 400 });
  }

  const mandatoryBlock = project.brand_rules
    ? `⚠️ OBOWIĄZKOWE ZASADY MARKI — BEZWZGLĘDNE OGRANICZENIA:\n${(project.brand_rules as string).split('\n').map((r: string, i: number) => r.trim() ? `${i + 1}. ${r.trim()}` : '').filter(Boolean).join('\n')}\n\n`
    : '';

  // Wstrzykuj kontekst marki TYLKO gdy edycja dotyczy elementów brandowych
  const brandKeywords = /\b(kolor|color|marka|brand|logo|styl|style|ton|tone|nastrój|mood|overlay|tekst|text|napis|tło|background|paleta|palette|font|czcion|typo)\b/i;
  const needsBrandContext = brandKeywords.test(instruction);

  const brandContext = needsBrandContext
    ? `\nMarka: ${project.name}\nKolory: ${project.color_palette || 'dark navy, coral accent'}\n`
    : '';

  const editPrompt = `Edytuj tę grafikę zgodnie z poniższą instrukcją.
Zachowaj wszystkie niezmienione elementy dokładnie tak, jak są.
${mandatoryBlock}${brandContext}
INSTRUKCJA: ${instruction}

ZASADY:
- Zmień TYLKO to, co jest wskazane w instrukcji — nic więcej.
- NIE dodawaj żadnych nowych elementów (tekst, logo, ramki, watermarki, naklejki), chyba że instrukcja tego wyraźnie wymaga.
- Zachowaj ogólny układ, styl i kompozycję niezmienionej części obrazu.`;

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { data: imageBase64, mimeType: imageMimeType } },
          { text: editPrompt },
        ],
      }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      } as object,
    });

    const candidate = result.response.candidates?.[0];
    if (!candidate) throw new Error('No candidate in response');

    let newImageUrl: string | null = null;
    for (const part of candidate.content.parts) {
      const p = part as { inlineData?: { data: string; mimeType: string } };
      if (p.inlineData) {
        const buffer = Buffer.from(p.inlineData.data, 'base64');
        const ext = p.inlineData.mimeType === 'image/png' ? 'png' : 'jpg';
        const filename = `gruzly/${BRAND_ID}/edit-${Date.now()}.${ext}`;
        const blob = await put(filename, buffer, {
          access: 'public',
          contentType: p.inlineData.mimeType,
        });
        newImageUrl = blob.url;
        break;
      }
    }

    if (!newImageUrl) throw new Error('No image in response');

    const [generation] = await getDb()`
      INSERT INTO generations (project_id, brief, format, prompt, image_urls, status, parent_id)
      VALUES (
        ${projectId},
        ${'Edit: ' + instruction},
        ${'fb_post'},
        ${editPrompt},
        ${JSON.stringify([newImageUrl])},
        'done',
        ${generationId || null}
      )
      RETURNING *
    `;

    return NextResponse.json({ imageUrl: newImageUrl, generation });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Edit error:', msg);
    return NextResponse.json({ error: 'Edit failed: ' + msg.substring(0, 200) }, { status: 500 });
  }
}
