'use client';

import { useState } from 'react';
import { Upload, Loader2, PenLine, Wand2, Camera, Image, Check, Copy, Type } from 'lucide-react';
import type { Project } from '@/lib/types';

interface CopywriterProps {
  project: Project;
  showToast: (msg: string) => void;
  onUseCopy?: (data: { headline: string; subtext: string; brief: string }) => void;
}

interface CopyVariant {
  post_copy: string;
  visual_brief: string;
  headline: string;
  subtext: string;
  cta?: string;
  rationale?: string;
}

const inputCls =
  'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

const FORMATS = [
  { id: 'facebook', label: 'Facebook', icon: '📘' },
  { id: 'instagram', label: 'Instagram', icon: '📸' },
  { id: 'linkedin', label: 'LinkedIn', icon: '💼' },
  { id: 'general', label: 'Ogólny', icon: '📝' },
];

export default function Copywriter({ project, showToast, onUseCopy }: CopywriterProps) {
  const [task, setTask] = useState('');
  const [briefFile, setBriefFile] = useState<File | null>(null);
  const [format, setFormat] = useState('facebook');
  const [visualType, setVisualType] = useState<'graphic' | 'photo' | 'photo_text'>('graphic');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<CopyVariant[]>([]);
  const [concept, setConcept] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const generate = async () => {
    if (!task && !briefFile) return;
    setGenerating(true);
    setConcept('');
    setResults([]);
    try {
      const fd = new FormData();
      if (briefFile) fd.append('file', briefFile);
      if (task) fd.append('text', task);
      fd.append('format', format);
      fd.append('visualType', visualType);

      const res = await fetch('/api/brand/copy', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setConcept(data.concept || '');
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ── Left: Input ── */}
      <div className="space-y-4">
        <h2 className="font-black text-base">Copywriter</h2>

        {/* Task — main input */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
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

        {/* Brief file — optional */}
        <div>
          <label className="cursor-pointer w-full h-12 border border-dashed border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 rounded-xl flex items-center justify-center gap-2 text-xs opacity-50 hover:opacity-80 transition-all">
            <Upload className="h-3.5 w-3.5" />
            {briefFile ? `📄 ${briefFile.name}` : 'Opcjonalnie: wgraj brief (PDF, DOCX, TXT)'}
            <input
              type="file"
              accept=".docx,.txt,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) setBriefFile(f); }}
            />
          </label>
        </div>

        {/* Format */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Platforma</label>
          <div className="flex gap-2">
            {FORMATS.map(f => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                  format === f.id
                    ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                    : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Visual type */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Typ wizuala do posta</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'graphic' as const, icon: Image, label: 'Grafika', desc: 'Ilustracja, typografia, tekst na grafice' },
              { id: 'photo' as const, icon: Camera, label: 'Zdjęcie', desc: 'Fotografia bez tekstu' },
              { id: 'photo_text' as const, icon: Type, label: 'Zdjęcie + tekst', desc: 'Foto z nałożonym tekstem' },
            ]).map(vt => {
              const active = visualType === vt.id;
              return (
                <button
                  key={vt.id}
                  onClick={() => setVisualType(vt.id)}
                  className={`py-3 rounded-xl border-2 transition-all flex flex-col items-center gap-1.5 ${
                    active
                      ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                      : 'border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/40'
                  }`}
                >
                  <vt.icon className={`h-5 w-5 ${active ? '' : 'opacity-50'}`} />
                  <span className={`text-xs font-bold ${active ? '' : 'opacity-60'}`}>{vt.label}</span>
                  <span className={`text-[10px] text-center leading-tight px-1 ${active ? 'opacity-60' : 'opacity-30'}`}>{vt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Generate */}
        <button
          onClick={generate}
          disabled={generating || (!task && !briefFile)}
          className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
        >
          {generating
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...</>
            : <><PenLine className="h-4 w-4" /> Napisz copy</>
          }
        </button>
      </div>

      {/* ── Right: Results ── */}
      <div className="space-y-3">
        <h2 className="font-black text-base">
          {results.length > 0 ? `${results.length} warianty` : 'Wyniki'}
        </h2>

        {results.length === 0 ? (
          <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">✍️</div>
            <p className="text-sm opacity-30">Wpisz zadanie i wygeneruj copy</p>
          </div>
        ) : (
          <>
            {/* Concept */}
            {concept && (
              <div className="bg-holo-mint/5 border border-holo-mint/20 rounded-xl px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-holo-mint opacity-70 mb-1">Koncept</p>
                <p className="text-sm opacity-80">{concept}</p>
              </div>
            )}

            {/* Variants */}
            {results.map((r, i) => (
              <div
                key={i}
                className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold bg-teal-deep/10 dark:bg-teal-deep px-2 py-0.5 rounded-full">
                    Wariant {i + 1}
                  </span>
                  {r.rationale && <span className="text-xs opacity-30 italic">{r.rationale}</span>}
                </div>

                {/* Post copy — PRIMARY */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold opacity-40 uppercase tracking-wide">Treść posta</p>
                    <button
                      onClick={() => copyText(r.post_copy, i)}
                      className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                        copiedIdx === i
                          ? 'border-holo-mint text-holo-mint bg-holo-mint/10'
                          : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-90 hover:border-holo-mint/40'
                      }`}
                    >
                      {copiedIdx === i ? <><Check className="h-3 w-3" /> Skopiowano</> : <><Copy className="h-3 w-3" /> Kopiuj</>}
                    </button>
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{r.post_copy}</p>
                </div>

                {/* Visual brief */}
                <div className="space-y-1.5 border-l-2 border-holo-lavender/30 pl-3">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-wide">
                    {visualType === 'graphic' ? '🎨 Brief dla grafika' : '📷 Brief dla fotografa'}
                  </p>
                  <p className="text-xs opacity-60 leading-relaxed">{r.visual_brief}</p>
                </div>

                {/* Headline/subtext — only for graphic and photo_text */}
                {visualType !== 'photo' && (r.headline || r.subtext) && (
                  <div className="space-y-1 bg-offwhite dark:bg-teal-deep rounded-lg px-3 py-2">
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-wide">
                      {visualType === 'photo_text' ? 'Tekst na zdjęcie' : 'Tekst na grafikę'}
                    </p>
                    {r.headline && <p className="text-sm font-bold">{r.headline}</p>}
                    {r.subtext && <p className="text-xs opacity-60">{r.subtext}</p>}
                    {r.cta && <p className="text-xs text-holo-mint font-medium">{r.cta}</p>}
                  </div>
                )}

                {/* Use in generator */}
                <button
                  onClick={() => onUseCopy?.({ headline: r.headline, subtext: r.subtext, brief: r.visual_brief })}
                  className="w-full h-8 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Wand2 className="h-3 w-3" /> Użyj w generatorze
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
