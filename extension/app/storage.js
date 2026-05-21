// ShelfBridge — chrome.storage.local wrapper.
//
// Replaces the SQLite layer from the Flask version. We persist a single
// "books" array under the key "books". Each book is a plain object whose
// shape matches the SQLite schema (title, author, shelf, etc.).
//
// All functions are async (chrome.storage's promise-based API), so callers
// should await them.

const BOOKS_KEY = "books";

export async function getBooks() {
    const result = await chrome.storage.local.get(BOOKS_KEY);
    return result[BOOKS_KEY] || [];
}

export async function setBooks(books) {
    await chrome.storage.local.set({ [BOOKS_KEY]: books });
}

export async function clearBooks() {
    await chrome.storage.local.remove(BOOKS_KEY);
}

// Update a single field on one book by stable id. Returns the updated book.
export async function updateBook(bookId, changes) {
    const books = await getBooks();
    const idx = books.findIndex((b) => b.id === bookId);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...changes };
    await setBooks(books);
    return books[idx];
}

// Delete one book by id. Returns true if removed.
export async function deleteBook(bookId) {
    const books = await getBooks();
    const next = books.filter((b) => b.id !== bookId);
    if (next.length === books.length) return false;
    await setBooks(next);
    return true;
}

// Generate a stable id for a freshly-scraped book. We use Fable's UUID
// because it's already unique and lets us recognise the same book across
// re-scrapes if we ever want to merge.
export function newBookId(fableId) {
    return fableId || crypto.randomUUID();
}
