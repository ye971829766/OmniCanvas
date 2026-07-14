# ============================================================
# Backend Dockerfile for OmniCanvas Server (Bun / NestJS)
# ============================================================
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install ffmpeg for media & video generation pipeline (using Tsinghua mirror to speed up in China)
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && \
    apk add --no-cache ffmpeg curl

# Copy package manifests
COPY package.json bun.lock ./

# Install production dependencies
RUN bun install --frozen-lockfile

# Copy application source
COPY tsconfig.json ./
COPY src ./src

# Create files & data directories
RUN mkdir -p /app/files /app/data

EXPOSE 3000

ENV PORT=3000
ENV UPLOAD_DIR=/app/files

CMD ["bun", "--use-system-ca", "run", "src/main.ts"]
