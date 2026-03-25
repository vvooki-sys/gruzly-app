'use client';

import { useState, useMemo } from 'react';
import { X, Download, ExternalLink, Search, ArrowUpDown, SlidersHorizontal, Trash2, Loader2 } from 'lucide-react';
import type { Generation } from '@/lib/types';

const FORMAT_LABELS: Record<string, string> = {
  fb_post: 'Facebook Post',
  ln_post: 'LinkedIn Post',
  story: 'Story / Reel',
  banner: 'Baner',
};

type SortKey = 'newest' | 'oldest' | 'format';

export default function Gallery({
  generations,
  onClose,
  onDelete,
}: {
  generations: Generation[];
  onClose: () => void;
  onDelete?: (genId: number) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [filterFormat, setFilterFormat] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; brief: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const formats = useMemo(() => {
    const set = new Set<string>();
    generations.forEach(g => {
      const base = g.format.split(':')[0];
      if (base) set.add(base);
    });
    return Array.from(set).sort();
  }, [generations]);

  const filtered = useMemo(() => {
    let items = [...generations];

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(g => g.brief?.toLowerCase().includes(q) || g.prompt?.toLowerCase().includes(q));
    }

    if (filterFormat) {
      items = items.filter(g => g.format.split(':')[0] === filterFormat);
    }

    if (sort === 'newest') {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sort === 'oldest') {
      items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sort === 'format') {
      items.sort((a, b) => a.format.localeCompare(b.format));
    }

    return items;
  }, [generations, search, sort, filterFormat]);

  const tiles = useMemo(() => {
    return filtered.flatMap(g => {
      const urls: string[] = JSON.parse(g.image_urls || '[]');
      return urls.map((url, i) => ({ url, generation: g, index: i }));
    });
  }, [filtered]);

  const handleDelete = async (e: React.MouseEvent, genId: number) => {
    e.stopPropagation();
    if (!onDelete || !window.confirm('Usunąć tę grafikę?')) return;
    setDeletingId(genId);
    try {
      await onDelete(genId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite flex flex-col">
      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
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
            <p className="text-white/70 text-sm text-center mt-3 truncate max-w-lg mx-auto">{lightbox.brief}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 backdrop-blur-sm px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
        <h2 className="font-black text-base flex-1">Galeria <span className="font-normal opacity-40 text-sm">({tiles.length})</span></h2>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2 border-b border-teal-deep/5 dark:border-holo-mint/5 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-30" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Szukaj w promptach..."
            className="w-full bg-white dark:bg-teal-mid rounded-full pl-9 pr-4 py-2 text-sm border border-teal-deep/10 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
          />
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
          {(['newest', 'oldest', 'format'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                sort === s
                  ? 'bg-teal-deep/10 dark:bg-holo-mint/10 text-teal-deep dark:text-holo-mint font-semibold'
                  : 'opacity-40 hover:opacity-70'
              }`}
            >
              {{ newest: 'Najnowsze', oldest: 'Najstarsze', format: 'Format' }[s]}
            </button>
          ))}
        </div>

        {/* Format filter */}
        {formats.length > 1 && (
          <div className="flex items-center gap-1">
            <SlidersHorizontal className="h-3.5 w-3.5 opacity-30" />
            <button
              onClick={() => setFilterFormat(null)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                !filterFormat ? 'bg-teal-deep/10 dark:bg-holo-mint/10 font-semibold' : 'opacity-40 hover:opacity-70'
              }`}
            >
              Wszystkie
            </button>
            {formats.map(f => (
              <button
                key={f}
                onClick={() => setFilterFormat(f === filterFormat ? null : f)}
                className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                  filterFormat === f ? 'bg-teal-deep/10 dark:bg-holo-mint/10 font-semibold' : 'opacity-40 hover:opacity-70'
                }`}
              >
                {FORMAT_LABELS[f] ?? f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {tiles.length === 0 ? (
          <div className="text-center py-20 opacity-30 text-sm">
            {search ? 'Brak wyników dla tego wyszukiwania' : 'Brak grafik w historii'}
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
            {tiles.map((tile) => {
              const baseFormat = tile.generation.format.split(':')[0];
              const headline = tile.generation.brief.split(' | ')[0];
              return (
                <div
                  key={`${tile.generation.id}-${tile.index}`}
                  className="break-inside-avoid group relative rounded-xl overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid cursor-pointer hover:border-holo-mint/50 transition-all"
                  onClick={() => setLightbox({ url: tile.url, brief: headline })}
                >
                  <img
                    src={tile.url}
                    alt={headline}
                    className="w-full block"
                    loading="lazy"
                  />

                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                    <p className="text-white text-xs font-semibold truncate mb-1">{headline}</p>
                    <div className="flex items-center gap-1.5 text-white/60 text-[10px]">
                      <span>{FORMAT_LABELS[baseFormat] ?? baseFormat}</span>
                      <span>·</span>
                      <span>{new Date(tile.generation.created_at).toLocaleDateString('pl-PL')}</span>
                    </div>

                    {/* Actions */}
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      <a
                        href={tile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5 text-white" />
                      </a>
                      <button
                        onClick={e => { e.stopPropagation(); window.open(tile.url, '_blank'); }}
                        className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-white" />
                      </button>
                      {onDelete && (
                        <button
                          onClick={e => handleDelete(e, tile.generation.id)}
                          disabled={deletingId === tile.generation.id}
                          className="w-8 h-8 rounded-full bg-red-500/30 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/60 transition-colors disabled:opacity-30"
                        >
                          {deletingId === tile.generation.id
                            ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5 text-white" />
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
