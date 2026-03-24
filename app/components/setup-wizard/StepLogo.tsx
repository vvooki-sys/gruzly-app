'use client';

import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import type { Project, BrandAsset } from '@/lib/types';

interface StepLogoProps {
  project: Project;
  assets: BrandAsset[];
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
}

export default function StepLogo({ project, assets, onAssetsUpdate, showToast }: StepLogoProps) {
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const lightRef = useRef<HTMLInputElement>(null);
  const darkRef = useRef<HTMLInputElement>(null);

  const lightLogo = assets.find(a => a.type === 'logo' && (a.variant === 'light' || a.variant === 'default'));
  const darkLogo = assets.find(a => a.type === 'logo' && a.variant === 'dark');

  const uploadLogo = async (file: File, variant: 'light' | 'dark') => {
    const setUploading = variant === 'light' ? setUploadingLight : setUploadingDark;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'logo');
      fd.append('variant', variant === 'light' ? 'default' : 'dark');
      fd.append('name', `Logo (${variant === 'light' ? 'jasne tło' : 'ciemne tło'})`);
      const res = await fetch('/api/brand/assets', { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        const targetVariant = variant === 'light' ? 'default' : 'dark';
        onAssetsUpdate([
          ...assets.filter(a => !(a.type === 'logo' && a.variant === targetVariant)),
          asset,
        ]);
        showToast(`Logo (${variant === 'light' ? 'jasne tło' : 'ciemne tło'}) zapisane`);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">🏷 Logo marki</h2>
        <p className="text-sm opacity-50 mt-1">
          Wgraj logo w dwóch wariantach — na jasne i ciemne tło. Najlepiej SVG, ale akceptujemy też PNG/WebP.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Light variant */}
        <div className="space-y-2">
          <p className="text-xs font-bold opacity-50 uppercase tracking-wide">Na jasne tło</p>
          <input
            ref={lightRef}
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f, 'light');
              e.target.value = '';
            }}
          />
          <button
            onClick={() => lightRef.current?.click()}
            disabled={uploadingLight}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 hover:border-holo-mint/60 transition-all flex items-center justify-center bg-white dark:bg-gray-100 group"
          >
            {uploadingLight ? (
              <Loader2 className="h-6 w-6 animate-spin opacity-40 text-teal-deep" />
            ) : lightLogo ? (
              <img src={lightLogo.url} alt="Logo (jasne tło)" className="max-h-20 max-w-[80%] object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 opacity-30 group-hover:opacity-60 transition-opacity text-teal-deep">
                <Upload className="h-6 w-6" />
                <span className="text-xs font-bold">Wgraj logo</span>
                <span className="text-[10px]">SVG, PNG, WebP</span>
              </div>
            )}
          </button>
          {lightLogo && (
            <p className="text-[10px] opacity-30 text-center truncate">{lightLogo.filename}</p>
          )}
        </div>

        {/* Dark variant */}
        <div className="space-y-2">
          <p className="text-xs font-bold opacity-50 uppercase tracking-wide">Na ciemne tło</p>
          <input
            ref={darkRef}
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f, 'dark');
              e.target.value = '';
            }}
          />
          <button
            onClick={() => darkRef.current?.click()}
            disabled={uploadingDark}
            className="w-full h-32 rounded-2xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 hover:border-holo-mint/60 transition-all flex items-center justify-center bg-gray-900 group"
          >
            {uploadingDark ? (
              <Loader2 className="h-6 w-6 animate-spin opacity-40 text-white" />
            ) : darkLogo ? (
              <img src={darkLogo.url} alt="Logo (ciemne tło)" className="max-h-20 max-w-[80%] object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-1 opacity-30 group-hover:opacity-60 transition-opacity text-white">
                <Upload className="h-6 w-6" />
                <span className="text-xs font-bold">Wgraj logo</span>
                <span className="text-[10px]">SVG, PNG, WebP</span>
              </div>
            )}
          </button>
          {darkLogo && (
            <p className="text-[10px] opacity-30 text-center truncate">{darkLogo.filename}</p>
          )}
        </div>
      </div>

      <div className="bg-holo-mint/5 border border-holo-mint/10 rounded-xl px-3 py-2">
        <p className="text-xs opacity-50">
          💡 <strong>Wskazówka:</strong> Logo w SVG zostanie automatycznie skonwertowane do PNG na potrzeby generowania grafik.
          Jeśli nie masz logo — możesz pominąć ten krok.
        </p>
      </div>
    </div>
  );
}
