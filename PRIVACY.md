# Privacy Policy — ShelfBridge

*Last updated: 2026-05-21*

ShelfBridge is a Chrome extension I built so I could get my reading library out of [Fable](https://fable.co) and into [Goodreads](https://www.goodreads.com). It's open-source and lives at [github.com/itchysudo/shelfbridge](https://github.com/itchysudo/shelfbridge).

The short version: everything ShelfBridge does happens inside your own browser. Your book data never leaves your computer unless you choose to download it.

---

## What ShelfBridge looks at

When you click **Connect to Fable**, the extension:

1. Looks for a logged-in fable.co tab in your browser, or opens one for you to sign into.
2. Watches the headers that Fable's own web app sends to its API, so the extension can make the same authenticated requests on your behalf.
3. Calls `api.fable.co` to read your shelves — titles, authors, ISBNs, cover images, start dates, finish dates, and any star ratings.

That's the entire scope. It doesn't read your other tabs, your history, your saved passwords or anything else on your computer.

## Where the data lives

The books the extension fetches are stored locally in Chrome's extension storage (`chrome.storage.local`), on your computer. Nothing else. This is so you can come back to ShelfBridge later and pick up where you left off without re-scraping.

To wipe it: either remove the extension from `chrome://extensions`, or clear the extension's storage from `chrome://settings/cookies`.

## What gets sent to third parties

Nothing.

There's no backend server I run. There are no analytics, no telemetry, no tracking. The only network calls the extension makes are to `fable.co` and `api.fable.co`, which are Fable's own services — and those happen from your browser, as your authenticated user, exactly the way Fable's web app does it.

When you hit **Download Goodreads file**, the CSV is generated in your browser and saved to your computer. It's up to you to decide whether (and when) to upload it to Goodreads.

## The permissions, and why each one

ShelfBridge asks for the smallest set of permissions it can:

- `storage` — to save your books locally so you can review and edit them between sessions.
- `scripting` — to run the scraper inside your fable.co tab; that's how it reads your library.
- `tabs` — to find the fable.co tab, or open one, when you click Connect.
- `webRequest` — to observe the headers Fable's own web app sends, so the extension can make matching authenticated requests.
- `host_permissions` for `https://fable.co/*` and `https://api.fable.co/*` — this restricts everything above to Fable's domains only. The extension can't see or interact with any other website.

Your Fable password is never seen or stored by ShelfBridge. You sign in on Fable's own page, in your normal browser session.

## You're in control

- **See what's stored:** open ShelfBridge and the Library view shows you exactly what's there.
- **Delete a book:** click the small × at the end of any row.
- **Wipe everything:** remove the extension from `chrome://extensions`, or clear extension data from `chrome://settings/cookies`.
- **Stop using it:** disable or uninstall the extension. There's nothing of yours sitting on any server somewhere, because I don't run one.

## If this policy changes

Material changes will get a new date at the top of this document and a note in the release notes for that version.

## Questions?

Please [open an issue on GitHub](https://github.com/itchysudo/shelfbridge/issues) — that's the easiest way to reach me. For anything you'd rather not put in public, the email on my [GitHub profile](https://github.com/itchysudo) works too.
