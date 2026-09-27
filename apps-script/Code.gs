/**
 * Grocery Tracker — Google Sheets backend.
 *
 * Setup (one time):
 *   1. In your Google Sheet: Extensions → Apps Script. Replace Code.gs with this file.
 *   2. Change PASSCODE below, then Save.
 *   3. Pick "setup" in the function dropdown and click Run (approve the permissions prompt).
 *      This creates the "Inventory" and "Barcodes" tabs and copies your existing rows in.
 *      Your original tab is left untouched as a backup.
 *   4. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
 *      Copy the Web app URL (ends in /exec) into config.js.
 *
 * After editing this script later, use Deploy → Manage deployments → Edit → New version
 * so the same URL picks up the change.
 */

const PASSCODE = 'CHANGE-ME';

const INV = 'Inventory';
const BAR = 'Barcodes';
// Column order in the Inventory tab. Don't reorder columns in the sheet.
const COLS = ['id', 'category', 'name', 'qty', 'unit', 'location', 'expires', 'barcode', 'brand', 'notes', 'image', 'added', 'updated'];
const HEADERS = ['ID', 'Category', 'Item', 'Qty', 'Unit', 'Location', 'Expires', 'Barcode', 'Brand', 'Notes', 'Image', 'Added', 'Updated'];
const TEXT_COLS = ['id', 'expires', 'barcode', 'added', 'updated'];
const BCOLS = ['barcode', 'name', 'brand', 'category', 'unit', 'image'];
const BHEADERS = ['Barcode', 'Name', 'Brand', 'Category', 'Unit', 'Image'];

function doGet(e) {
  return json_({ ok: true, service: 'grocery-tracker' });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  if (PASSCODE === 'CHANGE-ME') return json_({ ok: false, error: 'passcode_not_set' });
  if (String(req.key || '') !== PASSCODE) return json_({ ok: false, error: 'bad_passcode' });
  try {
    switch (req.action) {
      case 'list':
        return json_({ ok: true, items: readInventory_(), barcodes: readBarcodes_() });
      case 'upsert':
        return json_({ ok: true, item: withLock_(() => upsertItem_(req.item)) });
      case 'adjust':
        return json_({ ok: true, item: withLock_(() => adjustItem_(req.id, Number(req.delta))) });
      case 'delete':
        withLock_(() => deleteItem_(req.id));
        return json_({ ok: true });
      case 'barcode':
        withLock_(() => upsertBarcode_(req.entry));
        return json_({ ok: true });
      default:
        return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* ---------- Inventory ---------- */

function readInventory_() {
  const sh = sheet_(INV);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  return rows.filter(r => r[0] && r[2]).map(rowToItem_);
}

function rowToItem_(r) {
  const o = {};
  COLS.forEach((c, i) => { o[c] = cell_(r[i]); });
  o.qty = Number(o.qty) || 0;
  return o;
}

function itemToRow_(item) {
  return COLS.map(c => (c === 'qty' ? Number(item.qty) || 0 : String(item[c] == null ? '' : item[c])));
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function upsertItem_(item) {
  if (!item || !item.id || !item.name) throw new Error('item needs id and name');
  const sh = sheet_(INV);
  const now = new Date().toISOString();
  const row = findRow_(sh, item.id);
  item.updated = now;
  if (row > 0) {
    const existing = rowToItem_(sh.getRange(row, 1, 1, COLS.length).getValues()[0]);
    item.added = existing.added || item.added || now;
    sh.getRange(row, 1, 1, COLS.length).setValues([itemToRow_(item)]);
  } else {
    item.added = item.added || now;
    sh.appendRow(itemToRow_(item));
  }
  return item;
}

function adjustItem_(id, delta) {
  const sh = sheet_(INV);
  const row = findRow_(sh, id);
  if (row < 0) throw new Error('not_found');
  const range = sh.getRange(row, 1, 1, COLS.length);
  const item = rowToItem_(range.getValues()[0]);
  item.qty = Math.max(0, Math.round((item.qty + (delta || 0)) * 100) / 100);
  item.updated = new Date().toISOString();
  range.setValues([itemToRow_(item)]);
  return item;
}

function deleteItem_(id) {
  const sh = sheet_(INV);
  const row = findRow_(sh, id);
  if (row > 0) sh.deleteRow(row);
}

/* ---------- Barcode catalog ---------- */

function readBarcodes_() {
  const sh = sheet_(BAR);
  const last = sh.getLastRow();
  const out = {};
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, BCOLS.length).getValues().forEach(r => {
    if (!r[0]) return;
    const o = {};
    BCOLS.forEach((c, i) => { o[c] = cell_(r[i]); });
    out[o.barcode] = o;
  });
  return out;
}

function upsertBarcode_(entry) {
  if (!entry || !entry.barcode) throw new Error('entry needs barcode');
  const sh = sheet_(BAR);
  const values = BCOLS.map(c => String(entry[c] == null ? '' : entry[c]));
  const row = findRow_(sh, entry.barcode);
  if (row > 0) sh.getRange(row, 1, 1, BCOLS.length).setValues([values]);
  else sh.appendRow(values);
}

/* ---------- Helpers ---------- */

function sheet_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- One-time setup / migration ---------- */

function setup() {
  const ss = SpreadsheetApp.getActive();

  let bar = ss.getSheetByName(BAR);
  if (!bar) {
    bar = ss.insertSheet(BAR);
    bar.getRange(1, 1, 1, BHEADERS.length).setValues([BHEADERS]).setFontWeight('bold');
    bar.getRange('A:A').setNumberFormat('@');
    bar.setFrozenRows(1);
  }

  let inv = ss.getSheetByName(INV);
  if (inv && inv.getLastRow() > 1) {
    safeAlert_('Inventory tab already has data — setup skipped the import.');
    return;
  }
  if (!inv) inv = ss.insertSheet(INV, 0);
  inv.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  inv.setFrozenRows(1);
  TEXT_COLS.forEach(c => {
    const col = COLS.indexOf(c) + 1;
    inv.getRange(1, col, inv.getMaxRows(), 1).setNumberFormat('@');
  });

  // Import from the original tab (first tab that isn't ours).
  const src = ss.getSheets().find(s => s.getName() !== INV && s.getName() !== BAR);
  if (!src) return;
  const values = src.getDataRange().getValues();
  const now = new Date().toISOString();
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const [category, name, quantity, location] = values[i].map(v => String(v).trim());
    if (!name) continue;
    const q = parseQty_(quantity);
    rows.push(itemToRow_({
      id: Utilities.getUuid().slice(0, 8), category, name, qty: q.qty, unit: q.unit,
      location, expires: '', barcode: '', brand: '', notes: '', image: '', added: now, updated: now,
    }));
  }
  if (rows.length) inv.getRange(2, 1, rows.length, COLS.length).setValues(rows);
  inv.autoResizeColumns(1, 7);
  safeAlert_('Imported ' + rows.length + ' items into the Inventory tab.');
}

function parseQty_(s) {
  const m = String(s || '').match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  if (!m) return { qty: 1, unit: String(s || '').trim() };
  const n = m[1].trim();
  let qty;
  if (n.includes('/')) {
    const parts = n.split(/\s+/);
    const frac = parts.pop().split('/');
    qty = (parts.length ? Number(parts[0]) : 0) + Number(frac[0]) / Number(frac[1]);
  } else qty = Number(n);
  return { qty: Math.round(qty * 100) / 100, unit: m[2].trim() };
}

function safeAlert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}
