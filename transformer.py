"""Convert our book records into a Goodreads-format CSV.

Goodreads has a very particular import format with 26 columns. Only a handful
of them carry data we actually have; the rest must still be present (as empty
strings) or the importer rejects the file.

Reference column list from Goodreads' importer:
    https://www.goodreads.com/review/import
"""

import csv
import io


# The exact 26 columns Goodreads expects, in order. Do not reorder — the
# importer matches by position, not by header name in some places.
GOODREADS_COLUMNS = [
    "Title", "Author", "ISBN", "My Rating", "Average Rating", "Publisher",
    "Binding", "Year Published", "Original Publication Year", "Date Read",
    "Date Added", "Bookshelves", "Bookshelves with positions",
    "Exclusive Shelf", "My Review", "Spoiler", "Private Notes", "Read Count",
    "Recommended For", "Recommended By", "Owned Copies",
    "Original Purchase Date", "Original Purchase Location", "Condition",
    "Condition Description", "BCID",
]


def _format_date(iso_date: str | None) -> str:
    """Convert YYYY-MM-DD (our storage format) → YYYY/MM/DD (Goodreads format).

    Also handles the timestamp format SQLite returns for created_at columns
    (e.g. "2026-05-17 14:23:11" — we just take the date portion).
    Returns an empty string if the input is falsy.
    """
    if not iso_date:
        return ""
    # Trim any time portion ("2026-05-17 14:23:11" → "2026-05-17")
    date_part = iso_date.split(" ", 1)[0]
    return date_part.replace("-", "/")


def _format_isbn(isbn: str | None) -> str:
    """Wrap an ISBN as ="..." so spreadsheet apps don't mangle it.

    Without this, Excel/Sheets see the long number and either convert it to
    scientific notation or strip leading zeros. Goodreads' importer
    understands and strips the ="..." wrapper.
    """
    if not isbn:
        return ""
    return f'="{isbn}"'


def _pick_date_added(book: dict) -> str:
    """Choose the best value for Goodreads' "Date Added" column.

    Goodreads has no "Date Started" field, so we co-opt that column instead.
    The fallback chain:
        1. Fable's start date (`date_started`) — best signal, real history
        2. For finished books, fall back to the finish date so the row
           still has a sensible historical timestamp
        3. Otherwise blank — Goodreads will fill in "today" on import

    The user-facing notes on the library and export pages explain this
    repurposing so it's not a surprise.
    """
    if book.get("date_started"):
        return _format_date(book["date_started"])
    if book.get("shelf") == "read" and book.get("date_finished"):
        return _format_date(book["date_finished"])
    return ""


def generate_csv(books: list[dict]) -> str:
    """Return a Goodreads-compatible CSV as a string.

    Each book dict should have the keys defined by our SQLite schema
    (see db.py). Unknown shelves are passed through verbatim — Goodreads
    will silently create new bookshelves for any value it doesn't recognise.
    """
    output = io.StringIO()
    # extrasaction='ignore' means any extra dict keys on a book (e.g. cover_url,
    # fable_id) are silently dropped rather than raising — useful since our
    # book dicts carry more fields than Goodreads cares about.
    writer = csv.DictWriter(output, fieldnames=GOODREADS_COLUMNS,
                            extrasaction="ignore")
    writer.writeheader()

    for book in books:
        writer.writerow({
            "Title":            book.get("title") or "",
            "Author":           book.get("author") or "",
            "ISBN":             _format_isbn(book.get("isbn")),
            "My Rating":        book.get("rating") or 0,
            "Date Read":        _format_date(book.get("date_finished")),
            "Date Added":       _pick_date_added(book),
            "Exclusive Shelf":  book.get("shelf") or "",
            "Bookshelves":      book.get("shelf") or "",
            # All other columns are left blank — DictWriter fills missing keys
            # with empty strings automatically.
        })

    return output.getvalue()
