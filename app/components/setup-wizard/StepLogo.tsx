'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2, Check } from 'lucide-react';
import type { Project, BrandAsset } from '@/lib/types';

interface StepLogoProps {
  project: Project;
  assets: BrandAsset[];
  onAssetsUpdate: (a: BrandAsset[]) => void;
  onProjectUpdate: (p: Project) => void;
  showToast: (msg: string) => void;
}

export default function StepLogo({ project, assets, onAssetsUpdate, onProjectUpdate, showToast }: StepLogoProps) {
  const [uploading, setUploading] = useState(false);
  const [selectedBg, setSelectedBg] = useState<'light' | 'dark' | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [autoInverted, setAutoInverted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const svgAsset = assets.find(a => a.type === 'logo' && a.variant === 'svg');
  const lightLogo = assets.find(a => a.type === 'logo' && (a.variant === 'light' || a.variant === 'default'));
  const darkLogo = assets.find(a => a.type === 'logo' && a.variant === 'dark');

  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    setSelectedBg(null);
    setAutoInverted(null);
  };

  const processLogo = async () => {
    if (!pendingFile || !selectedBg) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', pendingFile);
      fd.append('background', selectedBg);
      const res = await fetch('/api/brand/convert-logo', { method: 'POST', body: fd });
      if (res.ok) {
        const data = await res.json();
        onAssetsUpdate(data.assets);
        onProjectUpdate({ ...project, logo_url: data.pngAsset.url });
        setAutoInverted(data.autoInverted);
        setPendingFile(null);
        showToast(data.autoInverted
          ? 'Logo zapisane + auto-inwersja ✓'
          : 'Logo zapisane ✓'
        );
      } else {
        showToast('Błąd przetwarzania logo');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">🏷 Logo marki</h2>
        <p className="text-sm text-muted mt-1">
          Wgraj logo w SVG (najlepiej) lub PNG/WebP. System wygeneruje warianty na jasne i ciemne tło.
        </p>
      </div>

      {/* Current logos preview */}
      {(lightLogo || darkLogo) && (
        <div className="rounded-xl border border-holo-mint/20 bg-holo-mint/5 p-3 space-y-2">
          <p className="text-xs font-bold text-holo-mint">✓ Logo w bazie</p>
          <div className="flex gap-3">
            {lightLogo && (
              <div className="flex-1 space-y-1">
                <div className="h-20 rounded-xl bg-white border border-gray-200 flex items-center justify-center p-3">
                  <img src={lightLogo.url} alt="Jasne tło" className="max-h-full max-w-full object-contain" />
                </div>
                <p className="text-xs text-center text-muted">Na jasne tło</p>
              </div>
            )}
            {darkLogo && (
              <div className="flex-1 space-y-1">
                <div className="h-20 rounded-xl bg-gray-900 border border-gray-700 flex items-center justify-center p-3">
                  <img src={darkLogo.url} alt="Ciemne tło" className="max-h-full max-w-full object-contain" />
                </div>
                <p className="text-xs text-center text-muted">Na ciemne tło</p>
              </div>
            )}
          </div>
          {svgAsset && (
            <p className="text-xs text-hint">Źródło: {svgAsset.filename}</p>
          )}
          {autoInverted === false && !darkLogo && (
            <p className="text-xs text-holo-yellow">
              ⚠️ Auto-inwersja nie była możliwa (logo wielokolorowe). Wgraj wariant na ciemne tło ręcznie w Assetach.
            </p>
          )}
        </div>
      )}

      {/* Upload area */}
      <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/20 bg-white dark:bg-teal-mid p-4 space-y-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/svg+xml,image/png,image/webp"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }}
        />

        {!pendingFile ? (
          /* Drop zone */
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-28 rounded-2xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 hover:border-holo-mint/60 transition-all flex flex-col items-center justify-center gap-2 group"
          >
            <Upload className="h-6 w-6 opacity-30 group-hover:opacity-60 transition-opacity" />
            <div className="text-center">
              <p className="text-xs font-bold opacity-50 group-hover:opacity-80 transition-opacity">
                {lightLogo || darkLogo ? 'Wgraj nowe logo' : 'Wgraj logo'}
              </p>
              <p className="text-xs text-hint">SVG, PNG lub WebP</p>
            </div>
          </button>
        ) : (
          /* File selected — ask about background */
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2">
              <span className="text-sm">📄</span>
              <span className="text-xs font-bold flex-1 truncate">{pendingFile.name}</span>
              <button
                onClick={() => { setPendingFile(null); setSelectedBg(null); }}
                className="text-xs opacity-40 hover:opacity-80 transition-opacity"
              >
                Zmień
              </button>
            </div>

            <p className="text-xs font-bold">To logo jest przeznaczone na:</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectedBg('light')}
                className={`h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  selectedBg === 'light'
                    ? 'border-holo-mint bg-white shadow-md'
                    : 'border-teal-deep/10 dark:border-holo-mint/20 bg-white hover:border-holo-mint/40'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <div className="w-4 h-4 rounded bg-gray-800" />
                </div>
                <span className="text-xs font-bold text-teal-deep">☀️ Jasne tło</span>
                {selectedBg === 'light' && <Check className="h-3 w-3 text-holo-mint" />}
              </button>
              <button
                onClick={() => setSelectedBg('dark')}
                className={`h-20 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${
                  selectedBg === 'dark'
                    ? 'border-holo-mint bg-gray-900 shadow-md'
                    : 'border-teal-deep/10 dark:border-holo-mint/20 bg-gray-900 hover:border-holo-mint/40'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-600 flex items-center justify-center">
                  <div className="w-4 h-4 rounded bg-white" />
                </div>
                <span className="text-xs font-bold text-white">🌙 Ciemne tło</span>
                {selectedBg === 'dark' && <Check className="h-3 w-3 text-holo-mint" />}
              </button>
            </div>

            {selectedBg && (
              <button
                onClick={processLogo}
                disabled={uploading}
                className="w-full h-10 rounded-full holo-gradient text-teal-deep text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Przetwarzam...</>
                  : <>Przetwórz logo</>
                }
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-holo-mint/5 border border-holo-mint/10 rounded-xl px-3 py-2">
        <p className="text-xs text-muted">
          💡 System automatycznie skonwertuje SVG do PNG (na potrzeby AI). Jeśli logo jest jednokolorowe — spróbuje też stworzyć wariant na drugie tło przez inwersję kolorów.
        </p>
      </div>
    </div>
  );
}
