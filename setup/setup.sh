#!/bin/bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════╗
# ║  Gruzly 0.2 — Instance Provisioning Script                  ║
# ║  Creates a new Gruzly instance for a brand/client            ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Usage: ./setup/setup.sh "Brand Name" "brand-slug"
#
# Prerequisites:
#   - Vercel CLI: npm i -g vercel
#   - Neon CLI: npm i -g neonctl
#   - psql (PostgreSQL client)
#   - Authenticated: vercel login && neonctl auth

BRAND_NAME="${1:?Usage: ./setup/setup.sh \"Brand Name\" \"brand-slug\"}"
PROJECT_SLUG="${2:?Usage: ./setup/setup.sh \"Brand Name\" \"brand-slug\"}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="$SCRIPT_DIR/neon-schema.sql"

echo ""
echo "  🧱 Gruzly 0.2 — Provisioning"
echo "  Brand: $BRAND_NAME"
echo "  Slug:  $PROJECT_SLUG"
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────────
echo "▸ Checking prerequisites..."
for cmd in vercel neonctl psql; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  ✗ '$cmd' not found. Install it first."
    exit 1
  fi
done
echo "  ✓ All tools available"

# ── Step 2: Create Neon database ─────────────────────────────────
echo ""
echo "▸ Creating Neon database..."
NEON_PROJECT=$(neonctl projects create --name "gruzly-$PROJECT_SLUG" --output json 2>/dev/null)
DATABASE_URL=$(echo "$NEON_PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['connection_uris'][0]['connection_uri'])" 2>/dev/null || echo "")

if [ -z "$DATABASE_URL" ]; then
  echo "  ✗ Failed to create Neon project. Try manually:"
  echo "    neonctl projects create --name gruzly-$PROJECT_SLUG"
  exit 1
fi
echo "  ✓ Database created"

# ── Step 3: Run schema ───────────────────────────────────────────
echo ""
echo "▸ Initializing database schema..."
psql "$DATABASE_URL" -f "$SCHEMA_FILE" -q 2>/dev/null
# Update brand name
psql "$DATABASE_URL" -c "UPDATE projects SET name = '$BRAND_NAME' WHERE id = 1;" -q 2>/dev/null
echo "  ✓ Schema initialized, brand seeded"

# ── Step 4: Create Vercel project ────────────────────────────────
echo ""
echo "▸ Setting up Vercel project..."
echo "  You'll be prompted to link this directory to a new Vercel project."
echo "  Project name suggestion: gruzly-$PROJECT_SLUG"
echo ""

vercel link

# ── Step 5: Set environment variables ────────────────────────────
echo ""
echo "▸ Setting environment variables..."
echo "$DATABASE_URL" | vercel env add DATABASE_URL production
echo ""
echo "  ⚠  You need to manually set these env vars:"
echo "     vercel env add GOOGLE_AI_KEY production"
echo "     vercel env add BLOB_READ_WRITE_TOKEN production"

# ── Step 6: Deploy ───────────────────────────────────────────────
echo ""
echo "▸ Deploying to production..."
DEPLOY_URL=$(vercel --prod 2>&1 | grep -oE 'https://[^ ]+' | head -1)

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  ✓ Gruzly instance ready!                        ║"
echo "  ║                                                  ║"
echo "  ║  Brand: $BRAND_NAME"
echo "  ║  URL:   ${DEPLOY_URL:-'(check Vercel dashboard)'}"
echo "  ║                                                  ║"
echo "  ║  Next steps:                                     ║"
echo "  ║  1. Set GOOGLE_AI_KEY in Vercel env vars         ║"
echo "  ║  2. Set BLOB_READ_WRITE_TOKEN in Vercel env vars ║"
echo "  ║  3. Redeploy: vercel --prod                      ║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""
