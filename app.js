(() => {
  'use strict';

  /* ---------- Config & constants ---------- */

  const APP_VERSION = '5';
  const API = (window.GT_CONFIG && window.GT_CONFIG.apiUrl || '').trim();
  const REMOTE = !!API;
  const KEY = {
    items: 'gt.items', barcodes: 'gt.barcodes', outbox: 'gt.outbox',
    pass: 'gt.pass', sort: 'gt.sort', mode: 'gt.scanMode',
  };
  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js';
  const POLL_MS = 15000;
  const SOON_DAYS = 14;

  const CATEGORY_ORDER = ['Meat', 'Veggies', 'Fruit', 'Prepared', 'Dairy', 'Bread', 'Desserts', 'Baking',
    'Dry Goods', 'Canned Goods', 'Snacks', 'Condiments & Spices', 'Beverages', 'Other'];
  const LOCATIONS = ['Inside Freezer', 'Outside Freezer', 'Pantry'];
  const PANTRY_CATS = new Set(['Baking', 'Dry Goods', 'Canned Goods', 'Snacks', 'Condiments & Spices', 'Beverages']);
  const UNITS = ['bag', 'bags', 'pounds', 'quart', 'quarts', 'box', 'boxes', 'can', 'cans', 'jar', 'jars',
    'package', 'packages', 'portions', 'roast', 'roasts', 'sections', 'bottle', 'bottles', 'each'];

  // Checked in order; first match wins. Name keywords (regex on lowercased name).
  const KEYWORDS = [
    ['Canned Goods', /\bcanned\b|\bcan of\b/],
    ['Prepared', /soup|stew|chili|lasagna|casserole|pizza|burrito|egg roll|dumpling|pot ?pie|meal|dinner|entree|ravioli|wrapper|nugget|hash\b|bbq hash/],
    ['Meat', /beef|chicken|pork|turkey|ham\b|bacon|sausage|salmon|tuna steak|fish|shrimp|venison|lamb|steak|roast|meatball|wings?\b|brisket|ribs?\b|bbq|ground|chop|filet|tilapia|cod\b|crab|lobster|scallop|jerky/],
    ['Desserts', /ice cream|popsicle|sorbet|gelato|cheesecake|\bpie\b|cake|cookie dough|frozen yogurt/],
    ['Dairy', /cheese|milk|yogurt|cream\b|sour cream|egg(s)?\b/],
    ['Fruit', /peach|berr|strawberr|blueberr|raspberr|mango|cherr|apple|banana|pineapple|grape|fruit|melon|pear|plum|lemon|lime/],
    ['Veggies', /pea(s)?\b|corn|bean|tomato|cauliflower|broccoli|mushroom|hash ?brown|potato|fries|spinach|carrot|pepper|onion|vegetable|veggie|okra|squash|zucchini|kale|asparagus|brussels/],
    ['Baking', /butter|pecan|walnut|almond|flour|sugar|yeast|baking|chocolate chip|cocoa|vanilla|nuts?\b|shortening|cornmeal/],
    ['Bread', /bread|bun|roll(s)?\b|bagel|tortilla|biscuit|muffin|waffle|pancake/],
    ['Dry Goods', /pasta|spaghetti|noodle|rice|oat|cereal|grits|quinoa|lentil|dried|macaroni|mac & cheese|crackers?/],
    ['Snacks', /chip|pretzel|popcorn|granola|bar(s)?\b|snack|trail mix/],
    ['Condiments & Spices', /sauce|ketchup|mustard|mayo|dressing|vinegar|oil\b|salt|spice|seasoning|syrup|honey|jam|jelly|peanut butter|broth|stock/],
    ['Beverages', /coffee|tea\b|juice|soda|water|drink/],
  ];
  // Open Food Facts category tags → our categories.
  const OFF_TAGS = [
    ['Desserts', ['en:ice-creams', 'en:frozen-desserts', 'en:desserts', 'en:cakes', 'en:pies']],
    ['Canned Goods', ['en:canned-foods', 'en:canned-vegetables', 'en:canned-fruits']],
    ['Prepared', ['en:meals', 'en:soups', 'en:pizzas', 'en:frozen-meals', 'en:prepared-meals', 'en:sandwiches']],
    ['Meat', ['en:meats', 'en:poultry', 'en:fishes', 'en:seafood', 'en:meat-products', 'en:sausages', 'en:hams']],
    ['Fruit', ['en:fruits', 'en:frozen-fruits', 'en:fruits-based-foods']],
    ['Veggies', ['en:vegetables', 'en:frozen-vegetables', 'en:vegetables-based-foods', 'en:potatoes', 'en:legumes']],
    ['Dairy', ['en:dairies', 'en:cheeses', 'en:milks', 'en:yogurts', 'en:eggs']],
    ['Bread', ['en:breads', 'en:viennoiseries']],
    ['Baking', ['en:baking-decorations', 'en:flours', 'en:sugars', 'en:nuts', 'en:butters', 'en:baking-mixes']],
    ['Snacks', ['en:snacks', 'en:salty-snacks', 'en:chips-and-fries', 'en:biscuits-and-cakes', 'en:crackers']],
    ['Dry Goods', ['en:cereals-and-their-products', 'en:pastas', 'en:rices', 'en:breakfast-cereals', 'en:dried-products']],
    ['Condiments & Spices', ['en:condiments', 'en:sauces', 'en:spices', 'en:groceries', 'en:spreads', 'en:oils']],
    ['Beverages', ['en:beverages']],
  ];

  /* ---------- State ---------- */

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } },
  };

  const state = {
    items: store.get(KEY.items, null),
    barcodes: store.get(KEY.barcodes, {}),
    outbox: store.get(KEY.outbox, []),
    pass: store.get(KEY.pass, ''),
    query: '',
    filter: 'All',
    sort: store.get(KEY.sort, 'category'),
    scanMode: store.get(KEY.mode, 'ask'),
    rev: 0,
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const el = {
    list: $('#list'), count: $('#count'), search: $('#search'), chips: $('#locChips'), sort: $('#sort'),
    syncBtn: $('#syncBtn'), syncText: $('#syncText'), toast: $('#toast'),
    menuDlg: $('#menuDlg'), passDlg: $('#passDlg'), passForm: $('#passForm'), passErr: $('#passErr'),
    scanDlg: $('#scanDlg'), video: $('#video'), scanStatus: $('#scanStatus'), flash: $('#flash'),
    manualForm: $('#manualForm'), manualCode: $('#manualCode'), modeSeg: $('#modeSeg'),
    matchDlg: $('#matchDlg'), matchBody: $('#matchBody'),
    itemDlg: $('#itemDlg'), itemForm: $('#itemForm'), itemTitle: $('#itemTitle'), itemHint: $('#itemHint'),
    itemImg: $('#itemImg'), autoCat: $('#autoCat'), autoLoc: $('#autoLoc'), deleteBtn: $('#deleteBtn'),
  };

  /* ---------- Utilities ---------- */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '').slice(0, 8);
  const nowIso = () => new Date().toISOString();
  const round2 = (n) => Math.round(n * 100) / 100;

  function fmtQty(n) {
    n = Number(n) || 0;
    const whole = Math.floor(n);
    const frac = round2(n - whole);
    const map = { 0.25: '¼', 0.5: '½', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' };
    if (map[frac]) return (whole ? whole : '') + map[frac];
    return String(round2(n));
  }

  function parseQty(s) {
    const m = String(s || '').match(/^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
    if (!m) return { qty: 1, unit: String(s || '').trim() };
    const n = m[1].trim();
    let qty;
    if (n.includes('/')) {
      const parts = n.split(/\s+/);
      const [a, b] = parts.pop().split('/');
      qty = (parts.length ? Number(parts[0]) : 0) + Number(a) / Number(b);
    } else qty = Number(n);
    return { qty: round2(qty), unit: m[2].trim() };
  }

  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function normalizeCode(raw) {
    const s = String(raw || '').trim();
    if (/^\d+$/.test(s) && s.length === 12) return '0' + s; // UPC-A → EAN-13
    return s;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d)) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function categorize(name, tags) {
    if (tags && tags.length) {
      for (const [cat, list] of OFF_TAGS) if (list.some((t) => tags.includes(t))) return cat;
    }
    const n = String(name || '').toLowerCase();
    for (const [cat, re] of KEYWORDS) if (re.test(n)) return cat;
    return 'Other';
  }

  const defaultLocation = (category, tags) => {
    if (tags && tags.some((t) => /frozen/.test(t))) return 'Inside Freezer';
    return PANTRY_CATS.has(category) ? 'Pantry' : 'Inside Freezer';
  };

  function toast(msg, action) {
    el.toast.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
    el.toast.classList.add('show');
    if (action) el.toast.querySelector('button').onclick = () => { action.fn(); el.toast.classList.remove('show'); };
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.toast.classList.remove('show'), action ? 5000 : 2600);
  }

  function seedItems() {
    const rows = parseCsv(window.SEED_CSV || '').slice(1);
    const t = nowIso();
    return rows.filter((r) => r[1] && r[1].trim()).map(([category, name, quantity, location]) => {
      const { qty, unit } = parseQty(quantity);
      return {
        id: uid(), category: category.trim(), name: name.trim(), qty, unit, location: (location || '').trim(),
        expires: '', barcode: '', brand: '', notes: '', image: '', added: t, updated: t,
      };
    });
  }

  /* ---------- Data operations (optimistic, synced via outbox) ---------- */

  function persist() {
    store.set(KEY.items, state.items);
    store.set(KEY.barcodes, state.barcodes);
    store.set(KEY.outbox, state.outbox);
  }

  function applyOp(op) {
    const items = state.items;
    if (op.action === 'upsert') {
      const i = items.findIndex((x) => x.id === op.item.id);
      const item = { ...op.item, updated: nowIso() };
      if (i >= 0) items[i] = { ...items[i], ...item }; else items.push({ added: nowIso(), ...item });
    } else if (op.action === 'adjust') {
      const it = items.find((x) => x.id === op.id);
      if (it) { it.qty = Math.max(0, round2(it.qty + op.delta)); it.updated = nowIso(); }
    } else if (op.action === 'delete') {
      state.items = items.filter((x) => x.id !== op.id);
    } else if (op.action === 'barcode') {
      state.barcodes[op.entry.barcode] = op.entry;
    }
  }

  function commit(op) {
    applyOp(op);
    state.rev++;
    if (REMOTE) state.outbox.push(op);
    persist();
    render();
    if (REMOTE) flush();
  }

  // Step down: 3 → 2 → 1 → ½ → 0.  Step up: 0 → 1, ½ → 1, 2 → 3.
  // Packaged (barcoded) items step in whole units: 1 → 0.
  function stepDelta(qty, dir, whole) {
    if (dir > 0) return qty < 1 ? 1 - qty : 1;
    if (whole) return -Math.min(1, qty);
    if (qty > 1) return Math.max(-1, 1 - qty);
    if (qty > 0.5) return 0.5 - qty;
    return -qty;
  }

  function adjust(id, dir, { undo = true } = {}) {
    const it = state.items.find((x) => x.id === id);
    if (!it) return null;
    const delta = round2(stepDelta(it.qty, dir, !!it.barcode));
    if (!delta) { toast(`${it.name} is already out`); return it; }
    commit({ action: 'adjust', id, delta });
    if (undo) {
      toast(`${dir > 0 ? '+' : '−'} ${it.name} · now ${fmtQty(it.qty)} ${it.unit}`.trim(), {
        label: 'Undo', fn: () => commit({ action: 'adjust', id, delta: -delta }),
      });
    }
    return it;
  }

  /* ---------- Sync with Apps Script ---------- */

  let flushing = false;
  let retryTimer = null;

  function setSync(s, text) {
    el.syncBtn.dataset.state = s;
    el.syncText.textContent = text;
  }

  async function api(body) {
    const res = await fetch(API, {
      method: 'POST',
      // text/plain keeps this a "simple" request so Apps Script doesn't need CORS preflight.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, key: state.pass }),
      redirect: 'follow',
    });
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { network: true });
    const data = await res.json();
    if (!data.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error });
    return data;
  }

  function handleSyncError(err, { duringList = false } = {}) {
    if (err.code === 'bad_passcode' || err.code === 'passcode_not_set') {
      setSync('error', 'Locked');
      askPasscode(err.code === 'passcode_not_set'
        ? 'The sheet script still has the default passcode. Set PASSCODE in Code.gs and redeploy.'
        : 'That passcode didn’t work.');
      return;
    }
    if (err.code && duringList) {
      setSync('error', 'Sheet error');
      toast('Couldn’t load from the sheet: ' + err.code);
      return;
    }
    if (err.code) { // server-side error for a specific op — drop it so the queue can't jam
      console.warn('Sync op rejected:', err.code);
      state.outbox.shift();
      persist();
      toast('A change couldn’t be saved: ' + err.code);
      return 'continue';
    }
    setSync('offline', state.outbox.length ? `Offline · ${state.outbox.length} pending` : 'Offline');
    clearTimeout(retryTimer);
    retryTimer = setTimeout(flush, 10000);
  }

  async function flush() {
    if (!REMOTE || flushing || !state.pass) return;
    flushing = true;
    setSync('busy', 'Saving…');
    try {
      while (state.outbox.length) {
        try {
          await api(state.outbox[0]);
          state.outbox.shift();
          persist();
        } catch (err) {
          if (handleSyncError(err) !== 'continue') return;
        }
      }
    } finally {
      flushing = false;
    }
    refresh();
  }

  async function refresh() {
    if (!REMOTE) return;
    if (!state.pass) { askPasscode(); return; }
    if (state.outbox.length) { flush(); return; }
    const rev = state.rev;
    setSync('busy', 'Syncing…');
    try {
      const data = await api({ action: 'list' });
      if (rev !== state.rev || state.outbox.length) return; // local edits happened mid-flight; next poll catches up
      state.items = data.items;
      state.barcodes = data.barcodes || {};
      persist();
      render();
      setSync('ok', 'Synced');
    } catch (err) {
      handleSyncError(err, { duringList: true });
    }
  }

  function askPasscode(msg) {
    el.passErr.hidden = !msg;
    el.passErr.textContent = msg || '';
    if (!el.passDlg.open) el.passDlg.showModal();
  }

  el.passForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.pass = el.passForm.pass.value.trim();
    store.set(KEY.pass, state.pass);
    el.passDlg.close();
    el.passForm.reset();
    refresh();
  });

  /* ---------- Rendering ---------- */

  function haystack(it) {
    return [it.name, it.brand, it.category, it.location, it.notes, it.barcode, it.unit].join(' ').toLowerCase();
  }

  function highlight(text, tokens) {
    let out = esc(text);
    for (const t of tokens) {
      if (!t) continue;
      const re = new RegExp('(' + esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    }
    return out;
  }

  function expiryBadge(it) {
    const d = daysUntil(it.expires);
    if (d === null) return '';
    if (d < 0) return `<span class="badge exp-past">Expired ${-d}d ago</span>`;
    if (d === 0) return `<span class="badge exp-past">Expires today</span>`;
    if (d <= SOON_DAYS) return `<span class="badge exp-soon">Expires in ${d}d</span>`;
    const dt = new Date(it.expires + 'T00:00:00');
    return `<span class="badge">Exp ${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: dt.getFullYear() !== new Date().getFullYear() ? '2-digit' : undefined })}</span>`;
  }

  function allLocations() {
    const set = new Set(LOCATIONS);
    state.items.forEach((x) => x.location && set.add(x.location));
    return [...set];
  }
  function allCategories() {
    const set = new Set(CATEGORY_ORDER);
    state.items.forEach((x) => x.category && set.add(x.category));
    return [...set];
  }

  function renderChips() {
    const chips = ['All', ...allLocations(), 'Expiring', 'Out of stock'];
    if (!chips.includes(state.filter)) state.filter = 'All';
    el.chips.innerHTML = chips.map((c) =>
      `<button class="chip" role="tab" aria-selected="${c === state.filter}" data-filter="${esc(c)}">${c === 'Expiring' ? '⏰ ' : ''}${esc(c)}</button>`).join('');
  }

  function renderDatalists() {
    $('#catList').innerHTML = allCategories().map((c) => `<option value="${esc(c)}">`).join('');
    $('#locList').innerHTML = allLocations().map((c) => `<option value="${esc(c)}">`).join('');
    const units = new Set(UNITS);
    state.items.forEach((x) => x.unit && units.add(x.unit));
    $('#unitList').innerHTML = [...units].map((c) => `<option value="${esc(c)}">`).join('');
  }

  function itemRow(it, tokens, showLoc) {
    const out = it.qty <= 0;
    const meta = [
      showLoc && it.location ? `<span class="badge">${esc(it.location)}</span>` : '',
      expiryBadge(it),
      it.brand ? esc(it.brand) : '',
      it.notes ? `· ${esc(it.notes)}` : '',
    ].filter(Boolean).join(' ');
    return `<div class="item${out ? ' out' : ''}" data-id="${esc(it.id)}">
      ${it.image ? `<img class="thumb" src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <div class="info">
        <div class="name">${highlight(it.name, tokens)}</div>
        ${meta ? `<div class="meta">${meta}</div>` : ''}
      </div>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Use one ${esc(it.name)}">−</button>
        <div class="qty"><b>${out ? 'Out' : fmtQty(it.qty)}</b><small>${out ? '' : esc(it.unit)}</small></div>
        <button type="button" data-step="1" aria-label="Add one ${esc(it.name)}">+</button>
      </div>
    </div>`;
  }

  function render() {
    renderChips();
    renderDatalists();
    const tokens = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    let items = state.items.filter((it) => {
      if (state.filter === 'Expiring') { const d = daysUntil(it.expires); if (d === null || d > SOON_DAYS || it.qty <= 0) return false; }
      else if (state.filter === 'Out of stock') { if (it.qty > 0) return false; }
      else if (state.filter !== 'All' && it.location !== state.filter) return false;
      if (!tokens.length) return true;
      const h = haystack(it);
      return tokens.every((t) => h.includes(t));
    });

    const inStock = state.items.filter((x) => x.qty > 0).length;
    el.count.textContent = `${inStock} in stock`;

    if (!items.length) {
      el.list.innerHTML = `<div class="empty">${state.items.length
        ? 'No matches. Try a different search or filter.'
        : 'Nothing here yet. Scan a barcode or tap ＋ Add.'}</div>`;
      return;
    }

    const byName = (a, b) => a.name.localeCompare(b.name) || a.location.localeCompare(b.location);
    const inStockFirst = (a, b) => (a.qty <= 0) - (b.qty <= 0);
    let groups;
    if (state.sort === 'category' || state.sort === 'location') {
      const key = state.sort;
      const order = key === 'category' ? allCategories() : allLocations();
      const map = new Map();
      items.forEach((it) => { const k = it[key] || 'Other'; if (!map.has(k)) map.set(k, []); map.get(k).push(it); });
      groups = [...map.entries()]
        .sort(([a], [b]) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b))
        .map(([k, list]) => [k, list.sort((a, b) => inStockFirst(a, b) || byName(a, b))]);
    } else {
      const cmp = {
        name: byName,
        recent: (a, b) => String(b.updated).localeCompare(String(a.updated)),
        expires: (a, b) => (a.expires ? 0 : 1) - (b.expires ? 0 : 1) || String(a.expires).localeCompare(String(b.expires)) || byName(a, b),
      }[state.sort];
      groups = [[null, items.sort((a, b) => inStockFirst(a, b) || cmp(a, b))]];
    }

    const showLoc = state.sort !== 'location';
    el.list.innerHTML = groups.map(([title, list]) => `
      <section class="group">
        ${title ? `<h3><span>${esc(title)}</span><span>${list.filter((x) => x.qty > 0).length}</span></h3>` : '<h3></h3>'}
        <div class="card">${list.map((it) => itemRow(it, tokens, showLoc)).join('')}</div>
      </section>`).join('');
  }

  /* ---------- Item form ---------- */

  let formCtx = null; // { id?, tags?, catTouched, locTouched }

  // Never auto-focus a field: on phones that pops the keyboard over the form.
  function openForm(item = {}, { title, hint, tags } = {}) {
    const f = el.itemForm;
    const isNew = !item.id || !state.items.some((x) => x.id === item.id);
    formCtx = { id: isNew ? null : item.id, tags: tags || null, catTouched: !!item.category, locTouched: !!item.location, image: item.image || '' };
    el.itemTitle.textContent = title || (isNew ? 'Add item' : 'Edit item');
    el.itemHint.textContent = hint || '';
    el.itemHint.hidden = !hint;
    f.name.value = item.name || '';
    f.qty.value = item.qty ?? 1;
    f.unit.value = item.unit || '';
    f.category.value = item.category || '';
    f.location.value = item.location || '';
    f.expires.value = item.expires || '';
    f.brand.value = item.brand || '';
    f.barcode.value = item.barcode || '';
    f.notes.value = item.notes || '';
    el.itemImg.hidden = !item.image;
    if (item.image) el.itemImg.src = item.image;
    el.deleteBtn.hidden = isNew;
    autoFill();
    if (!el.itemDlg.open) el.itemDlg.showModal();
  }

  function autoFill() {
    const f = el.itemForm;
    if (!formCtx) return;
    if (!formCtx.catTouched) {
      f.category.value = f.name.value.trim() || formCtx.tags ? categorize(f.name.value, formCtx.tags) : '';
    }
    if (!formCtx.locTouched && f.category.value) {
      f.location.value = defaultLocation(f.category.value, formCtx.tags);
    }
    el.autoCat.hidden = formCtx.catTouched || !f.category.value;
    el.autoLoc.hidden = formCtx.locTouched || !f.location.value;
  }

  el.itemForm.name.addEventListener('input', autoFill);
  el.itemForm.category.addEventListener('input', () => { formCtx.catTouched = true; autoFill(); });
  el.itemForm.location.addEventListener('input', () => { formCtx.locTouched = true; autoFill(); });

  el.itemForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = el.itemForm;
    const existing = formCtx.id ? state.items.find((x) => x.id === formCtx.id) : null;
    const item = {
      ...(existing || {}),
      id: formCtx.id || uid(),
      name: f.name.value.trim(),
      qty: Math.max(0, round2(Number(f.qty.value) || 0)),
      unit: f.unit.value.trim(),
      category: f.category.value.trim() || 'Other',
      location: f.location.value.trim() || 'Inside Freezer',
      expires: f.expires.value,
      brand: f.brand.value.trim(),
      barcode: normalizeCode(f.barcode.value),
      notes: f.notes.value.trim(),
      image: formCtx.image || (existing && existing.image) || '',
    };
    if (!item.name) return;
    commit({ action: 'upsert', item });
    if (item.barcode) {
      const entry = { barcode: item.barcode, name: item.name, brand: item.brand, category: item.category, unit: item.unit, image: item.image };
      const prev = state.barcodes[item.barcode];
      if (!prev || ['name', 'brand', 'category', 'unit', 'image'].some((k) => prev[k] !== entry[k])) {
        commit({ action: 'barcode', entry });
      }
    }
    el.itemDlg.close();
    toast(existing ? 'Saved' : `Added ${item.name} to ${item.location}`);
    if (formCtx.resumeScan) setTimeout(openScanner, 250);
  });

  el.deleteBtn.addEventListener('click', () => {
    const it = state.items.find((x) => x.id === formCtx.id);
    if (!it || !confirm(`Delete "${it.name}" (${it.location})?`)) return;
    commit({ action: 'delete', id: it.id });
    el.itemDlg.close();
    toast(`Deleted ${it.name}`, { label: 'Undo', fn: () => commit({ action: 'upsert', item: it }) });
  });

  /* ---------- Product lookup ---------- */

  async function lookupProduct(code) {
    const known = state.barcodes[code];
    if (known && known.name) return { ...known, source: 'catalog' };
    const tries = [code];
    if (code.length === 13 && code.startsWith('0')) tries.push(code.slice(1));
    for (const c of tries) {
      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=product_name,generic_name,brands,categories_tags,image_front_small_url,quantity`);
        if (!res.ok) continue;
        const data = await res.json();
        if (data.status !== 1 || !data.product) continue;
        const p = data.product;
        const name = (p.product_name || p.generic_name || '').trim();
        if (!name) continue;
        const tags = p.categories_tags || [];
        return {
          name, brand: (p.brands || '').split(',')[0].trim(), tags, category: categorize(name, tags),
          image: p.image_front_small_url || '', size: p.quantity || '', source: 'off',
        };
      } catch { /* offline or blocked — fall through */ }
    }
    return null;
  }

  async function newFromBarcode(code, { resumeScan = false } = {}) {
    openForm({ barcode: code, qty: 1 }, { title: 'New item', hint: 'Looking up barcode…' });
    formCtx.resumeScan = resumeScan;
    const p = await lookupProduct(code);
    if (!el.itemDlg.open || el.itemForm.barcode.value !== code) return; // user moved on
    if (p) {
      const f = el.itemForm;
      if (!f.name.value) f.name.value = p.name;
      if (!f.brand.value) f.brand.value = p.brand || '';
      if (!f.unit.value && p.unit) f.unit.value = p.unit;
      formCtx.tags = p.tags || null;
      formCtx.image = p.image || '';
      if (p.source === 'catalog' && p.category) { f.category.value = p.category; formCtx.catTouched = true; }
      el.itemImg.hidden = !p.image;
      if (p.image) el.itemImg.src = p.image;
      autoFill();
      el.itemHint.textContent = p.source === 'catalog'
        ? 'Recognized from a previous scan. Check the location and quantity, then save.'
        : `Found${p.size ? ` (${p.size})` : ''}. Check the details, then save.`;
    } else {
      el.itemHint.textContent = 'Not in the product database. Name it once and it will be recognized next time.';
    }
  }

  /* ---------- Scanning ---------- */

  let scanner = null; // { stop() }
  let lastScan = { code: '', at: 0 };
  let zxingLoading = null;

  function setMode(mode) {
    state.scanMode = mode;
    store.set(KEY.mode, mode);
    $$('button', el.modeSeg).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    el.scanStatus.textContent = {
      ask: 'Point at a barcode. You’ll choose whether to add or use it.',
      in: 'Scan in: every scan adds one. Keep scanning.',
      out: 'Scan out: every scan uses one. Keep scanning.',
    }[mode];
  }

  function loadZxing() {
    if (window.ZXingBrowser) return Promise.resolve();
    zxingLoading ||= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ZXING_URL; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the barcode reader.'));
      document.head.appendChild(s);
    });
    return zxingLoading;
  }

  async function openScanner() {
    if (!el.scanDlg.open) el.scanDlg.showModal();
    setMode(state.scanMode);
    el.manualCode.value = '';
    await startCamera();
  }

  function closeScanner() {
    stopCamera();
    if (el.scanDlg.open) el.scanDlg.close();
  }

  async function startCamera() {
    stopCamera();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      el.scanStatus.textContent = 'The camera needs a secure (https) page. Type the barcode below instead.';
      return;
    }
    try {
      let native = false;
      if ('BarcodeDetector' in window) {
        try { native = (await BarcodeDetector.getSupportedFormats()).includes('ean_13'); } catch { native = false; }
      }
      if (native) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        el.video.srcObject = stream;
        await el.video.play();
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] });
        let alive = true;
        const tick = async () => {
          if (!alive) return;
          try {
            if (el.video.readyState >= 2) {
              const codes = await detector.detect(el.video);
              if (codes.length) onDetected(codes[0].rawValue);
            }
          } catch { /* frame not ready */ }
          if (alive) setTimeout(tick, 140);
        };
        tick();
        scanner = { stop() { alive = false; stream.getTracks().forEach((t) => t.stop()); el.video.srcObject = null; } };
      } else {
        el.scanStatus.textContent = 'Loading scanner…';
        await loadZxing();
        if (!el.scanDlg.open) return;
        const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false }, el.video,
          (result) => { if (result) onDetected(result.getText()); },
        );
        scanner = { stop() { controls.stop(); } };
      }
      setMode(state.scanMode);
      if (!el.scanDlg.open) stopCamera();
    } catch (err) {
      console.warn(err);
      el.scanStatus.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings, or type the barcode below.'
        : 'Couldn’t start the camera. Type the barcode below instead.';
    }
  }

  function stopCamera() {
    if (scanner) { try { scanner.stop(); } catch { /* already stopped */ } scanner = null; }
  }

  function onDetected(raw) {
    const code = normalizeCode(raw);
    const t = Date.now();
    if (code === lastScan.code && t - lastScan.at < 2500) return;
    lastScan = { code, at: t };
    navigator.vibrate?.(60);
    el.flash.classList.add('on');
    setTimeout(() => el.flash.classList.remove('on'), 60);
    handleCode(code, true);
  }

  function handleCode(code, fromScanner) {
    if (!code) return;
    const matches = state.items.filter((x) => x.barcode === code);
    const mode = fromScanner ? state.scanMode : 'ask';

    if (mode === 'in' && matches.length) {
      const target = [...matches].sort((a, b) => String(b.updated).localeCompare(String(a.updated)))[0];
      adjust(target.id, +1);
      el.scanStatus.textContent = `＋1 ${target.name} (${target.location}) → ${fmtQty(target.qty)} ${target.unit}`;
      return;
    }
    if (mode === 'out') {
      const stocked = matches.filter((x) => x.qty > 0);
      if (!stocked.length) {
        const name = matches[0]?.name || state.barcodes[code]?.name;
        el.scanStatus.textContent = name ? `${name} is already out of stock.` : `Not in inventory (${code}).`;
        toast(el.scanStatus.textContent);
        return;
      }
      // Use the one expiring soonest first.
      const target = [...stocked].sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'))[0];
      adjust(target.id, -1);
      el.scanStatus.textContent = `−1 ${target.name} (${target.location}) → ${target.qty > 0 ? fmtQty(target.qty) + ' ' + target.unit : 'out'}`;
      return;
    }

    closeScanner();
    if (matches.length) showMatch(code);
    else newFromBarcode(code, { resumeScan: fromScanner && mode === 'in' });
  }

  let matchCode = '';
  function showMatch(code) {
    matchCode = code;
    const matches = state.items.filter((x) => x.barcode === code);
    const first = matches[0];
    el.matchBody.innerHTML = `
      <div class="match-head">
        ${first.image ? `<img src="${esc(first.image)}" alt="" referrerpolicy="no-referrer">` : ''}
        <div><h2>${esc(first.name)}</h2><p class="muted small">${esc([first.brand, first.category].filter(Boolean).join(' · '))}</p></div>
      </div>
      <div class="match-list">
        ${matches.map((it) => `
          <div class="match-row" data-id="${esc(it.id)}">
            <div class="info">
              <div class="name">${esc(it.location)}</div>
              <div class="meta">${expiryBadge(it)} <button type="button" class="linkish" data-edit>Edit</button></div>
            </div>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="Used one">−</button>
              <div class="qty"><b>${it.qty > 0 ? fmtQty(it.qty) : 'Out'}</b><small>${it.qty > 0 ? esc(it.unit) : ''}</small></div>
              <button type="button" data-step="1" aria-label="Add one">+</button>
            </div>
          </div>`).join('')}
      </div>`;
    if (!el.matchDlg.open) el.matchDlg.showModal();
  }

  el.matchBody.addEventListener('click', (e) => {
    const row = e.target.closest('.match-row');
    if (!row) return;
    if (e.target.closest('[data-step]')) {
      adjust(row.dataset.id, Number(e.target.closest('[data-step]').dataset.step));
      showMatch(matchCode);
    } else if (e.target.closest('[data-edit]')) {
      el.matchDlg.close();
      openForm(state.items.find((x) => x.id === row.dataset.id));
    }
  });

  el.matchDlg.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    el.matchDlg.close();
    if (a === 'scan') openScanner();
    if (a === 'new') {
      const src = state.items.find((x) => x.barcode === matchCode) || {};
      const { id, qty, expires, notes, location, added, updated, ...rest } = src;
      openForm({ ...rest, qty: 1 }, { title: 'Add to another location' });
      formCtx.locTouched = false;
      el.itemForm.location.value = '';
    }
  });

  el.modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  el.manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(el.manualCode.value);
    el.manualCode.value = '';
    if (code) handleCode(code, true);
  });

  /* ---------- Menu actions ---------- */

  function exportCsv() {
    const cols = ['Category', 'Item', 'Quantity', 'Unit', 'Location', 'Expires', 'Brand', 'Barcode', 'Notes'];
    const q = (v) => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const rows = [...state.items]
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
      .map((x) => [x.category, x.name, x.qty, x.unit, x.location, x.expires, x.brand, x.barcode, x.notes].map(q).join(','));
    const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grocery-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function share() {
    if (!REMOTE) { toast('Connect the Google Sheet first (see README).'); return; }
    if (!state.pass) { askPasscode(); return; }
    const url = location.origin + location.pathname + '#join=' + encodeURIComponent(state.pass);
    const text = 'Our grocery tracker — this link signs you in on your phone:';
    try {
      if (navigator.share) await navigator.share({ title: 'Grocery Tracker', text, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied — it includes the passcode, so only send it to the household.'); }
    } catch { /* share cancelled */ }
  }

  el.menuDlg.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (!a) return;
    el.menuDlg.close();
    if (a === 'export') exportCsv();
    if (a === 'refresh') { REMOTE ? refresh() : toast('Local demo mode — nothing to sync.'); }
    if (a === 'share') share();
    if (a === 'passcode') askPasscode();
    if (a === 'reset' && confirm('Replace everything with the original sheet data?')) {
      state.items = seedItems(); state.barcodes = {}; persist(); render(); toast('Reset');
    }
  });

  /* ---------- Wiring ---------- */

  // Freeze the page behind open dialogs (iOS Safari ignores overflow:hidden on body alone).
  let lockedY = null;
  function syncScrollLock() {
    const anyOpen = !!$('dialog[open]');
    if (anyOpen && lockedY === null) {
      lockedY = window.scrollY;
      Object.assign(document.body.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0' });
    } else if (!anyOpen && lockedY !== null) {
      Object.assign(document.body.style, { position: '', top: '', left: '', right: '' });
      window.scrollTo(0, lockedY);
      lockedY = null;
    }
  }
  const lockObserver = new MutationObserver(syncScrollLock);
  $$('dialog').forEach((d) => lockObserver.observe(d, { attributes: true, attributeFilter: ['open'] }));

  $$('dialog').forEach((d) => {
    d.addEventListener('click', (e) => {
      if (e.target === d && d !== el.passDlg) d.close(); // backdrop click
      if (e.target.closest('[data-action="close"]') && d !== el.menuDlg && d !== el.matchDlg) d.close();
    });
  });
  el.scanDlg.addEventListener('close', stopCamera);
  el.passDlg.addEventListener('cancel', (e) => { if (!state.pass) e.preventDefault(); });

  $('#scanBtn').addEventListener('click', openScanner);
  $('#addBtn').addEventListener('click', () => openForm({ qty: 1, name: state.query && !/^\d{8,14}$/.test(state.query) ? state.query : '' }));
  $('#menuBtn').addEventListener('click', () => el.menuDlg.showModal());
  el.syncBtn.addEventListener('click', () => (REMOTE ? refresh() : toast('Local demo mode — data is only on this device.')));

  el.search.addEventListener('input', () => { state.query = el.search.value.trim(); render(); });
  el.search.addEventListener('keydown', (e) => {
    // Handheld scanners "type" the code and press Enter.
    if (e.key === 'Enter' && /^\d{8,14}$/.test(el.search.value.trim())) {
      const code = normalizeCode(el.search.value);
      el.search.value = ''; state.query = ''; render();
      handleCode(code, false);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement === document.body && !$('dialog[open]')) { e.preventDefault(); el.search.focus(); }
  });

  el.chips.addEventListener('click', (e) => {
    const c = e.target.closest('[data-filter]');
    if (c) { state.filter = c.dataset.filter; render(); }
  });
  el.sort.value = state.sort;
  el.sort.addEventListener('change', () => { state.sort = el.sort.value; store.set(KEY.sort, state.sort); render(); });

  el.list.addEventListener('click', (e) => {
    const row = e.target.closest('.item');
    if (!row) return;
    const step = e.target.closest('[data-step]');
    if (step) adjust(row.dataset.id, Number(step.dataset.step));
    else openForm(state.items.find((x) => x.id === row.dataset.id));
  });

  /* ---------- Self-update ---------- */

  // Home-screen web apps can hold on to old files for a long time. Check a tiny
  // uncached version file and reload once when a newer build is published.
  async function checkForUpdate() {
    try {
      const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const { version } = await res.json();
      if (version && String(version) !== APP_VERSION && sessionStorage.getItem('gt.reloadedFor') !== String(version)) {
        sessionStorage.setItem('gt.reloadedFor', String(version));
        location.reload();
      }
    } catch { /* offline — try again next time */ }
  }

  /* ---------- Boot ---------- */

  const join = new URLSearchParams(location.hash.slice(1)).get('join');
  if (join) {
    state.pass = join;
    store.set(KEY.pass, join);
    history.replaceState(null, '', location.pathname + location.search);
  }

  $('#resetBtn').hidden = REMOTE;
  if (!state.items) state.items = [];
  render();
  if (!REMOTE) {
    // Demo mode: data.js (not committed) holds a copy of the original sheet.
    const s = document.createElement('script');
    s.src = 'data.js';
    s.onload = () => { if (!state.items.length) { state.items = seedItems(); persist(); render(); } };
    document.head.appendChild(s);
  }

  if (REMOTE) {
    setSync('busy', 'Connecting…');
    refresh();
    setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    window.addEventListener('online', flush);
  } else {
    setSync('local', 'Demo');
  }

  $('#appVersion').textContent = 'Version ' + APP_VERSION;
  checkForUpdate();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });

  // Test hooks for local debugging.
  window.GT = { state, categorize, parseQty, normalizeCode, stepDelta };
})();
