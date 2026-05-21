"""ShelfBridge — the Fable → Goodreads library exporter, as a small Flask app.

This is the entry point. Run it with:

    python app.py

…and then open http://localhost:5050 in your browser.

(We use port 5050 rather than the more common 5000, because on macOS port
5000 is taken by AirPlay Receiver — Flask appears to start fine but every
request returns "403 Forbidden".)

Phase 2 (current): the library page supports inline editing, deletion, and
a real Goodreads CSV download. Scraping is still a stub — Phase 3.
"""

import os
import threading
import webbrowser

from flask import Flask, Response, jsonify, render_template, request

import db
import scraper
import transformer

app = Flask(__name__)

# Bumped on each release. Shown on the Help & guide page so users (and bug
# reporters) can tell which version they're on.
VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# Page routes — each one renders an HTML template.
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    """Step 1: Welcome screen + "Connect to Fable" button."""
    return render_template("index.html")


@app.route("/library")
def library():
    """Step 2: Review the scraped books (currently shows the seeded fakes)."""
    books = db.get_all_books()
    return render_template("library.html", books=books)


@app.route("/export")
def export():
    """Step 3: Preview and download the Goodreads CSV."""
    books = db.get_all_books()
    return render_template("export.html", books=books)


@app.route("/guide")
def guide():
    """Help & guide page — walkthrough, FAQ, and About section."""
    return render_template("guide.html", version=VERSION)


# ---------------------------------------------------------------------------
# JSON API — used by the frontend JavaScript.
# ---------------------------------------------------------------------------

# Allowed shelf values. Anything outside this set is rejected on PATCH.
VALID_SHELVES = {"read", "currently-reading", "to-read"}


def _validate_change(field: str, value):
    """Check one field/value pair is well-formed for PATCH.

    Returns (cleaned_value, error_message). If `error_message` is None,
    `cleaned_value` is safe to write to the database. If `error_message` is
    set, the caller should return a 400 with that message.
    """
    # Convert empty strings to None so we get proper NULLs in SQLite for
    # nullable text columns. The user clearing a field should mean "no value".
    if isinstance(value, str) and value.strip() == "":
        value = None

    if field == "title":
        if not value:
            return None, "Title cannot be empty."
        return str(value).strip(), None

    if field in ("author", "isbn"):
        return (str(value).strip() if value is not None else None), None

    if field == "shelf":
        if value not in VALID_SHELVES:
            return None, f"Shelf must be one of: {sorted(VALID_SHELVES)}."
        return value, None

    if field in ("date_finished", "date_started"):
        if value is None:
            return None, None
        # Loose validation: just check the "YYYY-MM-DD" shape. The HTML5
        # date input already enforces this on the client; this is the
        # belt-and-braces server-side check.
        s = str(value)
        if len(s) != 10 or s[4] != "-" or s[7] != "-":
            return None, "Date must be in YYYY-MM-DD format."
        return s, None

    if field in ("date_finished_type", "date_started_type"):
        # Internal precision flags — set by the scraper, cleared by the UI
        # when the user manually edits the corresponding date.
        if value not in (None, "full", "month", "year"):
            return None, "Invalid date precision."
        return value, None

    if field == "rating":
        if value is None:
            return None, None
        try:
            n = int(value)
        except (TypeError, ValueError):
            return None, "Rating must be a number."
        if n < 0 or n > 5:
            return None, "Rating must be between 0 and 5."
        # We store 0 as NULL so "no rating" is a single concept in the DB.
        return (n if n > 0 else None), None

    return None, f"Field '{field}' is not editable."


@app.route("/api/books")
def api_books():
    """Return all books as JSON. Used by the library page on first load."""
    return jsonify(db.get_all_books())


@app.route("/api/books/<int:book_id>", methods=["PATCH"])
def api_update_book(book_id: int):
    """Apply a partial update. Body is JSON like {"rating": 4}."""
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict) or not payload:
        return jsonify({"error": "Body must be a non-empty JSON object."}), 400

    # Reject any unknown field up-front so the user gets a clear error
    # rather than a silent no-op.
    unknown = set(payload) - db.EDITABLE_FIELDS
    if unknown:
        return jsonify({"error": f"Cannot edit: {sorted(unknown)}."}), 400

    cleaned = {}
    for field, raw in payload.items():
        value, err = _validate_change(field, raw)
        if err:
            return jsonify({"error": err, "field": field}), 400
        cleaned[field] = value

    updated = db.update_book(book_id, cleaned)
    if updated is None:
        return jsonify({"error": "Book not found."}), 404
    return jsonify(updated)


@app.route("/api/books/<int:book_id>", methods=["DELETE"])
def api_delete_book(book_id: int):
    """Permanently remove a book from the library."""
    if not db.delete_book(book_id):
        return jsonify({"error": "Book not found."}), 404
    return ("", 204)  # 204 = success, no content to return.


@app.route("/scrape/start", methods=["POST"])
def scrape_start():
    """Open a Playwright browser so the user can log in to Fable.

    Pass `?discovery=1` to run discovery mode (dump HTML for inspection)
    instead of real scraping. Returns immediately; the actual work happens
    on a background thread — poll /scrape/status for progress.
    """
    discovery = request.args.get("discovery") in ("1", "true", "yes")
    try:
        scraper.start_session(discovery=discovery)
    except RuntimeError as e:
        # Already running — surface a 409 so the frontend can decide.
        return jsonify({"error": str(e)}), 409
    return jsonify(scraper.get_status())


@app.route("/scrape/confirm", methods=["POST"])
def scrape_confirm():
    """The user has clicked 'I'm logged in' — wake the worker thread."""
    scraper.mark_logged_in()
    return jsonify(scraper.get_status())


@app.route("/scrape/list_urls", methods=["POST"])
def scrape_list_urls():
    """Fallback path: the user has pasted their shelf URLs because we
    couldn't find them automatically. Body is JSON like {"urls": [...]}.
    """
    payload = request.get_json(silent=True) or {}
    urls = payload.get("urls") or []
    if not isinstance(urls, list) or not urls:
        return jsonify({"error": "Please provide at least one shelf URL."}), 400
    scraper.submit_list_urls(urls)
    return jsonify(scraper.get_status())


@app.route("/scrape/status")
def scrape_status():
    """Polled by the frontend to drive the progress UI."""
    return jsonify(scraper.get_status())


@app.route("/export/csv")
def export_csv():
    """Download the current library as a Goodreads-format CSV file."""
    csv_text = transformer.generate_csv(db.get_all_books())
    return Response(
        csv_text,
        mimetype="text/csv",
        headers={
            "Content-Disposition":
                'attachment; filename="goodreads_import.csv"',
        },
    )


# ---------------------------------------------------------------------------
# Startup — make sure the database is ready before serving any requests.
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    db.init_db()
    db.seed_fake_books_if_empty()

    # Open the user's default browser once Flask is up. The delay gives the
    # server a moment to start listening on the port — otherwise the browser
    # arrives before Flask is ready and shows a connection error.
    #
    # When debug=True, the Werkzeug reloader spawns a child process that
    # also runs this `__main__` block. WERKZEUG_RUN_MAIN is set in the
    # child, unset in the parent — we open the browser exactly once, either
    # in production (no reloader) or in the reloader's child.
    PORT = 5050
    debug_mode = os.environ.get("FLASK_DEBUG") == "1"
    if not debug_mode or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        threading.Timer(
            1.2,
            lambda: webbrowser.open(f"http://localhost:{PORT}"),
        ).start()

    # debug defaults to off so end users don't see the Werkzeug debugger /
    # PIN prompt. Run with `FLASK_DEBUG=1 python app.py` during development
    # to get auto-reload and the in-browser tracebacks back.
    app.run(debug=debug_mode, port=PORT)
