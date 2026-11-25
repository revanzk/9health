@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   9health Unified Launcher (Windows)
echo ============================================

set ROUTER_URL=http://127.0.0.1:20128/v1/models
set HEALTH_PORT=3099

echo [1/3] Checking if 9router is running on port 20128...
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%ROUTER_URL%' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [1/3] 9router not detected. Attempting to start 9router in a new window...
  where 9router >nul 2>nul
  if errorlevel 1 (
    echo [WARN] '9router' CLI not found in PATH. Starting 9health anyway ^(you can connect later or use Demo Mode^).
  ) else (
    start "9router" cmd /k "9router"
    echo [2/3] Waiting for 9router port 20128 to become ready...
    for /l %%i in (1,1,15) do (
      powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%ROUTER_URL%' -TimeoutSec 2 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }"
      if not errorlevel 1 goto router_ready
      timeout /t 1 /nobreak >nul
    )
  )
)

:router_ready
echo [3/3] Starting 9health dashboard on http://127.0.0.1:%HEALTH_PORT% ...
if not exist dist (
  echo Building 9health frontend first...
  call pnpm run build
)
start "" "http://127.0.0.1:%HEALTH_PORT%"
set PORT=%HEALTH_PORT%
call pnpm run start
