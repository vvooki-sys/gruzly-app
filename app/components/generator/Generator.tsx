'use client';

import { useState, useRef } from 'react';
import {
  Upload, Wand2, Image, Loader2, Download,
  BookmarkPlus, Trash2, Zap, Target,
  Camera, X, ArrowLeft,
} from 'lucide-react';
import type {
  Project,
  BrandAsset,
  Generation,
  PrecisionTemplate,
  SavedTemplate,
  EditorBlock,
} from '@/lib/types';

// ── Constants ────────────────────────────────────────────────────────────────

const FORMATS = [
  { value: 'fb_post', label: 'Facebook Post', size: '1080×1080' },
  { value: 'ln_post', label: 'LinkedIn Post',  size: '1200×627' },
  { value: 'story',   label: 'Story / Reel',   size: '1080×1920' },
  { value: 'banner',  label: 'Baner',           size: '1200×400' },
];

const FORMAT_ASPECT: Record<string, string> = {
  fb_post: 'aspect-square',
  ln_post: 'aspect-video',
  story:   'aspect-[9/16]',
  banner:  'aspect-[3/1]',
};

const CREATIVITY_LABELS: Record<number, { name: string; desc: string }> = {
  1: { name: 'Minimal', desc: 'Czysta kompozycja, ściśle wg brand booka. Minimum dekoracji — logo, tekst, tło.' },
  2: { name: 'Standard', desc: 'Delikatne elementy graficzne uzupełniające styl marki. Subtelne tekstury lub dodatkowe kształty.' },
  3: { name: 'Rozbudowany', desc: 'Bogata, wielowarstwowa kompozycja. Pełna paleta kolorów marki, gradient, elementy dekoracyjne.' },
  4: { name: 'Editorial', desc: 'Odważny, magazynowy layout. Złożona typografia, dynamiczne kształty, głębia warstw.' },
  5: { name: 'Maksymalny', desc: 'Pełna ekspresja wizualna w ramach brand booka. Kinowy rozmach, wiele warstw, każdy piksel dopracowany.' },
};

const BLOCK_COLORS: Record<string, string> = {
  logo: '#B3F5DC', headline: '#9BE5E0', subtext: '#9BE5E0',
  'central-image': '#B3A0F5', cta: '#F5D9A0', sticker: '#F5A0B3',
  legal: '#A0B3F5', spacer: '#888', text: '#888',
};

const BLOCK_LABELS: Record<string, string> = {
  logo: 'Logo', headline: 'Nagłówek', subtext: 'Podtytuł',
  'central-image': 'Element', cta: 'CTA', sticker: 'Sticker',
  legal: 'Tekst prawny', spacer: 'Spacer', text: 'Tekst',
};

const BLOCK_TYPES = ['logo', 'headline', 'subtext', 'central-image', 'cta', 'sticker', 'legal', 'spacer'] as const;

const DEFAULT_BLOCK_POS: Record<string, { x: number; y: number; w: number; h: number }> = {
  'logo':          { x: 3, y: 3, w: 25, h: 8 },
  'central-image': { x: 10, y: 15, w: 80, h: 60 },
  'headline':      { x: 3, y: 75, w: 94, h: 12 },
  'subtext':       { x: 3, y: 87, w: 94, h: 7 },
  'cta':           { x: 3, y: 85, w: 40, h: 9 },
  'sticker':       { x: 72, y: 3, w: 22, h: 22 },
  'legal':         { x: 3, y: 94, w: 94, h: 4 },
  'spacer':        { x: 10, y: 40, w: 80, h: 20 },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBaseFormat(fmt: string) {
  return fmt.split(':')[0];
}
function getFormatLabel(fmt: string) {
  return FORMATS.find(f => f.value === getBaseFormat(fmt))?.label ?? fmt;
}

function gridAreaToAbsolute(gridArea: string) {
  const parts = gridArea.split('/').map(s => parseInt(s.trim()));
  const rowStart = parts[0] || 1, colStart = parts[1] || 1;
  const rowEnd = parts[2] || 2, colEnd = parts[3] || 13;
  return {
    x: ((colStart - 1) / 12) * 100,
    y: ((rowStart - 1) / 12) * 100,
    w: ((colEnd - colStart) / 12) * 100,
    h: ((rowEnd - rowStart) / 12) * 100,
  };
}

function toGridArea(b: EditorBlock): string {
  const rowStart = Math.max(1, Math.round(b.y / 100 * 12) + 1);
  const rowEnd = Math.max(rowStart + 1, Math.round((b.y + b.h) / 100 * 12) + 1);
  const colStart = Math.max(1, Math.round(b.x / 100 * 12) + 1);
  const colEnd = Math.max(colStart + 1, Math.round((b.x + b.w) / 100 * 12) + 1);
  return `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}`;
}

function editorBlocksFromLayout(layout: Record<string, unknown>): EditorBlock[] {
  type ZoneRaw = { id: string; gridArea: string; children: Array<{ type: string }>; flexDirection?: string; justifyContent?: string; alignItems?: string; gap?: number };
  const zones = (layout.zones as ZoneRaw[]) || [];
  return zones.map((z, i) => {
    const primaryType = z.children?.[0]?.type || 'spacer';
    const pos = z.gridArea ? gridAreaToAbsolute(z.gridArea) : (DEFAULT_BLOCK_POS[primaryType] || { x: 5, y: 5, w: 90, h: 20 });
    return {
      id: z.id,
      type: primaryType,
      label: (z.children || []).map(c => BLOCK_LABELS[c.type] || c.type).join(' + '),
      required: primaryType === 'logo' || primaryType === 'headline',
      ...pos,
      zIndex: i + 1,
      children: z.children || [{ type: primaryType }],
      flexDirection: z.flexDirection || 'column',
      justifyContent: z.justifyContent || 'flex-start',
      alignItems: z.alignItems || 'flex-start',
      gap: z.gap,
    };
  });
}

// ── Props ────────────────────────────────────────────────────────────────────

interface GeneratorProps {
  project: Project;
  assets: BrandAsset[];
  generations: Generation[];
  onGenerationsUpdate: (g: Generation[]) => void;
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
  refreshData: () => Promise<void>;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Generator({
  project,
  assets,
  generations,
  onGenerationsUpdate,
  onAssetsUpdate,
  showToast,
}: GeneratorProps) {
  const id = project.id;

  // Generator state
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState('fb_post');
  const [mode] = useState<'precise' | 'fast'>('precise');
  const [creativity, setCreativity] = useState(2);
  const [useCompositor, setUseCompositor] = useState(false);
  const [compositorLayout, setCompositorLayout] = useState<'classic' | 'centered' | 'minimal' | 'bold'>('classic');
  const [compositorCta, setCompositorCta] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Photo state (Creative mode generator)
  const [photoMode, setPhotoMode] = useState<'none' | 'upload' | 'generate' | 'library'>('none');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPrompt] = useState('');
  const [generatingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Edit state
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Precision mode state
  const [generationMode, setGenerationMode] = useState<'creative' | 'photo' | 'precision'>(
    (project.generation_mode as 'creative' | 'photo' | 'precision') || 'creative'
  );
  const [precisionTemplate, setPrecisionTemplate] = useState<PrecisionTemplate | null>(null);
  const [precisionTemplateId, setPrecisionTemplateId] = useState<number | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [ctaText, setCtaText] = useState('');
  const [legalText, setLegalText] = useState('');
  const [stickerText, setStickerText] = useState('');
  const [centralImageUrl, setCentralImageUrl] = useState<string | null>(null);
  const [centralPrompt, setCentralPrompt] = useState('');
  const [generatingElement, setGeneratingElement] = useState(false);

  // Template editor state
  const [editorBlocks, setEditorBlocks] = useState<EditorBlock[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [editorTemplateName, setEditorTemplateName] = useState('');
  const [savingEditorTemplate, setSavingEditorTemplate] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; handle: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Derived
  const references = assets.filter(a => a.type === 'reference');
  const brandSections = ((project as unknown as Record<string, unknown>).brand_sections || []) as Array<{ title: string; content: string }>;

  const inputCls = 'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

  // ── editorBlocksToLayout ───────────────────────────────────────────────────

  const editorBlocksToLayout = (): Record<string, unknown> => {
    const zones = editorBlocks.map(b => ({
      id: b.id,
      gridArea: toGridArea(b),
      flexDirection: b.flexDirection || 'column',
      justifyContent: b.justifyContent || 'flex-start',
      alignItems: b.alignItems || 'flex-start',
      gap: b.gap,
      children: b.children,
    }));
    return { ...(precisionTemplate?.layout || {}), zones };
  };

  // ── Handler: generate ──────────────────────────────────────────────────────

  const generate = async () => {
    if (!headline || !id) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/brand/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, subtext, brief, format, mode, creativity, photoUrl: photoUrl || undefined, photoMode, useCompositor, compositorLayout, compositorCta }),
      });
      const data = await res.json();
      if (data.imageUrls && data.imageUrls.length > 0) {
        setSelectedGeneration(data.generation);
        onGenerationsUpdate([data.generation, ...generations]);
      } else {
        alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  // ── Handler: generatePhoto ─────────────────────────────────────────────────

  const generatePhoto = async () => {
    if (!photoPrompt || !id) return;
    try {
      const res = await fetch(`/api/brand/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: photoPrompt, format, elementOnly: true }),
      });
      const data = await res.json();
      if (data.imageUrls?.[0]) {
        setPhotoUrl(data.imageUrls[0]);
      } else {
        alert('Błąd generowania zdjęcia: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    }
  };

  // ── Handler: handlePhotoUpload ─────────────────────────────────────────────

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'photo');
      fd.append('name', file.name);
      const res = await fetch(`/api/brand/${id}/assets`, { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        setPhotoUrl(asset.url);
        onAssetsUpdate([...assets, asset]);
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Handler: editImage ─────────────────────────────────────────────────────

  const editImage = async () => {
    if (!editingImage || !editInstruction || !id) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/brand/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: editingImage.url,
          instruction: editInstruction,
          generationId: editingImage.generationId,
        }),
      });
      const data = await res.json();
      setSelectedGeneration(data.generation);
      onGenerationsUpdate([data.generation, ...generations]);
      setEditingImage(null);
      setEditInstruction('');
    } catch (e) {
      console.error(e);
    } finally {
      setEditing(false);
    }
  };

  // ── Handler: addAsReference ────────────────────────────────────────────────

  const addAsReference = async (url: string) => {
    if (!id) return;
    const res = await fetch(`/api/brand/${id}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'reference', filename: `generated-ref-${Date.now()}.jpg` }),
    });
    if (res.ok) {
      const asset = await res.json();
      onAssetsUpdate([...assets, asset]);
      showToast('Dodano do referencji ✓');
    }
  };

  // ── Handler: deleteGeneration ──────────────────────────────────────────────

  const deleteGeneration = async (genId: number) => {
    if (!confirm('Usunąć tę grafikę z historii?')) return;
    setDeletingId(genId);
    await fetch(`/api/brand/${id}/generations?generationId=${genId}`, { method: 'DELETE' });
    onGenerationsUpdate(generations.filter(g => g.id !== genId));
    if (selectedGeneration?.id === genId) setSelectedGeneration(null);
    setDeletingId(null);
  };

  // ── Handler: saveGenerationMode ────────────────────────────────────────────

  const saveGenerationMode = async (newMode: 'creative' | 'photo' | 'precision') => {
    setGenerationMode(newMode);
    await fetch(`/api/brand/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationMode: newMode }),
    });
  };

  // ── Handler: generateTemplate ──────────────────────────────────────────────

  const generateTemplate = async () => {
    if (!id) return;
    setGeneratingTemplate(true);
    try {
      const res = await fetch(`/api/brand/${id}/template/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (data.error) { alert('Błąd: ' + data.error); return; }
      const tmpl = data.template || { layout: data.layout };
      setPrecisionTemplate(tmpl);
      if (tmpl.id) setPrecisionTemplateId(tmpl.id);
      setEditorBlocks(editorBlocksFromLayout(tmpl.layout || {}));
      showToast('Szablon wygenerowany ✓');
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingTemplate(false);
    }
  };

  // ── Handler: renderPrecision ───────────────────────────────────────────────

  const renderPrecision = async () => {
    if (!precisionTemplate && editorBlocks.length === 0) {
      alert('Najpierw wygeneruj lub załaduj szablon.');
      return;
    }
    if (!headline) { alert('Uzupełnij pole "Tekst główny".'); return; }
    if (!id) return;
    setRendering(true);
    try {
      const logoAsset = assets.find(a => a.type === 'logo');
      const res = await fetch(`/api/brand/${id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: editorBlocks.length > 0 ? undefined : (precisionTemplateId || undefined),
          layout: editorBlocks.length > 0 ? editorBlocksToLayout() : (precisionTemplateId ? undefined : precisionTemplate?.layout),
          headline,
          subtext,
          ctaText,
          legalText,
          stickerText,
          centralImageUrl: centralImageUrl || undefined,
          logoUrl: logoAsset?.url || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        alert('Błąd renderowania (' + res.status + '): ' + errText.substring(0, 300));
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data || data.error) { alert('Błąd renderowania: ' + (data?.error || 'Brak odpowiedzi')); return; }
      setSelectedGeneration(data.generation);
      onGenerationsUpdate([data.generation, ...generations]);
    } catch (e) {
      console.error(e);
      alert('Błąd połączenia: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRendering(false);
    }
  };

  // ── Handler: generateCentralElement ────────────────────────────────────────

  const generateCentralElement = async () => {
    if (!centralPrompt || !id) return;
    setGeneratingElement(true);
    try {
      const res = await fetch(`/api/brand/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: centralPrompt, format, elementOnly: true }),
      });
      const data = await res.json();
      if (data.imageUrls?.[0]) setCentralImageUrl(data.imageUrls[0]);
      else alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
    } catch {
      alert('Błąd połączenia');
    } finally {
      setGeneratingElement(false);
    }
  };

  // ── Handler: handleCentralImageUpload ──────────────────────────────────────

  const handleCentralImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setGeneratingElement(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'photo');
      fd.append('name', file.name);
      const res = await fetch(`/api/brand/${id}/assets`, { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        setCentralImageUrl(asset.url);
        onAssetsUpdate([...assets, asset]);
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        alert('Błąd wgrywania: ' + err.error);
      }
    } catch {
      alert('Błąd połączenia podczas wgrywania');
    } finally {
      setGeneratingElement(false);
    }
  };

  // ── Canvas drag/resize handlers ────────────────────────────────────────────

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || (!dragging && !resizing)) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (v: number, dim: number) => (v / dim) * 100;
    if (dragging) {
      const dx = px(e.clientX - dragging.startX, rect.width);
      const dy = px(e.clientY - dragging.startY, rect.height);
      setEditorBlocks(prev => prev.map(b => b.id === dragging.id
        ? { ...b, x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) }
        : b));
    }
    if (resizing) {
      const dx = px(e.clientX - resizing.startX, rect.width);
      const dy = px(e.clientY - resizing.startY, rect.height);
      setEditorBlocks(prev => prev.map(b => {
        if (b.id !== resizing.id) return b;
        const h = resizing.handle;
        if (h === 'se') return { ...b, w: Math.max(5, resizing.origW + dx), h: Math.max(5, resizing.origH + dy) };
        if (h === 'e')  return { ...b, w: Math.max(5, resizing.origW + dx) };
        if (h === 's')  return { ...b, h: Math.max(5, resizing.origH + dy) };
        if (h === 'n')  return { ...b, y: resizing.origY + dy, h: Math.max(5, resizing.origH - dy) };
        if (h === 'w')  return { ...b, x: resizing.origX + dx, w: Math.max(5, resizing.origW - dx) };
        return b;
      }));
    }
  };

  const handleCanvasMouseUp = () => { setDragging(null); setResizing(null); };

  const startBlockDrag = (e: React.MouseEvent, block: EditorBlock) => {
    e.stopPropagation();
    const maxZ = Math.max(1, ...editorBlocks.map(b => b.zIndex));
    setEditorBlocks(prev => prev.map(b => b.id === block.id ? { ...b, zIndex: maxZ + 1 } : b));
    setDragging({ id: block.id, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y });
  };

  const startBlockResize = (e: React.MouseEvent, block: EditorBlock, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ id: block.id, handle, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y, origW: block.w, origH: block.h });
  };

  // ── Handler: saveEditorTemplate ────────────────────────────────────────────

  const saveEditorTemplate = async () => {
    if (!id || !editorTemplateName.trim()) return;
    setSavingEditorTemplate(true);
    try {
      const layout = editorBlocksToLayout();
      const res = await fetch(`/api/brand/${id}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editorTemplateName.trim(), format, layout, is_user_template: true }),
      });
      if (res.ok) {
        const tmpl = await res.json();
        setSavedTemplates(prev => [tmpl, ...prev]);
        showToast('Szablon zapisany ✓');
        setEditorTemplateName('');
      }
    } finally {
      setSavingEditorTemplate(false);
    }
  };

  // ── Handler: loadSavedTemplate ─────────────────────────────────────────────

  const loadSavedTemplate = (tmplId: number) => {
    const tmpl = savedTemplates.find(t => t.id === tmplId);
    if (!tmpl?.layout) return;
    setPrecisionTemplate({ layout: tmpl.layout, id: tmpl.id, name: tmpl.name, format: tmpl.format });
    setPrecisionTemplateId(tmpl.id);
    setEditorBlocks(editorBlocksFromLayout(tmpl.layout));
    showToast('Szablon załadowany ✓');
  };

  // ── Suppress unused variable warnings ──────────────────────────────────────
  void generatePhoto;
  void generatingPhoto;

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Creative / Photo mode ──────────────────────────────────────────── */}
      {generationMode !== 'precision' && (
        <div className="space-y-8">

          {/* Main grid: Preview LEFT (sticky) | Form RIGHT */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

            {/* ── LEFT: Preview (sticky on desktop) ─────────────────────────── */}
            <div className="lg:sticky lg:top-[72px] space-y-3">
              <h2 className="font-black text-base">Podgląd</h2>

              <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                {generating ? (
                  <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-full holo-gradient flex items-center justify-center">
                        <Loader2 className="h-7 w-7 animate-spin text-teal-deep" />
                      </div>
                      <p className="text-sm opacity-50 font-medium">Generuję grafikę...</p>
                    </div>
                  </div>
                ) : selectedGeneration ? (
                  <div>
                    {/* Image */}
                    {(() => {
                      const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                      return urls.map((u, i) => <img key={i} src={u} alt="Grafika" className="w-full" />);
                    })()}

                    {/* Actions */}
                    <div className="p-3 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) window.open(urls[0], '_blank');
                        }}
                        className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep hover:bg-teal-deep/10 dark:hover:bg-teal-deep/80 border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Pobierz
                      </button>
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) { setEditingImage({ url: urls[0], generationId: selectedGeneration.id }); setEditInstruction(''); }
                        }}
                        className="flex-1 h-9 rounded-full holo-gradient text-teal-deep text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                      >
                        <Wand2 className="h-3.5 w-3.5" /> Edytuj
                      </button>
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) addAsReference(urls[0]);
                        }}
                        title="Dodaj jako referencję"
                        className="w-9 h-9 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-50 hover:opacity-100 hover:border-holo-mint/50 transition-all shrink-0"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Details */}
                    <div className="px-4 pb-4 space-y-2 border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                      <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Szczegóły</p>
                      <div className="text-xs space-y-1 opacity-50">
                        <p><span className="opacity-60">Tekst:</span> {selectedGeneration.brief}</p>
                        <p><span className="opacity-60">Format:</span> {getFormatLabel(selectedGeneration.format)}</p>
                        <p><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                      </div>
                      <details className="mt-2">
                        <summary className="text-xs opacity-30 cursor-pointer hover:opacity-60 transition-opacity">Pokaż prompt systemowy</summary>
                        <p className="mt-2 text-xs opacity-40 leading-relaxed bg-offwhite dark:bg-teal-deep rounded-xl p-3 whitespace-pre-wrap">{selectedGeneration.prompt}</p>
                      </details>
                    </div>

                    {/* Edit panel */}
                    {editingImage && (
                      <div className="px-4 pb-4 space-y-3 border-t border-holo-lavender/30 pt-3">
                        <p className="text-xs font-bold text-holo-lavender">Instrukcja edycji</p>
                        <textarea
                          className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-holo-lavender/20 rounded-xl px-3 py-2 text-sm resize-none focus:border-holo-lavender outline-none transition-colors"
                          rows={3}
                          placeholder="np. Dodaj logo Plej w prawym górnym rogu, zmień kolor tła na granatowy"
                          value={editInstruction}
                          onChange={e => setEditInstruction(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingImage(null)}
                            className="h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-50 hover:opacity-100 transition-opacity"
                          >
                            Anuluj
                          </button>
                          <button
                            onClick={editImage}
                            disabled={editing || !editInstruction}
                            className="flex-1 h-9 rounded-full bg-holo-lavender text-teal-deep text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                          >
                            {editing
                              ? <><Loader2 className="h-4 w-4 animate-spin" /> Edytuję...</>
                              : <><Wand2 className="h-4 w-4" /> Zastosuj</>
                            }
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                    <div className="text-center space-y-3">
                      <div className="text-5xl mb-3">🧱</div>
                      <p className="text-sm opacity-30">Wygeneruj grafikę lub kliknij w historię</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT: Form ────────────────────────────────────────────────── */}
            <div className="space-y-4">
              <h2 className="font-black text-base">Nowa grafika</h2>

              {/* 1. Headline — required */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Tekst główny <span className="normal-case opacity-70 font-normal">— nagłówek grafiki *</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none font-mono`}
                  rows={2}
                  placeholder="np. 23 marca, Warszawa"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                />
              </div>

              {/* 2. Subtext — optional */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Tekst dodatkowy <span className="normal-case opacity-70 font-normal">— podtytuł, CTA (opcjonalnie)</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none font-mono`}
                  rows={2}
                  placeholder="np. Zapisz się teraz →"
                  value={subtext}
                  onChange={e => setSubtext(e.target.value)}
                />
              </div>

              {/* 3. Brief — optional, AI context only */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Brief dla AI <span className="normal-case opacity-70 font-normal">(opcjonalnie)</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Opisz nastrój, styl, co ma pokazywać grafika. Copywriter może wygenerować to automatycznie."
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                />
              </div>

              {/* Photo — in photo mode always show upload, in creative mode show toggle */}
              {(generationMode === 'creative' || generationMode === 'photo') && (
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide flex items-center gap-1.5">
                  <Camera className="h-3 w-3" /> Zdjęcie (opcjonalnie)
                </label>
                <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-3 space-y-3">
                  <div className="flex gap-1.5">
                    <button onClick={() => { setPhotoMode('none'); setPhotoUrl(''); }}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${photoMode === 'none' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}>
                      Brak
                    </button>
                    <button onClick={() => setPhotoMode('upload')}
                      className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${photoMode !== 'none' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}>
                      Dodaj zdjęcie
                    </button>
                  </div>
                  {photoMode !== 'none' && (
                    photoUrl ? (
                      <div className="flex items-center gap-2">
                        <img src={photoUrl} className="w-14 h-14 object-cover rounded-lg border border-teal-deep/10 dark:border-holo-mint/10" alt="photo" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs opacity-50 truncate">Zdjęcie wgrane</p>
                        </div>
                        <button onClick={() => setPhotoUrl('')} className="w-7 h-7 rounded-full border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className={`flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 cursor-pointer hover:border-holo-mint/50 transition-colors text-sm ${uploadingPhoto ? 'opacity-50' : ''}`}>
                        {uploadingPhoto ? <><Loader2 className="h-4 w-4 animate-spin" /> Wgrywam...</> : <><Upload className="h-4 w-4" /> Wybierz plik</>}
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                      </label>
                    )
                  )}
                </div>
              </div>
              )}

              {/* Format picker */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={`p-3 rounded-xl text-left border text-sm transition-all ${
                        format === f.value
                          ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                          : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="font-bold text-xs">{f.label}</div>
                      <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mode toggle — Kreatywny / Ze zdjęciem / Precyzyjny(beta) */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tryb</label>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    onClick={() => { saveGenerationMode('creative'); setPhotoMode('none'); setPhotoUrl(''); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${generationMode === 'creative' ? 'border-holo-mint bg-holo-mint/10 text-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}
                  >
                    <Wand2 className="h-3 w-3" /> Kreatywny
                  </button>
                  <button
                    onClick={() => { saveGenerationMode('photo'); setPhotoMode('upload'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${generationMode === 'photo' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}
                  >
                    <Camera className="h-3 w-3" /> Ze zdjęciem
                  </button>
                  <button
                    onClick={() => saveGenerationMode('precision')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80"
                  >
                    <Target className="h-3 w-3" /> Precyzyjny <span className="px-1.5 py-0.5 bg-holo-lavender/20 text-holo-lavender rounded text-[9px] font-black uppercase">Beta</span>
                  </button>
                </div>
              </div>

              {/* Creativity slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-zinc-400">Poziom kreatywności</label>
                  <span className="text-xs font-semibold text-holo-mint">{CREATIVITY_LABELS[creativity].name}</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1}
                  value={creativity}
                  onChange={e => setCreativity(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-teal-mid accent-holo-mint"
                />
                <p className="text-xs text-zinc-500 mt-1">{CREATIVITY_LABELS[creativity].desc}</p>
              </div>

              {/* Compositor toggle */}
              <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Compositor (2-etapowy)</p>
                    <p className="text-xs text-zinc-500">Ilustracja AI + tekst pixel-perfect</p>
                  </div>
                  <button
                    onClick={() => setUseCompositor(v => !v)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${useCompositor ? 'bg-holo-mint' : 'bg-teal-deep/30'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${useCompositor ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>

                {useCompositor && (
                  <div className="space-y-3 pt-1 border-t border-holo-mint/10">
                    {/* Layout preset */}
                    <div>
                      <p className="text-xs text-zinc-400 mb-2">Styl layoutu</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['classic', 'centered', 'minimal', 'bold'] as const).map(preset => (
                          <button
                            key={preset}
                            onClick={() => setCompositorLayout(preset)}
                            className={`py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${compositorLayout === preset ? 'bg-holo-mint text-teal-deep' : 'bg-teal-deep/20 text-zinc-400 hover:text-zinc-200'}`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* CTA text */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Tekst CTA (opcjonalnie)</label>
                      <input
                        type="text"
                        value={compositorCta}
                        onChange={e => setCompositorCta(e.target.value)}
                        placeholder="np. Dowiedz się więcej"
                        className="w-full bg-teal-deep/20 border border-teal-deep/20 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-holo-mint/40"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Generate CTA */}
              <button
                onClick={generate}
                disabled={generating || !headline}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                  : <><Wand2 className="h-4 w-4" /> Generuj grafikę</>
                }
              </button>

              {/* Brand context indicator */}
              <div className={`rounded-xl p-4 text-xs space-y-1 border transition-colors ${
                brandSections.length > 0 || project.brand_analysis
                  ? 'border-holo-mint/20 bg-holo-mint/5'
                  : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
              }`}>
                <p className={`font-bold mb-1.5 ${brandSections.length > 0 || project.brand_analysis ? 'text-holo-mint' : 'opacity-50'}`}>
                  {brandSections.length > 0
                    ? `${brandSections.length} sekcji brandowych`
                    : project.brand_analysis
                      ? 'Analiza tekstowa aktywna'
                      : 'Brak analizy — przejdź do Kontekst marki'}
                </p>
                {brandSections.length > 0 && (
                  <p className="opacity-50">{brandSections.slice(0, 3).map(s => s.title).join(', ')}{brandSections.length > 3 ? ` +${brandSections.length - 3} więcej` : ''}</p>
                )}
                <p className="opacity-30">{references.length} grafik referencyjnych</p>
              </div>
            </div>
          </div>

          {/* ── Historia: full-width rows ───────────────────────────────────── */}
          {generations.length > 0 && (
            <div>
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
              <div className="space-y-1.5">
                {generations.map(g => {
                  const urls: string[] = JSON.parse(g.image_urls || '[]');
                  const isActive = selectedGeneration?.id === g.id;
                  const gHeadline = g.brief.split(' | ')[0];
                  const gSubtext = g.brief.includes(' | ') ? g.brief.split(' | ').slice(1).join(' | ') : null;
                  const isFast = g.format.endsWith(':fast');
                  const gCreativity = parseInt(g.format.match(/:c(\d)/)?.[1] || '2');

                  return (
                    <div
                      key={g.id}
                      onClick={() => { setSelectedGeneration(g); setEditingImage(null); }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                        isActive
                          ? 'border-holo-mint bg-holo-mint/5'
                          : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 bg-white dark:bg-teal-mid'
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${isActive ? 'border-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}>
                        {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{gHeadline}</p>
                        {gSubtext && <p className="text-xs opacity-40 truncate mt-0.5">{gSubtext}</p>}
                      </div>

                      {/* Format + mode + creativity */}
                      <div className="hidden sm:flex items-center gap-2 shrink-0">
                        <span className="text-xs opacity-30">{getFormatLabel(g.format)}</span>
                        {isFast && (
                          <span className="flex items-center gap-0.5 text-xs text-holo-yellow">
                            <Zap className="h-3 w-3" /> Szybki
                          </span>
                        )}
                        {gCreativity === 3 && (
                          <span className="text-xs text-holo-aqua">Dynamic</span>
                        )}
                        {gCreativity === 4 && (
                          <span className="text-xs text-holo-lavender">Bold</span>
                        )}
                        {gCreativity === 5 && (
                          <span className="text-xs text-holo-pink">Expressive</span>
                        )}
                      </div>

                      {/* Date */}
                      <span className="hidden md:block text-xs opacity-25 whitespace-nowrap shrink-0">
                        {new Date(g.created_at).toLocaleDateString('pl-PL')}
                      </span>

                      {/* Action buttons */}
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setSelectedGeneration(g);
                            const urls2: string[] = JSON.parse(g.image_urls || '[]');
                            if (urls2[0]) { setEditingImage({ url: urls2[0], generationId: g.id }); setEditInstruction(''); }
                          }}
                          title="Edytuj"
                          className="w-8 h-8 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-holo-mint/50 transition-all"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteGeneration(g.id)}
                          disabled={deletingId === g.id}
                          title="Usuń"
                          className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 disabled:opacity-20 transition-all"
                        >
                          {deletingId === g.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Precision mode ─────────────────────────────────────────────────── */}
      {generationMode === 'precision' && (
        <div className="space-y-8">
          {/* Back + info */}
          <div className="flex items-center gap-3">
            <button onClick={() => saveGenerationMode('creative')} className="text-xs opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Wróć do trybu kreatywnego
            </button>
            <span className="px-2 py-0.5 bg-holo-lavender/20 text-holo-lavender rounded text-[9px] font-black uppercase">Beta</span>
          </div>
          <p className="text-xs opacity-40 -mt-4">Tryb precyzyjny wymaga wcześniejszego skonfigurowania szablonu w zakładce Kontekst marki. Najlepiej sprawdza się z własnym zdjęciem.</p>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

            {/* LEFT: Template preview / rendered result */}
            <div className="lg:sticky lg:top-[72px] space-y-3">
              <h2 className="font-black text-base">Podgląd szablonu</h2>
              <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                {rendering ? (
                  <div className="aspect-square flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-full bg-holo-lavender/20 flex items-center justify-center">
                        <Loader2 className="h-7 w-7 animate-spin text-holo-lavender" />
                      </div>
                      <p className="text-sm opacity-50">Renderuję grafikę...</p>
                    </div>
                  </div>
                ) : selectedGeneration ? (
                  <div>
                    {(() => {
                      const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                      return urls.map((u, i) => <img key={i} src={u} alt="Grafika" className="w-full" />);
                    })()}
                    <div className="p-3 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) window.open(urls[0], '_blank');
                        }}
                        className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-holo-lavender/10 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" /> Pobierz
                      </button>
                    </div>
                    <div className="px-4 pb-4 pt-3 space-y-1 border-t border-teal-deep/10 dark:border-holo-mint/10">
                      <p className="text-xs opacity-30"><span className="opacity-60">Tekst:</span> {selectedGeneration.brief}</p>
                      <p className="text-xs opacity-30"><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    {/* Template Editor */}
                    <div className="space-y-3">
                      {/* Saved templates selector */}
                      {savedTemplates.length > 0 && (
                        <div className="flex items-center gap-2">
                          <select
                            onChange={e => { const tid = parseInt(e.target.value); if (tid) loadSavedTemplate(tid); }}
                            className="flex-1 bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-sm outline-none"
                            defaultValue=""
                          >
                            <option value="">Wybierz szablon...</option>
                            {savedTemplates.map(t => (
                              <option key={t.id} value={t.id}>{t.name} {t.is_user_template ? '' : ''}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Absolute-positioned canvas editor */}
                      {editorBlocks.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs opacity-40">Edytor układu — przeciągnij bloki, złap narożnik/krawędź żeby zmienić rozmiar</p>
                          {/* Canvas */}
                          <div
                            ref={canvasRef}
                            className="relative bg-teal-deep/10 dark:bg-teal-mid/50 rounded-xl border border-teal-deep/15 dark:border-holo-mint/10 select-none"
                            style={{
                              width: '100%',
                              aspectRatio: format === 'story' ? '9/16' : format === 'banner' ? '3/1' : format === 'ln_post' ? '1.91/1' : '1/1',
                            }}
                            onMouseMove={handleCanvasMouseMove}
                            onMouseUp={handleCanvasMouseUp}
                            onMouseLeave={handleCanvasMouseUp}
                          >
                            {[...editorBlocks].sort((a, b) => a.zIndex - b.zIndex).map(block => (
                              <div
                                key={block.id}
                                className="absolute rounded group"
                                style={{
                                  left: `${block.x}%`,
                                  top: `${block.y}%`,
                                  width: `${block.w}%`,
                                  height: `${block.h}%`,
                                  zIndex: block.zIndex,
                                  backgroundColor: (BLOCK_COLORS[block.type] || '#888') + '33',
                                  border: `2px solid ${(BLOCK_COLORS[block.type] || '#888')}99`,
                                  cursor: 'grab',
                                  overflow: 'hidden',
                                }}
                                onMouseDown={e => startBlockDrag(e, block)}
                              >
                                {/* Label */}
                                <span className="absolute top-0.5 left-1 text-teal-deep dark:text-offwhite font-bold pointer-events-none" style={{ fontSize: '9px' }}>{block.label}</span>
                                {/* Delete button */}
                                <button
                                  onMouseDown={e => e.stopPropagation()}
                                  onClick={() => setEditorBlocks(prev => prev.filter(b => b.id !== block.id))}
                                  className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 text-white rounded-bl items-center justify-center hidden group-hover:flex"
                                  style={{ fontSize: '10px', lineHeight: 1 }}
                                >x</button>
                                {/* Resize handle SE */}
                                <div
                                  className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
                                  style={{ background: (BLOCK_COLORS[block.type] || '#888') + 'cc' }}
                                  onMouseDown={e => startBlockResize(e, block, 'se')}
                                />
                                {/* Resize handle E */}
                                <div
                                  className="absolute top-[25%] right-0 w-2 h-[50%] cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '2px 0 0 2px' }}
                                  onMouseDown={e => startBlockResize(e, block, 'e')}
                                />
                                {/* Resize handle S */}
                                <div
                                  className="absolute bottom-0 left-[25%] h-2 w-[50%] cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '2px 2px 0 0' }}
                                  onMouseDown={e => startBlockResize(e, block, 's')}
                                />
                                {/* Resize handle N */}
                                <div
                                  className="absolute top-0 left-[25%] h-2 w-[50%] cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '0 0 2px 2px' }}
                                  onMouseDown={e => startBlockResize(e, block, 'n')}
                                />
                                {/* Resize handle W */}
                                <div
                                  className="absolute top-[25%] left-0 w-2 h-[50%] cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                  style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '0 2px 2px 0' }}
                                  onMouseDown={e => startBlockResize(e, block, 'w')}
                                />
                              </div>
                            ))}
                          </div>

                          {/* Add block dropdown */}
                          <select
                            onChange={e => {
                              const type = e.target.value;
                              if (!type) return;
                              e.target.value = '';
                              const def = DEFAULT_BLOCK_POS[type] || { x: 5, y: 5, w: 90, h: 20 };
                              const maxZ = Math.max(1, ...editorBlocks.map(b => b.zIndex));
                              setEditorBlocks(prev => [...prev, {
                                id: `${type}-${Date.now()}`,
                                type,
                                label: BLOCK_LABELS[type] || type,
                                required: type === 'logo' || type === 'headline',
                                ...def,
                                zIndex: maxZ + 1,
                                children: [{ type }],
                                flexDirection: 'column',
                                justifyContent: 'center',
                                alignItems: 'flex-start',
                              }]);
                            }}
                            className="w-full bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-xs outline-none"
                            defaultValue=""
                          >
                            <option value="">+ Dodaj blok...</option>
                            {BLOCK_TYPES.filter(t => !editorBlocks.some(b => b.type === t && t !== 'spacer')).map(t => (
                              <option key={t} value={t}>{BLOCK_LABELS[t]}</option>
                            ))}
                          </select>

                          {/* Save template */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              className="flex-1 bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-holo-mint"
                              placeholder="Nazwa szablonu..."
                              value={editorTemplateName}
                              onChange={e => setEditorTemplateName(e.target.value)}
                            />
                            <button
                              onClick={saveEditorTemplate}
                              disabled={savingEditorTemplate || !editorTemplateName.trim()}
                              className="h-9 px-3 rounded-xl bg-holo-mint/20 border border-holo-mint/30 text-holo-mint text-xs font-semibold disabled:opacity-40 hover:bg-holo-mint/30 transition-colors whitespace-nowrap"
                            >
                              {savingEditorTemplate ? '...' : 'Zapisz'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-teal-deep/20 dark:border-holo-mint/15 p-8 text-center">
                          <p className="text-xs opacity-30">Wygeneruj lub załaduj szablon żeby edytować układ</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={generateTemplate}
                disabled={generatingTemplate}
                className="w-full h-10 rounded-full border border-holo-lavender/30 text-holo-lavender text-sm font-bold disabled:opacity-40 hover:bg-holo-lavender/10 transition-all flex items-center justify-center gap-2"
              >
                {generatingTemplate
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję szablon...</>
                  : <><Wand2 className="h-4 w-4" /> Generuj template z brand sections</>
                }
              </button>
            </div>

            {/* RIGHT: Precision form */}
            <div className="space-y-4">
              <h2 className="font-black text-base flex items-center gap-2">
                <span className="text-holo-lavender text-sm font-black px-2 py-0.5 border border-holo-lavender/30 rounded-full">Precision</span>
                Nowa grafika
              </h2>

              {/* Format */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map(f => (
                    <button key={f.value} onClick={() => setFormat(f.value)}
                      className={`p-3 rounded-xl text-left border text-sm transition-all ${format === f.value ? 'border-holo-lavender bg-holo-lavender/10 text-holo-lavender' : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'}`}
                    >
                      <div className="font-bold text-xs">{f.label}</div>
                      <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Headline */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst główny *</label>
                <textarea className={`${inputCls} resize-none font-mono`} rows={2}
                  placeholder="np. 23 marca, Warszawa" value={headline} onChange={e => setHeadline(e.target.value)} />
              </div>

              {/* Subtext */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst dodatkowy</label>
                <textarea className={`${inputCls} resize-none font-mono`} rows={2}
                  placeholder="np. Zapisz się teraz →" value={subtext} onChange={e => setSubtext(e.target.value)} />
              </div>

              {/* CTA / Legal / Sticker */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">CTA (opcjonalnie)</label>
                  <input type="text" className={inputCls} placeholder="np. Kup na play.pl"
                    value={ctaText} onChange={e => setCtaText(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst prawny (opcjonalnie)</label>
                  <input type="text" className={inputCls} placeholder="np. *Oferta ważna do 31.03. Szczegóły na play.pl"
                    value={legalText} onChange={e => setLegalText(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Sticker/Patka (opcjonalnie)</label>
                  <input type="text" className={inputCls} placeholder="np. NOWOŚĆ" value={stickerText} onChange={e => setStickerText(e.target.value)} />
                </div>
              </div>

              {/* Central element */}
              <div className="space-y-2">
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Element centralny (opcjonalnie)</label>
                {centralImageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10">
                    <img src={centralImageUrl} alt="Element" className="w-full aspect-square object-contain bg-teal-deep/5 dark:bg-teal-deep/30" />
                    <button
                      onClick={() => setCentralImageUrl(null)}
                      className="absolute top-2 right-2 w-7 h-7 bg-zinc-900/80 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 rounded-full flex items-center justify-center text-xs"
                    >x</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      className={`${inputCls} resize-none`}
                      rows={3}
                      placeholder="Opisz element centralny, np.: Samsung Galaxy A56 5G, dynamic angle, professional product photo..."
                      value={centralPrompt}
                      onChange={e => setCentralPrompt(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <label className="flex-1 h-10 bg-teal-deep/5 dark:bg-teal-mid hover:bg-teal-deep/10 border border-teal-deep/10 dark:border-holo-mint/10 text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors">
                        <Upload className="h-4 w-4" /> Wgraj obraz
                        <input type="file" accept="image/*" className="hidden" onChange={handleCentralImageUpload} />
                      </label>
                      <button
                        onClick={generateCentralElement}
                        disabled={generatingElement || !centralPrompt}
                        className="flex-1 h-10 bg-holo-lavender/10 hover:bg-holo-lavender/20 text-holo-lavender border border-holo-lavender/30 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                      >
                        {generatingElement
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                          : <><Wand2 className="h-4 w-4" /> Generuj AI</>
                        }
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Render CTA */}
              <button onClick={renderPrecision} disabled={rendering || !headline || (!precisionTemplate && editorBlocks.length === 0)}
                className="w-full h-12 rounded-full bg-holo-lavender text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {rendering
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Renderuję...</>
                  : <><Image className="h-4 w-4" /> Renderuj grafikę</>
                }
              </button>
              {!precisionTemplate && (
                <p className="text-xs opacity-30 text-center">Najpierw wygeneruj szablon klikając przycisk po lewej</p>
              )}
            </div>
          </div>

          {/* Historia (shared) */}
          {generations.length > 0 && (
            <div>
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
              <div className="space-y-1.5">
                {generations.map(g => {
                  const urls: string[] = JSON.parse(g.image_urls || '[]');
                  const isActive = selectedGeneration?.id === g.id;
                  const isPrecision = g.format === 'precision';
                  return (
                    <div key={g.id} onClick={() => { setSelectedGeneration(g); }}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${isActive ? 'border-holo-lavender bg-holo-lavender/5' : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-lavender/30 bg-white dark:bg-teal-mid'}`}
                    >
                      <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 ${isActive ? 'border-holo-lavender' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}>
                        {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{g.brief || '—'}</p>
                        {isPrecision && <span className="text-xs text-holo-lavender">Precision</span>}
                      </div>
                      <span className="hidden md:block text-xs opacity-25 whitespace-nowrap shrink-0">
                        {new Date(g.created_at).toLocaleDateString('pl-PL')}
                      </span>
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button onClick={() => deleteGeneration(g.id)} disabled={deletingId === g.id}
                          className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 disabled:opacity-20 transition-all">
                          {deletingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
