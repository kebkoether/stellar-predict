#!/bin/sh
set -e

echo "Starting Stellar Hedge..."

# Ensure persistent data directory exists (Railway volume mounts here)
mkdir -p /app/data

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

# Polymarket price oracle — polls every 60s, only requotes when >12% mispriced
cd /app/server
echo "Starting Polymarket oracle bot..."
API_BASE=http://localhost:3000/api ORACLE_USER=oracle-bot QUOTE_SIZE=50 SPREAD_CENTS=2 REPRICE_THRESHOLD=0.12 POLL_INTERVAL_MS=60000 node dist-oracle/polymarket-oracle.js &
ORACLE_PID=$!

echo "All services started!"

# Wait for any process to exit
wait $SERVER_PID $WEB_PID $PROXY_PID $ORACLE_PID
