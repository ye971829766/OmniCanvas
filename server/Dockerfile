# ============================================================
# Backend — Bun runtime only (no Vite). Keep install light.
# On ≤2GB VPS: prefer loading a pre-built image (see scripts/export-images.*).
# ============================================================
FROM oven/bun:1-alpine

WORKDIR /app

# Optional ffmpeg (heavy). Default OFF for small VPS builds.
# docker build --build-arg INSTALL_FFMPEG=1 ...
ARG INSTALL_FFMPEG=0
RUN if [ "$INSTALL_FFMPEG" = "1" ]; then \
      sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories \
      && apk add --no-cache ffmpeg curl \
      || apk add --no-cache ffmpeg curl; \
    else \
      apk add --no-cache curl || true; \
    fi

COPY package.json bun.lock ./

# Single-threaded-ish install path; production deps only when possible
ENV BUN_INSTALL_CACHE_DIR=/tmp/bun-cache
RUN bun install --frozen-lockfile --production --registry https://registry.npmmirror.com \
  || bun install --frozen-lockfile --production \
  || bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/files /app/data \
  && rm -rf /tmp/bun-cache /root/.bun/install/cache 2>/dev/null || true

EXPOSE 3000
ENV PORT=3000
ENV UPLOAD_DIR=/app/files

CMD ["bun", "--use-system-ca", "run", "src/main.ts"]
