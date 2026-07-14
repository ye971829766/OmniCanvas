# ============================================================
# OmniCanvas Server — One-Click Docker Deployment (Windows)
# ============================================================

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "      🎨 OmniCanvas Backend Server Docker Deploy     " -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# Check Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "[Error] Docker is not installed or not running. Please start Docker." -ForegroundColor Red
    exit 1
}

# Copy env template if missing
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Write-Host "[Notice] Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item ".env.example" ".env"
    } else {
        New-Item -ItemType File -Path ".env" | Out-Null
    }
}

# Preflight checks: lockfiles
if (-not (Test-Path "bun.lock")) {
    Write-Host "[Error] Missing bun.lock" -ForegroundColor Red
    exit 1
}

# Run Docker Compose
Write-Host "[1/2] Building and starting OmniCanvas Backend container..." -ForegroundColor Cyan
docker compose up -d --build

Write-Host "[2/2] Checking container status..." -ForegroundColor Cyan
docker compose ps

Write-Host "====================================================" -ForegroundColor Green
Write-Host " 🎉 Backend Server Successfully Deployed with Docker! " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green
Write-Host " ⚙️ Backend API Engine  : http://localhost:3000" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Green
