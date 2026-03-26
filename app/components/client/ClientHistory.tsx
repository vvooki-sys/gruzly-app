'use client';

import { useState } from 'react';
import { Trash2, Loader2, Download, CheckCircle2, X } from 'lucide-react';
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

const FORMAT_LABELS: Record<string, string> = {
  facebook: '📘 Facebook',
  instagram: '📸 Instagram',
  linkedin: '💼 LinkedIn',
  general: '📝 Ogólny',
};

const VISUAL_LABELS: Record<string, string> = {
  graphic: 'Grafika',
  photo: 'Zdjęcie',
  photo_text: 'Zdj + tekst',
};

export default function ClientHistory({
  generations, onGenerationsUpdate,
  copyGenerations, onCopyGenerationsUpdate,
  showToast, onLoadCopy,
}: Props) {
  const [deletingGenId, setDeletingGenId] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; brief: string } | null>(null);

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
    <div className="space-y-8">
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

      {/* ── Grafiki ── */}
      <div>
        <h2 className="font-black text-base mb-4">Grafiki ({generations.length})</h2>
        {generations.length === 0 ? (
          <div className="panel rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">🖼️</div>
            <p className="text-sm text-hint">Wygeneruj pierwszy post — grafiki pojawią się tutaj</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {generations.map(g => {
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

      {/* ── Posty ── */}
      <div>
        <h2 className="font-black text-base mb-4">Posty ({copyGenerations.length})</h2>
        {copyGenerations.length === 0 ? (
          <div className="panel rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">✍️</div>
            <p className="text-sm text-hint">Napisz pierwszy post — historia pojawi się tutaj</p>
          </div>
        ) : (
          <div className="space-y-2">
            {copyGenerations.map(g => {
              const hasSelected = g.selected_variant !== null && g.selected_variant !== undefined;
              return (
                <div
                  key={g.id}
                  onClick={() => onLoadCopy(g)}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer border border-teal-deep/12 dark:border-holo-mint/20 hover:border-holo-mint/30 bg-white dark:bg-teal-mid transition-all panel-inset"
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
                    onClick={e => { e.stopPropagation(); deleteCopyGeneration(g.id); }}
                    className="w-7 h-7 rounded-full flex items-center justify-center border border-teal-deep/12 dark:border-holo-mint/20 text-hint hover:opacity-100 hover:border-red-400/50 hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
