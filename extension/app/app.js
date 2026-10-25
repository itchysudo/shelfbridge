// ShelfBridge — main UI controller.
//
// Single-page app: one HTML file with multiple .view sections, this script
// swaps which one is visible. Each view binds its own handlers when shown.

import { runScrape } from "./scraper.js";
import { generateCSV, downloadCSV } from "./transformer.js";
import {
    TARGETS, DEFAULT_TARGET_ID, getTarget, partitionBooks, hasUsableIsbn,
} from "./targets.js";
import {
    getBooks, setBooks, updateBook, deleteBook,
} from "./storage.js";


// ---------------------------------------------------------------------------
// Ko-fi support link.
// ---------------------------------------------------------------------------
// Set this to the full Ko-fi page URL to switch the support links on. Leave it
// as an empty string and every Ko-fi element stays hidden, so a build with no
// link configured can't ship a dead button.
//
// Deliberately a plain link rather than Ko-fi's embed widget: the widget loads
// a remote script (storage.ko-fi.com/.../overlay-widget.js), which Manifest V3
// forbids and the Web Store would reject. Same destination, no remote code.
// Shown on any ISBN cell we cannot use. Lives here rather than inline in the
// row template because the edit handler needs to put it back when somebody
// clears the field again.
const NO_ISBN_HINT =
    "No usable ISBN. Pagebound finds a book by its ISBN and nothing else, so " +
    "this one will be left out of a Pagebound export.";

const KOFI_URL = "https://ko-fi.com/itchysudodev";


// ---------------------------------------------------------------------------
// View routing.
// ---------------------------------------------------------------------------

// Which step in the Connect → Review → Export wizard a given view sits at.
// Used to highlight the step indicator; null means hide the indicator.
const VIEW_TO_STEP = {
    intro:        1,
    connecting:   1,
    login_needed: 1,
    library:      2,
    export:       3,
    guide:        null,
    error:        null,
};

// Stack of previous views, so the guide page can offer a Back link.
const viewHistory = [];

function showView(name, { pushHistory = true } = {}) {
    const current = currentView();
    if (current && pushHistory && current !== name) viewHistory.push(current);

    document.querySelectorAll(".view").forEach((el) => {
        el.hidden = (el.dataset.view !== name);
    });
    renderStepIndicator(VIEW_TO_STEP[name]);

    // Per-view setup hooks.
    if (name === "library") renderLibrary();
    if (name === "export")  renderExport();
}

function currentView() {
    const el = document.querySelector(".view:not([hidden])");
    return el ? el.dataset.view : null;
}

function renderStepIndicator(step) {
    const nav = document.getElementById("step-nav");
    if (step === null) { nav.hidden = true; return; }
    nav.hidden = false;
    for (let i = 1; i <= 3; i++) {
        const li = document.getElementById("step-" + i);
        li.classList.remove("current", "done");
        if (i === step)       li.classList.add("current");
        else if (i < step)    li.classList.add("done");
    }
}


// ---------------------------------------------------------------------------
// Connect flow.
// ---------------------------------------------------------------------------

async function startConnect() {
    showView("connecting");
    setConnectingMessage("Reading your library…", "Looking for an open Fable tab…");

    try {
        const books = await runScrape((progress) => {
            const headings = {
                opening:  "Opening Fable…",
                checking: "Checking your Fable login…",
                scraping: "Reading your library…",
                done:     "Done.",
            };
            setConnectingMessage(
                headings[progress.status] || "Working…",
                progress.message || "",
            );
        });
        await setBooks(books);
        showView("library");
    } catch (err) {
        if (err && err.code === "not_logged_in") {
            document.getElementById("login-message").textContent = err.message;
            showView("login_needed");
        } else {
            const msg = (err && err.message) || "Something went wrong while reading your Fable library.";
            document.getElementById("error-message").textContent = msg;
            showView("error");
        }
    }
}

function setConnectingMessage(heading, detail) {
    document.getElementById("connecting-heading").textContent = heading;
    document.getElementById("connecting-message").textContent = detail;
}


// ---------------------------------------------------------------------------
// Library view — render + interaction.
// ---------------------------------------------------------------------------

async function renderLibrary() {
    const books = await getBooks();
    const tbody = document.getElementById("book-tbody");
    const table = document.getElementById("book-table");
    const empty = document.getElementById("library-empty");

    if (books.length === 0) {
        table.hidden = true;
        empty.hidden = false;
        document.getElementById("summary").textContent = "No books yet.";
        return;
    }
    table.hidden = false;
    empty.hidden = true;

    tbody.innerHTML = books.map(renderBookRow).join("");
    updateSummary();
    applyActiveFilter();
}

function renderBookRow(book) {
    const cover = book.cover_url
        ? `<img class="book-cover" src="${escapeHTML(book.cover_url)}" alt="" loading="lazy">`
        : `<span class="book-cover-placeholder">${placeholderSVG()}</span>`;

    const stars = starsMarkup(book.rating);

    const shelfOpts = [
        ["read",              "Read"],
        ["currently-reading", "Reading"],
        ["to-read",           "Want to read"],
    ].map(([v, label]) =>
        `<option value="${v}"${book.shelf === v ? " selected" : ""}>${label}</option>`,
    ).join("");

    return `
        <tr data-book-id="${escapeAttr(book.id)}" data-shelf="${escapeAttr(book.shelf || "")}">
            <td class="cover-cell">${cover}</td>
            <td><input type="text" class="cell-input" data-field="title" value="${escapeAttr(book.title || "")}"></td>
            <td><input type="text" class="cell-input" data-field="author" value="${escapeAttr(book.author || "")}"></td>
            <td><select class="cell-input" data-field="shelf">${shelfOpts}</select></td>
            <td>
                <input type="date" class="cell-input" data-field="date_started" value="${escapeAttr(book.date_started || "")}">
                ${precisionBadge(book.date_started_type)}
            </td>
            <td>
                <input type="date" class="cell-input" data-field="date_finished" value="${escapeAttr(book.date_finished || "")}">
                ${precisionBadge(book.date_finished_type)}
            </td>
            <td>
                <div class="stars" data-field="rating" data-value="${book.rating || 0}">${stars}</div>
            </td>
            <td><input type="text"
                       class="cell-input isbn-input${hasUsableIsbn(book.isbn) ? "" : " is-missing"}"
                       data-field="isbn"
                       value="${escapeAttr(book.isbn || "")}"
                       title="${hasUsableIsbn(book.isbn) ? "" : escapeAttr(NO_ISBN_HINT)}"
                       placeholder="no ISBN"></td>
            <td><button type="button" class="delete-btn" aria-label="Delete this book">×</button></td>
        </tr>
    `;
}

// ---------------------------------------------------------------------------
// Star ratings, including half stars.
// ---------------------------------------------------------------------------
// Fable lets people rate in half stars, so the library page has to let them
// edit in half stars too — otherwise opening a book and clicking its rating
// would quietly round a 3.5 to a 4.
//
// Each star is one button covering half a star either side: click its left half
// for the half value, its right half for the whole. Which half you clicked is
// worked out from where in the button the click landed.
//
// Filling is done with a class per star rather than the long list of CSS
// selectors this used to need. Half of a rating point can only ever apply to one
// star, so three states cover every case.

function starState(starNumber, rating) {
    const value = Number(rating) || 0;
    if (value >= starNumber) return "is-full";
    if (value >= starNumber - 0.5) return "is-half";
    return "is-empty";
}

function starsMarkup(rating) {
    return [1, 2, 3, 4, 5].map((n) => {
        const state = starState(n, rating);
        return `<button type="button" class="star ${state}" data-value="${n}" ` +
               `aria-label="Rate ${n} star${n === 1 ? "" : "s"}" ` +
               `title="Left half for ${n - 0.5}, right half for ${n}">★</button>`;
    }).join("");
}

// Turn a click inside a star button into a rating. Left half gives the half
// value; anything else gives the whole. Keyboard activation reports an offset of
// 0 with no width, which falls through to the whole value — half stars need the
// mouse, which is an acceptable limit for a nicety like this.
function ratingFromClick(star, event) {
    const whole = Number(star.dataset.value);
    const box = star.getBoundingClientRect();
    if (!box.width) return whole;
    const clickedLeftHalf = (event.clientX - box.left) < box.width / 2;
    return clickedLeftHalf ? whole - 0.5 : whole;
}

// Repaint a row's stars after a change, without re-rendering the whole table.
function paintStars(starsEl, rating) {
    starsEl.dataset.value = rating || 0;
    starsEl.querySelectorAll(".star").forEach((star) => {
        const state = starState(Number(star.dataset.value), rating);
        star.classList.remove("is-full", "is-half", "is-empty");
        star.classList.add(state);
    });
}


function precisionBadge(type) {
    if (type === "month") {
        return `<span class="precision-badge" title="Fable only had the month — day defaulted to 01">month only</span>`;
    }
    if (type === "year") {
        return `<span class="precision-badge" title="Fable only had the year — month and day defaulted to 01">year only</span>`;
    }
    return "";
}

function placeholderSVG() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h14a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2V4z"/><path d="M4 4v14a2 2 0 0 0 2 2h14"/></svg>`;
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}

function escapeAttr(s) { return escapeHTML(s); }

// Library interactions — one delegated listener on the tbody for edits,
// star clicks, and delete clicks.
function wireLibraryEvents() {
    const tbody = document.getElementById("book-tbody");

    tbody.addEventListener("change", async (event) => {
        const input = event.target;
        if (!input.classList.contains("cell-input")) return;

        const row = input.closest("tr");
        const bookId = row.dataset.bookId;
        const field = input.dataset.field;
        const value = input.value;

        const patch = { [field]: value };
        if (field === "date_finished") patch.date_finished_type = null;
        if (field === "date_started")  patch.date_started_type  = null;

        const updated = await updateBook(bookId, patch);
        if (!updated) return;

        if (field === "shelf") {
            row.dataset.shelf = updated.shelf;
            updateSummary();
            applyActiveFilter();
        }
        // Clear the missing-ISBN highlight as soon as a usable one is typed in,
        // so the row stops nagging without waiting for a re-render. Note this
        // uses the same predicate as the export filter, so a value that looks
        // like an ISBN but fails its check digit keeps the highlight.
        if (field === "isbn") {
            const usable = hasUsableIsbn(updated.isbn);
            input.classList.toggle("is-missing", !usable);
            input.title = usable ? "" : NO_ISBN_HINT;
        }
        if (field === "date_finished" || field === "date_started") {
            const cell = input.closest("td");
            const badge = cell && cell.querySelector(".precision-badge");
            if (badge) badge.remove();
        }
        showSaved();
    });

    // Star ratings.
    tbody.addEventListener("click", async (event) => {
        const star = event.target.closest(".star");
        if (!star) return;
        const stars = star.parentElement;
        const row = star.closest("tr");
        const clicked = ratingFromClick(star, event);
        const current = Number(stars.dataset.value);
        // Clicking the value it's already on clears the rating, so there's a way
        // back to unrated without a separate control.
        const newRating = (clicked === current) ? 0 : clicked;

        const updated = await updateBook(row.dataset.bookId, { rating: newRating || null });
        if (!updated) return;
        paintStars(stars, newRating);
        showSaved();
    });

    // Delete buttons.
    tbody.addEventListener("click", async (event) => {
        const btn = event.target.closest(".delete-btn");
        if (!btn) return;
        const row = btn.closest("tr");
        const title = row.querySelector('[data-field="title"]').value;
        if (!confirm(`Remove "${title}" from your library?`)) return;
        const ok = await deleteBook(row.dataset.bookId);
        if (ok) {
            row.remove();
            updateSummary();
            showSaved();
        }
    });
}

function wireFilterEvents() {
    document.querySelector(".filter-bar").addEventListener("click", (event) => {
        const btn = event.target.closest(".filter-btn");
        if (!btn) return;
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        applyActiveFilter();
    });
}

function applyActiveFilter() {
    const active = document.querySelector(".filter-btn.active");
    const filter = active ? active.dataset.filter : "all";
    document.querySelectorAll("#book-tbody tr").forEach((row) => {
        row.hidden = (filter !== "all" && row.dataset.shelf !== filter);
    });
    updateSummary();
}

function updateSummary() {
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


// ---------------------------------------------------------------------------
// Export view.
// ---------------------------------------------------------------------------

// Which destination the user has picked. Resets to the default each time the
// app is opened, which is fine — it's one click to change.
let selectedTargetId = DEFAULT_TARGET_ID;

async function renderExport() {
    renderTargetPicker();
    renderTargetDetails();
    await refreshExportPreview();

    // Hide the Ko-fi prompt again on re-entry so it only ever appears as a
    // response to an actual download.
    document.getElementById("kofi-export").hidden = true;
}

// The count, the preview table and the held-back panel all describe the same
// one file, so they are all computed from a single partition. Re-run whenever
// the chosen destination changes, because the rules differ per destination.
async function refreshExportPreview() {
    const books = await getBooks();
    const target = getTarget(selectedTargetId);
    const { included, excluded } = partitionBooks(books, target.id);

    // Say "426 of 478" when some are held back, so the number on the page
    // matches the number of rows in the file without hiding the difference.
    document.getElementById("export-count").textContent = excluded.length
        ? `${included.length} of ${books.length}`
        : String(included.length);

    const tbody = document.getElementById("export-preview-tbody");
    tbody.innerHTML = included.map((b) => `
        <tr>
            <td>${escapeHTML(b.title || "")}</td>
            <td>${escapeHTML(b.author || "—")}</td>
            <td>${escapeHTML(b.shelf || "")}</td>
            <td>${b.rating || ""}</td>
        </tr>
    `).join("");

    renderHeldBack(excluded, target);
}

// Build one radio option per registered target.
function renderTargetPicker() {
    const wrap = document.getElementById("target-options");
    wrap.innerHTML = TARGETS.map((t) => `
        <label class="target-option">
            <input type="radio" name="target" value="${escapeHTML(t.id)}"
                   ${t.id === selectedTargetId ? "checked" : ""}>
            <span class="target-label">${escapeHTML(t.label)}${
                t.beta ? ' <span class="beta-badge">beta</span>' : ""
            }</span>
            <span class="target-blurb">${escapeHTML(t.blurb)}</span>
        </label>
    `).join("");

    wrap.querySelectorAll('input[name="target"]').forEach((input) => {
        input.addEventListener("change", () => {
            selectedTargetId = input.value;
            renderTargetDetails();
            refreshExportPreview();
            document.getElementById("kofi-export").hidden = true;
        });
    });
}

// Swap the button label, heading, steps and caveats to match the chosen
// target. The steps and notes come from targets.js, which is our own content
// rather than anything scraped, so the small amount of markup in them is
// inserted as HTML on purpose.
function renderTargetDetails() {
    const target = getTarget(selectedTargetId);

    document.getElementById("download-btn").textContent =
        `Download file for ${target.label}`;
    document.getElementById("import-heading").textContent =
        `How to import into ${target.label}`;

    // Two tick/cross lists, so the difference between destinations can be read
    // at a glance instead of pieced together from the prose below.
    const summary = target.summary || { keeps: [], loses: [] };
    const list = (items, cls, mark) => items.map((i) =>
        `<li class="${cls}"><span aria-hidden="true">${mark}</span> ${escapeHTML(i)}</li>`
    ).join("");
    document.getElementById("target-summary").innerHTML = `
        <div class="summary-col">
            <h4>Comes across</h4>
            <ul>${list(summary.keeps, "keeps", "✓")}</ul>
        </div>
        <div class="summary-col">
            <h4>Doesn't</h4>
            <ul>${list(summary.loses, "loses", "✗")}</ul>
        </div>
    `;

    // fileNote is our own copy and contains a <code> tag on purpose.
    const noteEl = document.getElementById("file-note");
    if (target.fileNote) {
        noteEl.innerHTML = target.fileNote;
        noteEl.hidden = false;
    } else {
        noteEl.hidden = true;
    }

    document.getElementById("import-steps").innerHTML =
        target.instructions.map((step) => {
            const before = escapeHTML(step.before || "");
            if (!step.href) return `<li>${before}</li>`;
            const link = `<a href="${escapeHTML(step.href)}" target="_blank" rel="noopener">${escapeHTML(step.linkText || step.href)}</a>`;
            return `<li>${before}${link}${escapeHTML(step.after || "")}</li>`;
        }).join("");

    document.getElementById("import-notes").innerHTML =
        target.notes.map((note) => `<li>${note}</li>`).join("");
}

// Name the books this destination will not be given, and why.
//
// Pagebound matches on ISBN alone, so a book with no usable ISBN cannot be
// sent: an unidentified row is a row the destination has to guess at, and two
// people have since found a book in their library they had never read. Far
// better to name the ones we are holding back and let the user fill an ISBN in.
//
// Takes the partition rather than recomputing it, so the panel and the file can
// never disagree about what was left out.
function renderHeldBack(excluded, target) {
    const box = document.getElementById("held-back");

    if (excluded.length === 0) {
        box.hidden = true;
        return;
    }

    document.getElementById("held-back-heading").textContent =
        excluded.length === 1
            ? `1 book can't go to ${target.label}`
            : `${excluded.length} books can't go to ${target.label}`;

    document.getElementById("held-back-list").innerHTML = excluded.map(({ book, reason }) => `
        <li>
            <strong>${escapeHTML(book.title || "Untitled")}</strong>
            <span class="held-back-reason">${escapeHTML(reason)}</span>
        </li>
    `).join("");

    box.hidden = false;
}

async function doDownload() {
    const books = await getBooks();
    if (books.length === 0) {
        alert("There are no books to export yet.");
        return;
    }

    // Guard on what would actually land in the file. Every book being held back
    // is unlikely but possible, and a header-only CSV plus a thank-you is a
    // worse outcome than being told why nothing can be sent.
    const target = getTarget(selectedTargetId);
    const { included } = partitionBooks(books, target.id);
    if (included.length === 0) {
        alert(
            `None of your books can be sent to ${target.label}. ` +
            "See the list above the button for why, then add the missing ISBNs " +
            "on the library page."
        );
        return;
    }

    const csv = generateCSV(books, target.id);
    downloadCSV(csv, target.filename);

    // The download is the moment the tool has actually delivered something,
    // so that's when we ask, not before.
    if (KOFI_URL) document.getElementById("kofi-export").hidden = false;
}


// ---------------------------------------------------------------------------
// Saved indicator (small toast that fades).
// ---------------------------------------------------------------------------

let savedTimer = null;
function showSaved() {
    const el = document.getElementById("saved-indicator");
    if (!el) return;
    el.classList.add("visible");
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove("visible"), 1500);
}


// ---------------------------------------------------------------------------
// Version number.
// ---------------------------------------------------------------------------

// Read the version straight from the manifest rather than hardcoding it in the
// About panel, where it had gone stale across two releases.
function showVersion() {
    const el = document.getElementById("version");
    if (el) el.textContent = chrome.runtime.getManifest().version;
}


// ---------------------------------------------------------------------------
// Ko-fi links.
// ---------------------------------------------------------------------------

// Point both Ko-fi links at KOFI_URL. With no URL set, the About paragraph
// stays hidden and the export prompt never unhides, so nothing half-wired
// reaches a user.
function wireKofiLinks() {
    if (!KOFI_URL) return;

    document.getElementById("kofi-export-link").href = KOFI_URL;
    document.getElementById("kofi-about-link").href = KOFI_URL;
    document.getElementById("kofi-about").hidden = false;
}


// ---------------------------------------------------------------------------
// Initial wiring.
// ---------------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
    // Wire static handlers
    document.getElementById("connect-btn").addEventListener("click", startConnect);
    document.getElementById("connect-retry-btn").addEventListener("click", startConnect);
    document.getElementById("retry-btn").addEventListener("click", startConnect);

    document.getElementById("skip-to-library").addEventListener("click", (e) => {
        e.preventDefault();
        showView("library");
    });
    document.getElementById("goto-export-btn").addEventListener("click", () => showView("export"));
    document.getElementById("back-to-library").addEventListener("click", (e) => {
        e.preventDefault(); showView("library");
    });
    document.getElementById("held-back-link").addEventListener("click", (e) => {
        e.preventDefault(); showView("library");
    });
    document.getElementById("back-to-intro").addEventListener("click", (e) => {
        e.preventDefault(); showView("intro");
    });
    document.getElementById("download-btn").addEventListener("click", doDownload);

    document.getElementById("help-link").addEventListener("click", (e) => {
        e.preventDefault();
        showView("guide");
    });
    document.getElementById("back-from-guide").addEventListener("click", (e) => {
        e.preventDefault();
        const previous = viewHistory.pop() || "intro";
        showView(previous, { pushHistory: false });
    });

    wireLibraryEvents();
    wireFilterEvents();
    wireKofiLinks();
    showVersion();

    // Decide which view to land on. If we have any saved books, default to
    // library (the user came back to review/export). Otherwise show intro.
    const books = await getBooks();
    showView(books.length > 0 ? "library" : "intro", { pushHistory: false });
});
