// ShelfBridge — Goodreads CSV generator.
//
// Builds the exact 26-column CSV that Goodreads' import endpoint accepts.
// Mirrors the Python `transformer.py` in the Flask version — keep them in
// sync if you change one.

const GOODREADS_COLUMNS = [
    "Title", "Author", "ISBN", "My Rating", "Average Rating", "Publisher",
    "Binding", "Year Published", "Original Publication Year", "Date Read",
    "Date Added", "Bookshelves", "Bookshelves with positions",
    "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
    "Recommended For", "Recommended By", "Owned Copies",
    "Original Purchase Date", "Original Purchase Location", "Condition",
    "Condition Description", "BCID",
];

// Convert YYYY-MM-DD → YYYY/MM/DD (Goodreads' format). Empty input → "".
function formatDate(s) {
    if (!s) return "";
    const datePart = String(s).split(" ")[0].split("T")[0];
    return datePart.replace(/-/g, "/");
}

// Wrap an ISBN as ="..." so spreadsheet apps don't mangle the long number
// (they'd otherwise convert to scientific notation or strip leading zeros).
// Goodreads' importer understands and strips the wrapper.
function formatISBN(isbn) {
    if (!isbn) return "";
    return `="${isbn}"`;
}

// Pick the best value for Goodreads' "Date Added" column.
// Goodreads has no "Date Started" field, so we use Fable's start date as
// the closest historical signal. Falls back to finish date for read books,
// or empty otherwise. The /guide page explains this to users.
function pickDateAdded(book) {
    if (book.date_started) return formatDate(book.date_started);
    if (book.shelf === "read" && book.date_finished) {
        return formatDate(book.date_finished);
    }
    return "";
}

// CSV escaping: wrap in quotes if the value contains comma, quote, newline,
// or a leading equals sign (for the ISBN wrapper). Double internal quotes.
function escapeCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n\r]|^=/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// Build one CSV row from a book.
function buildRow(book) {
    const values = {
        "Title":            book.title || "",
        "Author":           book.author || "",
        "ISBN":             formatISBN(book.isbn),
        "My Rating":        book.rating || 0,
        "Date Read":        formatDate(book.date_finished),
        "Date Added":       pickDateAdded(book),
        "Exclusive Shelf":  book.shelf || "",
        "Bookshelves":      book.shelf || "",
        // All other columns default to "".
    };
    return GOODREADS_COLUMNS
        .map((col) => escapeCell(values[col] ?? ""))
        .join(",");
}

export function generateCSV(books) {
    const lines = [GOODREADS_COLUMNS.join(",")];
    for (const book of books) {
        lines.push(buildRow(book));
    }
    return lines.join("\r\n") + "\r\n";
}

// Helper for the export view: trigger a file download in the browser.
export function downloadCSV(csvText, filename = "goodreads_import.csv") {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
