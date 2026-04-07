#!/bin/bash
# ─────────────────────────────────────────────
#  Campus Search — Quick Redeploy to Vercel
#  Double-click to push latest changes live
# ─────────────────────────────────────────────
cd "$(dirname "$0")/server"

echo ""
echo "📤 Redeploying Campus Search to Vercel..."
echo ""

# Use local vercel install from previous deploy
VERCEL_BIN="$HOME/.campus-vercel/node_modules/.bin/vercel"
if [ ! -f "$VERCEL_BIN" ]; then
  VERCEL_BIN="vercel"
fi

DB_URL=$(grep "^DATABASE_URL=" .env | cut -d'"' -f2)
JWT_SECRET="CampusSearch_JWT_Secret_2026_adsomia"

"$VERCEL_BIN" deploy --prod --yes \
  --name "campus-search" \
  --env DATABASE_URL="$DB_URL" \
  --env JWT_SECRET="$JWT_SECRET" \
  --env STUDENT_JWT_SECRET="$JWT_SECRET" \
  --env NODE_ENV="production"

echo ""
echo "✅ Done! Live at https://campus-search-iota.vercel.app"
echo ""
read -p "Press Enter to close..."
