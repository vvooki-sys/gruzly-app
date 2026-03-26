'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Wand2, Loader2, Sun, Moon, PenLine,
  Layers, Settings, LogOut, Settings2, Eye,
} from 'lucide-react';
import type { Project, BrandAsset, Generation, CopyGeneration, CopyToGeneratorData } from '@/lib/types';
import { useAuth } from '@/app/components/AuthProvider';
import Generator from '@/app/components/generator/Generator';
import Copywriter from '@/app/components/copywriter/Copywriter';
import AssetManager from '@/app/components/assets/AssetManager';
import BrandSettings from '@/app/components/settings/BrandSettings';
import SetupWizard from '@/app/components/setup-wizard/SetupWizard';

export default function BrandEditor() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [copyGenerations, setCopyGenerations] = useState<CopyGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('generate');
  const [showWizard, setShowWizard] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [copyData, setCopyData] = useState<CopyToGeneratorData | null>(null);

  const isAgency = user?.role === 'agencja';

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetch('/api/brand/init')
      .then(() => fetch('/api/brand'))
      .then(r => r.json())
      .then(d => {
        setProject(d.project);
        setAssets(d.assets || []);
        setGenerations(d.generations || []);
        setCopyGenerations(d.copyGenerations || []);
        const sections = d.project?.brand_sections;
        const hasSections = Array.isArray(sections) && sections.length > 0;
        const hasLogos = (d.assets || []).some((a: BrandAsset) => a.type === 'logo');
        if (!hasSections && !hasLogos && !d.project?.brand_scan_data) {
          setShowWizard(true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
  }, [user]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gruzly-theme', next);
    setIsDark(!isDark);
  };
  const refreshData = async () => {
    const r = await fetch('/api/brand');
    const d = await r.json();
    setProject(d.project);
    setAssets(d.assets || []);
    setGenerations(d.generations || []);
    setCopyGenerations(d.copyGenerations || []);
  };

  if (authLoading || loading || !user) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-holo-mint" />
    </div>
  );

  if (!project) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center text-sm opacity-50">
      Błąd ładowania danych marki
    </div>
  );

  if (showWizard && isAgency) return (
    <SetupWizard
      project={project}
      assets={assets}
      onComplete={async () => {
        await refreshData();
        setShowWizard(false);
      }}
      onClose={() => setShowWizard(false)}
      onProjectUpdate={p => setProject(p)}
      onAssetsUpdate={a => setAssets(a)}
      showToast={showToast}
    />
  );

  // Client tabs: only Generator + Copywriter
  const TABS = isAgency
    ? [
        { id: 'generate', icon: Wand2, label: 'Generator' },
        { id: 'copy', icon: PenLine, label: 'Copywriter' },
        { id: 'assets', icon: Layers, label: 'Assety' },
        { id: 'settings', icon: Settings, label: 'Ustawienia' },
      ]
    : [
        { id: 'generate', icon: Wand2, label: 'Generator' },
        { id: 'copy', icon: PenLine, label: 'Copywriter' },
      ];

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-holo-mint text-teal-deep text-sm font-bold px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3 flex items-center gap-3">

        <div className="w-8 h-8 bg-offwhite dark:bg-teal-mid rounded-lg flex items-center justify-center overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 shrink-0">
          {project.logo_url
            ? <img src={project.logo_url} alt={project.name} className="w-6 h-6 object-contain" />
            : <span className="font-black text-sm holo-text">{project.name[0]}</span>
          }
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-black text-sm sm:text-base truncate">{project.name}</h1>
          {project.client_name && <p className="text-xs text-muted truncate">{project.client_name}</p>}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-teal-deep/10 dark:bg-teal-mid rounded-full p-1 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === t.id ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
            >
              <t.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Role badge */}
        <span className={`h-8 px-2.5 rounded-full flex items-center justify-center gap-1 border text-xs font-semibold shrink-0 ${
          isAgency
            ? 'border-holo-mint/30 bg-holo-mint/10 text-holo-mint'
            : 'border-holo-peach/30 bg-holo-peach/10 text-holo-peach'
        }`}>
          {isAgency ? <Settings2 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {isAgency ? 'Agencja' : 'Klient'}
        </span>

        {/* Agency: brand analysis */}
        {isAgency && (
          <button
            onClick={() => setShowWizard(true)}
            className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 text-xs font-semibold opacity-50 hover:opacity-100 transition-all shrink-0 flex items-center gap-1.5"
            title="Konfiguruj bazę marki"
          >
            <span className="hidden sm:inline">Analiza marki</span>
          </button>
        )}

        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100 shrink-0"
          aria-label="Przełącz motyw"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          onClick={async () => { await logout(); router.replace('/login'); }}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-red-400/50 hover:text-red-400 transition-colors opacity-50 hover:opacity-100 shrink-0"
          title="Wyloguj"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* ── Tab content ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {tab === 'generate' && (
          <Generator
            project={project}
            assets={assets}
            generations={generations}
            onGenerationsUpdate={setGenerations}
            onAssetsUpdate={setAssets}
            showToast={showToast}
            refreshData={refreshData}
            copyData={copyData}
            onCopyDataConsumed={() => setCopyData(null)}
          />
        )}
        {tab === 'copy' && (
          <Copywriter
            project={project}
            copyGenerations={copyGenerations}
            onCopyGenerationsUpdate={setCopyGenerations}
            showToast={showToast}
            onUseCopy={(data) => {
              setCopyData(data);
              setTab('generate');
              showToast('Dane z Copywritera załadowane');
            }}
          />
        )}
        {tab === 'assets' && isAgency && (
          <AssetManager
            project={project}
            assets={assets}
            onAssetsUpdate={setAssets}
            showToast={showToast}
            refreshData={refreshData}
          />
        )}
        {tab === 'settings' && isAgency && (
          <BrandSettings
            project={project}
            assets={assets}
            onProjectUpdate={p => setProject(p)}
            onAssetsUpdate={setAssets}
            showToast={showToast}
            refreshData={refreshData}
          />
        )}
      </div>
    </div>
  );
}
