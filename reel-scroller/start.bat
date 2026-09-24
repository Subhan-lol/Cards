@echo off
cd /d "%~dp0"

rem Put your favourite options here, e.g.  set "OPTIONS=--sensitivity 1.2 --invert"
rem Run  start.bat --help  to see them all.
set "OPTIONS="

if not exist ".venv\Scripts\python.exe" (
    call setup.bat nopause || exit /b 1
)
".venv\Scripts\python.exe" -m reel_scroller %OPTIONS% %*
if errorlevel 1 pause
