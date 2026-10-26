// ShelfBridge: tests for the library's date filter.
//
// No framework and no dependencies: run it with
//
//     node tests/dateFilter.test.mjs
//
// The filter decides which books go into an export, so a wrong edge here
// quietly leaves books out of somebody's file. The cases worth pinning are the
// boundaries, the finish/start fallback, books with no date, and partial
// dates, where Fable only knew the month or the year.

import {
    bookDate, dateSpan, matchesDateFilter, applyDateFilter,
    isDateFilterActive, isDateRangeBackwards,
} from "../extension/app/dateFilter.js";

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

const finished = (date, type = null) =>
    ({ title: "Finished", shelf: "read", date_finished: date, date_finished_type: type });
const started = (date) =>
    ({ title: "Started", shelf: "currently-reading", date_started: date });
const undated = { title: "Undated", shelf: "to-read" };


// ---------------------------------------------------------------------------
console.log("\nWhich date places a book");
// ---------------------------------------------------------------------------

check("finish date wins over start date",
    bookDate({ date_started: "2023-01-01", date_finished: "2024-05-01" }).date, "2024-05-01");
check("unfinished books fall back to the start date",
    bookDate(started("2024-02-10")).date, "2024-02-10");
check("a book with neither date has none", bookDate(undated), null);
check("the precision comes with the date",
    bookDate(finished("2024-03-01", "month")).precision, "month");


// ---------------------------------------------------------------------------
console.log("\nPartial dates cover their whole month or year");
// ---------------------------------------------------------------------------

check("a full date is just that day", dateSpan("2024-03-15", "day"), ["2024-03-15", "2024-03-15"]);
check("a month covers the whole month", dateSpan("2024-03-01", "month"), ["2024-03-01", "2024-03-31"]);
check("February in a leap year ends on the 29th", dateSpan("2024-02-01", "month"), ["2024-02-01", "2024-02-29"]);
check("February otherwise ends on the 28th", dateSpan("2023-02-01", "month"), ["2023-02-01", "2023-02-28"]);
check("December doesn't roll into the next year", dateSpan("2024-12-01", "month"), ["2024-12-01", "2024-12-31"]);
check("a year covers the whole year", dateSpan("2024-01-01", "year"), ["2024-01-01", "2024-12-31"]);

check("a month-only finish counts for a From date mid-month",
    matchesDateFilter(finished("2024-03-01", "month"), { from: "2024-03-15" }), true);
check("a year-only finish counts for a From date later that year",
    matchesDateFilter(finished("2024-01-01", "year"), { from: "2024-06-01" }), true);
check("but not for a From date the following year",
    matchesDateFilter(finished("2024-01-01", "year"), { from: "2025-01-01" }), false);


// ---------------------------------------------------------------------------
console.log("\nRange edges");
// ---------------------------------------------------------------------------

const range = { from: "2024-01-01", to: "2024-12-31" };
check("the From day itself is included", matchesDateFilter(finished("2024-01-01"), range), true);
check("the To day itself is included", matchesDateFilter(finished("2024-12-31"), range), true);
check("the day before From is not", matchesDateFilter(finished("2023-12-31"), range), false);
check("the day after To is not", matchesDateFilter(finished("2025-01-01"), range), false);
check("From on its own has no upper limit", matchesDateFilter(finished("2030-06-01"), { from: "2024-01-01" }), true);
check("To on its own has no lower limit", matchesDateFilter(finished("1999-06-01"), { to: "2024-01-01" }), true);
check("a currently-reading book is placed by its start date",
    matchesDateFilter(started("2024-06-01"), { from: "2024-01-01" }), true);


// ---------------------------------------------------------------------------
console.log("\nBooks with no date, and no filter at all");
// ---------------------------------------------------------------------------

check("undated books are left out by default", matchesDateFilter(undated, { from: "2024-01-01" }), false);
check("unless the user asks for them",
    matchesDateFilter(undated, { from: "2024-01-01", includeUndated: true }), true);
check("with no dates set, every book is kept, dated or not",
    matchesDateFilter(undated, { from: "", to: "", includeUndated: false }), true);
check("an empty filter is not active", isDateFilterActive({ from: "", to: "" }), false);
check("a From date makes it active", isDateFilterActive({ from: "2024-01-01" }), true);
check("From after To is spotted", isDateRangeBackwards({ from: "2025-01-01", to: "2024-01-01" }), true);
check("one-sided ranges are never backwards", isDateRangeBackwards({ from: "2025-01-01" }), false);

const library = [finished("2023-05-01"), finished("2024-05-01"), started("2024-08-01"), undated];
const result = applyDateFilter(library, { from: "2024-01-01" });
check("applyDateFilter keeps the books in range", result.kept.map((b) => b.date_finished || b.date_started),
    ["2024-05-01", "2024-08-01"]);
check("and counts the undated ones", result.undatedCount, 1);


console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exit(failures ? 1 : 0);
