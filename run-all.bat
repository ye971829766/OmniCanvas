@echo off
echo Starting OmniCanvas Services...

:: Verify bun installation
where bun >nul 2>nul
if %errorlevel% equ 0 (
    set RUNNER=bun
) else (
    set RUNNER=npm
)

echo Detected runner: %RUNNER%

:: Start Backend
echo Starting Backend (Server)...
start "OmniCanvas Backend" cmd /k "cd server && bun run dev"

:: Start Admin
echo Starting Admin...
start "OmniCanvas Admin" cmd /k "cd admin && %RUNNER% run dev"

:: Start Frontend
echo Starting Frontend...
start "OmniCanvas Frontend" cmd /k "%RUNNER% run dev"

echo All services launched in separate windows!
pause
