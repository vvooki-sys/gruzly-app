'use client';

import { useState, useEffect } from 'react';
import { Loader2, PenLine, Wand2, Check, Copy, CheckCircle2, ChevronLeft, Download, X, ArrowRight } from 'lucide-react';
import type { Project, BrandAsset, Generation, CopyGeneration, CopyVariant } from '@/lib/types';
import { PLATFORM_TO_FORMAT } from '@/lib/types';

interface Props {
  project: Project;
  assets: BrandAsset[];
  generations: Generation[];
  onGenerationsUpdate: (g: Generation[]) => void;
  copyGenerations: CopyGeneration[];
  onCopyGenerationsUpdate: (g: CopyGeneration[]) => void;
  showToast: (msg: string) => void;
  refreshData: () => Promise<void>;
  initialCopyGeneration?: CopyGeneration | null;
  onInitialConsumed?: () => void;
}

const FORMAT_ASPECT: Record<string, string> = {
  fb_post: 'aspect-square',
  ln_post: 'aspect-video',
  story: 'aspect-[9/16]',
  banner: 'aspect-[3/1]',
};

export default function ClientPostCreator({
  project, assets, generations, onGenerationsUpdate,
  copyGenerations, onCopyGenerationsUpdate,
  showToast, refreshData,
  initialCopyGeneration, onInitialConsumed,
}: Props) {
  const id = project.id;

  // Step state
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 state (copy)
  const [task, setTask] = useState('');
  const [platform, setPlatform] = useState('facebook');
  const [logoOnPhoto, setLogoOnPhoto] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [results, setResults] = useState<CopyVariant[]>([]);
  const [concept, setConcept] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [selectedBrief, setSelectedBrief] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [activeGenerationId, setActiveGenerationId] = useState<number | null>(null);

  // Step 2 state (graphic)
  const [quality, setQuality] = useState<1 | 3 | 5>(3);
  const [editableBrief, setEditableBrief] = useState('');
  const [generatingGraphic, setGeneratingGraphic] = useState(false);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Brand context
  const brandSections = ((project as unknown as Record<string, unknown>).brand_sections || []) as Array<{ title: string; content: string }>;
  const hasBrandData = brandSections.length > 0 || !!(project as unknown as Record<string, unknown>).brand_analysis;

  // Load from history
  useEffect(() => {
    if (!initialCopyGeneration) return;
    setTask(initialCopyGeneration.task);
    setPlatform(initialCopyGeneration.format);
    setResults(initialCopyGeneration.variants);
    setConcept(initialCopyGeneration.concept);
    setActiveGenerationId(initialCopyGeneration.id);
    setSelectedVariant(initialCopyGeneration.selected_variant ?? null);
    setSelectedBrief(initialCopyGeneration.selected_variant ?? null);
    setStep(1);
    onInitialConsumed?.();
  }, [initialCopyGeneration, onInitialConsumed]);

  // ── Step 1: Generate copy ──
  const generateCopy = async () => {
    if (!task) return;
    setGeneratingCopy(true);
    setConcept('');
    setResults([]);
    setSelectedVariant(null);
    setSelectedBrief(null);
    try {
      const fd = new FormData();
      fd.append('text', task);
      fd.append('format', platform);
      fd.append('visualType', 'photo');
      fd.append('mode', 'generate');

      const res = await fetch('/api/brand/copy', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setConcept(data.concept || '');
        if (data.generation) {
          setActiveGenerationId(data.generation.id);
          onCopyGenerationsUpdate([data.generation, ...copyGenerations]);
        }
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const selectVariant = async (idx: number) => {
    setSelectedVariant(idx);
    if (activeGenerationId) {
      try {
        await fetch('/api/brand/copy', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId: activeGenerationId, selectedVariant: idx }),
        });
        onCopyGenerationsUpdate(
          copyGenerations.map(g => g.id === activeGenerationId ? { ...g, selected_variant: idx } : g)
        );
      } catch {}
    }
  };

  const goToStep2 = () => {
    if (selectedVariant === null && results.length > 0) {
      selectVariant(0);
      setSelectedVariant(0);
    }
    if (selectedBrief === null && results.length > 0) {
      setSelectedBrief(0);
    }
    // Initialize editable brief from selected brief variant
    const briefIdx = selectedBrief ?? selectedVariant ?? 0;
    const briefText = results[briefIdx]?.visual_brief || '';
    setEditableBrief(briefText);
    setStep(2);
  };

  // ── Step 2: Generate graphic ──
  const getSelectedCopy = () => {
    const idx = selectedVariant ?? 0;
    return results[idx] || null;
  };

  const generateGraphic = async () => {
    const copy = getSelectedCopy();
    if (!copy || !id) return;
    setGeneratingGraphic(true);
    try {
      const format = PLATFORM_TO_FORMAT[platform] || 'fb_post';
      const res = await fetch('/api/brand/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: copy.headline || '',
          subtext: copy.subtext || '',
          brief: editableBrief || copy.visual_brief || '',
          format,
          creativity: quality,
          visualType: 'photo',
          logoOnPhoto,
          isFromCopywriter: true,
        }),
      });
      const data = await res.json();
      if (data.imageUrls && data.imageUrls.length > 0) {
        setSelectedGeneration(data.generation);
        onGenerationsUpdate([data.generation, ...generations]);
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGeneratingGraphic(false);
    }
  };

  const editImage = async () => {
    if (!editingImage || !editInstruction) return;
    setEditing(true);
    try {
      const res = await fetch('/api/brand/edit', {
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
    } catch {
      showToast('Błąd edycji');
    } finally {
      setEditing(false);
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  // ── Render ──
  const imageUrls: string[] = selectedGeneration ? JSON.parse(selectedGeneration.image_urls || '[]') : [];
  const format = PLATFORM_TO_FORMAT[platform] || 'fb_post';

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(1)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
            step === 1 ? 'holo-gradient text-teal-deep shadow-sm' : 'text-muted hover:opacity-100'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-teal-deep/10 dark:bg-white/10 flex items-center justify-center text-xs font-black">1</span>
          Napisz copy
        </button>
        <ArrowRight className="h-4 w-4 text-hint" />
        <button
          onClick={() => results.length > 0 && goToStep2()}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
            step === 2 ? 'holo-gradient text-teal-deep shadow-sm' : results.length > 0 ? 'text-muted hover:opacity-100' : 'text-hint cursor-not-allowed'
          }`}
        >
          <span className="w-5 h-5 rounded-full bg-teal-deep/10 dark:bg-white/10 flex items-center justify-center text-xs font-black">2</span>
          Wygeneruj grafikę
        </button>
      </div>

      {/* Main grid — form LEFT (420px), results RIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)] gap-6 lg:gap-8 items-start">

        {/* ── RIGHT: Results (flexible) ── */}
        <div className="lg:sticky lg:top-[72px] space-y-3 lg:order-2 order-1">
          {step === 1 ? (
            <>
              <h2 className="font-black text-base">
                {results.length > 0 ? `${results.length} warianty` : 'Wyniki'}
              </h2>
              <div className={`rounded-2xl overflow-hidden transition-all duration-700 ease-out ${
                results.length === 0
                  ? 'border border-teal-deep/5 dark:border-holo-mint/5 bg-white/30 dark:bg-teal-mid/30'
                  : 'panel'
              }`}>
                {results.length === 0 ? (
                  <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 240px)' }}>
                    <div className="text-center space-y-3 px-8">
                      <div className="text-5xl mb-3">✍️</div>
                      <p className="font-bold text-sm">Opisz co chcesz opublikować</p>
                      <p className="text-xs text-hint">AI napisze tekst posta i przygotuje brief do grafiki — w jednym kroku</p>
                    </div>
                  </div>
                ) : (
                  <div className="max-h-[calc(100vh-180px)] overflow-y-auto p-4 space-y-3 animate-[fadeIn_0.6s_ease-out]">
                    {concept && (
                      <div className="bg-holo-mint/5 border border-holo-mint/20 rounded-xl px-4 py-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-holo-mint text-muted mb-1">Koncept</p>
                        <p className="text-sm">{concept}</p>
                      </div>
                    )}
                    {results.map((r, i) => {
                      const isCopySelected = selectedVariant === i;
                      const isBriefSelected = selectedBrief === i;
                      return (
                        <div
                          key={i}
                          className={`border rounded-xl p-4 space-y-3 transition-all ${
                            isCopySelected || isBriefSelected
                              ? 'border-holo-mint/50 bg-holo-mint/5'
                              : 'border-teal-deep/12 dark:border-holo-mint/20'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold bg-teal-deep/10 dark:bg-teal-deep px-2 py-0.5 rounded-full">
                              Wariant {i + 1}
                            </span>
                            {isCopySelected && (
                              <span className="text-xs font-bold text-holo-mint flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Copy
                              </span>
                            )}
                            {isBriefSelected && (
                              <span className="text-xs font-bold text-holo-lavender flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Brief
                              </span>
                            )}
                          </div>

                          {/* Post copy */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-muted uppercase tracking-wide">Treść posta</p>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => copyText(r.post_copy, i)}
                                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                                    copiedIdx === i
                                      ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                                      : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted hover:opacity-100'
                                  }`}
                                >
                                  {copiedIdx === i ? <><Check className="h-3 w-3" /> Skopiowano</> : <><Copy className="h-3 w-3" /> Kopiuj</>}
                                </button>
                                <button
                                  onClick={() => selectVariant(i)}
                                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                                    isCopySelected
                                      ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                                      : 'border-holo-mint/30 text-holo-mint hover:bg-holo-mint/10'
                                  }`}
                                >
                                  <CheckCircle2 className="h-3 w-3" /> {isCopySelected ? 'Wybrane' : 'Użyj'}
                                </button>
                              </div>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-line">{r.post_copy}</p>
                          </div>

                          {/* Brief */}
                          <div className="space-y-1.5 border-l-2 border-holo-lavender/30 pl-3">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-muted uppercase tracking-wide">Brief dla fotografa</p>
                              <button
                                onClick={() => setSelectedBrief(i)}
                                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                                  isBriefSelected
                                    ? 'border-holo-lavender text-holo-lavender bg-holo-lavender/10'
                                    : 'border-holo-lavender/30 text-holo-lavender hover:bg-holo-lavender/10'
                                }`}
                              >
                                <CheckCircle2 className="h-3 w-3" /> {isBriefSelected ? 'Wybrany' : 'Użyj'}
                              </button>
                            </div>
                            <p className="text-xs text-muted leading-relaxed">{r.visual_brief}</p>
                          </div>
                        </div>
                      );
                    })}

                    {/* Go to step 2 — visible when both selections made */}
                    {selectedVariant !== null && selectedBrief !== null && (
                      <button
                        onClick={goToStep2}
                        className="w-full h-10 rounded-full holo-gradient text-teal-deep text-sm font-bold flex items-center justify-center gap-2 sticky bottom-2"
                      >
                        Dalej — Wygeneruj grafikę <ArrowRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-black text-base">Podgląd</h2>
              <div className="panel rounded-2xl overflow-hidden">
                {imageUrls[0] ? (
                  <div>
                    <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} relative`}>
                      <img src={imageUrls[0]} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex gap-2 p-3 border-t border-teal-deep/12 dark:border-holo-mint/20">
                      <a
                        href={imageUrls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 h-9 rounded-full border border-teal-deep/12 dark:border-holo-mint/20 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted hover:opacity-100 transition-all"
                      >
                        <Download className="h-3.5 w-3.5" /> Pobierz
                      </a>
                      <button
                        onClick={() => {
                          if (imageUrls[0]) {
                            setEditingImage({ url: imageUrls[0], generationId: selectedGeneration?.id });
                            setEditInstruction('');
                          }
                        }}
                        className="flex-1 h-9 rounded-full border border-teal-deep/12 dark:border-holo-mint/20 flex items-center justify-center gap-1.5 text-xs font-semibold text-muted hover:opacity-100 transition-all"
                      >
                        <Wand2 className="h-3.5 w-3.5" /> Edytuj
                      </button>
                    </div>
                    {editingImage && (
                      <div className="p-3 border-t border-teal-deep/12 dark:border-holo-mint/20 space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="flex-1 panel-inset rounded-full px-3 py-2 text-sm border border-teal-deep/12 dark:border-holo-mint/20 focus:border-holo-mint outline-none"
                            placeholder="np. Rozjaśnij zdjęcie, oddal trochę..."
                            value={editInstruction}
                            onChange={e => setEditInstruction(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && editImage()}
                          />
                          <button
                            onClick={editImage}
                            disabled={editing || !editInstruction}
                            className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40"
                          >
                            {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Zastosuj'}
                          </button>
                          <button onClick={() => setEditingImage(null)} className="w-9 h-9 rounded-full border border-teal-deep/12 dark:border-holo-mint/20 flex items-center justify-center text-muted">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                    <div className="text-center space-y-3">
                      <div className="text-5xl mb-3">🖼️</div>
                      <p className="text-sm text-hint">Podgląd grafiki</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── LEFT: Form (420px) ── */}
        <div className="space-y-4 lg:order-1 order-2">
          {step === 1 ? (
            <>
              <h2 className="font-black text-base">Nowy post</h2>

              {/* Trust badge */}
              {hasBrandData && (
                <div className="flex items-center gap-2 text-xs text-holo-mint bg-holo-mint/5 border border-holo-mint/20 px-3 py-2 rounded-xl">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Pamiętaj! Gruzly już zna Twoją markę — sposób komunikacji, styl, ton głosu i wiele innych ;-)</span>
                </div>
              )}

              {/* Task */}
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block uppercase tracking-wide">
                  Co chcesz opublikować?
                </label>
                <textarea
                  className="w-full text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border-2 border-holo-mint/30 dark:border-holo-mint/20 focus:border-holo-mint outline-none transition-colors resize-none panel-inset"
                  rows={5}
                  placeholder="np. Post promujący nowe menu lunchowe na wiosnę, podkreśl świeże składniki i cenę 29 zł"
                  value={task}
                  onChange={e => setTask(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Platform */}
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block uppercase tracking-wide">Platforma</label>
                <div className="flex gap-2">
                  {[
                    { id: 'facebook', label: 'Facebook', icon: '📘' },
                    { id: 'instagram', label: 'Instagram', icon: '📸' },
                    { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
                  ].map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPlatform(p.id)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all panel-inset ${
                        platform === p.id
                          ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                          : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted hover:opacity-100'
                      }`}
                    >
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo toggle */}
              <button
                onClick={() => setLogoOnPhoto(!logoOnPhoto)}
                className={`w-full py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2.5 text-sm font-semibold panel-inset ${
                  logoOnPhoto
                    ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                    : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted hover:border-holo-mint/40'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                  logoOnPhoto ? 'border-holo-mint bg-holo-mint' : 'border-current/30'
                }`}>
                  {logoOnPhoto && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#1A1A1F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                Dodaj logo marki na grafikę
              </button>

              {/* CTA */}
              <button
                onClick={generateCopy}
                disabled={generatingCopy || !task}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generatingCopy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę post...</>
                  : <><PenLine className="h-4 w-4" /> Napisz post i przygotuj grafikę</>
                }
              </button>

            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep(1)} className="text-xs text-muted hover:opacity-100 flex items-center gap-1 transition-opacity">
                  <ChevronLeft className="h-3.5 w-3.5" /> Zmień tekst posta
                </button>
              </div>

              {/* Copy preview */}
              {getSelectedCopy() && (
                <div className="panel rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-muted uppercase tracking-wide">Tekst posta</p>
                    <button
                      onClick={() => copyText(getSelectedCopy()!.post_copy, 99)}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                        copiedIdx === 99
                          ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                          : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted'
                      }`}
                    >
                      {copiedIdx === 99 ? <><Check className="h-3 w-3" /> Skopiowano</> : <><Copy className="h-3 w-3" /> Kopiuj</>}
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{getSelectedCopy()!.post_copy}</p>

                  <div className="border-l-2 border-holo-lavender/30 pl-3 space-y-1.5">
                    <p className="text-xs font-bold text-muted uppercase tracking-wide">Brief dla fotografa</p>
                    <textarea
                      className="w-full text-xs leading-relaxed panel-inset rounded-lg px-3 py-2 border border-teal-deep/12 dark:border-holo-mint/20 focus:border-holo-lavender outline-none transition-colors resize-none text-teal-deep dark:text-offwhite"
                      rows={4}
                      value={editableBrief}
                      onChange={e => setEditableBrief(e.target.value)}
                    />
                    <p className="text-xs text-hint">Możesz edytować brief przed generowaniem grafiki</p>
                  </div>
                </div>
              )}

              {/* Quality */}
              <div>
                <label className="text-xs font-semibold text-muted mb-1.5 block uppercase tracking-wide">Jakość grafiki</label>
                <div className="flex gap-2">
                  {([
                    { value: 1 as const, label: 'Szybka' },
                    { value: 3 as const, label: 'Standard' },
                    { value: 5 as const, label: 'Premium' },
                  ]).map(q => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all panel-inset ${
                        quality === q.value
                          ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                          : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted hover:opacity-100'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate graphic CTA */}
              <button
                onClick={generateGraphic}
                disabled={generatingGraphic}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generatingGraphic
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję grafikę...</>
                  : <><Wand2 className="h-4 w-4" /> Generuj grafikę</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
