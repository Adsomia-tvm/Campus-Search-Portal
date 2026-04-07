#!/bin/bash
# ────────────────────────────────────────────────────────────────────
#  Campus Search Portal — START
#  Double-click this file on your Mac to launch the portal
# ────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")/server"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🎓  Campus Search Portal           ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check Node.js ─────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js not found. Download from https://nodejs.org"
  read -p "Press Enter to exit..."
  exit 1
fi

# ── Check .env ────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "⚠️  server/.env not found."
  echo ""
  echo "Copy server/.env.example → server/.env"
  echo "and fill in your DATABASE_URL from neon.tech"
  echo ""
  read -p "Press Enter once done..."
fi

# ── Install dependencies if needed ────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run only, ~1 min)..."
  npm install
  echo ""
fi

# ── Open browser after short delay ───────────────────────────────────
(sleep 3 && open "http://localhost:4000") &

# ── Start server (serves API + frontend together on one port) ─────────
echo "🚀 Starting on http://localhost:4000 ..."
echo ""
echo "   Public portal → http://localhost:4000"
echo "   Admin CRM     → http://localhost:4000/admin/login"
echo "   Admin login   → md@adsomia.com / CampusSearch@2026"
echo ""
echo "Press Ctrl+C to stop."
echo ""

node src/index.js
