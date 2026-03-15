'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, Wand2, Image, Loader2, Download, Settings, Sun, Moon } from 'lucide-react';

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
}

const FORMATS = [
  { value: 'fb_post', label: 'Facebook Post', size: '1080×1080' },
  { value: 'ln_post', label: 'LinkedIn Post', size: '1200×627' },
  { value: 'story', label: 'Story / Reel', size: '1080×1920' },
  { value: 'banner', label: 'Baner', size: '1200×400' },
];

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'generate' | 'settings'>('generate');
  const [isDark, setIsDark] = useState(true);

  // Generator state
  const [brief, setBrief] = useState('');
  const [tekst, setTekst] = useState('');
  const [format, setFormat] = useState('fb_post');
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<{ imageUrls: string[], prompt: string } | null>(null);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);

  // Edit state
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Settings state
  const [editStyle, setEditStyle] = useState('');
  const [editRules, setEditRules] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [editTypo, setEditTypo] = useState('');
  const [editColors, setEditColors] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    params.then(p => {
      setId(p.id);
      fetch(`/api/projects/${p.id}`)
        .then(r => r.json())
        .then(d => {
          setProject(d.project);
          setAssets(d.assets);
          setGenerations(d.generations);
          setEditStyle(d.project.style_description || '');
          setEditTypo(d.project.typography_notes || '');
          setEditColors(d.project.color_palette || '');
          setEditRules(d.project.brand_rules || '');
          setLoading(false);
        });
    });
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
  }, []);

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gruzly-theme', next);
    setIsDark(!isDark);
  };

  const generate = async () => {
    if ((!brief && !tekst) || !id) return;
    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: tekst, brief, format }),
      });
      const data = await res.json();
      if (data.imageUrls && data.imageUrls.length > 0) {
        setLastResult({ imageUrls: data.imageUrls, prompt: data.prompt });
        setSelectedGeneration(data.generation);
        setGenerations(prev => [data.generation, ...prev]);
      } else {
        console.error('Generation error:', data.error || 'No images returned');
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
      if (data.analysis) {
        setProject(p => p ? { ...p, brand_analysis: data.analysis } : p);
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      alert('Błąd połączenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveSettings = async () => {
    if (!id) return;
    setSavingSettings(true);
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        styleDescription: editStyle,
        typographyNotes: editTypo,
        colorPalette: editColors,
        brandRules: editRules,
      }),
    });
    if (project) setProject({ ...project, style_description: editStyle, typography_notes: editTypo, color_palette: editColors, brand_rules: editRules });
    setSavingSettings(false);
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

      setLastResult({ imageUrls: [data.imageUrl], prompt: data.prompt });
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

  /* Shared input classes */
  const inputCls = "w-full bg-offwhite dark:bg-teal-deep rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors";

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors">

      {/* Header */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="opacity-50 hover:opacity-100 transition-opacity shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {/* Logo */}
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
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              tab === 'generate'
                ? 'holo-gradient text-teal-deep shadow-sm'
                : 'opacity-50 hover:opacity-80'
            }`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generuj</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              tab === 'settings'
                ? 'holo-gradient text-teal-deep shadow-sm'
                : 'opacity-50 hover:opacity-80'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Brand</span>
          </button>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100 shrink-0"
          aria-label="Przełącz motyw"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ───── TAB: GENERUJ ───── */}
        {tab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 lg:gap-8">

            {/* Lewa: formularz */}
            <div className="space-y-4">
              <h2 className="font-black text-base">Nowa grafika</h2>

              {/* Tekst na grafice */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Tekst na grafice
                  <span className="ml-1.5 normal-case opacity-70 font-normal">— dokładna treść, która pojawi się na obrazie</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none font-mono`}
                  rows={3}
                  placeholder={"np.:\n23 marca, Warszawa\nZapisz się teraz →"}
                  value={tekst}
                  onChange={e => setTekst(e.target.value)}
                />
              </div>

              {/* Brief */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Brief
                  <span className="ml-1.5 normal-case opacity-70 font-normal">— kontekst wizualny, czego NIE ma być dosłownie na grafice</span>
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={3}
                  placeholder="np. Post zapowiadający event Nike — buty Air Max na tle miejskiej ulicy, dynamiczna atmosfera"
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                />
              </div>

              {/* Format */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={`p-3 rounded-xl text-left border text-sm transition-all ${
                        format === f.value
                          ? 'border-holo-mint bg-holo-mint/10 text-holo-mint dark:text-holo-mint'
                          : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                      }`}
                    >
                      <div className="font-bold text-xs">{f.label}</div>
                      <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={generate}
                disabled={generating || (!brief && !tekst)}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                  : <><Wand2 className="h-4 w-4" /> Generuj grafikę</>
                }
              </button>

              {/* Brand context indicator */}
              <div className={`rounded-xl p-4 text-xs space-y-1 border transition-colors ${
                project.brand_analysis
                  ? 'border-holo-mint/20 bg-holo-mint/5'
                  : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
              }`}>
                <p className={`font-bold mb-1.5 ${project.brand_analysis ? 'text-holo-mint' : 'opacity-50'}`}>
                  {project.brand_analysis ? '✅ Kontekst marki — auto-analiza aktywna' : '⚙️ Kontekst marki — pola ręczne'}
                </p>
                {project.brand_analysis
                  ? <p className="opacity-50">Gemini zna styl marki z analizy referencji. <span className="text-holo-mint opacity-100">Jakość generacji lepsza.</span></p>
                  : <>
                      {project.style_description && <p className="opacity-50">🎨 {project.style_description}</p>}
                      {project.color_palette && <p className="opacity-50">🎨 {project.color_palette}</p>}
                      {project.typography_notes && <p className="opacity-50">🔤 {project.typography_notes}</p>}
                    </>
                }
                <p className="opacity-30">📎 {references.length} grafik referencyjnych</p>
              </div>
            </div>

            {/* Prawa: podgląd + historia */}
            <div className="space-y-6">

              {/* Podgląd grafiki */}
              <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                {generating ? (
                  <div className="aspect-square flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-full holo-gradient flex items-center justify-center">
                        <Loader2 className="h-7 w-7 animate-spin text-teal-deep" />
                      </div>
                      <p className="text-sm opacity-50 font-medium">Generuję grafikę...</p>
                    </div>
                  </div>
                ) : selectedGeneration ? (
                  <div>
                    {/* Obraz */}
                    {(() => {
                      const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                      return urls.map((u, i) => (
                        <img key={i} src={u} alt="Grafika" className="w-full" />
                      ));
                    })()}

                    {/* Akcje */}
                    <div className="p-4 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) window.open(urls[0], '_blank');
                        }}
                        className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep hover:bg-teal-deep/10 dark:hover:bg-teal-deep/80 border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Download className="h-4 w-4" /> Pobierz
                      </button>
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) { setEditingImage({ url: urls[0], generationId: selectedGeneration.id }); setEditInstruction(''); }
                        }}
                        className="flex-1 h-9 rounded-full holo-gradient text-teal-deep text-sm font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                      >
                        <Wand2 className="h-4 w-4" /> Edytuj
                      </button>
                    </div>

                    {/* Szczegóły */}
                    <div className="px-4 pb-4 space-y-2 border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                      <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Szczegóły</p>
                      <div className="text-xs space-y-1 opacity-50">
                        <p><span className="opacity-60">Brief:</span> {selectedGeneration.brief}</p>
                        <p><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                        <p><span className="opacity-60">Format:</span> {FORMATS.find(f => f.value === selectedGeneration.format)?.label}</p>
                      </div>
                      <details className="mt-2">
                        <summary className="text-xs opacity-30 cursor-pointer hover:opacity-60 transition-opacity">Pokaż prompt systemowy</summary>
                        <p className="mt-2 text-xs opacity-40 leading-relaxed bg-offwhite dark:bg-teal-deep rounded-xl p-3 whitespace-pre-wrap">{selectedGeneration.prompt}</p>
                      </details>
                    </div>

                    {/* Panel edycji */}
                    {editingImage && (
                      <div className="px-4 pb-4 space-y-3 border-t border-holo-lavender/30 pt-3">
                        <p className="text-xs font-bold text-holo-lavender">Instrukcja edycji</p>
                        <textarea
                          className="w-full bg-offwhite dark:bg-teal-deep border border-holo-lavender/20 rounded-xl px-3 py-2 text-sm resize-none focus:border-holo-lavender outline-none transition-colors"
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
                            {editing ? <><Loader2 className="h-4 w-4 animate-spin" /> Edytuję...</> : <><Wand2 className="h-4 w-4" /> Zastosuj</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-square flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-2xl border-2 border-dashed border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center">
                        <Image className="h-7 w-7 opacity-20" />
                      </div>
                      <p className="text-sm opacity-30">Wygeneruj grafikę lub kliknij w historię</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Historia miniatur */}
              {generations.length > 0 && (
                <div>
                  <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {generations.map(g => {
                      const urls: string[] = JSON.parse(g.image_urls || '[]');
                      const isActive = selectedGeneration?.id === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setSelectedGeneration(g); setEditingImage(null); }}
                          className={`flex-none w-20 h-20 rounded-xl overflow-hidden border-2 transition-all ${
                            isActive
                              ? 'border-holo-mint shadow-[0_0_12px_rgba(179,245,220,0.3)]'
                              : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/40'
                          }`}
                        >
                          {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ───── TAB: BRAND SETTINGS ───── */}
        {tab === 'settings' && (
          <div className="max-w-xl space-y-5">
            <h2 className="font-black text-base">Ustawienia marki</h2>

            {/* AUTO-ANALIZA */}
            <div className={`rounded-2xl p-4 border transition-colors ${
              project.brand_analysis
                ? 'border-holo-mint/25 bg-holo-mint/5'
                : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
            }`}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className={`text-sm font-bold ${project.brand_analysis ? 'text-holo-mint' : ''}`}>
                    {project.brand_analysis ? '✅ Analiza marki gotowa' : '🔍 Analiza marki'}
                  </p>
                  <p className="text-xs opacity-50 mt-0.5">
                    {project.brand_analysis
                      ? 'Gemini przeanalizował Twoje referencje — ta analiza zastępuje ręczne pola poniżej'
                      : 'Wgraj grafiki referencyjne i kliknij Analizuj — Gemini zbada styl marki automatycznie'}
                  </p>
                </div>
                <button
                  onClick={analyzeBrand}
                  disabled={analyzing || references.length === 0}
                  className="h-9 px-4 rounded-full bg-holo-mint text-teal-deep text-xs font-bold disabled:opacity-40 flex items-center gap-1.5 hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                >
                  {analyzing
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizuję...</>
                    : <><Wand2 className="h-3.5 w-3.5" /> {project.brand_analysis ? 'Ponów analizę' : 'Analizuj markę'}</>
                  }
                </button>
              </div>
              {project.brand_analysis && (
                <details className="mt-2">
                  <summary className="text-xs text-holo-mint cursor-pointer hover:opacity-80 transition-opacity">Pokaż wynik analizy</summary>
                  <p className="mt-2 text-xs opacity-50 leading-relaxed whitespace-pre-wrap bg-offwhite dark:bg-teal-deep rounded-xl p-3">{project.brand_analysis}</p>
                </details>
              )}
            </div>

            {/* ZASADY OBOWIĄZKOWE — zachowuje czerwień per brief */}
            <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <div>
                <p className="text-sm font-bold text-red-400">⚠️ Zasady obowiązkowe (Do&apos;s &amp; Don&apos;ts)</p>
                <p className="text-xs opacity-50 mt-0.5">Każda zasada w osobnej linii. Gemini traktuje je jako absolutne ograniczenia — naruszenie jest niedopuszczalne.</p>
              </div>
              <textarea
                className="w-full bg-offwhite dark:bg-teal-deep border border-red-500/20 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-400 outline-none font-mono transition-colors"
                rows={6}
                placeholder={`np.:\nZawsze białe tło\nMaxymalnie jeden blob/dekoracja na layout\nBlob tylko przy krawędzi, nigdy w centrum\nNie używaj gradientów jako tła\nNie dodawaj przypadkowych ludzi`}
                value={editRules}
                onChange={e => setEditRules(e.target.value)}
              />
            </div>

            <p className="text-xs opacity-40 font-medium">Pola poniżej są używane gdy brak automatycznej analizy.</p>

            <div>
              <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Opis stylu graficznego</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="np. Minimalistyczny, sportowy. Duże białe przestrzenie, dynamiczne ujęcia, realistyczne zdjęcia produktów."
                value={editStyle}
                onChange={e => setEditStyle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Typografia</label>
              <input
                type="text"
                className={inputCls}
                placeholder="np. Nagłówki: Helvetica Neue Bold, treść: Light. Tekst zawsze biały lub czarny."
                value={editTypo}
                onChange={e => setEditTypo(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Paleta kolorów</label>
              <input
                type="text"
                className={inputCls}
                placeholder="np. Czarny #000000, biały #FFFFFF, akcent pomarańczowy #FF6B35"
                value={editColors}
                onChange={e => setEditColors(e.target.value)}
              />
            </div>

            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="h-10 px-6 rounded-full holo-gradient text-teal-deep text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {savingSettings ? 'Zapisuję...' : 'Zapisz ustawienia'}
            </button>

            {/* Upload logo */}
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

            {/* Upload referencji */}
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
      </div>
    </div>
  );
}
