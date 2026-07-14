# ============================================================
# Frontend & Admin Web Dockerfile for OmniCanvas (full Bun build)
# Backend runtime is also Bun — see server/Dockerfile
# Final static assets are served by Nginx (no Node/Bun runtime here)
# ============================================================

# ---------- Stage 1: Build user-facing canvas app ----------
FROM oven/bun:1-alpine AS frontend-builder

ENV VITE_API_BASE_URL=/api
ARG VITE_API_CRYPTO=false
ARG VITE_API_CRYPTO_SECRET=
ENV VITE_API_CRYPTO=$VITE_API_CRYPTO
ENV VITE_API_CRYPTO_SECRET=$VITE_API_CRYPTO_SECRET

WORKDIR /app

# Manifests first for better layer caching
COPY package.json bun.lock ./

# Prefer China mirror; fall back to default registry on failure
RUN bun install --frozen-lockfile --registry https://registry.npmmirror.com \
  || bun install --frozen-lockfile

COPY . .

# Skip vue-tsc in image builds (saves memory); typecheck in CI/dev instead
RUN bunx vite build

# ---------- Stage 2: Build admin dashboard ----------
FROM oven/bun:1-alpine AS admin-builder

ENV VITE_API_BASE_URL=/api
ARG VITE_API_CRYPTO=false
ARG VITE_API_CRYPTO_SECRET=
ENV VITE_API_CRYPTO=$VITE_API_CRYPTO
ENV VITE_API_CRYPTO_SECRET=$VITE_API_CRYPTO_SECRET

WORKDIR /app/admin

COPY admin/package.json admin/bun.lock ./

RUN bun install --frozen-lockfile --registry https://registry.npmmirror.com \
  || bun install --frozen-lockfile

COPY admin/ .

RUN bunx vite build

# ---------- Stage 3: Nginx production static host ----------
FROM nginx:alpine AS runner

COPY --from=frontend-builder /app/dist /usr/share/nginx/html/app
COPY --from=admin-builder /app/admin/dist /usr/share/nginx/html/admin
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
