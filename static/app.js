// Fable → Goodreads — frontend JS.
//
// Two pages have JS behaviour:
//   - index.html      — the "Connect to Fable" button (placeholder for now).
//   - library.html    — inline editing, star ratings, shelf filter, delete.
//
// We attach behaviour conditionally based on which elements exist on the
// page, so this single file works for both.

document.addEventListener("DOMContentLoaded", () => {
    initConnectFlow();
    initLibraryPage();
});


// ---------------------------------------------------------------------------
// Step 1 — Connect to Fable. State machine driven by /scrape/status polling.
// ---------------------------------------------------------------------------
//
// The card has several panels (one per state, identified by data-state).
// We reveal exactly one at a time. The server is the source of truth — JS
// polls /scrape/status every second and reflects whatever it says.

const STATUS_POLL_MS = 1000;
let statusPollTimer = null;

function initConnectFlow() {
    const card = document.getElementById("connect-card");
    if (!card) return;  // Not on the index page.

    const connectBtn    = document.getElementById("connect-btn");
    const discoveryBtn  = document.getElementById("discovery-btn");
    const loggedInBtn   = document.getElementById("loggedin-btn");
    const submitUrlsBtn = document.getElementById("submit-urls-btn");
    const retryBtn      = document.getElementById("retry-btn");

    if (connectBtn)    connectBtn.addEventListener("click",   () => startScrape(false));
    if (discoveryBtn)  discoveryBtn.addEventListener("click", (e) => {
        e.preventDefault();
        startScrape(true);
    });
    if (loggedInBtn)   loggedInBtn.addEventListener("click",   confirmLogin);
    if (submitUrlsBtn) submitUrlsBtn.addEventListener("click", submitListUrls);
    if (retryBtn)      retryBtn.addEventListener("click",      () => location.reload());
}

async function startScrape(discovery) {
    /* Kick off a new browser session and begin polling for status updates. */
    const url = "/scrape/start" + (discovery ? "?discovery=1" : "");
    try {
        const resp = await fetch(url, { method: "POST" });
        if (resp.status === 409) {
            // A session is already running (probably from an earlier click).
            // That's fine — just start polling and let the UI catch up.
        } else if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showError(err.error || "Couldn't start the browser.");
            return;
        }
    } catch (e) {
        showError("Couldn't reach the server.");
        return;
    }
    startPolling();
}

async function confirmLogin() {
    /* User has clicked "I'm logged in" — tell the server. */
    const btn = document.getElementById("loggedin-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
    try {
        await fetch("/scrape/confirm", { method: "POST" });
    } catch (e) {
        showError("Couldn't reach the server.");
    }
    // The next status poll will move us into the "working" panel.
}


async function submitListUrls() {
    /* Auto-discovery couldn't find the user's shelves — they've pasted URLs
       into the textarea. Send them up so the worker thread can continue. */
    const textarea = document.getElementById("list-urls");
    if (!textarea) return;
    const urls = textarea.value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (urls.length === 0) {
        alert("Please paste at least one shelf URL.");
        return;
    }
    const btn = document.getElementById("submit-urls-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Working…"; }

    try {
        const resp = await fetch("/scrape/list_urls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showError(err.error || "Couldn't submit shelf URLs.");
            return;
        }
    } catch (e) {
        showError("Couldn't reach the server.");
        return;
    }
    // Next poll will move us into "scraping".
}

function startPolling() {
    if (statusPollTimer) return;  // Already polling.
    pollOnce();  // First call immediately, then set up the interval.
    statusPollTimer = setInterval(pollOnce, STATUS_POLL_MS);
}

function stopPolling() {
    if (statusPollTimer) {
        clearInterval(statusPollTimer);
        statusPollTimer = null;
    }
}

async function pollOnce() {
    let status;
    try {
        const resp = await fetch("/scrape/status");
        status = await resp.json();
    } catch (e) {
        return;  // Transient network blip — try again on the next tick.
    }
    renderStatus(status);
}

function renderStatus(status) {
    /* Map server status → which panel to show + per-panel content. */
    switch (status.status) {
        case "browser_opening":
            showPanel("browser_opening");
            setText("opening-message", status.message);
            break;

        case "awaiting_login":
            showPanel("awaiting_login");
            setText("login-message", status.message);
            break;

        case "needs_list_urls":
            showPanel("needs_list_urls");
            setText("needs-urls-message", status.message);
            break;

        case "scraping":
        case "discovering": {
            showPanel("working");
            const heading = status.mode === "discovery"
                ? "Capturing pages for inspection…"
                : "Reading your library…";
            setText("working-heading", heading);
            setText("working-message", status.message);
            const detail = document.getElementById("working-detail");
            if (detail) {
                detail.textContent = status.books_scraped
                    ? `${status.books_scraped} book${status.books_scraped === 1 ? "" : "s"} found so far`
                    : "";
            }
            break;
        }

        case "complete":
            showPanel("complete");
            setText("complete-message", status.message);
            stopPolling();
            break;

        case "error":
            showError(status.message || "Something went wrong.");
            stopPolling();
            break;

        case "idle":
            // Server has nothing in flight — leave the intro panel up.
            break;
    }
}

function showPanel(stateName) {
    /* Hide every connect-state panel, then reveal the one we want. */
    document.querySelectorAll(".connect-state").forEach((el) => {
        el.hidden = (el.dataset.state !== stateName);
    });
}

function showError(message) {
    showPanel("error");
    setText("error-message", message);
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el && text) el.textContent = text;
}


// ---------------------------------------------------------------------------
// Step 2 — Library page.
// ---------------------------------------------------------------------------

function initLibraryPage() {
    const tbody = document.getElementById("book-tbody");
    if (!tbody) return;  // Not on the library page; nothing to do.

    // Set the summary line on first load.
    updateSummary();

    // Inline edits — one delegated listener for text inputs, date inputs,
    // and the shelf <select>. The `change` event fires:
    //   - on every selection for <select> and <input type="date">
    //   - on blur (after the value has changed) for <input type="text">
    // …which is exactly the behaviour we want.
    tbody.addEventListener("change", async (event) => {
        const input = event.target;
        if (!input.classList.contains("cell-input")) return;

        const row = input.closest("tr");
        const bookId = row.dataset.bookId;
        const field = input.dataset.field;
        const value = input.value;

        // Build the patch. If the user typed a new date, also clear the
        // matching 'month only' / 'year only' precision flag — they've
        // taken ownership of the date, so the badge no longer applies.
        const patch = { [field]: value };
        if (field === "date_finished") patch.date_finished_type = null;
        if (field === "date_started")  patch.date_started_type  = null;

        const updated = await patchBook(bookId, patch);
        if (updated) {
            if (field === "shelf") {
                // Keep the row's data attribute in sync with the new shelf so
                // the filter logic stays correct.
                row.dataset.shelf = updated.shelf;
                updateSummary();
                applyActiveFilter();
            }
            if (field === "date_finished" || field === "date_started") {
                // Remove the matching precision badge in the DOM too
                // (server side already cleared it above).
                const cell = input.closest("td");
                const badge = cell && cell.querySelector(".precision-badge");
                if (badge) badge.remove();
            }
            showSaved();
        }
    });

    // Star rating clicks.
    tbody.addEventListener("click", async (event) => {
        const star = event.target.closest(".star");
        if (!star) return;

        const stars = star.parentElement;
        const row = star.closest("tr");
        const bookId = row.dataset.bookId;
        const clicked = Number(star.dataset.value);
        const current = Number(stars.dataset.value);
        // Click the same star you're on → clear the rating to 0.
        const newRating = (clicked === current) ? 0 : clicked;

        const updated = await patchBook(bookId, { rating: newRating });
        if (updated) {
            stars.dataset.value = newRating;
            showSaved();
        }
    });

    // Delete buttons.
    tbody.addEventListener("click", async (event) => {
        const btn = event.target.closest(".delete-btn");
        if (!btn) return;

        const row = btn.closest("tr");
        const title = row.querySelector('[data-field="title"]').value;
        if (!confirm(`Remove "${title}" from your library?`)) return;

        const bookId = row.dataset.bookId;
        const response = await fetch(`/api/books/${bookId}`,
                                     { method: "DELETE" });
        if (response.ok) {
            row.remove();
            updateSummary();
            showSaved();
        } else {
            alert("Couldn't delete that book. Please try again.");
        }
    });

    // Shelf filter buttons.
    const filterBar = document.querySelector(".filter-bar");
    if (filterBar) {
        filterBar.addEventListener("click", (event) => {
            const btn = event.target.closest(".filter-btn");
            if (!btn) return;
            filterBar.querySelectorAll(".filter-btn")
                     .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            applyActiveFilter();
        });
    }
}


// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

async function patchBook(bookId, changes) {
    /* Send a PATCH to /api/books/<id>. Returns the updated book on success,
       or null on failure (in which case we surface the server's error). */
    try {
        const response = await fetch(`/api/books/${bookId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(changes),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            alert(err.error || "Save failed — please try again.");
            return null;
        }
        return await response.json();
    } catch (e) {
        alert("Couldn't reach the server. Is it still running?");
        return null;
    }
}


function applyActiveFilter() {
    /* Show only rows whose shelf matches the active filter button. */
    const active = document.querySelector(".filter-btn.active");
    const filter = active ? active.dataset.filter : "all";
    document.querySelectorAll("#book-tbody tr").forEach((row) => {
        row.hidden = (filter !== "all" && row.dataset.shelf !== filter);
    });
    updateSummary();
}


function updateSummary() {
    /* Recount the visible rows by shelf and update the summary line. */
    const rows = Array.from(document.querySelectorAll("#book-tbody tr"))
                      .filter((r) => !r.hidden);
    const total = rows.length;
    const counts = { "read": 0, "currently-reading": 0, "to-read": 0 };
    rows.forEach((r) => {
        if (counts[r.dataset.shelf] !== undefined) counts[r.dataset.shelf]++;
    });
    const el = document.getElementById("summary");
    if (!el) return;
    el.innerHTML = `<strong>${total}</strong> book${total === 1 ? "" : "s"} — `
                 + `${counts["read"]} read, `
                 + `${counts["currently-reading"]} reading, `
                 + `${counts["to-read"]} want to read`;
}


// The saved indicator is a single floating pip. We re-trigger its fade-out
// every time a save happens by removing and re-adding the .visible class.
let savedTimer = null;
function showSaved() {
    const el = document.getElementById("saved-indicator");
    if (!el) return;
    el.classList.add("visible");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove("visible"), 1500);
}
