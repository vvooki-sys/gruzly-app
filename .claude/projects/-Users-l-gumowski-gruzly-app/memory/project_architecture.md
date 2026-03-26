---
name: Gruzly 0.2 architecture
description: Single-brand modular architecture — one instance per brand, service layer, modular frontend components
type: project
---

Gruzly 0.2 uses single-brand architecture: one instance = one brand (BRAND_ID = 1).

**API:** `/api/brand/*` (no `[id]` param). Thin route controllers.
**Services:** `lib/services/` — brand.service.ts, assets.service.ts (more to be added as needed).
**Frontend:** Modular components in `app/components/` — Generator, Copywriter, AssetManager, BrandScanner, BrandSettings. Shell at `app/page.tsx`.
**Provisioning:** `setup/setup.sh` — Vercel + Neon CLI script for creating new instances.
**DB:** PostgreSQL (Neon), 4 tables: projects, brand_assets, generations, templates.

**Why:** Agency model — each client gets their own isolated Gruzly instance.
**How to apply:** New features = new service + new route + new component. No existing files need to change (except adding tab in page.tsx).
