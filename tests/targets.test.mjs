// ShelfBridge — tests for the export layer.
//
// No framework and no dependencies: run it with
//
//     node tests/targets.test.mjs
//
// Every book in here is made up. The real exports these formats were built from
// are somebody's actual reading history and don't belong in a public repo, so
// the headers below are transcribed from them rather than the files committed.
//
// The two things worth pinning:
//
//   1. The column headers, verbatim. Goodreads, StoryGraph and Pagebound all
//      identify a file by matching its header, so a wrong column name means the
//      whole import is rejected. A published column list got this wrong in both
//      directions once already, and both lists were the right length, so a
//      count check would not have caught it.
//   2. Which books a destination is allowed to be sent. Pagebound matches on
//      ISBN alone, and sending it a row with no ISBN put a book somebody had
//      never read into their library, twice.

import { generateCSV } from "../extension/app/transformer.js";
import { partitionBooks, TARGETS, hasUsableIsbn } from "../extension/app/targets.js";

let failures = 0;

function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  ok    ${name}`);
    } else {
        failures++;
        console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
    }
}

function headerOf(targetId) {
    return generateCSV([], targetId).split("\r\n")[0];
}


// ---------------------------------------------------------------------------
console.log("\nHeaders, verbatim");
// ---------------------------------------------------------------------------

check("goodreads header",
    headerOf("goodreads"),
    "Title,Author,ISBN,My Rating,Average Rating,Publisher,Binding,Year Published," +
    "Original Publication Year,Date Read,Date Added,Bookshelves," +
    "Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes," +
    "Read Count,Recommended For,Recommended By,Owned Copies," +
    "Original Purchase Date,Original Purchase Location,Condition," +
    "Condition Description,BCID");

// Note Owned Copies is present and Average Rating is absent. That is the right
// way round for a Goodreads *export*, and the opposite of what the documentation
// claims.
check("storygraph header (a Goodreads export)",
    headerOf("storygraph"),
    "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating," +
    "Publisher,Binding,Number of Pages,Year Published,Original Publication Year," +
    "Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf," +
    "My Review,Spoiler,Private Notes,Read Count,Owned Copies");

check("pagebound header (a StoryGraph export)",
    headerOf("pagebound"),
    "Title,Authors,Contributors,ISBN/UID,Format,Read Status,Date Added," +
    "Last Date Read,Dates Read,Read Count,Moods,Pace," +
    "Character- or Plot-Driven?,Strong Character Development?," +
    "Loveable Characters?,Diverse Characters?,Flawed Characters?,Star Rating," +
    "Review,Content Warnings,Content Warning Description,Tags,Owned?");

for (const target of TARGETS) {
    check(`${target.id}: every column is emitted`,
        headerOf(target.id).split(",").length >= target.columns.length,
        true);
}


// ---------------------------------------------------------------------------
console.log("\nBooks a destination can be sent");
// ---------------------------------------------------------------------------

const withIsbn   = { title: "Piranesi", author: "Susanna Clarke", isbn: "9781635575637", shelf: "read", rating: 3.5 };
const noIsbn     = { title: "An audiobook", author: "Someone", isbn: "", shelf: "to-read" };
const asinOnly   = { title: "Also an audiobook", author: "Someone", isbn: "B08XYZ1234", shelf: "to-read" };
const shortIsbn  = { title: "Twelve digits", author: "Someone", isbn: "978059313520", shelf: "to-read" };
const emptyRow   = { title: "", author: "", isbn: "", shelf: "to-read" };
const library = [withIsbn, noIsbn, asinOnly, shortIsbn, emptyRow];

const titlesSent = (id) => partitionBooks(library, id).included.map((b) => b.title);

// Goodreads and StoryGraph match on title and author as well as ISBN, so a book
// with no ISBN is still worth sending. Only the row with nothing in it at all
// gets dropped.
check("goodreads keeps everything with a title",
    titlesSent("goodreads"),
    ["Piranesi", "An audiobook", "Also an audiobook", "Twelve digits"]);

check("storygraph keeps everything with a title",
    titlesSent("storygraph"),
    ["Piranesi", "An audiobook", "Also an audiobook", "Twelve digits"]);

// Pagebound has nothing but the ISBN to go on.
check("pagebound only gets books whose ISBN checks out",
    titlesSent("pagebound"),
    ["Piranesi"]);

check("an ASIN is not accepted as an ISBN",
    partitionBooks([asinOnly], "pagebound").included.length,
    0);

check("a 12-digit number is not accepted as an ISBN",
    partitionBooks([shortIsbn], "pagebound").included.length,
    0);

check("every held-back book comes with a reason",
    partitionBooks(library, "pagebound").excluded.every((e) => e.reason.length > 0),
    true);

check("the rejected value is quoted back to the user",
    partitionBooks([asinOnly], "pagebound").excluded[0].reason.includes("B08XYZ1234"),
    true);

// The filter belongs to generateCSV, not the call site, so no caller can skip it.
check("generateCSV drops them too, not just partitionBooks",
    generateCSV(library, "pagebound").split("\r\n").filter(Boolean).length,
    2); // header plus Piranesi


// ---------------------------------------------------------------------------
console.log("\nCheck digits");
// ---------------------------------------------------------------------------
// Length alone is not enough. The dangerous case is a 10-digit value that was
// never an ISBN: isbn10to13 prepends 978 and computes a FRESH check digit, so
// without validation nonsense leaves as a syntactically perfect ISBN-13 and
// points the destination at whichever real book owns that number. A blank
// column gives it nothing to match; a well-formed wrong number gives it
// confident rubbish.

const badThirteen = { title: "Transposed", isbn: "9780593135205", shelf: "read" }; // valid is ...204
const badTen      = { title: "Bad ten",    isbn: "0593135203",    shelf: "read" }; // valid is ...202
const notAnIsbn   = { title: "Nonsense",   isbn: "1234567890",    shelf: "read" }; // check digit is X
const repeated    = { title: "All ones",   isbn: "1111111111111", shelf: "read" };

check("a transposed ISBN-13 check digit is caught",
    partitionBooks([badThirteen], "pagebound").included.length,
    0);

check("a bad ISBN-10 check digit is caught",
    partitionBooks([badTen], "pagebound").included.length,
    0);

check("a 13-digit blob is not accepted",
    partitionBooks([repeated], "pagebound").included.length,
    0);

// The regression that matters most: this used to be silently upgraded to
// 9781234567897 and sent.
check("a 10-digit non-ISBN is not upgraded into a valid-looking ISBN-13",
    partitionBooks([notAnIsbn], "pagebound").included.length,
    0);

check("and its value never reaches the file",
    generateCSV([notAnIsbn], "pagebound").includes("9781234567897"),
    false);

check("a typo is described as a typo, not as a missing ISBN",
    partitionBooks([badThirteen], "pagebound").excluded[0].reason.includes("typo"),
    true);

check("valid ISBNs are still sent, both lengths",
    partitionBooks([
        { title: "Thirteen", isbn: "9781635575637", shelf: "read" },
        { title: "Ten",      isbn: "0593135202",    shelf: "read" },
    ], "pagebound").included.length,
    2);


// ---------------------------------------------------------------------------
console.log("\nOne predicate, used everywhere");
// ---------------------------------------------------------------------------
// The library table highlights cells with hasUsableIsbn while the export filter
// uses partitionBooks. They drifted apart once: the table tested plain
// truthiness, so a book carrying an ASIN looked fine in the table and then
// vanished from the file. These must agree for every case.

const AGREEMENT_CASES = [
    "9781635575637",   // valid 13
    "0593135202",      // valid 10
    "978-0-593-13520-4", // valid, hyphenated
    "9780593135205",   // bad check digit
    "B08XYZ1234",      // ASIN
    "978059313520",    // 12 digits
    "n/a",
    "   ",
    "",
];

for (const value of AGREEMENT_CASES) {
    const heldBack = partitionBooks(
        [{ title: "T", isbn: value, shelf: "read" }], "pagebound",
    ).excluded.length === 1;
    check(`hasUsableIsbn agrees with the export filter for ${JSON.stringify(value)}`,
        hasUsableIsbn(value),
        !heldBack);
}


// ---------------------------------------------------------------------------
console.log("\nISBN handling");
// ---------------------------------------------------------------------------

const isbnCell = (book, id) => {
    const csv = generateCSV([book], id).split("\r\n");
    const cols = csv[0].split(",");
    return csv[1].split(",")[cols.indexOf("ISBN/UID")];
};

check("a hyphenated ISBN-13 is normalised",
    isbnCell({ title: "T", isbn: "978-0-593-13520-4", shelf: "read" }, "pagebound"),
    "9780593135204");

check("an ISBN-10 is converted to 13 for StoryGraph's format",
    isbnCell({ title: "T", isbn: "0593135202", shelf: "read" }, "pagebound"),
    "9780593135204");

// 979 ISBNs have no 10-digit equivalent, but the 13 is still usable.
check("a 979 ISBN passes through",
    isbnCell({ title: "T", isbn: "9791234567896", shelf: "read" }, "pagebound"),
    "9791234567896");


// ---------------------------------------------------------------------------
console.log("\nWritten reviews");
// ---------------------------------------------------------------------------
// A review is free text, so it's the one value here that will contain commas,
// quotes and line breaks. app.js decides whether reviews go in at all; these
// pin where each format puts one, and that the file still parses.

const reviewed = { title: "Heavenly Bodies", author: "Someone", isbn: "9781635575637",
                   shelf: "read", rating: 3, review: 'Loved it, mostly.\nThe "twist" less so.' };

// Just enough of a CSV reader to undo escapeCell: quoted cells, doubled
// quotes, and line breaks inside quotes.
function parseCSV(text) {
    const rows = [[]];
    let cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
            else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") { rows.at(-1).push(cell); cell = ""; }
        else if (c === "\r") continue;
        else if (c === "\n") { rows.at(-1).push(cell); cell = ""; rows.push([]); }
        else cell += c;
    }
    return rows.filter((r) => r.length > 1);
}

function cellOf(targetId, book, column) {
    const [header, row] = parseCSV(generateCSV([book], targetId));
    return row[header.indexOf(column)];
}

check("goodreads puts the review in My Review",
    cellOf("goodreads", reviewed, "My Review"), reviewed.review);
check("storygraph puts the review in My Review",
    cellOf("storygraph", reviewed, "My Review"), reviewed.review);
check("pagebound puts the review in Review",
    cellOf("pagebound", reviewed, "Review"), reviewed.review);
check("a review with commas, quotes and a line break is still one row",
    parseCSV(generateCSV([reviewed, withIsbn], "goodreads")).length, 3);
check("a book with no review leaves the column empty",
    cellOf("goodreads", withIsbn, "My Review"), "");
check("every destination says something about reviews",
    TARGETS.every((t) => typeof t.reviewNote === "string" && t.reviewNote.length > 0
                         && typeof t.reviewsConfirmed === "boolean"), true);


// ---------------------------------------------------------------------------
console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} failed.\n`);
process.exit(failures === 0 ? 0 : 1);
