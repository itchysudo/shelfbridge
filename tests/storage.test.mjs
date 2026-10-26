// ShelfBridge: tests for removing books from storage.
//
// No framework and no dependencies: run it with
//
//     node tests/storage.test.mjs
//
// chrome.storage.local is stood in for by a plain object, which is all
// storage.js touches. Worth pinning because a remove can't be undone: it must
// take exactly the books asked for, and save once however many there are.

let store = {};
let writes = 0;
globalThis.chrome = {
    storage: {
        local: {
            get: async (key) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
            set: async (items) => { writes++; Object.assign(store, structuredClone(items)); },
            remove: async (key) => { delete store[key]; },
        },
    },
};

const { getBooks, setBooks, deleteBook, deleteBooks } = await import("../extension/app/storage.js");

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

async function reset() {
    store = {};
    await setBooks(["a", "b", "c", "d", "e"].map((id) => ({ id, title: id.toUpperCase() })));
    writes = 0;
}

const ids = async () => (await getBooks()).map((b) => b.id);

console.log("deleteBooks");

await reset();
check("removes exactly the books asked for", await deleteBooks(["b", "d"]), 2);
check("leaves the rest, in their order", await ids(), ["a", "c", "e"]);
check("saves once, however many go", writes, 1);

await reset();
check("ignores ids that aren't there", await deleteBooks(["b", "zz"]), 1);
check("and still removes the ones that are", await ids(), ["a", "c", "d", "e"]);

await reset();
check("nothing matching removes nothing", await deleteBooks(["zz"]), 0);
check("and doesn't save at all", writes, 0);

await reset();
check("an empty list removes nothing", await deleteBooks([]), 0);
check("can remove the whole library", await deleteBooks(["a", "b", "c", "d", "e"]), 5);
check("leaving it empty", await ids(), []);

console.log("deleteBook");

await reset();
check("still removes one book", await deleteBook("c"), true);
check("and only that one", await ids(), ["a", "b", "d", "e"]);
check("reports a book that isn't there", await deleteBook("zz"), false);

console.log(failures ? `\n${failures} failed.` : "\nAll passed.");
process.exitCode = failures ? 1 : 0;
