@echo off
REM
REM Fable to Goodreads -- Windows launcher.
REM
REM Double-click this file in Explorer to start the tool. Your default
REM browser will open automatically to the welcome screen.
REM
REM To stop the tool, switch to this Command Prompt window and press
REM Ctrl+C, or just close the window.

cd /d "%~dp0"

if not exist .venv\Scripts\python.exe (
    echo.
    echo It looks like you haven't run setup.bat yet.
    echo.
    echo Please double-click setup.bat first to install the tool,
    echo then double-click this file again.
    echo.
    pause
    exit /b 1
)

echo Starting Fable to Goodreads...
echo Your browser should open to http://localhost:5050 in a moment.
echo When you're done, press Ctrl+C here to stop the tool.
echo.

.venv\Scripts\python.exe app.py
