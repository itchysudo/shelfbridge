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
// The big one — runs entirely inside the fable.co tab and returns books
// already mapped to our schema.
// ---------------------------------------------------------------------------

async function fetchAllBooks(tabId) {
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
        func: async (SHELF_MAP) => {
            try {
            // ----- Helpers (defined inline; closures don't survive serialisation) -----

            function getToken() {
                for (const key of Object.keys(localStorage)) {
                    if (!key.startsWith("firebase:authUser")) continue;
                    try {
                        const data = JSON.parse(localStorage.getItem(key));
                        if (data?.stsTokenManager?.accessToken) {
                            return data.stsTokenManager.accessToken;
                        }
                    } catch (e) {}
                }
                return null;
            }

            async function api(url, token) {
                // credentials: "include" sends fable.co's cookies on this
                // cross-origin call to api.fable.co — the SPA's own client
                // likely does too, and the API may rely on a session cookie
                // alongside the Bearer JWT.
                const r = await fetch(url, {
                    credentials: "include",
                    headers: {
                        Authorization: "Bearer " + token,
                        Accept: "application/json",
                    },
                });
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
            const token = getToken();
            if (!token) {
                // List the keys we did find, to help diagnose if Fable
                // ever changes the localStorage layout.
                const allKeys = Object.keys(localStorage);
                const firebaseKeys = allKeys.filter((k) => k.toLowerCase().includes("firebase"));
                throw new Error(
                    "Couldn't find a Firebase auth token in fable.co's localStorage. " +
                    `Found ${allKeys.length} keys total, ${firebaseKeys.length} firebase-related ` +
                    `(${firebaseKeys.slice(0, 3).join(", ")}).`,
                );
            }

            const profile = await api(
                "https://api.fable.co/api/settings/profile/", token);
            const userId = profile?.id;
            if (!userId) throw new Error("Couldn't read user id from profile.");

            const listsResp = await api(
                `https://api.fable.co/api/v2/users/${userId}/book_lists/`,
                token);
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
                    const page = await api(url, token);
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
        args: [SHELF_MAP],
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

    progressCb?.({ status: "scraping", message: "Reading your library…" });
    const books = await fetchAllBooks(tabId);
    progressCb?.({ status: "done", count: books.length });
    return books;
}
