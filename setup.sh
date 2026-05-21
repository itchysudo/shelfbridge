#!/bin/bash
#
# Fable → Goodreads — one-time setup script (Mac / Linux).
#
# What this does:
#   1. Finds a working Python 3.11+ on your machine.
#   2. Creates a self-contained virtual environment in `.venv/`.
#   3. Installs the Python packages the app needs.
#   4. Downloads Playwright's Chromium browser (~150 MB).
#
# Run it once, from Terminal:   ./setup.sh
#
# After this you can launch the app any time by double-clicking
# start.command (or running .venv/bin/python app.py).

set -e
cd "$(dirname "$0")"

echo ""
echo "Fable → Goodreads — setup"
echo "========================="
echo ""

# --- Find a usable Python --------------------------------------------------
# We prefer 3.12 because we've had pyexpat issues on Homebrew 3.13/3.14, then
# fall back through 3.11 and the generic `python3`.

PYTHON=""
for candidate in python3.12 python3.11 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
        version=$("$candidate" --version 2>&1)
        # Match Python 3.11, 3.12, 3.13, 3.14, …
        if echo "$version" | grep -qE "Python 3\.(1[1-9]|[2-9][0-9])"; then
            PYTHON="$candidate"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "❌  Couldn't find Python 3.11 or newer."
    echo ""
    echo "    Install it from https://www.python.org/downloads/ ,"
    echo "    then run this script again."
    exit 1
fi

echo "Using $PYTHON ($("$PYTHON" --version 2>&1))"
echo ""

# --- Virtual environment ---------------------------------------------------

if [ -d .venv ]; then
    echo "Existing .venv found — re-using it."
else
    echo "Creating virtual environment in .venv/ ..."
    "$PYTHON" -m venv .venv
fi

# --- Python packages -------------------------------------------------------

echo "Installing Python packages (Flask, Playwright, Requests) ..."
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

# --- Chromium download (the chunky bit) ------------------------------------

echo "Downloading Chromium browser (~150 MB — go make a tea) ..."
.venv/bin/playwright install chromium

# --- Make start.command executable so double-click works in Finder --------

chmod +x start.command 2>/dev/null || true

echo ""
echo "✅  Setup complete!"
echo ""
echo "To run the tool:"
echo "  •  On Mac: double-click 'start.command' in this folder."
echo "  •  Or in Terminal:  .venv/bin/python app.py"
echo ""
