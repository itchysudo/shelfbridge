// ShelfBridge: the "Send feedback" form's rules.
//
// Ideas and bug reports go to a Google Apps Script attached to the developer's
// request sheet (tools/feedback-sheet.gs), which adds each one as a new row.
// This file has no DOM access, so the rules can be tested on their own (see
// tests/feedback.test.mjs). app.js wires them to the page.
//
// PRIVACY
// This is the one thing ShelfBridge sends anywhere other than Fable, so it's
// kept narrow on purpose: only what the person types, the extension's version
// number, and an email address if they choose to give one. Nothing about their
// books, and nothing is sent until they press Send. PRIVACY.md says the same,
// so keep the two in step.
//
// TURNING IT ON
// Paste the web app URL from deploying tools/feedback-sheet.gs into
// FEEDBACK_URL. While it's empty, every link to the form stays hidden, so a
// build with no endpoint can't ship a form that goes nowhere.

export const FEEDBACK_URL = "";

// Longest allowed value for each field. The Apps Script checks the same
// limits, because anyone could post to it directly.
export const LIMITS = { title: 120, details: 2000, email: 200 };

export const FEEDBACK_TYPES = [
    { id: "idea",  label: "An idea" },
    { id: "bug",   label: "Something's not working" },
    { id: "other", label: "Something else" },
];

// A deliberately loose check: something@something.something. Anything
// stricter turns away real addresses, and a typo here only costs a reply.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Check what was typed. Returns the cleaned values, plus a message for each
// field that needs fixing (an empty `errors` object means it's fine to send).
export function validateFeedback(input) {
    const value = {
        type:    FEEDBACK_TYPES.some((t) => t.id === input.type) ? input.type : "",
        title:   String(input.title || "").trim(),
        details: String(input.details || "").trim(),
        email:   String(input.email || "").trim(),
    };
    const errors = {};

    if (!value.type) errors.type = "Choose what your message is about.";

    if (!value.title) errors.title = "Add a short summary.";
    else if (value.title.length > LIMITS.title) {
        errors.title = `Keep the summary to ${LIMITS.title} characters or fewer.`;
    }

    if (!value.details) errors.details = "Tell us a bit more.";
    else if (value.details.length > LIMITS.details) {
        errors.details = `Keep this to ${LIMITS.details} characters or fewer.`;
    }

    if (value.email && (value.email.length > LIMITS.email || !EMAIL_PATTERN.test(value.email))) {
        errors.email = "Check the email address, or leave it blank.";
    }

    return { value, errors };
}

// Exactly what goes over the wire. `website` is the hidden trap field: people
// never see it, so anything in it came from a bot filling in every box.
export function buildPayload(value, version, trap = "") {
    return {
        type:    value.type,
        title:   value.title,
        details: value.details,
        email:   value.email,
        version: version,
        website: trap,
    };
}

// Post to the Apps Script and report back. Sent as text/plain so the browser
// makes a simple request with no preflight, which Apps Script can't answer.
// Gives up after 15 seconds rather than leaving the button spinning.
//
// Resolves to { ok: true, reference } or { ok: false, reason }, never throws.
export async function sendFeedback(url, payload, fetchFn = fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetchFn(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
        if (!response.ok) return { ok: false, reason: "server" };
        const data = await response.json();
        return data && data.ok
            ? { ok: true, reference: data.reference || "" }
            : { ok: false, reason: (data && data.reason) || "server" };
    } catch (err) {
        return { ok: false, reason: err && err.name === "AbortError" ? "timeout" : "network" };
    } finally {
        clearTimeout(timer);
    }
}

// What to tell the person when sending fails. Each one says what to do next.
export function failureMessage(reason) {
    if (reason === "busy") {
        return "We're getting a lot of messages right now. Try again in an hour.";
    }
    if (reason === "timeout") {
        return "That's taking too long. Check you're online and try again.";
    }
    return "That didn't send. Check you're online and try again.";
}
