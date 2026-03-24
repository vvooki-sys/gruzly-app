'use client';

import { useState, useEffect } from 'react';
import { Loader2, Wand2, Upload, Check } from 'lucide-react';
import type { Project, BrandAsset, BrandScanData } from '@/lib/types';
import type { BrandBaseSection } from './BrandBasePreview';

// ── Scan progress ─────────────────────────────────────────────────────────

const SCAN_STEPS = [
  { id: 'fetch',  icon: '🌐', label: 'Pobieranie strony...',          duration: 2500 },
  { id: 'colors', icon: '🎨', label: 'Analiza kolorów i fontów...',   duration: 2000 },
  { id: 'gemini', icon: '🤖', label: 'Gemini analizuje brand DNA...', duration: 6000 },
  { id: 'assets', icon: '🖼', label: 'Pobieranie logo i assetów...', duration: 2000 },
  { id: 'save',   icon: '💾', label: 'Zapisywanie Brand DNA...',      duration: 1500 },
];
const SCAN_TOTAL = SCAN_STEPS.reduce((a, s) => a + s.duration, 0);

function ScanProgress({ isScanning }: { isScanning: boolean }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isScanning) {
      if (progress > 0) {
        setProgress(100);
        setDone(true);
        const t = setTimeout(() => { setDone(false); setProgress(0); setStepIdx(0); }, 1500);
        return () => clearTimeout(t);
      }
      return;
    }
    setDone(false);
    let idx = 0;
    let canceled = false;
    let intervalId: ReturnType<typeof setInterval>;
    let timeoutId: ReturnType<typeof setTimeout>;
    const offsetMs = (i: number) => SCAN_STEPS.slice(0, i).reduce((a, s) => a + s.duration, 0);

    const run = () => {
      if (canceled || idx >= SCAN_STEPS.length) return;
      setStepIdx(idx);
      let elapsed = 0;
      intervalId = setInterval(() => {
        elapsed += 100;
        setProgress(Math.min(((offsetMs(idx) + elapsed) / SCAN_TOTAL) * 100, 99));
      }, 100);
      timeoutId = setTimeout(() => { clearInterval(intervalId); idx++; run(); }, SCAN_STEPS[idx].duration);
    };
    run();
    return () => { canceled = true; clearInterval(intervalId); clearTimeout(timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  if (!isScanning && !done) return null;
  if (done) return (
    <div className="flex items-center gap-2 text-holo-mint text-sm font-bold mt-3">
      <Check className="h-4 w-4" /> Brand DNA gotowe!
    </div>
  );

  const s = SCAN_STEPS[stepIdx];
  return (
    <div className="mt-3 space-y-2">
      <div className="relative h-1.5 rounded-full overflow-hidden bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #00a589, #4DC8E8)' }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-base animate-pulse">{s?.icon}</span>
        <span className="text-xs text-white/70 flex-1">{s?.label}</span>
        <span className="text-xs text-white/40">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────

interface StepBrandScanProps {
  project: Project;
  assets: BrandAsset[];
  onProjectUpdate: (p: Project) => void;
  onAssetsUpdate: (a: BrandAsset[]) => void;
  onSectionsUpdate: (sections: BrandBaseSection[], source?: string) => void;
  showToast: (msg: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function brandDnaToSections(bsd: BrandScanData): BrandBaseSection[] {
  return [
    {
      id: 'kolory', title: 'Kolory marki', icon: '🎨', source: 'scan' as const,
      content: [
        bsd.primaryColor   && `Kolor główny: ${bsd.primaryColor}`,
        bsd.secondaryColor && `Kolor dodatkowy: ${bsd.secondaryColor}`,
        bsd.accentColor    && `Kolor akcentowy: ${bsd.accentColor}`,
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'typografia', title: 'Typografia', icon: '🔤', source: 'scan' as const,
      content: [
        bsd.headingFont && `Font nagłówków: ${bsd.headingFont}`,
        bsd.bodyFont    && `Font treści: ${bsd.bodyFont}`,
        bsd.fonts?.length && `Dostępne fonty: ${bsd.fonts.join(', ')}`,
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'styl_wizualny', title: 'Styl wizualny', icon: '✨', source: 'scan' as const,
      content: [
        bsd.visualStyle && `Styl: ${bsd.visualStyle}`,
        bsd.industry    && `Branża: ${bsd.industry}`,
      ].filter(Boolean).join('\n'),
    },
    {
      id: 'styl_foto', title: 'Styl fotografii', icon: '📷', source: 'scan' as const,
      content: bsd.photoStyle || '',
    },
    {
      id: 'grupa_docelowa', title: 'Grupa docelowa', icon: '🎯', source: 'scan' as const,
      content: bsd.targetAudience || '',
    },
    {
      id: 'branza', title: 'Branża', icon: '🏢', source: 'scan' as const,
      content: bsd.industry || '',
    },
    {
      id: 'cta', title: 'Styl CTA', icon: '🚀', source: 'scan' as const,
      content: bsd.ctaExamples?.length ? `Przykłady: ${bsd.ctaExamples.join(' | ')}` : '',
    },
  ].filter(s => s.content.trim().length > 0);
}

// ── Component ───────────────────────────────────────────────────────────

export default function StepBrandScan({
  project,
  assets,
  onProjectUpdate,
  onAssetsUpdate,
  onSectionsUpdate,
  showToast,
}: StepBrandScanProps) {
  const [url, setUrl] = useState((project.scanned_url as string) || '');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanResult, setScanResult] = useState<BrandScanData | null>(null);

  const [analyzingBrandbook, setAnalyzingBrandbook] = useState(false);
  const brandbookAsset = assets.find(a => a.type === 'brandbook');

  const scanBrand = async () => {
    if (!url) return;
    setScanning(true);
    setScanError('');
    try {
      const res = await fetch('/api/brand/brand-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.success && data.brandDna) {
        setScanResult(data.brandDna);
        if (data.assets) onAssetsUpdate(data.assets);
        // Convert scan data to brand base sections
        const newSections = brandDnaToSections(data.brandDna);
        onSectionsUpdate(newSections, 'scan');
        showToast('Brand DNA zeskanowany ✓');
        // Auto-generate industry rules in background
        fetch('/api/brand/industry-rules', { method: 'POST' }).catch(() => {});
      } else if (data.fallback) {
        setScanError('Strona blokuje skanowanie — spróbuj wgrać brandbook');
      } else {
        setScanError(data.error || 'Błąd skanowania');
      }
    } catch {
      setScanError('Błąd połączenia');
    } finally {
      setScanning(false);
    }
  };

  const handleBrandbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'brandbook');
    const res = await fetch('/api/brand/assets', { method: 'POST', body: fd });
    if (res.ok) {
      const asset = await res.json();
      onAssetsUpdate([...assets.filter(a => a.type !== 'brandbook'), asset]);
      showToast('Brandbook wgrany ✓');
    }
  };

  const analyzeBrandbook = async () => {
    if (!brandbookAsset) return;
    setAnalyzingBrandbook(true);
    try {
      const res = await fetch('/api/brand/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'brandbook' }),
      });
      const data = await res.json();
      if (data.sections) {
        // Brandbook sections have higher priority — they'll override scan sections
        const bbSections: BrandBaseSection[] = (data.sections as Array<Record<string, unknown>>).map(s => ({
          id: String(s.id || ''),
          title: String(s.title || ''),
          icon: String(s.icon || '📖'),
          content: String(s.content || ''),
          source: 'brandbook' as const,
        }));
        onSectionsUpdate(bbSections, 'brandbook');
        onProjectUpdate({ ...project, brand_analysis: data.analysis, updated_at: new Date().toISOString() });
        showToast('Brandbook przeanalizowany ✓');
      } else {
        showToast('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setAnalyzingBrandbook(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">🌐 Brand Scan</h2>
        <p className="text-sm opacity-50 mt-1">
          Podaj adres www i/lub wgraj brandbook PDF. AI wyciągnie kolory, fonty, styl i więcej.
          Jeśli podasz oba — brandbook ma priorytet przy rozbieżnościach.
        </p>
      </div>

      {/* URL scan */}
      <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
        <p className="text-xs font-bold opacity-50 uppercase tracking-wide">Strona internetowa</p>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && scanBrand()}
            className="flex-1 bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
            disabled={scanning}
          />
          <button
            onClick={scanBrand}
            disabled={scanning || !url}
            className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            {scanning
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Skanuję...</>
              : <><Wand2 className="h-3 w-3" /> Skanuj markę</>
            }
          </button>
        </div>
        <ScanProgress isScanning={scanning} />
        {scanError && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-xl">
            <span>⚠️</span>
            <span>{scanError}</span>
          </div>
        )}
        {scanResult && (
          <div className="flex items-center gap-2 text-xs text-holo-mint">
            <Check className="h-3 w-3" />
            Znaleziono: {[
              scanResult.primaryColor && 'kolory',
              scanResult.headingFont && 'fonty',
              scanResult.visualStyle && 'styl wizualny',
              scanResult.toneOfVoice && 'ton głosu',
            ].filter(Boolean).join(', ')}
          </div>
        )}
      </div>

      {/* Brandbook */}
      <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold opacity-50 uppercase tracking-wide">Brandbook (PDF)</p>
          <label className="cursor-pointer h-7 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100">
            <Upload className="h-3 w-3" />
            {brandbookAsset ? 'Zmień' : 'Wgraj PDF'}
            <input type="file" accept="application/pdf" className="hidden" onChange={handleBrandbookUpload} />
          </label>
        </div>
        {brandbookAsset ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2">
              <span className="text-xs opacity-60">📄 {brandbookAsset.filename}</span>
            </div>
            <button
              onClick={analyzeBrandbook}
              disabled={analyzingBrandbook}
              className="w-full h-8 rounded-full bg-holo-mint/20 hover:bg-holo-mint/30 text-holo-mint border border-holo-mint/30 text-xs font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {analyzingBrandbook
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</>
                : <><Wand2 className="h-3 w-3" /> Analizuj brandbook</>
              }
            </button>
          </div>
        ) : (
          <p className="text-xs opacity-30">Opcjonalnie — AI wyciągnie z brandbooka kolory, fonty i zasady</p>
        )}
      </div>

      {!url && !brandbookAsset && !scanResult && (
        <div className="bg-holo-mint/5 border border-holo-mint/10 rounded-xl px-3 py-2">
          <p className="text-xs opacity-50">
            💡 Podaj przynajmniej jedno źródło (www lub brandbook) żeby AI mogło zbudować bazę marki.
            Możesz też pominąć ten krok i uzupełnić ręcznie.
          </p>
        </div>
      )}
    </div>
  );
}
