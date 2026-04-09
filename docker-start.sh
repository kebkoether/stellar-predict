#!/bin/sh
set -e

echo "Starting Stellar Foresure..."

# Backend API on fixed internal port 3000 (NOT Railway's PORT)
cd /app/server
echo "Starting API server on port 3000..."
SERVER_PORT=3000 NODE_ENV=production node dist/index.js &
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

echo "All services started!"

# Wait for any process to exit
wait $SERVER_PID $WEB_PID $PROXY_PID
