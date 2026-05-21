// ShelfBridge — Fable scraper.
//
// We don't make API calls from the extension's own origin
// (chrome-extension://[id]) because Fable's API expects requests from
// https://fable.co. Instead we use chrome.scripting.executeScript with
// `world: "MAIN"` to run our fetch code INSIDE a fable.co tab, where:
//   - the origin is https://fable.co (so CORS is happy)
//   - localStorage has the Firebase auth token we need for the Bearer header
//
// This matches the Flask version's "snoop the SPA's headers" approach in
// spirit, but is cleaner: the extension literally runs in the SPA's origin.

const LOGIN_URL = "https://fable.co/login";

// Map Fable's `system_type` → our internal shelf identifiers.
const SHELF_MAP = {
    finished:          "read",
    currently_reading: "currently-reading",
    reading:           "currently-reading",
    want_to_read:      "to-read",
    to_read:           "to-read",
};


// ---------------------------------------------------------------------------
// Tab management.
// ---------------------------------------------------------------------------

// Return the id of an open fable.co tab, or null if none exists.
async function findFableTab() {
    const tabs = await chrome.tabs.query({ url: "*://fable.co/*" });
    return tabs.length ? tabs[0].id : null;
}

// Open fable.co in a new tab and resolve once it's finished loading.
async function openFableTab(url = LOGIN_URL) {
    const tab = await chrome.tabs.create({ url, active: true });
    return await waitForTabComplete(tab.id);
}

function waitForTabComplete(tabId) {
    return new Promise((resolve) => {
        function onUpdated(updatedId, info) {
            if (updatedId === tabId && info.status === "complete") {
                chrome.tabs.onUpdated.removeListener(onUpdated);
                resolve(tabId);
            }
        }
        chrome.tabs.onUpdated.addListener(onUpdated);
    });
}


// ---------------------------------------------------------------------------
// Login detection — peek at localStorage in the fable.co tab.
// ---------------------------------------------------------------------------

async function isLoggedIn(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world:  "MAIN",
        func: () => {
            for (const key of Object.keys(localStorage)) {
                if (!key.startsWith("firebase:authUser")) continue;
                try {
                    const data = JSON.parse(localStorage.getItem(key));
                    if (data?.stsTokenManager?.accessToken) return true;
                } catch (e) { /* skip malformed entries */ }
            }
            return false;
        },
    });
    return result;
}


// ---------------------------------------------------------------------------
// Header capture — trigger SPA activity so the background service worker
// can observe and remember the request headers Fable's own client uses.
// ---------------------------------------------------------------------------

async function captureHeaders(tabId) {
    // Drop any stale capture from a previous run.
    await chrome.runtime.sendMessage({ type: "clearCapturedHeaders" });

    // Reload the tab on a URL we know the SPA hits the API from. This
    // forces a fresh batch of requests we can listen to.
    await chrome.tabs.update(tabId, { url: "https://fable.co/store/profile" });
    await waitForTabComplete(tabId);
    // Give the SPA a couple of seconds after load to actually fire its calls.
    await new Promise((r) => setTimeout(r, 3000));

    const response = await chrome.runtime.sendMessage({ type: "getCapturedHeaders" });
    return (response && response.headers) || null;
}


// ---------------------------------------------------------------------------
// The big one — runs entirely inside the fable.co tab and returns books
// already mapped to our schema, using the headers we snooped from the SPA.
// ---------------------------------------------------------------------------

async function fetchAllBooks(tabId, capturedHeaders) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        world:  "MAIN",
        // Note: this function executes in the page context — it cannot
        // close over anything from this module. Anything it needs has to
        // arrive via the `args` array.
        //
        // We wrap the whole body in try/catch and return a structured
        // result, because chrome.scripting silently turns any thrown
        // exception into `result: null` — we'd otherwise lose the real
        // error and only see "cannot read properties of null" downstream.
        func: async (SHELF_MAP, capturedHeaders) => {
            try {
            // ----- Helpers (defined inline; closures don't survive serialisation) -----

            // Build the header set we replay on our own API calls. Drop
            // headers the browser controls (it'll set them automatically
            // and reject manual overrides), keep auth and any X-* customs.
            const FORBIDDEN_HEADERS = new Set([
                "host", "cookie", "content-length", "connection",
                "accept-encoding", "origin", "referer",
            ]);
            const replayHeaders = { Accept: "application/json" };
            for (const [name, value] of Object.entries(capturedHeaders || {})) {
                if (FORBIDDEN_HEADERS.has(name.toLowerCase())) continue;
                replayHeaders[name] = value;
            }
            if (!Object.keys(replayHeaders).some((k) => k.toLowerCase() === "authorization")) {
                throw new Error(
                    "No Authorization header was captured from Fable. The page " +
                    "may not have fired an authenticated API call — try reloading " +
                    "the Fable tab and clicking Connect again.",
                );
            }

            async function api(url) {
                const r = await fetch(url, { headers: replayHeaders });
                if (!r.ok) throw new Error("HTTP " + r.status + " from " + url);
                return r.json();
            }

            function normaliseDate(raw, precision) {
                if (!raw) return null;
                const datePart = String(raw).split("T")[0];
                const parts = datePart.split("-");
                try {
                    const year = String(parseInt(parts[0], 10)).padStart(4, "0");
                    if (precision === "year" || parts.length === 1) {
                        return year + "-01-01";
                    }
                    const month = String(parseInt(parts[1], 10)).padStart(2, "0");
                    if (precision === "month" || parts.length === 2) {
                        return year + "-" + month + "-01";
                    }
                    const day = String(parseInt(parts[2], 10)).padStart(2, "0");
                    return year + "-" + month + "-" + day;
                } catch (e) {
                    return null;
                }
            }

            function mapEntry(entry, shelf) {
                const book = entry.book || {};
                if (!book.title) return null;
                // Dedupe author names (Fable occasionally returns dupes).
                const authors = book.authors || [];
                const seen = new Set();
                const names = [];
                for (const a of authors) {
                    const n = (a.name || "").trim();
                    if (n && !seen.has(n)) { seen.add(n); names.push(n); }
                }
                return {
                    id:                  book.id || crypto.randomUUID(),
                    fable_id:            book.id || null,
                    title:               book.title,
                    author:              names.join(", ") || null,
                    shelf:               shelf,
                    date_finished:       normaliseDate(
                                             book.finished_reading_at,
                                             book.finished_reading_date_type),
                    date_finished_type:  book.finished_reading_date_type || null,
                    date_started:        normaliseDate(
                                             book.started_reading_at,
                                             book.started_reading_date_type),
                    date_started_type:   book.started_reading_date_type || null,
                    rating:              book.user_rating || null,
                    isbn:                book.isbn || book.display_isbn || null,
                    cover_url:           book.cover_image || null,
                };
            }

            // ----- The actual flow -----
            // Auth is handled by replaying the captured headers — no token
            // extraction needed in the scrape step.
            const profile = await api(
                "https://api.fable.co/api/settings/profile/");
            const userId = profile?.id;
            if (!userId) throw new Error("Couldn't read user id from profile.");

            const listsResp = await api(
                `https://api.fable.co/api/v2/users/${userId}/book_lists/`);
            const lists = Array.isArray(listsResp)
                ? listsResp
                : (listsResp.results || []);
            const systemLists = lists.filter(
                (l) => l && l.type === "system" && l.id);
            if (systemLists.length === 0) {
                throw new Error(
                    "Couldn't find any built-in Fable shelves on your account.");
            }

            const allBooks = [];
            for (const list of systemLists) {
                const shelf = SHELF_MAP[list.system_type] || "to-read";
                let url = `https://api.fable.co/api/v2/users/${userId}/book_lists/${list.id}/books?limit=100`;
                while (url) {
                    const page = await api(url);
                    for (const entry of (page.results || [])) {
                        const mapped = mapEntry(entry, shelf);
                        if (mapped) allBooks.push(mapped);
                    }
                    url = page.next;  // null when no more pages
                }
            }

            return { ok: true, books: allBooks };
            } catch (e) {
                return {
                    ok: false,
                    error: (e && e.message) ? e.message : String(e),
                    stack: e?.stack || null,
                };
            }
        },
        args: [SHELF_MAP, capturedHeaders],
    });

    // Defensive: chrome.scripting returns one InjectionResult per frame.
    // We targeted just the tab, so there's normally exactly one. Treat any
    // missing/null result as a hard failure so we don't crash downstream.
    if (!results || results.length === 0) {
        throw new Error("Chrome didn't run the scraper in the Fable tab — try reloading the tab and clicking Connect again.");
    }
    const payload = results[0].result;
    if (!payload) {
        const injectionError = results[0].error?.message || "(no detail)";
        throw new Error("Scraper script crashed in the Fable tab: " + injectionError);
    }
    if (!payload.ok) {
        throw new Error(payload.error || "Scraper failed for an unknown reason.");
    }
    return payload.books;
}


// ---------------------------------------------------------------------------
// Public API — what app.js calls.
// ---------------------------------------------------------------------------

// Run the full scrape. progressCb receives status snapshots like
//   { status: "opening" | "checking" | "scraping" | "done", message?, count? }
// On failure throws { code, message, tabId? } so the UI can react
// (especially to "not_logged_in").
export async function runScrape(progressCb) {
    let tabId = await findFableTab();
    if (!tabId) {
        progressCb?.({ status: "opening", message: "Opening Fable in a new tab…" });
        tabId = await openFableTab();
    }

    progressCb?.({ status: "checking", message: "Checking your Fable login…" });
    const loggedIn = await isLoggedIn(tabId);
    if (!loggedIn) {
        // Steer them to the login page in the same tab.
        const tab = await chrome.tabs.get(tabId);
        if (!/login|signin/.test(tab.url || "")) {
            await chrome.tabs.update(tabId, { url: LOGIN_URL, active: true });
        } else {
            await chrome.tabs.update(tabId, { active: true });
        }
        throw {
            code: "not_logged_in",
            tabId,
            message: "You're not signed in to Fable. Sign in in the tab we " +
                     "opened, then come back here and click Connect again.",
        };
    }

    // Trigger SPA activity so the background service worker can snoop the
    // Authorization (and any X-Firebase-AppCheck) headers Fable's own
    // client sends. This is the only reliable way to get the full set of
    // headers the API expects — we can't recreate App Check tokens.
    progressCb?.({ status: "scraping", message: "Capturing Fable's auth headers…" });
    const headers = await captureHeaders(tabId);
    if (!headers || !Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) {
        throw new Error(
            "Couldn't capture Fable's request headers — the Fable tab didn't " +
            "fire any authenticated API calls. Try signing out of Fable, " +
            "signing back in, then clicking Connect again.",
        );
    }

    progressCb?.({ status: "scraping", message: "Reading your library…" });
    const books = await fetchAllBooks(tabId, headers);
    progressCb?.({ status: "done", count: books.length });
    return books;
}
