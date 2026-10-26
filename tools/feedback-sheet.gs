/**
 * ShelfBridge feedback receiver: a Google Apps Script for the dev request sheet.
 *
 * The extension's "Send feedback" form posts here, and this adds each idea or
 * bug report to the sheet as a new row with the next SB- number. Not shipped
 * in the extension; it lives in the Google Sheet.
 *
 * SETUP (about five minutes)
 *   1. Open the dev request sheet, then Extensions > Apps Script.
 *   2. Replace whatever's in Code.gs with this whole file, and save.
 *   3. Check CONFIG below: the tab name, and that each header name matches row
 *      1 of that tab exactly. A field whose header isn't found is skipped.
 *   4. Deploy > New deployment > Select type: Web app.
 *        Execute as:      Me
 *        Who has access:  Anyone
 *      Approve the permissions it asks for (it only touches this sheet).
 *   5. Copy the Web app URL (it ends in /exec) and paste it into FEEDBACK_URL
 *      in extension/app/feedback.js.
 *   6. To test: open ShelfBridge, send a message, and look for the new row.
 *
 * After editing this script later, use Deploy > Manage deployments > Edit >
 * Version: New version. That keeps the same URL, so the extension doesn't
 * need changing.
 *
 * SAFETY
 * The URL sits inside a public extension, so anyone could find it and post to
 * it. This script therefore:
 *   - drops anything that fills in the hidden trap field (bots fill every box),
 *   - enforces the same length limits as the form,
 *   - caps how many rows it will add per hour,
 *   - stops a message being read as a spreadsheet formula, by prefixing any
 *     value that starts with = + - or @ with an apostrophe.
 * Nothing it receives is ever run or followed, only written as text.
 */

const CONFIG = {
  // The tab the requests live on.
  sheetName: "Requests",

  // How IDs look: SB-001, SB-002 and so on. The next number is one more than
  // the highest already in the ID column.
  idPrefix: "SB-",
  idDigits: 3,

  // Fixed values for every row from the form.
  project: "shelfbridge",
  source: "In-app form",
  status: "New",

  // Row 1 header for each field. Change these to match your sheet.
  columns: {
    id:          "ID",
    date:        "Date added",
    project:     "Project",
    title:       "Title",
    description: "Description",
    type:        "Type",
    source:      "Source",
    reporter:    "Requested by",   // gets the email address, if one was given
    status:      "Status",
  },

  // How the form's three choices are written in the Type column.
  typeLabels: { idea: "Feature", bug: "Bug", other: "Other" },

  // Same limits as LIMITS in extension/app/feedback.js.
  limits: { title: 120, details: 2000, email: 200 },

  // Most rows the form may add in one hour, as a brake on spam.
  maxPerHour: 30,

  timeZone: "Europe/London",
};


function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    // A person never sees the trap field. Say thanks and do nothing, so a bot
    // gets no hint that it was caught.
    if (data.website) return reply({ ok: true, reference: "" });

    const type = String(data.type || "");
    const title = String(data.title || "").trim();
    const details = String(data.details || "").trim();
    const email = String(data.email || "").trim();
    const version = String(data.version || "").slice(0, 30);

    if (!CONFIG.typeLabels[type] || !title || !details
        || title.length > CONFIG.limits.title
        || details.length > CONFIG.limits.details
        || email.length > CONFIG.limits.email) {
      return reply({ ok: false, reason: "invalid" });
    }

    if (!underHourlyCap()) return reply({ ok: false, reason: "busy" });

    // One write at a time, so two messages at once can't get the same ID.
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheetName);
      if (!sheet) return reply({ ok: false, reason: "server" });

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
        .map((h) => String(h).trim());
      const reference = nextId(sheet, headers);

      const fields = {
        id:          reference,
        date:        Utilities.formatDate(new Date(), CONFIG.timeZone, "dd-MM-yyyy"),
        project:     CONFIG.project,
        title:       title,
        description: details + (version ? "\n\nShelfBridge version " + version : ""),
        type:        CONFIG.typeLabels[type],
        source:      CONFIG.source,
        reporter:    email,
        status:      CONFIG.status,
      };

      // Only the mapped cells are written, so formula columns (like a key
      // filled down the whole tab) keep their formulas.
      const target = firstEmptyRow(sheet, headers);
      Object.keys(fields).forEach((field) => {
        const column = headers.indexOf(CONFIG.columns[field]);
        if (column !== -1) sheet.getRange(target, column + 1).setValue(asText(fields[field]));
      });

      return reply({ ok: true, reference: reference });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return reply({ ok: false, reason: "server" });
  }
}

// One more than the highest SB- number in the ID column.
function nextId(sheet, headers) {
  const column = headers.indexOf(CONFIG.columns.id) + 1;
  let highest = 0;
  if (column > 0 && sheet.getLastRow() > 1) {
    sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues().forEach(([value]) => {
      const match = String(value).match(/(\d+)\s*$/);
      if (match) highest = Math.max(highest, Number(match[1]));
    });
  }
  return CONFIG.idPrefix + String(highest + 1).padStart(CONFIG.idDigits, "0");
}

// The first row with nothing in the ID column. Not appendRow(): formulas filled
// down a column count as content, so it would add the row below all of them.
function firstEmptyRow(sheet, headers) {
  const column = headers.indexOf(CONFIG.columns.id) + 1;
  const last = sheet.getLastRow();
  if (column > 0 && last > 1) {
    const ids = sheet.getRange(2, column, last - 1, 1).getValues();
    const index = ids.findIndex(([value]) => String(value).trim() === "");
    if (index !== -1) return index + 2;
  }
  return last + 1;
}

// Counts this hour's messages and says whether there's room for another.
function underHourlyCap() {
  const cache = CacheService.getScriptCache();
  const key = "sent-" + Utilities.formatDate(new Date(), "UTC", "yyyyMMddHH");
  const count = Number(cache.get(key) || 0);
  if (count >= CONFIG.maxPerHour) return false;
  cache.put(key, String(count + 1), 3600);
  return true;
}

// Stops a value like "=IMPORTXML(...)" being treated as a formula.
function asText(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
