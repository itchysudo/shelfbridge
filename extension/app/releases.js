// ShelfBridge: release notes, shown on the welcome page and the What's new page.
//
// ADD AN ENTRY HERE EVERY RELEASE, at the top of RELEASES, with the same
// version as extension/manifest.json. tests/releases.test.mjs fails if the two
// don't match, so a release can't go out with last month's notes.
//
// Everything here ships inside the extension, including the roadmap
// (COMING_NEXT, below). The app doesn't fetch notes from anywhere, so both
// are only as up to date as the last release: update them together.
//
// Writing an entry:
//   * Lead with what the user can now do, in their words, not ours.
//   * Sentence case, UK spelling, no exclamation marks (the brand rules).
//   * Put the first three items in the order you want them on the welcome
//     page; only those three appear there.
//   * `source` credits where an idea came from, for example "Requested on
//     Reddit". Never name the person without their say-so.
//   * `icon` is a key of RELEASE_ICONS in app.js.
//   * `requires: "feedback"` hides an item until the feedback form is switched
//     on (FEEDBACK_URL in feedback.js), so the notes never point at a form
//     that isn't there.

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
                icon: "check",
                title: "Remove lots of books at once",
                text: "Tick the books you don't want, or tick them all, and remove them in one go.",
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
            {
                icon: "message",
                title: "Tell us what you think",
                text: "Send an idea or report a bug straight from ShelfBridge. Every message is read.",
                requires: "feedback",
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

// The roadmap: what's planned next, shown at the bottom of the What's new
// page. Only promise what's genuinely planned, and move an item into RELEASES
// when it ships. Same fields as a release item.
export const COMING_NEXT = [
    {
        icon: "calendar",
        title: "Dates that open properly in spreadsheets",
        text: "Open your file in Excel or Numbers first and some dates show as ##### or change format. We're fixing that, without changing what the importers receive.",
    },
    {
        icon: "check",
        title: "Progress shelf by shelf",
        text: "See Finished, Currently reading and Want to read tick off one by one while ShelfBridge reads your library.",
    },
];
