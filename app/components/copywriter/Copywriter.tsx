'use client';

import { useState } from 'react';
import { Upload, Loader2, PenLine, Wand2, Camera, Image, Check, Copy, Type, Eye, Trash2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import type { Project, CopyGeneration, CopyVariant, CopyToGeneratorData } from '@/lib/types';

interface CopywriterProps {
  project: Project;
  copyGenerations: CopyGeneration[];
  onCopyGenerationsUpdate: (g: CopyGeneration[]) => void;
  showToast: (msg: string) => void;
  onUseCopy?: (data: CopyToGeneratorData) => void;
}

const inputCls =
  'w-full text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/20 focus:border-holo-mint outline-none transition-colors panel-inset';

const FORMATS = [
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'general', label: 'Ogólny', icon: '📝' },
];

// NOTE: 'graphic' and 'photo_text' hidden behind flag, will return later
const ENABLE_GRAPHIC_MODES = false;

const VISUAL_TYPES_ALL = [
  { id: 'graphic' as const, icon: Image, label: 'Grafika', desc: 'Ilustracja, typografia, tekst na grafice' },
  { id: 'photo' as const, icon: Camera, label: 'Zdjęcie', desc: 'Fotografia bez tekstu' },
  { id: 'photo_text' as const, icon: Type, label: 'Zdjęcie + tekst', desc: 'Foto z nałożonym tekstem' },
];

const VISUAL_TYPES_PHOTO = [
  { id: 'photo' as const, icon: Camera, label: 'Zdjęcie', desc: 'Fotografia bez tekstu' },
  { id: 'photo_logo' as const, icon: Camera, label: 'Zdjęcie', desc: '+ logo marki' },
];

const VISUAL_TYPES = ENABLE_GRAPHIC_MODES ? VISUAL_TYPES_ALL : VISUAL_TYPES_PHOTO;

const FORMAT_LABELS: Record<string, string> = { facebook: '📘 Facebook', instagram: '📸 Instagram', linkedin: '💼 LinkedIn', general: '📝 Ogólny' };
const VISUAL_LABELS: Record<string, string> = { graphic: 'Grafika', photo: 'Zdjęcie', photo_text: 'Zdjęcie + tekst', photo_logo: 'Zdjęcie + logo' };

export default function Copywriter({ project, copyGenerations, onCopyGenerationsUpdate, showToast, onUseCopy }: CopywriterProps) {
  const [task, setTask] = useState('');
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [format, setFormat] = useState('facebook');
  const [visualType, setVisualType] = useState<'graphic' | 'photo' | 'photo_text'>('photo');
  const [logoOnPhoto, setLogoOnPhoto] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<CopyVariant[]>([]);
  const [concept, setConcept] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [currentVisualType, setCurrentVisualType] = useState<string>('graphic');

  // Prompt preview
  const [promptText, setPromptText] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // History
  const [selectedHistory, setSelectedHistory] = useState<CopyGeneration | null>(null);
  const [historyExpanded, setHistoryExpanded] = useState(true);

  const copyTextFn = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const previewPrompt = async () => {
    if (!task && !briefFile) return;
    setLoadingPrompt(true);
    try {
      const fd = new FormData();
      if (briefFile) fd.append('file', briefFile);
      if (task) fd.append('text', task);
      fd.append('format', format);
      fd.append('visualType', visualType);
      fd.append('mode', 'preview');

      const res = await fetch('/api/brand/copy', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.prompt) {
        setPromptText(data.prompt);
        setShowPrompt(true);
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setLoadingPrompt(false);
    }
  };

  const generate = async (useCustomPrompt = false) => {
    if (!task && !briefFile && !useCustomPrompt) return;
    setGenerating(true);
    setConcept('');
    setResults([]);
    setSelectedHistory(null);
    try {
      const fd = new FormData();
      if (briefFile) fd.append('file', briefFile);
      if (task) fd.append('text', task);
      fd.append('format', format);
      fd.append('visualType', visualType);
      fd.append('mode', 'generate');
      if (useCustomPrompt && promptText) {
        fd.append('customPrompt', promptText);
      }

      const res = await fetch('/api/brand/copy', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setConcept(data.concept || '');
        setCurrentVisualType(visualType);
        setShowPrompt(false);
        if (data.generation) {
          onCopyGenerationsUpdate([data.generation, ...copyGenerations]);
        }
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGenerating(false);
    }
  };

  const selectVariant = async (generationId: number, variantIdx: number) => {
    try {
      await fetch('/api/brand/copy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId, selectedVariant: variantIdx }),
      });
      onCopyGenerationsUpdate(
        copyGenerations.map(g => g.id === generationId ? { ...g, selected_variant: variantIdx } : g)
      );
      showToast('Wariant wybrany');
    } catch {
      showToast('Błąd zapisu');
    }
  };

  const deleteGeneration = async (genId: number) => {
    if (!confirm('Usunąć tę generację z historii?')) return;
    try {
      await fetch(`/api/brand/copy?generationId=${genId}`, { method: 'DELETE' });
      onCopyGenerationsUpdate(copyGenerations.filter(g => g.id !== genId));
      if (selectedHistory?.id === genId) setSelectedHistory(null);
    } catch {
      showToast('Błąd usuwania');
    }
  };

  const loadFromHistory = (gen: CopyGeneration) => {
    setSelectedHistory(gen);
    setResults(gen.variants);
    setConcept(gen.concept);
    setCurrentVisualType(gen.visual_type);
    setTask(gen.task);
    setFormat(gen.format);
    if (ENABLE_GRAPHIC_MODES) {
      setVisualType(gen.visual_type as 'graphic' | 'photo' | 'photo_text');
    } else {
      setVisualType('photo');
      setLogoOnPhoto(false);
    }
  };

  const activeGenerationId = selectedHistory?.id || copyGenerations[0]?.id;
  const activeSelectedVariant = selectedHistory?.selected_variant ??
    copyGenerations.find(g => g.id === activeGenerationId)?.selected_variant ?? null;

  return (
    <div className="space-y-6">
      {/* Main grid: Results LEFT (sticky) | Form RIGHT (420px) — matches Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

        {/* ── LEFT: Results (sticky on desktop) ────────────────────────── */}
        <div className="lg:sticky lg:top-[72px] space-y-3">
          <h2 className="font-black text-base">
            {results.length > 0 ? `${results.length} warianty` : 'Wyniki'}
          </h2>

          <div className={`rounded-2xl overflow-hidden transition-all duration-700 ease-out ${
            results.length === 0
              ? 'border border-teal-deep/5 dark:border-holo-mint/5 bg-white/30 dark:bg-teal-mid/30'
              : 'panel opacity-100'
          }`}>
            {results.length === 0 ? (
              <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 180px)' }}>
                <div className="text-center space-y-3">
                  <div className="text-5xl mb-3">✍️</div>
                  <p className="text-sm text-hint">Tutaj powstanie pomysł na Twoją komunikację</p>
                </div>
              </div>
            ) : (
              <div className="max-h-[calc(100vh-120px)] overflow-y-auto p-4 space-y-3 animate-[fadeIn_0.6s_ease-out]">
                {/* Concept */}
                {concept && (
                  <div className="bg-holo-mint/5 border border-holo-mint/20 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-holo-mint opacity-70 mb-1">Koncept</p>
                    <p className="text-sm opacity-80">{concept}</p>
                  </div>
                )}

                {/* Variants */}
                {results.map((r, i) => {
                  const isSelected = activeSelectedVariant === i;
                  return (
                    <div
                      key={i}
                      className={`border rounded-xl p-4 space-y-3 transition-all ${
                        isSelected
                          ? 'border-holo-mint ring-1 ring-holo-mint/30 bg-holo-mint/5'
                          : 'border-teal-deep/12 dark:border-holo-mint/20'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold bg-teal-deep/10 dark:bg-teal-deep px-2 py-0.5 rounded-full">
                          Wariant {i + 1}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-bold text-holo-mint flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Wybrany
                          </span>
                        )}
                        {r.rationale && <span className="text-xs text-hint italic flex-1 truncate">{r.rationale}</span>}
                      </div>

                      {/* Post copy */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-muted uppercase tracking-wide">Treść posta</p>
                          <button
                            onClick={() => copyTextFn(r.post_copy, i)}
                            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                              copiedIdx === i
                                ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                                : 'border-teal-deep/12 dark:border-holo-mint/20 opacity-50 hover:opacity-90 hover:border-holo-mint/40'
                            }`}
                          >
                            {copiedIdx === i ? <><Check className="h-3 w-3" /> Skopiowano</> : <><Copy className="h-3 w-3" /> Kopiuj</>}
                          </button>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-line">{r.post_copy}</p>
                      </div>

                      {/* Visual brief */}
                      <div className="space-y-1.5 border-l-2 border-holo-lavender/30 pl-3">
                        <p className="text-xs font-bold text-muted uppercase tracking-wide">
                          {currentVisualType === 'graphic' ? '🎨 Brief dla grafika' : '📷 Brief dla fotografa'}
                        </p>
                        <p className="text-xs opacity-60 leading-relaxed">{r.visual_brief}</p>
                      </div>

                      {/* Headline/subtext */}
                      {currentVisualType !== 'photo' && (r.headline || r.subtext) && (
                        <div className="space-y-1 bg-offwhite dark:bg-teal-deep rounded-lg px-3 py-2">
                          <p className="text-xs font-bold text-hint uppercase tracking-wide">
                            {currentVisualType === 'photo_text' ? 'Tekst na zdjęcie' : 'Tekst na grafikę'}
                          </p>
                          {r.headline && <p className="text-sm font-bold">{r.headline}</p>}
                          {r.subtext && <p className="text-xs opacity-60">{r.subtext}</p>}
                          {r.cta && <p className="text-xs text-holo-mint font-medium">{r.cta}</p>}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        {activeGenerationId && (
                          <button
                            onClick={() => selectVariant(activeGenerationId, i)}
                            className={`flex-1 h-8 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                              isSelected
                                ? 'bg-holo-mint/20 border border-holo-mint text-holo-mint'
                                : 'bg-holo-mint/10 hover:bg-holo-mint/20 border border-holo-mint/30 hover:border-holo-mint text-holo-mint'
                            }`}
                          >
                            <CheckCircle2 className="h-3 w-3" /> {isSelected ? 'Wybrany' : 'Wybierz wariant'}
                          </button>
                        )}
                        <button
                          onClick={() => onUseCopy?.({ headline: r.headline || '', subtext: r.subtext || '', cta: r.cta, visualBrief: r.visual_brief || '', visualType: (ENABLE_GRAPHIC_MODES ? currentVisualType : 'photo') as 'graphic' | 'photo' | 'photo_text', logoOnPhoto, platform: format })}
                          className="flex-1 h-8 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/12 dark:border-holo-mint/20 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Wand2 className="h-3 w-3" /> Użyj w generatorze
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Form ──────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="font-black text-base">Nowe copy</h2>

          {/* Task */}
          <div>
            <label className="text-xs font-semibold opacity-70 mb-1.5 block uppercase tracking-wide">
              Zadanie *
            </label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={4}
              placeholder="Co chcesz zakomunikować? np. 'Post promujący nowe menu lunchowe na wiosnę, podkreśl świeże składniki i cenę 29 zł'"
              value={task}
              onChange={e => setTask(e.target.value)}
              autoFocus
            />
          </div>

          {/* Brief file */}
          <label className="cursor-pointer w-full h-12 border border-dashed border-teal-deep/12 dark:border-holo-mint/20 hover:border-holo-mint/30 rounded-xl flex items-center justify-center gap-2 text-xs opacity-50 hover:opacity-80 transition-all">
            <Upload className="h-3.5 w-3.5" />
            {briefFile ? `📄 ${briefFile.name}` : 'Opcjonalnie: wgraj brief (PDF, DOCX, TXT)'}
            <input
              type="file"
              accept=".docx,.txt,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setBriefFile(f); }}
            />
          </label>

          {/* Format */}
          <div>
            <label className="text-xs font-semibold opacity-70 mb-1.5 block uppercase tracking-wide">Platforma</label>
            <div className="flex gap-2">
              {FORMATS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all panel-inset ${
                    format === f.id
                      ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                      : 'border-teal-deep/12 dark:border-holo-mint/20 opacity-70 hover:opacity-100'
                  }`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Visual type */}
          <div>
            <label className="text-xs font-semibold opacity-70 mb-1.5 block uppercase tracking-wide">Typ wizuala do posta</label>
            <div className={`grid gap-2 ${ENABLE_GRAPHIC_MODES ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {VISUAL_TYPES.map(vt => {
                const isPhotoLogo = vt.id === 'photo_logo';
                const active = ENABLE_GRAPHIC_MODES
                  ? visualType === vt.id
                  : isPhotoLogo ? logoOnPhoto : !logoOnPhoto;
                return (
                  <button
                    key={vt.id}
                    onClick={() => {
                      if (ENABLE_GRAPHIC_MODES) {
                        setVisualType(vt.id as 'graphic' | 'photo' | 'photo_text');
                      } else {
                        setVisualType('photo');
                        setLogoOnPhoto(isPhotoLogo);
                      }
                    }}
                    className={`py-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 panel-inset ${
                      active
                        ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                        : 'border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/40'
                    }`}
                  >
                    <vt.icon className={`h-5 w-5 ${active ? '' : 'opacity-50'}`} />
                    <span className={`text-xs font-bold ${active ? '' : 'opacity-60'}`}>{vt.label}</span>
                    <span className={`text-xs text-center leading-tight px-1 ${active ? 'opacity-60' : 'text-hint'}`}>{vt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt preview */}
          {showPrompt && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted uppercase tracking-wide">Prompt (edytowalny)</label>
                <button
                  onClick={() => setShowPrompt(false)}
                  className="text-xs opacity-40 hover:opacity-80 transition-opacity"
                >
                  Zamknij
                </button>
              </div>
              <textarea
                className={`${inputCls} resize-y font-mono text-xs`}
                rows={16}
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {!showPrompt ? (
              <>
                <button
                  onClick={previewPrompt}
                  disabled={loadingPrompt || generating || (!task && !briefFile)}
                  className="flex-1 h-12 rounded-full border-2 border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 text-sm font-bold disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  {loadingPrompt
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Ładuję...</>
                    : <><Eye className="h-4 w-4" /> Pokaż prompt</>
                  }
                </button>
                <button
                  onClick={() => generate(false)}
                  disabled={generating || (!task && !briefFile)}
                  className="flex-1 h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
                >
                  {generating
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...</>
                    : <><PenLine className="h-4 w-4" /> Napisz copy</>
                  }
                </button>
              </>
            ) : (
              <button
                onClick={() => generate(true)}
                disabled={generating}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...</>
                  : <><PenLine className="h-4 w-4" /> Napisz copy (z edytowanym promptem)</>
                }
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── History ── */}
      {copyGenerations.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="flex items-center gap-2 w-full"
          >
            <h2 className="font-black text-base">Historia ({copyGenerations.length})</h2>
            {historyExpanded ? <ChevronUp className="h-4 w-4 opacity-40" /> : <ChevronDown className="h-4 w-4 opacity-40" />}
          </button>

          {historyExpanded && (
            <div className="space-y-2">
              {copyGenerations.map(g => {
                const isActive = selectedHistory?.id === g.id;
                const hasSelected = g.selected_variant !== null && g.selected_variant !== undefined;
                return (
                  <div
                    key={g.id}
                    onClick={() => loadFromHistory(g)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                      isActive
                        ? 'border-holo-mint bg-holo-mint/5'
                        : 'border-teal-deep/12 dark:border-holo-mint/20 hover:border-holo-mint/30 bg-white dark:bg-teal-mid'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{g.task || 'Bez opisu'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted">{FORMAT_LABELS[g.format] || g.format}</span>
                        <span className="text-xs text-hint">·</span>
                        <span className="text-xs text-muted">{VISUAL_LABELS[g.visual_type] || g.visual_type}</span>
                        {hasSelected && (
                          <>
                            <span className="text-xs text-hint">·</span>
                            <span className="text-xs text-holo-mint font-semibold flex items-center gap-0.5">
                              <CheckCircle2 className="h-3 w-3" /> W{(g.selected_variant ?? 0) + 1}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-hint whitespace-nowrap shrink-0">
                      {new Date(g.created_at).toLocaleDateString('pl-PL')}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteGeneration(g.id); }}
                      className="w-7 h-7 rounded-full flex items-center justify-center border border-teal-deep/12 dark:border-holo-mint/20 opacity-30 hover:opacity-80 hover:border-red-400/50 hover:text-red-400 transition-all shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
