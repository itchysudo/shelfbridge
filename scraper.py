"""Fable scraper — Playwright session, running on a background thread.

This module owns the entire Playwright lifecycle. The Flask app interacts
with it through three simple functions:

  - `start_session(discovery=False)` — open the browser, navigate to Fable.
  - `mark_logged_in()`               — signal "user has finished logging in".
  - `get_status()`                   — current progress as a dict, polled by
                                       the frontend every second or so.

Phase 3a (current): infrastructure only. The actual book extraction is a
stub — instead, we ship a "discovery mode" that captures Fable's real HTML
to disk, so in Phase 3b we can write correct selectors based on what's
actually there.
"""

import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# Shared state.
# ---------------------------------------------------------------------------
# This is a single-user local app, so a process-wide global protected by one
# lock is enough — there's never more than one browser session in flight.

_lock = threading.Lock()
_state: dict = {
    "status":          "idle",
    "message":         "Ready.",
    "books_scraped":   0,
    "total_estimated": None,
    "error":           None,
    "discovery_path":  None,
    "mode":            None,        # 'scrape' or 'discovery'
}
_thread: threading.Thread | None = None
_login_event = threading.Event()    # set when the user clicks "I'm logged in"
_list_urls_event = threading.Event()  # set when the user pastes shelf URLs
_list_urls_payload: list[str] = []    # filled by submit_list_urls()

# Discovery files land here. Gitignored (see .gitignore).
DISCOVERY_DIR = Path(__file__).parent / "_discovery"


def get_status() -> dict:
    """Return a snapshot of the current status — safe to call from Flask."""
    with _lock:
        return dict(_state)


def is_running() -> bool:
    return _thread is not None and _thread.is_alive()


def _set(**changes):
    """Thread-safe state update."""
    with _lock:
        _state.update(changes)


# ---------------------------------------------------------------------------
# Public API — called from Flask routes.
# ---------------------------------------------------------------------------

def start_session(discovery: bool = False) -> None:
    """Launch the browser on a background thread. Returns immediately.

    Raises RuntimeError if a session is already in flight (we only support
    one at a time).
    """
    global _thread
    if is_running():
        raise RuntimeError("A browser session is already running.")

    _login_event.clear()
    _set(status="browser_opening", message="Opening browser…",
         books_scraped=0, total_estimated=None, error=None,
         discovery_path=None,
         mode="discovery" if discovery else "scrape")

    _thread = threading.Thread(target=_run_session,
                               args=(discovery,), daemon=True)
    _thread.start()


def mark_logged_in() -> None:
    """The user has clicked 'I'm logged in' — let the worker proceed."""
    _login_event.set()


def submit_list_urls(urls: list[str]) -> None:
    """The user has pasted shelf URLs after auto-discovery failed — wake the
    worker thread with these to scrape from."""
    global _list_urls_payload
    _list_urls_payload = [u.strip() for u in urls if u.strip()]
    _list_urls_event.set()


# ---------------------------------------------------------------------------
# Worker thread — owns the Playwright lifecycle from launch to teardown.
# ---------------------------------------------------------------------------

def _run_session(discovery: bool) -> None:
    # We import Playwright lazily so the rest of the app still loads even
    # before `playwright install chromium` has been run.
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        _set(status="error",
             message="Playwright isn't installed. Run setup again.",
             error="playwright_missing")
        return

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False)
            context = browser.new_context()
            page = context.new_page()

            try:
                page.goto("https://fable.co/login",
                          wait_until="domcontentloaded", timeout=30000)
            except Exception as e:
                _set(status="error",
                     message="Couldn't reach fable.co — check your internet.",
                     error=str(e))
                browser.close()
                return

            _set(status="awaiting_login",
                 message=("Please log in to Fable in the browser window that "
                          "just opened, then click 'I'm logged in' below."))

            # Wait up to 10 minutes for the user to click "I'm logged in".
            if not _login_event.wait(timeout=600):
                _set(status="error",
                     message="Timed out waiting for you to log in.",
                     error="login_timeout")
                browser.close()
                return

            if discovery:
                _do_discovery(page)
            else:
                _do_scrape(page)

            browser.close()
    except Exception as e:
        # Last-resort safety net — surface the error rather than dying
        # silently on the background thread.
        _set(status="error",
             message=f"Something went wrong: {type(e).__name__}: {e}",
             error=str(e))


# ---------------------------------------------------------------------------
# Discovery mode — dump Fable's HTML so we can inspect it.
# ---------------------------------------------------------------------------

def _do_discovery(page) -> None:
    """Visit known Fable pages and capture both the rendered HTML *and* the
    JSON traffic from Fable's internal API.

    The first discovery run revealed Fable's web app is a React SPA — so
    parsing HTML alone misses the user's data, which arrives via background
    XHR fetches. We hook page.on("response") to grab those JSON payloads;
    they're far more useful than DOM scraping for Phase 3b.
    """
    import json

    _set(status="discovering",
         message="Capturing pages and Fable's API responses…")

    DISCOVERY_DIR.mkdir(parents=True, exist_ok=True)
    # Wipe stale captures so we don't get confused by leftovers from a
    # previous run.
    for old in DISCOVERY_DIR.glob("*"):
        try:
            old.unlink()
        except Exception:
            pass

    # Domains we ignore — third-party trackers and analytics. Anything not
    # in this list that returns JSON gets captured.
    THIRD_PARTY = (
        "segment.com", "segment.io", "facebook.com", "facebook.net",
        "google.com", "google-analytics", "googletagmanager",
        "doubleclick", "helpscout", "osano", "cookielaw",
        "geoip-js", "amazon-adsystem",
    )

    api_calls: list[dict] = []

    def on_response(response):
        url = response.url
        if any(d in url for d in THIRD_PARTY):
            return
        try:
            ct = response.headers.get("content-type", "") or ""
            if "json" not in ct.lower():
                return
            api_calls.append({
                "url":    url,
                "status": response.status,
                "method": response.request.method,
                "body":   response.text(),
            })
        except Exception:
            pass

    page.on("response", on_response)

    # URLs to try — refined based on what the first discovery run revealed.
    # The book-list UUID was supplied by Anthony from his real "Finished
    # Books" list, so we know it returns real data.
    candidate_urls = [
        ("store-home",    "https://fable.co/store"),
        ("store-profile", "https://fable.co/store/profile"),
        ("book-list",     "https://fable.co/book-list/UUID-REDACTED"),
    ]

    saved = []
    for name, url in candidate_urls:
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            # SPAs render after the page settles — give the React tree time
            # to mount and hydrate before we read it.
            page.wait_for_timeout(3000)
            # Trigger lazy loading by scrolling to the bottom.
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2000)

            (DISCOVERY_DIR / f"{name}.html").write_text(
                page.content(), encoding="utf-8"
            )
            saved.append(name)
        except Exception:
            saved.append(f"{name} (failed)")

    # Save every captured JSON response in one file. This is what Phase 3b
    # reads to figure out which Fable API endpoints to call directly.
    (DISCOVERY_DIR / "api-traffic.json").write_text(
        json.dumps(api_calls, indent=2), encoding="utf-8"
    )

    _set(status="complete",
         message=(f"Captured {len(saved)} page(s) and {len(api_calls)} API "
                  "response(s). Check the _discovery/ folder for the results."),
         discovery_path=str(DISCOVERY_DIR))


# ---------------------------------------------------------------------------
# Real scrape — hit Fable's API via the browser's authenticated context.
# ---------------------------------------------------------------------------
#
# Phase 3b discovery revealed that Fable's web app talks to a clean REST API
# at api.fable.co. After login, we don't actually need to scrape any HTML —
# we can just call those endpoints directly using Playwright's
# `page.context.request`, which automatically reuses the browser's cookies
# for auth. That's far more reliable than DOM scraping.

# Map Fable's `system_type` → our internal shelf identifiers. The "finished"
# value was confirmed from a real API response; the other two are educated
# guesses (Fable's mobile UI calls them "Reading" and "Want to Read"). If
# Fable uses different strings, the books still land in the DB — they just
# end up on the "to-read" shelf and the user can re-shelve them in Step 2.
_SHELF_MAP = {
    "finished":          "read",
    "currently_reading": "currently-reading",
    "reading":           "currently-reading",
    "want_to_read":      "to-read",
    "to_read":           "to-read",
}


def _do_scrape(page) -> None:
    """Fetch the user's shelves and books from Fable, save to SQLite."""
    import db  # local import — avoids a circular dep at module load time

    api = page.context.request

    # Fable's API rejects requests that don't carry the exact set of headers
    # the SPA sends — Firebase Bearer auth, plus likely a custom Origin and
    # possibly app-check headers. Rather than reverse-engineer what's
    # required, we let the SPA make a real request inside the browser, snoop
    # its headers, and replay them on our own requests.
    _set(status="scraping", message="Activating Fable session…")
    headers = _capture_fable_auth_headers(page)
    if not headers:
        _set(status="error",
             message=("Couldn't capture Fable's auth headers from your "
                      "session. Try logging out of Fable and back in, then "
                      "click 'Connect to Fable' again."),
             error="no_auth_captured")
        return

    _set(message="Reading your Fable profile…")
    profile, profile_err = _api_get(
        api, "https://api.fable.co/api/settings/profile/", headers=headers)
    if not profile or not profile.get("id"):
        _set(status="error",
             message=f"Couldn't read your Fable profile ({profile_err}).",
             error=profile_err or "profile_fetch_failed")
        return
    user_id = profile["id"]

    # Step 1: auto-discover the user's three system shelves.
    _set(message="Looking for your shelves…")
    shelf_ids = _autodiscover_shelves(api, user_id, headers)

    # Step 2: if auto-discovery failed, ask the user to paste URLs.
    if not shelf_ids:
        _set(status="needs_list_urls",
             message=("We couldn't find your shelves automatically. "
                      "Please paste the URLs of your Fable shelves below "
                      "(one for each shelf you want to import)."))
        _list_urls_event.clear()
        # Wait up to 10 minutes for the user to submit URLs.
        if not _list_urls_event.wait(timeout=600):
            _set(status="error",
                 message="Timed out waiting for shelf URLs.",
                 error="list_urls_timeout")
            return
        shelf_ids = [u for u in (_extract_uuid(s) for s in _list_urls_payload)
                     if u]
        if not shelf_ids:
            _set(status="error",
                 message="None of the URLs you provided looked like a Fable "
                         "shelf URL.",
                 error="no_valid_urls")
            return

    # Step 3: fetch every book from every shelf.
    _set(status="scraping",
         message=f"Found {len(shelf_ids)} shelf/shelves. Loading your books…",
         books_scraped=0, total_estimated=None)

    all_books: list[dict] = []
    for i, list_id in enumerate(shelf_ids, start=1):
        meta, _ = _api_get(
            api,
            f"https://api.fable.co/api/v2/users/{user_id}/book_lists/{list_id}",
            headers=headers,
        )
        shelf_name = _SHELF_MAP.get((meta or {}).get("system_type"), "to-read")
        list_label = (meta or {}).get("name") or "shelf"

        _set(message=f"Loading shelf {i} of {len(shelf_ids)}: {list_label}…")
        entries = _fetch_all_list_books(api, user_id, list_id, headers)

        for entry in entries:
            mapped = _map_entry(entry, shelf_name)
            if mapped:
                all_books.append(mapped)
                _set(books_scraped=len(all_books))

    # Step 4: replace the database in one shot.
    count = db.replace_all_books(all_books)
    _set(status="complete",
         message=f"Imported {count} book{'s' if count != 1 else ''} from your "
                 "Fable library. Move on to Step 2 to review them.",
         books_scraped=count)


# ---------------------------------------------------------------------------
# API helpers.
# ---------------------------------------------------------------------------

def _capture_fable_auth_headers(page) -> dict | None:
    """Trigger SPA API activity in the browser and snoop the request headers
    Fable sends. We return whatever set of headers we observed so we can
    replay them on our own targeted API calls.

    This is more robust than extracting tokens by hand — if Fable adds new
    custom headers (App Check, client-version, etc.) we'll pick them up
    automatically.
    """
    captured: dict[str, str] = {}

    def on_request(request):
        # Only care about Fable's own API host.
        if "api.fable.co" not in request.url:
            return
        # First call wins — we just need one authenticated example.
        if any(k.lower() == "authorization" for k in captured):
            return
        for k, v in request.headers.items():
            captured[k] = v

    page.on("request", on_request)

    # Navigate somewhere that forces the SPA to call its own API. The store
    # profile page reliably issues a settings/profile fetch on load.
    try:
        page.goto("https://fable.co/store/profile",
                  wait_until="networkidle", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(3000)

    # Stop listening — we have what we need (or we don't, and never will).
    try:
        page.remove_listener("request", on_request)
    except Exception:
        pass

    if not any(k.lower() == "authorization" for k in captured):
        return None

    # Build the replay set. We pass through the auth header verbatim plus
    # anything that smells SPA-specific (app-check, fable client info, etc.)
    # — but drop browsing-context headers Playwright will set on its own
    # (host, content-length, sec-*, etc.) to avoid conflicts.
    replay: dict[str, str] = {"Accept": "application/json"}
    for k, v in captured.items():
        kl = k.lower()
        if kl == "authorization":
            replay[k] = v
        elif kl.startswith("x-fable") or kl.startswith("x-firebase"):
            replay[k] = v
        elif kl == "origin" or kl == "referer":
            replay[k] = v
    return replay


def _get_firebase_token(page) -> str | None:
    """Pull the current Firebase idToken out of the page's localStorage.

    Fable's web app signs in via Firebase Auth, which stashes the user's
    JWT in a localStorage key like `firebase:authUser:<api_key>:[DEFAULT]`.
    The token under `stsTokenManager.accessToken` is what Fable's REST API
    expects as a Bearer header. We scan all keys defensively in case the
    naming scheme drifts between Firebase SDK versions.
    """
    try:
        return page.evaluate(
            """() => {
                for (const key of Object.keys(localStorage)) {
                    if (!key.startsWith("firebase:authUser")) continue;
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        const tok = data && data.stsTokenManager
                                  && data.stsTokenManager.accessToken;
                        if (tok) return tok;
                    } catch (e) { /* skip malformed entries */ }
                }
                return null;
            }"""
        )
    except Exception:
        return None


def _api_get(api_request_context, url: str,
             headers: dict | None = None) -> tuple[dict | list | None, str | None]:
    """Make a GET via Playwright's request context.

    Returns `(json_body, None)` on success and `(None, error_label)` on
    failure. The error label is human-readable enough to surface in the UI
    so a non-technical user can tell us what went wrong on a retry.
    """
    try:
        response = api_request_context.get(
            url, headers=headers or {}, timeout=30000)
    except Exception as e:
        return None, f"network error: {type(e).__name__}"

    if not response.ok:
        # 401/403 are by far the most common reason a request would fail
        # here, so call those out specifically.
        if response.status in (401, 403):
            return None, f"HTTP {response.status} — login expired"
        return None, f"HTTP {response.status}"

    try:
        return response.json(), None
    except Exception:
        return None, "couldn't parse Fable's response"


def _autodiscover_shelves(api, user_id: str, headers: dict) -> list[str]:
    """Try to find the user's system shelves via the natural collection URL.
    Returns a list of book_list UUIDs ordered as Fable returns them. Empty
    list means auto-discovery didn't work — the caller falls back to paste."""
    data, _ = _api_get(
        api,
        f"https://api.fable.co/api/v2/users/{user_id}/book_lists/",
        headers=headers,
    )
    if data is None:
        return []
    # Fable could return either a bare list or a paginated dict; handle both.
    items = data if isinstance(data, list) else data.get("results", [])
    if not isinstance(items, list):
        return []
    # We only want the three built-in shelves (Finished / Reading / Want to
    # Read). Custom lists are deliberately excluded — they don't map to
    # Goodreads shelves and would produce duplicates.
    return [it["id"] for it in items
            if isinstance(it, dict) and it.get("type") == "system" and it.get("id")]


def _fetch_all_list_books(api, user_id: str, list_id: str,
                          headers: dict) -> list[dict]:
    """Paginate through every book in one shelf. We ask for the largest page
    Fable's API will allow (100) so big libraries don't take forever."""
    out: list[dict] = []
    url = (f"https://api.fable.co/api/v2/users/{user_id}/book_lists/"
           f"{list_id}/books?limit=100")
    while url:
        page_data, _ = _api_get(api, url, headers=headers)
        if not page_data or not isinstance(page_data, dict):
            break
        out.extend(page_data.get("results") or [])
        url = page_data.get("next")  # None when there are no more pages
    return out


# ---------------------------------------------------------------------------
# Field mapping helpers — convert Fable JSON → our books-table dict.
# ---------------------------------------------------------------------------

def _map_entry(entry: dict, shelf: str) -> dict | None:
    """Convert one /books/ response entry into a row for our books table."""
    book = entry.get("book") or {}
    title = book.get("title")
    if not title:
        return None  # Skip incomplete entries rather than crashing.

    authors = book.get("authors") or []
    # Join multiple authors with a comma — Goodreads accepts this and it
    # preserves all credits. Dedupe while preserving order (Fable
    # occasionally returns the same author twice in the array).
    seen, names = set(), []
    for a in authors:
        n = (a.get("name") or "").strip()
        if n and n not in seen:
            seen.add(n)
            names.append(n)
    author = ", ".join(names)

    return {
        "fable_id":           book.get("id"),
        "title":              title,
        "author":             author or None,
        "shelf":              shelf,
        "date_finished":      _normalise_date(
                                  book.get("finished_reading_at"),
                                  book.get("finished_reading_date_type")),
        "date_finished_type": book.get("finished_reading_date_type"),
        # We pull the start date too even though Goodreads has no native
        # "Date Started" column — the CSV transformer uses it as a much
        # better proxy for "Date Added" than the SQLite insert time.
        "date_started":       _normalise_date(
                                  book.get("started_reading_at"),
                                  book.get("started_reading_date_type")),
        "date_started_type":  book.get("started_reading_date_type"),
        "rating":             book.get("user_rating"),
        "isbn":               book.get("isbn") or book.get("display_isbn"),
        "cover_url":          book.get("cover_image"),
    }


def _normalise_date(raw: str | None, precision: str | None) -> str | None:
    """Always return YYYY-MM-DD (or None). When Fable only knows a month or
    year, default the missing parts to 01 — the UI shows a 'month only' or
    'year only' badge so the user can correct it.

    Fable sometimes returns a full ISO timestamp; we only keep the date
    portion."""
    if not raw:
        return None
    date_part = raw.split("T", 1)[0]   # strip any "T12:34:56" suffix
    parts = date_part.split("-")
    try:
        year = f"{int(parts[0]):04d}"
        if precision == "year" or len(parts) == 1:
            return f"{year}-01-01"
        month = f"{int(parts[1]):02d}"
        if precision == "month" or len(parts) == 2:
            return f"{year}-{month}-01"
        day = f"{int(parts[2]):02d}"
        return f"{year}-{month}-{day}"
    except (ValueError, IndexError):
        return None


def _extract_uuid(url: str) -> str | None:
    """Pull a UUID from a Fable URL like https://fable.co/book-list/<uuid>.
    Returns None if the input doesn't contain a valid-shaped UUID."""
    import re
    m = re.search(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        url.lower())
    return m.group(0) if m else None
