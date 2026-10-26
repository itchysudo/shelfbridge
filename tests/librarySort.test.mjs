// ShelfBridge: tests for the library's "Sort by" options.
//
// No framework and no dependencies: run it with
//
//     node tests/librarySort.test.mjs

import { sortBooks, SORT_OPTIONS, DEFAULT_SORT } from "../extension/app/librarySort.js";

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

// Made-up library, deliberately not in any sorted order.
const library = [
    { title: "piranesi",          author: "Susanna Clarke",  date_finished: "2023-11-01", date_started: "2023-10-01", rating: 5 },
    { title: "Book 10",           author: "Émile Zola",      date_finished: null,         date_started: "2024-04-01", rating: null },
    { title: "Klara and the Sun", author: "Kazuo Ishiguro",  date_finished: "2024-01-28", date_started: null,         rating: 3.5 },
    { title: "Book 2",            author: "",                date_finished: "2024-01-28", date_started: "2024-01-01", rating: 4 },
    { title: "Atlas",             author: "Andy Weir",       date_finished: null,         date_started: null,         rating: null },
];
const titles = (books) => books.map((b) => b.title);


// ---------------------------------------------------------------------------
console.log("\nAlphabetical");
// ---------------------------------------------------------------------------

check("title A to Z ignores case and reads numbers as numbers",
    titles(sortBooks(library, "title-asc")), ["Atlas", "Book 2", "Book 10", "Klara and the Sun", "piranesi"]);
check("title Z to A is the reverse",
    titles(sortBooks(library, "title-desc")), ["piranesi", "Klara and the Sun", "Book 10", "Book 2", "Atlas"]);
check("author A to Z ignores accents, and a blank author goes last",
    titles(sortBooks(library, "author-asc")), ["Atlas", "Book 10", "Klara and the Sun", "piranesi", "Book 2"]);
check("author Z to A still puts the blank author last",
    titles(sortBooks(library, "author-desc")), ["piranesi", "Klara and the Sun", "Book 10", "Atlas", "Book 2"]);


// ---------------------------------------------------------------------------
console.log("\nDates and ratings");
// ---------------------------------------------------------------------------

check("finished newest first; a tie is broken by title; undated go last",
    titles(sortBooks(library, "finished-desc")), ["Book 2", "Klara and the Sun", "piranesi", "Atlas", "Book 10"]);
check("finished oldest first; undated still go last",
    titles(sortBooks(library, "finished-asc")), ["piranesi", "Book 2", "Klara and the Sun", "Atlas", "Book 10"]);
check("started newest first",
    titles(sortBooks(library, "started-desc")), ["Book 10", "Book 2", "piranesi", "Atlas", "Klara and the Sun"]);
check("rating highest first; half stars sit between whole ones; unrated last",
    titles(sortBooks(library, "rating-desc")), ["piranesi", "Book 2", "Klara and the Sun", "Atlas", "Book 10"]);
check("rating lowest first; unrated still last",
    titles(sortBooks(library, "rating-asc")), ["Klara and the Sun", "Book 2", "piranesi", "Atlas", "Book 10"]);


// ---------------------------------------------------------------------------
console.log("\nThe library itself is never reordered");
// ---------------------------------------------------------------------------

const before = titles(library);
sortBooks(library, "title-asc");
check("sorting returns a copy and leaves the original alone", titles(library), before);
check("Fable order keeps the original order", titles(sortBooks(library, "fable")), before);
check("an unknown option falls back to the original order", titles(sortBooks(library, "nonsense")), before);
check("the default is Fable order", DEFAULT_SORT, "fable");
check("every option has a unique id",
    new Set(SORT_OPTIONS.map((o) => o.id)).size, SORT_OPTIONS.length);


console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exit(failures ? 1 : 0);
