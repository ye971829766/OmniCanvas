Write-Host "Starting OmniCanvas Services..." -ForegroundColor Cyan

# Detect runner (bun or npm)
$runner = "npm"
if (Get-Command bun -ErrorAction SilentlyContinue) {
    $runner = "bun"
}
Write-Host "Detected runner: $runner" -ForegroundColor Gray

# Start Backend
Write-Host "Starting Backend (Server)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; bun run dev" -Title "OmniCanvas Backend"

# Start Admin
Write-Host "Starting Admin..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd admin; $runner run dev" -Title "OmniCanvas Admin"

# Start Frontend
Write-Host "Starting Frontend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$runner run dev" -Title "OmniCanvas Frontend"

Write-Host "All services started in separate PowerShell windows!" -ForegroundColor Green
