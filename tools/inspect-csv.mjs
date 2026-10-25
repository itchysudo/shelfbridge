// ShelfBridge — inspect a library CSV.
//
//     node tools/inspect-csv.mjs <file.csv> [search term]
//
// A triage tool for when somebody reports that an import went wrong. It answers
// the questions worth answering before theorising:
//
//   * which of our three formats is this, and is the header exactly right
//   * how many rows, and does every row have the right number of fields
//   * which rows have no usable identifier, the leading suspect in the
//     phantom-book reports
//   * are any values in there that we would never write
//   * is the mystery book literally in the file, which would mean the problem
//     sits upstream of the CSV entirely
//
// Development only. Not part of the extension and not in the shipped package.

import { readFileSync } from "node:fs";
import { TARGETS } from "../extension/app/targets.js";

const file = process.argv[2];
const needle = process.argv[3];

if (!file) {
    console.error("usage: node tools/inspect-csv.mjs <file.csv> [search term]");
    process.exit(2);
}

// A proper RFC 4180 parse. Splitting on commas is not good enough here: titles
// contain them, and a shifted column is one of the things we're looking for.
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                // A doubled quote is one literal quote.
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ",") {
            row.push(field);
            field = "";
        } else if (c === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (c !== "\r") {
            field += c;
        }
    }
    // Anything left over is a final row with no trailing newline.
    if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

// Goodreads writes ISBNs as ="9780..." so spreadsheets don't mangle them.
// StoryGraph writes them bare. Strip either way before checking.
function unwrapIsbn(value) {
    const wrapped = String(value || "").match(/^="(.*)"$/);
    const inner = wrapped ? wrapped[1] : String(value || "");
    return inner.replace(/[^0-9Xx]/g, "").toUpperCase();
}

// Verify the check digit, so a typo or a truncated number gets caught rather
// than being treated as a valid identifier the destination just couldn't find.
function isbnLooksReal(digits) {
    if (digits.length === 13) {
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
        }
        return String((10 - (sum % 10)) % 10) === digits[12];
    }
    if (digits.length === 10) {
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += Number(digits[i]) * (10 - i);
        }
        const check = (11 - (sum % 11)) % 11;
        return (check === 10 ? "X" : String(check)) === digits[9];
    }
    return false;
}

const raw = readFileSync(file, "utf8");
const rows = parseCSV(raw);

if (rows.length === 0) {
    console.log("The file is empty.");
    process.exit(0);
}

const header = rows[0];
const body = rows.slice(1);
const indexOf = (name) => header.indexOf(name);
const cell = (row, name) => {
    const i = indexOf(name);
    return i === -1 ? "" : (row[i] ?? "");
};

console.log("");
console.log(file);
console.log(`${body.length} data rows, ${header.length} columns`);
console.log(raw.includes("\r\n")
    ? "Line endings: CRLF, which is what we write"
    : "Line endings: LF, but we write CRLF");


// ---------------------------------------------------------------------------
// Which format, and is the header exact?
// ---------------------------------------------------------------------------
// These apps identify a file by matching its header, so an inexact header is
// the difference between an import and a silent rejection.

console.log("\nFormat");

const exact = TARGETS.find((t) => t.columns.join(" ") === header.join(" "));

if (exact) {
    console.log(`  Exact match for the ${exact.label} route (${exact.filename}).`);
} else {
    const scored = TARGETS.map((t) => ({
        target: t,
        shared: t.columns.filter((c) => header.includes(c)).length,
        missing: t.columns.filter((c) => !header.includes(c)),
        extra: header.filter((c) => !t.columns.includes(c)),
    })).sort((a, b) => b.shared - a.shared);

    const best = scored[0];
    console.log("  No exact match for any format we produce. Closest is:");
    console.log(`    ${best.target.label}: ${best.shared} of ${best.target.columns.length} columns shared`);
    if (best.missing.length) console.log(`    missing:    ${best.missing.join(", ")}`);
    if (best.extra.length) console.log(`    unexpected: ${best.extra.join(", ")}`);
    console.log("  A header we don't produce means the file isn't ours, or isn't from this version.");
}


// ---------------------------------------------------------------------------
// Structural damage
// ---------------------------------------------------------------------------
// A row with the wrong field count means every column after the break is
// reading the wrong value, which is how a page count becomes a read count.

console.log("\nStructure");

const ragged = body
    .map((row, i) => ({ line: i + 2, got: row.length }))
    .filter((r) => r.got !== header.length);

if (ragged.length === 0) {
    console.log("  Every row has the same field count as the header, so no column shift.");
} else {
    console.log(`  ${ragged.length} row(s) have the wrong field count, so their columns are shifted:`);
    ragged.slice(0, 10).forEach((r) => {
        console.log(`    line ${r.line}: ${r.got} fields, expected ${header.length}`);
    });
}


// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const isbnCol = ["ISBN/UID", "ISBN13", "ISBN"].find((n) => indexOf(n) !== -1);
console.log(`\nIdentifiers${isbnCol ? ` (reading ${isbnCol})` : " (no ISBN column found)"}`);

const noIsbn = [];
const badIsbn = [];
const noTitle = [];

body.forEach((row, i) => {
    const line = i + 2;
    const title = cell(row, "Title").trim();
    const digits = isbnCol ? unwrapIsbn(cell(row, isbnCol)) : "";

    if (!title) noTitle.push({ line, digits });
    if (!digits) noIsbn.push({ line, title });
    else if (!isbnLooksReal(digits)) badIsbn.push({ line, title, digits });
});

function report(label, list, describe) {
    if (list.length === 0) {
        console.log(`  No rows ${label}.`);
        return;
    }
    console.log(`  ${list.length} row(s) ${label}:`);
    list.slice(0, 25).forEach((x) => console.log(`    line ${x.line}: ${describe(x)}`));
    if (list.length > 25) console.log(`    ...and ${list.length - 25} more`);
}

report("with no ISBN at all", noIsbn, (x) => `"${x.title || "(no title either)"}"`);
report("whose ISBN fails its check digit", badIsbn, (x) => `"${x.title}" -> ${x.digits}`);
report("with no title", noTitle, (x) => `ISBN ${x.digits || "(none)"}`);

if (noIsbn.length > 0 && exact && exact.matchesOn === "isbn") {
    console.log("");
    console.log("  Those rows carry no identifier, and the ISBN column is all Pagebound");
    console.log("  has to go on, so they are the leading suspect in the phantom-book");
    console.log("  reports. Suspect, not proven cause. Held back from the file from 1.1.1,");
    console.log("  so blanks in a file from 1.1.1 or later mean the filter itself is broken.");
}


// ---------------------------------------------------------------------------
// Values we would never write
// ---------------------------------------------------------------------------
// Anything here that we don't produce came from the destination, not from us,
// and rules our file out as the source.

console.log("\nValues we'd never write");

if (indexOf("Read Count") !== -1) {
    const odd = body
        .map((row, i) => ({
            line: i + 2,
            value: cell(row, "Read Count").trim(),
            title: cell(row, "Title"),
        }))
        .filter((x) => x.value !== "" && x.value !== "0" && x.value !== "1");

    if (odd.length === 0) {
        console.log("  Read Count is only ever 0 or 1 here, which is all we ever write.");
    } else {
        console.log(`  ${odd.length} row(s) have a Read Count we never write:`);
        odd.slice(0, 10).forEach((x) => console.log(`    line ${x.line}: "${x.title}" -> ${x.value}`));
        console.log("  We only ever write 0 or 1, so anything else came from the destination.");
    }
}

const statusCol = ["Read Status", "Exclusive Shelf"].find((n) => indexOf(n) !== -1);
if (statusCol) {
    const counts = new Map();
    body.forEach((row) => {
        const value = cell(row, statusCol).trim() || "(empty)";
        counts.set(value, (counts.get(value) || 0) + 1);
    });
    const summary = [...counts].map(([v, n]) => `${v} x${n}`).join(", ");
    console.log(`  ${statusCol}: ${summary}`);
}


// ---------------------------------------------------------------------------
// Is the mystery book actually in the file?
// ---------------------------------------------------------------------------
// If it is, the CSV isn't the problem and something upstream of it is. If it
// isn't, the destination put it there.

if (needle) {
    console.log(`\nSearch for "${needle}"`);
    const hits = body
        .map((row, i) => ({ line: i + 2, row }))
        .filter((h) => h.row.some((c) => c.toLowerCase().includes(needle.toLowerCase())));

    if (hits.length === 0) {
        console.log("  Not in the file, so the destination added it. We didn't send it.");
    } else {
        console.log(`  Found on ${hits.length} line(s): ${hits.map((h) => h.line).join(", ")}`);
        hits.slice(0, 3).forEach((h) => console.log(`    ${h.row.slice(0, 6).join(" | ")}`));
    }
}

console.log("");
