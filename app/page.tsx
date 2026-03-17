'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Layers, Image, Sun, Moon, Wand2 } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  client_name: string | null;
  description?: string | null;
  archived?: boolean;
  logo_url: string | null;
  created_at: string;
  generation_count?: number;
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setProjects(d); setLoading(false); });
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
  }, []);

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gruzly-theme', next);
    setIsDark(!isDark);
  };

  const createProject = async () => {
    if (!newName) return;
    setSaving(true);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, clientName: newClient || null }),
    });
    const p = await res.json();
    setProjects(prev => [p, ...prev]);
    setNewName('');
    setNewClient('');
    setShowNew(false);
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors">

      {/* Header */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/gruzly-bear.png" alt="Gruzly" className="w-8 h-8 rounded-lg object-cover" />
          <span className="text-lg font-black tracking-tight">Gruzly</span>
          <span className="hidden sm:block text-sm opacity-40 font-medium">Brand Graphics AI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-60 hover:opacity-100"
            aria-label="Przełącz motyw"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="holo-gradient flex items-center gap-1.5 text-teal-deep px-4 py-2 rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nowy projekt</span>
            <span className="sm:hidden">Nowy</span>
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Hero */}
        <div className="flex flex-col items-center text-center mb-16 pt-8">
          <img
            src="/gruzly-bear.png"
            alt="Gruzly"
            className="w-32 h-32 rounded-full mb-6 shadow-[0_0_40px_rgba(179,245,220,0.15)]"
          />
          <h1 className="text-5xl font-black tracking-tight mb-3"
            style={{
              background: 'linear-gradient(135deg, #F5F5F0 0%, #B3F5DC 50%, #9BE5E0 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Gruzly
          </h1>
          <p className="text-lg font-medium tracking-wide text-teal-deep/60 dark:text-white/50">
            🧱 Wieziemy Twój kreatywny gruz…
          </p>
        </div>

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-deep/30 dark:text-white/30">Projekty</p>
          {projects.some(p => p.archived) && (
            <button
              onClick={() => setShowArchived(v => !v)}
              className="text-xs opacity-40 hover:opacity-80 transition-opacity"
            >
              {showArchived ? 'Ukryj zarchiwizowane' : `Pokaż zarchiwizowane (${projects.filter(p => p.archived).length})`}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-16 opacity-40 text-sm">Ładowanie...</div>
        ) : projects.filter(p => !p.archived).length === 0 && !showArchived ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🧱</div>
            <p className="font-bold mb-1">Brak projektów</p>
            <p className="text-sm opacity-40">Stwórz pierwszy projekt żeby zacząć generować grafiki</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.filter(p => showArchived || !p.archived).map(p => (
              <Link
                key={p.id}
                href={`/projekt/${p.id}`}
                className={`bg-white dark:bg-teal-mid border rounded-2xl p-5 hover:border-holo-mint/60 dark:hover:border-holo-mint/40 transition-all group ${p.archived ? 'border-teal-deep/5 dark:border-holo-mint/5 opacity-50' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-offwhite dark:bg-teal-deep rounded-xl flex items-center justify-center overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10">
                    {p.logo_url ? (
                      <img
                        src={p.logo_url}
                        alt={p.name}
                        className="w-8 h-8 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute('style'); }}
                      />
                    ) : null}
                    <span className="font-black text-sm holo-text" style={p.logo_url ? { display: 'none' } : undefined}>{p.name[0]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.archived && <span className="text-xs opacity-40 bg-teal-deep/10 dark:bg-teal-mid px-2 py-0.5 rounded-full">archiwum</span>}
                    <span className="text-xs opacity-30">{new Date(p.created_at).toLocaleDateString('pl-PL')}</span>
                  </div>
                </div>
                <h3 className="font-bold group-hover:text-holo-mint transition-colors">{p.name}</h3>
                {p.client_name && <p className="text-sm opacity-40 mt-0.5">{p.client_name}</p>}
                {p.description && <p className="text-xs opacity-30 mt-1 line-clamp-2">{p.description}</p>}
                <div className="flex items-center gap-3 mt-4">
                  <span className="flex items-center gap-1 text-xs opacity-30">
                    <Image className="h-3 w-3" /> {p.generation_count ?? 0} grafik
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-xs font-bold text-holo-mint opacity-0 group-hover:opacity-100 transition-opacity">
                    <Wand2 className="h-3 w-3" /> Generuj
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Nowy projekt */}
      {showNew && (
        <div className="fixed inset-0 bg-teal-deep/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-teal-mid border border-teal-deep/15 dark:border-holo-mint/15 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h2 className="text-lg font-black">Nowy projekt</h2>
            <div>
              <label className="text-xs opacity-50 mb-1.5 block font-semibold uppercase tracking-wide">Nazwa projektu *</label>
              <input
                type="text"
                className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                placeholder="np. Nike Summer 2026"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div>
              <label className="text-xs opacity-50 mb-1.5 block font-semibold uppercase tracking-wide">Klient (opcjonalnie)</label>
              <input
                type="text"
                className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                placeholder="np. Nike Polska"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowNew(false)}
                className="flex-1 h-10 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-50 hover:opacity-100 transition-opacity"
              >
                Anuluj
              </button>
              <button
                onClick={createProject}
                disabled={saving || !newName}
                className="flex-1 h-10 rounded-full holo-gradient text-teal-deep text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                {saving ? 'Tworzę...' : 'Utwórz projekt'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
