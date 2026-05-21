# Privacy Policy — ShelfBridge

*Last updated: 2026-05-21*

ShelfBridge is a Chrome extension that exports your reading library from
[Fable](https://fable.co) so you can import it into
[Goodreads](https://www.goodreads.com). It is built and maintained by
[itchysudo](https://github.com/itchysudo) as an open-source project.

The short version: **everything ShelfBridge does happens inside your own
browser. Your book data never leaves your computer except when you choose
to download it.**

---

## What data ShelfBridge accesses

When you click *Connect to Fable*, ShelfBridge:

1. Looks for a logged-in [fable.co](https://fable.co) tab in your browser, or
   opens one for you to sign in.
2. Observes the request headers Fable's own web app sends to its API
   (`api.fable.co`) so that ShelfBridge can make the same authenticated
   requests on your behalf.
3. Calls `api.fable.co` to fetch the books on your shelves — title, author,
   ISBN, cover image, start date, finish date, and your star rating (if any).

That is the entire scope of data ShelfBridge accesses. We do not read other
tabs, your browsing history, your saved passwords, or anything else.

## What data ShelfBridge stores

The books ShelfBridge fetches are saved locally to Chrome's extension
storage (`chrome.storage.local`), on your computer only. This lets you
return to ShelfBridge later and continue where you left off.

You can wipe this data at any time by **removing the extension** from
`chrome://extensions`, or by visiting `chrome://settings/cookies` and
clearing data for the extension.

## What data ShelfBridge sends to third parties

**None.**

- ShelfBridge has no backend server of its own.
- It does not include any analytics, telemetry, or tracking.
- It does not share, sell, or transmit your data to anyone.
- The only network calls it makes are to `fable.co` and `api.fable.co`,
  which are Fable's own services. Those calls are made from your browser,
  as your authenticated user, exactly as Fable's own web app would.

When you click *Download Goodreads file*, the CSV is generated entirely in
your browser and saved to your computer. **You** then choose whether and
when to upload it to Goodreads — ShelfBridge does not.

## Permissions explained

ShelfBridge requests the minimum permissions needed to do its job. Here's
what each one is for:

| Permission | Why we need it |
|---|---|
| `storage` | To save your scraped books locally so you can review and edit them. |
| `scripting` | To run our scraper inside your fable.co tab — that's how we read your library. |
| `tabs` | To find or open the fable.co tab when you click *Connect*. |
| `webRequest` | To observe the request headers Fable's own web app sends, so we can make the same authenticated API calls. |
| `host_permissions: https://fable.co/*` and `https://api.fable.co/*` | To restrict everything above to *only* Fable's domains. ShelfBridge cannot read or interact with any other website. |

ShelfBridge never sees, stores, or transmits your Fable password — you sign
in on Fable's own website, in your normal browser session.

## Your control

- **View your data:** open ShelfBridge and click *Library* to see exactly
  what's stored.
- **Delete one book:** click the × at the end of any row in the library.
- **Wipe everything:** remove the extension from `chrome://extensions`, or
  clear extension data from `chrome://settings/cookies`.
- **Stop using the extension:** simply disable or uninstall it. Nothing
  remains on any external server, because we don't run any.

## Changes to this policy

If we ever change how ShelfBridge handles data, this document will be
updated with a new date at the top. Material changes will also be noted in
the release notes for that version.

## Contact

Questions about this policy or how ShelfBridge handles your data? Please
[open an issue on GitHub](https://github.com/itchysudo/shelfbridge/issues).

For private inquiries, you can also reach the maintainer at the email
listed on the [GitHub profile](https://github.com/itchysudo).
