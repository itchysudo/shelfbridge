#!/bin/bash
#
# Fable → Goodreads — Mac launcher.
#
# Double-click this file in Finder to start the tool. Your default browser
# will open automatically to the welcome screen.
#
# To stop the tool, switch to this Terminal window and press  Ctrl+C  ,
# or just close the Terminal window.

cd "$(dirname "$0")"

# Sanity check: did the user run setup.sh yet?
if [ ! -f .venv/bin/python ]; then
    echo ""
    echo "It looks like you haven't run setup.sh yet."
    echo ""
    echo "Open Terminal in this folder and run:"
    echo "    ./setup.sh"
    echo ""
    echo "Then double-click this file again."
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

echo "Starting Fable → Goodreads..."
echo "Your browser should open to http://localhost:5050 in a moment."
echo "When you're done, press Ctrl+C here to stop the tool."
echo ""

.venv/bin/python app.py
