// ShelfBridge — main UI controller.
//
// Single-page app: one HTML file with multiple .view sections, this script
// swaps which one is visible. Each view binds its own handlers when shown.

import { runScrape } from "./scraper.js";
import { generateCSV, downloadCSV } from "./transformer.js";
import {
    getBooks, setBooks, updateBook, deleteBook,
} from "./storage.js";


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

    const stars = [1, 2, 3, 4, 5].map((n) =>
        `<button type="button" class="star" data-value="${n}" aria-label="Rate ${n} star${n === 1 ? "" : "s"}">★</button>`,
    ).join("");

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
            <td><input type="text" class="cell-input isbn-input" data-field="isbn" value="${escapeAttr(book.isbn || "")}" placeholder="—"></td>
            <td><button type="button" class="delete-btn" aria-label="Delete this book">×</button></td>
        </tr>
    `;
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
        const clicked = Number(star.dataset.value);
        const current = Number(stars.dataset.value);
        const newRating = (clicked === current) ? 0 : clicked;

        const updated = await updateBook(row.dataset.bookId, { rating: newRating || null });
        if (!updated) return;
        stars.dataset.value = newRating;
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

async function renderExport() {
    const books = await getBooks();
    document.getElementById("export-count").textContent = books.length;
    const tbody = document.getElementById("export-preview-tbody");
    tbody.innerHTML = books.map((b) => `
        <tr>
            <td>${escapeHTML(b.title || "")}</td>
            <td>${escapeHTML(b.author || "—")}</td>
            <td>${escapeHTML(b.shelf || "")}</td>
            <td>${b.rating || ""}</td>
        </tr>
    `).join("");
}

async function doDownload() {
    const books = await getBooks();
    if (books.length === 0) {
        alert("There are no books to export yet.");
        return;
    }
    const csv = generateCSV(books);
    downloadCSV(csv);
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

    // Decide which view to land on. If we have any saved books, default to
    // library (the user came back to review/export). Otherwise show intro.
    const books = await getBooks();
    showView(books.length > 0 ? "library" : "intro", { pushHistory: false });
});
