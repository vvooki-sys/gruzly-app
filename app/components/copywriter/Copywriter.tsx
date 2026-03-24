'use client';

import { useState } from 'react';
import { Upload, Loader2, PenLine, Layers, Wand2 } from 'lucide-react';
import { Project } from '@/lib/types';

interface CopywriterProps {
  project: Project;
  showToast: (msg: string) => void;
  onUseCopy?: (data: { headline: string; subtext: string; brief: string }) => void;
}

const inputCls =
  'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

export default function Copywriter({ project, showToast, onUseCopy }: CopywriterProps) {
  // Copywriter state
  const [copyFile, setCopyFile] = useState<File | null>(null);
  const [copyBrief, setCopyBrief] = useState('');
  const [copyFormat, setCopyFormat] = useState('ogólny');
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyResults, setCopyResults] = useState<
    Array<{ headline: string; subtext: string; cta?: string; post_copy?: string; rationale?: string }>
  >([]);
  const [copyConcept, setCopyConcept] = useState('');
  const [copyCreativeBrief, setCopyCreativeBrief] = useState('');

  const id = project.id;

  // ── Handlers ──────────────────────────────────────────────

  const handleCopyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCopyFile(file);
  };

  const generateCopy = async () => {
    if (!id || (!copyFile && !copyBrief)) return;
    setGeneratingCopy(true);
    setCopyConcept('');
    setCopyCreativeBrief('');
    try {
      const fd = new FormData();
      if (copyFile) fd.append('file', copyFile);
      if (copyBrief) fd.append('text', copyBrief);
      fd.append('format', copyFormat);

      const res = await fetch(`/api/brand/copy`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setCopyResults(data.results);
        setCopyConcept(data.concept || '');
        setCopyCreativeBrief(data.creative_brief || '');
      } else {
        alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      console.error(e);
      alert('Błąd połączenia');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const useCopyInGenerator = (
    r: { headline: string; subtext: string; cta?: string },
    creativeBrief?: string,
  ) => {
    onUseCopy?.({
      headline: r.headline,
      subtext: r.subtext || '',
      brief: creativeBrief || '',
    });
  };

  // ── JSX ───────────────────────────────────────────────────

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Input */}
      <div className="space-y-4">
        <h2 className="font-black text-base">Brief do copy</h2>

        {/* Upload file */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
            Wgraj brief (DOCX, TXT, PDF)
          </label>
          <label className="cursor-pointer w-full h-20 border-2 border-dashed border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition-colors">
            <Upload className="h-5 w-5 opacity-50" />
            <span className="opacity-50">Przeciągnij plik lub kliknij</span>
            <input
              type="file"
              accept=".docx,.txt,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleCopyFileUpload}
            />
          </label>
          {copyFile && <p className="text-xs opacity-50 mt-1">📄 {copyFile.name}</p>}
        </div>

        {/* OR: textarea */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
            lub wklej brief tekstem
          </label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={6}
            placeholder="Wklej treść briefu, opisu kampanii lub notatki..."
            value={copyBrief}
            onChange={e => setCopyBrief(e.target.value)}
          />
        </div>

        {/* Format */}
        <div>
          <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
          <div className="grid grid-cols-2 gap-2">
            {['facebook', 'linkedin', 'instagram', 'ogólny'].map(f => (
              <button
                key={f}
                onClick={() => setCopyFormat(f)}
                className={`p-2 rounded-xl text-sm border transition-all ${
                  copyFormat === f
                    ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                    : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generateCopy}
          disabled={generatingCopy || (!copyFile && !copyBrief)}
          className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
        >
          {generatingCopy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...
            </>
          ) : (
            <>
              <PenLine className="h-4 w-4" /> Napisz copy
            </>
          )}
        </button>
      </div>

      {/* Right column: Results */}
      <div className="space-y-3">
        <h2 className="font-black text-base">Wyniki ({copyResults.length})</h2>
        {copyResults.length === 0 ? (
          <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">✍️</div>
            <p className="text-sm opacity-30">Wygenerowane warianty pojawią się tutaj</p>
          </div>
        ) : (
          <>
            {/* Concept */}
            {copyConcept && (
              <div className="bg-holo-mint/5 border border-holo-mint/20 rounded-xl p-4 space-y-1">
                <p className="text-xs font-bold uppercase tracking-wide text-holo-mint opacity-70">Koncept</p>
                <p className="text-sm opacity-80">{copyConcept}</p>
              </div>
            )}

            {/* Creative brief */}
            {copyCreativeBrief && (
              <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-xl p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide opacity-40">Brief dla grafika</p>
                <p className="text-sm opacity-70">{copyCreativeBrief}</p>
                <button
                  onClick={() => onUseCopy?.({ headline: '', subtext: '', brief: copyCreativeBrief })}
                  className="h-7 px-3 rounded-full bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/10 dark:border-holo-mint/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Layers className="h-3 w-3" /> Użyj jako creative brief
                </button>
              </div>
            )}

            {/* Variants */}
            {copyResults.map((r, i) => (
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

                {/* Graphic text */}
                <div className="space-y-1 border-l-2 border-holo-mint/30 pl-3">
                  <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Na grafikę</p>
                  <p className="font-mono text-sm font-semibold">{r.headline}</p>
                  {r.subtext && <p className="text-sm opacity-60">{r.subtext}</p>}
                  {r.cta && <p className="text-xs text-holo-mint font-medium mt-1">{r.cta}</p>}
                </div>

                {/* Post copy */}
                {r.post_copy && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Treść posta</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(r.post_copy || '')}
                        className="text-xs opacity-40 hover:opacity-80 transition-opacity"
                      >
                        Kopiuj
                      </button>
                    </div>
                    <p className="text-sm opacity-70 leading-relaxed whitespace-pre-line">{r.post_copy}</p>
                  </div>
                )}

                <button
                  onClick={() => useCopyInGenerator(r, copyCreativeBrief)}
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
