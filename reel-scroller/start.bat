@echo off
cd /d "%~dp0"
title Reel Scroller

rem Put your favourite options here, e.g.  set "OPTIONS=--sensitivity 1.2 --invert"
rem Run  start.bat --help  to see them all.
set "OPTIONS="

rem The first time (and after an update) this installs everything it needs:
rem Python if it's missing, the packages and the hand-tracking model.
if not exist ".venv\setup-complete.txt" goto :setup
fc /b requirements.txt ".venv\setup-complete.txt" >nul 2>nul
if not "%errorlevel%"=="0" goto :setup
".venv\Scripts\python.exe" -c "import sys" <nul >nul 2>nul
if not "%errorlevel%"=="0" goto :setup
goto :run

:setup
call setup.bat nopause
if not "%errorlevel%"=="0" exit /b 1

:run
".venv\Scripts\python.exe" -m reel_scroller %OPTIONS% %*
if not "%errorlevel%"=="0" pause
