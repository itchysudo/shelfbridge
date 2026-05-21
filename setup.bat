@echo off
REM
REM ShelfBridge -- one-time setup script (Windows).
REM
REM What this does:
REM   1. Verifies Python 3.11+ is installed.
REM   2. Creates a self-contained virtual environment in .venv\
REM   3. Installs the Python packages the app needs.
REM   4. Downloads Playwright's Chromium browser (~150 MB).
REM
REM Run it once by double-clicking this file (or from a Command Prompt:
REM   setup.bat
REM
REM After setup, double-click start.bat any time to launch the app.

setlocal
cd /d "%~dp0"

echo.
echo ShelfBridge -- setup
echo ====================
echo.

REM --- Verify Python is installed --------------------------------------------

where python >nul 2>nul
if errorlevel 1 (
    echo [X] Python is not installed -- or it's not on your PATH.
    echo.
    echo     Install Python 3.11 or newer from:
    echo         https://www.python.org/downloads/
    echo     During install, tick the box "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo Using %PYVER%
echo.

REM --- Virtual environment ---------------------------------------------------

if exist .venv\Scripts\python.exe (
    echo Existing .venv found -- re-using it.
) else (
    echo Creating virtual environment in .venv\ ...
    python -m venv .venv
    if errorlevel 1 (
        echo [X] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

REM --- Python packages -------------------------------------------------------

echo Installing Python packages (Flask, Playwright, Requests) ...
call .venv\Scripts\pip.exe install --quiet --upgrade pip
call .venv\Scripts\pip.exe install --quiet -r requirements.txt
if errorlevel 1 (
    echo [X] pip install failed -- see messages above.
    pause
    exit /b 1
)

REM --- Chromium download -----------------------------------------------------

echo Downloading Chromium browser ^(~150 MB -- go make a tea^) ...
call .venv\Scripts\playwright.exe install chromium
if errorlevel 1 (
    echo [X] Chromium install failed -- check your internet connection.
    pause
    exit /b 1
)

echo.
echo [OK] Setup complete!
echo.
echo To run the tool:
echo   - Double-click 'start.bat' in this folder, OR
echo   - From a Command Prompt:  .venv\Scripts\python.exe app.py
echo.
pause
