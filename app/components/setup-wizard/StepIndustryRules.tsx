'use client';

import { useState, useEffect } from 'react';
import { Loader2, Wand2, Check } from 'lucide-react';
import type { Project, IndustryRules } from '@/lib/types';

interface StepIndustryRulesProps {
  project: Project;
  showToast: (msg: string) => void;
  onProjectUpdate: (p: Project) => void;
}

export default function StepIndustryRules({ project, showToast, onProjectUpdate }: StepIndustryRulesProps) {
  const [rules, setRules] = useState<IndustryRules | null>(project.industry_rules || null);
  const [generating, setGenerating] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const hasBrandData = !!project.brand_scan_data;

  // Auto-generate on mount if brand data exists and no rules yet
  useEffect(() => {
    if (hasBrandData && !rules && !autoTriggered) {
      setAutoTriggered(true);
      generate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/brand/industry-rules', { method: 'POST' });
      const data = await res.json();
      if (data.industryRules) {
        setRules(data.industryRules);
        onProjectUpdate({ ...project, industry_rules: data.industryRules });
        showToast('Reguły branżowe wygenerowane ✓');
      } else {
        showToast('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">📋 Reguły branżowe</h2>
        <p className="text-sm opacity-50 mt-1">
          AI analizuje branżę marki i generuje reguły copywriterskie: klisze do unikania, typy ujęć foto, specyfikę języka.
          Reguły są wstrzykiwane automatycznie do każdego generowania copy.
        </p>
      </div>

      {/* Generated rules display */}
      {rules && !generating && (
        <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-4">
          <div className="flex items-center gap-2 text-holo-mint text-sm font-bold">
            <Check className="h-4 w-4" /> Reguły branżowe gotowe
          </div>

          {/* Banned cliches */}
          {rules.banned_cliches?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Zakazane klisze</p>
              <div className="flex flex-wrap gap-1.5">
                {rules.banned_cliches.map((c, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Banned marketing words */}
          {rules.banned_marketing_words?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Zakazane słowa</p>
              <div className="flex flex-wrap gap-1.5">
                {rules.banned_marketing_words.map((w, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 line-through">{w}</span>
                ))}
              </div>
            </div>
          )}

          {/* Photo brief types */}
          {rules.photo_brief_types?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Typy ujęć foto</p>
              <div className="space-y-1">
                {rules.photo_brief_types.map((t, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-holo-mint font-bold shrink-0">📷</span>
                    <span className="opacity-70">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Language notes */}
          {rules.language_notes && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Specyfika języka</p>
              <p className="text-xs opacity-60 leading-relaxed">{rules.language_notes}</p>
            </div>
          )}

          {/* Regenerate button */}
          <button
            onClick={generate}
            className="h-8 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold opacity-50 hover:opacity-100 transition-opacity"
          >
            Regeneruj reguły
          </button>
        </div>
      )}

      {/* Generating state */}
      {generating && (
        <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4">
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-holo-mint" />
            <span className="opacity-70">Generuję reguły branżowe...</span>
          </div>
        </div>
      )}

      {/* No brand data — can't generate */}
      {!hasBrandData && !rules && !generating && (
        <div className="bg-holo-mint/5 border border-holo-mint/10 rounded-xl px-3 py-2">
          <p className="text-xs opacity-50">
            💡 Aby wygenerować reguły branżowe, najpierw wykonaj Brand Scan w kroku 2.
            Możesz też pominąć ten krok i wygenerować reguły później w Ustawieniach.
          </p>
        </div>
      )}

      {/* Brand data exists but no rules and not auto-triggered */}
      {hasBrandData && !rules && !generating && (
        <button
          onClick={generate}
          className="w-full h-10 rounded-full holo-gradient text-teal-deep font-black hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
        >
          <Wand2 className="h-4 w-4" /> Generuj reguły branżowe
        </button>
      )}
    </div>
  );
}
