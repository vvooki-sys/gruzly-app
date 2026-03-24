'use client';

import { useState, useRef } from 'react';
import { Loader2, Wand2, Camera } from 'lucide-react';
import { mergeBrandSections } from '@/lib/brand-sections';
import type { Project, BrandAsset, BrandSection, VoiceCard } from '@/lib/types';

/* ─── Source badges ─── */

const SOURCE_BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  brandbook:  { label: '📖 Brandbook',  color: 'bg-green-500/20 text-green-400' },
  references: { label: '🖼 Referencje', color: 'bg-blue-500/20 text-blue-400' },
  brand_scan: { label: '🌐 Brand Scan', color: 'bg-yellow-500/20 text-yellow-400' },
};

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null;
  const c = SOURCE_BADGE_CONFIG[source];
  if (!c) return null;
  return <span className={`px-2 py-0.5 rounded-full text-xs ${c.color}`}>{c.label}</span>;
}

function SourceBadges({ sources }: { sources: string[] }) {
  const unique = [...new Set(sources)].filter(s => s !== 'manual');
  if (unique.length === 0) return null;
  return (
    <>
      {unique.map(s => {
        const c = SOURCE_BADGE_CONFIG[s];
        return c ? <span key={s} className={`px-2 py-0.5 rounded-full text-xs ${c.color}`}>{c.label}</span> : null;
      })}
    </>
  );
}

/* ─── Props ─── */

interface BrandSettingsProps {
  project: Project;
  assets: BrandAsset[];
  onProjectUpdate: (p: Project) => void;
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
  refreshData: () => Promise<void>;
}

/* ─── Component ─── */

export default function BrandSettings({
  project,
  assets,
  onProjectUpdate,
  onAssetsUpdate,
  showToast,
}: BrandSettingsProps) {
  const id = project.id;
  // --- Rules state ---
  const [editRules, setEditRules] = useState(project.brand_rules || '');
  const [savingRules, setSavingRules] = useState(false);

  // --- Brand sections state ---
  const [brandSections, setBrandSections] = useState<BrandSection[]>(() => {
    // Attempt to parse from project.brand_analysis if present
    try {
      if (project.brand_analysis) {
        const parsed = JSON.parse(project.brand_analysis);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionContent, setEditingSectionContent] = useState('');

  // --- Voice card state ---
  const [voiceCard, setVoiceCard] = useState<VoiceCard | null>(project.voice_card || null);
  const [voiceSamples, setVoiceSamples] = useState('');
  const [analyzingVoice, setAnalyzingVoice] = useState(false);
  const [voiceCardEditMode, setVoiceCardEditMode] = useState(false);
  const [voiceCardEditJson, setVoiceCardEditJson] = useState('');

  // --- Project meta state (inline editing) ---
  const [editName, setEditName] = useState(project.name);
  const [editClientName, setEditClientName] = useState(project.client_name || '');
  const [editDescription, setEditDescription] = useState(project.description || '');
  const [editLogoPosition, setEditLogoPosition] = useState(project.logo_position || 'top-left');
  const [savingProject, setSavingProject] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  /* ══════════════════════ Handlers ══════════════════════ */

  const saveProjectMeta = async () => {
    if (!editName.trim()) return;
    setSavingProject(true);
    try {
      const res = await fetch('/api/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          clientName: editClientName || null,
          description: editDescription || null,
          logoPosition: editLogoPosition,
        }),
      });
      if (res.ok) {
        onProjectUpdate({
          ...project,
          name: editName.trim(),
          client_name: editClientName || null,
          description: editDescription || null,
          logo_position: editLogoPosition,
        });
        showToast('Zapisano');
      }
    } finally {
      setSavingProject(false);
    }
  };

  const uploadIcon = async (file: File) => {
    setUploadingIcon(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'logo');
      fd.append('variant', 'icon');
      fd.append('name', 'Ikonka projektu');
      const res = await fetch('/api/brand/assets', { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        onAssetsUpdate([...assets.filter(a => !(a.type === 'logo' && a.variant === 'icon')), asset]);
        onProjectUpdate({ ...project, logo_url: asset.url });
        showToast('Ikonka zapisana');
      }
    } finally {
      setUploadingIcon(false);
    }
  };


  const saveRules = async () => {
    setSavingRules(true);
    await fetch(`/api/brand`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandRules: editRules }),
    });
    onProjectUpdate({ ...project, brand_rules: editRules });
    setSavingRules(false);
    showToast('Zasady zapisane ✓');
  };

  const saveSection = async (sectionId: string, content: string) => {
    await fetch(`/api/brand`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, sectionContent: content }),
    });
    setBrandSections(prev => prev.map(s => s.id === sectionId ? { ...s, content } : s));
    setEditingSectionId(null);
    showToast('Sekcja zapisana ✓');
  };

  const deleteSection = async (sectionId: string) => {
    const updated = brandSections.filter(s => s.id !== sectionId);
    await fetch(`/api/brand`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandSections: updated }),
    });
    setBrandSections(updated);
  };

  const analyzeVoice = async () => {
    if (!voiceSamples.trim()) return;
    setAnalyzingVoice(true);
    try {
      const samples = voiceSamples.split('\n---\n').map(s => s.trim()).filter(Boolean);
      if (samples.length < 3) {
        alert('Wklej minimum 3 próbki tekstów rozdzielone linią ---');
        return;
      }
      const res = await fetch(`/api/brand/voice-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ samples }),
      });
      const data = await res.json();
      if (data.voiceCard) {
        setVoiceCard(data.voiceCard);
        showToast('Voice Card wygenerowana ✓');
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setAnalyzingVoice(false);
    }
  };

  const saveVoiceCardEdit = async () => {
    try {
      const parsed = JSON.parse(voiceCardEditJson);
      await fetch(`/api/brand/voice-card`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceCard: parsed }),
      });
      setVoiceCard(parsed);
      setVoiceCardEditMode(false);
      showToast('Voice Card zapisana ✓');
    } catch {
      alert('Nieprawidłowy JSON');
    }
  };

  const deleteVoiceCard = async () => {
    if (!confirm('Usunąć Voice Card?')) return;
    await fetch(`/api/brand/voice-card`, { method: 'DELETE' });
    setVoiceCard(null);
    setVoiceSamples('');
    showToast('Voice Card usunięta');
  };

  /* ══════════════════════ JSX ══════════════════════ */

  return (
    <div className="space-y-5">

      {/* ── Brand Identity ── */}
      <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-5 space-y-4">
        <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Identyfikacja marki</p>

        {/* Icon + Name row */}
        <div className="flex items-start gap-4">
          {/* Icon upload */}
          <div className="shrink-0">
            <input
              ref={iconInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadIcon(f); e.target.value = ''; }}
            />
            <button
              onClick={() => iconInputRef.current?.click()}
              disabled={uploadingIcon}
              className="relative w-16 h-16 rounded-2xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 hover:border-holo-mint/60 transition-all flex items-center justify-center overflow-hidden group"
            >
              {uploadingIcon ? (
                <Loader2 className="h-5 w-5 animate-spin opacity-40" />
              ) : project.logo_url ? (
                <>
                  <img src={project.logo_url} alt={project.name} className="w-12 h-12 object-contain" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl">
                    <Camera className="h-4 w-4 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-0.5 opacity-30 group-hover:opacity-60 transition-opacity">
                  <Camera className="h-5 w-5" />
                  <span className="text-[9px] font-bold">Ikonka</span>
                </div>
              )}
            </button>
          </div>

          {/* Name + Client */}
          <div className="flex-1 space-y-2">
            <div>
              <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1">Nazwa marki *</label>
              <input
                type="text"
                className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2 text-sm font-bold border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={saveProjectMeta}
              />
            </div>
            <div>
              <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1">Klient</label>
              <input
                type="text"
                className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                placeholder="Opcjonalnie"
                value={editClientName}
                onChange={e => setEditClientName(e.target.value)}
                onBlur={saveProjectMeta}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1">Opis projektu</label>
          <textarea
            className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors resize-none"
            rows={2}
            placeholder="Krótki opis, cel projektu, notatki..."
            value={editDescription}
            onChange={e => setEditDescription(e.target.value)}
            onBlur={saveProjectMeta}
          />
        </div>

        {/* Logo position */}
        <div>
          <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1">Pozycja logo na grafikach</label>
          <select
            className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
            value={editLogoPosition}
            onChange={e => { setEditLogoPosition(e.target.value); setTimeout(saveProjectMeta, 0); }}
          >
            <option value="top-left">↖ Lewy górny</option>
            <option value="top-right">↗ Prawy górny</option>
            <option value="bottom-left">↙ Lewy dolny</option>
            <option value="bottom-right">↘ Prawy dolny</option>
            <option value="none">✕ Bez logo</option>
          </select>
        </div>

        {savingProject && <p className="text-xs text-holo-mint font-bold">Zapisuję...</p>}
      </div>

      {/* ── Brand Sections ── */}
      {brandSections.length > 0 && (() => {
        const mergedSections = mergeBrandSections(brandSections);
        return (
          <div className="space-y-2">
            <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Sekcje marki ({mergedSections.length})</p>
            {mergedSections.map(section => (
              <div
                key={section.id}
                className={`rounded-xl border p-4 ${
                  section.type === 'custom'
                    ? 'border-holo-peach/30 bg-holo-peach/5'
                    : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-base shrink-0">{section.icon || '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{section.title}</p>
                        <SourceBadges sources={section.sources} />
                      </div>
                      {editingSectionId !== section.id && (
                        <p className="text-xs opacity-50 mt-0.5 line-clamp-2">{section.primaryContent}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingSectionId(section.id); setEditingSectionContent(section.primaryContent); }}
                      className="h-7 px-2.5 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/10 border border-teal-deep/10 dark:border-holo-mint/10 rounded-lg text-xs font-medium transition-colors"
                    >
                      Edytuj
                    </button>
                    {section.type === 'custom' && (
                      <button
                        onClick={() => deleteSection(section.id)}
                        className="h-7 w-7 border border-red-500/20 hover:border-red-500/50 hover:text-red-400 rounded-lg text-sm flex items-center justify-center opacity-40 hover:opacity-100 transition-all"
                      >×</button>
                    )}
                  </div>
                </div>

                {editingSectionId === section.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint rounded-xl px-3 py-2 text-sm resize-none outline-none transition-colors"
                      rows={4}
                      value={editingSectionContent}
                      onChange={e => setEditingSectionContent(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingSectionId(null)}
                        className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold opacity-50 hover:opacity-100 transition-opacity"
                      >Anuluj</button>
                      <button
                        onClick={() => saveSection(section.id, editingSectionContent)}
                        className="h-8 px-4 rounded-full bg-holo-mint/20 hover:bg-holo-mint/30 text-holo-mint border border-holo-mint/30 text-xs font-semibold transition-colors"
                      >Zapisz sekcję</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })()}

      {/* ── Voice Card ── */}
      <div className="rounded-2xl border border-teal-deep/15 dark:border-holo-mint/15 bg-white dark:bg-teal-mid p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold flex items-center gap-2">
              Voice Card
              {voiceCard && <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-holo-mint/20 text-holo-mint">Aktywna</span>}
            </p>
            <p className="text-xs opacity-40 mt-0.5">Profil głosu marki — wstrzykiwany automatycznie do każdego generowania copy</p>
          </div>
          {voiceCard && (
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => { setVoiceCardEditMode(v => !v); setVoiceCardEditJson(JSON.stringify(voiceCard, null, 2)); }}
                className="h-7 px-2.5 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity">
                {voiceCardEditMode ? 'Anuluj' : 'Edytuj JSON'}
              </button>
              <button onClick={deleteVoiceCard}
                className="h-7 px-2.5 rounded-full border border-red-500/20 text-red-400 text-xs font-semibold opacity-60 hover:opacity-100 transition-opacity">
                Usuń
              </button>
            </div>
          )}
        </div>

        {/* Edit JSON mode */}
        {voiceCardEditMode && (
          <div className="space-y-2">
            <textarea
              className="w-full bg-offwhite dark:bg-teal-deep border border-holo-mint/20 rounded-xl px-3 py-2 text-xs font-mono resize-none outline-none focus:border-holo-mint transition-colors"
              rows={16}
              value={voiceCardEditJson}
              onChange={e => setVoiceCardEditJson(e.target.value)}
            />
            <button onClick={saveVoiceCardEdit}
              className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold hover:opacity-90 transition-opacity">
              Zapisz zmiany
            </button>
          </div>
        )}

        {/* Voice Card display */}
        {voiceCard && !voiceCardEditMode && (
          <div className="space-y-4">
            {/* Header */}
            <div className="space-y-1">
              {voiceCard.archetype && <p className="text-sm font-black text-holo-mint">{voiceCard.archetype}</p>}
              {voiceCard.voice_summary && <p className="text-sm opacity-70">{voiceCard.voice_summary}</p>}
            </div>

            {/* Dimensions */}
            {voiceCard.dimensions && (
              <div className="space-y-2">
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Wymiary głosu</p>
                {(['formality', 'warmth', 'humor', 'authority', 'directness'] as const).map(dim => {
                  const d = voiceCard.dimensions?.[dim];
                  if (!d) return null;
                  const labels: Record<string, string> = { formality: 'Formalność', warmth: 'Ciepło', humor: 'Humor', authority: 'Autorytet', directness: 'Bezpośredniość' };
                  return (
                    <div key={dim} className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs w-28 opacity-50">{labels[dim]}</span>
                        <div className="flex-1 h-1.5 bg-teal-deep/10 dark:bg-teal-deep/40 rounded-full overflow-hidden">
                          <div className="h-full bg-holo-mint rounded-full transition-all" style={{ width: `${(d.score / 10) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono opacity-40 w-6 text-right">{d.score}</span>
                      </div>
                      {d.description && <p className="text-xs opacity-40 pl-30 ml-[7.5rem]">{d.description}</p>}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Golden Rules */}
            {voiceCard.golden_rules && voiceCard.golden_rules.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Złote reguły</p>
                {voiceCard.golden_rules.map((r, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-holo-mint font-bold shrink-0">{i + 1}.</span>
                    <span className="opacity-70">{r}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Taboos */}
            {voiceCard.taboos && voiceCard.taboos.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Tabu</p>
                <div className="flex flex-wrap gap-1.5">
                  {voiceCard.taboos.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Vocabulary */}
            {(voiceCard.vocabulary?.signature_phrases?.length || voiceCard.vocabulary?.forbidden_words?.length) && (
              <div className="grid grid-cols-2 gap-3">
                {voiceCard.vocabulary?.signature_phrases?.length && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Charakterystyczne</p>
                    <div className="flex flex-wrap gap-1">
                      {voiceCard.vocabulary.signature_phrases.slice(0, 6).map((p, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-holo-mint/10 text-holo-mint">&quot;{p}&quot;</span>
                      ))}
                    </div>
                  </div>
                )}
                {voiceCard.vocabulary?.forbidden_words?.length && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Zabronione słowa</p>
                    <div className="flex flex-wrap gap-1">
                      {voiceCard.vocabulary.forbidden_words.slice(0, 6).map((w, i) => (
                        <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 line-through">{w}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Examples */}
            {(voiceCard.example_good?.length || voiceCard.example_bad?.length) && (
              <div className="space-y-2">
                {voiceCard.example_good?.slice(0, 2).map((e, i) => (
                  <div key={i} className="text-xs px-3 py-2 rounded-xl bg-green-500/5 border border-green-500/20 text-green-400">&check; &quot;{e}&quot;</div>
                ))}
                {voiceCard.example_bad?.slice(0, 2).map((e, i) => (
                  <div key={i} className="text-xs px-3 py-2 rounded-xl bg-red-500/5 border border-red-500/20 text-red-400 line-through">&cross; &quot;{e}&quot;</div>
                ))}
              </div>
            )}

            {/* Regenerate */}
            <button onClick={() => setVoiceCard(null)}
              className="text-xs opacity-40 hover:opacity-80 transition-opacity underline">
              Wgraj nowe próbki i wygeneruj ponownie
            </button>
          </div>
        )}

        {/* Input: no card yet (or regenerating) */}
        {!voiceCard && (
          <div className="space-y-3">
            <div className="text-xs opacity-50 bg-teal-deep/5 rounded-xl p-3 space-y-1">
              <p className="font-bold">Jak to działa:</p>
              <p>Wklej 5-20 tekstów marki (posty social, maile, opisy kampanii). Każdy tekst oddziel linią <code className="bg-teal-deep/20 px-1 rounded">---</code></p>
              <p>LLM przeanalizuje i wygeneruje profil głosu: archetype, reguły, tabu, słownictwo.</p>
            </div>
            <textarea
              className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors font-mono"
              rows={10}
              placeholder={`Przykładowy post marki z Facebooka\n---\nInny post lub fragment maila\n---\nOpis kampanii lub treść ze strony www\n---\n(minimum 3 próbki, rekomendowane 10+)`}
              value={voiceSamples}
              onChange={e => setVoiceSamples(e.target.value)}
            />
            <button
              onClick={analyzeVoice}
              disabled={analyzingVoice || voiceSamples.split('\n---\n').filter(s => s.trim()).length < 3}
              className="w-full h-10 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
            >
              {analyzingVoice
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Analizuję głos marki...</>
                : <><Wand2 className="h-4 w-4" /> Analizuj głos marki</>
              }
            </button>
            {voiceSamples.split('\n---\n').filter(s => s.trim()).length > 0 && (
              <p className="text-xs opacity-40 text-center">{voiceSamples.split('\n---\n').filter(s => s.trim()).length} próbek · min. 3 wymagane</p>
            )}
          </div>
        )}
      </div>

      {/* ── Mandatory Rules ── */}
      <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4 space-y-2">
        <div>
          <p className="text-sm font-bold text-red-400">⚠️ Zasady obowiązkowe (Do&apos;s &amp; Don&apos;ts)</p>
          <p className="text-xs opacity-50 mt-0.5">Każda zasada w osobnej linii. Gemini traktuje je jako absolutne ograniczenia.</p>
        </div>
        <textarea
          className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-red-500/20 rounded-xl px-4 py-3 text-sm resize-none focus:border-red-400 outline-none font-mono transition-colors"
          rows={6}
          placeholder={'np.:\nZawsze białe tło\nMaxymalnie jeden blob/dekoracja na layout\nBlob tylko przy krawędzi, nigdy w centrum\nNie używaj gradientów jako tła\nNie dodawaj przypadkowych ludzi'}
          value={editRules}
          onChange={e => setEditRules(e.target.value)}
        />
        <button
          onClick={saveRules}
          disabled={savingRules || editRules === (project.brand_rules || '')}
          className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {savingRules ? 'Zapisuję...' : 'Zapisz zasady'}
        </button>
      </div>


    </div>
  );
}
