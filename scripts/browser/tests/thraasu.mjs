import { readFileSync } from 'node:fs';

const URL_ = 'http://localhost:8811/8_thraasu/index.html';
const SAMPLE = readFileSync(new URL('../fixtures/thraasu-sample.json', import.meta.url), 'utf8');
const narrow = t => t.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
const wideView = t => t.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const ready = t => t.evaluate(async () => { for (let i = 0; i < 50 && !document.querySelector('.cat'); i++) await new Promise(r => setTimeout(r, 100)); });

export default async (t) => {
  await t.send('Emulation.setFocusEmulationEnabled', { enabled: true });   // headless has no window focus: no focus events without this
  // Behaviour runs against the frozen sample list (tomato ₹40/kg …), so a shop's price changes
  // never move these numbers; the real products.json gets its own phase at the end.
  const stub = await t.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const f = window.fetch, body = ${JSON.stringify(SAMPLE)};
    window.fetch = (u, o) => String(u).includes('products.json')
      ? Promise.resolve(new Response(body, { headers: { 'content-type': 'application/json' } })) : f(u, o);
  })();` });
  await narrow(t);
  await t.goto(URL_);
  await ready(t);

  // Shelf, category → product → quantity sheet, both sides of the kg/g toggle.
  const a = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const r = {};
    r.viewport = document.querySelector('meta[name=viewport]').content;
    r.cats = document.querySelectorAll('.cat').length;
    r.sample = !$('samplePill').hidden;
    r.barEmpty = $('billBar').disabled;
    document.querySelector('.cat[data-cat="veg"]').click();
    r.vegTiles = document.querySelectorAll('.prod').length;
    document.querySelector('.prod[data-pid="tomato"]').click();
    r.sheetOpen = $('sheet').open;
    r.default = [$('qtyIn').value, document.querySelector('#unitSeg [aria-pressed=true]').textContent, $('calcAmt').textContent];
    document.querySelector('.chip[data-q="250"]').click();
    r.chip250 = [$('qtyIn').value, $('calcAmt').textContent, $('calcLine').textContent];
    $('qtyIn').value = '0.75'; document.querySelector('#unitSeg [data-big="1"]').click();
    r.kg075 = $('calcAmt').textContent;
    $('qtyIn').value = '750'; document.querySelector('#unitSeg [data-big="0"]').click();
    r.g750 = $('calcAmt').textContent;
    document.querySelector('#unitSeg [data-big="1"]').click();          // "750" now means 750 kg
    r.kg750 = $('calcAmt').textContent;
    $('qtyIn').value = 'abc'; $('qtyIn').dispatchEvent(new Event('input'));
    r.bad = [$('addBtn').disabled, $('qtyHint').hidden, $('qtyHint').textContent];
    $('qtyIn').value = '750'; document.querySelector('#unitSeg [data-big="0"]').click();
    $('addBtn').click();
    r.afterAdd = [$('sheet').open, bill.lines.length, $('bbTotal').textContent, $('bbCount').textContent];
    r.badge = document.querySelector('.prod[data-pid="tomato"] .badge')?.textContent;
    return r;
  });
  t.check('pinch-zoom allowed', !/user-scalable|maximum-scale/.test(a.viewport), a.viewport);
  t.check('8 category tiles', a.cats === 8, a.cats);
  t.check('sample prices are labelled', a.sample);
  t.check('empty bill bar is disabled', a.barEmpty);
  t.check('vegetables shelf has 16 items', a.vegTiles === 16, a.vegTiles);
  t.check('tile opens the quantity sheet', a.sheetOpen);
  t.check('new item defaults to 1 kg = ₹40.00', JSON.stringify(a.default) === '["1","kg","₹40.00"]', a.default);
  t.check('250 g chip = ₹10.00', a.chip250[0] === '250' && a.chip250[1] === '₹10.00' && a.chip250[2] === '250 g × ₹40/kg', a.chip250);
  t.check('0.75 kg = ₹30.00', a.kg075 === '₹30.00', a.kg075);
  t.check('750 g = ₹30.00', a.g750 === '₹30.00', a.g750);
  t.check('toggle reinterprets: 750 kg = ₹30,000.00', a.kg750 === '₹30,000.00', a.kg750);
  t.check('garbage quantity disables Add and says why', a.bad[0] && !a.bad[1] && a.bad[2] === 'ശരിയായ അളവ് നൽകുക', a.bad);
  t.check('added: sheet closed, bar shows ₹30', !a.afterAdd[0] && a.afterAdd[1] === 1 && a.afterAdd[2] === '₹30', a.afterAdd);
  t.check('tile badge shows 750 g', a.badge === '750 g', a.badge);

  // Search: Manglish + Enter, litres, pieces, Malayalam script, no-result state.
  const b = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const type = v => { $('q').value = v; $('q').dispatchEvent(new Event('input')); };
    const r = {};
    type('velichenna');
    r.firstHit = document.querySelector('.row')?.dataset.pid;
    $('q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    r.oilSheet = [$('sheetName').textContent, $('rateUnit').textContent, document.querySelector('#unitSeg [aria-pressed=true]').textContent];
    document.querySelector('.chip[data-q="500"]').click();
    r.oil = $('calcAmt').textContent;
    $('addBtn').click();
    r.cleared = $('q').value === '' && document.activeElement === $('q');
    type('mutta'); document.querySelector('.row').click();
    r.pcSeg = [$('unitSeg').hidden, $('pcSuffix').hidden];
    $('qtyIn').value = '6'; $('qtyIn').dispatchEvent(new Event('input'));
    r.eggs = [$('calcAmt').textContent, $('calcLine').textContent];
    $('qtyIn').value = '2.5'; $('qtyIn').dispatchEvent(new Event('input'));
    r.halfEgg = $('addBtn').disabled;
    $('qtyIn').value = '6'; $('qtyIn').dispatchEvent(new Event('input'));
    $('addBtn').click();
    type('തക്കാളി'); r.ml = document.querySelector('.row')?.dataset.pid;
    type('qwxy'); r.none = document.querySelector('.state b')?.textContent;
    type('');
    return r;
  });
  t.check('Manglish "velichenna" finds coconut oil first', b.firstHit === 'coconutoil', b.firstHit);
  t.check('Enter opens the top hit in litres', JSON.stringify(b.oilSheet) === '["വെളിച്ചെണ്ണ","/ L","L"]', b.oilSheet);
  t.check('500 ml of ₹380/L = ₹190.00', b.oil === '₹190.00', b.oil);
  t.check('after a search add, the box is cleared and focused for the next item', b.cleared);
  t.check('pieces: no kg/g toggle, count suffix', b.pcSeg[0] && !b.pcSeg[1], b.pcSeg);
  t.check('6 eggs = ₹42.00', b.eggs[0] === '₹42.00' && b.eggs[1] === '6 × ₹7', b.eggs);
  t.check('no half eggs', b.halfEgg);
  t.check('Malayalam script search', b.ml === 'tomato', b.ml);
  t.check('no-result state names the query', /qwxy/.test(b.none || ''), b.none);

  // Counter-speed guards: focus selects the prefill, "250" on the kg side means grams,
  // and a toggle set by hand is never overridden.
  const g = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const type = v => { $('qtyIn').value = v; $('qtyIn').dispatchEvent(new Event('input')); };
    const side = () => document.querySelector('#unitSeg [aria-pressed=true]').textContent;
    const r = {};
    $('q').value = 'carrot'; $('q').dispatchEvent(new Event('input'));
    document.querySelector('.row').click();
    $('qtyIn').focus();
    await new Promise(r => setTimeout(r, 50));
    r.selected = [$('qtyIn').selectionStart, $('qtyIn').selectionEnd, $('qtyIn').value.length];
    type('250'); r.auto = [side(), $('calcAmt').textContent];
    document.querySelector('#unitSeg [data-big="1"]').click();
    type('300'); r.hand = [side(), $('calcAmt').textContent];
    const box = el => { const b = el.getBoundingClientRect(); return Math.min(Math.round(b.width), Math.round(b.height)); };
    r.sheetTargets = { close: box($('sheetClose')), rate: box($('rateIn')), chip: box(document.querySelector('.chip')), seg: box(document.querySelector('#unitSeg button')) };
    $('sheet').close();
    $('q').value = ''; $('q').dispatchEvent(new Event('input'));
    return r;
  });
  t.check('focusing the quantity box selects the prefill', g.selected[0] === 0 && g.selected[1] === g.selected[2] && g.selected[2] > 0, g.selected);
  t.check('typed 250 on the kg side becomes 250 g = ₹15.00', g.auto[0] === 'g' && g.auto[1] === '₹15.00', g.auto);
  t.check('a hand-set kg toggle wins: 300 kg = ₹18,000.00', g.hand[0] === 'kg' && g.hand[1] === '₹18,000.00', g.hand);
  t.check('sheet controls are ≥48 px', Object.values(g.sheetTargets).every(v => v >= 48), g.sheetTargets);

  // Edit a line from the bill: rate override, then totals, discount, round-off.
  const c = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const r = {};
    $('billBar').click();
    r.open = $('bill').classList.contains('open') && $('counter').inert;
    document.querySelector('[data-edit="0"]').click();
    r.editMode = [$('addBtn').textContent, $('removeBtn').hidden, $('qtyIn').value, document.querySelector('#unitSeg [aria-pressed=true]').textContent];
    $('rateIn').value = '50'; $('rateIn').dispatchEvent(new Event('input'));
    r.override = $('calcAmt').textContent;
    $('addBtn').click();
    r.lines = bill.lines.length;
    r.sub = $('sumSub').textContent; r.round = $('sumRound').textContent; r.total = $('sumTotal').textContent;
    $('discount').focus(); $('discount').value = '20'; $('discount').dispatchEvent(new Event('input'));
    r.disc = [$('sumRound').textContent, $('sumTotal').textContent, $('bbTotal').textContent];
    $('discount').value = '9999'; $('discount').dispatchEvent(new Event('input')); $('discount').blur(); $('discount').dispatchEvent(new Event('change'));
    r.clamp = [$('discount').value, $('sumTotal').textContent];
    $('discount').value = '20'; $('discount').dispatchEvent(new Event('input')); $('discount').dispatchEvent(new Event('change'));
    $('shopName').value = 'ഗീത സ്റ്റോഴ്സ്'; $('shopName').dispatchEvent(new Event('input'));
    return r;
  });
  t.check('bill bar opens the bill layer, shelf inert', c.open);
  t.check('tapping a line edits it (Update + Remove, 750 g)', c.editMode[0] === 'ബിൽ പുതുക്കുക' && !c.editMode[1] && c.editMode[2] === '750' && c.editMode[3] === 'g', c.editMode);
  t.check('rate override: 750 g × ₹50 = ₹37.50', c.override === '₹37.50', c.override);
  t.check('edit replaces, not duplicates', c.lines === 3, c.lines);
  t.check('₹269.50 rounds to ₹270 (+₹0.50)', c.sub === '₹269.50' && c.round === '+₹0.50' && c.total === '₹270', [c.sub, c.round, c.total]);
  t.check('₹20 discount → ₹250, bar follows', c.disc[1] === '₹250' && c.disc[2] === '₹250', c.disc);
  t.check('discount clamps to the subtotal', c.clamp[0] === '269.5' && c.clamp[1] === '₹0', c.clamp);

  // Persistence across reload, history: a reload never reopens the layer.
  await t.reload(); await ready(t);
  const d = await t.evaluate(() => ({
    lines: bill.lines.length, disc: bill.discount, shop: document.getElementById('shopName').value,
    open: document.getElementById('bill').classList.contains('open'), total: document.getElementById('bbTotal').textContent,
    keys: Object.keys(localStorage),
  }));
  t.check('bill, discount and shop name survive reload', d.lines === 3 && d.disc === 2000 && d.shop === 'ഗീത സ്റ്റോഴ്സ്' && d.total === '₹250', d);
  t.check('reload lands on the counter, not the bill layer', !d.open);
  t.check('every storage key is namespaced', d.keys.every(k => k.startsWith('thraasu_')), d.keys);

  const sz = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const out = {};
    const m = (k, el) => { const b = el.getBoundingClientRect(); out[k] = Math.min(Math.round(b.width), Math.round(b.height)); };
    $('q').value = 'x'; $('q').dispatchEvent(new Event('input')); m('clear', $('clearQ'));
    $('q').value = ''; $('q').dispatchEvent(new Event('input'));
    m('lineX', document.querySelector('.line-x')); m('discount', $('discount')); m('newBill', $('newBill'));
    m('billClose', $('billClose')); m('undo', $('toastUndo')); m('share', $('shareBtn')); m('home', $('homeBtn')); m('pill', $('samplePill'));
    if (!$('backBtn')) document.querySelector('.cat').click();   // a reload restores the open category
    m('back', $('backBtn'));
    return out;
  });
  await t.sleep(200);
  t.check('counter and bill controls are ≥48 px', Object.values(sz).every(v => v >= 48), sz);

  const im = await t.evaluate(async () => {
    products.find(p => p.id === 'tomato').img = 'icon-192.svg';
    products.find(p => p.id === 'onion').img = 'img/missing.webp';
    const veg = document.querySelector('.cat[data-cat="veg"]');
    if (veg) veg.click(); else renderShelf();
    await new Promise(r => setTimeout(r, 800));
    const r = { tomato: !!document.querySelector('[data-pid="tomato"] .ph img'), onion: !!document.querySelector('[data-pid="onion"] .ph img'),
      onionEmoji: document.querySelector('[data-pid="onion"] .ph').textContent };
    return r;
  });
  await t.sleep(200);
  t.check('a photo named in products.json shows on the tile', im.tomato, im);
  t.check('a missing photo falls back to the emoji', !im.onion && im.onionEmoji === '🧅', im);

  // Back button closes the bill layer.
  await t.evaluate(() => document.getElementById('billBar').click());
  await t.evaluate(() => history.back());
  await t.sleep(300);
  t.check('Android back closes the bill layer', await t.evaluate(() => !document.getElementById('bill').classList.contains('open') && !document.getElementById('counter').inert));

  // Print: the receipt alone, file named after the bill.
  const p = await t.evaluate(() => {
    let titleAtPrint = null;
    window.print = () => { titleAtPrint = document.title; dispatchEvent(new Event('beforeprint')); dispatchEvent(new Event('afterprint')); };   // as Chrome does
    document.getElementById('printBtn').click();
    return { titleAtPrint, receipt: document.getElementById('receipt').textContent };
  });
  await t.send('Emulation.setEmulatedMedia', { media: 'print' });
  const pm = await t.evaluate(() => ({
    receipt: getComputedStyle(document.getElementById('receipt')).display,
    counter: getComputedStyle(document.getElementById('counter')).display,
    bill: getComputedStyle(document.getElementById('bill')).display,
  }));
  await t.send('Emulation.setEmulatedMedia', { media: '' });
  t.check('print names the PDF Thraasu-Bill-0001', p.titleAtPrint === 'Thraasu-Bill-0001', p.titleAtPrint);
  t.check('receipt has shop, sample label, lines, discount, total', /ഗീത സ്റ്റോഴ്സ്/.test(p.receipt) && /വെളിച്ചെണ്ണ/.test(p.receipt) && /കിഴിവ്−₹20.00/.test(p.receipt) && /ആകെ₹250/.test(p.receipt) && /sample prices/.test(p.receipt), p.receipt.slice(0, 200));
  t.check('print media shows only the receipt', pm.receipt === 'block' && pm.counter === 'none' && pm.bill === 'none', pm);

  // Share: the bill as a 576 px PNG through the share sheet (Print, WhatsApp, Files), the
  // route to a printer where window.print() does nothing (Firefox Focus on iPhone). Print
  // itself must stay a plain window.print().
  const sh = await t.evaluate(async () => {
    const shared = [];
    let prints = 0;
    window.print = () => { prints++; };
    navigator.canShare = () => true;
    navigator.share = async d => { shared.push(d.files[0]); };
    document.getElementById('shareBtn').click();
    const f = shared[0], img = await createImageBitmap(f);
    return { prints, n: shared.length, name: f.name, type: f.type, w: img.width, h: img.height };
  });
  t.check('Share sends a 576 px PNG named after the bill, without printing', sh.n === 1 && sh.prints === 0 && sh.name === 'Thraasu-Bill-0001.png' && sh.type === 'image/png' && sh.w === 576 && sh.h > 400, sh);

  // Remove + undo, new bill + undo.
  const u = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const r = {};
    document.querySelector('[data-remove="1"]').click();
    r.removed = [bill.lines.length, $('toast').classList.contains('show')];
    $('toastUndo').click();
    r.undone = bill.lines.length;
    $('newBill').click();
    r.fresh = [bill.lines.length, $('billNo').textContent, $('bbCount').textContent];
    $('toastUndo').click();
    r.back = [bill.lines.length, $('billNo').textContent];
    return r;
  });
  t.check('✕ removes a line with an undo toast', u.removed[0] === 2 && u.removed[1], u.removed);
  t.check('undo restores it', u.undone === 3, u.undone);
  t.check('new bill: empty, number 0002', u.fresh[0] === 0 && u.fresh[1] === '0002', u.fresh);
  t.check('undo brings bill 0001 back', u.back[0] === 3 && u.back[1] === '0001', u.back);

  // Wide screens: the bill is a side column, no bar.
  await wideView(t); await t.sleep(200);
  const w = await t.evaluate(() => ({
    bar: getComputedStyle(document.getElementById('billBar')).display,
    bill: getComputedStyle(document.getElementById('bill')).visibility,
    x: Math.round(document.getElementById('bill').getBoundingClientRect().left),
  }));
  t.check('≥900 px: bill is a visible side column, bar hidden', w.bar === 'none' && w.bill === 'visible' && w.x >= 800, w);

  // The shop's own prices: the pill opens the list; a price typed there replaces the sample
  // rate on the shelf, is stored and can be reset; a rate changed in the quantity sheet can
  // be kept; the receipt says "sample prices" only while a billed line used one.
  const pr = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
    const tomato = () => document.querySelector('#priceList .price[data-pid="tomato"]');
    const r = {};
    localStorage.removeItem('thraasu_prices'); mine = loadPrices(); applyPrices();   // an earlier rate edit was kept
    cat = null; renderShelf();
    r.pill0 = [$('samplePill').tagName, $('pillText').textContent];
    $('samplePill').click();
    r.open = [pricesEl.open, document.querySelectorAll('#priceList .price').length];
    tomato().querySelector('input').value = '50'; fire(tomato().querySelector('input'), 'change');
    r.set = [tomato().classList.contains('mine'), $('pillText').textContent, localStorage.getItem('thraasu_prices'), byId.get('tomato').rate];
    tomato().querySelector('input').value = 'abc'; fire(tomato().querySelector('input'), 'change');
    r.bad = [tomato().querySelector('input').value, byId.get('tomato').rate];
    $('pq').value = 'thak'; fire($('pq'), 'input');
    r.search = [...document.querySelectorAll('#priceList .price')].map(x => x.dataset.pid);
    pricesEl.close();
    openCat('veg');
    r.tile = document.querySelector('.prod[data-pid="tomato"] .rate').textContent;
    $('samplePill').click(); tomato().querySelector('button.reset').click(); pricesEl.close();
    r.reset = [byId.get('tomato').rate, localStorage.getItem('thraasu_prices'), $('pillText').textContent];
    document.querySelector('.prod[data-pid="onion"]').click();
    r.keep0 = $('keepRow').hidden;
    $('rateIn').value = '52'; fire($('rateIn'), 'input');
    r.keep1 = !$('keepRow').hidden && $('keepRate').checked;
    $('addBtn').click();
    const onion = bill.lines.find(l => l.pid === 'onion');
    r.kept = [byId.get('onion').rate, onion.rate, onion.sample];
    const flags = bill.lines.map(l => l.sample);
    r.metaMixed = receiptData().meta.length;
    bill.lines.forEach(l => { l.sample = false; });
    r.metaOwn = receiptData().meta.length;
    bill.lines.forEach((l, i) => { l.sample = flags[i]; });
    localStorage.removeItem('thraasu_prices'); mine = loadPrices(); applyPrices(); renderShelf();   // back to sample prices
    return r;
  });
  t.check('price pill is a button that opens all 68 prices', pr.pill0[0] === 'BUTTON' && pr.pill0[1] === 'മാതൃകാ വിലകൾ' && pr.open[0] && pr.open[1] === 68, pr);
  t.check('a price typed in the list becomes the shop price', pr.set[0] && pr.set[1] === 'സ്വന്തം വില 1/68' && pr.set[2] === '{"tomato":5000}' && pr.set[3] === 5000 && pr.tile === '₹50 / kg', pr);
  t.check('a non-price entry puts the old price back', pr.bad[0] === '50' && pr.bad[1] === 5000, pr.bad);
  t.check('price list search takes Manglish', pr.search[0] === 'tomato', pr.search);
  t.check('reset returns to the sample price', pr.reset[0] === 4000 && pr.reset[1] === '{}' && pr.reset[2] === 'മാതൃകാ വിലകൾ', pr.reset);
  t.check('a rate typed in the sheet can be kept as the shop price', pr.keep0 && pr.keep1 && pr.kept.join() === '5200,5200,false', pr);
  t.check('receipt says sample prices only while a billed line used one', pr.metaMixed === 2 && pr.metaOwn === 1, pr);

  // The logo goes home: out of a category and out of a search, back to the grid.
  const home = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    history.replaceState({ cat: null }, ''); cat = null; renderShelf();   // a clean entry under the category
    openCat('veg');
    $('q').value = 'thak'; renderShelf();
    $('homeBtn').click();
    await new Promise(r => setTimeout(r, 300));
    return { q: $('q').value, cats: document.querySelectorAll('.cat').length, state: history.state && history.state.cat, name: $('homeBtn').getAttribute('aria-label') };
  });
  t.check('tapping the logo returns to the category grid', home.q === '' && home.cats === 8 && !home.state && home.name.startsWith('ത്രാസ്'), home);

  // Offline shell: the worker precached under its own prefix.
  const sw = await t.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      const k = (await caches.keys()).find(k => k.startsWith('thraasu-'));
      if (k && (await (await caches.open(k)).keys()).length >= 7) return k;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  });
  t.check('service worker precached thraasu-v5', sw === 'thraasu-v5', sw);

  // ---- The shop's real list, products.json as served (the fixture stub comes off): it loads
  // whole, every photo loads under the CSP, a product without a photo offers the camera, and a
  // photo taken on the phone replaces the placeholder and survives a reload.
  await t.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: stub.identifier });
  await t.reload(); await ready(t);
  const real = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const data = await (await fetch('./products.json')).json();
    const all = [...data.categories, ...data.products].filter(x => x.img).map(x => x.img);
    const bad = (await Promise.all([...new Set(all)].map(src => new Promise(r => {
      const i = new Image(); i.onload = () => r(i.naturalWidth ? null : src); i.onerror = () => r(src); i.src = './' + src;
    })))).filter(Boolean);
    const controlled = !!navigator.serviceWorker.controller;
    await fetch('./img/tomato.webp');
    let cached = false;
    for (let i = 0; i < 20 && !cached; i++) { await new Promise(r => setTimeout(r, 100)); cached = !!(await caches.match('./img/tomato.webp')); }
    cat = null; renderShelf();
    const r = { want: [data.products.length, data.categories.length], got: [products.length, document.querySelectorAll('.cat').length],
      n: all.length, bad, controlled, cached, catPhotos: document.querySelectorAll('.cat .ph img').length,
      pill: $('pillText').textContent, receiptSample: receiptData().meta.some(m => /sample/.test(m)) };
    const bare = products.find(p => !p.img);
    openCat(bare.cat);
    const cam = document.querySelector(`.slot [data-photo="${bare.id}"]`);
    r.bare = [!!cam, document.querySelector(`[data-pid="${bare.id}"] .ph`).textContent === bare.icon, cam && Math.round(cam.getBoundingClientRect().height)];
    const c = document.createElement('canvas'); c.width = 600; c.height = 300;
    c.getContext('2d').fillRect(0, 0, 600, 300);
    await setPhoto(bare.id, new File([await new Promise(res => c.toBlob(res, 'image/png'))], 'shelf.png', { type: 'image/png' }));
    const im = document.querySelector(`[data-pid="${bare.id}"] .ph img`);
    r.after = [!!im && im.src.startsWith('data:image/jpeg'), !document.querySelector(`[data-photo="${bare.id}"]:not(.pan-btn)`)];
    r.id = bare.id;
    return r;
  });
  t.check('the shop list loads whole', real.got.join() === real.want.join(), real);
  t.check('every photo in products.json loads under the CSP', real.n > 100 && real.bad.length === 0, { n: real.n, bad: real.bad });
  t.check('every category tile carries its photo', real.catPhotos === real.want[1], real.catPhotos);
  t.check('a viewed photo is cached for offline', real.controlled && real.cached, real);
  t.check('real prices: no sample label on the pill or the receipt', real.pill === 'വിലകൾ' && !real.receiptSample, real.pill);
  t.check('a product without a photo shows its emoji and a 48 px camera button', real.bare[0] && real.bare[1] && real.bare[2] >= 48, real.bare);
  t.check('a photo added on the phone replaces the placeholder', real.after.every(Boolean), real.after);
  await t.reload(); await ready(t);
  const kept = await t.evaluate(async id => {
    for (let i = 0; i < 30 && !photos.has(id); i++) await new Promise(r => setTimeout(r, 100));
    return (photos.get(id) || '').slice(0, 15);
  }, real.id);
  t.check('the shop photo survives a reload', kept === 'data:image/jpeg', kept);
};
