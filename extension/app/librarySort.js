// ShelfBridge: the library's "Sort by" options.
//
// Only changes the order of the review table. The export keeps the library's
// own order, because none of the importers care what order rows arrive in.
// Pure functions with no DOM access, so the rules can be tested on their own
// (see tests/librarySort.test.mjs).
//
// Two rules apply to every option:
//
//   * Books with nothing to sort on (no finish date, no rating) always go to
//     the bottom, in both directions. Otherwise "Newest first" would open
//     with a block of undated books.
//   * Ties are broken by title, then by the original order, so the result
//     is predictable and never shuffles between two equal books.


// Compares text the way a person would: ignores case and accents, and puts
// "Book 2" before "Book 10".
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

const byText  = (field) => (a, b) => collator.compare(a[field] || "", b[field] || "");
const byValue = (field) => (a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);

// Each option: the label shown in the dropdown, how to compare two books,
// whether a book has anything to sort on, and the direction.
export const SORT_OPTIONS = [
    { id: "fable",         label: "Fable order" },
    { id: "title-asc",     label: "Title, A to Z",          compare: byText("title"),          has: (b) => b.title,         dir: 1 },
    { id: "title-desc",    label: "Title, Z to A",          compare: byText("title"),          has: (b) => b.title,         dir: -1 },
    { id: "author-asc",    label: "Author, A to Z",         compare: byText("author"),         has: (b) => b.author,        dir: 1 },
    { id: "author-desc",   label: "Author, Z to A",         compare: byText("author"),         has: (b) => b.author,        dir: -1 },
    { id: "finished-desc", label: "Finished, newest first", compare: byValue("date_finished"), has: (b) => b.date_finished, dir: -1 },
    { id: "finished-asc",  label: "Finished, oldest first", compare: byValue("date_finished"), has: (b) => b.date_finished, dir: 1 },
    { id: "started-desc",  label: "Started, newest first",  compare: byValue("date_started"),  has: (b) => b.date_started,  dir: -1 },
    { id: "started-asc",   label: "Started, oldest first",  compare: byValue("date_started"),  has: (b) => b.date_started,  dir: 1 },
    { id: "rating-desc",   label: "Rating, highest first",  compare: byValue("rating"),        has: (b) => b.rating,        dir: -1 },
    { id: "rating-asc",    label: "Rating, lowest first",   compare: byValue("rating"),        has: (b) => b.rating,        dir: 1 },
];

export const DEFAULT_SORT = "fable";

// A sorted copy of books. The original array is left alone, so the library's
// own order (which the export uses) is never disturbed.
export function sortBooks(books, sortId) {
    const option = SORT_OPTIONS.find((o) => o.id === sortId);
    const indexed = books.map((book, index) => ({ book, index }));
    if (!option || !option.compare) return indexed.map((x) => x.book);

    const titleOrder = byText("title");
    indexed.sort((x, y) => {
        // Books with nothing to sort on go last, whichever the direction.
        const xHas = Boolean(option.has(x.book));
        const yHas = Boolean(option.has(y.book));
        if (xHas !== yHas) return xHas ? -1 : 1;

        if (xHas) {
            const result = option.compare(x.book, y.book) * option.dir;
            if (result !== 0) return result;
        }
        // Equal on the chosen field: alphabetical by title, then the order
        // the books were in to begin with.
        return titleOrder(x.book, y.book) || x.index - y.index;
    });
    return indexed.map((x) => x.book);
}
