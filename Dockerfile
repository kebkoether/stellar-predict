# ─── Stage 1: Build Server ───
FROM node:20-slim AS server-build

WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ .
RUN npx tsc

# ─── Stage 2: Build Web ───
FROM node:20-slim AS web-build

WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .

# Ensure public directory exists (Next.js expects it)
RUN mkdir -p public

# The API URL is set at build time for Next.js
# For single-container deploy, API is at the same origin
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# ─── Stage 3: Production ───
FROM node:20-slim AS production

WORKDIR /app

# Copy server build
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=server-build /app/server/node_modules ./server/node_modules
COPY --from=server-build /app/server/package.json ./server/

# Copy sql.js WASM file (needed at runtime)
COPY --from=server-build /app/server/node_modules/sql.js/dist/sql-wasm.wasm ./server/node_modules/sql.js/dist/

# Copy web build
COPY --from=web-build /app/web/.next ./web/.next
COPY --from=web-build /app/web/public ./web/public
COPY --from=web-build /app/web/node_modules ./web/node_modules
COPY --from=web-build /app/web/package.json ./web/

# Copy reverse proxy and start script
COPY proxy.js ./
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

# Copy env template
COPY server/.env.example ./server/.env

EXPOSE 8080

CMD ["./docker-start.sh"]
