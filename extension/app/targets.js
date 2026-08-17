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
// These are the 23 columns a current Goodreads export carries. Goodreads
// dropped eight trailing columns (Recommended For through BCID) in mid-2022;
// older exports in the wild still have them, but importers written against
// the modern file expect this set.

const GOODREADS_EXPORT_COLUMNS = [
    "Book Id", "Title", "Author", "Author l-f", "Additional Authors",
    "ISBN", "ISBN13", "My Rating", "Average Rating", "Publisher", "Binding",
    "Number of Pages", "Year Published", "Original Publication Year",
    "Date Read", "Date Added", "Bookshelves", "Bookshelves with positions",
    "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
];

const pagebound = {
    id: "pagebound",
    label: "Pagebound",
    filename: "pagebound_import.csv",
    blurb: "Goes direct, so your start dates survive. Skips Goodreads entirely.",
    columns: GOODREADS_EXPORT_COLUMNS,

    instructions: [
        {
            before: "Open Pagebound and find the library import option. Their ",
            href: "https://support.pagebound.co/library_faq",
            linkText: "import help",
            after: " covers where it lives.",
        },
        {
            before: "Choose the option to import from a Goodreads CSV. This " +
                    "file is in exactly that format, which is why it works.",
        },
        { before: "Upload the file you just downloaded and give it a couple of minutes." },
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
        // gives us a single value, so route it to whichever column fits and
        // leave the other empty. ISBN13 is the more useful one for matching.
        const isbn10 = digits.length === 10 ? formatISBN(digits) : "";
        const isbn13 = digits.length === 13 ? formatISBN(digits) : "";

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
            // Fable supports half stars and Goodreads-shaped files don't, so
            // round to the nearest whole star rather than emit a value the
            // importer may not parse. Whole-star ratings are unaffected.
            "My Rating":       book.rating ? Math.round(book.rating) : 0,
            "Date Read":       formatDate(book.date_finished),
            "Date Added":      pickDateAdded(book),
            "Bookshelves":     book.shelf || "",
            "Exclusive Shelf": book.shelf || "",
            // Goodreads exports use 1 for a book you've finished and 0
            // otherwise. Mirroring that keeps read/unread unambiguous.
            "Read Count":      book.shelf === "read" ? 1 : 0,
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
