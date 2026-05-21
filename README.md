# Fable → Goodreads

A small tool that moves your reading library from **Fable** (the social reading app, which has no export feature) to **Goodreads** (whose API was shut down in 2020, so you can't easily push things in either). Everything runs on your own computer — your data never leaves your machine, except for a one-time look-up against Open Library for book covers.

---

## What you'll need

- A computer running **macOS, Windows, or Linux**.
- **Python 3.11 or newer** installed. If you don't have it, get it from <https://www.python.org/downloads/>.
  *On Windows, tick the box that says **"Add Python to PATH"** during install.*
- A **Fable** account — the one whose library you want to move.
- A **Goodreads** account — where the books will end up.

You don't need to know any code.

---

## Step 1 — Download the tool

1. On this page, click the green **Code** button → **Download ZIP**.
2. Unzip the file (double-click it on Mac, right-click → Extract All on Windows).
3. You'll get a folder called **fable-exporter** (or similar). Move it somewhere you'll remember — your Desktop is fine.

---

## Step 2 — Set it up (you only do this once)

This step installs the Python packages the tool needs and downloads a copy of Chromium (~150 MB) for it to use under the hood. It takes a couple of minutes.

### On Mac

1. Open **Terminal** (press `⌘ + Space`, type "Terminal", hit Enter).
2. Type `cd ` (with a space after `cd`) and then **drag the fable-exporter folder from Finder onto the Terminal window**. Hit Enter.
3. Run:
   ```
   ./setup.sh
   ```
   If you get a "permission denied" message, run this once to fix it, then try again:
   ```
   chmod +x setup.sh start.command
   ```

### On Windows

1. Open the fable-exporter folder in File Explorer.
2. Double-click **setup.bat**.
3. If Windows shows a **"Windows protected your PC"** warning, click **More info** → **Run anyway**. (This warning appears for any program you download from the internet.)

When you see **"Setup complete!"**, you're done with this step. You never need to do it again.

---

## Step 3 — Run the tool

### On Mac

Double-click **start.command** in the fable-exporter folder.

> First time only — Mac may say *"start.command cannot be opened because it is from an unidentified developer."*
> Fix: in Finder, **right-click** start.command → **Open** → **Open**. After that one time, double-click works normally.

### On Windows

Double-click **start.bat** in the fable-exporter folder.

A black Terminal window will appear (leave it open — that's the tool running) and your browser will open automatically to **http://localhost:5050**.

To stop the tool when you're done, close the Terminal window or press **Ctrl+C** inside it.

---

## Step 4 — Use the tool

You'll see a 3-step wizard:

1. **Connect to Fable** — Click the big "Connect to Fable" button.
   - A second browser window will pop open showing Fable's login page.
   - Log in as you normally would on the Fable website.
   - When you're logged in, come back to the first browser window (the tool) and click **"I'm logged in"**.
   - The tool will read all the books on your Fable shelves. This usually takes 10–60 seconds.

2. **Review your library** — A table of your books appears. Take a moment to:
   - Check the titles, authors, dates and ISBNs look right.
   - Add ratings if you want (you click the stars).
   - Delete anything you don't want to move across.
   - Edit anything by clicking on it — changes save automatically.

3. **Download & import** — Click **"Download Goodreads file"**. You'll get a file called `goodreads_import.csv`.

---

## Step 5 — Import into Goodreads

1. Go to <https://www.goodreads.com/review/import> (you may need to log in).
2. Click **Choose File** and pick the `goodreads_import.csv` you just downloaded.
3. Click **Import books**. Wait a minute or two while Goodreads processes them.
4. Your books should now appear in your Goodreads library, on the right shelves, with the right dates.

A few things to know:
- **Reviews don't transfer** — Goodreads' importer doesn't accept them via CSV. Ratings, shelves, and dates all transfer fine.
- **"Date Added"** in Goodreads is mapped from your Fable **start** date (the day you began reading the book). Goodreads doesn't have a separate "started" field, so this is the best fit.
- Books you haven't started yet (To-Read shelf) will have a blank Date Added — Goodreads will fill that in with today's date.

---

## Troubleshooting

### "Couldn't find Python 3.11 or newer" during setup
Install Python from <https://www.python.org/downloads/>, then re-run setup. On Windows, **tick the "Add Python to PATH" box** during install.

### Setup gets stuck on "Downloading Chromium"
That step downloads about 150 MB and can take a few minutes on slow connections. Give it up to 10 minutes before assuming it's stuck.

### The tool opens but says "couldn't capture Fable's auth headers"
You probably weren't fully logged in to Fable when you clicked "I'm logged in". Log out of Fable, refresh the tool, and try again.

### My browser doesn't open automatically
Open it yourself and go to <http://localhost:5050>.

### "Port 5050 already in use"
Another copy of the tool is probably still running in another Terminal window. Close that window first.

### Mac: "start.command cannot be opened because it is from an unidentified developer"
**Right-click** start.command → **Open** → **Open**. You only need to do this the very first time.

### Windows: "Windows protected your PC"
Click **More info** → **Run anyway**. Microsoft warns about any program you've downloaded — there's nothing actually wrong.

---

## Privacy

Everything in this tool runs on your own computer.

- Your **Fable password** is never seen or stored by this tool. You type it directly into Fable's website in the second browser window the tool opens.
- Your **book data** lives in a single file called `books.db` inside the fable-exporter folder. Delete that file to wipe everything.
- The only external service the tool talks to is **Fable's own API** (api.fable.co), to read your book list. We don't send your data anywhere else.

---

## For developers

The tool is a small Flask app. Folder layout:

| File | What it is |
|---|---|
| `app.py` | Flask app and HTTP routes |
| `db.py` | SQLite helpers |
| `scraper.py` | Playwright-based Fable scraper (runs on a background thread) |
| `transformer.py` | Goodreads CSV generator |
| `templates/` | Jinja2 page templates |
| `static/` | CSS and frontend JS |
| `requirements.txt` | Python deps |
| `setup.sh` / `setup.bat` | One-time installer scripts |
| `start.command` / `start.bat` | Double-clickable launchers |

To get hot-reload + the Werkzeug debugger during development:
```bash
FLASK_DEBUG=1 .venv/bin/python app.py
```

PRs welcome.
