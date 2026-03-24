import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export const BrandService = {
  async get() {
    const [project] = await getDb()`SELECT * FROM projects WHERE id = ${BRAND_ID}`;
    return project;
  },

  async getWithAssets() {
    const [project] = await getDb()`SELECT * FROM projects WHERE id = ${BRAND_ID}`;
    if (!project) return null;
    const assets = await getDb()`SELECT * FROM brand_assets WHERE project_id = ${BRAND_ID} ORDER BY created_at ASC`;
    const generations = await getDb()`SELECT * FROM generations WHERE project_id = ${BRAND_ID} ORDER BY created_at DESC`;
    return { project, assets, generations };
  },

  async update(fields: Record<string, unknown>) {
    const {
      name, clientName, description, styleDescription, typographyNotes,
      colorPalette, logoUrl, brandRules, brandAnalysis, toneOfVoice,
      logoPosition,
    } = fields;

    const rows = await getDb()`
      UPDATE projects SET
        name = COALESCE(${(name as string) ?? null}, name),
        client_name = COALESCE(${(clientName as string) ?? null}, client_name),
        style_description = COALESCE(${(styleDescription as string) ?? null}, style_description),
        typography_notes = COALESCE(${(typographyNotes as string) ?? null}, typography_notes),
        color_palette = COALESCE(${(colorPalette as string) ?? null}, color_palette),
        brand_rules = COALESCE(${(brandRules as string) ?? null}, brand_rules),
        brand_analysis = COALESCE(${(brandAnalysis as string) ?? null}, brand_analysis),
        logo_url = COALESCE(${(logoUrl as string) ?? null}, logo_url),
        tone_of_voice = COALESCE(${(toneOfVoice as string) ?? null}, tone_of_voice),
        description = COALESCE(${(description as string) ?? null}, description),
        logo_position = COALESCE(${(logoPosition as string) ?? null}, logo_position),
        updated_at = NOW()
      WHERE id = ${BRAND_ID} RETURNING *
    `;
    return rows[0];
  },

  async updateSections(sections: unknown[]) {
    await getDb()`UPDATE projects SET brand_sections = ${JSON.stringify(sections)}::jsonb, updated_at = NOW() WHERE id = ${BRAND_ID}`;
  },

  async updateSectionContent(sectionId: string, content: string) {
    const [proj] = await getDb()`SELECT brand_sections FROM projects WHERE id = ${BRAND_ID}`;
    const sections = (proj?.brand_sections || []) as Array<{ id: string; [key: string]: unknown }>;
    const updated = sections.map(s => s.id === sectionId ? { ...s, content } : s);
    await getDb()`UPDATE projects SET brand_sections = ${JSON.stringify(updated)}::jsonb, updated_at = NOW() WHERE id = ${BRAND_ID}`;
  },

  async setGenerationMode(mode: string) {
    await getDb()`UPDATE projects SET generation_mode = ${mode}, updated_at = NOW() WHERE id = ${BRAND_ID}`;
  },

  async setVoiceCard(voiceCard: unknown) {
    await getDb()`UPDATE projects SET voice_card = ${JSON.stringify(voiceCard)}::jsonb WHERE id = ${BRAND_ID}`;
  },

  async clearVoiceCard() {
    await getDb()`UPDATE projects SET voice_card = NULL WHERE id = ${BRAND_ID}`;
  },

  async getBrandContext(): Promise<string> {
    const project = await this.get();
    if (!project) return '';
    const sections = (project.brand_sections || []) as Array<{ title: string; content: string; order: number }>;
    if (sections.length > 0) {
      return [...sections]
        .sort((a, b) => a.order - b.order)
        .map(s => `[${s.title.toUpperCase()}]\n${s.content}`)
        .join('\n\n');
    }
    return (project.brand_analysis as string) || '';
  },
};
