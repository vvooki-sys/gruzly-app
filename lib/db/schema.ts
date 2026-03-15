import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  clientName: text('client_name'),
  logoUrl: text('logo_url'),
  styleDescription: text('style_description'),
  typographyNotes: text('typography_notes'),
  colorPalette: text('color_palette'), // JSON string
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const brandAssets = pgTable('brand_assets', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'logo' | 'reference' | 'background' | 'brandbook'
  url: text('url').notNull(),
  filename: text('filename').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const generations = pgTable('generations', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  brief: text('brief').notNull(),
  format: text('format').notNull(), // 'fb_post' | 'ln_post' | 'story' | 'banner'
  prompt: text('prompt'), // wygenerowany JSON prompt
  imageUrls: text('image_urls'), // JSON array of URLs
  status: text('status').notNull().default('pending'), // 'pending' | 'done' | 'rejected'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
