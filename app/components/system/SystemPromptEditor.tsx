'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronRight, Save, Loader2, RotateCcw, Clock, Eye,
  Camera, Palette, Sparkles, Layers, PenLine, Mic2, ScanSearch, LayoutTemplate,
} from 'lucide-react';

interface SystemPrompt {
  id: string;
  category: string;
  label: string;
  description: string | null;
  content: string;
  content_type: 'text' | 'json' | 'list';
  sort_order: number;
  updated_at: string;
}

interface SystemPromptEditorProps {
  showToast: (msg: string) => void;
}

const CATEGORY_META: Record<string, { label: string; icon: typeof Camera }> = {
  generator_photo:      { label: 'Generator — Foto',        icon: Camera },
  generator_graphic:    { label: 'Generator — Graficzny',   icon: Palette },
  generator_element:    { label: 'Generator — Element',     icon: Sparkles },
  generator_compositor: { label: 'Generator — Compositor',  icon: Layers },
  copywriter:           { label: 'Copywriter',              icon: PenLine },
  voice_card:           { label: 'Voice Card',              icon: Mic2 },
  brand_analysis:       { label: 'Brand Scan',              icon: ScanSearch },
  template:             { label: 'Template',                icon: LayoutTemplate },
};

const CATEGORY_ORDER = [
  'generator_photo', 'generator_graphic', 'generator_element', 'generator_compositor',
  'copywriter', 'voice_card', 'brand_analysis', 'template',
];

export default function SystemPromptEditor({ showToast }: SystemPromptEditorProps) {
  const [prompts, setPrompts] = useState<Record<string, SystemPrompt[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<SystemPrompt | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Preview state
  const [previewPipeline, setPreviewPipeline] = useState('photo');
  const [previewFormat, setPreviewFormat] = useState('fb_post');
  const [previewCreativity, setPreviewCreativity] = useState(3);
  const [previewSegments, setPreviewSegments] = useState<Array<{ source: string; label: string; content: string }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const fetchPrompts = useCallback(async () => {
    try {
      const r = await fetch('/api/system-prompts');
      const d = await r.json();
      setPrompts(d.prompts || {});
    } catch {
      showToast('Błąd ładowania promptów');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchPrompts(); }, [fetchPrompts]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const r = await fetch('/api/system-prompts/seed', { method: 'POST' });
      const d = await r.json();
      showToast(`Seed: ${d.inserted} dodanych, ${d.skipped} istniejących`);
      await fetchPrompts();
    } catch {
      showToast('Błąd seedowania');
    } finally {
      setSeeding(false);
    }
  };

  const handleSelect = (prompt: SystemPrompt) => {
    if (isDirty && !confirm('Masz niezapisane zmiany. Kontynuować?')) return;
    setSelectedPrompt(prompt);
    setEditContent(prompt.content);
    setIsDirty(false);
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/system-prompts/${encodeURIComponent(selectedPrompt.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      if (!r.ok) throw new Error();
      showToast('Zapisano');
      setIsDirty(false);
      // Update local state
      setPrompts(prev => {
        const updated = { ...prev };
        const cat = updated[selectedPrompt.category];
        if (cat) {
          updated[selectedPrompt.category] = cat.map(p =>
            p.id === selectedPrompt.id
              ? { ...p, content: editContent, updated_at: new Date().toISOString() }
              : p
          );
        }
        return updated;
      });
      setSelectedPrompt(prev => prev ? { ...prev, content: editContent, updated_at: new Date().toISOString() } : null);
    } catch {
      showToast('Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!selectedPrompt) return;
    setEditContent(selectedPrompt.content);
    setIsDirty(false);
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const r = await fetch('/api/system-prompts/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline: previewPipeline, format: previewFormat, creativity: previewCreativity }),
      });
      const d = await r.json();
      setPreviewSegments(d.segments || []);
      setShowPreview(true);
    } catch {
      showToast('Błąd podglądu');
    } finally {
      setPreviewLoading(false);
    }
  };

  const isEmpty = Object.keys(prompts).length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-holo-mint" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black">System Prompts</h2>
          <p className="text-xs text-hint mt-0.5">Edytuj fragmenty promptów AI bez deploy&apos;u</p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 text-xs font-semibold transition-all flex items-center gap-1.5 disabled:opacity-40"
        >
          {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {isEmpty ? 'Załaduj domyślne' : 'Doseeduj brakujące'}
        </button>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 panel-inset p-12 text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-3 text-holo-mint opacity-50" />
          <p className="text-sm font-semibold mb-1">Brak promptów w bazie</p>
          <p className="text-xs text-hint mb-4">Kliknij &quot;Załaduj domyślne&quot; aby zaimportować obecne hardcoded wartości</p>
        </div>
      ) : (
        <>
        <div className="flex gap-6 min-h-[600px]">
          {/* Left — Category tree */}
          <div className="w-72 shrink-0 space-y-1">
            {CATEGORY_ORDER.filter(cat => prompts[cat]).map(cat => {
              const meta = CATEGORY_META[cat];
              const Icon = meta?.icon || Sparkles;
              const isExpanded = expandedCategory === cat;
              const items = prompts[cat] || [];

              return (
                <div key={cat}>
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      isExpanded
                        ? 'bg-holo-mint/10 text-holo-mint'
                        : 'hover:bg-teal-deep/5 dark:hover:bg-holo-mint/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{meta?.label || cat}</span>
                    <span className="ml-auto text-[10px] opacity-50">{items.length}</span>
                  </button>

                  {isExpanded && (
                    <div className="ml-5 mt-0.5 space-y-0.5">
                      {items.sort((a, b) => a.sort_order - b.sort_order).map(p => (
                        <button
                          key={p.id}
                          onClick={() => handleSelect(p)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all truncate ${
                            selectedPrompt?.id === p.id
                              ? 'bg-holo-mint/15 text-holo-mint font-bold'
                              : 'opacity-60 hover:opacity-100 hover:bg-teal-deep/5 dark:hover:bg-holo-mint/5'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right — Editor */}
          <div className="flex-1 min-w-0">
            {selectedPrompt ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black">{selectedPrompt.label}</h3>
                    {selectedPrompt.description && (
                      <p className="text-xs text-hint mt-0.5">{selectedPrompt.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-teal-deep/10 dark:border-holo-mint/10 font-mono">
                        {selectedPrompt.id}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-teal-deep/10 dark:border-holo-mint/10">
                        {selectedPrompt.content_type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isDirty && (
                      <button
                        onClick={handleReset}
                        className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold opacity-60 hover:opacity-100 transition-all"
                      >
                        Cofnij
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!isDirty || saving}
                      className="h-8 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-30 flex items-center gap-1.5 transition-opacity"
                    >
                      {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      Zapisz
                    </button>
                  </div>
                </div>

                {/* Editor */}
                <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 overflow-hidden">
                  <textarea
                    value={editContent}
                    onChange={e => { setEditContent(e.target.value); setIsDirty(e.target.value !== selectedPrompt.content); }}
                    className="w-full min-h-[400px] p-4 text-sm font-mono leading-relaxed bg-white dark:bg-teal-mid resize-y outline-none border-none"
                    spellCheck={false}
                  />
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 text-[10px] text-hint">
                  <Clock className="h-3 w-3" />
                  Ostatnia zmiana: {new Date(selectedPrompt.updated_at).toLocaleString('pl-PL')}
                </div>

                {/* List helper */}
                {selectedPrompt.content_type === 'list' && (
                  <p className="text-[10px] text-hint italic">
                    Typ: lista — każda linia = osobny element
                  </p>
                )}
                {selectedPrompt.content_type === 'json' && (
                  <p className="text-[10px] text-hint italic">
                    Typ: JSON — upewnij się że format jest poprawny
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-hint opacity-50">
                Wybierz element z drzewa po lewej
              </div>
            )}
          </div>
        </div>

        {/* Preview section */}
        <div className="mt-8 rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 panel-inset p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Podgląd złożonego promptu
            </h3>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="text-xs opacity-50 hover:opacity-100 transition-opacity"
            >
              {showPreview ? 'Zwiń' : 'Rozwiń'}
            </button>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={previewPipeline}
              onChange={e => setPreviewPipeline(e.target.value)}
              className="text-xs rounded-lg px-3 py-1.5 border border-teal-deep/15 dark:border-holo-mint/20 bg-white dark:bg-teal-mid outline-none"
            >
              <option value="photo">Generator — Foto</option>
              <option value="graphic">Generator — Graficzny</option>
              <option value="copywriter">Copywriter</option>
            </select>
            <select
              value={previewFormat}
              onChange={e => setPreviewFormat(e.target.value)}
              className="text-xs rounded-lg px-3 py-1.5 border border-teal-deep/15 dark:border-holo-mint/20 bg-white dark:bg-teal-mid outline-none"
            >
              <option value="fb_post">Facebook / Instagram (1:1)</option>
              <option value="ln_post">LinkedIn (1.91:1)</option>
              <option value="story">Story (9:16)</option>
              <option value="banner">Banner (3:1)</option>
            </select>
            <select
              value={previewCreativity}
              onChange={e => setPreviewCreativity(parseInt(e.target.value))}
              className="text-xs rounded-lg px-3 py-1.5 border border-teal-deep/15 dark:border-holo-mint/20 bg-white dark:bg-teal-mid outline-none"
            >
              {[1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>Poziom {n}/6</option>
              ))}
            </select>
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="h-8 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-30 flex items-center gap-1.5"
            >
              {previewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
              Podgląd
            </button>
          </div>

          {showPreview && previewSegments.length > 0 && (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {previewSegments.map((seg, i) => (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-xs font-mono whitespace-pre-wrap leading-relaxed border ${
                    seg.source === 'system'
                      ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30'
                      : seg.source === 'brand'
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30'
                        : 'bg-zinc-50 dark:bg-zinc-800/30 border-zinc-200 dark:border-zinc-700/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                      seg.source === 'system' ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                      : seg.source === 'brand' ? 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                    }`}>
                      {seg.source === 'system' ? 'Edytowalne' : seg.source === 'brand' ? 'Dane marki' : 'Dynamiczne'}
                    </span>
                    <span className="text-[10px] font-semibold opacity-60">{seg.label}</span>
                  </div>
                  {seg.content}
                </div>
              ))}
              <div className="flex gap-4 text-[10px] mt-3 opacity-60">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-300 dark:bg-emerald-700" /> Edytowalne (system_prompts)</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-300 dark:bg-blue-700" /> Dane marki</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-zinc-300 dark:bg-zinc-600" /> Dynamiczne (brief, format)</span>
              </div>
            </div>
          )}
        </div>
        </>
      )}
    </div>
  );
}
