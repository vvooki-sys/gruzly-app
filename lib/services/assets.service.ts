import { getDb } from '@/lib/db';
import { BRAND_ID } from '@/lib/constants';

export const AssetsService = {
  async getAll() {
    return await getDb()`SELECT * FROM brand_assets WHERE project_id = ${BRAND_ID} ORDER BY created_at ASC`;
  },

  async getByType(type: string) {
    return await getDb()`SELECT * FROM brand_assets WHERE project_id = ${BRAND_ID} AND type = ${type} ORDER BY created_at ASC`;
  },

  async getLogos() {
    return await getDb()`SELECT * FROM brand_assets WHERE project_id = ${BRAND_ID} AND type = 'logo' ORDER BY created_at ASC`;
  },

  async getFeatured() {
    return await getDb()`SELECT * FROM brand_assets WHERE project_id = ${BRAND_ID} AND is_featured = true ORDER BY created_at ASC`;
  },

  async getCountByType(type: string): Promise<number> {
    const [{ count }] = await getDb()`
      SELECT COUNT(*)::int as count FROM brand_assets
      WHERE project_id = ${BRAND_ID} AND type = ${type}
    `;
    return count;
  },

  async syncLogoUrl() {
    const logos = await getDb()`SELECT url FROM brand_assets WHERE project_id = ${BRAND_ID} AND type = 'logo' ORDER BY created_at ASC LIMIT 1`;
    if (logos[0]) {
      await getDb()`UPDATE projects SET logo_url = ${logos[0].url} WHERE id = ${BRAND_ID}`;
    } else {
      await getDb()`UPDATE projects SET logo_url = NULL WHERE id = ${BRAND_ID}`;
    }
  },
};
