// ShelfBridge: tests for the "Send feedback" form's rules.
//
// No framework and no dependencies: run it with
//
//     node tests/feedback.test.mjs
//
// Worth pinning because this is the only thing ShelfBridge sends anywhere
// other than Fable: exactly which fields leave the browser matters as much as
// whether the form accepts what people type.

import {
    validateFeedback, buildPayload, sendFeedback, failureMessage, LIMITS, FEEDBACK_TYPES,
} from "../extension/app/feedback.js";

let failures = 0;

function check(name, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        console.log(`  ok    ${name}`);
    } else {
        failures++;
        console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`);
    }
}

const good = { type: "idea", title: "  Sort by series  ", details: " Please. ", email: "" };


// ---------------------------------------------------------------------------
console.log("\nChecking what was typed");
// ---------------------------------------------------------------------------

check("a complete message has no errors", validateFeedback(good).errors, {});
check("spaces are trimmed", validateFeedback(good).value.title, "Sort by series");
check("a type is required", Object.keys(validateFeedback({ ...good, type: "" }).errors), ["type"]);
check("an unknown type is treated as missing", Object.keys(validateFeedback({ ...good, type: "spam" }).errors), ["type"]);
check("a summary is required", Object.keys(validateFeedback({ ...good, title: "   " }).errors), ["title"]);
check("details are required", Object.keys(validateFeedback({ ...good, details: "" }).errors), ["details"]);
check("an over-long summary is caught",
    Object.keys(validateFeedback({ ...good, title: "x".repeat(LIMITS.title + 1) }).errors), ["title"]);
check("a summary exactly at the limit is fine",
    validateFeedback({ ...good, title: "x".repeat(LIMITS.title) }).errors, {});
check("over-long details are caught",
    Object.keys(validateFeedback({ ...good, details: "x".repeat(LIMITS.details + 1) }).errors), ["details"]);
check("email is optional", validateFeedback({ ...good, email: "" }).errors, {});
check("a normal email is accepted", validateFeedback({ ...good, email: "reader@example.co.uk" }).errors, {});
check("a broken email is caught", Object.keys(validateFeedback({ ...good, email: "reader@example" }).errors), ["email"]);
check("every type has an id and a label", FEEDBACK_TYPES.every((t) => t.id && t.label), true);


// ---------------------------------------------------------------------------
console.log("\nWhat gets sent");
// ---------------------------------------------------------------------------

const payload = buildPayload(validateFeedback(good).value, "2.2610.1");
check("only these fields leave the browser",
    Object.keys(payload).sort(), ["details", "email", "title", "type", "version", "website"]);
check("the version is included, for bug reports", payload.version, "2.2610.1");
check("the trap field is empty for a person", payload.website, "");


// ---------------------------------------------------------------------------
console.log("\nSending, with a pretend server");
// ---------------------------------------------------------------------------

const replyWith = (status, body) => async () => ({ ok: status === 200, json: async () => body });

check("a good reply gives the reference",
    await sendFeedback("u", payload, replyWith(200, { ok: true, reference: "SB-014" })), { ok: true, reference: "SB-014" });
check("a refusal from the script is passed on",
    await sendFeedback("u", payload, replyWith(200, { ok: false, reason: "busy" })), { ok: false, reason: "busy" });
check("an HTTP error counts as a server problem",
    await sendFeedback("u", payload, replyWith(500, {})), { ok: false, reason: "server" });
check("being offline is reported, not thrown",
    await sendFeedback("u", payload, async () => { throw new TypeError("Failed to fetch"); }), { ok: false, reason: "network" });

let sent;
await sendFeedback("u", payload, async (url, options) => { sent = options; return { ok: true, json: async () => ({ ok: true }) }; });
check("it's a POST", sent.method, "POST");
check("sent as plain text, so there's no preflight", sent.headers["Content-Type"], "text/plain;charset=utf-8");
check("the body is the payload as JSON", JSON.parse(sent.body), payload);

check("every failure message says what to do next",
    ["busy", "timeout", "network", "server"].every((r) => /try again/i.test(failureMessage(r))), true);


console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exit(failures ? 1 : 0);
