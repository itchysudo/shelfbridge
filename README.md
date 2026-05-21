# ShelfBridge

*Fable to Goodreads, in a few clicks.*

ShelfBridge gets your reading library out of Fable and into Goodreads. Fable doesn't have an export feature and Goodreads turned off their public API in 2020, so this little gap has been sitting there annoying me for a while. This is my way of bridging it. The tool runs locally on your computer and nothing about your library is sent anywhere on the way through.

---

## What you'll need

- A Mac, Windows or Linux machine.
- Python 3.11 or newer installed. If you don't already have it, grab it from <https://www.python.org/downloads/>. Windows users: make sure you tick the "Add Python to PATH" box during the installer.
- A Fable account (the one whose library you want to export).
- A Goodreads account (where the books are heading).

You don't need to know how to code.

---

## Step 1 — Download the tool

1. Click the green **Code** button at the top of the GitHub page and pick **Download ZIP**.
2. Unzip the file. Double-click on Mac, right-click and "Extract All" on Windows.
3. You'll end up with a folder called `shelfbridge` (or something close). Drop it somewhere you'll find it again — your Desktop is fine.

---

## Step 2 — One-time setup

This step installs the bits the tool needs, plus a copy of Chromium for it to drive in the background. It's about 150 MB to download, so give it a minute or two.

### Mac

1. Open Terminal (Cmd+Space, type "Terminal", hit Enter).
2. Type `cd ` (note the space) and then drag the shelfbridge folder from Finder onto the Terminal window. Press Enter.
3. Run:
   ```
   ./setup.sh
   ```
   If you see "permission denied", fix it with:
   ```
   chmod +x setup.sh start.command
   ```
   then try again.

### Windows

1. Open the shelfbridge folder in File Explorer.
2. Double-click `setup.bat`.
3. If Windows pops up with "Windows protected your PC", click **More info** then **Run anyway**. That warning shows up for anything downloaded off the internet — it's not a problem with the tool.

Once you see "Setup complete!" you're done with this step forever.

---

## Step 3 — Run the tool

### Mac

Double-click `start.command`. The first time you do this, Mac may complain that the file is from an unidentified developer. Right-click it, pick **Open**, then **Open** again. You only have to do that the once — from then on a normal double-click works.

### Windows

Double-click `start.bat`.

Either way, a small terminal window appears (leave it open, that's the tool running) and your browser opens automatically at <http://localhost:5050>.

When you're done, close the terminal window or hit Ctrl+C inside it to stop the tool.

---

## Step 4 — Use the tool

There's a three-step wizard in the browser:

1. **Connect to Fable.** Click the Connect button. A second browser window will pop up on Fable's login page — sign in there as you normally would. Once you're in, come back to the first window and click "I'm logged in". The tool reads your shelves, which usually takes between ten and sixty seconds.
2. **Review your library.** A table of every book appears. Have a quick scroll through to check the titles, authors, dates and ISBNs look right. You can click any cell to edit it, click the stars to add ratings, and use the small × on each row to drop a book you don't want to migrate. Everything saves as you go.
3. **Download.** Hit "Download Goodreads file" and you'll get `goodreads_import.csv`.

---

## Step 5 — Import into Goodreads

1. Head to <https://www.goodreads.com/review/import> (sign in if you need to).
2. Pick "Choose File" and select the CSV you just downloaded.
3. Hit "Import books" and give it a minute.
4. Your library should now be on Goodreads, on the right shelves, with the right dates.

Two things worth knowing up front:

- **Reviews don't come across.** Goodreads' importer drops the review column on the floor — that's their limitation, not the tool's. Everything else (ratings, shelves, dates) lands cleanly.
- **"Date Added" in Goodreads = your Fable start date.** Goodreads' CSV format doesn't have a "date started" column of its own, so I've put your Fable start date there instead — it's the closest equivalent. Books on your To-Read shelf will have a blank Date Added, which Goodreads fills in with today's date on import.

---

## Troubleshooting

**"Couldn't find Python 3.11 or newer"**
Install Python from <https://www.python.org/downloads/> and re-run setup. On Windows, tick the "Add Python to PATH" box during install.

**Setup gets stuck on "Downloading Chromium"**
That step pulls down about 150 MB so give it up to ten minutes on a slow connection before assuming it's hung.

**The tool says "couldn't capture Fable's auth headers"**
You probably hadn't finished logging in when you clicked "I'm logged in". Log out of Fable, refresh the tool and walk through Connect again.

**The browser doesn't open automatically**
Open it yourself and go to <http://localhost:5050>.

**"Port 5050 already in use"**
Another copy of the tool is still running in a terminal window somewhere. Close that one and try again.

**Mac: "start.command cannot be opened because it is from an unidentified developer"**
Right-click `start.command`, pick **Open**, then **Open** again. You only have to do that once.

**Windows: "Windows protected your PC"**
Click **More info** then **Run anyway**.

---

## Privacy

Everything happens on your computer. Your Fable password isn't seen or stored by the tool — you sign in on Fable's own site in the second browser window. Your book data lives in a single file (`books.db`) inside the shelfbridge folder; delete that file to wipe it. The only place the tool talks to outside your machine is Fable's own API at `api.fable.co`, to read your shelves.

---

## For developers

It's a small Flask app:

| File | What it does |
|---|---|
| `app.py` | Flask app and HTTP routes |
| `db.py` | SQLite helpers |
| `scraper.py` | Playwright-based Fable scraper, runs on a background thread |
| `transformer.py` | Goodreads CSV generator |
| `templates/` | Jinja2 templates |
| `static/` | CSS and frontend JS |
| `requirements.txt` | Python deps |
| `setup.sh` / `setup.bat` | One-time installer scripts |
| `start.command` / `start.bat` | Double-clickable launchers |

For hot-reload and the Werkzeug debugger during development:

```bash
FLASK_DEBUG=1 .venv/bin/python app.py
```

There's also a Chrome extension version under [`extension/`](extension/) that does the same job without needing Python installed at all.

PRs welcome.

---

## Licence

MIT — see [LICENSE](LICENSE). Use it for whatever, keep the copyright notice if you redistribute.
