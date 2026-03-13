@echo off
setlocal

cd /d "%~dp0"

echo [ShiftMgmt] Building latest application...
call npm run build
if errorlevel 1 (
  echo [ShiftMgmt] Build failed.
  pause
  exit /b 1
)

echo [ShiftMgmt] Launching desktop app...
start "" cmd /c "npm run start"
