// ShelfBridge — background service worker.

// ---------------------------------------------------------------------------
// Open the main app UI when the toolbar icon is clicked.
// ---------------------------------------------------------------------------

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL("app/app.html") });
});


// ---------------------------------------------------------------------------
// API header snooping.
// ---------------------------------------------------------------------------
//
// Fable's API requires headers that the SPA adds dynamically — most likely
// a Firebase App Check token plus the Authorization Bearer JWT. We can't
// recreate App Check tokens from scratch, so we observe the SPA's actual
// requests to api.fable.co and remember the headers it sends. The scraper
// then asks us for the latest captured set and replays them on its own
// targeted API calls.
//
// We use chrome.webRequest with `extraHeaders` to see every request header,
// including security-sensitive ones (Origin, Referer, etc).

let lastCapturedHeaders = null;

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
        if (!details.url.startsWith("https://api.fable.co/")) return;
        const headers = {};
        for (const h of (details.requestHeaders || [])) {
            headers[h.name] = h.value;
        }
        // Only keep authenticated requests — unauthenticated ones (e.g.
        // public-endpoint preflights) would set us up to fail when we try
        // to replay them.
        const hasAuth = Object.keys(headers).some(
            (k) => k.toLowerCase() === "authorization",
        );
        if (hasAuth) lastCapturedHeaders = headers;
    },
    { urls: ["https://api.fable.co/*"] },
    ["requestHeaders", "extraHeaders"],
);


// ---------------------------------------------------------------------------
// Message handler — lets app pages query / clear captured headers.
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "getCapturedHeaders") {
        sendResponse({ headers: lastCapturedHeaders });
        return false;
    }
    if (msg.type === "clearCapturedHeaders") {
        lastCapturedHeaders = null;
        sendResponse({ ok: true });
        return false;
    }
});
