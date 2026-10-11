// Thraasu billing maths: pure functions, no DOM, no storage.
// Loaded by index.html (<script src>) and by test-bill.mjs (node:vm), so the page
// and its tests can never disagree about what a bill adds up to.
// Money is integer paise. Quantity is an integer count of g, ml or pieces.

const UNITS = {
  kg: { per: 1000, small: 'g',  big: 'kg', presets: [100, 250, 500, 1000, 2000] },
  l:  { per: 1000, small: 'ml', big: 'L',  presets: [100, 250, 500, 1000, 2000] },
  pc: { per: 1,    small: 'എണ്ണം', big: null, presets: [1, 2, 3, 5, 10] },
};
const MAX_QTY = 1000000; // 1000 kg, 1000 L or a million pieces: past this it is a typo

// ₹40/kg × 250 g = ₹10.00. Rounds once per line, to the nearest paisa.
function lineAmount(ratePaise, qty, unit) {
  return Math.round(ratePaise * qty / UNITS[unit].per);
}

// What the shopkeeper typed → base units. `big` is the kg / L side of the toggle,
// so the toggle reinterprets the typed number: "250" is 250 g or 250 kg.
// Returns 0 for anything that is not a positive, plausible amount.
function parseQty(text, unit, big) {
  const n = Number(String(text).trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (unit === 'pc') return Number.isInteger(n) && n <= MAX_QTY ? n : 0;
  const q = Math.round(big ? n * 1000 : n);
  return q > 0 && q <= MAX_QTY ? q : 0;
}

// Rupees typed into a rate or discount box → paise; null when it is not a sum.
function parseMoney(text) {
  const n = Number(String(text).trim());
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) : null;
}

// 250 g · 1.25 kg · 500 ml · 1 L · 3 എണ്ണം. `bare` drops the piece word (preset chips).
function fmtQty(qty, unit, bare = false) {
  const u = UNITS[unit];
  if (unit === 'pc') return bare ? String(qty) : `${qty} ${u.small}`;
  return qty >= u.per ? `${qty / u.per} ${u.big}` : `${qty} ${u.small}`;
}

// ₹1,23,456.50 in Indian grouping. `short` drops a ".00" (rates, rounded totals).
function fmtMoney(paise, short = false) {
  const whole = paise % 100 === 0;
  const digits = short && whole ? 0 : 2;
  return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Discount is clamped to the subtotal; the bill is rounded to the nearest rupee
// (50 paise rounds up) and the round-off is shown, as on a printed shop bill.
function totals(lines, discountPaise = 0) {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l.rate, l.qty, l.unit), 0);
  const discount = Math.min(Math.max(0, Math.round(discountPaise) || 0), subtotal);
  const net = subtotal - discount;
  const total = Math.round(net / 100) * 100;
  return { subtotal, discount, roundOff: total - net, total };
}

// Manglish has no fixed spelling: thakkali, takkali and thakali all mean tomato.
// Dropping every 'h' and collapsing doubled letters maps them to one skeleton.
function skeleton(s) {
  return String(s).toLowerCase().normalize('NFC').replace(/h/g, '').replace(/(.)\1+/gu, '$1').trim();
}

// Ranked: a name that starts with the query, then a word that does, then a substring.
// Ties keep price-list order.
function search(products, query) {
  const q = skeleton(query).replace(/\s+/g, '');
  if (!q) return [];
  const hits = [];
  for (const p of products) {
    let best = 0;
    for (const name of [p.ml, p.en, ...String(p.alias || '').split(/\s+/)]) {
      const words = skeleton(name).split(/\s+/).filter(Boolean);
      const whole = words.join('');
      const s = whole.startsWith(q) ? 3 : words.some(w => w.startsWith(q)) ? 2 : whole.includes(q) ? 1 : 0;
      if (s > best) best = s;
    }
    if (best) hits.push([best, p]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map(h => h[1]);
}

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

// A counter types grams as "250" and kilos as "1.5". On the kg / L side a whole number
// of 50 or more is almost always grams, so the box switches sides unless the toggle was
// set by hand. ponytail: one fixed threshold; a 50 kg sack needs the toggle. Per-item
// thresholds (from the rate, say) if that ever bites.
function autoSmall(text, unit, big) {
  const n = Number(String(text).trim());
  return big && unit !== 'pc' && Number.isInteger(n) && n >= 50;
}

// Optional product photo: a relative path inside this app folder, nothing that can leave it.
function safeImg(path) {
  return typeof path === 'string' && /^(?:[\w-]+\/)*[\w-]+\.(?:webp|png|jpe?g|svg)$/i.test(path) ? path : '';
}

// The shop's own prices as saved on this phone: { productId: paise }. A corrupted or
// hand-edited entry is dropped rather than billed. Null prototype: ids are data, not keys
// that could reach Object.prototype.
function cleanPrices(raw) {
  const out = Object.create(null);
  if (raw && typeof raw === 'object' && !Array.isArray(raw))
    for (const [id, v] of Object.entries(raw)) if (Number.isInteger(v) && v > 0 && v < 1e9) out[id] = v;
  return out;
}

// A backup file, checked before any of it reaches the phone: prices as cleanPrices, photos
// only as data: images (jpeg/png/webp, under 300 KB) under a plain product id, a short name.
function cleanBackup(raw) {
  if (!raw || typeof raw !== 'object' || raw.app !== 'thraasu' || raw.kind !== 'backup') return null;
  const photos = Object.create(null);
  if (raw.photos && typeof raw.photos === 'object' && !Array.isArray(raw.photos))
    for (const [id, url] of Object.entries(raw.photos))
      if (/^[\w-]{1,40}$/.test(id) && typeof url === 'string' && url.length < 3e5 && /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) photos[id] = url;
  const items = Object.create(null);
  if (raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items))
    for (const [id, x] of Object.entries(raw.items)) { const c = /^[\w-]{1,40}$/.test(id) && cleanItem(x); if (c) items[id] = c; }
  return { shop: typeof raw.shop === 'string' ? raw.shop.trim().slice(0, 60) : '', prices: cleanPrices(raw.prices), photos, items };
}

// products.json is hand-edited: drop any row the bill maths cannot price.
function validProducts(data) {
  const cats = new Set(((data && data.categories) || []).map(c => c && c.id));
  const seen = new Set();
  return ((data && data.products) || []).filter(p =>
    p && typeof p.id === 'string' && !seen.has(p.id) && seen.add(p.id) &&
    cats.has(p.cat) && Object.hasOwn(UNITS, p.unit) && typeof p.ml === 'string' && p.ml.trim() &&
    typeof p.rate === 'number' && Number.isFinite(p.rate) && p.rate > 0);
}
