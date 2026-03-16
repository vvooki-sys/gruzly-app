'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, Wand2, Image, Loader2, Download,
  Settings, Sun, Moon, BookmarkPlus, Trash2, Zap, Target, PenLine,
  Layers, Camera, X, Check, MoreVertical, Archive,
} from 'lucide-react';

interface Project {
  brand_analysis?: string | null;
  brand_rules?: string | null;
  generation_mode?: string | null;
  id: number;
  name: string;
  client_name: string | null;
  description?: string | null;
  archived?: boolean;
  logo_url: string | null;
  style_description: string | null;
  typography_notes: string | null;
  color_palette: string | null;
  updated_at: string | null;
}

interface PrecisionTemplate {
  id?: number;
  name?: string;
  format?: string;
  width?: number;
  height?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: Record<string, any>;
}

interface Generation {
  id: number;
  brief: string;
  format: string;
  image_urls: string;
  prompt: string;
  status: string;
  created_at: string;
}

interface Asset {
  id: number;
  type: string;
  url: string;
  filename: string;
  variant?: string;
  description?: string;
  mime_type?: string;
  created_at: string;
}

interface BrandSection {
  id: string;
  title: string;
  content: string;
  type: 'standard' | 'custom';
  order: number;
  icon?: string;
}

interface SavedTemplate {
  id: number;
  name: string;
  format: string;
  is_user_template: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout?: Record<string, any>;
}

interface EditorBlock {
  id: string;
  type: string;
  label: string;
  required: boolean;
  x: number;      // left % of canvas (0-100)
  y: number;      // top % of canvas (0-100)
  w: number;      // width % of canvas (0-100)
  h: number;      // height % of canvas (0-100)
  zIndex: number;
  children: Array<{ type: string }>;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
}

const FORMATS = [
  { value: 'fb_post', label: 'Facebook Post', size: '1080×1080' },
  { value: 'ln_post', label: 'LinkedIn Post',  size: '1200×627' },
  { value: 'story',   label: 'Story / Reel',   size: '1080×1920' },
  { value: 'banner',  label: 'Baner',           size: '1200×400' },
];

const FORMAT_ASPECT: Record<string, string> = {
  fb_post: 'aspect-square',
  ln_post: 'aspect-video',
  story:   'aspect-[9/16]',
  banner:  'aspect-[3/1]',
};

const CREATIVITY_LABELS: Record<number, { name: string; desc: string }> = {
  1: { name: 'Basic', desc: 'Czysty, zgodny ze stylem marki' },
  2: { name: 'Enhanced', desc: 'Dodatkowe elementy dekoracyjne' },
  3: { name: 'Dynamic', desc: 'Bogata kompozycja, wiele warstw' },
  4: { name: 'Bold', desc: 'Śmiały, editorial, złożony layout' },
  5: { name: 'Expressive', desc: 'Maksymalna ekspresja wizualna' },
};

function getBaseFormat(fmt: string) {
  return fmt.split(':')[0];
}
function getFormatLabel(fmt: string) {
  return FORMATS.find(f => f.value === getBaseFormat(fmt))?.label ?? fmt;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'generate' | 'settings' | 'copy' | 'assets'>('generate');
  const [isDark, setIsDark] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Generator state
  const [headline, setHeadline] = useState('');
  const [subtext, setSubtext] = useState('');
  const [brief, setBrief] = useState('');
  const [format, setFormat] = useState('fb_post');
  const [mode, setMode] = useState<'precise' | 'fast'>('precise');
  const [creativity, setCreativity] = useState(2);
  const [generating, setGenerating] = useState(false);
  const [selectedGeneration, setSelectedGeneration] = useState<Generation | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Photo state (Creative mode generator)
  const [photoMode, setPhotoMode] = useState<'none' | 'upload' | 'generate' | 'library'>('none');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPrompt, setPhotoPrompt] = useState('');
  const [generatingPhoto, setGeneratingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Asset library state
  const [assetUploadOpen, setAssetUploadOpen] = useState(false);
  const [assetUploadType, setAssetUploadType] = useState<'logo' | 'brand-element' | 'photo' | 'reference' | 'brandbook'>('brand-element');
  const [assetUploadVariant, setAssetUploadVariant] = useState('default');
  const [assetUploadName, setAssetUploadName] = useState('');
  const [assetUploadDescription, setAssetUploadDescription] = useState('');
  const [uploadingAsset, setUploadingAsset] = useState(false);

  // Edit state
  const [editingImage, setEditingImage] = useState<{ url: string; generationId?: number } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editing, setEditing] = useState(false);

  // Settings state
  const [editRules, setEditRules] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [brandbookAsset, setBrandbookAsset] = useState<Asset | null>(null);
  const [brandSections, setBrandSections] = useState<BrandSection[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionContent, setEditingSectionContent] = useState('');

  // Precision mode state
  const [generationMode, setGenerationMode] = useState<'creative' | 'photo' | 'precision'>('creative');
  const [precisionExpanded, setPrecisionExpanded] = useState(false);
  const [precisionTemplate, setPrecisionTemplate] = useState<PrecisionTemplate | null>(null);
  const [precisionTemplateId, setPrecisionTemplateId] = useState<number | null>(null);
  const [generatingTemplate, setGeneratingTemplate] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [ctaText, setCtaText] = useState('');
  const [legalText, setLegalText] = useState('');
  const [stickerText, setStickerText] = useState('');
  const [centralImageUrl, setCentralImageUrl] = useState<string | null>(null);
  const [centralPrompt, setCentralPrompt] = useState('');
  const [generatingElement, setGeneratingElement] = useState(false);

  // Template editor state
  const [editorBlocks, setEditorBlocks] = useState<EditorBlock[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>([]);
  const [editorTemplateName, setEditorTemplateName] = useState('');
  const [savingEditorTemplate, setSavingEditorTemplate] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [resizing, setResizing] = useState<{ id: string; handle: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Project edit modal state
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

  // Tone of voice state
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [savingTov, setSavingTov] = useState(false);
  const [generatingTov, setGeneratingTov] = useState(false);

  // Copywriter state
  const [copyFile, setCopyFile] = useState<File | null>(null);
  const [copyBrief, setCopyBrief] = useState('');
  const [copyFormat, setCopyFormat] = useState('ogólny');
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [copyResults, setCopyResults] = useState<Array<{ headline: string; subtext: string; cta?: string; rationale?: string }>>([]);
  const [copyConcept, setCopyConcept] = useState('');
  const [copyCreativeBrief, setCopyCreativeBrief] = useState('');

  useEffect(() => {
    params.then(p => {
      setId(p.id);
      fetch(`/api/projects/${p.id}`)
        .then(r => r.json())
        .then(d => {
          setProject(d.project);
          setAssets(d.assets);
          setGenerations(d.generations);
          setEditRules(d.project.brand_rules || '');
          setBrandbookAsset(d.assets.find((a: Asset) => a.type === 'brandbook') || null);
          setBrandSections(d.project.brand_sections || []);
          setGenerationMode((d.project.generation_mode || 'creative') as 'creative' | 'photo' | 'precision');
          setToneOfVoice(d.project.tone_of_voice || '');
          setLoading(false);
        });
      fetch(`/api/projects/${p.id}/templates`)
        .then(r => r.json())
        .then(d => { if (Array.isArray(d)) setSavedTemplates(d); })
        .catch(() => {});
    });
    setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('gruzly-theme', next);
    setIsDark(!isDark);
  };

  const openEditProject = () => {
    if (!project) return;
    setEditName(project.name);
    setEditClientName(project.client_name || '');
    setEditDescription(project.description || '');
    setEditProjectOpen(true);
  };

  const saveProjectMeta = async () => {
    if (!id || !editName.trim()) return;
    setSavingProject(true);
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), clientName: editClientName || null, description: editDescription || null }),
      });
      setProject(p => p ? { ...p, name: editName.trim(), client_name: editClientName || null, description: editDescription || null } : p);
      setEditProjectOpen(false);
      showToast('Projekt zapisany ✓');
    } finally {
      setSavingProject(false);
    }
  };

  const toggleArchive = async () => {
    if (!project) return;
    const newArchived = !project.archived;
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: newArchived }),
    });
    setProject(p => p ? { ...p, archived: newArchived } : p);
    setEditProjectOpen(false);
    showToast(newArchived ? 'Projekt zarchiwizowany' : 'Projekt przywrócony ✓');
  };

  const deleteProject = async () => {
    if (!confirm('Czy na pewno chcesz usunąć ten projekt? Operacja jest nieodwracalna.')) return;
    setDeletingProject(true);
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/');
  };

  const generate = async () => {
    if (!headline || !id) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline, subtext, brief, format, mode, creativity, photoUrl: photoUrl || undefined, photoMode }),
      });
      const data = await res.json();
      if (data.imageUrls && data.imageUrls.length > 0) {
        setSelectedGeneration(data.generation);
        setGenerations(prev => [data.generation, ...prev]);
      } else {
        alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const analyzeBrand = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (data.sections) {
        setBrandSections(data.sections);
        setProject(p => p ? { ...p, brand_analysis: data.analysis, updated_at: new Date().toISOString() } : p);
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeFromBrandbook = async () => {
    if (!id) return;
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'brandbook' }),
      });
      const data = await res.json();
      if (data.sections) {
        setBrandSections(data.sections);
        setProject(p => p ? { ...p, brand_analysis: data.analysis, updated_at: new Date().toISOString() } : p);
        if (data.suggestedRules) {
          showToast('Brandbook zawiera zasady — przejrzyj je w sekcji Zasady obowiązkowe');
        }
      } else {
        alert('Błąd analizy: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBrandbookUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', 'brandbook');
    const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
    if (res.ok) {
      const asset = await res.json();
      setBrandbookAsset(asset);
      setAssets(prev => [...prev.filter(a => a.type !== 'brandbook'), asset]);
      showToast('Brandbook wgrany ✓');
    }
  };

  const deleteBrandbook = async () => {
    if (!brandbookAsset || !id) return;
    await fetch(`/api/projects/${id}/assets?assetId=${brandbookAsset.id}`, { method: 'DELETE' });
    setBrandbookAsset(null);
  };

  const handleCopyFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCopyFile(file);
  };

  const saveTov = async (value: string) => {
    if (!id) return;
    setSavingTov(true);
    try {
      await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toneOfVoice: value }),
      });
    } finally {
      setSavingTov(false);
    }
  };

  const generateTov = async () => {
    if (!id) return;
    setGeneratingTov(true);
    try {
      const res = await fetch(`/api/projects/${id}/tov`, { method: 'POST' });
      const data = await res.json();
      if (data.tov) {
        setToneOfVoice(data.tov);
        try { await saveTov(data.tov); } catch {}
        showToast('Ton & głos wygenerowany ✓');
      } else {
        alert('Błąd: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setGeneratingTov(false);
    }
  };

  const generateCopy = async () => {
    if (!id || (!copyFile && !copyBrief)) return;
    setGeneratingCopy(true);
    setCopyConcept('');
    setCopyCreativeBrief('');
    try {
      const fd = new FormData();
      if (copyFile) fd.append('file', copyFile);
      if (copyBrief) fd.append('text', copyBrief);
      fd.append('format', copyFormat);

      const res = await fetch(`/api/projects/${id}/copy`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.results) {
        setCopyResults(data.results);
        setCopyConcept(data.concept || '');
        setCopyCreativeBrief(data.creative_brief || '');
      } else {
        alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch (e) {
      console.error(e);
      alert('Błąd połączenia');
    } finally {
      setGeneratingCopy(false);
    }
  };

  const useCopyInGenerator = (r: { headline: string; subtext: string; cta?: string }, creativeBrief?: string) => {
    setHeadline(r.headline);
    setSubtext(r.subtext || '');
    if (r.cta) setCtaText(r.cta);
    if (creativeBrief) setBrief(creativeBrief);
    setTab('generate');
  };

  const generatePhoto = async () => {
    if (!photoPrompt || !id) return;
    setGeneratingPhoto(true);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: photoPrompt, format, elementOnly: true }),
      });
      const data = await res.json();
      if (data.imageUrls?.[0]) {
        setPhotoUrl(data.imageUrls[0]);
      } else {
        alert('Błąd generowania zdjęcia: ' + (data.error || 'Spróbuj ponownie'));
      }
    } catch {
      alert('Błąd połączenia');
    } finally {
      setGeneratingPhoto(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'photo');
      fd.append('name', file.name);
      const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        setPhotoUrl(asset.url);
        setAssets(prev => [...prev, asset]);
      }
    } finally {
      setUploadingPhoto(false);
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
      const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        setAssets(prev => [...prev, asset]);
        setAssetUploadOpen(false);
        setAssetUploadName('');
        setAssetUploadDescription('');
        showToast('Asset dodany ✓');
        if (assetUploadType === 'logo') {
          setProject(p => p ? { ...p, logo_url: asset.url } : p);
        }
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

  const saveGenerationMode = async (newMode: 'creative' | 'photo' | 'precision') => {
    setGenerationMode(newMode);
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationMode: newMode }),
    });
  };

  const generateTemplate = async () => {
    if (!id) return;
    setGeneratingTemplate(true);
    try {
      const res = await fetch(`/api/projects/${id}/template/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      if (data.error) { alert('Błąd: ' + data.error); return; }
      const tmpl = data.template || { layout: data.layout };
      setPrecisionTemplate(tmpl);
      if (tmpl.id) setPrecisionTemplateId(tmpl.id);
      setEditorBlocks(editorBlocksFromLayout(tmpl.layout || {}));
      showToast('Szablon wygenerowany ✓');
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingTemplate(false);
    }
  };

  const renderPrecision = async () => {
    if (!precisionTemplate && editorBlocks.length === 0) {
      alert('Najpierw wygeneruj lub załaduj szablon.');
      return;
    }
    if (!headline) { alert('Uzupełnij pole "Tekst główny".'); return; }
    if (!id) return;
    setRendering(true);
    try {
      const logoAsset = assets.find(a => a.type === 'logo');
      const res = await fetch(`/api/projects/${id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: editorBlocks.length > 0 ? undefined : (precisionTemplateId || undefined),
          layout: editorBlocks.length > 0 ? editorBlocksToLayout() : (precisionTemplateId ? undefined : precisionTemplate?.layout),
          headline,
          subtext,
          ctaText,
          legalText,
          stickerText,
          centralImageUrl: centralImageUrl || undefined,
          logoUrl: logoAsset?.url || undefined,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        alert('Błąd renderowania (' + res.status + '): ' + errText.substring(0, 300));
        return;
      }
      const data = await res.json().catch(() => null);
      if (!data || data.error) { alert('Błąd renderowania: ' + (data?.error || 'Brak odpowiedzi')); return; }
      setSelectedGeneration(data.generation);
      setGenerations(prev => [data.generation, ...prev]);
    } catch (e) {
      console.error(e);
      alert('Błąd połączenia: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRendering(false);
    }
  };

  const generateCentralElement = async () => {
    if (!centralPrompt || !id) return;
    setGeneratingElement(true);
    try {
      const res = await fetch(`/api/projects/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headline: centralPrompt, format, elementOnly: true }),
      });
      const data = await res.json();
      if (data.imageUrls?.[0]) setCentralImageUrl(data.imageUrls[0]);
      else alert('Błąd generowania: ' + (data.error || 'Spróbuj ponownie'));
    } catch {
      alert('Błąd połączenia');
    } finally {
      setGeneratingElement(false);
    }
  };

  const handleCentralImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setGeneratingElement(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', 'photo');
      fd.append('name', file.name);
      const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
      if (res.ok) {
        const asset = await res.json();
        setCentralImageUrl(asset.url);
        setAssets(prev => [...prev, asset]);
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        alert('Błąd wgrywania: ' + err.error);
      }
    } catch {
      alert('Błąd połączenia podczas wgrywania');
    } finally {
      setGeneratingElement(false);
    }
  };

  const BLOCK_COLORS: Record<string, string> = {
    logo: '#B3F5DC', headline: '#9BE5E0', subtext: '#9BE5E0',
    'central-image': '#B3A0F5', cta: '#F5D9A0', sticker: '#F5A0B3',
    legal: '#A0B3F5', spacer: '#888', text: '#888',
  };

  const BLOCK_LABELS: Record<string, string> = {
    logo: 'Logo', headline: 'Nagłówek', subtext: 'Podtytuł',
    'central-image': 'Element', cta: 'CTA', sticker: 'Sticker',
    legal: 'Tekst prawny', spacer: 'Spacer', text: 'Tekst',
  };

  const BLOCK_TYPES = ['logo', 'headline', 'subtext', 'central-image', 'cta', 'sticker', 'legal', 'spacer'] as const;

  const DEFAULT_BLOCK_POS: Record<string, { x: number; y: number; w: number; h: number }> = {
    'logo':          { x: 3, y: 3, w: 25, h: 8 },
    'central-image': { x: 10, y: 15, w: 80, h: 60 },
    'headline':      { x: 3, y: 75, w: 94, h: 12 },
    'subtext':       { x: 3, y: 87, w: 94, h: 7 },
    'cta':           { x: 3, y: 85, w: 40, h: 9 },
    'sticker':       { x: 72, y: 3, w: 22, h: 22 },
    'legal':         { x: 3, y: 94, w: 94, h: 4 },
    'spacer':        { x: 10, y: 40, w: 80, h: 20 },
  };

  const gridAreaToAbsolute = (gridArea: string) => {
    const parts = gridArea.split('/').map(s => parseInt(s.trim()));
    const rowStart = parts[0] || 1, colStart = parts[1] || 1;
    const rowEnd = parts[2] || 2, colEnd = parts[3] || 13;
    return {
      x: ((colStart - 1) / 12) * 100,
      y: ((rowStart - 1) / 12) * 100,
      w: ((colEnd - colStart) / 12) * 100,
      h: ((rowEnd - rowStart) / 12) * 100,
    };
  };

  const toGridArea = (b: EditorBlock): string => {
    const rowStart = Math.max(1, Math.round(b.y / 100 * 12) + 1);
    const rowEnd = Math.max(rowStart + 1, Math.round((b.y + b.h) / 100 * 12) + 1);
    const colStart = Math.max(1, Math.round(b.x / 100 * 12) + 1);
    const colEnd = Math.max(colStart + 1, Math.round((b.x + b.w) / 100 * 12) + 1);
    return `${rowStart} / ${colStart} / ${rowEnd} / ${colEnd}`;
  };

  const editorBlocksFromLayout = (layout: Record<string, unknown>): EditorBlock[] => {
    type ZoneRaw = { id: string; gridArea: string; children: Array<{ type: string }>; flexDirection?: string; justifyContent?: string; alignItems?: string; gap?: number };
    const zones = (layout.zones as ZoneRaw[]) || [];
    return zones.map((z, i) => {
      const primaryType = z.children?.[0]?.type || 'spacer';
      const pos = z.gridArea ? gridAreaToAbsolute(z.gridArea) : (DEFAULT_BLOCK_POS[primaryType] || { x: 5, y: 5, w: 90, h: 20 });
      return {
        id: z.id,
        type: primaryType,
        label: (z.children || []).map(c => BLOCK_LABELS[c.type] || c.type).join(' + '),
        required: primaryType === 'logo' || primaryType === 'headline',
        ...pos,
        zIndex: i + 1,
        children: z.children || [{ type: primaryType }],
        flexDirection: z.flexDirection || 'column',
        justifyContent: z.justifyContent || 'flex-start',
        alignItems: z.alignItems || 'flex-start',
        gap: z.gap,
      };
    });
  };

  const editorBlocksToLayout = (): Record<string, unknown> => {
    const zones = editorBlocks.map(b => ({
      id: b.id,
      gridArea: toGridArea(b),
      flexDirection: b.flexDirection || 'column',
      justifyContent: b.justifyContent || 'flex-start',
      alignItems: b.alignItems || 'flex-start',
      gap: b.gap,
      children: b.children,
    }));
    return { ...(precisionTemplate?.layout || {}), zones };
  };

  // Drag handlers
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || (!dragging && !resizing)) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (v: number, dim: number) => (v / dim) * 100;
    if (dragging) {
      const dx = px(e.clientX - dragging.startX, rect.width);
      const dy = px(e.clientY - dragging.startY, rect.height);
      setEditorBlocks(prev => prev.map(b => b.id === dragging.id
        ? { ...b, x: Math.max(0, dragging.origX + dx), y: Math.max(0, dragging.origY + dy) }
        : b));
    }
    if (resizing) {
      const dx = px(e.clientX - resizing.startX, rect.width);
      const dy = px(e.clientY - resizing.startY, rect.height);
      setEditorBlocks(prev => prev.map(b => {
        if (b.id !== resizing.id) return b;
        const h = resizing.handle;
        if (h === 'se') return { ...b, w: Math.max(5, resizing.origW + dx), h: Math.max(5, resizing.origH + dy) };
        if (h === 'e')  return { ...b, w: Math.max(5, resizing.origW + dx) };
        if (h === 's')  return { ...b, h: Math.max(5, resizing.origH + dy) };
        if (h === 'n')  return { ...b, y: resizing.origY + dy, h: Math.max(5, resizing.origH - dy) };
        if (h === 'w')  return { ...b, x: resizing.origX + dx, w: Math.max(5, resizing.origW - dx) };
        return b;
      }));
    }
  };

  const handleCanvasMouseUp = () => { setDragging(null); setResizing(null); };

  const startBlockDrag = (e: React.MouseEvent, block: EditorBlock) => {
    e.stopPropagation();
    const maxZ = Math.max(1, ...editorBlocks.map(b => b.zIndex));
    setEditorBlocks(prev => prev.map(b => b.id === block.id ? { ...b, zIndex: maxZ + 1 } : b));
    setDragging({ id: block.id, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y });
  };

  const startBlockResize = (e: React.MouseEvent, block: EditorBlock, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizing({ id: block.id, handle, startX: e.clientX, startY: e.clientY, origX: block.x, origY: block.y, origW: block.w, origH: block.h });
  };

  const saveEditorTemplate = async () => {
    if (!id || !editorTemplateName.trim()) return;
    setSavingEditorTemplate(true);
    try {
      const layout = editorBlocksToLayout();
      const res = await fetch(`/api/projects/${id}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editorTemplateName.trim(), format, layout, is_user_template: true }),
      });
      if (res.ok) {
        const tmpl = await res.json();
        setSavedTemplates(prev => [tmpl, ...prev]);
        showToast('Szablon zapisany ✓');
        setEditorTemplateName('');
      }
    } finally {
      setSavingEditorTemplate(false);
    }
  };

  const loadSavedTemplate = (tmplId: number) => {
    const tmpl = savedTemplates.find(t => t.id === tmplId);
    if (!tmpl?.layout) return;
    setPrecisionTemplate({ layout: tmpl.layout, id: tmpl.id, name: tmpl.name, format: tmpl.format });
    setPrecisionTemplateId(tmpl.id);
    setEditorBlocks(editorBlocksFromLayout(tmpl.layout));
    showToast('Szablon załadowany ✓');
  };

  const saveRules = async () => {
    if (!id) return;
    setSavingRules(true);
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandRules: editRules }),
    });
    setProject(p => p ? { ...p, brand_rules: editRules } : p);
    setSavingRules(false);
    showToast('Zasady zapisane ✓');
  };

  const saveSection = async (sectionId: string, content: string) => {
    await fetch(`/api/projects/${id}`, {
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
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandSections: updated }),
    });
    setBrandSections(updated);
  };

  const editImage = async () => {
    if (!editingImage || !editInstruction || !id) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/projects/${id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: editingImage.url,
          instruction: editInstruction,
          generationId: editingImage.generationId,
        }),
      });
      const data = await res.json();
      setSelectedGeneration(data.generation);
      setGenerations(prev => [data.generation, ...prev]);
      setEditingImage(null);
      setEditInstruction('');
    } catch (e) {
      console.error(e);
    } finally {
      setEditing(false);
    }
  };

  const addAsReference = async (url: string) => {
    if (!id) return;
    const res = await fetch(`/api/projects/${id}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, type: 'reference', filename: `generated-ref-${Date.now()}.jpg` }),
    });
    if (res.ok) {
      const asset = await res.json();
      setAssets(prev => [...prev, asset]);
      showToast('Dodano do referencji ✓');
    }
  };

  const deleteGeneration = async (genId: number) => {
    if (!confirm('Usunąć tę grafikę z historii?')) return;
    setDeletingId(genId);
    await fetch(`/api/projects/${id}/generations?generationId=${genId}`, { method: 'DELETE' });
    setGenerations(prev => prev.filter(g => g.id !== genId));
    if (selectedGeneration?.id === genId) setSelectedGeneration(null);
    setDeletingId(null);
  };

  if (loading) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-holo-mint" />
    </div>
  );
  if (!project) return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep flex items-center justify-center text-sm opacity-50">
      Projekt nie istnieje
    </div>
  );

  const references = assets.filter(a => a.type === 'reference');

  // PR 3d: stale analysis — references added after last save of brand_analysis
  const latestRefAt = references.reduce((max, r) => {
    const t = new Date(r.created_at).getTime();
    return t > max ? t : max;
  }, 0);
  const analysisStale = !!(
    project.brand_analysis &&
    project.updated_at &&
    latestRefAt > new Date(project.updated_at).getTime()
  );

  const inputCls = 'w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite rounded-xl px-4 py-3 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors';

  return (
    <div className="min-h-screen bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite transition-colors">

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 bg-holo-mint text-teal-deep text-sm font-bold px-4 py-2.5 rounded-full shadow-lg pointer-events-none">
          {toast}
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="glass-nav sticky top-0 z-40 border-b border-teal-deep/10 dark:border-holo-mint/10 bg-offwhite/85 dark:bg-teal-deep/85 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="opacity-50 hover:opacity-100 transition-opacity shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="w-8 h-8 bg-offwhite dark:bg-teal-mid rounded-lg flex items-center justify-center overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 shrink-0">
          {project.logo_url
            ? <img src={project.logo_url} alt={project.name} className="w-6 h-6 object-contain" />
            : <span className="font-black text-sm holo-text">{project.name[0]}</span>
          }
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-black text-sm sm:text-base truncate">{project.name}</h1>
          {project.client_name && <p className="text-xs opacity-40 truncate">{project.client_name}</p>}
        </div>

        {/* Tabs — Generator / Copywriter / Assety / Kontekst marki */}
        <div className="flex gap-1 bg-teal-deep/10 dark:bg-teal-mid rounded-full p-1 shrink-0">
          <button
            onClick={() => setTab('generate')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'generate' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <Wand2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Generator</span>
          </button>
          <button
            onClick={() => setTab('copy')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'copy' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <PenLine className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Copywriter</span>
          </button>
          <button
            onClick={() => setTab('assets')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'assets' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Assety</span>
          </button>
          <button
            onClick={() => setTab('settings')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${tab === 'settings' ? 'holo-gradient text-teal-deep shadow-sm' : 'opacity-50 hover:opacity-80'}`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Kontekst marki</span>
          </button>
        </div>

        <button
          onClick={openEditProject}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100 shrink-0"
          aria-label="Edytuj projekt"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center border border-teal-deep/15 dark:border-holo-mint/15 hover:border-holo-mint/50 transition-colors opacity-50 hover:opacity-100 shrink-0"
          aria-label="Przełącz motyw"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── TAB: GENERUJ — Creative / Photo mode ─────────────────────────────── */}
        {tab === 'generate' && (generationMode === 'creative' || generationMode === 'photo') && (
          <div className="space-y-8">

            {/* Main grid: Preview LEFT (sticky) | Form RIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

              {/* ── LEFT: Preview (sticky on desktop) ───────────────────────────── */}
              <div className="lg:sticky lg:top-[72px] space-y-3">
                <h2 className="font-black text-base">Podgląd</h2>

                <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                  {generating ? (
                    <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 mx-auto rounded-full holo-gradient flex items-center justify-center">
                          <Loader2 className="h-7 w-7 animate-spin text-teal-deep" />
                        </div>
                        <p className="text-sm opacity-50 font-medium">Generuję grafikę...</p>
                      </div>
                    </div>
                  ) : selectedGeneration ? (
                    <div>
                      {/* Image */}
                      {(() => {
                        const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                        return urls.map((u, i) => <img key={i} src={u} alt="Grafika" className="w-full" />);
                      })()}

                      {/* Actions */}
                      <div className="p-3 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) window.open(urls[0], '_blank');
                          }}
                          className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep hover:bg-teal-deep/10 dark:hover:bg-teal-deep/80 border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Pobierz
                        </button>
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) { setEditingImage({ url: urls[0], generationId: selectedGeneration.id }); setEditInstruction(''); }
                          }}
                          className="flex-1 h-9 rounded-full holo-gradient text-teal-deep text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Edytuj
                        </button>
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) addAsReference(urls[0]);
                          }}
                          title="Dodaj jako referencję"
                          className="w-9 h-9 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-50 hover:opacity-100 hover:border-holo-mint/50 transition-all shrink-0"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Details */}
                      <div className="px-4 pb-4 space-y-2 border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                        <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Szczegóły</p>
                        <div className="text-xs space-y-1 opacity-50">
                          <p><span className="opacity-60">Tekst:</span> {selectedGeneration.brief}</p>
                          <p><span className="opacity-60">Format:</span> {getFormatLabel(selectedGeneration.format)}</p>
                          <p><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                        </div>
                        <details className="mt-2">
                          <summary className="text-xs opacity-30 cursor-pointer hover:opacity-60 transition-opacity">Pokaż prompt systemowy</summary>
                          <p className="mt-2 text-xs opacity-40 leading-relaxed bg-offwhite dark:bg-teal-deep rounded-xl p-3 whitespace-pre-wrap">{selectedGeneration.prompt}</p>
                        </details>
                      </div>

                      {/* Edit panel */}
                      {editingImage && (
                        <div className="px-4 pb-4 space-y-3 border-t border-holo-lavender/30 pt-3">
                          <p className="text-xs font-bold text-holo-lavender">Instrukcja edycji</p>
                          <textarea
                            className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-holo-lavender/20 rounded-xl px-3 py-2 text-sm resize-none focus:border-holo-lavender outline-none transition-colors"
                            rows={3}
                            placeholder="np. Dodaj logo Plej w prawym górnym rogu, zmień kolor tła na granatowy"
                            value={editInstruction}
                            onChange={e => setEditInstruction(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingImage(null)}
                              className="h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-50 hover:opacity-100 transition-opacity"
                            >
                              Anuluj
                            </button>
                            <button
                              onClick={editImage}
                              disabled={editing || !editInstruction}
                              className="flex-1 h-9 rounded-full bg-holo-lavender text-teal-deep text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                            >
                              {editing
                                ? <><Loader2 className="h-4 w-4 animate-spin" /> Edytuję...</>
                                : <><Wand2 className="h-4 w-4" /> Zastosuj</>
                              }
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`${FORMAT_ASPECT[format] || 'aspect-square'} flex items-center justify-center`}>
                      <div className="text-center space-y-3">
                        <div className="text-5xl mb-3">🧱</div>
                        <p className="text-sm opacity-30">Wygeneruj grafikę lub kliknij w historię</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT: Form ──────────────────────────────────────────────────── */}
              <div className="space-y-4">
                <h2 className="font-black text-base">Nowa grafika</h2>

                {/* 1. Headline — required */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Tekst główny <span className="normal-case opacity-70 font-normal">— nagłówek grafiki *</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none font-mono`}
                    rows={2}
                    placeholder="np. 23 marca, Warszawa"
                    value={headline}
                    onChange={e => setHeadline(e.target.value)}
                  />
                </div>

                {/* 2. Subtext — optional */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Tekst dodatkowy <span className="normal-case opacity-70 font-normal">— podtytuł, CTA (opcjonalnie)</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none font-mono`}
                    rows={2}
                    placeholder="np. Zapisz się teraz →"
                    value={subtext}
                    onChange={e => setSubtext(e.target.value)}
                  />
                </div>

                {/* 3. Brief — optional, AI context only */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                    Brief dla AI <span className="normal-case opacity-70 font-normal">(opcjonalnie)</span>
                  </label>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={2}
                    placeholder="Opisz nastrój, styl, co ma pokazywać grafika. Copywriter może wygenerować to automatycznie."
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                  />
                </div>

                {/* Photo — in photo mode always show upload, in creative mode show toggle */}
                {(generationMode === 'creative' || generationMode === 'photo') && (
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide flex items-center gap-1.5">
                    <Camera className="h-3 w-3" /> Zdjęcie (opcjonalnie)
                  </label>
                  <div className="rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-3 space-y-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => { setPhotoMode('none'); setPhotoUrl(''); }}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${photoMode === 'none' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}>
                        Brak
                      </button>
                      <button onClick={() => setPhotoMode('upload')}
                        className={`h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${photoMode !== 'none' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}>
                        Dodaj zdjęcie
                      </button>
                    </div>
                    {photoMode !== 'none' && (
                      photoUrl ? (
                        <div className="flex items-center gap-2">
                          <img src={photoUrl} className="w-14 h-14 object-cover rounded-lg border border-teal-deep/10 dark:border-holo-mint/10" alt="photo" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs opacity-50 truncate">Zdjęcie wgrane</p>
                          </div>
                          <button onClick={() => setPhotoUrl('')} className="w-7 h-7 rounded-full border border-red-500/20 flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <label className={`flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-dashed border-teal-deep/20 dark:border-holo-mint/20 cursor-pointer hover:border-holo-mint/50 transition-colors text-sm ${uploadingPhoto ? 'opacity-50' : ''}`}>
                          {uploadingPhoto ? <><Loader2 className="h-4 w-4 animate-spin" /> Wgrywam...</> : <><Upload className="h-4 w-4" /> Wybierz plik</>}
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                        </label>
                      )
                    )}
                  </div>
                </div>
                )}

                {/* Format picker */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map(f => (
                      <button
                        key={f.value}
                        onClick={() => setFormat(f.value)}
                        className={`p-3 rounded-xl text-left border text-sm transition-all ${
                          format === f.value
                            ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                            : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="font-bold text-xs">{f.label}</div>
                        <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mode toggle — Kreatywny / Ze zdjęciem / Precyzyjny(beta) */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tryb</label>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => { setGenerationMode('creative'); setPhotoMode('none'); setPhotoUrl(''); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${generationMode === 'creative' ? 'border-holo-mint bg-holo-mint/10 text-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}
                    >
                      <Wand2 className="h-3 w-3" /> Kreatywny
                    </button>
                    <button
                      onClick={() => { setGenerationMode('photo'); setPhotoMode('upload'); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${generationMode === 'photo' ? 'border-holo-aqua bg-holo-aqua/10 text-holo-aqua' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}
                    >
                      <Camera className="h-3 w-3" /> Ze zdjęciem
                    </button>
                    <button
                      onClick={() => { setPrecisionExpanded(!precisionExpanded); if (!precisionExpanded) setGenerationMode('precision'); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${generationMode === 'precision' ? 'border-holo-lavender bg-holo-lavender/10 text-holo-lavender' : 'border-teal-deep/10 dark:border-holo-mint/10 opacity-50 hover:opacity-80'}`}
                    >
                      <Target className="h-3 w-3" /> Precyzyjny <span className="px-1.5 py-0.5 bg-holo-lavender/20 text-holo-lavender rounded text-[9px] font-black uppercase">Beta</span>
                    </button>
                  </div>
                </div>

                {/* Creativity slider */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs text-zinc-400">Poziom kreatywności</label>
                    <span className="text-xs font-semibold text-holo-mint">{CREATIVITY_LABELS[creativity].name}</span>
                  </div>
                  <input
                    type="range" min={1} max={5} step={1}
                    value={creativity}
                    onChange={e => setCreativity(parseInt(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-teal-mid accent-holo-mint"
                  />
                  <p className="text-xs text-zinc-500 mt-1">{CREATIVITY_LABELS[creativity].desc}</p>
                </div>

                {/* Generate CTA */}
                <button
                  onClick={generate}
                  disabled={generating || !headline}
                  className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
                >
                  {generating
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                    : <><Wand2 className="h-4 w-4" /> Generuj grafikę</>
                  }
                </button>

                {/* Brand context indicator */}
                <div className={`rounded-xl p-4 text-xs space-y-1 border transition-colors ${
                  brandSections.length > 0 || project.brand_analysis
                    ? 'border-holo-mint/20 bg-holo-mint/5'
                    : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid'
                }`}>
                  <p className={`font-bold mb-1.5 ${brandSections.length > 0 || project.brand_analysis ? 'text-holo-mint' : 'opacity-50'}`}>
                    {brandSections.length > 0
                      ? `✅ ${brandSections.length} sekcji brandowych`
                      : project.brand_analysis
                        ? '✅ Analiza tekstowa aktywna'
                        : '⚙️ Brak analizy — przejdź do Kontekst marki'}
                  </p>
                  {brandSections.length > 0 && (
                    <p className="opacity-50">{brandSections.slice(0, 3).map(s => s.title).join(', ')}{brandSections.length > 3 ? ` +${brandSections.length - 3} więcej` : ''}</p>
                  )}
                  <p className="opacity-30">📎 {references.length} grafik referencyjnych</p>
                </div>
              </div>
            </div>

            {/* ── Historia: full-width rows ─────────────────────────────────────── */}
            {generations.length > 0 && (
              <div>
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
                <div className="space-y-1.5">
                  {generations.map(g => {
                    const urls: string[] = JSON.parse(g.image_urls || '[]');
                    const isActive = selectedGeneration?.id === g.id;
                    const gHeadline = g.brief.split(' | ')[0];
                    const gSubtext = g.brief.includes(' | ') ? g.brief.split(' | ').slice(1).join(' | ') : null;
                    const isFast = g.format.endsWith(':fast');
                    const gCreativity = parseInt(g.format.match(/:c(\d)/)?.[1] || '2');

                    return (
                      <div
                        key={g.id}
                        onClick={() => { setSelectedGeneration(g); setEditingImage(null); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                          isActive
                            ? 'border-holo-mint bg-holo-mint/5'
                            : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 bg-white dark:bg-teal-mid'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 transition-colors ${isActive ? 'border-holo-mint' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}>
                          {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{gHeadline}</p>
                          {gSubtext && <p className="text-xs opacity-40 truncate mt-0.5">{gSubtext}</p>}
                        </div>

                        {/* Format + mode + creativity */}
                        <div className="hidden sm:flex items-center gap-2 shrink-0">
                          <span className="text-xs opacity-30">{getFormatLabel(g.format)}</span>
                          {isFast && (
                            <span className="flex items-center gap-0.5 text-xs text-holo-yellow">
                              <Zap className="h-3 w-3" /> Szybki
                            </span>
                          )}
                          {gCreativity === 3 && (
                            <span className="text-xs text-holo-aqua">✦ Dynamic</span>
                          )}
                          {gCreativity === 4 && (
                            <span className="text-xs text-holo-lavender">✦✦ Bold</span>
                          )}
                          {gCreativity === 5 && (
                            <span className="text-xs text-holo-pink">✦✦✦ Expressive</span>
                          )}
                        </div>

                        {/* Date */}
                        <span className="hidden md:block text-xs opacity-25 whitespace-nowrap shrink-0">
                          {new Date(g.created_at).toLocaleDateString('pl-PL')}
                        </span>

                        {/* Action buttons */}
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setSelectedGeneration(g);
                              const urls2: string[] = JSON.parse(g.image_urls || '[]');
                              if (urls2[0]) { setEditingImage({ url: urls2[0], generationId: g.id }); setEditInstruction(''); }
                            }}
                            title="Edytuj"
                            className="w-8 h-8 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-holo-mint/50 transition-all"
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteGeneration(g.id)}
                            disabled={deletingId === g.id}
                            title="Usuń"
                            className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 disabled:opacity-20 transition-all"
                          >
                            {deletingId === g.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: GENERUJ — Precision mode ────────────────────────────────────── */}
        {tab === 'generate' && generationMode === 'precision' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6 lg:gap-8 items-start">

              {/* LEFT: Template preview / rendered result */}
              <div className="lg:sticky lg:top-[72px] space-y-3">
                <h2 className="font-black text-base">Podgląd szablonu</h2>
                <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl overflow-hidden">
                  {rendering ? (
                    <div className="aspect-square flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 mx-auto rounded-full bg-holo-lavender/20 flex items-center justify-center">
                          <Loader2 className="h-7 w-7 animate-spin text-holo-lavender" />
                        </div>
                        <p className="text-sm opacity-50">Renderuję grafikę...</p>
                      </div>
                    </div>
                  ) : selectedGeneration ? (
                    <div>
                      {(() => {
                        const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                        return urls.map((u, i) => <img key={i} src={u} alt="Grafika" className="w-full" />);
                      })()}
                      <div className="p-3 flex items-center gap-2 border-t border-teal-deep/10 dark:border-holo-mint/10">
                        <button
                          onClick={() => {
                            const urls: string[] = JSON.parse(selectedGeneration.image_urls || '[]');
                            if (urls[0]) window.open(urls[0], '_blank');
                          }}
                          className="flex-1 h-9 bg-teal-deep/5 dark:bg-teal-deep border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-holo-lavender/10 transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" /> Pobierz
                        </button>
                      </div>
                      <div className="px-4 pb-4 pt-3 space-y-1 border-t border-teal-deep/10 dark:border-holo-mint/10">
                        <p className="text-xs opacity-30"><span className="opacity-60">Tekst:</span> {selectedGeneration.brief}</p>
                        <p className="text-xs opacity-30"><span className="opacity-60">Data:</span> {new Date(selectedGeneration.created_at).toLocaleString('pl-PL')}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {/* Template Editor */}
                      <div className="space-y-3">
                        {/* Saved templates selector */}
                        {savedTemplates.length > 0 && (
                          <div className="flex items-center gap-2">
                            <select
                              onChange={e => { const tid = parseInt(e.target.value); if (tid) loadSavedTemplate(tid); }}
                              className="flex-1 bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-sm outline-none"
                              defaultValue=""
                            >
                              <option value="">Wybierz szablon...</option>
                              {savedTemplates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} {t.is_user_template ? '★' : ''}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Absolute-positioned canvas editor */}
                        {editorBlocks.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs opacity-40">Edytor układu — przeciągnij bloki, złap narożnik/krawędź żeby zmienić rozmiar</p>
                            {/* Canvas */}
                            <div
                              ref={canvasRef}
                              className="relative bg-teal-deep/10 dark:bg-teal-mid/50 rounded-xl border border-teal-deep/15 dark:border-holo-mint/10 select-none"
                              style={{
                                width: '100%',
                                aspectRatio: format === 'story' ? '9/16' : format === 'banner' ? '3/1' : format === 'ln_post' ? '1.91/1' : '1/1',
                              }}
                              onMouseMove={handleCanvasMouseMove}
                              onMouseUp={handleCanvasMouseUp}
                              onMouseLeave={handleCanvasMouseUp}
                            >
                              {[...editorBlocks].sort((a, b) => a.zIndex - b.zIndex).map(block => (
                                <div
                                  key={block.id}
                                  className="absolute rounded group"
                                  style={{
                                    left: `${block.x}%`,
                                    top: `${block.y}%`,
                                    width: `${block.w}%`,
                                    height: `${block.h}%`,
                                    zIndex: block.zIndex,
                                    backgroundColor: (BLOCK_COLORS[block.type] || '#888') + '33',
                                    border: `2px solid ${(BLOCK_COLORS[block.type] || '#888')}99`,
                                    cursor: 'grab',
                                    overflow: 'hidden',
                                  }}
                                  onMouseDown={e => startBlockDrag(e, block)}
                                >
                                  {/* Label */}
                                  <span className="absolute top-0.5 left-1 text-teal-deep dark:text-offwhite font-bold pointer-events-none" style={{ fontSize: '9px' }}>{block.label}</span>
                                  {/* Delete button */}
                                  <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={() => setEditorBlocks(prev => prev.filter(b => b.id !== block.id))}
                                    className="absolute top-0 right-0 w-4 h-4 bg-red-500/80 text-white rounded-bl items-center justify-center hidden group-hover:flex"
                                    style={{ fontSize: '10px', lineHeight: 1 }}
                                  >×</button>
                                  {/* Resize handle SE */}
                                  <div
                                    className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
                                    style={{ background: (BLOCK_COLORS[block.type] || '#888') + 'cc' }}
                                    onMouseDown={e => startBlockResize(e, block, 'se')}
                                  />
                                  {/* Resize handle E */}
                                  <div
                                    className="absolute top-[25%] right-0 w-2 h-[50%] cursor-e-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '2px 0 0 2px' }}
                                    onMouseDown={e => startBlockResize(e, block, 'e')}
                                  />
                                  {/* Resize handle S */}
                                  <div
                                    className="absolute bottom-0 left-[25%] h-2 w-[50%] cursor-s-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '2px 2px 0 0' }}
                                    onMouseDown={e => startBlockResize(e, block, 's')}
                                  />
                                  {/* Resize handle N */}
                                  <div
                                    className="absolute top-0 left-[25%] h-2 w-[50%] cursor-n-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '0 0 2px 2px' }}
                                    onMouseDown={e => startBlockResize(e, block, 'n')}
                                  />
                                  {/* Resize handle W */}
                                  <div
                                    className="absolute top-[25%] left-0 w-2 h-[50%] cursor-w-resize opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: (BLOCK_COLORS[block.type] || '#888') + '88', borderRadius: '0 2px 2px 0' }}
                                    onMouseDown={e => startBlockResize(e, block, 'w')}
                                  />
                                </div>
                              ))}
                            </div>

                            {/* Add block dropdown */}
                            <select
                              onChange={e => {
                                const type = e.target.value;
                                if (!type) return;
                                e.target.value = '';
                                const def = DEFAULT_BLOCK_POS[type] || { x: 5, y: 5, w: 90, h: 20 };
                                const maxZ = Math.max(1, ...editorBlocks.map(b => b.zIndex));
                                setEditorBlocks(prev => [...prev, {
                                  id: `${type}-${Date.now()}`,
                                  type,
                                  label: BLOCK_LABELS[type] || type,
                                  required: type === 'logo' || type === 'headline',
                                  ...def,
                                  zIndex: maxZ + 1,
                                  children: [{ type }],
                                  flexDirection: 'column',
                                  justifyContent: 'center',
                                  alignItems: 'flex-start',
                                }]);
                              }}
                              className="w-full bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-xs outline-none"
                              defaultValue=""
                            >
                              <option value="">+ Dodaj blok...</option>
                              {BLOCK_TYPES.filter(t => !editorBlocks.some(b => b.type === t && t !== 'spacer')).map(t => (
                                <option key={t} value={t}>{BLOCK_LABELS[t]}</option>
                              ))}
                            </select>

                            {/* Save template */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                className="flex-1 bg-offwhite dark:bg-teal-deep border border-teal-deep/15 dark:border-holo-mint/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-holo-mint"
                                placeholder="Nazwa szablonu..."
                                value={editorTemplateName}
                                onChange={e => setEditorTemplateName(e.target.value)}
                              />
                              <button
                                onClick={saveEditorTemplate}
                                disabled={savingEditorTemplate || !editorTemplateName.trim()}
                                className="h-9 px-3 rounded-xl bg-holo-mint/20 border border-holo-mint/30 text-holo-mint text-xs font-semibold disabled:opacity-40 hover:bg-holo-mint/30 transition-colors whitespace-nowrap"
                              >
                                {savingEditorTemplate ? '...' : 'Zapisz'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-teal-deep/20 dark:border-holo-mint/15 p-8 text-center">
                            <p className="text-xs opacity-30">Wygeneruj lub załaduj szablon żeby edytować układ</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={generateTemplate}
                  disabled={generatingTemplate || brandSections.length === 0}
                  className="w-full h-10 rounded-full border border-holo-lavender/30 text-holo-lavender text-sm font-bold disabled:opacity-40 hover:bg-holo-lavender/10 transition-all flex items-center justify-center gap-2"
                >
                  {generatingTemplate
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję szablon...</>
                    : <><Wand2 className="h-4 w-4" /> Generuj template z brand sections</>
                  }
                </button>
              </div>

              {/* RIGHT: Precision form */}
              <div className="space-y-4">
                <h2 className="font-black text-base flex items-center gap-2">
                  <span className="text-holo-lavender text-sm font-black px-2 py-0.5 border border-holo-lavender/30 rounded-full">🎯 Precision</span>
                  Nowa grafika
                </h2>

                {/* Format */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                  <div className="grid grid-cols-2 gap-2">
                    {FORMATS.map(f => (
                      <button key={f.value} onClick={() => setFormat(f.value)}
                        className={`p-3 rounded-xl text-left border text-sm transition-all ${format === f.value ? 'border-holo-lavender bg-holo-lavender/10 text-holo-lavender' : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'}`}
                      >
                        <div className="font-bold text-xs">{f.label}</div>
                        <div className="text-xs opacity-50 mt-0.5">{f.size}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Headline */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst główny *</label>
                  <textarea className={`${inputCls} resize-none font-mono`} rows={2}
                    placeholder="np. 23 marca, Warszawa" value={headline} onChange={e => setHeadline(e.target.value)} />
                </div>

                {/* Subtext */}
                <div>
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst dodatkowy</label>
                  <textarea className={`${inputCls} resize-none font-mono`} rows={2}
                    placeholder="np. Zapisz się teraz →" value={subtext} onChange={e => setSubtext(e.target.value)} />
                </div>

                {/* CTA / Legal / Sticker */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">CTA (opcjonalnie)</label>
                    <input type="text" className={inputCls} placeholder="np. Kup na play.pl"
                      value={ctaText} onChange={e => setCtaText(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Tekst prawny (opcjonalnie)</label>
                    <input type="text" className={inputCls} placeholder="np. *Oferta ważna do 31.03. Szczegóły na play.pl"
                      value={legalText} onChange={e => setLegalText(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Sticker/Patka (opcjonalnie)</label>
                    <input type="text" className={inputCls} placeholder="np. NOWOŚĆ" value={stickerText} onChange={e => setStickerText(e.target.value)} />
                  </div>
                </div>

                {/* Central element */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Element centralny (opcjonalnie)</label>
                  {centralImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10">
                      <img src={centralImageUrl} alt="Element" className="w-full aspect-square object-contain bg-teal-deep/5 dark:bg-teal-deep/30" />
                      <button
                        onClick={() => setCentralImageUrl(null)}
                        className="absolute top-2 right-2 w-7 h-7 bg-zinc-900/80 hover:bg-red-900/50 text-zinc-400 hover:text-red-400 rounded-full flex items-center justify-center text-xs"
                      >×</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea
                        className={`${inputCls} resize-none`}
                        rows={3}
                        placeholder="Opisz element centralny, np.: Samsung Galaxy A56 5G, dynamic angle, professional product photo..."
                        value={centralPrompt}
                        onChange={e => setCentralPrompt(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <label className="flex-1 h-10 bg-teal-deep/5 dark:bg-teal-mid hover:bg-teal-deep/10 border border-teal-deep/10 dark:border-holo-mint/10 text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors">
                          <Upload className="h-4 w-4" /> Wgraj obraz
                          <input type="file" accept="image/*" className="hidden" onChange={handleCentralImageUpload} />
                        </label>
                        <button
                          onClick={generateCentralElement}
                          disabled={generatingElement || !centralPrompt}
                          className="flex-1 h-10 bg-holo-lavender/10 hover:bg-holo-lavender/20 text-holo-lavender border border-holo-lavender/30 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
                        >
                          {generatingElement
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generuję...</>
                            : <><Wand2 className="h-4 w-4" /> Generuj AI</>
                          }
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Render CTA */}
                <button onClick={renderPrecision} disabled={rendering || !headline || (!precisionTemplate && editorBlocks.length === 0)}
                  className="w-full h-12 rounded-full bg-holo-lavender text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
                >
                  {rendering
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Renderuję...</>
                    : <><Image className="h-4 w-4" /> Renderuj grafikę</>
                  }
                </button>
                {!precisionTemplate && (
                  <p className="text-xs opacity-30 text-center">Najpierw wygeneruj szablon klikając przycisk po lewej</p>
                )}
              </div>
            </div>

            {/* Historia (shared) */}
            {generations.length > 0 && (
              <div>
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide mb-3">Historia ({generations.length})</p>
                <div className="space-y-1.5">
                  {generations.map(g => {
                    const urls: string[] = JSON.parse(g.image_urls || '[]');
                    const isActive = selectedGeneration?.id === g.id;
                    const isPrecision = g.format === 'precision';
                    return (
                      <div key={g.id} onClick={() => { setSelectedGeneration(g); }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${isActive ? 'border-holo-lavender bg-holo-lavender/5' : 'border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-lavender/30 bg-white dark:bg-teal-mid'}`}
                      >
                        <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 ${isActive ? 'border-holo-lavender' : 'border-teal-deep/10 dark:border-holo-mint/10'}`}>
                          {urls[0] && <img src={urls[0]} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{g.brief || '—'}</p>
                          {isPrecision && <span className="text-xs text-holo-lavender">🎯 Precision</span>}
                        </div>
                        <span className="hidden md:block text-xs opacity-25 whitespace-nowrap shrink-0">
                          {new Date(g.created_at).toLocaleDateString('pl-PL')}
                        </span>
                        <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => deleteGeneration(g.id)} disabled={deletingId === g.id}
                            className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 disabled:opacity-20 transition-all">
                            {deletingId === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ASSETS ──────────────────────────────────────────────────────── */}
        {tab === 'assets' && (
          <div className="max-w-2xl space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black text-base">Biblioteka assetów</h2>
              <button
                onClick={() => setAssetUploadOpen(v => !v)}
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
                    <select value={assetUploadType} onChange={e => setAssetUploadType(e.target.value as typeof assetUploadType)}
                      className={inputCls}>
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
                      <select value={assetUploadVariant} onChange={e => setAssetUploadVariant(e.target.value)} className={inputCls}>
                        <option value="default">Domyślne</option>
                        <option value="dark-bg">Na ciemne tło</option>
                        <option value="light-bg">Na jasne tło</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs opacity-50 mb-1 block">Nazwa (opcjonalnie)</label>
                  <input type="text" className={inputCls} placeholder="np. Blob fioletowy, Sticker SALE…"
                    value={assetUploadName} onChange={e => setAssetUploadName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs opacity-50 mb-1 block">Opis (opcjonalnie — AI go użyje)</label>
                  <textarea className={`${inputCls} resize-none`} rows={2}
                    placeholder="np. Blob dekoracyjny fioletowy, używać w prawym górnym rogu grafiki"
                    value={assetUploadDescription} onChange={e => setAssetUploadDescription(e.target.value)} />
                </div>
                <label className={`flex items-center justify-center gap-2 h-12 rounded-xl border-2 border-dashed border-holo-mint/30 cursor-pointer hover:border-holo-mint/60 transition-colors font-semibold text-sm ${uploadingAsset ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingAsset ? <><Loader2 className="h-4 w-4 animate-spin" /> Wgrywam...</> : <><Upload className="h-4 w-4" /> Wybierz plik i wgraj</>}
                  <input type="file" accept="image/*,application/pdf,.svg" className="hidden" onChange={uploadAsset} disabled={uploadingAsset} />
                </label>
              </div>
            )}

            {/* LOGO section */}
            {(() => {
              const logos = assets.filter(a => a.type === 'logo');
              return (
                <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-wide">Logo ({logos.length})</p>
                  {logos.length === 0 && <p className="text-xs opacity-30">Brak logo — dodaj wariant</p>}
                  <div className="space-y-2">
                    {logos.map(a => (
                      <div key={a.id} className="flex items-center gap-3">
                        <div className="w-16 h-10 rounded-lg bg-teal-deep/5 dark:bg-teal-deep/30 border border-teal-deep/10 dark:border-holo-mint/10 flex items-center justify-center overflow-hidden shrink-0">
                          <img src={a.url} className="max-w-full max-h-full object-contain" alt={a.filename} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{a.filename}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-holo-mint/10 text-holo-mint">{a.variant || 'default'}</span>
                        </div>
                        <button className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                          onClick={() => { fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' }).then(() => setAssets(prev => prev.filter(x => x.id !== a.id))); }}>
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
              const elements = assets.filter(a => a.type === 'brand-element');
              return (
                <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-wide">Elementy graficzne ({elements.length})</p>
                  {elements.length === 0 && <p className="text-xs opacity-30">Brak elementów — dodaj bloba, sticker, ikonę, teksturę…</p>}
                  <div className="grid grid-cols-2 gap-2">
                    {elements.map(a => (
                      <div key={a.id} className="flex items-center gap-2 p-2 rounded-xl border border-teal-deep/10 dark:border-holo-mint/10">
                        <div className="w-12 h-12 rounded-lg bg-teal-deep/5 dark:bg-teal-deep/30 border border-teal-deep/10 dark:border-holo-mint/10 flex items-center justify-center overflow-hidden shrink-0">
                          <img src={a.url} className="max-w-full max-h-full object-contain" alt={a.filename} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{a.filename}</p>
                          {a.description && <p className="text-xs opacity-40 truncate">{a.description}</p>}
                        </div>
                        <button className="w-7 h-7 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all shrink-0"
                          onClick={() => { fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' }).then(() => setAssets(prev => prev.filter(x => x.id !== a.id))); }}>
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
              const photos = assets.filter(a => a.type === 'photo');
              return (
                <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-wide">Zdjęcia / Packshoты ({photos.length})</p>
                  {photos.length === 0 && <p className="text-xs opacity-30">Brak zdjęć — dodaj packshot, lifestyle photo…</p>}
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map(a => (
                      <div key={a.id} className="relative aspect-square rounded-xl overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 group">
                        <img src={a.url} className="w-full h-full object-cover" alt={a.filename} />
                        <div className="absolute inset-0 bg-teal-deep/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-2">
                          <p className="text-white text-xs font-semibold text-center truncate w-full">{a.filename}</p>
                          <button className="w-7 h-7 rounded-full bg-red-500/80 flex items-center justify-center text-white"
                            onClick={() => { fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' }).then(() => setAssets(prev => prev.filter(x => x.id !== a.id))); }}>
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
              const brandbook = assets.find(a => a.type === 'brandbook');
              const refs = assets.filter(a => a.type === 'reference');
              return (
                <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
                  <p className="text-xs font-bold opacity-40 uppercase tracking-wide">Brandbook & Referencje</p>
                  {brandbook ? (
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{brandbook.filename}</p>
                        <p className="text-xs opacity-40">Brandbook PDF</p>
                      </div>
                      <button className="w-8 h-8 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:text-red-400 transition-all"
                        onClick={() => { fetch(`/api/projects/${id}/assets?assetId=${brandbook.id}`, { method: 'DELETE' }).then(() => setAssets(prev => prev.filter(x => x.id !== brandbook.id))); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs opacity-30">Brak brandbooka — użyj Kontekst marki do analizy grafik referencyjnych</p>
                  )}
                  {refs.length > 0 && (
                    <div>
                      <p className="text-xs opacity-40 mb-2">Referencje ({refs.length}/5)</p>
                      <div className="grid grid-cols-5 gap-1.5">
                        {refs.map(a => (
                          <div key={a.id} className="relative aspect-square rounded-lg overflow-hidden border border-teal-deep/10 dark:border-holo-mint/10 group">
                            <img src={a.url} className="w-full h-full object-cover" alt={a.filename} />
                            <button className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500/80 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => { fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' }).then(() => setAssets(prev => prev.filter(x => x.id !== a.id))); }}>
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
        )}

        {/* ── TAB: BRAND SETTINGS ──────────────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="max-w-xl space-y-5">
            <h2 className="font-black text-base">Kontekst marki</h2>

            {/* ANALIZA MARKI — trigger */}
            <div className="rounded-2xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="text-sm font-bold">
                    {brandSections.length > 0 ? `✅ Analiza marki — ${brandSections.length} sekcji` : '🔍 Analiza marki'}
                  </p>
                  <p className="text-xs opacity-40 mt-0.5">Wgraj brandbook lub analizuj z grafik referencyjnych</p>
                </div>
                <button
                  onClick={analyzeBrand}
                  disabled={analyzing || references.length === 0}
                  className="h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  {analyzing
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</>
                    : <><Wand2 className="h-3 w-3" /> Analizuj z referencji</>
                  }
                </button>
              </div>

              {analysisStale && (
                <div className="flex items-center gap-2 text-xs text-holo-yellow bg-holo-yellow/10 px-3 py-2 rounded-xl">
                  <span>⚠️</span>
                  <span>Referencje zmieniły się od ostatniej analizy — rozważ ponowną analizę</span>
                </div>
              )}

              {/* Brandbook */}
              <div className="border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wide">Brandbook (PDF)</p>
                  <label className="cursor-pointer h-7 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100 shrink-0">
                    <Upload className="h-3 w-3" />
                    {brandbookAsset ? 'Zmień' : 'Wgraj PDF'}
                    <input type="file" accept="application/pdf" className="hidden" onChange={handleBrandbookUpload} />
                  </label>
                </div>
                {brandbookAsset ? (
                  <div className="flex items-center justify-between bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2">
                    <span className="text-xs opacity-60 truncate">📄 {brandbookAsset.filename}</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={analyzeFromBrandbook}
                        disabled={analyzing}
                        className="h-7 px-3 rounded-full bg-holo-mint text-teal-deep disabled:opacity-50 text-xs font-bold flex items-center gap-1 hover:opacity-90 transition-opacity"
                      >
                        {analyzing ? <><Loader2 className="h-3 w-3 animate-spin" /> Analizuję...</> : <><Wand2 className="h-3 w-3" /> Analizuj brandbook</>}
                      </button>
                      <button onClick={deleteBrandbook} className="h-7 w-7 rounded-full border border-red-500/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-red-500/50 hover:text-red-400 transition-all text-sm">×</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs opacity-30">Wgraj brandbook — AI wyciągnie z niego kolory, fonty i zasady automatycznie</p>
                )}
              </div>
            </div>

            {/* SEKCJE MARKI */}
            {brandSections.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold opacity-30 uppercase tracking-wide">Sekcje marki ({brandSections.length})</p>
                {[...brandSections].sort((a, b) => a.order - b.order).map(section => (
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
                            {section.type === 'custom' && (
                              <span className="text-xs bg-holo-peach/20 text-holo-peach px-1.5 py-0.5 rounded-full">auto</span>
                            )}
                          </div>
                          {editingSectionId !== section.id && (
                            <p className="text-xs opacity-50 mt-0.5 line-clamp-2">{section.content}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => { setEditingSectionId(section.id); setEditingSectionContent(section.content); }}
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
            )}

            {/* TON & GŁOS MARKI */}
            <div className="rounded-2xl border border-teal-deep/15 dark:border-holo-mint/15 bg-white dark:bg-teal-mid p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold">Ton & głos marki</p>
                  <p className="text-xs opacity-40 mt-0.5">Jak marka mówi — styl, emocje, słownictwo</p>
                </div>
                <button
                  onClick={generateTov}
                  disabled={generatingTov || brandSections.length === 0}
                  className="shrink-0 h-8 px-3 rounded-full border border-holo-mint/30 text-holo-mint text-xs font-semibold flex items-center gap-1.5 hover:bg-holo-mint/10 disabled:opacity-40 transition-colors"
                >
                  {generatingTov ? <><Loader2 className="h-3 w-3 animate-spin" /> Generuję...</> : <><Wand2 className="h-3 w-3" /> Wygeneruj z analizy →</>}
                </button>
              </div>
              <textarea
                className="w-full bg-offwhite dark:bg-teal-deep text-teal-deep dark:text-offwhite border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint rounded-xl px-4 py-3 text-sm resize-none outline-none transition-colors"
                rows={4}
                placeholder="Opisz ton komunikacji marki — np. 'Profesjonalny, ale ciepły. Unikamy technicznego żargonu...'"
                value={toneOfVoice}
                onChange={e => setToneOfVoice(e.target.value)}
                onBlur={e => saveTov(e.target.value)}
              />
              {savingTov && <p className="text-xs opacity-30">Zapisuję...</p>}
            </div>

            {/* ZASADY OBOWIĄZKOWE */}
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

            {/* LOGO */}
            <div className="pt-5 border-t border-teal-deep/10 dark:border-holo-mint/10">
              <h3 className="font-bold text-sm mb-0.5">Logo</h3>
              <p className="text-xs opacity-40 mb-3">Gemini nie obsługuje SVG — wgraj PNG lub JPG</p>
              <div className="flex items-center gap-3">
                {project.logo_url && !project.logo_url.endsWith('.svg') && (
                  <img src={project.logo_url} alt="logo" className="h-12 w-auto rounded-xl border border-teal-deep/10 dark:border-holo-mint/10 bg-white p-1" />
                )}
                <label className="cursor-pointer h-9 px-4 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold flex items-center gap-2 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100">
                  <Upload className="h-4 w-4" />
                  {project.logo_url ? 'Zmień logo' : 'Wgraj logo'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !id) return;
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('type', 'logo');
                    const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
                    if (res.ok) {
                      const asset = await res.json();
                      setProject(p => p ? { ...p, logo_url: asset.url } : p);
                      setAssets(prev => [...prev.filter(a => a.type !== 'logo'), asset]);
                    }
                  }} />
                </label>
              </div>
            </div>

            {/* GRAFIKI REFERENCYJNE */}
            <div className="pt-5 border-t border-teal-deep/10 dark:border-holo-mint/10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-bold text-sm">Grafiki referencyjne</h3>
                  <p className="text-xs opacity-40">{references.length}/5 — wgraj 2–4 posty marki do analizy stylu</p>
                </div>
                {references.length < 5 && (
                  <label className="cursor-pointer h-8 px-3 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-xs font-semibold flex items-center gap-1.5 hover:border-holo-mint/50 transition-colors opacity-70 hover:opacity-100">
                    <Upload className="h-3 w-3" /> Dodaj
                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                      const files = Array.from(e.target.files || []).slice(0, 5 - references.length);
                      for (const file of files) {
                        if (!id) continue;
                        const fd = new FormData();
                        fd.append('file', file);
                        fd.append('type', 'reference');
                        const res = await fetch(`/api/projects/${id}/assets`, { method: 'POST', body: fd });
                        if (res.ok) {
                          const asset = await res.json();
                          setAssets(prev => [...prev, asset]);
                        }
                      }
                    }} />
                  </label>
                )}
              </div>
              {references.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {references.map(a => (
                    <div key={a.id} className="relative group">
                      <img src={a.url} alt={a.filename} className="w-full aspect-square object-cover rounded-xl border border-teal-deep/10 dark:border-holo-mint/10" />
                      <button
                        onClick={async () => {
                          if (!id) return;
                          await fetch(`/api/projects/${id}/assets?assetId=${a.id}`, { method: 'DELETE' });
                          setAssets(prev => prev.filter(x => x.id !== a.id));
                        }}
                        className="absolute top-1 right-1 bg-red-500/80 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                      >×</button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm opacity-30">Brak referencji — wgraj przykładowe posty marki.</p>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: COPYWRITER ───────────────────────────────────────────────────── */}
        {tab === 'copy' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column: Input */}
            <div className="space-y-4">
              <h2 className="font-black text-base">Brief do copy</h2>

              {/* Upload file */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  Wgraj brief (DOCX, TXT, PDF)
                </label>
                <label className="cursor-pointer w-full h-20 border-2 border-dashed border-teal-deep/10 dark:border-holo-mint/10 hover:border-holo-mint/30 rounded-xl flex flex-col items-center justify-center gap-1 text-sm transition-colors">
                  <Upload className="h-5 w-5 opacity-50" />
                  <span className="opacity-50">Przeciągnij plik lub kliknij</span>
                  <input
                    type="file"
                    accept=".docx,.txt,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleCopyFileUpload}
                  />
                </label>
                {copyFile && <p className="text-xs opacity-50 mt-1">📄 {copyFile.name}</p>}
              </div>

              {/* OR: textarea */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">
                  lub wklej brief tekstem
                </label>
                <textarea
                  className={`${inputCls} resize-none`}
                  rows={6}
                  placeholder="Wklej treść briefu, opisu kampanii lub notatki..."
                  value={copyBrief}
                  onChange={e => setCopyBrief(e.target.value)}
                />
              </div>

              {/* Format */}
              <div>
                <label className="text-xs font-semibold opacity-50 mb-1.5 block uppercase tracking-wide">Format</label>
                <div className="grid grid-cols-2 gap-2">
                  {['facebook', 'linkedin', 'instagram', 'ogólny'].map(f => (
                    <button
                      key={f}
                      onClick={() => setCopyFormat(f)}
                      className={`p-2 rounded-xl text-sm border transition-all ${
                        copyFormat === f
                          ? 'border-holo-mint bg-holo-mint/10 text-holo-mint'
                          : 'border-teal-deep/10 dark:border-holo-mint/10 bg-white dark:bg-teal-mid opacity-60 hover:opacity-100'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              <button
                onClick={generateCopy}
                disabled={generatingCopy || (!copyFile && !copyBrief)}
                className="w-full h-12 rounded-full holo-gradient text-teal-deep font-black disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm"
              >
                {generatingCopy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Piszę copy...</>
                  : <><PenLine className="h-4 w-4" /> Napisz copy</>
                }
              </button>
            </div>

            {/* Right column: Results */}
            <div className="space-y-3">
              <h2 className="font-black text-base">Wyniki ({copyResults.length})</h2>
              {copyResults.length === 0 ? (
                <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-2xl p-8 text-center">
                  <div className="text-4xl mb-3">✍️</div>
                  <p className="text-sm opacity-30">Wygenerowane warianty pojawią się tutaj</p>
                </div>
              ) : (
                <>
                  {/* Concept */}
                  {copyConcept && (
                    <div className="bg-holo-mint/5 border border-holo-mint/20 rounded-xl p-4 space-y-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-holo-mint opacity-70">Koncept</p>
                      <p className="text-sm opacity-80">{copyConcept}</p>
                    </div>
                  )}

                  {/* Creative brief */}
                  {copyCreativeBrief && (
                    <div className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-xl p-4 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide opacity-40">Brief dla grafika</p>
                      <p className="text-sm opacity-70">{copyCreativeBrief}</p>
                      <button
                        onClick={() => setBrief(copyCreativeBrief)}
                        className="h-7 px-3 rounded-full bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/10 dark:border-holo-mint/10 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Layers className="h-3 w-3" /> Użyj jako creative brief
                      </button>
                    </div>
                  )}

                  {/* Variants */}
                  {copyResults.map((r, i) => (
                    <div
                      key={i}
                      className="bg-white dark:bg-teal-mid border border-teal-deep/10 dark:border-holo-mint/10 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold bg-teal-deep/10 dark:bg-teal-deep px-2 py-0.5 rounded-full">Wariant {i + 1}</span>
                      </div>
                      <p className="font-mono text-sm font-semibold">{r.headline}</p>
                      {r.subtext && <p className="text-sm opacity-60">{r.subtext}</p>}
                      {r.cta && <p className="text-xs text-holo-mint font-medium">CTA: {r.cta}</p>}
                      {r.rationale && <p className="text-xs opacity-40 italic border-t border-teal-deep/10 dark:border-holo-mint/10 pt-2 mt-1">{r.rationale}</p>}
                      <button
                        onClick={() => useCopyInGenerator(r, copyCreativeBrief)}
                        className="w-full h-8 bg-teal-deep/5 dark:bg-teal-deep hover:bg-holo-mint/20 hover:border-holo-mint border border-teal-deep/10 dark:border-holo-mint/10 rounded-full text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Wand2 className="h-3 w-3" /> Użyj w generatorze
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Edytuj projekt ───────────────────────────────────────────── */}
      {editProjectOpen && (
        <div className="fixed inset-0 bg-teal-deep/60 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-teal-mid border border-teal-deep/15 dark:border-holo-mint/15 rounded-2xl w-full max-w-md shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-teal-deep/10 dark:border-holo-mint/10">
              <h2 className="text-base font-black">Ustawienia projektu</h2>
              <button onClick={() => setEditProjectOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center opacity-40 hover:opacity-100 hover:bg-teal-deep/10 transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Fields */}
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1.5">Nazwa projektu *</label>
                <input
                  type="text"
                  className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1.5">Klient</label>
                <input
                  type="text"
                  className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors"
                  placeholder="Opcjonalnie"
                  value={editClientName}
                  onChange={e => setEditClientName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold opacity-50 uppercase tracking-wide block mb-1.5">Opis projektu</label>
                <textarea
                  className="w-full bg-offwhite dark:bg-teal-deep rounded-xl px-3 py-2.5 text-sm border border-teal-deep/15 dark:border-holo-mint/10 focus:border-holo-mint outline-none transition-colors resize-none"
                  rows={3}
                  placeholder="Krótki opis, cel projektu, notatki..."
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-5 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() => setEditProjectOpen(false)}
                  className="flex-1 h-10 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold opacity-50 hover:opacity-100 transition-opacity"
                >
                  Anuluj
                </button>
                <button
                  onClick={saveProjectMeta}
                  disabled={savingProject || !editName.trim()}
                  className="flex-1 h-10 rounded-full holo-gradient text-teal-deep text-sm font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  {savingProject ? 'Zapisuję...' : 'Zapisz'}
                </button>
              </div>

              {/* Divider */}
              <div className="border-t border-teal-deep/10 dark:border-holo-mint/10 pt-3 space-y-2">
                <button
                  onClick={toggleArchive}
                  className="w-full h-9 rounded-full border border-teal-deep/15 dark:border-holo-mint/15 text-sm font-semibold flex items-center justify-center gap-2 opacity-60 hover:opacity-100 hover:border-holo-mint/50 transition-all"
                >
                  <Archive className="h-4 w-4" />
                  {project?.archived ? 'Przywróć projekt' : 'Archiwizuj projekt'}
                </button>
                <button
                  onClick={deleteProject}
                  disabled={deletingProject}
                  className="w-full h-9 rounded-full border border-red-500/30 text-red-400 text-sm font-semibold flex items-center justify-center gap-2 opacity-60 hover:opacity-100 hover:border-red-500/60 hover:bg-red-500/5 disabled:opacity-30 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingProject ? 'Usuwam...' : 'Usuń projekt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
