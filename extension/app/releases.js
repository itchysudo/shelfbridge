// ShelfBridge: release notes, shown on the welcome page and the What's new page.
//
// ADD AN ENTRY HERE EVERY RELEASE, at the top of RELEASES, with the same
// version as extension/manifest.json. tests/releases.test.mjs fails if the two
// don't match, so a release can't go out with last month's notes.
//
// Everything here ships inside the extension. ShelfBridge promises to talk to
// nothing but Fable, so release notes can't be fetched from the web. The
// roadmap, which changes between releases, lives in ROADMAP.md on GitHub and
// the app just links to it.
//
// Writing an entry:
//   * Lead with what the user can now do, in their words, not ours.
//   * Sentence case, UK spelling, no exclamation marks (the brand rules).
//   * Put the first three items in the order you want them on the welcome
//     page; only those three appear there.
//   * `source` credits where an idea came from, for example "Requested on
//     Reddit". Never name the person without their say-so.
//   * `icon` is a key of RELEASE_ICONS in app.js.

export const RELEASES = [
    {
        version: "2.2610.1",
        date: "2026-10",
        title: "A fresh look, and more control over what you export",
        items: [
            {
                icon: "calendar",
                title: "Export just part of your library",
                text: "Moved to Fable from somewhere else? Pick a date range and take only what you've logged since.",
                source: "Requested on Reddit",
            },
            {
                icon: "sort",
                title: "Sort your books your way",
                text: "Order your library by title, author, finish date or rating before you export.",
            },
            {
                icon: "sparkles",
                title: "A brighter, cleaner ShelfBridge",
                text: "A whole new look, easier to read, with dark mode that follows your device.",
            },
        ],
    },
    {
        version: "1.1",
        date: "2026-08",
        title: "Take your library to StoryGraph and Pagebound",
        items: [
            {
                icon: "send",
                title: "Three places to go",
                text: "Export to Goodreads, StoryGraph or Pagebound, each with its own import steps.",
            },
            {
                icon: "star",
                title: "Half stars",
                text: "Rate in half stars, and keep them all the way to Pagebound.",
            },
            {
                icon: "check",
                title: "No more surprise books",
                text: "Books Pagebound can't identify are held back and named, so you can add an ISBN first.",
            },
        ],
    },
];

// The newest release, which the welcome page shows.
export const LATEST_RELEASE = RELEASES[0];
