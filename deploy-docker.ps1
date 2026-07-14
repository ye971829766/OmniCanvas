# ============================================================
# OmniCanvas — One-Click Docker Deployment Script (Windows)
# ============================================================

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "         🎨 OmniCanvas One-Click Docker Deploy      " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Check Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "[Error] Docker is not installed or not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Copy env template if missing
if (-not (Test-Path "server\.env")) {
    if (Test-Path "server\.env.example") {
        Write-Host "[Notice] Creating server\.env from server\.env.example..." -ForegroundColor Yellow
        Copy-Item "server\.env.example" "server\.env"
    } else {
        New-Item -ItemType File -Path "server\.env" | Out-Null
    }
}

# Preflight: Bun lockfiles required for full Bun Docker builds
foreach ($f in @("bun.lock", "admin/bun.lock", "server/bun.lock")) {
    if (-not (Test-Path $f)) {
        Write-Host "[Error] Missing $f — required for Bun frozen install in Docker." -ForegroundColor Red
        Write-Host "Run locally: bun install (and in admin/, server/) then commit bun.lock." -ForegroundColor Yellow
        exit 1
    }
}

# frontend/admin: oven/bun build → nginx; backend: oven/bun runtime
Write-Host "[1/3] Building and starting OmniCanvas Docker containers (Bun full chain)..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "[2/3] Checking container status..." -ForegroundColor Cyan
docker compose ps

Write-Host "====================================================" -ForegroundColor Green
Write-Host " 🎉 OmniCanvas Successfully Deployed with Docker!   " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host " 🌐 Frontend Canvas App : http://localhost:18080" -ForegroundColor Cyan
Write-Host " 🛠️ Admin Dashboard     : http://localhost:18080/admin" -ForegroundColor Cyan
Write-Host " ⚙️ Backend API Proxy   : http://localhost:18080/api" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Green
