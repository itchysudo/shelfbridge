// ShelfBridge — export formats and destinations.
//
// Two separate ideas live in this file, and keeping them apart is what makes it
// readable:
//
//   FORMATS      the actual shape of a CSV — its columns and how a book maps
//                onto them. There are three.
//   DESTINATIONS the apps a user can send their library to. Each destination
//                picks one format.
//
// The confusing part, which is why this comment exists: a destination usually
// does NOT use the format named after it. All of the below was established by
// testing against real accounts, not from documentation:
//
//   Goodreads   accepts the Goodreads IMPORT shape (26 columns)
//   StoryGraph  accepts a Goodreads EXPORT file. It has no "import StoryGraph
//               CSV" option at all — its own export format is for feeding other
//               apps, not itself.
//   Pagebound   accepts either a Goodreads export or a StoryGraph export, but
//               the Goodreads route only works when Book Id is filled in, and
//               we never have Goodreads' internal ids. So Pagebound gets the
//               StoryGraph shape, which identifies books by plain ISBN.
//
// Adding a destination means adding one entry to DESTINATIONS pointing at
// whichever format that app actually accepts. Nothing else changes.
//
// The scraper and storage layers stay destination-agnostic: they store a book
// in our own shape and translation happens here, at the last moment.


// ---------------------------------------------------------------------------
// Shared field helpers.
// ---------------------------------------------------------------------------

// Our stored dates are YYYY-MM-DD. Every format here wants YYYY/MM/DD. Also
// tolerates a full timestamp by keeping only the date portion.
function formatDate(s) {
    if (!s) return "";
    const datePart = String(s).split(" ")[0].split("T")[0];
    return datePart.replace(/-/g, "/");
}

// Wrap an ISBN as ="..." so spreadsheet apps don't mangle the long number
// (they'd otherwise convert to scientific notation or strip leading zeros).
// Goodreads writes ISBNs this way in both its formats. StoryGraph does NOT —
// its ISBNs are bare.
function formatISBN(isbn) {
    if (!isbn) return "";
    return `="${isbn}"`;
}

// Strip anything that isn't a digit or X so we can measure an ISBN's length
// reliably. Fable sometimes returns hyphenated values.
function isbnDigits(isbn) {
    return String(isbn || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}

// Pick the best value for a "Date Added" column.
//
// None of these formats has a "date started" column, so Fable's start date goes
// in Date Added as the nearest equivalent. Falls back to the finish date for
// books already read, so the row still carries a real historical date. Empty
// means the destination stamps its own date on import.
//
// Do not promise users their start dates "survive". What actually happens,
// measured in all three:
//   Goodreads   discards the value outright and stamps its own date
//   StoryGraph  stores it (a later export hands it back) but never displays it
//   Pagebound   doesn't display it either
// So no destination shows a start date anywhere. We still fill the column
// because it costs nothing and keeps the value recoverable in a future export,
// but the UI must not imply the user will see it.
function pickDateAdded(book) {
    if (book.date_started) return formatDate(book.date_started);
    if (book.shelf === "read" && book.date_finished) {
        return formatDate(book.date_finished);
    }
    return "";
}

// Format a rating the way real exports do: a whole number gets one decimal
// place ("3.0"), and fractions are left alone ("2.5", "3.25"). Fable supports
// half stars, so we never round — every format here writes the rating column as
// a decimal and we let the destination decide.
//
// What each destination actually does with a fraction, measured rather than
// assumed:
//   Goodreads   whole stars only, so it flattens them
//   StoryGraph  its Goodreads importer rounds: 3.5 arrives as 4
//   Pagebound   keeps halves (3.5 stays 3.5), rounds quarters (4.25 -> 4)
// Fable rates in quarter stars (4.75 and 4.25 are real values), so nowhere
// keeps every rating exactly; Pagebound comes closest.
function decimalRating(rating) {
    return Number.isInteger(rating) ? `${rating}.0` : String(rating);
}

// Convert "Ursula Le Guin" into "Le Guin, Ursula" for Goodreads' "Author l-f"
// column.
//
// Deliberately conservative. Splitting a display name into first and last parts
// is guesswork, and getting it wrong looks worse than leaving the column empty —
// importers match on ISBN and title first, so this field is a nicety rather than
// load-bearing. We only handle the unambiguous two-word case and bail out on
// everything else: multi-author strings (which our scraper joins with ", "),
// names that already contain a comma, mononyms, and long names where the surname
// boundary isn't obvious.
function authorLastFirst(author) {
    const name = String(author || "").trim();
    if (!name || name.includes(",")) return "";
    const parts = name.split(/\s+/);
    if (parts.length !== 2) return "";
    return `${parts[1]}, ${parts[0]}`;
}

// ---------------------------------------------------------------------------
// ISBN-10 <-> ISBN-13 conversion.
// ---------------------------------------------------------------------------
// Fable gives us one ISBN, but a real Goodreads export fills both its ISBN and
// ISBN13 columns for nearly every book, and StoryGraph wants the 13-digit form.
// The two forms convert deterministically, so we can always supply what's
// wanted. The conversion is pure arithmetic on the check digit and invents no
// information. Only 978-prefixed ISBN-13s have a 10-digit equivalent; the 979
// range has none.

// EAN-13 check digit: alternate weights of 1 and 3 across the first 12 digits.
function ean13CheckDigit(twelve) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
        sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return String((10 - (sum % 10)) % 10);
}

// ISBN-10 check digit: weights 10 down to 2, modulo 11, with 10 written as X.
function isbn10CheckDigit(nine) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += Number(nine[i]) * (10 - i);
    }
    const check = (11 - (sum % 11)) % 11;
    return check === 10 ? "X" : String(check);
}

function isbn10to13(isbn10) {
    if (!/^\d{9}[\dX]$/.test(isbn10)) return "";
    const twelve = `978${isbn10.slice(0, 9)}`;
    return twelve + ean13CheckDigit(twelve);
}

function isbn13to10(isbn13) {
    if (!/^978\d{10}$/.test(isbn13)) return "";
    const nine = isbn13.slice(3, 12);
    return nine + isbn10CheckDigit(nine);
}

// Does this value's check digit add up? Both ISBN lengths carry one, and
// verifying it is what separates a real identifier from a typo or a truncated
// paste.
//
// This matters more than it looks, because length alone is not enough. A
// 10-digit value that was never an ISBN still satisfies isbn10to13, which
// prepends 978 and computes a FRESH check digit, so nonsense would leave here
// as a syntactically perfect ISBN-13 and point the destination at whichever
// real book owns that number. A blank column gives a destination nothing to
// match on; a well-formed wrong number gives it confident rubbish. The second
// is worse, and it is the same class of failure this filter exists to prevent.
//
// It bites here specifically because the export page now tells people to type
// missing ISBNs in by hand, and hand-copying 13 digits is exactly where
// single-digit slips come from.
function isbnCheckDigitOk(digits) {
    if (digits.length === 13) {
        return ean13CheckDigit(digits.slice(0, 12)) === digits[12];
    }
    if (digits.length === 10) {
        return isbn10CheckDigit(digits.slice(0, 9)) === digits[9];
    }
    return false;
}

// Return {ten, thirteen} for whichever single ISBN Fable gave us, filling in
// the other form where it exists. Either may be an empty string, and both are
// empty for anything that does not check out.
function bothIsbnForms(isbn) {
    const digits = isbnDigits(isbn);
    if (!isbnCheckDigitOk(digits)) return { ten: "", thirteen: "" };
    if (digits.length === 10) return { ten: digits, thirteen: isbn10to13(digits) };
    return { ten: isbn13to10(digits), thirteen: digits };
}

// One definition of "this book carries an identifier we can use", exported so
// the library page can highlight exactly the rows partitionBooks would hold
// back.
//
// It is exported because two definitions drifted apart once already: the
// library table tested the stored string for truthiness while this tested
// normalised digits, so a book carrying an Amazon ASIN looked perfectly fine in
// the table and then quietly vanished from the file. That is the very case the
// filter was written for.
export function hasUsableIsbn(isbn) {
    const { ten, thirteen } = bothIsbnForms(isbn);
    return Boolean(ten || thirteen);
}


// ===========================================================================
// FORMAT 1 — Goodreads import (26 columns)
// ===========================================================================
// What goodreads.com/review/import accepts. Every column must be present even
// when empty or the importer rejects the file. Note this is a different shape
// from what Goodreads *exports*, which trips people up constantly.

const GOODREADS_IMPORT_FORMAT = {
    columns: [
        "Title", "Author", "ISBN", "My Rating", "Average Rating", "Publisher",
        "Binding", "Year Published", "Original Publication Year", "Date Read",
        "Date Added", "Bookshelves", "Bookshelves with positions",
        "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
        "Recommended For", "Recommended By", "Owned Copies",
        "Original Purchase Date", "Original Purchase Location", "Condition",
        "Condition Description", "BCID",
    ],

    // Columns not listed here are emitted empty.
    mapRow(book) {
        return {
            "Title":           book.title || "",
            "Author":          book.author || "",
            // Passed through exactly as Fable gave it, hyphens and all. This is
            // the one path that's already live for real users, so it stays
            // byte-for-byte what it was before the formats were split out.
            "ISBN":            formatISBN(book.isbn),
            // Rounded, unlike the other two formats. Goodreads stores whole
            // stars only, and now that the library page lets people enter half
            // stars we'd otherwise be handing its importer a 3.5 it can't use.
            // Better to round predictably here than find out how it reacts.
            "My Rating":       book.rating ? Math.round(book.rating) : 0,
            "Date Read":       formatDate(book.date_finished),
            "Date Added":      pickDateAdded(book),
            "Exclusive Shelf": book.shelf || "",
            "Bookshelves":     book.shelf || "",
            // Only there when the person chose to include reviews; app.js
            // strips them otherwise. "Spoiler" stays empty: what a real
            // Goodreads export writes in it hasn't been checked yet.
            "My Review":       book.review || "",
        };
    },
};


// ===========================================================================
// FORMAT 2 — Goodreads export (23 columns)
// ===========================================================================
// What Goodreads produces when you export your library, and therefore what apps
// with an "import from Goodreads" flow expect. StoryGraph uses this.
//
// The column list comes from a real 2026 export, NOT from documentation.
// Published lists are wrong: they claim Average Rating is still present and that
// Owned Copies was removed, when it's the other way round. Both lists happen to
// be 23 columns long, so a column count check won't catch the difference — and
// importers compare the header to decide whether a file really is a Goodreads
// export, so getting it wrong means outright rejection.

const GOODREADS_EXPORT_FORMAT = {
    columns: [
        "Book Id", "Title", "Author", "Author l-f", "Additional Authors",
        "ISBN", "ISBN13", "My Rating", "Publisher", "Binding",
        "Number of Pages", "Year Published", "Original Publication Year",
        "Date Read", "Date Added", "Bookshelves", "Bookshelves with positions",
        "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
        "Owned Copies",
    ],

    mapRow(book) {
        const { ten, thirteen } = bothIsbnForms(book.isbn);

        return {
            // Goodreads' own internal identifier. We have Fable's UUID, which
            // would mean nothing here. StoryGraph copes fine with this empty and
            // matches on ISBN instead. Pagebound does NOT, which is why
            // Pagebound uses the StoryGraph format rather than this one.
            "Book Id":         "",
            "Title":           book.title || "",
            "Author":          book.author || "",
            "Author l-f":      authorLastFirst(book.author),
            // Both columns get filled, as a real export does. An empty side
            // still carries the ="" wrapper rather than being blank, again
            // matching what Goodreads actually writes.
            "ISBN":            ten ? formatISBN(ten) : '=""',
            "ISBN13":          thirteen ? formatISBN(thirteen) : '=""',
            // A real export writes rated books with a decimal and unrated ones
            // as a bare 0. Fractions are passed through rather than rounded:
            // StoryGraph stores quarter stars natively, so a half star may well
            // survive this route, and if it doesn't the destination rounds it
            // for us anyway.
            "My Rating":       book.rating ? decimalRating(book.rating) : 0,
            "Date Read":       formatDate(book.date_finished),
            "Date Added":      pickDateAdded(book),
            "Bookshelves":     book.shelf || "",
            "Exclusive Shelf": book.shelf || "",
            "My Review":       book.review || "",
            "Read Count":      book.shelf === "read" ? 1 : 0,
            // Always 0 in a real export unless you track physical copies, which
            // Fable has no concept of.
            "Owned Copies":    0,
        };
    },
};


// ===========================================================================
// FORMAT 3 — StoryGraph export (23 columns)
// ===========================================================================
// What StoryGraph produces. Pagebound accepts it, and it suits Fable data better
// than the Goodreads shape does:
//
//   * books are identified by ISBN/UID — a plain ISBN, no internal id to look up
//   * Star Rating holds fractions, so half stars survive as half stars
//   * Date Added is honoured, so start dates live
//
// Column list taken verbatim from a real August 2026 export. Note the ISBN is
// written BARE here, with no ="..." wrapper — the opposite of both Goodreads
// formats.

const STORYGRAPH_FORMAT = {
    columns: [
        "Title", "Authors", "Contributors", "ISBN/UID", "Format", "Read Status",
        "Date Added", "Last Date Read", "Dates Read", "Read Count", "Moods",
        "Pace", "Character- or Plot-Driven?", "Strong Character Development?",
        "Loveable Characters?", "Diverse Characters?", "Flawed Characters?",
        "Star Rating", "Review", "Content Warnings",
        "Content Warning Description", "Tags", "Owned?",
    ],

    mapRow(book) {
        const { thirteen } = bothIsbnForms(book.isbn);
        const finished = formatDate(book.date_finished);
        const started = formatDate(book.date_started);

        // Dates Read is the one place in any of these formats that can carry a
        // start date. A real StoryGraph export writes it as "start-finish" when
        // both are known:
        //
        //   2026/01/05-2026/02/01   started and finished
        //   2026/06/23              finish only, no start recorded
        //   (empty)                 still reading
        //
        // Confirmed by setting a start date in StoryGraph by hand and exporting
        // again: that single book's Dates Read became a range while every other
        // row stayed a lone date.
        const datesRead = (started && finished) ? `${started}-${finished}` : finished;

        return {
            "Title":       book.title || "",
            // Fable joins multiple authors with ", " and we pass that through
            // rather than guessing which is primary. Matching is ISBN-led, so
            // this is display data.
            "Authors":     book.author || "",
            "Contributors": "",
            // StoryGraph uses the 13-digit form, unwrapped.
            "ISBN/UID":    thirteen,
            // Fable doesn't tell us the edition format (hardcover, digital…).
            "Format":      "",
            // Our internal shelf names already match StoryGraph's spelling.
            // read and currently-reading were confirmed against a real export;
            // to-read was verified by a successful import into Pagebound, where
            // it landed on the TBR list.
            "Read Status": book.shelf || "",
            "Date Added":  pickDateAdded(book),
            "Last Date Read": finished,
            "Dates Read":     datesRead,
            "Read Count":  book.shelf === "read" ? 1 : 0,
            // Unrated is EMPTY here, not zero — the opposite of the Goodreads
            // formats. Fractions pass through untouched, which is the whole
            // reason this format is worth having.
            "Star Rating": book.rating ? decimalRating(book.rating) : "",
            "Review":      book.review || "",
            "Tags":        "",
            "Owned?":      "No",
        };
    },
};


// ===========================================================================
// DESTINATIONS
// ===========================================================================

const goodreads = {
    id: "goodreads",
    label: "Goodreads",
    filename: "goodreads_import.csv",
    blurb: "The original, best-tested route.",
    ...GOODREADS_IMPORT_FORMAT,

    // A compact "what arrives and what doesn't" for the export page. Scannable
    // at a glance, which the prose notes underneath are not — the point is to
    // make choosing between destinations easy.
    summary: {
        keeps: ["Your shelves", "Whole-star ratings", "Finish dates"],
        loses: ["Half stars", "Start dates"],
    },

    // Shown under "Include my written reviews". reviewsConfirmed stays false
    // until a real import has shown the review arriving; the page says so.
    reviewNote: "Goodreads shows reviews on your profile, where anyone can " +
                "see them, so only tick this if you're happy for them to appear there.",
    reviewsConfirmed: false,

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
        "<strong>Start dates don't come across.</strong> We put your Fable " +
        "start date in Date Added, but Goodreads throws that value away on " +
        "import and stamps its own. Nothing we can do from this end.",
        "<strong>Half-star ratings get rounded</strong> because Goodreads only " +
        "does whole stars.",
    ],
};

const storygraph = {
    id: "storygraph",
    label: "StoryGraph",
    // Newer than the Goodreads route and tested by far fewer people, so it's
    // flagged in the UI rather than presented as equally proven.
    beta: true,
    // StoryGraph imports a Goodreads file, so this is named the way Goodreads
    // names its own export. Confusing otherwise, given the destination — hence
    // fileNote below.
    filename: "goodreads_library_export.csv",
    blurb: "Same as Goodreads keeps, but on StoryGraph.",
    ...GOODREADS_EXPORT_FORMAT,

    summary: {
        keeps: ["Your shelves", "Whole-star ratings", "Finish dates"],
        // "left blank" rather than just "start dates": StoryGraph does have the
        // field and you can fill it in yourself afterwards. It's the transfer
        // that can't carry it, not the app that lacks it.
        loses: ["Half stars (rounded up)", "Start dates (left blank)"],
    },

    reviewNote: "Your reviews go in the file's My Review column.",
    reviewsConfirmed: false,

    // The single most confusing thing about this option: you pick StoryGraph
    // and get a file with Goodreads in the name. Said plainly, next to the
    // download button, before they wonder whether something went wrong.
    fileNote: "Your file will be called <code>goodreads_library_export.csv</code>. " +
              "That's deliberate: StoryGraph doesn't import its own files, only " +
              "Goodreads ones, so that's exactly what it's expecting. Upload it as it is.",

    instructions: [
        {
            before: "Open ",
            href: "https://app.thestorygraph.com/",
            linkText: "app.thestorygraph.com",
            after: ", then Manage Account and find the import section.",
        },
        {
            before: "Choose the <strong>Goodreads</strong> import option. " +
                    "StoryGraph has no StoryGraph import, and this file is in " +
                    "Goodreads' export format, so that's the right one.",
        },
        { before: "Upload the file and give it a few minutes." },
    ],

    notes: [
        "<strong>Date Read</strong> is your Fable finish date, and it comes " +
        "across correctly.",
        "<strong>Start dates don't come across.</strong> StoryGraph does track " +
        "one, under a book's journal entries, and it will create a \"Started " +
        "reading\" entry for you. It just won't have a date on it, because no " +
        "Goodreads-style file has a column to carry one.",
        "<strong>Half stars get rounded to whole ones.</strong> StoryGraph " +
        "stores quarter stars, but its Goodreads importer rounds on the way in, " +
        "so a 3.5 arrives as a 4. That's their importer rather than anything we " +
        "control. If your half stars matter, Pagebound keeps them.",
        "Fable doesn't give us publisher, page count or publication year, so " +
        "those are left empty and StoryGraph fills them in from the ISBN.",
    ],
};

const pagebound = {
    id: "pagebound",
    label: "Pagebound",
    beta: true,
    // Pagebound accepts a Goodreads file too, but only when Goodreads' own
    // Book Id is present, and we can't know it. The StoryGraph shape matches on
    // ISBN instead, so that's the route we use — hence the filename.
    //
    // Pagebound labels this route beta on its own upload page and warns that it
    // "only transfers books that already exist in Pagebound's library". That, not
    // anything in our file, is why an import can come back with fewer books than
    // you sent: their catalogue simply doesn't have the rest.
    filename: "storygraph_library_export.csv",
    blurb: "Keeps the most, including half stars.",
    // Pagebound identifies a book by its ISBN/UID and by nothing else, so a
    // row with that column blank gives it nothing to go on. partitionBooks
    // below holds those rows back rather than sending them.
    matchesOn: "isbn",
    ...STORYGRAPH_FORMAT,

    summary: {
        keeps: ["Your shelves", "Whole-star ratings", "Finish dates",
                "Half-star ratings"],
        loses: ["Start dates (left blank)",
                "Books with no ISBN",
                "Books Pagebound doesn't already have"],
    },

    reviewNote: "Your reviews go in the file's Review column.",
    reviewsConfirmed: false,

    fileNote: "Your file will be called <code>storygraph_library_export.csv</code>. " +
              "That's deliberate: Pagebound accepts StoryGraph files as well as " +
              "Goodreads ones, and the StoryGraph route works better. Choose the " +
              "StoryGraph option when you upload it.",

    instructions: [
        {
            before: "Open ",
            href: "https://pagebound.co/import-library",
            linkText: "pagebound.co/import-library",
            after: ", or click your profile picture, then the settings cog, " +
                   "then Import library.",
        },
        {
            before: "Choose the <strong>StoryGraph</strong> option, not the " +
                    "Goodreads one. This file is in StoryGraph's format.",
        },
        {
            before: "Click Choose file, upload, and start the import. It takes " +
                    "a few minutes and Pagebound tells you when it's done.",
        },
    ],

    notes: [
        "<strong>Half stars survive.</strong> A 3.5 in Fable stays a 3.5 here, " +
        "which no other option manages.",
        "<strong>Last Date Read</strong> is your Fable finish date, and it comes " +
        "across correctly.",
        "<strong>Start dates don't come across.</strong> Pagebound does have a " +
        "Started date on each book, which you'll find by clicking the dates, but " +
        "nothing in this file fills it in, so it stays blank. Anything you're " +
        "part-way through gets stamped with the date you imported instead.",
        "Books on your To-Read shelf land on your Pagebound TBR list.",
        "<strong>You may not get everything.</strong> Pagebound only brings " +
        "across books that already exist in its own library, so anything it " +
        "hasn't got a record of is skipped. Pagebound says so on its own upload " +
        "page, and it also calls this import route beta. Nothing we can do from " +
        "this end, and it's worth checking your count afterwards.",
        "<strong>Books with no ISBN are left out of this file.</strong> " +
        "Pagebound finds a book by its ISBN and by nothing else, so a book " +
        "Fable has no ISBN for would go across as a row it has to guess at, " +
        "and a wrong guess puts a book in your library you've never read. " +
        "Anything left out is listed above the download button, and you can " +
        "fill the ISBN in yourself on the library page.",
    ],
};


// ---------------------------------------------------------------------------
// Which books a destination can actually take.
// ---------------------------------------------------------------------------
// Two people importing into Pagebound ended up with the same book neither had
// read ("We Still Here", Marc Lamont Hill), on the TBR shelf and unrated. It
// was in neither file, so Pagebound put it there.
//
// The one file we got hold of: 478 rows, 52 of them (11%) with an empty
// ISBN/UID. Header an exact match, no shifted columns, all 426 present ISBNs
// pass their check digit, Read Count only ever 0 or 1. Nothing wrong with that
// file except the blanks.
//
// For the blanks being the cause: they are the only defect in an otherwise
// clean file, ISBN/UID is the only column Pagebound matches on, and two
// unrelated people got the SAME wrong book, which is the signature of a
// fallback rather than a coincidence.
//
// Against: all 52 blank rows were marked "read" and the phantom arrived on
// "to-read". For a blank row to be the trigger, Pagebound has to be dumping
// anything it cannot identify onto to-read regardless of what the file says.
// Plausible, unverified. That user's to-read shelf was three books, all with
// valid ISBNs, two in the 979-8 Amazon range a book catalogue is less likely to
// carry, so a valid-but-unfindable ISBN is a live alternative explanation and
// this filter would not catch it.
//
// So: leading suspect, not proven cause. Worth acting on either way, because
// what is not in doubt is what we were handing over. A row with no identifier
// asks the destination to guess, and we were sending 52 of them.
//
// A destination that matches on ISBN alone now only receives rows that carry
// one. Leaving a book out is a visible outcome the export page names and
// explains, and the user can paste an ISBN in on the library page and export
// again. Sending an unidentified row is neither visible nor explainable.
//
// This bites more often than you would think. Fable has no ISBN for a good
// number of titles, audiobooks especially, where it sometimes holds an Amazon
// ASIN instead. An ASIN is not an ISBN and cannot be turned into one.

// A reason to hold this book back from this destination, or "" to send it.
function skipReason(book, target) {
    const hasTitle = Boolean(String(book.title || "").trim());
    const raw = String(book.isbn || "").trim();
    const digits = isbnDigits(raw);
    const hasIsbn = hasUsableIsbn(raw);

    // No identifier and nothing to read either: no destination can use this.
    if (!hasTitle && !hasIsbn) return "it has no title and no ISBN";

    if (target.matchesOn === "isbn" && !hasIsbn) {
        if (!raw) {
            return `${target.label} matches on ISBN, and this one hasn't got one`;
        }
        // A right-length value whose check digit does not add up is nearly
        // always a slip of the fingers, and saying so is far more use than
        // telling somebody the number they just typed "isn't an ISBN".
        if (digits.length === 10 || digits.length === 13) {
            return `"${raw}" looks like a typo, its check digit doesn't add up`;
        }
        // Otherwise it was never an ISBN at all, an Amazon ASIN most often.
        // Quote it back either way, so the user can see what we rejected.
        return `${target.label} matches on ISBN, and "${raw}" isn't one`;
    }
    return "";
}

// Split a library into the rows a destination will be sent and the ones held
// back, each with the reason why. The export page shows the second list.
export function partitionBooks(books, targetId) {
    const target = getTarget(targetId);
    const included = [];
    const excluded = [];

    for (const book of books) {
        const reason = skipReason(book, target);
        if (reason) excluded.push({ book, reason });
        else included.push(book);
    }
    return { included, excluded };
}


// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------
// Order here is the order shown in the export page's picker. Goodreads stays
// first because it's the path most people arrive expecting.

export const TARGETS = [goodreads, storygraph, pagebound];

export const DEFAULT_TARGET_ID = "goodreads";

// Look up a destination by id, falling back to the default rather than throwing —
// a stale id in storage shouldn't leave the user stuck with a dead page.
export function getTarget(id) {
    return TARGETS.find((t) => t.id === id)
        || TARGETS.find((t) => t.id === DEFAULT_TARGET_ID);
}
