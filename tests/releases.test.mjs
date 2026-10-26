// ShelfBridge: checks on the release notes in extension/app/releases.js.
//
// No framework and no dependencies: run it with
//
//     node tests/releases.test.mjs
//
// The point is to stop a release going out with the previous release's notes:
// the newest entry has to match the version in the manifest.

import { readFileSync } from "node:fs";
import { RELEASES, LATEST_RELEASE, WELCOME_RELEASE, COMING_NEXT } from "../extension/app/releases.js";
import { FEEDBACK_URL } from "../extension/app/feedback.js";

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

const manifest = JSON.parse(
    readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));

console.log("\nRelease notes");

check("the newest notes are for the version in the manifest",
    LATEST_RELEASE.version, manifest.version);
check("the welcome page has a release with three items to show",
    WELCOME_RELEASE.items.filter((i) => !i.requires).length >= 3, true);
check("the welcome page shows the newest release whenever it has three items",
    LATEST_RELEASE.items.filter((i) => !i.requires).length < 3 || WELCOME_RELEASE === LATEST_RELEASE, true);
check("every release has a version, a YYYY-MM date, a title and items",
    RELEASES.every((r) => r.version && /^\d{4}-\d{2}$/.test(r.date) && r.title && r.items.length > 0), true);
check("every item has an icon, a title and some text",
    RELEASES.every((r) => r.items.every((i) => i.icon && i.title && i.text)), true);
check("no exclamation marks, per the brand rules",
    JSON.stringify([RELEASES, COMING_NEXT]).includes("!"), false);
check("the welcome page's three items never depend on the feedback form",
    WELCOME_RELEASE.items.slice(0, 3).every((i) => !i.requires), true);
check("every roadmap item has an icon, a title and some text",
    COMING_NEXT.every((i) => i.icon && i.title && i.text), true);

// Not a failure, because the form is switched on by deploying a script
// outside this repo. But a release without it has no way for users to get
// in touch, so say so loudly.
if (!FEEDBACK_URL) {
    console.log("\n  WARNING  FEEDBACK_URL in extension/app/feedback.js is empty, so the");
    console.log("           feedback form and every link to it are hidden. Deploy");
    console.log("           tools/feedback-sheet.gs and paste in its URL before releasing.");
}


console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exit(failures ? 1 : 0);
