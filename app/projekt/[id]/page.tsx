'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Upload, Wand2, Image, Loader2, Download,
  Settings, Sun, Moon, BookmarkPlus, Trash2, Zap, Target, PenLine,
} from 'lucide-react';

interface Project {
  brand_analysis?: string | null;
  brand_rules?: string | null;
  id: number;
  name: string;
  client_name: string | null;
  logo_url: string | null;
  style_description: string | null;
  typography_notes: string | null;
  color_palette: string | null;
  updated_at: string | null;
}

interface Generation {
  id: number;
  brief: string;
  format: string;
  image_urls: string;
  prompt: string;
  status: string;
  created_at: string;
}

interface Asset {
  id: number;
  type: string;
  url: string;
  filename: string;
  created_at: string;
}

interface BrandSection {
  id: string;
  title: string;
  content: string;
  type: 'standard' | 'custom';
  order: number;
  icon?: string;
}

const FORMATS = [
  { value: 'fb_post', label: 'Facebook Post', size: '1080×1080' },
  { value: 'ln_post', label: 'LinkedIn Post',  size: '1200×627' },
  { value: 'story',   label: 'Story / Reel',   size: '1080×1920' },
  { value: 'banner',  label: 'Baner',           size: '1200×400' },
];

const FORMAT_ASPECT: Record<string, string> = {
  fb_post: 'aspect-square',
  ln_post: 'aspect-video',
  story:   'aspect-[9/16]',
  banner:  'aspect-[3/1]',
};

const CREATIVITY_LABELS: Record<number, { name: string; desc: string }> = {
  1: { name: 'Basic', desc: 'Czysty, zgodny ze stylem marki' },
  2: { name: 'Enhanced', desc: 'Dodatkowe elementy dekoracyjne' },
  3: { name: 'Dynamic', desc: 'Bogata kompozycja, wiele warstw' },
  4: { name: 'Bold', desc: 'Śmiały, editorial, złożony layout' },
  5: { name: 'Expressive', desc: 'Maksymalna ekspresja wizualna' },
};

function getBaseFormat(fmt: string) {
  return fmt.split(':')[0];
}
function getFormatLabel(fmt: string) {
  return FORMATS.find(f => f.value === getBaseFormat(fmt))?.label ?? fmt;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'generate' | 'settings' | 'copy'>('generate');
  const [isDark, setIsDark] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Generator state
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState('fb_post');
  const [mode, setMode] = useState<'precise' | 'fast'>('precise');
  const [creativity, setCreativity] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Edit state
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Settings state
  const [editRules, setEditRules] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [brandbookAsset, setBrandbookAsset] = useState<Asset | null>(null);
  const [brandSections, setBrandSections] = useState<BrandSection[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionContent, setEditingSectionContent] = useState('');

  // Copywriter state
  const [copyFile, setCopyFile] = useState<File | null>(null);
  const [copyBrief, setCopyBrief] = useState('');
  const [copyFormat, setCopyFormat] = useState('ogólny');
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyResults, setCopyResults] = useState<Array<{ headline: string; subtext: string; cta?: string }>>([]);

  useEffect(() => {
    params.then(p => {
      setId(p.id);
      fetch(`/api/projects/${p.id}`)
        .then(r => r.json())
        .then(d => {
          setProject(d.project);
          setAssets(d.assets);
          setGenerations(d.generations);
          setEditRules(d.project.brand_rules || '');
          setBrandbookAsset(d.assets.find((a: Asset) => a.type === 'brandbook') || null);
          setBrandSections(d.project.brand_sections || []);
          setLoading(false);
        });
    });
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gruzly-theme', next);
    setIsDark(!isDark);
  };

  const generate = async () => {
    if (!headline || !id) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, subtext, brief, format, mode, creativity }),
      });
      const data = await res.json();
      if (data.imageUrls && data.imageUrls.length > 0) {
        setSelectedGeneration(data.generation);
        setGenerations(prev => [data.generation, ...prev]);
      } else {
        alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const analyzeBrand = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (data.sections) {
        setBrandSections(data.sections);
        setProject(p => p ? { ...p, brand_analysis: data.analysis, updated_at: new Date().toISOString() } : p);
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeFromBrandbook = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'brandbook' }),
      });
      const data = await res.json();
      if (data.sections) {
        setBrandSections(data.sections);
        setProject(p => p ? { ...p, brand_analysis: data.analysis, updated_at: new Date().toISOString() } : p);
        if (data.suggestedRules) {
          showToast('Brandbook zawiera zasady — przejrzyj je w sekcji Zasady obowiązkowe');
        }
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
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
    const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
    if (res.ok) {
      const asset = await res.json();
      setBrandbookAsset(asset);
      showToast('Brandbook wgrany ✓');
    }
  };

  const deleteBrandbook = async () => {
    if (!brandbookAsset || !id) return;
    await fetch(`/api/projects/${id}/assets?assetId=${brandbookAsset.id}`, { method: 'DELETE' });
    setBrandbookAsset(null);
  };

  const handleCopyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCopyFile(file);
  };

  const generateCopy = async () => {
    if (!id || (!copyFile && !copyBrief)) return;
    setGeneratingCopy(true);
    try {
      const fd = new FormData();
      if (copyFile) fd.append('file', copyFile);
      if (copyBrief) fd.append('text', copyBrief);
      fd.append('format', copyFormat);

      const res = await fetch(`/api/projects/${id}/copy`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setCopyResults(data.results);
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

  const useCopyInGenerator = (r: { headline: string; subtext: string; cta?: string }) => {
    setHeadline(r.headline);
    setSubtext(r.subtext || '');
    setTab('generate');
  };

  const saveRules = async () => {
    if (!id) return;
    setSavingRules(true);
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandRules: editRules }),
    });
    setProject(p => p ? { ...p, brand_rules: editRules } : p);
    setSavingRules(false);
    showToast('Zasady zapisane ✓');
  };

  const saveSection = async (sectionId: string, content: string) => {
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, sectionContent: content }),
    });
    setBrandSections(prev => prev.map(s => s.id === sectionId ? { ...s, content } : s));
    setEditingSectionId(null);
    showToast('Sekcja zapisana ✓');
  };

  const deleteSection = async (sectionId: string) => {
    const updated = brandSections.filter(s => s.id !== sectionId);
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandSections: updated }),
    });
    setBrandSections(updated);
  };

  const editImage = async () => {
    if (!editingImage || !editInstruction || !id) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/projects/${id}/edit`, {
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
      setGenerations(prev => [data.generation, ...prev]);
      setEditingImage(null);
      setEditInstruction('');
    } catch (e) {
      console.error(e);
    } finally {
      setEditing(false);
    }
  };

  const addAsReference = async (url: string) => {
    if (!id) return;
    const res = await fetch(`/api/projects/${id}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'reference', filename: `generated-ref-${Date.now()}.jpg` }),
    });
    if (res.ok) {
      const asset = await res.json();
      setAssets(prev => [...prev, asset]);
      showToast('Dodano do referencji ✓');
    }
  };

  const deleteGeneration = async (genId: number) => {
    if (!confirm('Usunąć tę grafikę z historii?')) return;
    setDeletingId(genId);
    await fetch(`/api/projects/${id}/generations?generationId=${genId}`, { method: 'DELETE' });
    setGenerations(prev => prev.filter(g => g.id !== genId));
    if (selectedGeneration?.id === genId) setSelectedGeneration(null);
    setDeletingId(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-holo-mint" />
    </div>
  );
  if (!project) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center text-sm opacity-50">
      Projekt nie istnieje
    </div>
  );

  const references = assets.filter(a => a.type === 'reference');

  // PR 3d: stale analysis — references added after last save of brand_analysis
  const latestRefAt = references.reduce((max, r) => {
    const t = new Date(r.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  const analysisStale = !!(
    project.brand_analysis &&
    project.updated_at &&
    latestRefAt > new Date(project.updated_at).getTime()
  );

  const inputCls = 'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-holo-mint text-teal-deep text-sm font-bold px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="opacity-50 hover:opacity-100 transition-opacity shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="w-8 h-8 bg-offwhite dark:bg-teal-mid rounded-lg flex items-center justify-center overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 shrink-0">
          {project.logo_url
            ? <img src={project.logo_url} alt={project.name} className="w-6 h-6 object-contain" />
            : <span className="font-black text-sm holo-text">{project.name[0]}</span>
          }
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-black text-sm sm:text-base truncate">{project.name}</h1>
          {project.client_name && <p className="text-xs opacity-40 truncate">{project.client_name}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-teal-deep/10 dark:bg-teal-mid rounded-full p-1 shrink-0">
          <button
            onClick={() => setTab('generate')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'generate' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generuj</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'settings' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Brand</span>
          </button>
          <button
            onClick={() => setTab('copy')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'copy' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copywriter</span>
          </button>
        </div>

        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100 shrink-0"
          aria-label="Przełącz motyw"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── TAB: GENERUJ ─────────────────────────────────────────────────────── */}
        {tab === 'generate' && (
          <div className="space-y-8">

            {/* Main grid: Preview LEFT (sticky) | Form RIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

              {/* ── LEFT: Preview (sticky on desktop) ───────────────────────────── */}
              <div className="lg:sticky lg:top-[72px] space-y-3">
                <h2 className="font-black text-base">Podgląd</h2>

                <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                  {generating ? (
                    <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 mx-auto rounded-full holo-gradient flex items-center justify-center">
                          <Loader2 className="h-7 w-7 animate-spin text-teal-deep" />
                        </div>
                        <p className="text-sm opacity-50 font-medium">Generuję grafikę...</p>
                      </div>
                    </div>
                  ) : selectedGeneration ? (
                    <div>
                      {/* Image */}
                      {(() => {
                        const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                        return urls.map((u, i) => <img key={i} src={u} alt="Grafika" className="w-full" />);
                      })()}

                      {/* Actions */}
                      <div className="p-3 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) window.open(urls[0], '_blank');
                          }}
                          className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep hover:bg-teal-deep/10 dark:hover:bg-teal-deep/80 border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Pobierz
                        </button>
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) { setEditingImage({ url: urls[0], generationId: selectedGeneration.id }); setEditInstruction(''); }
                          }}
                          className="flex-1 h-9 rounded-full holo-gradient text-teal-deep text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Edytuj
                        </button>
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) addAsReference(urls[0]);
                          }}
                          title="Dodaj jako referencję"
                          className="w-9 h-9 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-50 hover:opacity-100 hover:border-holo-mint/50 transition-all shrink-0"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Details */}
                      <div className="px-4 pb-4 space-y-2 border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                        <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Szczegóły</p>
                        <div className="text-xs space-y-1 opacity-50">
                          <p><span className="opacity-60">Tekst:</span> {selectedGeneration.brief}</p>
                          <p><span className="opacity-60">Format:</span> {getFormatLabel(selectedGeneration.format)}</p>
                          <p><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                        </div>
                        <details className="mt-2">
                          <summary className="text-xs opacity-30 cursor-pointer hover:opacity-60 transition-opacity">Pokaż prompt systemowy</summary>
                          <p className="mt-2 text-xs opacity-40 leading-relaxed bg-offwhite dark:bg-teal-deep rounded-xl p-3 whitespace-pre-wrap">{selectedGeneration.prompt}</p>
                        </details>
                      </div>

                      {/* Edit panel */}
                      {editingImage && (
                        <div className="px-4 pb-4 space-y-3 border-t border-holo-lavender/30 pt-3">
                          <p className="text-xs font-bold text-holo-lavender">Instrukcja edycji</p>
                          <textarea
                            className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-holo-lavender/20 rounded-xl px-3 py-2 text-sm resize-none focus:border-holo-lavender outline-none transition-colors"
                            rows={3}
                            placeholder="np. Dodaj logo Plej w prawym górnym rogu, zmień kolor tła na granatowy"
                            value={editInstruction}
                            onChange={e => setEditInstruction(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingImage(null)}
                              className="h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-50 hover:opacity-100 transition-opacity"
                            >
                              Anuluj
                            </button>
                            <button
                              onClick={editImage}
                              disabled={editing || !editInstruction}
                              className="flex-1 h-9 rounded-full bg-holo-lavender text-teal-deep text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                            >
                              {editing
                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Edytuję...</>
                                : <><Wand2 className="h-4 w-4" /> Zastosuj</>
                              }
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                      <div className="text-center space-y-3">
                        <div className="text-5xl mb-3">🧱</div>
                        <p className="text-sm opacity-30">Wygeneruj grafikę lub kliknij w historię</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT: Form ──────────────────────────────────────────────────── */}
              <div className="space-y-4">
                <h2 className="font-black text-base">Nowa grafika</h2>

                {/* 1. Headline — required */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Tekst główny <span className="normal-case opacity-70 font-normal">— nagłówek grafiki *</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none font-mono`}
                    rows={2}
                    placeholder="np. 23 marca, Warszawa"
                    value={headline}
                    onChange={e => setHeadline(e.target.value)}
                  />
                </div>

                {/* 2. Subtext — optional */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Tekst dodatkowy <span className="normal-case opacity-70 font-normal">— podtytuł, CTA (opcjonalnie)</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none font-mono`}
                    rows={2}
                    placeholder="np. Zapisz się teraz →"
                    value={subtext}
                    onChange={e => setSubtext(e.target.value)}
                  />
                </div>

                {/* 3. Brief — optional, AI context only */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Brief kreatywny <span className="normal-case opacity-70 font-normal">— kontekst dla AI, nie pojawi się na grafice</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="np. Post zapowiadający event Nike — buty Air Max na tle miejskiej ulicy, dynamiczna atmosfera"
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                  />
                </div>

                {/* Format picker */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => setFormat(f.value)}
                        className={`p-3 rounded-xl text-left border text-sm transition-all ${
                          format === f.value
                            ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                            : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="font-bold text-xs">{f.label}</div>
                        <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode toggle — PR 3c */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tryb generowania</label>
                  <div className="flex gap-1 bg-teal-deep/10 dark:bg-teal-mid rounded-full p-1 w-fit">
                    <button
                      onClick={() => setMode('precise')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'precise' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
                    >
                      <Target className="h-3 w-3" /> Precyzyjny
                    </button>
                    <button
                      onClick={() => setMode('fast')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${mode === 'fast' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
                    >
                      <Zap className="h-3 w-3" /> Szybki
                    </button>
                  </div>
                  <p className="text-xs opacity-30 mt-1">
                    {mode === 'precise' ? 'Logo + referencje + analiza tekstowa' : 'Logo + tylko analiza tekstowa — szybszy, tańszy'}
                  </p>
                </div>

                {/* Creativity slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-zinc-400">Poziom kreatywności</label>
                    <span className="text-xs font-semibold text-holo-mint">{CREATIVITY_LABELS[creativity].name}</span>
                  </div>
                  <input
                    type="range" min={1} max={5} step={1}
                    value={creativity}
                    onChange={e => setCreativity(parseInt(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-teal-mid accent-holo-mint"
                  />
                  <p className="text-xs text-zinc-500 mt-1">{CREATIVITY_LABELS[creativity].desc}</p>
                </div>

                {/* Generate CTA */}
                <button
                  onClick={generate}
                  disabled={generating || !headline}
                  className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
                >
                  {generating
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                    : <><Wand2 className="h-4 w-4" /> Generuj grafikę</>
                  }
                </button>

                {/* Brand context indicator */}
                <div className={`rounded-xl p-4 text-xs space-y-1 border transition-colors ${
                  brandSections.length > 0 || project.brand_analysis
                    ? 'border-holo-mint/20 bg-holo-mint/5'
                    : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
                }`}>
                  <p className={`font-bold mb-1.5 ${brandSections.length > 0 || project.brand_analysis ? 'text-holo-mint' : 'opacity-50'}`}>
                    {brandSections.length > 0
                      ? `✅ ${brandSections.length} sekcji brandowych`
                      : project.brand_analysis
                        ? '✅ Analiza tekstowa aktywna'
                        : '⚙️ Brak analizy — przejdź do zakładki Brand'}
                  </p>
                  {brandSections.length > 0 && (
                    <p className="opacity-50">{brandSections.slice(0, 3).map(s => s.title).join(', ')}{brandSections.length > 3 ? ` +${brandSections.length - 3} więcej` : ''}</p>
                  )}
                  <p className="opacity-30">📎 {references.length} grafik referencyjnych</p>
                </div>
              </div>
            </div>

            {/* ── Historia: full-width rows ─────────────────────────────────────── */}
            {generations.length > 0 && (
              <div>
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
                <div className="space-y-1.5">
                  {generations.map(g => {
                    const urls: string[] = JSON.parse(g.image_urls || '[]');
                    const isActive = selectedGeneration?.id === g.id;
                    const gHeadline = g.brief.split(' | ')[0];
                    const gSubtext = g.brief.includes(' | ') ? g.brief.split(' | ').slice(1).join(' | ') : null;
                    const isFast = g.format.endsWith(':fast');
                    const gCreativity = parseInt(g.format.match(/:c(\d)/)?.[1] || '2');

                    return (
                      <div
                        key={g.id}
                        onClick={() => { setSelectedGeneration(g); setEditingImage(null); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                          isActive
                            ? 'border-holo-mint bg-holo-mint/5'
                            : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 bg-white dark:bg-teal-mid'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${isActive ? 'border-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}>
                          {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{gHeadline}</p>
                          {gSubtext && <p className="text-xs opacity-40 truncate mt-0.5">{gSubtext}</p>}
                        </div>

                        {/* Format + mode + creativity */}
                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                          <span className="text-xs opacity-30">{getFormatLabel(g.format)}</span>
                          {isFast && (
                            <span className="flex items-center gap-0.5 text-xs text-holo-yellow">
                              <Zap className="h-3 w-3" /> Szybki
                            </span>
                          )}
                          {gCreativity === 3 && (
                            <span className="text-xs text-holo-aqua">✦ Dynamic</span>
                          )}
                          {gCreativity === 4 && (
                            <span className="text-xs text-holo-lavender">✦✦ Bold</span>
                          )}
                          {gCreativity === 5 && (
                            <span className="text-xs text-holo-pink">✦✦✦ Expressive</span>
                          )}
                        </div>

                        {/* Date */}
                        <span className="hidden md:block text-xs opacity-25 whitespace-nowrap shrink-0">
                          {new Date(g.created_at).toLocaleDateString('pl-PL')}
                        </span>

                        {/* Action buttons */}
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setSelectedGeneration(g);
                              const urls2: string[] = JSON.parse(g.image_urls || '[]');
                              if (urls2[0]) { setEditingImage({ url: urls2[0], generationId: g.id }); setEditInstruction(''); }
                            }}
                            title="Edytuj"
                            className="w-8 h-8 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-holo-mint/50 transition-all"
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteGeneration(g.id)}
                            disabled={deletingId === g.id}
                            title="Usuń"
                            className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 disabled:opacity-20 transition-all"
                          >
                            {deletingId === g.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: BRAND SETTINGS ──────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-xl space-y-5">
            <h2 className="font-black text-base">Ustawienia marki</h2>

            {/* ANALIZA MARKI — trigger */}
            <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-bold">
                    {brandSections.length > 0 ? `✅ Analiza marki — ${brandSections.length} sekcji` : '🔍 Analiza marki'}
                  </p>
                  <p className="text-xs opacity-40 mt-0.5">Wgraj brandbook lub analizuj z grafik referencyjnych</p>
                </div>
                <button
                  onClick={analyzeBrand}
                  disabled={analyzing || references.length === 0}
                  className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  {analyzing
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</>
                    : <><Wand2 className="h-3 w-3" /> Analizuj z referencji</>
                  }
                </button>
              </div>

              {analysisStale && (
                <div className="flex items-center gap-2 text-xs text-holo-yellow bg-holo-yellow/10 px-3 py-2 rounded-xl">
                  <span>⚠️</span>
                  <span>Referencje zmieniły się od ostatniej analizy — rozważ ponowną analizę</span>
                </div>
              )}

              {/* Brandbook */}
              <div className="border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wide">Brandbook (PDF)</p>
                  <label className="cursor-pointer h-7 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100 shrink-0">
                    <Upload className="h-3 w-3" />
                    {brandbookAsset ? 'Zmień' : 'Wgraj PDF'}
                    <input type="file" accept="application/pdf" className="hidden" onChange={handleBrandbookUpload} />
                  </label>
                </div>
                {brandbookAsset ? (
                  <div className="flex items-center justify-between bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2">
                    <span className="text-xs opacity-60 truncate">📄 {brandbookAsset.filename}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={analyzeFromBrandbook}
                        disabled={analyzing}
                        className="h-7 px-3 rounded-full bg-holo-mint text-teal-deep disabled:opacity-50 text-xs font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                      >
                        {analyzing ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</> : <><Wand2 className="h-3 w-3" /> Analizuj brandbook</>}
                      </button>
                      <button onClick={deleteBrandbook} className="h-7 w-7 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 transition-all text-sm">×</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-30">Wgraj brandbook — AI wyciągnie z niego kolory, fonty i zasady automatycznie</p>
                )}
              </div>
            </div>

            {/* SEKCJE MARKI */}
            {brandSections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Sekcje marki ({brandSections.length})</p>
                {[...brandSections].sort((a, b) => a.order - b.order).map(section => (
                  <div
                    key={section.id}
                    className={`rounded-xl border p-4 ${
                      section.type === 'custom'
                        ? 'border-holo-peach/30 bg-holo-peach/5'
                        : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-base shrink-0">{section.icon || '📌'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold">{section.title}</p>
                            {section.type === 'custom' && (
                              <span className="text-xs bg-holo-peach/20 text-holo-peach px-1.5 py-0.5 rounded-full">auto</span>
                            )}
                          </div>
                          {editingSectionId !== section.id && (
                            <p className="text-xs opacity-50 mt-0.5 line-clamp-2">{section.content}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingSectionId(section.id); setEditingSectionContent(section.content); }}
                          className="h-7 px-2.5 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/10 border border-teal-deep/10 dark:border-holo-mint/10 rounded-lg text-xs font-medium transition-colors"
                        >
                          Edytuj
                        </button>
                        {section.type === 'custom' && (
                          <button
                            onClick={() => deleteSection(section.id)}
                            className="h-7 w-7 border border-red-500/20 hover:border-red-500/50 hover:text-red-400 rounded-lg text-sm flex items-center justify-center opacity-40 hover:opacity-100 transition-all"
                          >×</button>
                        )}
                      </div>
                    </div>

                    {editingSectionId === section.id && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint rounded-xl px-3 py-2 text-sm resize-none outline-none transition-colors"
                          rows={4}
                          value={editingSectionContent}
                          onChange={e => setEditingSectionContent(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingSectionId(null)}
                            className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold opacity-50 hover:opacity-100 transition-opacity"
                          >Anuluj</button>
                          <button
                            onClick={() => saveSection(section.id, editingSectionContent)}
                            className="h-8 px-4 rounded-full bg-holo-mint/20 hover:bg-holo-mint/30 text-holo-mint border border-holo-mint/30 text-xs font-semibold transition-colors"
                          >Zapisz sekcję</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ZASADY OBOWIĄZKOWE */}
            <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <div>
                <p className="text-sm font-bold text-red-400">⚠️ Zasady obowiązkowe (Do&apos;s &amp; Don&apos;ts)</p>
                <p className="text-xs opacity-50 mt-0.5">Każda zasada w osobnej linii. Gemini traktuje je jako absolutne ograniczenia.</p>
              </div>
              <textarea
                className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-red-500/20 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-400 outline-none font-mono transition-colors"
                rows={6}
                placeholder={'np.:\nZawsze białe tło\nMaxymalnie jeden blob/dekoracja na layout\nBlob tylko przy krawędzi, nigdy w centrum\nNie używaj gradientów jako tła\nNie dodawaj przypadkowych ludzi'}
                value={editRules}
                onChange={e => setEditRules(e.target.value)}
              />
              <button
                onClick={saveRules}
                disabled={savingRules || editRules === (project.brand_rules || '')}
                className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {savingRules ? 'Zapisuję...' : 'Zapisz zasady'}
              </button>
            </div>

            {/* LOGO */}
            <div className="pt-5 border-t border-teal-deep/10 dark:border-holo-mint/10">
              <h3 className="font-bold text-sm mb-0.5">Logo</h3>
              <p className="text-xs opacity-40 mb-3">Gemini nie obsługuje SVG — wgraj PNG lub JPG</p>
              <div className="flex items-center gap-3">
                {project.logo_url && !project.logo_url.endsWith('.svg') && (
                  <img src={project.logo_url} alt="logo" className="h-12 w-auto rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white p-1" />
                )}
                <label className="cursor-pointer h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold flex items-center gap-2 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100">
                  <Upload className="h-4 w-4" />
                  {project.logo_url ? 'Zmień logo' : 'Wgraj logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !id) return;
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('type', 'logo');
                    const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
                    if (res.ok) {
                      const asset = await res.json();
                      setProject(p => p ? { ...p, logo_url: asset.url } : p);
                      setAssets(prev => [...prev.filter(a => a.type !== 'logo'), asset]);
                    }
                  }} />
                </label>
              </div>
            </div>

            {/* GRAFIKI REFERENCYJNE */}
            <div className="pt-5 border-t border-teal-deep/10 dark:border-holo-mint/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm">Grafiki referencyjne</h3>
                  <p className="text-xs opacity-40">{references.length}/5 — wgraj 2–4 posty marki do analizy stylu</p>
                </div>
                {references.length < 5 && (
                  <label className="cursor-pointer h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100">
                    <Upload className="h-3 w-3" /> Dodaj
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = Array.from(e.target.files || []).slice(0, 5 - references.length);
                      for (const file of files) {
                        if (!id) continue;
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('type', 'reference');
                        const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
                        if (res.ok) {
                          const asset = await res.json();
                          setAssets(prev => [...prev, asset]);
                        }
                      }
                    }} />
                  </label>
                )}
              </div>
              {references.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {references.map(a => (
                    <div key={a.id} className="relative group">
                      <img src={a.url} alt={a.filename} className="w-full aspect-square object-cover rounded-xl border border-teal-deep/10 dark:border-holo-mint/10" />
                      <button
                        onClick={async () => {
                          if (!id) return;
                          await fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' });
                          setAssets(prev => prev.filter(x => x.id !== a.id));
                        }}
                        className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm opacity-30">Brak referencji — wgraj przykładowe posty marki.</p>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: COPYWRITER ───────────────────────────────────────────────────── */}
        {tab === 'copy' && (
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
                {generatingCopy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...</>
                  : <><PenLine className="h-4 w-4" /> Napisz copy</>
                }
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
                copyResults.map((r, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-xl p-4 space-y-2"
                  >
                    <p className="font-mono text-sm font-semibold">{r.headline}</p>
                    {r.subtext && <p className="text-sm opacity-60">{r.subtext}</p>}
                    {r.cta && <p className="text-xs text-holo-mint font-medium">{r.cta}</p>}
                    <button
                      onClick={() => useCopyInGenerator(r)}
                      className="w-full h-8 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Wand2 className="h-3 w-3" /> Użyj w generatorze
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
