#!/bin/bash
# ────────────────────────────────────────────────────────────────────
#  Campus Search Portal — FIRST-TIME SETUP
#  Run this ONCE before starting the portal for the first time
# ────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"
PORTAL_DIR="$(pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   🎓 Campus Search — First Time Setup   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Create .env ───────────────────────────────────────────
if [ ! -f "$PORTAL_DIR/server/.env" ]; then
  echo "📝 Step 1: Creating server/.env from template..."
  cp "$PORTAL_DIR/server/.env.example" "$PORTAL_DIR/server/.env"
  echo ""
  echo "✅ server/.env created!"
  echo ""
  echo "Now open server/.env and fill in your DATABASE_URL."
  echo "Get a FREE PostgreSQL database at: https://neon.tech"
  echo "(Sign up → New project → Copy connection string)"
  echo ""
  open "$PORTAL_DIR/server/.env"
  read -p "Press Enter once you've pasted your DATABASE_URL in server/.env ..."
else
  echo "✅ server/.env already exists."
fi

# ── Step 2: Install dependencies ──────────────────────────────────
echo ""
echo "📦 Step 2: Installing server dependencies..."
cd "$PORTAL_DIR/server" && npm install

echo ""
echo "📦 Installing client dependencies..."
cd "$PORTAL_DIR/client" && npm install

# ── Step 3: Push DB schema ────────────────────────────────────────
echo ""
echo "🗄️  Step 3: Creating database tables..."
cd "$PORTAL_DIR/server"
npx prisma db push

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Database connection failed!"
  echo "Please check your DATABASE_URL in server/.env"
  read -p "Press Enter to exit..."
  exit 1
fi

# ── Step 4: Seed data ─────────────────────────────────────────────
echo ""
echo "🌱 Step 4: Importing 1,141 colleges from Excel..."
node prisma/seed.js

echo ""
echo "══════════════════════════════════════════"
echo "✅ Setup complete!"
echo ""
echo "   Admin login: md@adsomia.com"
echo "   Password:    CampusSearch@2026"
echo ""
echo "Now double-click  start.command  to run the portal."
echo "══════════════════════════════════════════"
echo ""
read -p "Press Enter to close..."
