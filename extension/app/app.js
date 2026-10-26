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
import {
    matchesDateFilter, applyDateFilter, isDateFilterActive, isDateRangeBackwards,
} from "./dateFilter.js";
import { SORT_OPTIONS, DEFAULT_SORT, sortBooks } from "./librarySort.js";
import { RELEASES, LATEST_RELEASE } from "./releases.js";


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

// Which step in the Connect, Review, Export wizard a given view sits at.
// Used to highlight the step indicator; null means hide the indicator.
const VIEW_TO_STEP = {
    intro:        1,
    connecting:   1,
    login_needed: 1,
    library:      2,
    export:       3,
    guide:        null,
    "whats-new":  null,
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
    // Both of these show the latest release notes, so either counts as seen.
    if (name === "intro" || name === "whats-new") markReleaseSeen();
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
        li.removeAttribute("aria-current");
        if (i === step) {
            li.classList.add("current");
            li.setAttribute("aria-current", "step");
        } else if (i < step) {
            li.classList.add("done");
        }
    }
}


// ---------------------------------------------------------------------------
// Connect flow.
// ---------------------------------------------------------------------------

async function startConnect() {
    showView("connecting");
    setConnectingMessage("Reading your library", "Looking for an open Fable tab…");

    try {
        const books = await runScrape((progress) => {
            const headings = {
                opening:  "Opening Fable",
                checking: "Checking you're signed in",
                scraping: "Reading your library",
                done:     "Done",
            };
            setConnectingMessage(
                headings[progress.status] || "Reading your library",
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
            const msg = (err && err.message) || "Check you're signed in to Fable, then try again.";
            document.getElementById("error-message").textContent = msg;
            showView("error");
        }
    }
}

// The lead paragraph (#connecting-message) keeps its "how long this takes"
// copy; the scraper's running commentary goes in the smaller detail line.
function setConnectingMessage(heading, detail) {
    document.getElementById("connecting-heading").textContent = heading;
    document.getElementById("connecting-detail").textContent = detail;
}


// ---------------------------------------------------------------------------
// Library view — render + interaction.
// ---------------------------------------------------------------------------

// The books behind the table, by id, kept in step with every edit. The date
// filter needs each book's dates and their precision, which the rows alone
// don't carry once a badge has been removed.
const libraryBooks = new Map();

// The library's date range. Kept in memory only, like the export destination:
// a filter left over from an earlier visit would quietly shrink the next
// export, which is worse than having to set it again.
const dateFilter = { from: "", to: "", includeUndated: false };

// The table's "Sort by" choice. View only: the export keeps the library's own
// order. Held in memory for the session, like the date range.
let sortId = DEFAULT_SORT;

async function renderLibrary() {
    const books = await getBooks();
    const tbody = document.getElementById("book-tbody");
    const table = document.getElementById("book-table");
    const empty = document.getElementById("library-empty");

    libraryBooks.clear();
    books.forEach((book) => libraryBooks.set(book.id, book));

    if (books.length === 0) {
        table.hidden = true;
        empty.hidden = false;
        document.getElementById("library-no-match").hidden = true;
        tbody.innerHTML = "";
        updateSummary();
        document.getElementById("summary").textContent = "No books yet.";
        return;
    }
    table.hidden = false;
    empty.hidden = true;

    tbody.innerHTML = sortBooks(books, sortId).map(renderBookRow).join("");
    updateSummary();
    applyActiveFilter();
}

function renderBookRow(book) {
    const cover = book.cover_url
        ? `<img class="book-cover" src="${escapeHTML(book.cover_url)}" alt="" loading="lazy">`
        : `<span class="book-cover-placeholder">${placeholderSVG()}</span>`;

    const stars = starsMarkup(book.rating);

    const shelfOpts = Object.entries(SHELF_LABELS).map(([v, label]) =>
        `<option value="${v}"${book.shelf === v ? " selected" : ""}>${label}</option>`,
    ).join("");

    const title = book.title || "";

    return `
        <tr data-book-id="${escapeAttr(book.id)}" data-shelf="${escapeAttr(book.shelf || "")}">
            <td class="cover-cell">${cover}</td>
            <td class="cell-title"><input type="text" class="cell-input" data-field="title" aria-label="Title" value="${escapeAttr(title)}"></td>
            <td class="cell-author"><input type="text" class="cell-input" data-field="author" aria-label="Author" value="${escapeAttr(book.author || "")}"></td>
            <td><select class="cell-input" data-field="shelf" aria-label="Shelf">${shelfOpts}</select></td>
            <td>
                <div class="date-cell">
                    <input type="date" class="cell-input" data-field="date_started" aria-label="Date started" value="${escapeAttr(book.date_started || "")}">
                    ${precisionBadge(book.date_started_type)}
                </div>
            </td>
            <td>
                <div class="date-cell">
                    <input type="date" class="cell-input" data-field="date_finished" aria-label="Date finished" value="${escapeAttr(book.date_finished || "")}">
                    ${precisionBadge(book.date_finished_type)}
                </div>
            </td>
            <td>
                <div class="stars" role="group" data-field="rating" data-value="${book.rating || 0}" aria-label="${ratingLabel(book.rating)}">${stars}</div>
            </td>
            <td class="cell-isbn"><input type="text"
                       class="cell-input isbn-input${hasUsableIsbn(book.isbn) ? "" : " is-missing"}"
                       data-field="isbn"
                       aria-label="ISBN"
                       value="${escapeAttr(book.isbn || "")}"
                       title="${hasUsableIsbn(book.isbn) ? "" : escapeAttr(NO_ISBN_HINT)}"
                       placeholder="Add ISBN"></td>
            <td class="actions-cell"><button type="button" class="delete-btn" aria-label="Remove ${escapeAttr(title)}">${icon(ICON_PATHS.trash)}Remove</button></td>
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
               `title="Left half for ${n - 0.5}, right half for ${n}">${STAR_GLYPH}</button>`;
    }).join("");
}

// Turn a click inside a star button into a rating. Left half gives the half
// value; anything else gives the whole. A keyboard press (Enter or Space)
// arrives as a click with event.detail of 0 and no real pointer position, so
// it always gives the whole value: half stars need the mouse, which is an
// acceptable limit for a nicety like this.
function ratingFromClick(star, event) {
    const whole = Number(star.dataset.value);
    const box = star.getBoundingClientRect();
    if (!box.width || event.detail === 0) return whole;
    const clickedLeftHalf = (event.clientX - box.left) < box.width / 2;
    return clickedLeftHalf ? whole - 0.5 : whole;
}

// Repaint a row's stars after a change, without re-rendering the whole table.
function paintStars(starsEl, rating) {
    starsEl.dataset.value = rating || 0;
    starsEl.setAttribute("aria-label", ratingLabel(rating));
    starsEl.querySelectorAll(".star").forEach((star) => {
        const state = starState(Number(star.dataset.value), rating);
        star.classList.remove("is-full", "is-half", "is-empty");
        star.classList.add(state);
    });
}


function ratingLabel(rating) {
    return rating ? `Rating: ${rating} of 5` : "Not rated";
}

function precisionBadge(type) {
    const badges = {
        month: ["Month only", "Fable only had the month, so the day is set to the 1st"],
        year:  ["Year only",  "Fable only had the year, so the date is set to 1 January"],
    };
    if (!badges[type]) return "";
    const [text, tooltip] = badges[type];
    return `<span class="precision-badge" title="${tooltip}">${icon(ICON_PATHS.alertTriangle)}${text}</span>`;
}

function placeholderSVG() {
    return icon(ICON_PATHS.book);
}

// Lucide icons, drawn inline so they pick up the text colour.
const ICON_PATHS = {
    book:          '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
    trash:         '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    alertTriangle: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check:         '<path d="M20 6 9 17l-5-5"/>',
    circleX:       '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    externalLink:  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3"/>',
};

function icon(paths) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

// One star shape. Fill and stroke come from CSS, so the same markup serves
// every state.
const STAR_POINTS = "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2";
const STAR_SVG = `<svg viewBox="0 0 24 24" stroke-width="1.75" stroke-linejoin="round" aria-hidden="true"><polygon points="${STAR_POINTS}"/></svg>`;

// A star button's contents: an empty outline with a filled copy on top. The
// button's is-full / is-half / is-empty class decides how much of the filled
// copy shows (see .star-fill in style.css).
const STAR_GLYPH =
    `<span class="star-glyph" aria-hidden="true">` +
    `<svg class="star-outline" viewBox="0 0 24 24" stroke-width="1.75" stroke-linejoin="round"><polygon points="${STAR_POINTS}"/></svg>` +
    `<svg class="star-fill" viewBox="0 0 24 24" stroke-width="1.75" stroke-linejoin="round"><polygon points="${STAR_POINTS}"/></svg>` +
    `</span>`;

const SHELF_LABELS = {
    "read":              "Read",
    "currently-reading": "Reading",
    "to-read":           "Want to read",
};

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
        libraryBooks.set(bookId, updated);

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
            // A new date can move the book in or out of the date range.
            applyActiveFilter();
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
        libraryBooks.set(updated.id, updated);
        paintStars(stars, newRating);
        showSaved();
    });

    // Delete buttons.
    tbody.addEventListener("click", async (event) => {
        const btn = event.target.closest(".delete-btn");
        if (!btn) return;
        const row = btn.closest("tr");
        const title = row.querySelector('[data-field="title"]').value;
        if (!confirm(`Remove "${title}"? You can't undo this.`)) return;
        const ok = await deleteBook(row.dataset.bookId);
        if (ok) {
            libraryBooks.delete(row.dataset.bookId);
            row.remove();
            applyActiveFilter();
            showSaved();
        }
    });
}

function wireFilterEvents() {
    document.querySelector(".filter-bar").addEventListener("click", (event) => {
        const btn = event.target.closest(".filter-btn");
        if (!btn) return;
        document.querySelectorAll(".filter-btn").forEach((b) => {
            b.classList.remove("active");
            b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        applyActiveFilter();
    });
}

// Does this row's book fall inside the date range?
function rowInDateRange(row) {
    const book = libraryBooks.get(row.dataset.bookId);
    return book ? matchesDateFilter(book, dateFilter) : true;
}

// Show the rows that pass both the shelf buttons and the date range.
function applyActiveFilter() {
    const active = document.querySelector(".filter-btn.active");
    const filter = active ? active.dataset.filter : "all";
    const rows = Array.from(document.querySelectorAll("#book-tbody tr"));
    rows.forEach((row) => {
        const shelfOk = (filter === "all" || row.dataset.shelf === filter);
        row.hidden = !(shelfOk && rowInDateRange(row));
    });

    // Books exist but none are showing: say so, rather than an empty table.
    const noMatch = rows.length > 0 && rows.every((row) => row.hidden);
    document.getElementById("library-no-match").hidden = !noMatch;
    document.getElementById("book-table").hidden = rows.length === 0;

    updateDateFilterControls();
    updateSummary();
}

function updateSummary() {
    const rows = Array.from(document.querySelectorAll("#book-tbody tr"));

    // Shelf totals for the filter pills, whichever shelf is active. They do
    // follow the date range, so each pill says how many books would go.
    const counts = { "all": 0, "read": 0, "currently-reading": 0, "to-read": 0 };
    rows.filter(rowInDateRange).forEach((r) => {
        counts.all++;
        if (counts[r.dataset.shelf] !== undefined) counts[r.dataset.shelf]++;
    });
    document.querySelectorAll(".filter-btn").forEach((btn) => {
        const el = btn.querySelector(".filter-count");
        if (el) el.textContent = counts[btn.dataset.filter] ?? 0;
    });

    const visible = rows.filter((r) => !r.hidden);
    const toCheck = visible.reduce(
        (n, r) => n + r.querySelectorAll(".precision-badge").length, 0);
    const el = document.getElementById("summary");
    if (!el) return;
    el.textContent = `${visible.length} book${visible.length === 1 ? "" : "s"} · `
        + `${toCheck} date${toCheck === 1 ? "" : "s"} to check`;
}


// Keep the date controls in step with the filter: the count on the "no dates"
// checkbox, whether that checkbox and Clear do anything yet, and the warning
// for a range that runs backwards.
function updateDateFilterControls() {
    const active = isDateFilterActive(dateFilter);
    const { undatedCount } = applyDateFilter([...libraryBooks.values()], dateFilter);

    const checkbox = document.getElementById("include-undated");
    checkbox.disabled = !active;
    checkbox.checked = dateFilter.includeUndated;
    document.getElementById("include-undated-label").textContent =
        undatedCount === 1
            ? "Include 1 book with no dates"
            : `Include ${undatedCount} books with no dates`;

    document.getElementById("date-clear").hidden = !active;

    const backwards = isDateRangeBackwards(dateFilter);
    document.getElementById("date-filter-error").hidden = !backwards;
    document.getElementById("date-filter-hint").hidden = backwards;
}

function wireDateFilterEvents() {
    const from = document.getElementById("date-from");
    const to = document.getElementById("date-to");
    const undated = document.getElementById("include-undated");

    // `change` fires once a full date has been picked or typed, not on every
    // keystroke, so the table doesn't flicker while someone is typing a year.
    from.addEventListener("change", () => { dateFilter.from = from.value; applyActiveFilter(); });
    to.addEventListener("change", () => { dateFilter.to = to.value; applyActiveFilter(); });
    undated.addEventListener("change", () => {
        dateFilter.includeUndated = undated.checked;
        applyActiveFilter();
    });

    document.getElementById("date-clear").addEventListener("click", () => {
        dateFilter.from = "";
        dateFilter.to = "";
        dateFilter.includeUndated = false;
        from.value = "";
        to.value = "";
        applyActiveFilter();
        from.focus();
    });
}

// Fill the "Sort by" dropdown and reorder the table when it changes.
function wireSortEvents() {
    const select = document.getElementById("sort-by");
    select.innerHTML = SORT_OPTIONS.map((o) =>
        `<option value="${o.id}"${o.id === sortId ? " selected" : ""}>${escapeHTML(o.label)}</option>`,
    ).join("");
    select.addEventListener("change", () => {
        sortId = select.value;
        reorderRows();
    });
}

// Put the existing rows in the chosen order. Moves the rows rather than
// re-rendering them, so nothing typed or focused is lost. Deliberately not
// called after an edit: a row jumping away while someone is fixing its title
// would be worse than a list that's briefly out of order.
function reorderRows() {
    const tbody = document.getElementById("book-tbody");
    const rows = new Map(
        Array.from(tbody.rows).map((row) => [row.dataset.bookId, row]),
    );
    // libraryBooks keeps the library's own order, which is what "Fable order"
    // needs to get back to.
    for (const book of sortBooks([...libraryBooks.values()], sortId)) {
        const row = rows.get(book.id);
        if (row) tbody.appendChild(row);
    }
}

// "1 Jan 2024", for the export page's notice. The date is read as UTC so the
// local time zone can't move it back a day.
function formatDay(iso) {
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
}

// The library as it will be exported: the whole thing, minus anything outside
// the date range. The shelf buttons deliberately play no part here.
async function getExportBooks() {
    const library = await getBooks();
    return { library, books: applyDateFilter(library, dateFilter).kept };
}

// Tell the user, on the export page, when the date range is shrinking the file.
function renderDateFilterNote(books, library) {
    const note = document.getElementById("date-filter-note");
    if (!isDateFilterActive(dateFilter)) {
        note.hidden = true;
        return;
    }

    const { from, to } = dateFilter;
    let title;
    if (from && to) title = `Only books from ${formatDay(from)} to ${formatDay(to)}`;
    else if (from)  title = `Only books from ${formatDay(from)} onwards`;
    else            title = `Only books up to ${formatDay(to)}`;
    document.getElementById("date-filter-note-title").textContent = title;

    const undatedText = dateFilter.includeUndated ? ", including books with no dates" : "";
    document.getElementById("date-filter-note-detail").textContent =
        `That's ${books.length} of the ${library.length} books in your library${undatedText}.`;
    note.hidden = false;
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
    const { library, books } = await getExportBooks();
    renderDateFilterNote(books, library);
    const target = getTarget(selectedTargetId);
    const { included, excluded } = partitionBooks(books, target.id);

    // Say "426 of 478" when some are held back, so the number on the page
    // matches the number of rows in the file without hiding the difference.
    const countText = excluded.length
        ? `${included.length} of ${books.length}`
        : String(included.length);
    const noun = (excluded.length ? books.length : included.length) === 1 ? "book" : "books";
    document.getElementById("export-count").textContent = countText;
    document.getElementById("export-count-noun").textContent = noun;
    document.getElementById("export-preview-count").textContent = `${countText} ${noun}`;

    const tbody = document.getElementById("export-preview-tbody");
    tbody.innerHTML = included.map((b) => `
        <tr>
            <td class="title-text">${escapeHTML(b.title || "")}</td>
            <td>${b.author ? escapeHTML(b.author) : '<span class="text-subtle">Unknown</span>'}</td>
            <td class="text-muted">${escapeHTML(SHELF_LABELS[b.shelf] || b.shelf || "")}</td>
            <td>${b.rating
                ? `<span class="rating-inline">${STAR_SVG}${b.rating} of 5</span>`
                : '<span class="text-subtle">Not rated</span>'}</td>
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
                t.beta ? ' <span class="badge badge-neutral">Beta</span>' : ""
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

    // The button keeps its icon, so only its label changes.
    document.getElementById("download-label").textContent =
        `Download file for ${target.label}`;
    document.getElementById("import-heading").textContent =
        `Import into ${target.label}`;
    document.getElementById("export-filename").textContent = target.filename;
    document.getElementById("export-target-name").textContent = target.label;

    // Two lists, so the difference between destinations can be read at a
    // glance instead of pieced together from the prose below.
    const summary = target.summary || { keeps: [], loses: [] };
    const list = (items, cls, iconPaths) => items.map((i) =>
        `<li class="${cls}">${icon(iconPaths)}<span>${escapeHTML(i)}</span></li>`
    ).join("");
    document.getElementById("target-summary").innerHTML = `
        <div>
            <h3>Comes across</h3>
            <ul>${list(summary.keeps, "keeps", ICON_PATHS.check)}</ul>
        </div>
        <div>
            <h3>Doesn't</h3>
            <ul>${list(summary.loses, "loses", ICON_PATHS.circleX)}</ul>
        </div>
    `;

    // fileNote is our own copy and contains a <code> tag on purpose.
    const noteEl = document.getElementById("file-note");
    if (target.fileNote) {
        document.getElementById("file-note-text").innerHTML = target.fileNote;
        noteEl.hidden = false;
    } else {
        noteEl.hidden = true;
    }

    // Steps are our own copy from targets.js. Some contain <strong> on purpose,
    // so `before` is inserted as HTML, as the notes below are.
    document.getElementById("import-steps").innerHTML =
        target.instructions.map((step, i) => {
            const before = step.before || "";
            const link = step.href
                ? `<a class="external-link" href="${escapeHTML(step.href)}" target="_blank" rel="noopener">` +
                  `${escapeHTML(step.linkText || step.href)}${icon(ICON_PATHS.externalLink)}</a>`
                : "";
            return `<li><span class="step-square" aria-hidden="true">${i + 1}</span>` +
                   `<p>${before}${link}${escapeHTML(step.after || "")}</p></li>`;
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
    const { library, books } = await getExportBooks();
    if (library.length === 0) {
        alert("No books to export yet. Connect to Fable first.");
        return;
    }
    if (books.length === 0) {
        alert("No books match your date range. Change the dates on the library page.");
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
    const version = chrome.runtime.getManifest().version;
    for (const id of ["version", "footer-version"]) {
        const el = document.getElementById(id);
        if (el) el.textContent = version;
    }
}


// ---------------------------------------------------------------------------
// What's new: release notes from releases.js.
// ---------------------------------------------------------------------------

// Icons the release notes can use, by the key given in releases.js.
const RELEASE_ICONS = {
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    sort:     '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    send:     '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    star:     `<polygon points="${STAR_POINTS}"/>`,
    check:    ICON_PATHS.check,
};
const USERS_ICON =
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
    '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>';

// "2026-10" to "October 2026".
function releaseMonth(yyyyMm) {
    const [year, month] = yyyyMm.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", {
        month: "long", year: "numeric", timeZone: "UTC",
    });
}

// One card per change. Release notes are our own copy, but they're still
// escaped, so a stray "<" in a note can't break the page.
function updateCards(items) {
    return items.map((item) => `
        <li class="update-card">
            <span class="square-icon">${icon(RELEASE_ICONS[item.icon] || RELEASE_ICONS.sparkles)}</span>
            <h3 class="h4">${escapeHTML(item.title)}</h3>
            <p class="small text-muted">${escapeHTML(item.text)}</p>
            ${item.source
                ? `<span class="badge badge-community">${icon(USERS_ICON)}${escapeHTML(item.source)}</span>`
                : ""}
        </li>
    `).join("");
}

// The welcome page shows the newest release's first three changes.
function renderWelcomeUpdates() {
    document.getElementById("whats-new-badge").textContent =
        `New in ${LATEST_RELEASE.version}`;
    document.getElementById("whats-new-month").textContent =
        releaseMonth(LATEST_RELEASE.date);
    document.getElementById("whats-new-cards").innerHTML =
        updateCards(LATEST_RELEASE.items.slice(0, 3));
}

// The What's new page lists every release, newest first.
function renderReleaseList() {
    document.getElementById("release-list").innerHTML = RELEASES.map((release, i) => `
        <article class="release${i === 0 ? " is-latest" : ""}">
            <div class="release-meta">
                <span class="badge ${i === 0 ? "badge-new" : "badge-neutral"}">Version ${escapeHTML(release.version)}</span>
                <span class="small text-muted">${releaseMonth(release.date)}</span>
            </div>
            <h2 class="h3">${escapeHTML(release.title)}</h2>
            <ul class="update-cards">${updateCards(release.items)}</ul>
        </article>
    `).join("");
}

// The "new" dot on the What's new link. It shows until someone has seen the
// current release's notes, on the welcome page or the What's new page. Stored
// locally in the browser next to the books; nothing leaves the machine.
const SEEN_RELEASE_KEY = "lastSeenRelease";

async function showNewDotIfUnseen() {
    const stored = await chrome.storage.local.get(SEEN_RELEASE_KEY);
    document.getElementById("whats-new-dot").hidden =
        stored[SEEN_RELEASE_KEY] === LATEST_RELEASE.version;
}

function markReleaseSeen() {
    document.getElementById("whats-new-dot").hidden = true;
    chrome.storage.local.set({ [SEEN_RELEASE_KEY]: LATEST_RELEASE.version });
}


// ---------------------------------------------------------------------------
// Ko-fi links.
// ---------------------------------------------------------------------------

// Point every Ko-fi link at KOFI_URL: the welcome page's Free tile, the About
// panel and the prompt after a download. With no URL set, all three stay
// hidden, so nothing half-wired reaches a user.
function wireKofiLinks() {
    if (!KOFI_URL) return;

    document.getElementById("kofi-export-link").href = KOFI_URL;
    document.getElementById("kofi-about-link").href = KOFI_URL;
    document.getElementById("kofi-about").hidden = false;

    // The welcome page's "Free" tile, where it sits next to "free and
    // open source" rather than asking before the tool has done anything.
    const welcome = document.getElementById("kofi-welcome-link");
    welcome.href = KOFI_URL;
    welcome.hidden = false;
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
    document.getElementById("date-filter-change").addEventListener("click", (e) => {
        e.preventDefault();
        showView("library");
        document.getElementById("date-from").focus();
    });
    document.getElementById("back-to-intro").addEventListener("click", (e) => {
        e.preventDefault(); showView("intro");
    });
    // The empty state's "Connect to Fable" does the same as Start over.
    document.getElementById("empty-connect-btn").addEventListener("click", () => showView("intro"));
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
    document.getElementById("whats-new-link").addEventListener("click", (e) => {
        e.preventDefault();
        showView("whats-new");
    });
    document.getElementById("whats-new-more").addEventListener("click", (e) => {
        e.preventDefault();
        showView("whats-new");
    });
    document.getElementById("back-from-whats-new").addEventListener("click", (e) => {
        e.preventDefault();
        const previous = viewHistory.pop() || "intro";
        showView(previous, { pushHistory: false });
    });

    wireLibraryEvents();
    wireFilterEvents();
    wireDateFilterEvents();
    wireSortEvents();
    renderWelcomeUpdates();
    renderReleaseList();
    await showNewDotIfUnseen();
    wireKofiLinks();
    showVersion();

    // Decide which view to land on. If we have any saved books, default to
    // library (the user came back to review/export). Otherwise show intro.
    const books = await getBooks();
    showView(books.length > 0 ? "library" : "intro", { pushHistory: false });
});
