# ShelfBridge

*Fable to Goodreads, in a few clicks.*

ShelfBridge gets your reading library out of Fable and into Goodreads. Fable doesn't have an export feature and Goodreads turned off their public API in 2020, so this little gap has been sitting there annoying me for a while. This is my way of bridging it. The tool runs locally, on your own machine or inside your own browser, and nothing about your library is sent anywhere on the way through.

There are two ways to run it:

- **Chrome extension.** Live on the Chrome Web Store, search for *ShelfBridge*. This is the easiest option for most people and needs nothing installed.
- **Local Python app.** Same tool, running as a small Flask app on your computer. Useful if you don't want to install the extension or you're on Linux.

Both talk to Fable the same way and produce the same CSV.

---

## Option 1: Chrome extension (recommended)

1. Open the [Chrome Web Store](https://chromewebstore.google.com/), search for **ShelfBridge**, and click **Add to Chrome**.
2. Pin the extension if you like, then click its icon. A new tab opens with the three-step wizard.
3. Follow the wizard (see [How to use it](#how-to-use-it) below).

Your books get stored in Chrome's local extension storage on your own computer. To wipe them, either remove the extension or clear its data from `chrome://settings/cookies`.

---

## Option 2: Local Python app

### What you'll need

- A Mac, Windows or Linux machine.
- Python 3.11 or newer installed. If you don't already have it, grab it from <https://www.python.org/downloads/>. Windows users: make sure you tick the "Add Python to PATH" box during the installer.
- A Fable account (the one whose library you want to export).
- A Goodreads account (where the books are heading).

You don't need to know how to code.

### Step 1 — Download the tool

1. Click the green **Code** button at the top of the GitHub page and pick **Download ZIP**.
2. Unzip the file. Double-click on Mac, right-click and "Extract All" on Windows.
3. You'll end up with a folder called `shelfbridge` (or something close). Drop it somewhere you'll find it again, your Desktop is fine.

### Step 2 — One-time setup

This step installs the bits the tool needs, plus a copy of Chromium for it to drive in the background. It's about 150 MB to download, so give it a minute or two.

#### Mac

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

#### Windows

1. Open the shelfbridge folder in File Explorer.
2. Double-click `setup.bat`.
3. If Windows pops up with "Windows protected your PC", click **More info** then **Run anyway**. That warning shows up for anything downloaded off the internet, it's not a problem with the tool.

Once you see "Setup complete!" you're done with this step forever.

### Step 3 — Run the tool

**Mac:** double-click `start.command`. The first time you do this, Mac may complain that the file is from an unidentified developer. Right-click it, pick **Open**, then **Open** again. You only have to do that the once, from then on a normal double-click works.

**Windows:** double-click `start.bat`.

Either way, a small terminal window appears (leave it open, that's the tool running) and your browser opens automatically at <http://localhost:5050>.

When you're done, close the terminal window or hit Ctrl+C inside it to stop the tool.

---

## How to use it

Whichever option you picked, the wizard is the same three steps:

1. **Connect to Fable.** Click the Connect button. The tool opens Fable in another tab and pops the login modal for you. Sign in as you normally would, then come back and click Connect again. The tool reads your shelves, which usually takes between ten and sixty seconds.
2. **Review your library.** A table of every book appears. Have a quick scroll through to check the titles, authors, dates and ISBNs look right. You can click any cell to edit it, click the stars to add ratings, and use the small × on each row to drop a book you don't want to migrate. Everything saves as you go.
3. **Download.** Hit **Download Goodreads file** and you'll get `goodreads_import.csv`.

---

## Importing into Goodreads

1. Head to <https://www.goodreads.com/review/import> (sign in if you need to).
2. Pick "Choose File" and select the CSV you just downloaded.
3. Hit "Import books" and give it a minute.
4. Your library should now be on Goodreads, on the right shelves, with your finish dates intact.

Two things worth knowing up front:

- **Reviews don't come across.** Goodreads' importer drops the review column on the floor, that's their limitation, not the tool's. Ratings, shelves and the date you finished each book all land fine.
- **Start dates don't survive the import.** Goodreads' CSV format has no "date started" column, so I put your Fable start date in "Date Added" as the nearest equivalent. It's sitting there in the file if you open it yourself, but Goodreads throws that value away on import and stamps its own date instead. Nothing I can do about it from this end.

---

## Troubleshooting

**Dates show as `#####` when I open the CSV in Excel or Numbers**
That's a spreadsheet display quirk, not a problem with the file. The dates are all there, the column is just too narrow to display them. Double-click the divider between the column letters at the top to auto-widen. Or open the file in Google Sheets or a plain text editor, which show it fine.

**"Couldn't find Python 3.11 or newer"**
Install Python from <https://www.python.org/downloads/> and re-run setup. On Windows, tick the "Add Python to PATH" box during install.

**Setup gets stuck on "Downloading Chromium"**
That step pulls down about 150 MB so give it up to ten minutes on a slow connection before assuming it's hung.

**The tool says "couldn't capture Fable's auth headers"**
You probably hadn't finished logging in when you clicked Connect. Log out of Fable, refresh the tool and walk through Connect again.

**The browser doesn't open automatically (Python app only)**
Open it yourself and go to <http://localhost:5050>.

**"Port 5050 already in use" (Python app only)**
Another copy of the tool is still running in a terminal window somewhere. Close that one and try again.

**Mac: "start.command cannot be opened because it is from an unidentified developer"**
Right-click `start.command`, pick **Open**, then **Open** again. You only have to do that once.

**Windows: "Windows protected your PC"**
Click **More info** then **Run anyway**.

---

## Privacy

Everything happens on your own computer or inside your own browser. Your Fable password isn't seen or stored by the tool, you sign in on Fable's own site. The only place the tool talks to outside your machine is Fable's own API at `api.fable.co`, to read your shelves. See [PRIVACY.md](PRIVACY.md) for the full write-up.

---

## For developers

This repo has both variants of the tool:

| Path | What it is |
|---|---|
| `extension/` | Chrome extension (MV3). The user-facing shipping path. |
| `app.py`, `scraper.py`, `transformer.py`, `db.py`, `templates/`, `static/` | Local Flask app, same functionality without needing Chrome. |
| `setup.sh` / `setup.bat` | One-time installer for the Python side. |
| `start.command` / `start.bat` | Double-clickable launchers for the Python app. |
| `requirements.txt` | Python deps. |

Both variants share the same header-snooping approach against `api.fable.co`. A naive `Authorization: Bearer <jwt>` returns 403, so the tool watches the SPA's own outgoing requests (via `chrome.webRequest` in the extension, `page.on("request")` in Playwright) and replays those headers verbatim.

For hot-reload and the Werkzeug debugger during development of the Flask app:

```bash
FLASK_DEBUG=1 .venv/bin/python app.py
```

To build a fresh ZIP of the extension for a Chrome Web Store update, bump the `version` in `extension/manifest.json` and run:

```bash
(cd extension && zip -r ../shelfbridge-v<version>.zip . -x "*.DS_Store" -x "__MACOSX/*")
```

PRs welcome.

---

## Licence

MIT, see [LICENSE](LICENSE). Use it for whatever, keep the copyright notice if you redistribute.
