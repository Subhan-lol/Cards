@echo off
setlocal
cd /d "%~dp0"
set "RS_DIR=%CD%"
title Reel Scroller setup
echo.
echo   Reel Scroller setup
echo   ===================
echo.

rem ------------------------------------------------------------------ Python
set "PYCMD="
call :find_python
if not defined PYCMD call :install_python
if not defined PYCMD goto :nopython
echo   Using Python: %PYCMD%
echo.

rem ------------------------------------------------------ private environment
if not exist ".venv\Scripts\python.exe" goto :make_venv
".venv\Scripts\python.exe" -c "import sys" <nul >nul 2>nul
if "%errorlevel%"=="0" goto :have_venv
echo   Rebuilding the broken .venv folder ...
rmdir /s /q ".venv"
:make_venv
echo   Creating a private Python environment in .venv ...
%PYCMD% -m venv .venv
if not "%errorlevel%"=="0" goto :fail
:have_venv

echo   Installing packages - the first time takes a few minutes ...
".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet --disable-pip-version-check
".venv\Scripts\python.exe" -m pip install -r requirements.txt --disable-pip-version-check
if not "%errorlevel%"=="0" goto :fail
".venv\Scripts\python.exe" -m reel_scroller --download-model
if not "%errorlevel%"=="0" goto :fail
copy /y requirements.txt ".venv\setup-complete.txt" >nul
call :shortcut

echo.
echo   All set! Start Reel Scroller with start.bat or the desktop shortcut.
echo.
if "%~1"=="" pause
exit /b 0

:nopython
echo.
echo   Python could not be installed automatically.
echo   Install Python 3.12 from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" in the installer, then run start.bat again.
echo.
pause
exit /b 1

:fail
echo.
echo   Setup failed - scroll up to see the error.
echo   Check your internet connection and run start.bat again.
echo.
pause
exit /b 1


rem ==========================================================================
rem Sets PYCMD to an installed 64-bit Python 3.10 - 3.14, if there is one.
:find_python
for %%v in (3.12 3.13 3.11 3.14 3.10) do if not defined PYCMD call :try_python py -%%v
if not defined PYCMD call :try_python "%LOCALAPPDATA%\Programs\Python\Launcher\py.exe" -3
for %%v in (312 313 311 314 310) do if not defined PYCMD call :try_python "%LOCALAPPDATA%\Programs\Python\Python%%v\python.exe"
if not defined PYCMD call :try_python python
exit /b 0

:try_python
rem The candidate writes a marker file only if it really is a suitable Python
rem (an exit code alone can't tell a working Python from a missing command).
set "RS_PY_OK=%TEMP%\reel-scroller-python-ok.txt"
del "%RS_PY_OK%" >nul 2>nul
%* -c "import os, struct, sys; ok = (3, 10) <= sys.version_info[:2] <= (3, 14) and struct.calcsize('P') == 8; ok and open(os.environ['RS_PY_OK'], 'w').write('ok')" <nul >nul 2>nul
if exist "%RS_PY_OK%" set "PYCMD=%*"
del "%RS_PY_OK%" >nul 2>nul
exit /b 0


rem Downloads the official 64-bit installer from python.org, checks that it is
rem signed by the Python Software Foundation, and installs it for this user
rem only (no admin rights needed). Falls back to winget.
:install_python
set "PY_VER=3.12.10"
set "PY_URL=https://www.python.org/ftp/python/%PY_VER%/python-%PY_VER%-amd64.exe"
set "PY_SETUP=%TEMP%\python-%PY_VER%-amd64.exe"
echo   Python 3.10 or newer was not found, so Python %PY_VER% will be installed now.
echo   Downloading it from python.org ...
del "%PY_SETUP%" >nul 2>nul
where curl.exe >nul 2>nul
if not "%errorlevel%"=="0" goto :download_ps
curl.exe -L --fail --progress-bar -o "%PY_SETUP%" "%PY_URL%"
if not "%errorlevel%"=="0" del "%PY_SETUP%" >nul 2>nul
:download_ps
if not exist "%PY_SETUP%" powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = 'Tls12'; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri $env:PY_URL -OutFile $env:PY_SETUP"
if not exist "%PY_SETUP%" goto :install_with_winget

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = Get-AuthenticodeSignature -LiteralPath $env:PY_SETUP; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'Python Software Foundation') { exit 1 }"
if "%errorlevel%"=="0" goto :run_installer
echo   Could not confirm the download is signed by the Python Software Foundation,
echo   so it was not run.
del "%PY_SETUP%" >nul 2>nul
goto :install_with_winget

:run_installer
echo   Installing Python %PY_VER% for your user account - a progress window will appear ...
"%PY_SETUP%" /passive InstallAllUsers=0 PrependPath=1 Include_launcher=1 InstallLauncherAllUsers=0 Include_test=0 Include_doc=0
del "%PY_SETUP%" >nul 2>nul
call :find_python
if defined PYCMD exit /b 0

:install_with_winget
where winget.exe >nul 2>nul
if not "%errorlevel%"=="0" exit /b 0
echo   Trying to install Python with winget ...
winget install --exact --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
call :find_python
exit /b 0


rem Puts a "Reel Scroller" shortcut on the desktop (once).
:shortcut
set "RS_START=%RS_DIR%\start.bat"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Reel Scroller.lnk'; if (-not (Test-Path -LiteralPath $lnk)) { $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk); $s.TargetPath = $env:RS_START; $s.WorkingDirectory = $env:RS_DIR; $s.Description = 'Scroll reels with hand gestures'; $s.Save(); Write-Host '  Added a Reel Scroller shortcut to your desktop.' }" 2>nul
exit /b 0
