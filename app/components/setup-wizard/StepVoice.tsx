'use client';

import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import type { Project } from '@/lib/types';
import type { BrandBaseSection } from './BrandBasePreview';

interface StepVoiceProps {
  project: Project;
  sections: BrandBaseSection[];
  onSectionUpdate: (section: BrandBaseSection) => void;
  showToast: (msg: string) => void;
}

type VoiceMode = 'manual' | 'samples' | 'auto';

export default function StepVoice({ project, sections, onSectionUpdate, showToast }: StepVoiceProps) {
  const [mode, setMode] = useState<VoiceMode>('manual');
  const [manualTov, setManualTov] = useState('');
  const [samples, setSamples] = useState('');
  const [generating, setGenerating] = useState(false);

  const existingTov = sections.find(s => s.id === 'ton_glosu');

  const saveManualTov = () => {
    if (!manualTov.trim()) return;
    onSectionUpdate({
      id: 'ton_glosu',
      title: 'Ton głosu',
      icon: '🗣',
      content: manualTov.trim(),
      source: 'manual',
    });
    showToast('Ton głosu zapisany ✓');
  };

  const analyzeFromSamples = async () => {
    const sampleList = samples.split('\n---\n').map(s => s.trim()).filter(s => s.length > 0);
    if (sampleList.length < 3) {
      showToast('Potrzebne minimum 3 próbki tekstu (oddzielone linią ---)');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/brand/voice-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples: sampleList }),
      });
      const data = await res.json();
      if (data.voiceCard) {
        const vc = data.voiceCard;
        const content = [
          vc.voice_summary && `Podsumowanie: ${vc.voice_summary}`,
          vc.archetype && `Archetyp: ${vc.archetype}`,
          vc.golden_rules?.length && `Złote zasady:\n${vc.golden_rules.map((r: string) => `• ${r}`).join('\n')}`,
          vc.taboos?.length && `Tabu (czego NIE robić):\n${vc.taboos.map((t: string) => `• ${t}`).join('\n')}`,
          vc.vocabulary?.signature_phrases?.length && `Charakterystyczne zwroty: ${vc.vocabulary.signature_phrases.join(', ')}`,
          vc.vocabulary?.forbidden_words?.length && `Zakazane słowa: ${vc.vocabulary.forbidden_words.join(', ')}`,
        ].filter(Boolean).join('\n\n');

        onSectionUpdate({
          id: 'ton_glosu',
          title: 'Ton głosu',
          icon: '🗣',
          content,
          source: 'voice_card',
        });
        showToast('Voice Card wygenerowana ✓');
      } else {
        showToast('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGenerating(false);
    }
  };

  const generateAutoTov = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/brand/tov', { method: 'POST' });
      const data = await res.json();
      if (data.tov) {
        onSectionUpdate({
          id: 'ton_glosu',
          title: 'Ton głosu',
          icon: '🗣',
          content: data.tov,
          source: 'scan',
        });
        showToast('Ton głosu wygenerowany ✓');
      } else {
        showToast('Brak wystarczających danych — wypełnij ręcznie lub dodaj próbki');
      }
    } catch {
      showToast('Błąd połączenia');
    } finally {
      setGenerating(false);
    }
  };

  const hasBrandData = sections.some(s => s.id !== 'ton_glosu');

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black">🗣 Ton głosu</h2>
        <p className="text-sm opacity-50 mt-1">
          Jak marka mówi? Wybierz sposób określenia tonu głosu.
        </p>
      </div>

      {existingTov && (
        <div className="rounded-xl border border-holo-mint/20 bg-holo-mint/5 p-3">
          <p className="text-xs font-bold text-holo-mint mb-1">✓ Ton głosu już ustalony</p>
          <p className="text-xs opacity-60 whitespace-pre-line line-clamp-4">{existingTov.content}</p>
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-2">
        {[
          { id: 'manual' as const, label: '✍️ Wpisz ręcznie', desc: 'Opisz ton głosu własnymi słowami' },
          { id: 'samples' as const, label: '📝 Wklej próbki', desc: 'AI przeanalizuje 3+ tekstów marki' },
          { id: 'auto' as const, label: '🤖 Generuj z bazy', desc: 'AI stworzy na bazie Brand Scan', disabled: !hasBrandData },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={'disabled' in m && m.disabled}
            className={`flex-1 rounded-xl border p-3 text-left transition-all ${
              mode === m.id
                ? 'border-holo-mint/50 bg-holo-mint/5'
                : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'
            } ${'disabled' in m && m.disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
          >
            <p className="text-xs font-bold">{m.label}</p>
            <p className="text-[10px] opacity-50 mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>

      {/* Mode content */}
      {mode === 'manual' && (
        <div className="space-y-2">
          <textarea
            className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors resize-none"
            rows={5}
            placeholder="Opisz ton głosu marki, np.: Marka komunikuje się bezpośrednio, ciepło, z humorem. Używa krótkich zdań. Unika korporacyjnego żargonu. Zwraca się per Ty..."
            value={manualTov}
            onChange={e => setManualTov(e.target.value)}
          />
          <button
            onClick={saveManualTov}
            disabled={!manualTov.trim()}
            className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Zapisz ton głosu
          </button>
        </div>
      )}

      {mode === 'samples' && (
        <div className="space-y-2">
          <textarea
            className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors resize-none font-mono"
            rows={8}
            placeholder={`Wklej minimum 3 próbki tekstu marki oddzielone linią ---\n\nPrzykładowy post na FB o nowym produkcie...\n---\nKolejny post z Instagrama...\n---\nTrzeci tekst ze strony www...`}
            value={samples}
            onChange={e => setSamples(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <p className="text-[10px] opacity-30">
              {samples.split('\n---\n').filter(s => s.trim()).length} / 3 próbek (minimum)
            </p>
            <button
              onClick={analyzeFromSamples}
              disabled={generating || samples.split('\n---\n').filter(s => s.trim()).length < 3}
              className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              {generating
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</>
                : <><Wand2 className="h-3 w-3" /> Analizuj Voice Card</>
              }
            </button>
          </div>
        </div>
      )}

      {mode === 'auto' && (
        <div className="space-y-2">
          <p className="text-xs opacity-50">
            AI wygeneruje ton głosu na podstawie danych zebranych w Brand Scan
            ({sections.filter(s => s.id !== 'ton_glosu').length} sekcji dostępnych).
          </p>
          <button
            onClick={generateAutoTov}
            disabled={generating}
            className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            {generating
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generuję...</>
              : <><Wand2 className="h-3 w-3" /> Generuj ton głosu</>
            }
          </button>
        </div>
      )}
    </div>
  );
}
