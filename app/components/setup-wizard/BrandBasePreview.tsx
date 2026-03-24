'use client';

import type { BrandAsset } from '@/lib/types';

export interface BrandBaseSection {
  id: string;
  title: string;
  icon: string;
  content: string;
  source: 'logo' | 'scan' | 'brandbook' | 'voice_card' | 'manual';
}

interface BrandBasePreviewProps {
  sections: BrandBaseSection[];
  logos: BrandAsset[];
}

export default function BrandBasePreview({ sections, logos }: BrandBasePreviewProps) {
  const lightLogo = logos.find(l => l.variant === 'light' || l.variant === 'default');
  const darkLogo = logos.find(l => l.variant === 'dark');

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Baza marki</p>

      {/* Logo preview */}
      {logos.length > 0 && (
        <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 p-3 space-y-2">
          <p className="text-xs font-bold flex items-center gap-1.5">
            <span>🏷</span> Logo
          </p>
          <div className="flex gap-2">
            {lightLogo && (
              <div className="flex-1 h-16 rounded-lg bg-white border border-gray-200 flex items-center justify-center p-2">
                <img src={lightLogo.url} alt="Logo (jasne tło)" className="max-h-full max-w-full object-contain" />
              </div>
            )}
            {darkLogo && (
              <div className="flex-1 h-16 rounded-lg bg-gray-900 border border-gray-700 flex items-center justify-center p-2">
                <img src={darkLogo.url} alt="Logo (ciemne tło)" className="max-h-full max-w-full object-contain" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 && logos.length === 0 && (
        <div className="text-center py-8 opacity-30">
          <p className="text-3xl mb-2">🧱</p>
          <p className="text-xs">Baza marki jest pusta</p>
          <p className="text-xs opacity-60">Przejdź przez kolejne kroki żeby ją wypełnić</p>
        </div>
      )}

      {sections.map(section => (
        <div
          key={section.id}
          className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 p-3 space-y-1 animate-in fade-in duration-300"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold flex items-center gap-1.5">
              <span>{section.icon}</span> {section.title}
            </p>
            <span className="text-[10px] opacity-30 uppercase">{section.source}</span>
          </div>
          <p className="text-xs opacity-60 whitespace-pre-line line-clamp-4">{section.content}</p>
        </div>
      ))}

      {(sections.length > 0 || logos.length > 0) && (
        <p className="text-[10px] text-center opacity-20">
          {sections.length} {sections.length === 1 ? 'sekcja' : sections.length < 5 ? 'sekcje' : 'sekcji'}
          {logos.length > 0 && ` + ${logos.length} logo`}
        </p>
      )}
    </div>
  );
}
