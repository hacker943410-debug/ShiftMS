@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ShiftMgmt] Node.js was not found. Install Node.js 24.x and try again.
  pause
  exit /b 1
)

echo [ShiftMgmt] Database reset preview
node --no-warnings scripts\reset-database.mjs --preview %*
if errorlevel 1 (
  echo [ShiftMgmt] Could not inspect the database target.
  pause
  exit /b 1
)

echo.
echo This will clear the ShiftMgmt SQLite data while preserving app_setting_entries.
echo Configured import, export, backup, and migration paths stored in the DB will not be deleted.
choice /C YN /M "Continue"
if errorlevel 2 (
  echo [ShiftMgmt] Cancelled.
  pause
  exit /b 0
)

echo.
echo [ShiftMgmt] Resetting database...
node --no-warnings scripts\reset-database.mjs --apply %*
if errorlevel 1 (
  echo [ShiftMgmt] Database reset failed. Close ShiftMgmt and try again.
  pause
  exit /b 1
)

echo [ShiftMgmt] Done.
pause
