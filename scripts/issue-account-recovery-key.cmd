@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_PATH=%SCRIPT_DIR%issue-account-recovery-key.mjs"

if not exist "%SCRIPT_PATH%" (
  echo issue-account-recovery-key.mjs was not found.
  exit /b 1
)

if "%SHIFT_RECOVERY_FORCE_SHIFT_EXE%"=="1" goto try_shiftmgmt_exe

where node.exe >nul 2>nul
if errorlevel 1 goto try_shiftmgmt_exe

node "%SCRIPT_PATH%" %*
set "EXIT_CODE=%ERRORLEVEL%"
goto done

:try_shiftmgmt_exe
set "SHIFT_EXE="

if defined SHIFTMGMT_EXE_PATH if exist "%SHIFTMGMT_EXE_PATH%" set "SHIFT_EXE=%SHIFTMGMT_EXE_PATH%"
if exist "%SCRIPT_DIR%..\..\ShiftMgmt.exe" set "SHIFT_EXE=%SCRIPT_DIR%..\..\ShiftMgmt.exe"
if not defined SHIFT_EXE if exist "%LOCALAPPDATA%\Programs\ShiftMgmt\ShiftMgmt.exe" set "SHIFT_EXE=%LOCALAPPDATA%\Programs\ShiftMgmt\ShiftMgmt.exe"
if not defined SHIFT_EXE if exist "%ProgramFiles%\ShiftMgmt\ShiftMgmt.exe" set "SHIFT_EXE=%ProgramFiles%\ShiftMgmt\ShiftMgmt.exe"
if not defined SHIFT_EXE if exist "%ProgramFiles(x86)%\ShiftMgmt\ShiftMgmt.exe" set "SHIFT_EXE=%ProgramFiles(x86)%\ShiftMgmt\ShiftMgmt.exe"

if not defined SHIFT_EXE goto missing_runtime

set "ELECTRON_RUN_AS_NODE=1"
set "RESULT_PATH=%TEMP%\shiftmgmt-recovery-key-%RANDOM%%RANDOM%.log"
start "" "%SHIFT_EXE%" "%SCRIPT_PATH%" %* --result-file "%RESULT_PATH%"

for /L %%I in (1,1,120) do (
  if exist "%RESULT_PATH%" goto electron_result_ready
  ping -n 2 127.0.0.1 >nul
)

echo ShiftMgmt.exe did not return a recovery-key result within 120 seconds.
set "EXIT_CODE=1"
goto done

:electron_result_ready
for /f "tokens=2 delims==" %%A in ('findstr /b "EXIT_CODE=" "%RESULT_PATH%"') do set "EXIT_CODE=%%A"
more +1 "%RESULT_PATH%"
del "%RESULT_PATH%" >nul 2>nul
if not defined EXIT_CODE set "EXIT_CODE=1"
goto done

:missing_runtime
echo Could not find ShiftMgmt.exe or node.exe.
echo Install ShiftMgmt 0.4.10 or run this batch file on a PC with Node.js 24.
set "EXIT_CODE=1"

:done
echo.
if "%EXIT_CODE%"=="0" (
  echo Keep the recovery key shown above. It is displayed only once.
)
if not "%SHIFT_RECOVERY_NO_PAUSE%"=="1" pause
exit /b %EXIT_CODE%
