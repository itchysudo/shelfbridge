"""SQLite helpers for ShelfBridge.

One file, one table (`books`). We use Python's built-in `sqlite3` module so
there's nothing extra to install — the database is just a single file on disk
called `books.db`, created automatically on first run.
"""

import sqlite3
from pathlib import Path

# The DB file lives next to this script. Using an absolute path means the app
# behaves the same no matter which folder the user runs `python app.py` from.
DB_PATH = Path(__file__).parent / "books.db"


def get_connection() -> sqlite3.Connection:
    """Open a connection to the SQLite database.

    `row_factory = sqlite3.Row` lets us access columns by name
    (e.g. `row["title"]`) instead of by numeric index. Much friendlier.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create the books table if it doesn't already exist, then run any
    in-place migrations for columns added later.

    Safe to call on every app startup — `IF NOT EXISTS` and the ALTER block
    make this idempotent.
    """
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS books (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                fable_id TEXT,
                title TEXT NOT NULL,
                author TEXT,
                shelf TEXT,                  -- 'read', 'currently-reading', 'to-read'
                date_finished TEXT,          -- ISO format: YYYY-MM-DD
                date_finished_type TEXT,     -- 'full', 'month', 'year' — precision from Fable
                date_started TEXT,           -- ISO format: YYYY-MM-DD
                date_started_type TEXT,      -- 'full', 'month', 'year' — precision from Fable
                rating INTEGER,              -- 1-5, nullable
                isbn TEXT,
                isbn_lookup_status TEXT,     -- 'found', 'not_found', 'pending', 'skipped'
                cover_url TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
            """
        )
        # In-place migrations: add columns to older databases that were
        # created before they existed. SQLite raises if a column is already
        # present, so we swallow that one specific case per ALTER.
        for column_sql in (
            "ALTER TABLE books ADD COLUMN date_finished_type TEXT",
            "ALTER TABLE books ADD COLUMN date_started TEXT",
            "ALTER TABLE books ADD COLUMN date_started_type TEXT",
        ):
            try:
                conn.execute(column_sql)
            except sqlite3.OperationalError as e:
                if "duplicate column name" not in str(e):
                    raise


def seed_fake_books_if_empty() -> None:
    """Populate the table with 5 fake books — but only if it's currently empty.

    This gives us realistic-looking data to design the UI against in Phase 1,
    before we've built the Fable scraper. Once real scraping works, this is
    skipped automatically.
    """
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        if count > 0:
            return  # Already has data — don't double-seed.

        fake_books = [
            # (title, author, shelf, date_finished, rating, isbn, cover_url)
            ("Project Hail Mary", "Andy Weir", "read", "2024-03-12", 5,
             "9780593135204", None),
            ("Klara and the Sun", "Kazuo Ishiguro", "read", "2024-01-28", 4,
             "9780571364879", None),
            ("The Bee Sting", "Paul Murray", "currently-reading", None, None,
             "9780374600303", None),
            ("Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin",
             "to-read", None, None, "9780593321201", None),
            ("Piranesi", "Susanna Clarke", "read", "2023-11-05", 5,
             "9781635575637", None),
        ]

        conn.executemany(
            """
            INSERT INTO books (title, author, shelf, date_finished, rating, isbn, cover_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            fake_books,
        )


def get_all_books() -> list[dict]:
    """Return every book in the database as a list of plain dicts.

    Plain dicts (rather than sqlite3.Row objects) are easier to pass to
    Jinja templates and to serialise as JSON.
    """
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM books ORDER BY shelf, title"
        ).fetchall()
        return [dict(row) for row in rows]


def get_book(book_id: int) -> dict | None:
    """Return one book by id, or None if it doesn't exist."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM books WHERE id = ?", (book_id,)
        ).fetchone()
        return dict(row) if row else None


# The user is allowed to edit exactly these columns from the UI.
# Anything else in a PATCH request is rejected. This is the *whitelist* that
# stops a hostile client from poking at columns like `id` or `created_at`.
EDITABLE_FIELDS = {
    "title", "author", "shelf",
    "date_finished", "date_finished_type",
    "date_started", "date_started_type",
    "rating", "isbn",
}


def update_book(book_id: int, changes: dict) -> dict | None:
    """Apply a partial update to a book.

    `changes` is a dict of {field_name: new_value}. Any keys not in
    EDITABLE_FIELDS are silently ignored (the caller should validate first
    and return a 400 if it wants to be strict — see app.py).

    Returns the updated book dict, or None if no such book exists.
    """
    # Filter to only the fields we allow editing. We build the SQL string
    # ourselves rather than letting the caller's keys flow into SQL — this
    # is what makes the whitelist safe.
    safe_changes = {k: v for k, v in changes.items() if k in EDITABLE_FIELDS}
    if not safe_changes:
        return get_book(book_id)

    set_clause = ", ".join(f"{field} = ?" for field in safe_changes)
    params = list(safe_changes.values()) + [book_id]

    with get_connection() as conn:
        cursor = conn.execute(
            f"UPDATE books SET {set_clause}, updated_at = datetime('now') "
            f"WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            return None  # No such book.

    return get_book(book_id)


def delete_book(book_id: int) -> bool:
    """Permanently remove a book. Returns True if a row was deleted."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
        return cursor.rowcount > 0


# Columns the scraper is allowed to populate when bulk-inserting.
SCRAPER_FIELDS = (
    "fable_id", "title", "author", "shelf",
    "date_finished", "date_finished_type",
    "date_started",  "date_started_type",
    "rating", "isbn", "cover_url",
)


def replace_all_books(books: list[dict]) -> int:
    """Wipe the books table and insert a fresh set in a single transaction.

    `books` is a list of dicts; keys outside SCRAPER_FIELDS are ignored. This
    is the bulk-load path used by the Fable scraper. Returns the number of
    books inserted.

    We also reset the autoincrement counter so freshly-scraped books start at
    id=1 — keeps URLs and console output tidy across reruns.
    """
    with get_connection() as conn:
        conn.execute("DELETE FROM books")
        # sqlite_sequence stores autoincrement state per table. Resetting it
        # is best-effort: the row only exists once a book has been inserted,
        # so on a brand-new database this UPDATE just affects 0 rows.
        conn.execute("DELETE FROM sqlite_sequence WHERE name = 'books'")

        cols = ", ".join(SCRAPER_FIELDS)
        placeholders = ", ".join("?" for _ in SCRAPER_FIELDS)
        rows = [
            tuple(b.get(field) for field in SCRAPER_FIELDS)
            for b in books
        ]
        conn.executemany(
            f"INSERT INTO books ({cols}) VALUES ({placeholders})",
            rows,
        )
        return len(rows)
