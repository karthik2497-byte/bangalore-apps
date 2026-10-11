# Thraasu add-item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shop adds items to its list from the phone. The add starts as a search of the whole list, and
a name the list already has can't be added.

**Architecture:**
- Added items are kept apart from the imported list: in localStorage `thraasu_items`, and for a shop
  with an account in the D1 table `items`.
- `buildProducts()` merges them into the list after it loads.
- They sync through the outbox the way prices do, with `shops.items_at` as the change marker (like
  `catalog_at`).
- The duplicate rules are pure functions in `bill-core.js`, shared by the page and its tests.

**Tech Stack:** a single-file PWA (`8_thraasu/index.html`), `bill-core.js`, a Cloudflare Pages Function
over D1, node:sqlite and node:vm tests, and the headless-Chrome smoke suite.

## Global Constraints
- **Spec:** `docs/superpowers/specs/2026-10-11-thraasu-add-item-design.md`.
- **Storage:** localStorage keys are prefixed `thraasu_`, and the SW cache is bumped `thraasu-v8` → `thraasu-v9`.
- **D1 Free plan:** at most 50 queries per invocation, so a list goes in as one parameter through `json_each`.
- **Item id:** `u` plus 10 characters from [A-Za-z0-9]. Server ID regex: `/^[\w-]{1,40}$/`.
- **Item fields:** ml 1–60 characters, en 0–60, cat `/^[\w-]{1,40}$/`, unit kg|l|pc,
  rate in rupees with 0 < rate < 1e7, icon of 16 characters or fewer, and on the server a key of 1–80
  characters. At most 1000 items per shop.
- **Copy:** Malayalam, as in the spec. Touch targets are at least 48 px.
- **Repo rules:** one app per change-set. Commit and push only because Karthik asked ("build it and
  deploy").

---

### Task 1: Duplicate rules and item validation (`bill-core.js`)

**Files:**
- Modify: `8_thraasu/bill-core.js`, by adding `nameKey`, `sameName`, `similar` and `cleanItem` after
  `search`, and extending `cleanBackup`.
- Test: `8_thraasu/test-bill.mjs`.

**Interfaces:**
- Produces:
  - `nameKey(s) → string`
  - `sameName(products, name) → product|null`
  - `similar(products, name, max = 4) → product[]`
  - `cleanItem(x) → {cat, ml, en, unit, rate, icon}|null`
  - `cleanBackup(raw).items → {id: item}`

- [ ] **Step 1: Write the failing tests** (append to `test-bill.mjs`, exporting the new names from the vm)

```js
t('a name\'s key forgives spelling, spaces and case', () => {
  assert.equal(nameKey('Thakkali'), nameKey('takkali'));
  assert.equal(nameKey('thakali'), nameKey('takkali'));
  assert.equal(nameKey('Milky bar'), nameKey('milkybar'));
  assert.notEqual(nameKey('Milkybar 50'), nameKey('Milkybar 30'));
});
t('the same name: Malayalam, English or one search word; never a part of a name', () => {
  assert.equal(sameName(sample.products, 'തക്കാളി')?.id, 'tomato');
  assert.equal(sameName(sample.products, 'TOMATO')?.id, 'tomato');
  assert.equal(sameName(sample.products, 'Thakkali')?.id, 'tomato');
  assert.equal(sameName(sample.products, 'tomat'), null);
  assert.equal(sameName(sample.products, '  '), null);
});
t('similar: whole name first, then its words, at most four, never twice', () => {
  const s = similar(sample.products, 'tomato sauce');
  assert.equal(s[0].id, 'tomato');
  assert.equal(new Set(s.map(p => p.id)).size, s.length);
  assert.ok(similar(sample.products, 'a').length <= 4);
});
t('an added item is checked like a backup entry', () => {
  const ok = { cat: 'veg', ml: ' മിൽക്കിബാർ  50 ', en: 'Milkybar 50', unit: 'pc', rate: 50, icon: '🍪', junk: 1 };
  assert.deepEqual(cleanItem(ok), { cat: 'veg', ml: 'മിൽക്കിബാർ 50', en: 'Milkybar 50', unit: 'pc', rate: 50, icon: '🍪' });
  for (const bad of [null, 'x', { ...ok, ml: '' }, { ...ok, ml: 'x'.repeat(61) }, { ...ok, unit: 'g' }, { ...ok, rate: 0 },
    { ...ok, rate: 1e7 }, { ...ok, rate: '5' }, { ...ok, cat: 'a b' }]) assert.equal(cleanItem(bad), null, JSON.stringify(bad));
  const b = cleanBackup({ app: 'thraasu', kind: 'backup', items: { uAAAAAAAAAA: ok, 'bad id!': ok, uBBBBBBBBBB: { ...ok, unit: 'x' } } });
  assert.deepEqual(Object.keys(b.items), ['uAAAAAAAAAA']);
});
```

- [ ] **Step 2: Run them and check they fail.** Run `node 8_thraasu/test-bill.mjs`. Expected: FAIL (`nameKey is not defined`).

- [ ] **Step 3: Implement** (in `bill-core.js`, after `search`)

```js
// A name's identity for duplicates: search's forgiving spelling, with the spaces gone.
function nameKey(s) { return skeleton(s).replace(/\s+/g, ''); }

// The product that already has this name, or null: its Malayalam or English name, or any one of its
// search words. ponytail: a one-word name can collide with another item's search word ("win" with
// KitKat's "kit cat win"); the add sheet shows which item matched, so a fuller name gets past it.
function sameName(products, name) {
  const k = nameKey(name);
  if (!k) return null;
  return products.find(p => [p.ml, p.en, ...String(p.alias || '').split(/\s+/)].some(n => n && nameKey(n) === k)) || null;
}

// What the add sheet lists under the name: hits for the whole name, then for each word of three or
// more letters, no product twice.
function similar(products, name, max = 4) {
  const out = [];
  for (const q of [name, ...String(name).split(/\s+/).filter(w => skeleton(w).length >= 3)])
    for (const p of search(products, q)) if (out.length < max && !out.includes(p)) out.push(p);
  return out;
}

// An item a shop added on a phone, as kept on the phone, in a backup file and on the server
// (functions/api/thraasu keeps the same rules). Rate in rupees, like products.json.
function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const text = v => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  const ml = text(x.ml), en = text(x.en);
  if (!ml || ml.length > 60 || en.length > 60 || typeof x.cat !== 'string' || !/^[\w-]{1,40}$/.test(x.cat) ||
    !Object.hasOwn(UNITS, x.unit) || typeof x.rate !== 'number' || !(x.rate > 0 && x.rate < 1e7)) return null;
  return { cat: x.cat, ml, en, unit: x.unit, rate: Math.round(x.rate * 100) / 100, icon: typeof x.icon === 'string' ? x.icon.slice(0, 16) : '' };
}
```

`cleanBackup` adds this before its return, and puts `items` in the returned object:

```js
  const items = Object.create(null);
  if (raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items))
    for (const [id, x] of Object.entries(raw.items)) { const c = /^[\w-]{1,40}$/.test(id) && cleanItem(x); if (c) items[id] = c; }
```

- [ ] **Step 4: Run and check they pass.** Run `node 8_thraasu/test-bill.mjs`. Expected: every check passes.

### Task 2: Server items, schema and admin (`functions/api/thraasu/[[path]].js`)

**Files:**
- Modify:
  - `functions/api/thraasu/[[path]].js` (constants, `cleanItem`, and the routes `POST items`,
    `GET items` and `GET state`);
  - `8_thraasu/tools/schema.sql`;
  - `8_thraasu/tools/shop-admin.mjs` (`remove`, `list`).
- Create: `8_thraasu/tools/migrate-items.sql`.
- Test: `8_thraasu/test-sync.mjs`.

**Interfaces:**
- Produces:
  - `POST items {set: {id: {cat, ml, en, unit, rate, icon, key}}, drop: [id]}` → `{ok, dup: [id]}`, or
    413 past 1000 items;
  - `GET items` → `{id: item}`;
  - `GET state` gains `items` (`items_at` or null).

- [ ] **Step 1: Schema.** In `schema.sql`, the shops table gains `items_at INTEGER`. Then add:

```sql
-- Items a shop added on a phone, merged over its list by the app. key: the phone's nameKey of the
-- name, unique per shop so two phones adding the same name end with one item.
CREATE TABLE IF NOT EXISTS items (shop TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (shop, id), UNIQUE (shop, key));
```

`migrate-items.sql` holds the same `CREATE TABLE`, plus `ALTER TABLE shops ADD COLUMN items_at INTEGER;`.

- [ ] **Step 2: Write the failing test**

```js
await t('items: added on a phone, one per name; drop takes its price and photo along', async () => {
  const it = (ml, key, extra = {}) => ({ cat: 'veg', ml, en: '', unit: 'pc', rate: 50, icon: '🍪', key, ...extra });
  let r = await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50'), 'bad id!': it('x', 'x'), uB2: it('', 'y') }, drop: [] } });
  assert.equal(r.status, 200); assert.deepEqual(r.data.dup, []);
  let s = await call('GET', 'state', { token });
  assert.ok(s.data.items > 0);
  assert.deepEqual((await call('GET', 'items', { token })).data, { uA1: { cat: 'veg', ml: 'മിൽക്കിബാർ 50', en: '', unit: 'pc', rate: 50, icon: '🍪' } });
  r = await call('POST', 'items', { token, body: { set: { uC3: it('Milkybar 50', 'milkybar50') } } });   // another phone, same name
  assert.deepEqual(r.data.dup, ['uC3']);
  r = await call('POST', 'items', { token, body: { set: { uA1: it('മിൽക്കിബാർ 50', 'milkybar50', { rate: 55 }) } } });   // its own price change
  assert.deepEqual(r.data.dup, []);
  assert.equal((await call('GET', 'items', { token })).data.uA1.rate, 55);
  await call('POST', 'prices', { token, body: { set: { uA1: 6000 } } });
  await call('PUT', 'photo', { token, body: { id: 'uA1', data: 'data:image/jpeg;base64,/9j/AAAA' } });
  db.queries = 0;
  r = await call('POST', 'items', { token, body: { drop: ['uA1'], set: { uD4: it('Milkybar 50', 'milkybar50') } } });   // dropped, its name is free again
  assert.ok(db.queries <= 8, `items used ${db.queries} queries`);
  assert.deepEqual(r.data.dup, []);
  assert.deepEqual(Object.keys((await call('GET', 'items', { token })).data), ['uD4']);
  s = await call('GET', 'state', { token });
  assert.equal(s.data.prices.uA1, undefined); assert.equal(s.data.photos.uA1, undefined);
  const many = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => ['uM' + i, it('m' + i, 'm' + i)]));
  assert.equal((await call('POST', 'items', { token, body: { set: many } })).status, 413);
});
```

Also add `['POST', 'items'], ['GET', 'items']` to the "every other route needs a session" list.

- [ ] **Step 3: Run it and check it fails.** Run `node 8_thraasu/test-sync.mjs`. Expected: FAIL (404 on `POST items`).

- [ ] **Step 4: Implement.** Add `MAX_ITEMS = 1000` to the constants, then:

```js
// An item a shop added on a phone: the same rules as cleanItem in 8_thraasu/bill-core.js, plus the
// name key the phone sends (its nameKey of the name).
function cleanItem(x) {
  if (!x || typeof x !== 'object') return null;
  const text = v => typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  const ml = text(x.ml), en = text(x.en), key = typeof x.key === 'string' ? x.key : '';
  if (!ml || ml.length > 60 || en.length > 60 || typeof x.cat !== 'string' || !ID.test(x.cat) || !['kg', 'l', 'pc'].includes(x.unit) ||
    typeof x.rate !== 'number' || !(x.rate > 0 && x.rate < 1e7) || !key || key.length > 80) return null;
  return { key, body: JSON.stringify({ cat: x.cat, ml, en, unit: x.unit, rate: Math.round(x.rate * 100) / 100, icon: typeof x.icon === 'string' ? x.icon.slice(0, 16) : '' }) };
}
```

`GET state` selects `items_at` and returns `items: s.items_at ?? null`. New cases:

```js
    case 'POST items': {
      // {set: {id: item}, drop: [ids]}. One item per name: a set whose key another item holds is
      // refused and named in dup, so the phone drops its copy. A dropped item takes its price and photo.
      // ponytail: read, then write; two phones adding one name in the same instant get a 500 and retry into dup.
      const b = await readJson(request);
      const set = Object.entries(b?.set && typeof b.set === 'object' ? b.set : {}).map(([id, x]) => [id, ID.test(id) && cleanItem(x)]).filter(([, x]) => x);
      const drop = (Array.isArray(b?.drop) ? b.drop : []).filter(id => typeof id === 'string' && ID.test(id));
      if (!set.length && !drop.length) return json({ ok: true, dup: [] });
      const held = (await db.prepare('SELECT id, key FROM items WHERE shop = ?').bind(shop).all()).results.filter(r => !drop.includes(r.id));
      const owner = new Map(held.map(r => [r.key, r.id])), keep = {}, dup = [];
      for (const [id, x] of set) {
        const o = owner.get(x.key);
        if (o && o !== id) { dup.push(id); continue; }
        owner.set(x.key, id); keep[id] = x;
      }
      if (new Set([...held.map(r => r.id), ...Object.keys(keep)]).size > MAX_ITEMS) return json({ error: 'too many' }, 413);
      const at = Date.now(), gone = JSON.stringify(drop);
      await db.batch([
        ...['items', 'prices', 'photos'].map(t => db.prepare(`DELETE FROM ${t} WHERE shop = ? AND id IN (SELECT value FROM json_each(?))`).bind(shop, gone)),
        db.prepare("INSERT INTO items (shop, id, body, key, at) SELECT ?, key, json_extract(value, '$.body'), json_extract(value, '$.key'), ? FROM json_each(?) WHERE true ON CONFLICT (shop, id) DO UPDATE SET body = excluded.body, key = excluded.key, at = excluded.at")
          .bind(shop, at, JSON.stringify(keep)),
        db.prepare('UPDATE shops SET items_at = ? WHERE code = ?').bind(at, shop),
      ]);
      return json({ ok: true, dup });
    }
    case 'GET items': {
      const r = await db.prepare('SELECT id, body FROM items WHERE shop = ?').bind(shop).all();
      return json(Object.fromEntries(r.results.map(x => [x.id, JSON.parse(x.body)])));
    }
```

`shop-admin.mjs`:
- `remove` adds `'items WHERE shop'` to the list of deletes.
- `list` adds `(SELECT COUNT(*) FROM items i WHERE i.shop = s.code) AS added`.
- The usage comment for `remove` says "list, added items, stock…".

- [ ] **Step 5: Run it and check it passes.** Run `node 8_thraasu/test-sync.mjs`. Expected: every check passes.

### Task 3: The phone keeps, merges and syncs items (`8_thraasu/index.html`, script)

**Files:**
- Modify: `8_thraasu/index.html`, script section only.

**Interfaces:**
- Consumes: Task 1's `nameKey` and `cleanItem`; Task 2's routes.
- Produces:
  - globals `shopItems` (`{id: item}`) and `list` (the loaded list);
  - `buildProducts()`, `setItem(id, item|null)` and `setRate(p, paise)`;
  - products carry `added: true`.

- [ ] **Step 1: Storage and merge.**
  - Add `ITEMS_KEY = 'thraasu_items'`.
  - Add
    `let shopItems = loadItems()` and
    `function loadItems() { const raw = readJSON(ITEMS_KEY), out = {}; for (const [id, x] of Object.entries(raw && typeof raw === 'object' ? raw : {})) { const c = cleanItem(x); if (c) out[id] = c; } return out; }`.
    It is declared after `readJSON`.
  - `loadCatalog()` stores `list = await fetchCatalog()` and calls `buildProducts()`, which:
    - builds `cats`;
    - merges with
      `validProducts({ categories: list.categories, products: [...(list.products || []), ...Object.entries(shopItems).map(([id, x]) => ({ ...x, id, added: true }))] })`;
    - builds `byId` and `catById`, and sets `samplePrices`;
    - calls `applyPrices()`.
  - `applyPrices` sets `p.mine = p.added || Object.hasOwn(mine, p.id)` and
    `p.rate = Object.hasOwn(mine, p.id) ? mine[p.id] : p.base`, so an added item counts as the shop's
    own price.
- [ ] **Step 2: `setItem` and `setRate`.**
  - `setItem(id, item)`:
    - stores the item, or deletes it when `item` is null;
    - `writeJSON(ITEMS_KEY, shopItems)`;
    - `queue('item', id, item)`;
    - `buildProducts()`, `renderShelf()`, and `renderPrices()` if the price list is open.
  - `setRate(p, paise)` is
    `p.added ? setItem(p.id, { ...shopItems[p.id], rate: paise / 100 }) : setMine(p, paise)`. It is used
    by `commit()` and by `priceChanged()`.
- [ ] **Step 3: Outbox and sync.**
  - `freshOutbox` gains `items: {}`, and `pending()` counts its keys.
  - `queue('item')` sets `outbox.items[id] = value`.
  - In `sync()`, after the prices push:

```js
      const sentItems = { ...outbox.items };
      if (Object.keys(sentItems).length) {
        const set = {}, drop = [];
        for (const [id, x] of Object.entries(sentItems)) x ? set[id] = { ...x, key: nameKey(x.ml) } : drop.push(id);
        const r = await api('items', { method: 'POST', body: JSON.stringify({ set, drop }) });
        if (!r.ok) throw new Error(r.status);
        for (const id in sentItems) if (outbox.items[id] === sentItems[id]) delete outbox.items[id];
        writeJSON(OUTBOX_KEY, outbox);
        for (const id of (await r.json()).dup || []) {   // another phone added this name first: keep theirs
          const x = shopItems[id]; delete shopItems[id]; writeJSON(ITEMS_KEY, shopItems);
          if (x) toast(`${x.ml} ഇതിനകം ഉണ്ട്`);
        }
      }
```

  After the state pull:

```js
      let itemsChanged = false;
      if (st.items !== (synced.items ?? null)) {
        const g = await api('items');
        if (!g.ok) throw new Error(g.status);
        shopItems = {};
        for (const [id, x] of Object.entries(await g.json())) { const c = cleanItem(x); if (c) shopItems[id] = c; }
        for (const [id, x] of Object.entries(outbox.items)) if (x) shopItems[id] = x; else delete shopItems[id];   // not sent yet
        writeJSON(ITEMS_KEY, shopItems); itemsChanged = true;
      }
```

  - `synced` stores `items: st.items`.
  - The end of the sync becomes
    `if (listChanged) await loadCatalog(); else { if (itemsChanged) buildProducts(); else applyPrices(); }`.
- [ ] **Step 4: Account edges.**
  - `login()` queues the phone's items: `for (const [id, x] of Object.entries(shopItems)) queue('item', id, x)`.
  - `signOut(true)` sets `shopItems = {}` and `writeJSON(ITEMS_KEY, null)`.
  - The `storage` event handles `ITEMS_KEY` with
    `shopItems = loadItems(); buildProducts(); renderShelf(); if (pricesEl.open) renderPrices();`.
- [ ] **Step 5: Backup.**
  - `backupFile()` adds `items: shopItems`.
  - `restoreBackup` merges each item not already held whose name is new to the list:
    `if (!shopItems[id] && !sameName(products, x.ml)) { shopItems[id] = x; queue('item', id, x); }`.
    Then it writes the items, calls `buildProducts()`, and the message counts the items.
- [ ] **Step 6: Syntax check.** Extract the inline script and run `node --check`.

### Task 4: The add sheet, entry points, price list and undo (`8_thraasu/index.html`)

**Files:**
- Modify: `8_thraasu/index.html` (CSS, the `#addSheet` dialog markup, script) and
  `8_thraasu/service-worker.js` (`thraasu-v9`).
- Test: `scripts/browser/tests/thraasu.mjs`.

**Interfaces:**
- Consumes: Task 1's `sameName` and `similar`, and Task 3's `setItem` and `shopItems`.
- Produces: `openAdd(name, catId)`, `renderAdd()`, `saveAdd()` and `removeItem(id)`. `undo` becomes a
  closure.

- [ ] **Step 1: Write the failing browser checks.** Add a phase after the price-list phase, using the
  frozen sample list:
  1. The veg category head shows "16 ഇനങ്ങൾ" and `#addHere`. Tapping it opens `#addSheet` with veg
     picked, unit kg and Add disabled.
  2. Typing "Thakkali":
     - the hint shows;
     - `#addDetails` is hidden;
     - the single found row is tomato with class `same`;
     - Add is disabled;
     - tapping the row opens tomato's quantity sheet.
  3. Typing "tomato sauce":
     - no hint;
     - tomato is listed;
     - the details show;
     - with price 30 and unit എണ്ണം, Add is enabled.
     - Saving closes the sheet, puts a new `u…` id in `shopItems` with ml "tomato sauce", shows the tile
       in veg with class `fresh`, and toasts "ചേർത്തു".
  4. The second name check: name "ടൊമാറ്റോ സോസ്" and other name "Tomato sauce" give ml in Malayalam.
  5. A counter search for "qwxy" has no result. `#addFound` opens the sheet with name "qwxy" and no
     category; Add stays disabled until a category is picked.
  6. The price list:
     - the added row reads "നിങ്ങൾ ചേർത്തത്" and has `[data-drop]`;
     - changing its price changes `shopItems[id].rate`;
     - ✕ removes it with a toast, and `#toastUndo` brings it back.
  7. After a reload, the added item is still in `products`.
  8. In the sync phase:
     - an item added while logged in reaches `server.items`;
     - a server `dup` answer removes it from the phone;
     - an item added on another phone, coming down through `items_at`, appears.
  9. The backup carries the items.

  Clean up afterwards with `localStorage.removeItem('thraasu_items'); shopItems = {}; buildProducts();`.

- [ ] **Step 2: Run them and check they fail.** Run `bash scripts/browser-smoke.sh`. Expected: the new
  thraasu checks fail.
- [ ] **Step 3: CSS.** Add `.cat-head`, `.add-pill`, `.add-body`, `.field.big`, `.found`, `.row.same`,
  `.details`, `.cats`, `.cat-chip`, `.unit-price`, `.money`, `#addUnit button`, `.price .drop`,
  `.price small.added` and `.prod.fresh`, as drawn in the mockup.
- [ ] **Step 4: Markup.** Add the `#addSheet` dialog:
  - `#addForm` holds `#addName` (autofocus), `#addHint`, `#found` (`#foundHead` and `#foundList`) and
    `#addDetails`:
    - `#addCats`;
    - `#addUnit`, with `data-unit` kg/l/pc;
    - `#addRate` and `#addPer`;
    - `#addEn`.
  - `#addSave` is the submit button, and `#addClose` closes the sheet.
- [ ] **Step 5: Script.**
  - `renderCategory` adds the head row: the count and the `#addHere` pill.
  - The no-result state of `renderResults` adds `#addFound`.
  - `openAdd`:
    - sets `adding = {cat, unit: cat && unitFor(cat), unitSet: false, from}`;
    - fills the boxes, calls `renderAdd()` and `showModal()`;
    - scrolls the picked chip into view.
  - `renderAdd`:
    - checks the name with `sameName` (the other name too, when filled), and lists `similar`, or the
      one same item;
    - shows the hint, the bad class and the details;
    - sets the chips, the unit and its per-unit word;
    - enables `#addSave` only when the name is new, a category and unit are picked and the rate is
      above 0.
  - `saveAdd`:
    - whichever name has Malayalam letters becomes ml;
    - the id is `'u'` plus 10 characters from `crypto.getRandomValues`;
    - it calls `setItem` and closes the sheet;
    - opened from search, it sets `q` to ml; otherwise it opens or keeps the item's category, then
      scrolls to and flashes the tile;
    - it shows the toast "ചേർത്തു", whose undo removes the item.
  - `removeItem` calls `setItem(id, null)`, re-queues the photo on undo, and toasts "നീക്കി".
  - `undo`:
    - `let undo = null` replaces `undoState`;
    - `removeLine` and `newBill` set closures that restore the bill;
    - `#toastUndo` runs `undo`.
  - `toast()` first moves `#toast` into `topLayer()`, so its undo works over an open dialog.
  - The `popstate` handler also closes `#addSheet`.
  - `service-worker.js` uses `CACHE_NAME = 'thraasu-v9'`.
- [ ] **Step 6: Run all the checks.**
  - `for t in [1-8]_*/test-*.mjs; do node "$t"; done`
  - `bash scripts/browser-smoke.sh`
  - `bash scripts/build-site.sh`

  Expected: all pass.

### Task 5: Deploy and records

- [ ] **Step 1:** Run `npx -y wrangler@4 d1 execute thraasu --remote --file 8_thraasu/tools/migrate-items.sql`.
  The migration goes first, because the live Function reads `items_at`.
- [ ] **Step 2:** Commit, using an explicit `git add` list, then `git push`. Pages deploys.
- [ ] **Step 3:** Poll the live `service-worker.js` until it shows `thraasu-v9`, then run
  `bash scripts/verify-deploy.sh`.
- [ ] **Step 4: Live API check.** With a throwaway shop (`shop-admin.mjs add ZZITEM`):
  - log in;
  - `POST items` an item;
  - a second session's `GET items` sees it;
  - the same key comes back in `dup`;
  - drop it;
  - `remove ZZITEM`.
- [ ] **Step 5: Records.**
  - An EXECUTION_PLAN §0.4 audit row.
  - NEXT_STEPS: the Thraasu line says shops add items from the phone; remove "adding items still goes
    through me".
  - PRODUCT.md capabilities.
  - MISTAKES, only if something cost a retry.
  - A brain log entry and `qmd update`.
  - Commit and push the records.
