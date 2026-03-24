'use client';

import { useState, useEffect } from 'react';
import { Loader2, Wand2, Check, Upload, ExternalLink } from 'lucide-react';
import type { Project, BrandAsset, BrandSection, BrandScanData } from '@/lib/types';

// ── Scan progress steps ──────────────────────────────────────────────────────

const SCAN_STEPS = [
  { id: 'fetch',  icon: '\u{1F310}', label: 'Pobieranie strony...',          duration: 2500 },
  { id: 'colors', icon: '\u{1F3A8}', label: 'Analiza kolor\u00F3w i font\u00F3w...',   duration: 2500 },
  { id: 'gemini', icon: '\u{1F916}', label: 'Gemini analizuje brand DNA...', duration: 5000 },
  { id: 'logo',   icon: '\u{1F5BC}', label: 'Pobieranie logo...',            duration: 2000 },
  { id: 'social', icon: '\u{1F4A1}', label: 'Skanowanie social media...',    duration: 5000, dynamic: true },
  { id: 'save',   icon: '\u{1F4BE}', label: 'Zapisywanie Brand DNA...',      duration: 1000 },
];
const SCAN_TOTAL = SCAN_STEPS.reduce((a, s) => a + s.duration, 0);

// ── ScanProgress helper ──────────────────────────────────────────────────────

function ScanProgress({ isScanning, socialLinks }: {
  isScanning: boolean;
  socialLinks?: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; youtube?: string } | null;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isScanning) {
      if (progress > 0) {
        setProgress(100);
        setDone(true);
        const t = setTimeout(() => { setDone(false); setProgress(0); setStep(0); }, 1500);
        return () => clearTimeout(t);
      }
      return;
    }
    setDone(false);
    let stepIdx = 0;
    let canceled = false;
    let intervalId: ReturnType<typeof setInterval>;
    let timeoutId: ReturnType<typeof setTimeout>;
    const offsetMs = (idx: number) => SCAN_STEPS.slice(0, idx).reduce((a, s) => a + s.duration, 0);

    const runStep = () => {
      if (canceled || stepIdx >= SCAN_STEPS.length) return;
      setStep(stepIdx);
      const stepDur = SCAN_STEPS[stepIdx].duration;
      let elapsed = 0;
      intervalId = setInterval(() => {
        elapsed += 100;
        const total = offsetMs(stepIdx) + elapsed;
        setProgress(Math.min((total / SCAN_TOTAL) * 100, 99));
      }, 100);
      timeoutId = setTimeout(() => {
        clearInterval(intervalId);
        stepIdx++;
        runStep();
      }, stepDur);
    };
    runStep();
    return () => { canceled = true; clearInterval(intervalId); clearTimeout(timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning]);

  const stepData = SCAN_STEPS[step];
  let label: string = stepData?.label ?? '';
  if (stepData?.id === 'social' && socialLinks) {
    const platforms = [
      socialLinks.facebook && 'Facebook',
      socialLinks.instagram && 'Instagram',
      socialLinks.linkedin && 'LinkedIn',
      socialLinks.tiktok && 'TikTok',
      socialLinks.youtube && 'YouTube',
    ].filter(Boolean);
    if (platforms.length > 0) label = `Skanowanie: ${platforms.join(', ')}...`;
  }

  if (!isScanning && !done) return null;

  if (done) return (
    <div className="flex items-center gap-2 text-holo-mint text-sm font-bold mt-3">
      <Check className="h-4 w-4" /> Brand DNA gotowe!
    </div>
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="relative h-1.5 rounded-full overflow-hidden bg-white/10">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #00a589, #4DC8E8)' }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-base animate-pulse">{stepData?.icon}</span>
        <span className="text-xs text-white/70 flex-1">{label}</span>
        <span className="text-xs text-white/40">{Math.round(progress)}%</span>
      </div>
      <div className="flex gap-1">
        {SCAN_STEPS.map((s, i) => (
          <div key={s.id} className={`flex-1 h-0.5 rounded-full transition-all duration-500 ${
            i < step ? 'opacity-100' : i === step ? 'opacity-70 animate-pulse' : 'opacity-20'
          }`} style={{ background: i <= step ? '#00a589' : 'rgba(255,255,255,0.3)' }} title={s.label} />
        ))}
      </div>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface BrandScannerProps {
  project: Project;
  assets: BrandAsset[];
  onProjectUpdate: (p: Project) => void;
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
  refreshData: () => Promise<void>;
}

// ── BrandScanner component ───────────────────────────────────────────────────

export default function BrandScanner({
  project,
  assets,
  onProjectUpdate,
  onAssetsUpdate,
  showToast,
  refreshData,
}: BrandScannerProps) {
  const id = project.id;

  // Brand scan state
  const [brandScanUrl, setBrandScanUrl] = useState('');
  const [brandScanLoading, setBrandScanLoading] = useState(false);
  const [brandScanStatus, setBrandScanStatus] = useState('');
  const [brandScanResult, setBrandScanResult] = useState<BrandScanData | null>(null);
  const [brandScanError, setBrandScanError] = useState('');
  const [applyingBrandScan, setApplyingBrandScan] = useState(false);
  const [generatingBrandBook, setGeneratingBrandBook] = useState(false);
  const [brandBookUrl, setBrandBookUrl] = useState('');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);

  // Derived
  const references = assets.filter(a => a.type === 'reference');
  const brandbookAsset = assets.find(a => a.type === 'brandbook') || null;
  const brandSections: BrandSection[] = ((project as unknown as Record<string, unknown>).brand_sections as BrandSection[]) ?? [];

  const latestRefAt = references.reduce((max, r) => {
    const t = new Date(r.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  const analysisStale = !!(
    project.brand_analysis &&
    project.updated_at &&
    latestRefAt > new Date(project.updated_at).getTime()
  );

  // ── Handlers ─────────────────────────────────────────────────────────────

  const scanBrand = async () => {
    if (!id || !brandScanUrl) return;
    setBrandScanLoading(true);
    setBrandScanError('');
    setBrandScanStatus('Skanuj\u0119 stron\u0119...');
    try {
      setBrandScanStatus('Analizuj\u0119 brand...');
      const res = await fetch(`/api/brand/brand-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: brandScanUrl, projectId: id }),
      });
      const data = await res.json();
      if (data.success && data.brandDna) {
        setBrandScanResult(data.brandDna);
        if (data.assets) {
          onAssetsUpdate(data.assets);
        }
        setBrandScanStatus('Gotowe!');
        showToast('Brand DNA zeskanowany \u2713');
        await refreshData();
      } else if (data.fallback) {
        setBrandScanError('Strona blokuje skanowanie \u2014 u\u017Cyj r\u0119cznego uploadu');
        setBrandScanStatus('');
      } else {
        setBrandScanError(data.error || 'B\u0142\u0105d skanowania');
        setBrandScanStatus('');
      }
    } catch {
      setBrandScanError('B\u0142\u0105d po\u0142\u0105czenia');
      setBrandScanStatus('');
    } finally {
      setBrandScanLoading(false);
    }
  };

  const applyBrandScan = async () => {
    if (!id || !brandScanResult) return;
    setApplyingBrandScan(true);
    try {
      // 1. Tone of voice (separate project field)
      if (brandScanResult.toneOfVoice) {
        await fetch(`/api/brand/sections/apply-scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id, toneOfVoice: brandScanResult.toneOfVoice }),
        });
      }

      // 2. Build brand sections from scan data
      const bsd = brandScanResult;
      const candidateSections = [
        {
          title: 'Kolory marki', icon: '\u{1F3A8}', order: 10,
          content: [
            bsd.primaryColor   && `Primary color: ${bsd.primaryColor}`,
            bsd.secondaryColor && `Secondary color: ${bsd.secondaryColor}`,
            bsd.accentColor    && `Accent color: ${bsd.accentColor}`,
          ].filter(Boolean).join('\n'),
        },
        {
          title: 'Typografia', icon: '\u{1F524}', order: 20,
          content: [
            bsd.headingFont && `Heading font: ${bsd.headingFont}`,
            bsd.bodyFont    && `Body font: ${bsd.bodyFont}`,
            bsd.fonts?.length && `Available fonts: ${bsd.fonts.join(', ')}`,
          ].filter(Boolean).join('\n'),
        },
        {
          title: 'Ton g\u0142osu i komunikacja', icon: '\u{1F4AC}', order: 30,
          content: [
            bsd.toneOfVoice          && `Tone of voice: ${bsd.toneOfVoice}`,
            bsd.brandKeywords?.length && `Brand keywords: ${bsd.brandKeywords.join(', ')}`,
            bsd.socialMediaAnalysis?.languageStyle && `Language style: ${bsd.socialMediaAnalysis.languageStyle}`,
            bsd.socialMediaAnalysis?.tone          && `Social media tone: ${bsd.socialMediaAnalysis.tone}`,
          ].filter(Boolean).join('\n'),
        },
        {
          title: 'Styl wizualny', icon: '\u2728', order: 40,
          content: [
            bsd.visualStyle && `Visual style: ${bsd.visualStyle}`,
            bsd.photoStyle  && `Photo style: ${bsd.photoStyle}`,
            bsd.industry    && `Industry: ${bsd.industry}`,
          ].filter(Boolean).join('\n'),
        },
        {
          title: 'Warto\u015Bci marki', icon: '\u{1F48E}', order: 50,
          content: bsd.brandValues?.length ? `Brand values: ${bsd.brandValues.join(', ')}` : '',
        },
        {
          title: 'Grupa docelowa', icon: '\u{1F3AF}', order: 60,
          content: bsd.targetAudience ? `Target audience: ${bsd.targetAudience}` : '',
        },
        {
          title: 'Call to Action', icon: '\u{1F680}', order: 70,
          content: bsd.ctaExamples?.length ? `CTA examples: ${bsd.ctaExamples.join(' | ')}` : '',
        },
      ].filter(s => s.content.trim().length > 0);

      const res = await fetch(`/api/brand/sections/apply-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, sections: candidateSections }),
      });
      const { appliedCount } = await res.json();

      // 3. Refresh local state
      const updated = await fetch(`/api/brand?projectId=${id}`).then(r => r.json());
      if (updated.project) {
        onProjectUpdate(updated.project);
      }

      showToast(`Brand DNA zastosowane \u2014 ${appliedCount} sekcji \u2713`);
    } catch {
      showToast('B\u0142\u0105d zapisu');
    } finally {
      setApplyingBrandScan(false);
    }
  };

  const generateBrandBook = async () => {
    if (!id) return;
    setGeneratingBrandBook(true);
    try {
      const res = await fetch(`/api/brand/brandbook/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json();
      if (data.url) {
        setBrandBookUrl(data.url);
        window.open(data.url, '_blank');
        showToast('Brand Book wygenerowany \u2713');
      } else {
        showToast('B\u0142\u0105d generowania Brand Book');
      }
    } catch {
      showToast('B\u0142\u0105d po\u0142\u0105czenia');
    } finally {
      setGeneratingBrandBook(false);
    }
  };

  const analyzeBrand = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/brand/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      });
      const data = await res.json();
      if (data.sections) {
        onProjectUpdate({ ...project, brand_analysis: data.analysis, updated_at: new Date().toISOString() });
      } else {
        alert('B\u0142\u0105d analizy: ' + (data.error || 'Spr\u00F3buj ponownie'));
      }
    } catch {
      alert('B\u0142\u0105d po\u0142\u0105czenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeFromBrandbook = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/brand/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, source: 'brandbook' }),
      });
      const data = await res.json();
      if (data.sections) {
        onProjectUpdate({ ...project, brand_analysis: data.analysis, updated_at: new Date().toISOString() });
        if (data.suggestedRules) {
          showToast('Brandbook zawiera zasady \u2014 przejrzyj je w sekcji Zasady obowi\u0105zkowe');
        }
      } else {
        alert('B\u0142\u0105d analizy: ' + (data.error || 'Spr\u00F3buj ponownie'));
      }
    } catch {
      alert('B\u0142\u0105d po\u0142\u0105czenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBrandbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'brandbook');
    fd.append('projectId', String(id));
    const res = await fetch(`/api/brand/assets`, { method: 'POST', body: fd });
    if (res.ok) {
      const asset = await res.json();
      onAssetsUpdate([...assets.filter(a => a.type !== 'brandbook'), asset]);
      showToast('Brandbook wgrany \u2713');
    }
  };

  const deleteBrandbook = async () => {
    if (!brandbookAsset || !id) return;
    await fetch(`/api/brand/assets?assetId=${brandbookAsset.id}&projectId=${id}`, { method: 'DELETE' });
    onAssetsUpdate(assets.filter(a => a.type !== 'brandbook'));
  };

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-5">
      <h2 className="font-black text-base">Kontekst marki</h2>

      {/* ANALIZA MARKI -- trigger */}
      <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-bold">
              {brandSections.length > 0 ? `\u2705 Analiza marki \u2014 ${brandSections.length} sekcji` : '\u{1F50D} Analiza marki'}
            </p>
            <p className="text-xs opacity-40 mt-0.5">Wgraj brandbook lub analizuj z grafik referencyjnych</p>
          </div>
          <button
            onClick={analyzeBrand}
            disabled={analyzing || references.length === 0}
            className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            {analyzing
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuj\u0119...</>
              : <><Wand2 className="h-3 w-3" /> Analizuj z referencji</>
            }
          </button>
        </div>

        {analysisStale && (
          <div className="flex items-center gap-2 text-xs text-holo-yellow bg-holo-yellow/10 px-3 py-2 rounded-xl">
            <span>\u26A0\uFE0F</span>
            <span>Referencje zmieni\u0142y si\u0119 od ostatniej analizy \u2014 rozwa\u017C ponown\u0105 analiz\u0119</span>
          </div>
        )}

        {/* Brandbook */}
        <div className="border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-semibold opacity-50 uppercase tracking-wide">Brandbook (PDF)</p>
            <label className="cursor-pointer h-7 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100 shrink-0">
              <Upload className="h-3 w-3" />
              {brandbookAsset ? 'Zmie\u0144' : 'Wgraj PDF'}
              <input type="file" accept="application/pdf" className="hidden" onChange={handleBrandbookUpload} />
            </label>
          </div>
          {brandbookAsset ? (
            <div className="flex items-center justify-between bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2">
              <span className="text-xs opacity-60 truncate">{'\u{1F4C4}'} {brandbookAsset.filename}</span>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={analyzeFromBrandbook}
                  disabled={analyzing}
                  className="h-7 px-3 rounded-full bg-holo-mint text-teal-deep disabled:opacity-50 text-xs font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                >
                  {analyzing ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuj\u0119...</> : <><Wand2 className="h-3 w-3" /> Analizuj brandbook</>}
                </button>
                <button onClick={deleteBrandbook} className="h-7 w-7 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 transition-all text-sm">\u00D7</button>
              </div>
            </div>
          ) : (
            <p className="text-xs opacity-30">Wgraj brandbook \u2014 AI wyci\u0105gnie z niego kolory, fonty i zasady automatycznie</p>
          )}
        </div>
      </div>

      {/* BRAND SCAN */}
      <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
        <div>
          <p className="text-sm font-bold">{'\u{1F310}'} Brand Scan</p>
          <p className="text-xs opacity-40 mt-0.5">Podaj URL strony \u2014 AI automatycznie wyci\u0105gnie Brand DNA</p>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://example.com"
            value={brandScanUrl}
            onChange={e => setBrandScanUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && scanBrand()}
            className="flex-1 bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint rounded-xl px-3 py-2 text-sm outline-none transition-colors"
            disabled={brandScanLoading}
          />
          <button
            onClick={scanBrand}
            disabled={brandScanLoading || !brandScanUrl}
            className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            {brandScanLoading
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Skanuj\u0119...</>
              : <><Wand2 className="h-3 w-3" /> Skanuj mark\u0119</>
            }
          </button>
        </div>

        <ScanProgress isScanning={brandScanLoading} socialLinks={brandScanResult?.socialLinks} />

        {brandScanError && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-xl">
            <span>\u26A0\uFE0F</span>
            <span>{brandScanError}{brandScanError.includes('blokuje') && ' \u2014 spr\u00F3buj r\u0119cznego uploadu brandbooka.'}</span>
          </div>
        )}

        {brandScanResult && (
          <div className="border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3 space-y-3">
            {/* Colors */}
            {(brandScanResult.primaryColor || brandScanResult.secondaryColor || brandScanResult.accentColor) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">Kolory</p>
                <div className="flex gap-2 flex-wrap">
                  {brandScanResult.primaryColor && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: brandScanResult.primaryColor }} />
                      <span className="text-xs font-mono opacity-60">{brandScanResult.primaryColor}</span>
                      <span className="text-xs opacity-30">g\u0142\u00F3wny</span>
                    </div>
                  )}
                  {brandScanResult.secondaryColor && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: brandScanResult.secondaryColor }} />
                      <span className="text-xs font-mono opacity-60">{brandScanResult.secondaryColor}</span>
                      <span className="text-xs opacity-30">dodatkowy</span>
                    </div>
                  )}
                  {brandScanResult.accentColor && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: brandScanResult.accentColor }} />
                      <span className="text-xs font-mono opacity-60">{brandScanResult.accentColor}</span>
                      <span className="text-xs opacity-30">akcent</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Style & Tone */}
            <div className="flex gap-3 flex-wrap">
              {brandScanResult.visualStyle && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs opacity-40">Styl:</span>
                  <span className="text-xs font-semibold bg-holo-mint/10 text-holo-mint px-2 py-0.5 rounded-full">{brandScanResult.visualStyle}</span>
                </div>
              )}
              {brandScanResult.toneOfVoice && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs opacity-40">Ton:</span>
                  <span className="text-xs font-semibold bg-holo-peach/10 text-holo-peach px-2 py-0.5 rounded-full">{brandScanResult.toneOfVoice}</span>
                </div>
              )}
              {brandScanResult.industry && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs opacity-40">Bran\u017Ca:</span>
                  <span className="text-xs font-semibold opacity-70">{brandScanResult.industry}</span>
                </div>
              )}
            </div>

            {/* Fonts */}
            {(brandScanResult.headingFont || brandScanResult.bodyFont || brandScanResult.fonts?.length > 0) && (
              <div className="space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">Fonty</p>
                <div className="flex gap-3 flex-wrap text-xs">
                  {brandScanResult.headingFont && (
                    <span><span className="opacity-40">Nag\u0142\u00F3wki:</span> <span className="font-semibold">{brandScanResult.headingFont}</span></span>
                  )}
                  {brandScanResult.bodyFont && brandScanResult.bodyFont !== brandScanResult.headingFont && (
                    <span><span className="opacity-40">Tre\u015B\u0107:</span> <span className="font-semibold">{brandScanResult.bodyFont}</span></span>
                  )}
                </div>
              </div>
            )}

            {/* Keywords */}
            {brandScanResult.brandKeywords?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">S\u0142owa kluczowe</p>
                <div className="flex gap-1.5 flex-wrap">
                  {brandScanResult.brandKeywords.map((kw: string, i: number) => (
                    <span key={i} className="text-xs bg-teal-deep/5 dark:bg-teal-deep border border-teal-deep/10 dark:border-holo-mint/10 px-2 py-0.5 rounded-full">{kw}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Brand values */}
            {brandScanResult.brandValues?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">Warto\u015Bci marki</p>
                <div className="flex gap-1.5 flex-wrap">
                  {brandScanResult.brandValues.map((v: string, i: number) => (
                    <span key={i} className="text-xs bg-holo-yellow/10 text-holo-yellow border border-holo-yellow/20 px-2 py-0.5 rounded-full">{v}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Target audience + photo style */}
            {(brandScanResult.targetAudience || brandScanResult.photoStyle) && (
              <div className="grid grid-cols-2 gap-2">
                {brandScanResult.targetAudience && (
                  <div className="bg-teal-deep/5 dark:bg-teal-deep rounded-xl px-3 py-2">
                    <p className="text-xs opacity-40 mb-0.5">Grupa docelowa</p>
                    <p className="text-xs font-semibold">{brandScanResult.targetAudience}</p>
                  </div>
                )}
                {brandScanResult.photoStyle && (
                  <div className="bg-teal-deep/5 dark:bg-teal-deep rounded-xl px-3 py-2">
                    <p className="text-xs opacity-40 mb-0.5">Styl zdj\u0119\u0107</p>
                    <p className="text-xs font-semibold">{brandScanResult.photoStyle}</p>
                  </div>
                )}
              </div>
            )}

            {/* CTA examples */}
            {brandScanResult.ctaExamples?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">Przyk\u0142ady CTA</p>
                <div className="flex gap-1.5 flex-wrap">
                  {brandScanResult.ctaExamples.map((cta: string, i: number) => (
                    <span key={i} className="text-xs bg-teal-deep/5 dark:bg-teal-deep border border-teal-deep/10 dark:border-holo-mint/10 px-2 py-0.5 rounded-full italic opacity-70">&quot;{cta}&quot;</span>
                  ))}
                </div>
              </div>
            )}

            {/* Social media analysis */}
            {brandScanResult.socialMediaAnalysis && (
              <div className="bg-teal-deep/5 dark:bg-teal-deep rounded-xl px-3 py-2 space-y-1">
                <p className="text-xs font-semibold opacity-40 uppercase tracking-wide">Social media</p>
                {brandScanResult.socialMediaAnalysis.tone && (
                  <p className="text-xs"><span className="opacity-40">Ton: </span><span className="font-semibold">{brandScanResult.socialMediaAnalysis.tone}</span></p>
                )}
                {brandScanResult.socialMediaAnalysis.languageStyle && (
                  <p className="text-xs opacity-60">{brandScanResult.socialMediaAnalysis.languageStyle}</p>
                )}
                {brandScanResult.socialMediaAnalysis.commonTopics && brandScanResult.socialMediaAnalysis.commonTopics.length > 0 && (
                  <p className="text-xs"><span className="opacity-40">Tematy: </span>{brandScanResult.socialMediaAnalysis.commonTopics.join(', ')}</p>
                )}
              </div>
            )}

            <button
              onClick={applyBrandScan}
              disabled={applyingBrandScan}
              className="w-full h-9 rounded-full bg-holo-mint/20 hover:bg-holo-mint/30 text-holo-mint border border-holo-mint/30 text-xs font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {applyingBrandScan
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Zastosowuj\u0119...</>
                : <><Check className="h-3 w-3" /> Zastosuj do projektu</>
              }
            </button>
          </div>
        )}
      </div>

      {/* BRAND BOOK */}
      {(project.brand_scan_data || brandScanResult) && (
        <div className="rounded-2xl border border-holo-lavender/20 bg-holo-lavender/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-bold">{'\u{1F4D6}'} Brand Book</p>
            <p className="text-xs opacity-40 mt-0.5">Wygeneruj pi\u0119kn\u0105 stron\u0119 z Brand Guidelines gotow\u0105 do udost\u0119pnienia</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generateBrandBook}
              disabled={generatingBrandBook}
              className="flex-1 h-9 rounded-full bg-holo-lavender/20 hover:bg-holo-lavender/30 text-holo-lavender border border-holo-lavender/30 text-xs font-bold transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              {generatingBrandBook
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Generuj\u0119...</>
                : <><Wand2 className="h-3 w-3" /> Generuj Brand Book</>
              }
            </button>
            {brandBookUrl && (
              <a
                href={brandBookUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-9 px-4 rounded-full border border-holo-lavender/30 text-holo-lavender text-xs font-bold hover:bg-holo-lavender/10 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <ExternalLink className="h-3 w-3" /> Otw\u00F3rz
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
