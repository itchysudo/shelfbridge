// ShelfBridge — export target definitions.
//
// Each destination we can export to is one entry in TARGETS. A target owns
// everything that differs between destinations: its column list, how a book
// maps onto those columns, the filename, and the import instructions shown
// on the export page. Adding a new destination means adding one entry here,
// not touching the scraper or the export view.
//
// The scraper and storage layers are deliberately destination-agnostic —
// they store a book in our own shape, and targets translate at the last
// moment.
//
// ---------------------------------------------------------------------------
// A note on the two different Goodreads formats, because they are easy to mix
// up and the difference is the whole reason this file exists:
//
//   * Goodreads IMPORT format (26 columns, starts with "Title") is what
//     goodreads.com/review/import accepts. That's the "goodreads" target.
//   * Goodreads EXPORT format (23 columns, starts with "Book Id") is what
//     Goodreads *produces* when you export your library. Other reading apps
//     built "import from Goodreads" flows against that shape, so it's what
//     they expect. That's the "pagebound" target.
//
// Emitting the export shape directly is what lets a user skip Goodreads
// altogether. That matters for more than convenience: Goodreads discards the
// Date Added value on import, so start dates only survive on paths that don't
// route through Goodreads.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Shared field helpers.
// ---------------------------------------------------------------------------

// Our stored dates are YYYY-MM-DD. Both Goodreads formats want YYYY/MM/DD.
// Also tolerates a full timestamp by keeping only the date portion.
function formatDate(s) {
    if (!s) return "";
    const datePart = String(s).split(" ")[0].split("T")[0];
    return datePart.replace(/-/g, "/");
}

// Wrap an ISBN as ="..." so spreadsheet apps don't mangle the long number
// (they'd otherwise convert to scientific notation or strip leading zeros).
// Goodreads-style importers understand and strip the wrapper.
function formatISBN(isbn) {
    if (!isbn) return "";
    return `="${isbn}"`;
}

// Strip anything that isn't a digit or X so we can measure an ISBN's length
// reliably. Fable sometimes returns hyphenated values.
function isbnDigits(isbn) {
    return String(isbn || "").replace(/[^0-9Xx]/g, "");
}

// Pick the best value for the "Date Added" column.
//
// Neither Goodreads format has a "date started" column, so we put Fable's
// start date there as the nearest equivalent. Falls back to the finish date
// for books already read, so the row still carries a real historical date.
// Empty means the destination will stamp its own date on import.
function pickDateAdded(book) {
    if (book.date_started) return formatDate(book.date_started);
    if (book.shelf === "read" && book.date_finished) {
        return formatDate(book.date_finished);
    }
    return "";
}

// Convert "Ursula Le Guin" into "Le Guin, Ursula" for Goodreads' "Author l-f"
// column.
//
// This is deliberately conservative. Splitting a display name into first and
// last parts is guesswork, and getting it wrong looks worse than leaving the
// column empty — importers match on ISBN and title first, so this field is a
// nicety rather than load-bearing. We only handle the unambiguous two-word
// case and bail out on everything else: multi-author strings (which our
// scraper joins with ", "), names that already contain a comma, mononyms,
// and long names where the surname boundary isn't obvious.
function authorLastFirst(author) {
    const name = String(author || "").trim();
    if (!name || name.includes(",")) return "";
    const parts = name.split(/\s+/);
    if (parts.length !== 2) return "";
    return `${parts[1]}, ${parts[0]}`;
}


// ---------------------------------------------------------------------------
// Target: Goodreads (the original path).
// ---------------------------------------------------------------------------
// The exact 26 columns goodreads.com/review/import accepts, in order. Every
// column must be present even when empty or the importer rejects the file.

const GOODREADS_IMPORT_COLUMNS = [
    "Title", "Author", "ISBN", "My Rating", "Average Rating", "Publisher",
    "Binding", "Year Published", "Original Publication Year", "Date Read",
    "Date Added", "Bookshelves", "Bookshelves with positions",
    "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
    "Recommended For", "Recommended By", "Owned Copies",
    "Original Purchase Date", "Original Purchase Location", "Condition",
    "Condition Description", "BCID",
];

const goodreads = {
    id: "goodreads",
    label: "Goodreads",
    filename: "goodreads_import.csv",
    blurb: "The original path. Ratings, shelves and finish dates carry over.",
    columns: GOODREADS_IMPORT_COLUMNS,

    // Each step is {before, href, linkText, after}. Only `before` is required;
    // the link and `after` let a step put a link mid-sentence rather than
    // stranding it at the end.
    instructions: [
        {
            before: "Open ",
            href: "https://www.goodreads.com/review/import",
            linkText: "goodreads.com/review/import",
            after: " in a new tab.",
        },
        { before: "Click Choose File and pick the file you just downloaded." },
        { before: "Click Import books and wait a minute or two." },
    ],

    notes: [
        "<strong>Date Read</strong> comes from your Fable <em>finish</em> date.",
        "<strong>Start dates don't survive.</strong> We put your Fable start " +
        "date in Date Added, but Goodreads throws that value away on import " +
        "and stamps its own. Nothing we can do from this end.",
        "<strong>Reviews aren't accepted</strong> by Goodreads' importer. " +
        "Only ratings, shelves and dates come across.",
    ],

    // Columns not listed here are emitted empty.
    mapRow(book) {
        return {
            "Title":           book.title || "",
            "Author":          book.author || "",
            "ISBN":            formatISBN(book.isbn),
            "My Rating":       book.rating || 0,
            "Date Read":       formatDate(book.date_finished),
            "Date Added":      pickDateAdded(book),
            "Exclusive Shelf": book.shelf || "",
            "Bookshelves":     book.shelf || "",
        };
    },
};


// ---------------------------------------------------------------------------
// Target: Pagebound.
// ---------------------------------------------------------------------------
// Pagebound imports a Goodreads *export* file ("you can import your Goodreads
// library via CSV, and we will transfer whatever data is available"), so we
// emit that shape rather than inventing a Pagebound-specific format.
//
// These are the 23 columns a current Goodreads export carries, taken from a
// real 2026 export rather than from documentation — the published column lists
// are out of date and cost us a rejected import. Goodreads dropped eight
// columns in mid-2022: Average Rating plus the seven from Recommended For to
// BCID. Owned Copies survived and is last.
//
// Pagebound checks this header to decide whether a file really is a Goodreads
// export, so the names and their order have to match exactly. Getting the
// column *count* right isn't enough.

const GOODREADS_EXPORT_COLUMNS = [
    "Book Id", "Title", "Author", "Author l-f", "Additional Authors",
    "ISBN", "ISBN13", "My Rating", "Publisher", "Binding",
    "Number of Pages", "Year Published", "Original Publication Year",
    "Date Read", "Date Added", "Bookshelves", "Bookshelves with positions",
    "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
    "Owned Copies",
];

const pagebound = {
    id: "pagebound",
    label: "Pagebound",
    // Named the way Goodreads names its own export. Pagebound asks for "a
    // Goodreads or StoryGraph file", so this is both the least confusing thing
    // to hand their upload box and one fewer difference for their source
    // detection to trip over.
    filename: "goodreads_library_export.csv",
    blurb: "Goes direct, so your start dates survive. Skips Goodreads entirely.",
    columns: GOODREADS_EXPORT_COLUMNS,

    instructions: [
        {
            before: "Open ",
            href: "https://pagebound.co/import-library",
            linkText: "pagebound.co/import-library",
            after: ", or click your profile picture, then the settings cog, " +
                   "then Import library.",
        },
        {
            before: "Click Choose file and pick the file you just downloaded. " +
                    "Pagebound imports Goodreads CSVs, and this file is in " +
                    "exactly that format, which is why it works.",
        },
        {
            before: "Start the import. It takes a few minutes, and Pagebound " +
                    "lets you know once your books are in.",
        },
    ],

    notes: [
        "<strong>Your start dates survive this route.</strong> Going straight " +
        "to Pagebound skips Goodreads, and Goodreads was the thing that " +
        "discarded them.",
        "<strong>Date Read</strong> comes from your Fable <em>finish</em> date, " +
        "and <strong>Date Added</strong> from your Fable <em>start</em> date.",
        "We don't have publisher, page count or publication year from Fable, " +
        "so those columns are left empty. Pagebound fills in what it can from " +
        "the ISBN.",
    ],

    mapRow(book) {
        const digits = isbnDigits(book.isbn);

        // A Goodreads export splits ISBNs across two columns by length. Fable
        // gives us a single value, so route it to whichever column fits.
        //
        // The empty side still gets the ="" wrapper rather than a bare empty
        // cell, because that's what a real export does — a book with no ISBN
        // comes out as ="" in both columns, not as nothing.
        const isbn10 = digits.length === 10 ? formatISBN(digits) : '=""';
        const isbn13 = digits.length === 13 ? formatISBN(digits) : '=""';

        return {
            // Book Id is Goodreads' own internal identifier. We have Fable's
            // UUID instead, which would mean nothing here, so leave it empty
            // and let Pagebound match on ISBN and title.
            "Book Id":         "",
            "Title":           book.title || "",
            "Author":          book.author || "",
            "Author l-f":      authorLastFirst(book.author),
            "ISBN":            isbn10,
            "ISBN13":          isbn13,
            // A real export writes rated books with one decimal place ("3.0")
            // and unrated ones as a bare "0". Mirroring that exactly.
            //
            // Fable supports half stars and Goodreads doesn't, so we round to
            // the nearest whole star. The column is clearly decimal-capable, so
            // passing 3.5 through may well work, but no real export contains a
            // half value to confirm it against — not worth risking on the same
            // change that's trying to get the import accepted at all.
            "My Rating":       book.rating ? `${Math.round(book.rating)}.0` : 0,
            "Date Read":       formatDate(book.date_finished),
            "Date Added":      pickDateAdded(book),
            "Bookshelves":     book.shelf || "",
            "Exclusive Shelf": book.shelf || "",
            // Goodreads exports use 1 for a book you've finished and 0
            // otherwise. Mirroring that keeps read/unread unambiguous.
            "Read Count":      book.shelf === "read" ? 1 : 0,
            // Always 0 in a real export unless you track physical copies,
            // which Fable has no concept of.
            "Owned Copies":    0,
        };
    },
};


// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------
// Order here is the order shown in the export page's picker. Goodreads stays
// first because it's the path most people arrive expecting.

export const TARGETS = [goodreads, pagebound];

export const DEFAULT_TARGET_ID = "goodreads";

// Look up a target by id, falling back to the default rather than throwing —
// a stale id in storage shouldn't leave the user stuck with a dead page.
export function getTarget(id) {
    return TARGETS.find((t) => t.id === id)
        || TARGETS.find((t) => t.id === DEFAULT_TARGET_ID);
}
