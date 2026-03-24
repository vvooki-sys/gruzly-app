'use client';

import { useState } from 'react';
import { Upload, Loader2, Trash2, X } from 'lucide-react';
import type { Project, BrandAsset } from '@/lib/types';

interface AssetManagerProps {
  project: Project;
  assets: BrandAsset[];
  onAssetsUpdate: (a: BrandAsset[]) => void;
  showToast: (msg: string) => void;
  refreshData: () => Promise<void>;
}

const inputCls =
  'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

export default function AssetManager({
  project,
  assets,
  onAssetsUpdate,
  showToast,
  refreshData,
}: AssetManagerProps) {
  const id = project.id;

  // Asset upload form state
  const [assetUploadOpen, setAssetUploadOpen] = useState(false);
  const [assetUploadType, setAssetUploadType] = useState<
    'logo' | 'brand-element' | 'photo' | 'reference' | 'brandbook'
  >('brand-element');
  const [assetUploadVariant, setAssetUploadVariant] = useState('default');
  const [assetUploadName, setAssetUploadName] = useState('');
  const [assetUploadDescription, setAssetUploadDescription] = useState('');
  const [uploadingAsset, setUploadingAsset] = useState(false);

  // ---------- handlers ----------

  const setAssets = (updater: BrandAsset[] | ((prev: BrandAsset[]) => BrandAsset[])) => {
    if (typeof updater === 'function') {
      onAssetsUpdate(updater(assets));
    } else {
      onAssetsUpdate(updater);
    }
  };

  const uploadAsset = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingAsset(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', assetUploadType);
      fd.append('variant', assetUploadVariant);
      fd.append('name', assetUploadName || file.name);
      fd.append('description', assetUploadDescription);
      const res = await fetch(`/api/brand/assets?projectId=${id}`, {
        method: 'POST',
        body: fd,
      });
      if (res.ok) {
        const asset = await res.json();
        setAssets((prev) => [...prev, asset]);
        setAssetUploadOpen(false);
        setAssetUploadName('');
        setAssetUploadDescription('');
        showToast('Asset dodany ✓');
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        alert('Błąd: ' + err.error);
      }
    } catch {
      alert('Błąd połączenia podczas wgrywania');
    } finally {
      setUploadingAsset(false);
    }
  };

  const toggleFeaturedRef = async (assetId: number) => {
    const res = await fetch(`/api/brand/assets?assetId=${assetId}`, {
      method: 'PATCH',
    });
    if (res.ok) {
      const updated = await res.json();
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, is_featured: updated.is_featured } : a,
        ),
      );
    }
  };

  const deleteAsset = async (assetId: number) => {
    const res = await fetch(`/api/brand/assets?assetId=${assetId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setAssets((prev) => prev.filter((x) => x.id !== assetId));
    }
  };

  // ---------- render ----------

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black text-base">Biblioteka assetów</h2>
        <button
          onClick={() => setAssetUploadOpen((v) => !v)}
          className="h-9 px-4 rounded-full holo-gradient text-teal-deep text-xs font-black flex items-center gap-1.5 hover:opacity-90 transition-opacity"
        >
          <Upload className="h-3.5 w-3.5" /> Dodaj asset
        </button>
      </div>

      {/* Upload form */}
      {assetUploadOpen && (
        <div className="rounded-2xl border border-holo-mint/20 bg-white dark:bg-teal-mid p-5 space-y-4">
          <p className="text-sm font-bold">Nowy asset</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs opacity-50 mb-1 block">Typ *</label>
              <select
                value={assetUploadType}
                onChange={(e) =>
                  setAssetUploadType(e.target.value as typeof assetUploadType)
                }
                className={inputCls}
              >
                <option value="logo">Logo</option>
                <option value="brand-element">Element graficzny</option>
                <option value="photo">Zdjęcie / Packshot</option>
                <option value="reference">Referencja</option>
                <option value="brandbook">Brandbook (PDF)</option>
              </select>
            </div>
            {assetUploadType === 'logo' && (
              <div>
                <label className="text-xs opacity-50 mb-1 block">Wariant logo</label>
                <select
                  value={assetUploadVariant}
                  onChange={(e) => setAssetUploadVariant(e.target.value)}
                  className={inputCls}
                >
                  <option value="default">Domyślne</option>
                  <option value="dark-bg">Na ciemne tło</option>
                  <option value="light-bg">Na jasne tło</option>
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="text-xs opacity-50 mb-1 block">Nazwa (opcjonalnie)</label>
            <input
              type="text"
              className={inputCls}
              placeholder="np. Blob fioletowy, Sticker SALE…"
              value={assetUploadName}
              onChange={(e) => setAssetUploadName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs opacity-50 mb-1 block">
              Opis (opcjonalnie — AI go użyje)
            </label>
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              placeholder="np. Blob dekoracyjny fioletowy, używać w prawym górnym rogu grafiki"
              value={assetUploadDescription}
              onChange={(e) => setAssetUploadDescription(e.target.value)}
            />
          </div>
          <label
            className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-holo-mint/30 cursor-pointer hover:border-holo-mint/60 transition-colors font-semibold text-sm ${uploadingAsset ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {uploadingAsset ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Wgrywam...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" /> Wybierz plik i wgraj
              </>
            )}
            <input
              type="file"
              accept="image/*,application/pdf,.svg"
              className="hidden"
              onChange={uploadAsset}
              disabled={uploadingAsset}
            />
          </label>
        </div>
      )}

      {/* LOGO section */}
      {(() => {
        const logos = assets.filter((a) => a.type === 'logo');
        return (
          <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-wide">
              Logo ({logos.length})
            </p>
            {logos.length === 0 && (
              <p className="text-xs opacity-30">Brak logo — dodaj wariant</p>
            )}
            <div className="space-y-2">
              {logos.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="w-16 h-10 rounded-lg bg-teal-deep/5 dark:bg-teal-deep/30 border border-teal-deep/10 dark:border-holo-mint/10 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={a.url}
                      className="max-w-full max-h-full object-contain"
                      alt={a.filename}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.filename}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-holo-mint/10 text-holo-mint">
                      {a.variant || 'default'}
                    </span>
                  </div>
                  <button
                    className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                    onClick={() => deleteAsset(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* BRAND ELEMENTS section */}
      {(() => {
        const elements = assets.filter((a) => a.type === 'brand-element');
        return (
          <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-wide">
              Elementy graficzne ({elements.length})
            </p>
            {elements.length === 0 && (
              <p className="text-xs opacity-30">
                Brak elementów — dodaj bloba, sticker, ikonę, teksturę…
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {elements.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 p-2 rounded-xl border border-teal-deep/10 dark:border-holo-mint/10"
                >
                  <div className="w-12 h-12 rounded-lg bg-teal-deep/5 dark:bg-teal-deep/30 border border-teal-deep/10 dark:border-holo-mint/10 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={a.url}
                      className="max-w-full max-h-full object-contain"
                      alt={a.filename}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{a.filename}</p>
                    {a.description && (
                      <p className="text-xs opacity-40 truncate">{a.description}</p>
                    )}
                  </div>
                  <button
                    className="w-7 h-7 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all shrink-0"
                    onClick={() => deleteAsset(a.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* PHOTOS section */}
      {(() => {
        const photos = assets.filter((a) => a.type === 'photo');
        return (
          <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-wide">
              Zdjęcia / Packshoty ({photos.length})
            </p>
            {photos.length === 0 && (
              <p className="text-xs opacity-30">
                Brak zdjęć — dodaj packshot, lifestyle photo…
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {photos.map((a) => (
                <div
                  key={a.id}
                  className="relative aspect-square rounded-xl overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 group"
                >
                  <img
                    src={a.url}
                    className="w-full h-full object-cover"
                    alt={a.filename}
                  />
                  <div className="absolute inset-0 bg-teal-deep/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                    <p className="text-white text-xs font-semibold text-center truncate w-full">
                      {a.filename}
                    </p>
                    <button
                      className="w-7 h-7 rounded-full bg-red-500/80 flex items-center justify-center text-white"
                      onClick={() => deleteAsset(a.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* BRANDBOOK + REFERENCES section */}
      {(() => {
        const brandbook = assets.find((a) => a.type === 'brandbook');
        const refs = assets.filter((a) => a.type === 'reference');
        return (
          <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
            <p className="text-xs font-bold opacity-40 uppercase tracking-wide">
              Brandbook & Referencje
            </p>
            {brandbook ? (
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{brandbook.filename}</p>
                  <p className="text-xs opacity-40">Brandbook PDF</p>
                </div>
                <button
                  className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                  onClick={() => deleteAsset(brandbook.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs opacity-30">
                Brak brandbooka — użyj Kontekst marki do analizy grafik referencyjnych
              </p>
            )}
            {refs.length > 0 && (
              <div>
                <p className="text-xs opacity-40 mb-2">Referencje ({refs.length}/5)</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {refs.map((a) => (
                    <div
                      key={a.id}
                      className={`relative aspect-square rounded-lg overflow-hidden border group ${a.is_featured ? 'border-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}
                    >
                      <img
                        src={a.url}
                        className="w-full h-full object-cover"
                        alt={a.filename}
                      />
                      {/* Star / featured toggle */}
                      <button
                        title={
                          a.is_featured
                            ? 'Usuń priorytet'
                            : 'Ustaw jako priorytet stylu'
                        }
                        onClick={() => toggleFeaturedRef(a.id)}
                        className={`absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center transition-all ${a.is_featured ? 'bg-holo-mint text-teal-deep opacity-100' : 'bg-black/40 text-white opacity-0 group-hover:opacity-100'}`}
                      >
                        <span className="text-[9px] leading-none">
                          {a.is_featured ? '★' : '☆'}
                        </span>
                      </button>
                      <button
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteAsset(a.id)}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
