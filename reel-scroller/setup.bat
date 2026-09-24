@echo off
setlocal
cd /d "%~dp0"
echo.
echo   Reel Scroller setup
echo   ===================
echo.

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :nopython
%PY% -c "import sys" >nul 2>nul || goto :nopython
%PY% -c "import struct, sys; sys.exit(struct.calcsize('P') != 8)" || goto :notx64

if not exist ".venv\Scripts\python.exe" (
    echo   Creating a private Python environment in .venv ...
    %PY% -m venv .venv || goto :fail
)
echo   Installing packages - the first time takes a minute or two ...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet --disable-pip-version-check
".venv\Scripts\python.exe" -m pip install -r requirements.txt --disable-pip-version-check || goto :fail
".venv\Scripts\python.exe" -m reel_scroller --download-model || goto :fail
echo.
echo   Done! Double-click start.bat to run Reel Scroller.
echo.
if "%~1"=="" pause
exit /b 0

:nopython
echo   Python was not found.
echo   Install Python 3.10 or newer from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" in the installer, then run setup.bat again.
echo   Or, in a terminal:  winget install Python.Python.3.12
echo.
pause
exit /b 1

:notx64
echo   Your Python is 32-bit. Please install the 64-bit version from
echo   https://www.python.org/downloads/ and run setup.bat again.
echo.
pause
exit /b 1

:fail
echo.
echo   Setup failed - scroll up to see the error.
echo.
pause
exit /b 1
