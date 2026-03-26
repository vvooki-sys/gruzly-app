'use client';

import { useState, useEffect } from 'react';
import {
  Upload, Wand2, Loader2, Download,
  BookmarkPlus, Trash2, Zap,
  Camera, X, PenLine, LayoutGrid,
} from 'lucide-react';
import type {
  Project,
  BrandAsset,
  Generation,
  CopyToGeneratorData,
} from '@/lib/types';
import { PLATFORM_TO_FORMAT } from '@/lib/types';
import Gallery from './Gallery';

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
  1: { name: 'Minimalny', desc: 'Jak szybkie zdjęcie telefonem — czyste, proste, spełnia zadanie.' },
  2: { name: 'Prosty', desc: 'Jak amator z dobrym aparatem — widać intencję, staranny kadr.' },
  3: { name: 'Precyzyjny', desc: 'Jak zawodowiec z komórką — mało elementów, ale każdy perfekcyjnie na miejscu.' },
  4: { name: 'Głębia', desc: 'Jak fotograf z lustrzanką — warstwy, światło, cień, wszystko pod kontrolą.' },
  5: { name: 'Reklamowy', desc: 'Jak profesjonalna sesja reklamowa — dramatyczne światło, odważna kompozycja.' },
  6: { name: 'Arcydzieło', desc: 'Jak zdjęcie, przy którym zatrzymujesz scroll — kinowa atmosfera, każdy detal celowy.' },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getBaseFormat(fmt: string) {
  return fmt.split(':')[0];
}
function getFormatLabel(fmt: string) {
  return FORMATS.find(f => f.value === getBaseFormat(fmt))?.label ?? fmt;
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
  copyData?: CopyToGeneratorData | null;
  onCopyDataConsumed?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Generator({
  project,
  assets,
  generations,
  onGenerationsUpdate,
  onAssetsUpdate,
  showToast,
  copyData,
  onCopyDataConsumed,
}: GeneratorProps) {
  const id = project.id;

  // Generator state
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState('fb_post');
  const [creativity, setCreativity] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Photo state
  const [photoMode, setPhotoMode] = useState<'none' | 'upload' | 'generate' | 'library'>('none');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Edit state
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Copywriter data bridge
  const [fromCopywriter, setFromCopywriter] = useState(false);

  // Visual type — auto-set from copywriter, fallback to 'photo' default
  // NOTE: 'graphic' and 'photo_text' hidden behind flag, will return later
  const ENABLE_GRAPHIC_MODES = false;
  const [visualType, setVisualType] = useState<'graphic' | 'photo' | 'photo_text'>('photo');
  const [logoOnPhoto, setLogoOnPhoto] = useState(false);

  useEffect(() => {
    if (!copyData) return;
    setHeadline(copyData.headline || '');
    setSubtext(copyData.subtext || '');
    setBrief(copyData.visualBrief || '');
    if (copyData.platform) {
      const mapped = PLATFORM_TO_FORMAT[copyData.platform];
      if (mapped) setFormat(mapped);
    }
    if (copyData.visualType) {
      if (ENABLE_GRAPHIC_MODES) {
        setVisualType(copyData.visualType);
      } else {
        setVisualType('photo');
      }
      if (copyData.visualType === 'photo') {
        setPhotoMode('none');
        setPhotoUrl('');
      }
    }
    if (copyData.logoOnPhoto !== undefined) {
      setLogoOnPhoto(copyData.logoOnPhoto);
    }
    setFromCopywriter(true);
    onCopyDataConsumed?.();
    const t = setTimeout(() => setFromCopywriter(false), 4000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copyData]);

  // Derived
  const references = assets.filter(a => a.type === 'reference');
  const brandSections = ((project as unknown as Record<string, unknown>).brand_sections || []) as Array<{ title: string; content: string }>;

  const inputCls = 'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

  // ── Handler: generate ──────────────────────────────────────────────────────

  const generate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/brand/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, subtext, brief, format, creativity, photoUrl: photoUrl || undefined, photoMode, visualType, logoOnPhoto, isFromCopywriter: fromCopywriter }),
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
      const res = await fetch(`/api/brand/assets`, { method: 'POST', body: fd });
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
      const res = await fetch(`/api/brand/edit`, {
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
    const res = await fetch(`/api/brand/assets`, {
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
    if (!window.confirm('Usunąć tę grafikę z historii?')) return;
    setDeletingId(genId);
    try {
      const res = await fetch(`/api/brand/generations?generationId=${genId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        alert('Błąd usuwania: ' + (err.error || res.status));
        return;
      }
      onGenerationsUpdate(generations.filter(g => g.id !== genId));
      if (selectedGeneration?.id === genId) setSelectedGeneration(null);
    } catch (e) {
      console.error('Delete error:', e);
      alert('Błąd połączenia przy usuwaniu');
    } finally {
      setDeletingId(null);
    }
  };


  const galleryDelete = async (genId: number) => {
    const res = await fetch(`/api/brand/generations?generationId=${genId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    onGenerationsUpdate(generations.filter(g => g.id !== genId));
    if (selectedGeneration?.id === genId) setSelectedGeneration(null);
  };

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <>
      {showGallery && (
        <Gallery
          generations={generations}
          onClose={() => setShowGallery(false)}
          onDelete={galleryDelete}
        />
      )}

      {/* ── Generator ──────────────────────────────────────────────────────── */}
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
              <div className="flex items-center justify-between">
                <h2 className="font-black text-base">Nowa grafika</h2>
                {generations.length > 0 && (
                  <button
                    onClick={() => setShowGallery(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-100 hover:border-holo-mint/50 transition-all"
                    title="Galeria"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" /> Galeria ({generations.length})
                  </button>
                )}
              </div>

              {/* Copywriter data banner */}
              {fromCopywriter && (
                <div className="flex items-center gap-2 text-xs text-holo-lavender bg-holo-lavender/10 border border-holo-lavender/20 px-3 py-2 rounded-xl animate-pulse">
                  <PenLine className="h-3 w-3 shrink-0" />
                  <span>Dane z Copywritera załadowane — headline, brief, CTA, format</span>
                </div>
              )}

              {/* Text fields — hidden when graphic modes disabled */}
              {ENABLE_GRAPHIC_MODES && visualType !== 'photo' && (
                <>
                  {/* 1. Headline — required */}
                  <div>
                    <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                      Tekst główny <span className="normal-case opacity-70 font-normal">— nagłówek grafiki</span>
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
                </>
              )}

              {/* Zadanie (brief) */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Zadanie
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Opisz nastrój, styl, co ma pokazywać grafika. Copywriter może wygenerować to automatycznie."
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                />
              </div>

              {/* Photo — only shown for graphic modes */}
              {ENABLE_GRAPHIC_MODES && visualType !== 'photo' && (
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

              {/* Visual type picker — photo modes */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Typ wizualu do posta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setVisualType('photo'); setLogoOnPhoto(false); }}
                    className={`p-3 rounded-xl text-center border text-xs font-semibold transition-all ${
                      visualType === 'photo' && !logoOnPhoto
                        ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                        : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <span className="block text-base mb-0.5">📷</span>
                    <span className="block">Zdjęcie</span>
                    <span className="block opacity-60 font-normal">Fotografia bez tekstu</span>
                  </button>
                  <button
                    onClick={() => { setVisualType('photo'); setLogoOnPhoto(true); }}
                    className={`p-3 rounded-xl text-center border text-xs font-semibold transition-all ${
                      logoOnPhoto
                        ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                        : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <span className="block text-base mb-0.5">📷</span>
                    <span className="block">Zdjęcie</span>
                    <span className="block opacity-60 font-normal">+ logo marki</span>
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
                  type="range" min={1} max={6} step={1}
                  value={creativity}
                  onChange={e => setCreativity(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-teal-mid accent-holo-mint"
                />
                <p className="text-xs text-zinc-500 mt-1">{CREATIVITY_LABELS[creativity].desc}</p>
              </div>

              {/* Generate CTA */}
              <button
                onClick={generate}
                disabled={generating}
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
    </>
  );
}
