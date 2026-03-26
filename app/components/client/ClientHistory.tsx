'use client';

import { useState, useMemo } from 'react';
import { Trash2, Loader2, Download, CheckCircle2, X, Copy, Check, Search, ArrowUpDown, SlidersHorizontal } from 'lucide-react';
import type { Generation, CopyGeneration } from '@/lib/types';

interface Props {
  generations: Generation[];
  onGenerationsUpdate: (g: Generation[]) => void;
  copyGenerations: CopyGeneration[];
  onCopyGenerationsUpdate: (g: CopyGeneration[]) => void;
  showToast: (msg: string) => void;
  onLoadCopy: (gen: CopyGeneration) => void;
}

const FORMAT_ASPECT: Record<string, string> = {
  fb_post: 'aspect-square',
  ln_post: 'aspect-video',
  story: 'aspect-[9/16]',
  banner: 'aspect-[3/1]',
};

const FORMAT_LABELS_SHORT: Record<string, string> = {
  fb_post: 'Facebook',
  ln_post: 'LinkedIn',
  story: 'Story',
  banner: 'Baner',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: '📘 Facebook',
  instagram: '📸 Instagram',
  linkedin: '💼 LinkedIn',
  general: '📝 Ogólny',
};

type SortKey = 'newest' | 'oldest';
type SectionView = 'all' | 'graphics' | 'posts';

export default function ClientHistory({
  generations, onGenerationsUpdate,
  copyGenerations, onCopyGenerationsUpdate,
  showToast, onLoadCopy,
}: Props) {
  const [deletingGenId, setDeletingGenId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; brief: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [section, setSection] = useState<SectionView>('all');
  const [filterFormat, setFilterFormat] = useState<string | null>(null);

  const copyText = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Available formats for filter
  const formats = useMemo(() => {
    const set = new Set<string>();
    generations.forEach(g => {
      const base = g.format.split(':')[0];
      if (base) set.add(base);
    });
    return Array.from(set).sort();
  }, [generations]);

  // Filtered generations
  const filteredGens = useMemo(() => {
    let items = [...generations];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(g => g.brief?.toLowerCase().includes(q));
    }
    if (filterFormat) {
      items = items.filter(g => g.format.split(':')[0] === filterFormat);
    }
    items.sort((a, b) => sort === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return items;
  }, [generations, search, sort, filterFormat]);

  // Filtered copy generations
  const filteredCopy = useMemo(() => {
    let items = [...copyGenerations];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(g => g.task?.toLowerCase().includes(q) || g.variants?.some(v => v.post_copy?.toLowerCase().includes(q)));
    }
    items.sort((a, b) => sort === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    return items;
  }, [copyGenerations, search, sort]);

  const deleteGeneration = async (genId: number) => {
    if (!window.confirm('Usunąć tę grafikę?')) return;
    setDeletingGenId(genId);
    try {
      await fetch(`/api/brand/generations?generationId=${genId}`, { method: 'DELETE' });
      onGenerationsUpdate(generations.filter(g => g.id !== genId));
    } catch {
      showToast('Błąd usuwania');
    } finally {
      setDeletingGenId(null);
    }
  };

  const deleteCopyGeneration = async (genId: number) => {
    if (!window.confirm('Usunąć ten post?')) return;
    try {
      await fetch(`/api/brand/copy?generationId=${genId}`, { method: 'DELETE' });
      onCopyGenerationsUpdate(copyGenerations.filter(g => g.id !== genId));
    } catch {
      showToast('Błąd usuwania');
    }
  };

  return (
    <div className="space-y-6">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.brief} className="max-w-full max-h-[85vh] object-contain rounded-xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <a
                href={lightbox.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <Download className="h-4 w-4 text-white" />
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
              >
                <X className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-hint" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj w postach i grafikach..."
            className="w-full panel-inset rounded-full pl-9 pr-4 py-2 text-sm border border-teal-deep/12 dark:border-holo-mint/20 focus:border-holo-mint outline-none transition-colors"
          />
        </div>

        {/* Section toggle */}
        <div className="flex gap-1 bg-offwhite dark:bg-teal-deep rounded-full p-0.5 border border-teal-deep/12 dark:border-holo-mint/20">
          {([
            { id: 'all' as const, label: 'Wszystko' },
            { id: 'graphics' as const, label: 'Grafiki' },
            { id: 'posts' as const, label: 'Posty' },
          ]).map(s => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                section === s.id ? 'bg-white dark:bg-teal-mid shadow-sm' : 'text-muted hover:opacity-100'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3.5 w-3.5 text-hint" />
          {(['newest', 'oldest'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                sort === s ? 'bg-teal-deep/10 dark:bg-holo-mint/10 font-semibold' : 'text-muted hover:opacity-100'
              }`}
            >
              {s === 'newest' ? 'Najnowsze' : 'Najstarsze'}
            </button>
          ))}
        </div>

        {/* Format filter */}
        {formats.length > 1 && (section === 'all' || section === 'graphics') && (
          <div className="flex items-center gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5 text-hint" />
            <button
              onClick={() => setFilterFormat(null)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                !filterFormat ? 'bg-teal-deep/10 dark:bg-holo-mint/10 font-semibold' : 'text-muted hover:opacity-100'
              }`}
            >
              Wszystkie
            </button>
            {formats.map(f => (
              <button
                key={f}
                onClick={() => setFilterFormat(f === filterFormat ? null : f)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filterFormat === f ? 'bg-teal-deep/10 dark:bg-holo-mint/10 font-semibold' : 'text-muted hover:opacity-100'
                }`}
              >
                {FORMAT_LABELS_SHORT[f] ?? f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Grafiki ── */}
      {(section === 'all' || section === 'graphics') && (
        <div>
          <h2 className="font-black text-base mb-4">Grafiki ({filteredGens.length})</h2>
          {filteredGens.length === 0 ? (
            <div className="panel rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🖼️</div>
              <p className="text-sm text-hint">{search ? 'Brak wyników' : 'Wygeneruj pierwszy post — grafiki pojawią się tutaj'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredGens.map(g => {
                const urls: string[] = JSON.parse(g.image_urls || '[]');
                const gFormat = g.format.split(':')[0];
                const gHeadline = g.brief?.split(' | ')[0] || '';

                return (
                  <div
                    key={g.id}
                    onClick={() => urls[0] && setLightbox({ url: urls[0], brief: gHeadline })}
                    className="group rounded-xl cursor-pointer border border-teal-deep/12 dark:border-holo-mint/20 overflow-hidden hover:border-holo-mint/30 transition-all"
                  >
                    <div className={`${FORMAT_ASPECT[gFormat] || 'aspect-square'} bg-offwhite dark:bg-teal-deep overflow-hidden relative`}>
                      {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => deleteGeneration(g.id)}
                          disabled={deletingGenId === g.id}
                          className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500/80 transition-colors"
                        >
                          {deletingGenId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                    <div className="px-2.5 py-2 bg-white dark:bg-teal-mid">
                      <p className="text-xs font-semibold truncate">{gHeadline || 'Grafika'}</p>
                      <p className="text-xs text-hint mt-0.5">
                        {new Date(g.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Posty ── */}
      {(section === 'all' || section === 'posts') && (
        <div>
          <h2 className="font-black text-base mb-4">Posty ({filteredCopy.length})</h2>
          {filteredCopy.length === 0 ? (
            <div className="panel rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">✍️</div>
              <p className="text-sm text-hint">{search ? 'Brak wyników' : 'Napisz pierwszy post — historia pojawi się tutaj'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCopy.map(g => {
                const hasSelected = g.selected_variant !== null && g.selected_variant !== undefined;
                const selectedCopy = hasSelected ? g.variants[g.selected_variant!] : null;
                const isCopied = copiedId === g.id;

                return (
                  <div key={g.id} className="panel rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{g.task || 'Bez opisu'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted">{PLATFORM_LABELS[g.format] || g.format}</span>
                          <span className="text-xs text-hint">·</span>
                          <span className="text-xs text-hint">{new Date(g.created_at).toLocaleDateString('pl-PL')}</span>
                          {hasSelected && (
                            <>
                              <span className="text-xs text-hint">·</span>
                              <span className="text-xs text-holo-mint font-semibold flex items-center gap-0.5">
                                <CheckCircle2 className="h-3 w-3" /> Wariant {(g.selected_variant ?? 0) + 1}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteCopyGeneration(g.id)}
                        className="w-7 h-7 rounded-full flex items-center justify-center border border-teal-deep/12 dark:border-holo-mint/20 text-hint hover:opacity-100 hover:border-red-400/50 hover:text-red-400 transition-all shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {selectedCopy && (
                      <div className="bg-offwhite dark:bg-teal-deep rounded-lg px-3 py-2.5 space-y-2">
                        <p className="text-sm leading-relaxed whitespace-pre-line">{selectedCopy.post_copy}</p>
                        <button
                          onClick={() => copyText(selectedCopy.post_copy, g.id)}
                          className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                            isCopied
                              ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                              : 'border-teal-deep/12 dark:border-holo-mint/20 text-muted hover:opacity-100'
                          }`}
                        >
                          {isCopied ? <><Check className="h-3 w-3" /> Skopiowano</> : <><Copy className="h-3 w-3" /> Kopiuj treść</>}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() => onLoadCopy(g)}
                      className="w-full h-8 rounded-full border border-holo-mint/30 hover:border-holo-mint bg-holo-mint/10 hover:bg-holo-mint/20 text-holo-mint text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      Użyj ponownie
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
