'use client';

import { useState, useCallback } from 'react';
import type { Project, BrandAsset } from '@/lib/types';
import BrandBasePreview, { type BrandBaseSection } from './BrandBasePreview';
import StepLogo from './StepLogo';
import StepBrandScan from './StepBrandScan';
import StepVoice from './StepVoice';

interface SetupWizardProps {
  project: Project;
  assets: BrandAsset[];
  onComplete: () => Promise<void>;
  onProjectUpdate: (p: Project) => void;
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
}

const STEPS = [
  { id: 'logo', label: 'Logo', icon: '🏷' },
  { id: 'brand-scan', label: 'Brand Scan', icon: '🌐' },
  { id: 'voice', label: 'Ton głosu', icon: '🗣' },
] as const;

export default function SetupWizard({
  project,
  assets,
  onComplete,
  onProjectUpdate,
  onAssetsUpdate,
  showToast,
}: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<BrandBaseSection[]>(() => {
    // Initialize from existing brand_sections if any
    const existing = (project as unknown as Record<string, unknown>).brand_sections;
    if (Array.isArray(existing)) {
      return existing.map((s: Record<string, unknown>) => ({
        id: String(s.id || ''),
        title: String(s.title || ''),
        icon: String(s.icon || '📄'),
        content: String(s.content || ''),
        source: (s.source as BrandBaseSection['source']) || 'manual',
      }));
    }
    return [];
  });

  const logos = assets.filter(a => a.type === 'logo');

  const addOrUpdateSection = useCallback((section: BrandBaseSection) => {
    setSections(prev => {
      const idx = prev.findIndex(s => s.id === section.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = section;
        return updated;
      }
      return [...prev, section];
    });
  }, []);

  const addSections = useCallback((newSections: BrandBaseSection[]) => {
    setSections(prev => {
      const updated = [...prev];
      for (const ns of newSections) {
        const idx = updated.findIndex(s => s.id === ns.id);
        if (idx >= 0) {
          updated[idx] = ns;
        } else {
          updated.push(ns);
        }
      }
      return updated;
    });
  }, []);

  const canGoNext = step < STEPS.length - 1;
  const canGoBack = step > 0;
  const isLastStep = step === STEPS.length - 1;

  const handleFinish = async () => {
    // Save all sections to project
    await fetch('/api/brand', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandSections: sections }),
    });
    await onComplete();
  };

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite">
      {/* Header */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/gruzly-bear.png" alt="Gruzly" className="w-8 h-8 rounded-lg object-cover" />
            <div>
              <span className="font-black text-sm">Konfiguracja marki</span>
              <span className="text-xs opacity-40 ml-2">{project.name}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setStep(i)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  i === step
                    ? 'holo-gradient text-teal-deep shadow-sm'
                    : i < step
                      ? 'opacity-70 bg-holo-mint/10 text-holo-mint'
                      : 'opacity-30'
                }`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left panel — step content */}
          <div className="lg:col-span-3 space-y-4">
            {step === 0 && (
              <StepLogo
                project={project}
                assets={assets}
                onAssetsUpdate={onAssetsUpdate}
                onProjectUpdate={onProjectUpdate}
                showToast={showToast}
              />
            )}
            {step === 1 && (
              <StepBrandScan
                project={project}
                assets={assets}
                onProjectUpdate={onProjectUpdate}
                onAssetsUpdate={onAssetsUpdate}
                onSectionsUpdate={addSections}
                showToast={showToast}
              />
            )}
            {step === 2 && (
              <StepVoice
                project={project}
                sections={sections}
                onSectionUpdate={addOrUpdateSection}
                showToast={showToast}
              />
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              {canGoBack && (
                <button
                  onClick={() => setStep(s => s - 1)}
                  className="h-10 px-6 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-60 hover:opacity-100 transition-opacity"
                >
                  ← Wstecz
                </button>
              )}
              <div className="flex-1" />
              {canGoNext && (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="h-10 px-6 rounded-full holo-gradient text-teal-deep text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Dalej →
                </button>
              )}
              {step === 0 && (
                <button
                  onClick={() => setStep(s => s + 1)}
                  className="h-10 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs opacity-40 hover:opacity-70 transition-opacity"
                >
                  Pomiń
                </button>
              )}
              {isLastStep && (
                <button
                  onClick={handleFinish}
                  className="h-10 px-6 rounded-full holo-gradient text-teal-deep text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Zakończ konfigurację ✓
                </button>
              )}
            </div>
          </div>

          {/* Right panel — live preview */}
          <div className="lg:col-span-2">
            <div className="sticky top-20 rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4">
              <BrandBasePreview sections={sections} logos={logos} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
