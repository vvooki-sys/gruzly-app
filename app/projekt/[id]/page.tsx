'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, Wand2, Image, Loader2, Download, RefreshCw, Trash2, Settings } from 'lucide-react';

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

  // Generator state
  const [brief, setBrief] = useState('');
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
  }, []);

  const generate = async () => {
    if (!brief || !id) return;
    setGenerating(true);
    setLastResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, format }),
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

      // Show edited image as new result
      setLastResult({ imageUrls: [data.imageUrl], prompt: data.prompt });
      setSelectedGeneration(data.generation);
      setGenerations(prev => [data.generation, ...prev]);

      // Reset edit panel
      setEditingImage(null);
      setEditInstruction('');
    } catch (e) {
      console.error(e);
    } finally {
      setEditing(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Ładowanie...</div>;
  if (!project) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">Projekt nie istnieje</div>;

  const references = assets.filter(a => a.type === 'reference');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="w-8 h-8 bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
          {project.logo_url
            ? <img src={project.logo_url} alt={project.name} className="w-6 h-6 object-contain" />
            : <span className="text-zinc-400 font-bold text-sm">{project.name[0]}</span>
          }
        </div>
        <div>
          <h1 className="font-semibold">{project.name}</h1>
          {project.client_name && <p className="text-xs text-zinc-500">{project.client_name}</p>}
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setTab('generate')}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'generate' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            <Wand2 className="h-4 w-4 inline mr-1.5" />Generuj
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === 'settings' ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            <Settings className="h-4 w-4 inline mr-1.5" />Brand
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {tab === 'generate' && (
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
            {/* Lewa: generator */}
            <div className="space-y-4">
              <h2 className="font-semibold text-zinc-300">Nowa grafika</h2>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Brief — co ma być na grafice</label>
                <textarea
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm resize-none focus:border-orange-500 outline-none"
                  rows={4}
                  placeholder="np. Post zapowiadający event dla Nike — buty Air Max na tle miejskiej ulicy, tekst '23 marca, Warszawa'"
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className={`p-3 rounded-lg text-left border text-sm ${format === f.value ? 'border-orange-500 bg-orange-500/10 text-orange-400' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'}`}
                    >
                      <div className="font-medium">{f.label}</div>
                      <div className="text-xs opacity-60">{f.size}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={generate}
                disabled={generating || !brief}
                className="w-full h-12 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl font-medium flex items-center justify-center gap-2"
              >
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</> : <><Wand2 className="h-4 w-4" /> Generuj grafiki</>}
              </button>

              {/* Brand context preview */}
              <div className={`rounded-xl p-4 text-xs space-y-1 border ${project.brand_analysis ? 'border-teal-500/30 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
                <p className={`font-medium mb-2 ${project.brand_analysis ? 'text-teal-400' : 'text-zinc-400'}`}>
                  {project.brand_analysis ? '✅ Kontekst marki — auto-analiza aktywna' : '⚙️ Kontekst marki — pola ręczne'}
                </p>
                {project.brand_analysis
                  ? <p className="text-zinc-400">Gemini zna styl marki z analizy referencji. <span className="text-teal-500">Jakość generacji lepsza.</span></p>
                  : <>
                      {project.style_description && <p className="text-zinc-500">🎨 {project.style_description}</p>}
                      {project.color_palette && <p className="text-zinc-500">🎨 {project.color_palette}</p>}
                      {project.typography_notes && <p className="text-zinc-500">🔤 {project.typography_notes}</p>}
                    </>
                }
                <p className="text-zinc-600">📎 {references.length} grafik referencyjnych</p>
              </div>
            </div>

            {/* Prawa: podgląd + historia */}
            <div className="space-y-6">

              {/* DUŻY KAFELEK — aktywna grafika lub placeholder */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                {generating ? (
                  <div className="aspect-square flex items-center justify-center">
                    <div className="text-center space-y-3">
                      <Loader2 className="h-10 w-10 animate-spin text-orange-500 mx-auto" />
                      <p className="text-zinc-400 text-sm">Generuję grafikę...</p>
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
                    <div className="p-4 flex items-center gap-2 border-t border-zinc-800">
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) window.open(urls[0], '_blank');
                        }}
                        className="flex-1 h-9 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm flex items-center justify-center gap-1.5"
                      >
                        <Download className="h-4 w-4" /> Pobierz
                      </button>
                      <button
                        onClick={() => {
                          const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                          if (urls[0]) { setEditingImage({ url: urls[0], generationId: selectedGeneration.id }); setEditInstruction(''); }
                        }}
                        className="flex-1 h-9 bg-orange-500 hover:bg-orange-400 text-white rounded-lg text-sm flex items-center justify-center gap-1.5"
                      >
                        <Wand2 className="h-4 w-4" /> Edytuj
                      </button>
                    </div>
                    {/* Szczegóły */}
                    <div className="px-4 pb-4 space-y-2 border-t border-zinc-800 pt-3">
                      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Szczegóły</p>
                      <div className="text-xs space-y-1">
                        <p className="text-zinc-400"><span className="text-zinc-600">Brief:</span> {selectedGeneration.brief}</p>
                        <p className="text-zinc-600"><span className="text-zinc-600">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                        <p className="text-zinc-600"><span className="text-zinc-600">Format:</span> {FORMATS.find(f => f.value === selectedGeneration.format)?.label}</p>
                      </div>
                      <details className="mt-2">
                        <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">Pokaż prompt systemowy</summary>
                        <p className="mt-2 text-xs text-zinc-600 leading-relaxed bg-zinc-950 rounded-lg p-3 whitespace-pre-wrap">{selectedGeneration.prompt}</p>
                      </details>
                    </div>
                    {/* Panel edycji */}
                    {editingImage && (
                      <div className="px-4 pb-4 space-y-3 border-t border-blue-500/30 pt-3">
                        <p className="text-xs text-blue-400 font-medium">Instrukcja edycji</p>
                        <textarea
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-500 outline-none"
                          rows={3}
                          placeholder="np. Dodaj logo Plej w prawym górnym rogu, zmień kolor tła na granatowy"
                          value={editInstruction}
                          onChange={e => setEditInstruction(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button onClick={() => setEditingImage(null)} className="h-9 px-4 bg-zinc-800 text-zinc-400 rounded-lg text-sm">Anuluj</button>
                          <button
                            onClick={editImage}
                            disabled={editing || !editInstruction}
                            className="flex-1 h-9 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white rounded-lg text-sm flex items-center justify-center gap-1.5"
                          >
                            {editing ? <><Loader2 className="h-4 w-4 animate-spin" /> Edytuję...</> : <><Wand2 className="h-4 w-4" /> Zastosuj</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-square flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <Image className="h-12 w-12 text-zinc-700 mx-auto" />
                      <p className="text-zinc-600 text-sm">Wygeneruj grafikę lub kliknij w historię</p>
                    </div>
                  </div>
                )}
              </div>

              {/* HISTORIA — pozioma lista miniatur */}
              {generations.length > 0 && (
                <div>
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide mb-3">Historia ({generations.length})</p>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {generations.map(g => {
                      const urls: string[] = JSON.parse(g.image_urls || '[]');
                      const isActive = selectedGeneration?.id === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => { setSelectedGeneration(g); setEditingImage(null); }}
                          className={`flex-none w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${isActive ? 'border-orange-500' : 'border-zinc-800 hover:border-zinc-600'}`}
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

        {tab === 'settings' && (
          <div className="max-w-xl space-y-6">
            <h2 className="font-semibold text-zinc-300">Ustawienia marki</h2>

            {/* AUTO-ANALIZA */}
            <div className={`rounded-xl p-4 border ${project.brand_analysis ? 'border-teal-500/30 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-zinc-300">
                    {project.brand_analysis ? '✅ Analiza marki gotowa' : '🔍 Analiza marki'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {project.brand_analysis
                      ? 'Gemini przeanalizował Twoje referencje — ta analiza zastępuje ręczne pola poniżej'
                      : 'Wgraj grafiki referencyjne i kliknij Analizuj — Gemini zbada styl marki automatycznie'}
                  </p>
                </div>
                <button
                  onClick={analyzeBrand}
                  disabled={analyzing || references.length === 0}
                  className="h-9 px-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-1.5 whitespace-nowrap"
                >
                  {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analizuję...</> : <><Wand2 className="h-3.5 w-3.5" /> {project.brand_analysis ? 'Ponów analizę' : 'Analizuj markę'}</>}
                </button>
              </div>
              {project.brand_analysis && (
                <details className="mt-2">
                  <summary className="text-xs text-teal-400 cursor-pointer hover:text-teal-300">Pokaż wynik analizy</summary>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap bg-zinc-950 rounded-lg p-3">{project.brand_analysis}</p>
                </details>
              )}
            </div>

            {/* ZASADY OBOWIĄZKOWE */}
            <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 space-y-2">
              <div>
                <p className="text-sm font-semibold text-red-400">⚠️ Zasady obowiązkowe (Do's & Don'ts)</p>
                <p className="text-xs text-zinc-500 mt-0.5">Każda zasada w osobnej linii. Gemini traktuje je jako absolutne ograniczenia — naruszenie jest niedopuszczalne.</p>
              </div>
              <textarea
                className="w-full bg-zinc-950 border border-red-500/20 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-500/60 outline-none font-mono"
                rows={6}
                placeholder={`np.:\nZawsze białe tło\nMaxymalnie jeden blob/dekoracja na layout\nBlob tylko przy krawędzi, nigdy w centrum\nNie używaj gradientów jako tła\nNie dodawaj przypadkowych ludzi`}
                value={editRules}
                onChange={e => setEditRules(e.target.value)}
              />
            </div>

            <p className="text-sm text-zinc-500">Pola poniżej są używane gdy brak automatycznej analizy.</p>

            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Opis stylu graficznego</label>
              <textarea
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm resize-none focus:border-orange-500 outline-none"
                rows={3}
                placeholder="np. Minimalistyczny, sportowy. Duże białe przestrzenie, dynamiczne ujęcia, realistyczne zdjęcia produktów."
                value={editStyle}
                onChange={e => setEditStyle(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Typografia</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                placeholder="np. Nagłówki: Helvetica Neue Bold, treść: Light. Tekst zawsze biały lub czarny."
                value={editTypo}
                onChange={e => setEditTypo(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Paleta kolorów</label>
              <input
                type="text"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:border-orange-500 outline-none"
                placeholder="np. Czarny #000000, biały #FFFFFF, akcent pomarańczowy #FF6B35"
                value={editColors}
                onChange={e => setEditColors(e.target.value)}
              />
            </div>

            <button
              onClick={saveSettings}
              disabled={savingSettings}
              className="h-10 px-6 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
            >
              {savingSettings ? 'Zapisuję...' : 'Zapisz ustawienia'}
            </button>

            {/* Upload logo */}
            <div className="pt-4 border-t border-zinc-800">
              <h3 className="font-medium text-zinc-300 mb-2">Logo (PNG)</h3>
              <p className="text-xs text-zinc-500 mb-3">Gemini nie obsługuje SVG — wgraj PNG lub JPG</p>
              <div className="flex items-center gap-3">
                {project.logo_url && !project.logo_url.endsWith('.svg') && (
                  <img src={project.logo_url} alt="logo" className="h-12 w-auto rounded-lg border border-zinc-800 bg-white/5 p-1" />
                )}
                <label className="cursor-pointer h-9 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm flex items-center gap-2">
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
            <div className="pt-4 border-t border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-zinc-300">Grafiki referencyjne ({references.length}/5)</h3>
                {references.length < 5 && (
                  <label className="cursor-pointer h-8 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs flex items-center gap-1.5">
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
                      <img src={a.url} alt={a.filename} className="w-full aspect-square object-cover rounded-lg border border-zinc-800" />
                      <button
                        onClick={async () => {
                          if (!id) return;
                          await fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' });
                          setAssets(prev => prev.filter(x => x.id !== a.id));
                        }}
                        className="absolute top-1 right-1 bg-red-600/80 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Wgraj 2-4 przykładowe posty marki żeby Gemini naśladował styl.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
