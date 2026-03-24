export interface BrandScanData {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  visualStyle: string;
  toneOfVoice: string;
  brandKeywords: string[];
  industry: string;
  brandName: string;
  brandDescription: string;
  fonts: string[];
  headingFont: string;
  bodyFont: string;
  brandValues: string[];
  ctaExamples: string[];
  photoStyle: string;
  targetAudience: string;
  logoUrl: string;
  faviconUrl: string;
  socialLinks?: { facebook?: string; instagram?: string; linkedin?: string; tiktok?: string; youtube?: string };
  socialMediaAnalysis?: {
    tone?: string;
    languageStyle?: string;
    commonTopics?: string[];
    ctaStyle?: string;
    postingPatterns?: string;
  } | null;
  scannedUrl: string;
  scannedAt: string;
}

export interface VoiceCard {
  brand_name?: string;
  voice_summary?: string;
  archetype?: string;
  dimensions?: {
    formality?: { score: number; description: string };
    warmth?: { score: number; description: string };
    humor?: { score: number; description: string };
    authority?: { score: number; description: string };
    directness?: { score: number; description: string };
  };
  sentence_style?: { avg_length?: string; structure?: string; rhythm?: string; fragments_ok?: boolean; questions_frequency?: string };
  vocabulary?: { signature_phrases?: string[]; power_words?: string[]; forbidden_words?: string[]; jargon_level?: string; english_mixing?: string };
  emoji_usage?: { frequency?: string; function?: string; preferred_emoji?: string[]; emoji_rules?: string };
  person_address?: { self_reference?: string; audience_address?: string; name_usage?: string };
  structure_patterns?: { opening_style?: string; closing_style?: string; paragraph_density?: string; emphasis_tools?: string[] };
  persuasion?: { primary_method?: string; qualifier_usage?: string; directness_level?: string };
  taboos?: string[];
  golden_rules?: string[];
  example_good?: string[];
  example_bad?: string[];
}

export interface Project {
  brand_analysis?: string | null;
  brand_rules?: string | null;
  generation_mode?: string | null;
  brand_scan_data?: BrandScanData | null;
  scanned_url?: string | null;
  logo_position?: string | null;
  voice_card?: VoiceCard | null;
  industry_rules?: IndustryRules | null;
  id: number;
  name: string;
  client_name: string | null;
  description?: string | null;
  logo_url: string | null;
  style_description: string | null;
  typography_notes: string | null;
  color_palette: string | null;
  updated_at: string | null;
}

export interface PrecisionTemplate {
  id?: number;
  name?: string;
  format?: string;
  width?: number;
  height?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: Record<string, any>;
}

export interface IndustryRules {
  banned_cliches: string[];
  banned_marketing_words: string[];
  photo_brief_types: string[];
  language_notes: string;
  generated_at: string;
}

export interface Generation {
  id: number;
  brief: string;
  format: string;
  image_urls: string;
  prompt: string;
  status: string;
  created_at: string;
}

export interface CopyGeneration {
  id: number;
  task: string;
  format: string;
  visual_type: string;
  prompt: string;
  concept: string;
  variants: CopyVariant[];
  selected_variant: number | null;
  created_at: string;
}

export interface CopyVariant {
  post_copy: string;
  visual_brief: string;
  headline: string;
  subtext: string;
  cta?: string;
  rationale?: string;
}

export interface BrandAsset {
  id: number;
  type: string;
  url: string;
  filename: string;
  variant?: string;
  description?: string;
  mime_type?: string;
  is_featured?: boolean;
  created_at: string;
}

export interface BrandSection {
  id: string;
  title: string;
  content: string;
  type: 'standard' | 'custom';
  order: number;
  icon?: string;
  source?: 'brandbook' | 'references' | 'brand_scan' | 'manual';
  confidence?: 'high' | 'medium' | 'auto';
}

export interface SavedTemplate {
  id: number;
  name: string;
  format: string;
  is_user_template: boolean;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout?: Record<string, any>;
}

export interface EditorBlock {
  id: string;
  type: string;
  label: string;
  required: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  children: Array<{ type: string }>;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: number;
}
