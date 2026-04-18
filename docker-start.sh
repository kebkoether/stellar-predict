#!/bin/sh
set -e

echo "Starting Stellar Hedge..."

# Ensure persistent data directory exists (Railway volume mounts here)
mkdir -p /app/data

# ── Volume persistence diagnostic ──
echo "=== STORAGE DIAGNOSTIC ==="
echo "DB_PATH target: /app/data/data.db"
if [ -f /app/data/data.db ]; then
  DB_SIZE=$(ls -lh /app/data/data.db | awk '{print $5}')
  DB_MOD=$(stat -c %y /app/data/data.db 2>/dev/null || stat -f %Sm /app/data/data.db 2>/dev/null || echo "unknown")
  echo "✅ DB file exists: ${DB_SIZE}, last modified: ${DB_MOD}"
else
  echo "⚠️  No DB file found — this is a fresh deploy or volume is not mounted"
fi
# Check if /app/data is a mount point (indicates Railway volume)
if mountpoint -q /app/data 2>/dev/null; then
  echo "✅ /app/data is a mounted volume"
else
  echo "⚠️  /app/data is NOT a mount point — data will be lost on redeploy!"
  echo "   → Go to Railway dashboard → Service → Settings → Add Volume → Mount path: /app/data"
fi
echo "=========================="

# Backend API on fixed internal port 3000 (NOT Railway's PORT)
cd /app/server
echo "Starting API server on port 3000 with DB at /app/data/data.db..."
SERVER_PORT=3000 NODE_ENV=production DB_PATH=/app/data/data.db node dist/index.js &
SERVER_PID=$!

# Next.js frontend on internal port 3002
cd /app/web
echo "Starting frontend on port 3002..."
PORT=3002 npx next start &
WEB_PID=$!

# Wait for services to start
sleep 3

# Reverse proxy on Railway's PORT (routes /api to backend, everything else to frontend)
cd /app
echo "Starting reverse proxy on port ${PORT:-8080}..."
node proxy.js &
PROXY_PID=$!

# Polymarket price feed oracle — writes reference prices only, no orders
cd /app/server
echo "Starting Polymarket price feed oracle..."
API_BASE=http://localhost:3000/api POLL_INTERVAL_MS=60000 node dist-oracle/polymarket-oracle.js &
ORACLE_PID=$!

echo "All services started!"

# Wait for any process to exit
wait $SERVER_PID $WEB_PID $PROXY_PID $ORACLE_PID
