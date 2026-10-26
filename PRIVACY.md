# Privacy Policy: ShelfBridge

*Last updated: 2026-10-26*

ShelfBridge is a free Chrome extension I built so I could get my reading library out of [Fable](https://fable.co) and into [Goodreads](https://www.goodreads.com), [StoryGraph](https://app.thestorygraph.com) or [Pagebound](https://pagebound.co).

The short version: everything ShelfBridge does with your books happens inside your own browser. Your book data never leaves your computer unless you choose to download it. The only thing ShelfBridge ever sends to me is feedback, and only when you write some and press Send.

---

## What ShelfBridge looks at

When you click **Connect to Fable**, the extension:

1. Looks for a logged-in fable.co tab in your browser, or opens one for you to sign into.
2. Watches the headers that Fable's own web app sends to its API, so the extension can make the same authenticated requests on your behalf.
3. Calls `api.fable.co` to read your shelves (titles, authors, ISBNs, cover images, start dates and finish dates) and the ratings and written reviews you've left on Fable.

That's the entire scope. It doesn't read your other tabs, your history, your saved passwords or anything else on your computer.

## Where the data lives

The books the extension fetches are stored locally in Chrome's extension storage (`chrome.storage.local`), on your computer. This is so you can come back to ShelfBridge later and pick up where you left off without reading your library again. ShelfBridge also stores one small note there, the version of the release notes you last saw, so it knows whether to point out what's new.

To wipe it, either remove the extension from `chrome://extensions`, or clear the extension's storage from `chrome://settings/cookies`.

## Feedback you choose to send

ShelfBridge has a **Send feedback** form for ideas and bug reports. Nothing is sent unless you fill it in and press Send. When you do, it sends:

- whether it's an idea, a problem or something else,
- the summary and details you typed,
- the version of ShelfBridge you're using, so I can tell which release a bug is in,
- your email address, but only if you choose to give one.

Nothing about your books, your Fable account or your browser is included.

It's sent to a Google Apps Script that adds it as a row in a private Google Sheet that only I can see. That means Google handles it on my behalf, under [Google's privacy policy](https://policies.google.com/privacy). I use what you send to decide what to fix and build next. If you leave an email, I use it only to reply to you about that message, and never for anything else.

I keep feedback for as long as it's useful for deciding what to work on. If you'd like something you sent deleted, send another message through the form asking for that, using the same email address, and I'll remove it.

## What gets sent to third parties

There's no backend server I run. There are no analytics, no telemetry and no tracking. The extension only ever contacts:

- `fable.co` and `api.fable.co`, Fable's own services, to read your library. These requests come from your browser, as your signed-in user, exactly the way Fable's web app does it.
- Google's Apps Script service (`script.google.com`), and only when you press Send on the feedback form.

When you download a file for Goodreads, StoryGraph or Pagebound, it's generated in your browser and saved to your computer. It's up to you to decide whether, and when, to upload it. Your written reviews only go into the file if you tick the box to include them. Bear in mind that on Goodreads, an imported review appears on your public profile.

## The permissions, and why each one

ShelfBridge asks for the smallest set of permissions it can:

- `storage`, to save your books locally so you can review and edit them between sessions.
- `scripting`, to run the reader inside your fable.co tab; that's how it reads your library.
- `tabs`, to find the fable.co tab, or open one, when you click Connect.
- `webRequest`, to observe the headers Fable's own web app sends, so the extension can make matching authenticated requests.
- `host_permissions` for `https://fable.co/*` and `https://api.fable.co/*`, which restrict everything above to Fable's domains only. The extension can't see or interact with any other website.

The feedback form doesn't need a permission of its own. Your Fable password is never seen or stored by ShelfBridge: you sign in on Fable's own page, in your normal browser session.

## You're in control

- **See what's stored:** open ShelfBridge and the library page shows you exactly what's there.
- **Delete a book:** select **Remove** at the end of its row, or tick several and select **Remove selected**.
- **Wipe everything:** remove the extension from `chrome://extensions`, or clear extension data from `chrome://settings/cookies`.
- **Don't send feedback:** the form is entirely optional, and nothing is sent until you press Send.
- **Stop using it:** disable or uninstall the extension. Your library isn't sitting on any server somewhere, because I don't run one.

## If this policy changes

Material changes will get a new date at the top of this document and a note in ShelfBridge's What's new page for that version.

## Questions?

Open ShelfBridge, select **Help and guide**, then **Report a bug** or **Suggest an idea**, and leave your email if you'd like a reply.
