// ShelfBridge: the library's date filter.
//
// Lets someone export only part of their library, for example everything
// they've logged since they moved from Goodreads to Fable. Pure functions with
// no DOM or storage access, so the rules can be tested on their own (see
// tests/dateFilter.test.mjs).
//
// WHICH DATE
// A book's date is its finish date. Books that aren't finished, such as
// Currently reading, fall back to their start date. Fable gives us no "date
// added", so books with neither date (mostly Want to read) can't be placed in
// a range at all. The filter leaves those out unless the user ticks "Include
// books with no dates".
//
// PARTIAL DATES
// Fable sometimes only knows the month or the year. normaliseDate() in
// scraper.js stores those as the 1st of the month, or 1 January, with a
// date_*_type of "month" or "year" alongside. Compared naively, a book
// finished "March 2024" would be stored as 2024-03-01 and dropped by a From
// date of 2024-03-15, even though it may well have been finished after it.
// So a partial date is treated as the whole month or year it stands for, and
// the book counts if any part of that span falls inside the range.
//
// All dates are ISO "YYYY-MM-DD" strings, which sort correctly as plain text,
// so no Date objects (and no time zone surprises) are involved.


// The date that places a book in time, with how precise Fable said it was.
// Returns null when the book has no usable date.
export function bookDate(book) {
    if (book.date_finished) {
        return { date: book.date_finished, precision: book.date_finished_type || "day" };
    }
    if (book.date_started) {
        return { date: book.date_started, precision: book.date_started_type || "day" };
    }
    return null;
}

// The first and last day a (possibly partial) date could mean, as ISO strings.
export function dateSpan(date, precision) {
    const [year, month] = date.split("-");
    if (precision === "year") {
        return [`${year}-01-01`, `${year}-12-31`];
    }
    if (precision === "month") {
        // Day 0 of the next month is the last day of this one. UTC throughout,
        // so the local time zone can't shift it by a day.
        const lastDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
        return [`${year}-${month}-01`, `${year}-${month}-${String(lastDay).padStart(2, "0")}`];
    }
    return [date, date];
}

// True when a filter is actually restricting anything.
export function isDateFilterActive(filter) {
    return Boolean(filter && (filter.from || filter.to));
}

// True when From is after To, which can never match anything. The library
// page uses this to tell the user rather than silently showing nothing.
export function isDateRangeBackwards(filter) {
    return Boolean(filter && filter.from && filter.to && filter.from > filter.to);
}

// Does this book belong in the filtered library?
//
// filter is { from, to, includeUndated }. from and to are ISO dates or "",
// and an empty one means "no limit" on that side.
export function matchesDateFilter(book, filter) {
    if (!isDateFilterActive(filter)) return true;

    const placed = bookDate(book);
    if (!placed) return Boolean(filter.includeUndated);

    // Overlap test: the book's span has to end on or after From and start on
    // or before To.
    const [start, end] = dateSpan(placed.date, placed.precision);
    if (filter.from && end < filter.from) return false;
    if (filter.to && start > filter.to) return false;
    return true;
}

// Split a library by the filter. Returns the books to keep, plus how many have
// no date, so the page can offer "Include N books with no dates".
export function applyDateFilter(books, filter) {
    const kept = books.filter((book) => matchesDateFilter(book, filter));
    const undatedCount = books.filter((book) => !bookDate(book)).length;
    return { kept, undatedCount };
}
