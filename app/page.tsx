'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Layers, Image, Clock } from 'lucide-react';

interface Project {
  id: number;
  name: string;
  client_name: string | null;
  logo_url: string | null;
  created_at: string;
  generation_count?: number;
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/projects').then(r => r.json()).then(d => { setProjects(d); setLoading(false); });
  }, []);

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center font-bold text-sm">G</div>
          <span className="text-lg font-semibold">Gruzly</span>
          <span className="text-zinc-500 text-sm">Brand Graphics AI</span>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Nowy projekt
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Projekty</h1>

        {loading ? (
          <div className="text-zinc-500 text-center py-16">Ładowanie...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16">
            <Layers className="h-12 w-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-400 mb-2">Brak projektów</p>
            <p className="text-zinc-600 text-sm">Stwórz pierwszy projekt żeby zacząć generować grafiki</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <Link
                key={p.id}
                href={`/projekt/${p.id}`}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-600 transition-colors group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center overflow-hidden">
                    {p.logo_url ? (
                      <img src={p.logo_url} alt={p.name} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="text-zinc-400 font-bold text-sm">{p.name[0]}</span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600">
                    {new Date(p.created_at).toLocaleDateString('pl-PL')}
                  </span>
                </div>
                <h3 className="font-semibold text-zinc-100 group-hover:text-orange-400 transition-colors">{p.name}</h3>
                {p.client_name && <p className="text-sm text-zinc-500 mt-1">{p.client_name}</p>}
                <div className="flex items-center gap-3 mt-4 text-xs text-zinc-600">
                  <span className="flex items-center gap-1"><Image className="h-3 w-3" /> {p.generation_count ?? 0} grafik</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Nowy projekt */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Nowy projekt</h2>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Nazwa projektu *</label>
              <input
                type="text"
                className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 text-sm border border-zinc-700 focus:border-orange-500 outline-none"
                placeholder="np. Nike Summer 2026"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Klient (opcjonalnie)</label>
              <input
                type="text"
                className="w-full bg-zinc-800 rounded-lg px-3 py-2.5 text-sm border border-zinc-700 focus:border-orange-500 outline-none"
                placeholder="np. Nike Polska"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNew(false)} className="flex-1 h-10 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700">Anuluj</button>
              <button
                onClick={createProject}
                disabled={saving || !newName}
                className="flex-1 h-10 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-400 disabled:opacity-50"
              >
                {saving ? 'Tworzę...' : 'Utwórz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
