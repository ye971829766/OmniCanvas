# ============================================================
# Frontend & Admin Web Dockerfile for OmniCanvas
# ============================================================

# Stage 1: Build Frontend User App
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Build Admin Dashboard
FROM node:20-alpine AS admin-builder
WORKDIR /app/admin
COPY admin/package.json ./
RUN npm install
COPY admin/ .
RUN npm run build

# Stage 3: Nginx Production Web Server
FROM nginx:alpine AS runner
COPY --from=frontend-builder /app/dist /usr/share/nginx/html/app
COPY --from=admin-builder /app/admin/dist /usr/share/nginx/html/admin
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
