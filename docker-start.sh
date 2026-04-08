#!/bin/sh
set -e

echo "Starting Stellar Foresure..."

# Start backend server
cd /app/server
echo "Starting API server on port ${SERVER_PORT:-3000}..."
node dist/index.js &
SERVER_PID=$!

# Start Next.js frontend
cd /app/web
echo "Starting frontend on port 3002..."
PORT=3002 npx next start &
WEB_PID=$!

echo "All services started!"
echo "  API:      http://localhost:${SERVER_PORT:-3000}"
echo "  Frontend: http://localhost:3002"

# Wait for either process to exit
wait $SERVER_PID $WEB_PID
