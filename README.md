# ShelfBridge

*Get your reading library out of Fable, in a few clicks.*

ShelfBridge gets your reading library out of Fable so you can take it somewhere else. Fable has no export feature of its own, so once your books are in there, they're stuck. That gap sat there annoying me for a while, and this is my way of bridging it. The tool runs locally, on your own machine or inside your own browser, and nothing about your library is sent anywhere on the way through.

You can send your library to:

- **Goodreads**, the original route and the one most people have used
- **StoryGraph**
- **Pagebound**

You don't have to pick just one. Your library stays in the tool after you download, so you can export again for somewhere else whenever you like.

There are two ways to run it:

- **Chrome extension.** Live on the Chrome Web Store, search for *ShelfBridge*. This is the easiest option for most people and needs nothing installed.
- **Local Python app.** Same tool, running as a small Flask app on your computer. Useful if you don't want to install the extension or you're on Linux. Note the extension is the one that gets new features first: the Python version currently only does Goodreads.

Both talk to Fable the same way.

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
- An account wherever the books are heading. The Python app currently exports for Goodreads only.

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
2. **Review your library.** A table of every book appears. Have a quick scroll through to check the titles, authors, dates and ISBNs look right. You can click any cell to edit it, set a rating on the stars (click the left half of a star for a half star), and use Remove on each row to drop a book you don't want to take with you. To drop lots at once, tick the box at the start of each row (hold Shift to tick a run of them, or use the box at the top to tick every book on show) and select Remove selected. Only books on show can be ticked, so pairing this with the shelf buttons or the date range is a quick way to clear out a whole group. Everything saves as you go. If you only want to move part of your library, say everything you've logged since you switched to Fable, set a From or To date above the table and only books in that period go into the file. A book is placed by its finish date, or its start date if you haven't finished it, and books with no dates at all are left out unless you tick the box to include them. The shelf buttons and the Sort by menu, by contrast, only change what you see. Sort by puts the list in order of title, author, finish date, start date or rating, either way round, with any book that has nothing to sort on at the bottom.
3. **Pick where it's going and download.** Choose Goodreads, StoryGraph or Pagebound. The page shows you what comes across for that one and walks you through importing it.

---

## What comes across, and what doesn't

Everything in this table was checked by actually importing into a real account, not read off a help page.

| | Goodreads | StoryGraph | Pagebound |
|---|---|---|---|
| Your shelves | yes | yes | yes |
| Whole-star ratings | yes | yes | yes |
| Finish dates | yes | yes | yes |
| Half-star ratings | rounded | rounded | **kept** |
| Start dates | no | no | no |
| Reviews | no | no | no |
| Every book | yes | yes | only ones it already has, and only with an ISBN |

**Start dates don't come across anywhere.** All three apps can store one, but none of the file formats they'll accept has a column to carry it, so the field is left blank and you'd have to fill it in yourself. Finish dates are fine everywhere.

**Half stars only survive on Pagebound.** Goodreads can't store them at all. StoryGraph can, but its Goodreads importer rounds them on the way in, so a 3.5 lands as a 4.

**Pagebound may not take everything.** It only brings across books that already exist in its own library, so anything it hasn't got a record of gets skipped. Pagebound says this on its upload page, and it also calls that import route beta. Worth checking your count after an import.

**Books with no ISBN are left out of the Pagebound file.** Pagebound finds a book by its ISBN and nothing else, so a book Fable has no ISBN for would go across as a row Pagebound has to guess at, and a wrong guess drops a book you've never read into your library. Rather than risk that, those books stay behind. The export page lists exactly which ones, and you can type the ISBN in yourself on the library page and export again. Audiobooks are the usual culprits: Fable sometimes holds an Amazon ASIN for them instead of an ISBN, and the two aren't interchangeable.

### One thing that looks wrong but isn't

The file is named after its **format**, not the app you picked. So:

| You pick | You get | Because |
|---|---|---|
| Goodreads | `goodreads_import.csv` | Goodreads' own import format |
| StoryGraph | `goodreads_library_export.csv` | StoryGraph only imports Goodreads files, not its own |
| Pagebound | `storygraph_library_export.csv` | Pagebound takes StoryGraph files, and that route works better than its Goodreads one |

Upload them exactly as they are. The export page says all this as you go, so you don't have to remember it.

---

## Importing

**Goodreads.** Head to <https://www.goodreads.com/review/import>, pick "Choose File", select the CSV, and hit "Import books". Give it a minute.

**StoryGraph.** Go to <https://app.thestorygraph.com/>, then Manage Account and find the import section. Use the **Goodreads** import option, because StoryGraph doesn't import its own files. Upload and give it a few minutes.

**Pagebound.** Go to <https://pagebound.co/import-library>, or click your profile picture, then the settings cog, then Import library. Choose the **StoryGraph** option, not the Goodreads one. Upload and give it a few minutes.

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

**The app says it only imports Goodreads or StoryGraph files, and rejects mine**
Make sure you picked the matching option in that app: StoryGraph's *Goodreads* import for the StoryGraph file, and Pagebound's *StoryGraph* option for the Pagebound one. These apps check the file's header to work out where it came from, so uploading it under the wrong option will bounce it.

**A book I've never read turned up in my Pagebound library**
This has happened to two people, and both times the book sat on the TBR shelf, unrated. It wasn't in either file, so Pagebound added it at its end. I can't see inside its matcher, so I can't tell you for certain why. What I can tell you is what we were handing it: rows with the ISBN column blank, which is the one column it goes on. From 1.1.1 those rows stay behind and get named on the export page instead, so that route is shut. It may not have been the only route, so if this happens to you on 1.1.1 or later I'd like to hear about it. Delete the book, update, and export again.

**Hardly any of my books imported**
First check you picked the matching option, as above. If you did, the app couldn't find your books in its own catalogue. Pagebound is explicit that it only transfers books already in its library, so expect some to be skipped there. Unusual editions and books with no ISBN are the most likely to be missed anywhere.

---

## Privacy

Everything happens on your own computer or inside your own browser. Your Fable password isn't seen or stored by the tool, you sign in on Fable's own site. The only place the tool talks to outside your machine is Fable's own API at `api.fable.co`, to read your shelves. See [PRIVACY.md](PRIVACY.md) for the full write-up.

---

## For developers

This repo has both variants of the tool:

| Path | What it is |
|---|---|
| `extension/` | Chrome extension (MV3). The user-facing shipping path. |
| `extension/app/targets.js` | Export formats and destinations. This is where you'd add a new one. |
| `tests/` | Tests for the export layer. No framework, run with `node tests/targets.test.mjs`. |
| `tools/inspect-csv.mjs` | Triage a CSV somebody sends in: `node tools/inspect-csv.mjs file.csv "book title"`. Reports the format, any shifted columns, rows with no usable ISBN, and values we'd never write. Dev only, doesn't ship. |
| `app.py`, `scraper.py`, `transformer.py`, `db.py`, `templates/`, `static/` | Local Flask app. Goodreads only, for now. |
| `setup.sh` / `setup.bat` | One-time installer for the Python side. |
| `start.command` / `start.bat` | Double-clickable launchers for the Python app. |
| `requirements.txt` | Python deps. |

Both variants share the same header-snooping approach against `api.fable.co`. A naive `Authorization: Bearer <jwt>` returns 403, so the tool watches the SPA's own outgoing requests (via `chrome.webRequest` in the extension, `page.on("request")` in Playwright) and replays those headers verbatim.

### Adding a destination

`targets.js` keeps **formats** and **destinations** separate, because they don't line up the way you'd expect. A destination rarely accepts the format named after it: StoryGraph wants a Goodreads export, and Pagebound wants a StoryGraph one. Adding a destination means adding an entry that points at whichever format that app really takes, and nothing else in the codebase changes.

One hard-won rule if you do: **get a real export out of the target app before writing the transformer.** Published column lists for Goodreads are wrong in both directions, and these apps identify a file by matching its header exactly, so a list that's the right length but the wrong contents gets silently rejected. Every format in `targets.js` was built from a real export and there are tests pinning those headers verbatim.

The other thing to settle is **what the destination matches a book on.** If it's ISBN and nothing else, say so with `matchesOn: "isbn"`, and `partitionBooks` will keep books with no ISBN out of the file. That flag exists because sending Pagebound a row with a blank ISBN put a book nobody had read into two different people's libraries. A destination that also matches on title and author, as Goodreads and StoryGraph do, doesn't need it.

For hot-reload and the Werkzeug debugger during development of the Flask app:

```bash
FLASK_DEBUG=1 .venv/bin/python app.py
```

Versions from 2.0 onwards take the form `2.YYMM.N`: the major version, then the year and month of the release, then a count that starts at 1 each month. So the first release in October 2026 is 2.2610.1, a second one that month would be 2.2610.2, and the first in November is 2.2611.1. Year comes before month because Chrome only accepts an update with a higher version number than the last, and month first would go backwards every January.

Each release also needs its notes. Add an entry at the top of `extension/app/releases.js` with the new version and what's changed. The welcome page shows its first three items and the What's new page lists every release. `npm test` fails if the newest notes don't match the manifest version, so they can't be forgotten. The roadmap shown at the bottom of the What's new page is `COMING_NEXT` in the same file, so update it at the same time. Ideas and bug reports from users arrive through the in-app feedback form, which adds rows to the dev request sheet via `tools/feedback-sheet.gs`; setup steps are at the top of that file, and the form stays hidden until `FEEDBACK_URL` in `extension/app/feedback.js` is set.

To build a fresh ZIP of the extension for a Chrome Web Store update, bump the `version` in `extension/manifest.json` and run:

```bash
(cd extension && zip -r ../shelfbridge-v<version>.zip . -x "*.DS_Store" -x "__MACOSX/*")
```

PRs welcome.

---

## Licence

MIT, see [LICENSE](LICENSE). Use it for whatever, keep the copyright notice if you redistribute.
