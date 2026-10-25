// ShelfBridge — CSV generator.
//
// This file owns the generic CSV mechanics only: escaping, assembling the
// header and rows, and handing the finished file to the browser. Everything
// destination-specific (columns, field mapping, filename) lives in
// targets.js, so adding a new export destination doesn't touch this file.

import { getTarget, partitionBooks } from "./targets.js";

// CSV escaping: wrap in quotes if the value contains a comma, quote, newline,
// or a leading equals sign (which is how we wrap ISBNs). Double any internal
// quotes, per RFC 4180.
function escapeCell(value) {
    const s = value == null ? "" : String(value);
    if (/[",\n\r]|^=/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// Build one CSV row for the given target. Any column the target's mapRow
// doesn't provide is emitted as an empty cell, which is what Goodreads-style
// importers expect — the columns must all be present, just not all populated.
function buildRow(book, target) {
    const values = target.mapRow(book);
    return target.columns
        .map((col) => escapeCell(values[col] ?? ""))
        .join(",");
}

// Generate the full CSV text for a target.
//
// `targetId` defaults to Goodreads so any older call site keeps working.
// Rows are joined with CRLF because that's what Excel expects and what
// Goodreads' own exports use.
//
// Books the destination can't identify are filtered out here rather than at
// the call site, so no caller can accidentally ship a row the destination
// would have to guess at. partitionBooks in targets.js explains why.
export function generateCSV(books, targetId) {
    const target = getTarget(targetId);
    const { included } = partitionBooks(books, target.id);
    const lines = [target.columns.join(",")];
    for (const book of included) {
        lines.push(buildRow(book, target));
    }
    return lines.join("\r\n") + "\r\n";
}

// Helper for the export view: trigger a file download in the browser.
export function downloadCSV(csvText, filename = "goodreads_import.csv") {
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
