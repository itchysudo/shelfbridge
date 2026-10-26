// ShelfBridge: checks on the release notes in extension/app/releases.js.
//
// No framework and no dependencies: run it with
//
//     node tests/releases.test.mjs
//
// The point is to stop a release going out with the previous release's notes:
// the newest entry has to match the version in the manifest.

import { readFileSync } from "node:fs";
import { RELEASES, LATEST_RELEASE } from "../extension/app/releases.js";

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
check("the newest release has at least three items for the welcome page",
    LATEST_RELEASE.items.length >= 3, true);
check("every release has a version, a YYYY-MM date, a title and items",
    RELEASES.every((r) => r.version && /^\d{4}-\d{2}$/.test(r.date) && r.title && r.items.length > 0), true);
check("every item has an icon, a title and some text",
    RELEASES.every((r) => r.items.every((i) => i.icon && i.title && i.text)), true);
check("no exclamation marks, per the brand rules",
    JSON.stringify(RELEASES).includes("!"), false);


console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exit(failures ? 1 : 0);
