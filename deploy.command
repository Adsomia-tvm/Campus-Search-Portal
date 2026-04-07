#!/bin/bash
# ────────────────────────────────────────────────────────────────────
#  Campus Search — Deploy to Vercel
#  Double-click this file on your Mac to deploy the portal live
# ────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/server"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  🚀  Campus Search — Deploy to Vercel   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Install Node.js if not found ─────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "📦 Node.js not found — installing now..."
  echo ""
  if command -v brew &>/dev/null; then
    echo "   Using Homebrew to install Node.js..."
    brew install node
  else
    echo "   Downloading Node.js installer (~70MB, please wait)..."
    NODE_PKG="https://nodejs.org/dist/v20.11.1/node-v20.11.1.pkg"
    TMP_PKG="/tmp/node-installer.pkg"
    curl -L "$NODE_PKG" -o "$TMP_PKG" --progress-bar
    echo "   Installing (your Mac password may be required)..."
    sudo installer -pkg "$TMP_PKG" -target /
    rm -f "$TMP_PKG"
    export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:$PATH"
  fi
  if ! command -v node &>/dev/null; then
    echo "❌ Node.js install failed. Go to https://nodejs.org and install manually, then run this again."
    read -p "Press Enter to exit..."; exit 1
  fi
  echo "✅ Node.js installed: $(node -v)"
  echo ""
fi

echo "✅ Node.js: $(node -v)"
echo ""

# ── Install Vercel CLI locally (no sudo needed) ───────────────────────
VERCEL_DIR="$HOME/.campus-vercel"
VERCEL_BIN="$VERCEL_DIR/node_modules/.bin/vercel"

if [ ! -f "$VERCEL_BIN" ]; then
  echo "📦 Installing Vercel CLI..."
  mkdir -p "$VERCEL_DIR"
  npm install --prefix "$VERCEL_DIR" vercel --no-save 2>&1 | grep -v "^npm warn"
  echo ""
fi

echo "✅ Vercel CLI ready"
echo ""

# ── Read DATABASE_URL from .env ───────────────────────────────────────
DB_URL=""
if [ -f ".env" ]; then
  DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'"' -f2)
fi

if [ -z "$DB_URL" ]; then
  echo "⚠️  DATABASE_URL not found in server/.env"
  read -p "   Paste your Neon database URL: " DB_URL
fi

JWT_SECRET="CampusSearch_JWT_Secret_2026_adsomia"

# ── Login to Vercel ───────────────────────────────────────────────────
echo "🔐 Logging into Vercel (browser will open)..."
echo ""
"$VERCEL_BIN" login

echo ""
echo "📤 Deploying Campus Search to Vercel..."
echo ""

# ── Deploy ────────────────────────────────────────────────────────────
LIVE_URL=$("$VERCEL_BIN" deploy --prod --yes \
  --name "campus-search" \
  --env DATABASE_URL="$DB_URL" \
  --env JWT_SECRET="$JWT_SECRET" \
  --env STUDENT_JWT_SECRET="$JWT_SECRET" \
  --env NODE_ENV="production" 2>&1 | tee /dev/stderr | grep "https://" | tail -1)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  🎉  Campus Search is LIVE!             ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "   Live URL  → $LIVE_URL"
echo ""
echo "   Admin     → $LIVE_URL/admin/login"
echo "   Email     : md@adsomia.com"
echo "   Password  : CampusSearch@2026"
echo ""
read -p "Press Enter to close..."
