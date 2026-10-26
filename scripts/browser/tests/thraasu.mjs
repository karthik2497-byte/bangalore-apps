import { readFileSync } from 'node:fs';

const URL_ = 'http://localhost:8811/8_thraasu/index.html';
const SAMPLE = readFileSync(new URL('../fixtures/thraasu-sample.json', import.meta.url), 'utf8');
const narrow = t => t.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
const wideView = t => t.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const ready = t => t.evaluate(async () => { for (let i = 0; i < 50 && !document.querySelector('.cat'); i++) await new Promise(r => setTimeout(r, 100)); });
// A trusted Enter key, as the phone keyboard sends it: a synthetic keydown never submits a form.
const enter = async t => {
  await t.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await t.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await t.sleep(50);
};

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
    m('lineX', document.querySelector('.line-x')); m('discount', $('discount')); m('newBill', $('newBill')); m('pay', $('paySeg').firstElementChild);
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

  // Payment (2026-10-24): a bill is finished only with one. With none picked, print, share and പുതിയ ബിൽ wait:
  // the row turns red, says so and takes the focus. Then print: the receipt alone, file named after the bill.
  const p = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    let titleAtPrint = null, prints = 0, shares = 0;
    window.print = () => { prints++; titleAtPrint = document.title; dispatchEvent(new Event('beforeprint')); dispatchEvent(new Event('afterprint')); };   // as Chrome does
    navigator.canShare = () => true; navigator.share = async () => { shares++; };
    openBill();                                              // the buttons live in the bill layer
    $('printBtn').click(); $('shareBtn').click(); $('newBill').click();
    const need = [prints, shares, bill.sold, bill.lines.length, !$('payNeed').hidden, $('payRow').classList.contains('need'), document.activeElement?.dataset.pay];
    $('paySeg').querySelector('[data-pay="upi"]').click();
    const picked = [bill.pay, $('payNeed').hidden, $('payRow').classList.contains('need'), [...$('paySeg').children].map(s => s.getAttribute('aria-pressed')).join()];
    $('printBtn').click();
    closeBill();
    return { need, picked, prints, titleAtPrint, receipt: $('receipt').textContent, day: new Date().toLocaleDateString('en-CA') };
  });
  await t.send('Emulation.setEmulatedMedia', { media: 'print' });
  const pm = await t.evaluate(() => ({
    receipt: getComputedStyle(document.getElementById('receipt')).display,
    counter: getComputedStyle(document.getElementById('counter')).display,
    bill: getComputedStyle(document.getElementById('bill')).display,
  }));
  await t.send('Emulation.setEmulatedMedia', { media: '' });
  t.check('no payment picked: print, share and പുതിയ ബിൽ wait, and the row asks for one', p.need.join() === '0,0,false,3,true,true,cash', p.need);
  t.check('a payment picked clears the ask, and print goes ahead', p.picked.join() === 'upi,true,false,false,true,false' && p.prints === 1, [p.picked, p.prints]);
  t.check('print names the PDF Thraasu-Bill-<date>-0001', p.titleAtPrint === `Thraasu-Bill-${p.day}-0001`, p.titleAtPrint);
  t.check('receipt has shop, sample label, lines, discount, total', /ഗീത സ്റ്റോഴ്സ്/.test(p.receipt) && /വെളിച്ചെണ്ണ/.test(p.receipt) && /കിഴിവ്−₹20.00/.test(p.receipt) && /ആകെ₹250/.test(p.receipt) && /പണംUPI/.test(p.receipt) && /sample prices/.test(p.receipt), p.receipt.slice(0, 200));
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
  t.check('Share sends a 576 px PNG named after the bill, without printing', sh.n === 1 && sh.prints === 0 && sh.name === `Thraasu-Bill-${p.day}-0001.png` && sh.type === 'image/png' && sh.w === 576 && sh.h > 400, sh);

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

  // Kept bills (2026-10-17): every sold bill of today and yesterday stays on this phone; the number goes
  // back to 0001 each morning; a bill's one time is its first item's, in 12-hour time with AM/PM.
  const kb = await t.evaluate(() => {
    const $ = id => document.getElementById(id), r = { saved: localStorage.getItem('thraasu_bill') };
    const at = (h, m, back) => { const d = new Date(); d.setDate(d.getDate() - back); d.setHours(h, m, 0, 0); return d.toISOString(); };
    r.meta = [$('billNo').textContent, $('billDate').textContent, $('billTime').textContent];
    r.receipt = $('receipt').querySelector('.meta').textContent;
    r.kept = JSON.parse(localStorage.getItem('thraasu_bills')).map(b => [b.no, b.lines.length, Object.keys(b.lines[0]).sort().join()]);
    newBill();                                               // 0001 is sold; the next one waits empty, as if since last night
    bill.no = 41; bill.started = at(21, 0, 1);
    openSheet(asItem(byId.get('onion'))); setQty(2000); commit();
    r.second = [billNo(bill.no), bill.started > kept[0].started];
    bill.pay = 'cash';
    newBill();                                               // 0002 sold by പുതിയ ബിൽ
    r.third = [billNo(bill.no), kept.map(b => b.no)];
    r.pays = kept.map(b => b.pay);
    localStorage.setItem('thraasu_bills', JSON.stringify([...kept,     // yesterday's, and one from three days ago
      { id: 'y1', no: 9, started: at(20, 31, 1), discount: 0, lines: [{ ml: 'പഞ്ചസാര', qty: 2000, unit: 'kg', rate: 5900 }] },
      { id: 'old', no: 3, started: at(10, 0, 3), discount: 0, lines: [{ ml: 'പാൽ', qty: 2, unit: 'pc', rate: 2800 }] }]));
    return r;
  });
  t.check('the bill shows its number, date and 12-hour time', kb.meta[0] === '0001' && /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(kb.meta[1]) && /^\d{1,2}:\d{2} [AP]M$/.test(kb.meta[2]), kb.meta);
  t.check('the receipt has the same number, date and time', kb.receipt === `ബിൽ നം. 0001 · ${kb.meta[1]} · ${kb.meta[2]}`, kb.receipt);
  t.check('a sold bill is kept with its receipt fields only', JSON.stringify(kb.kept) === '[[1,3,"ml,qty,rate,sample,unit"]]', kb.kept);
  t.check('the next bill is 0002, timed from its first item', kb.second[0] === '0002' && kb.second[1], kb.second);
  t.check('പുതിയ ബിൽ keeps 0002 and starts 0003', kb.third[0] === '0003' && JSON.stringify(kb.third[1]) === '[2,1]', kb.third);
  t.check('each kept bill keeps how it was paid', kb.pays.join() === 'cash,upi', kb.pays);

  await t.reload(); await ready(t);
  const kl = await t.evaluate(() => {
    const $ = id => document.getElementById(id), r = {};
    r.stored = JSON.parse(localStorage.getItem('thraasu_bills')).map(b => b.id);
    r.bar = [$('billBar').disabled, $('billBar').classList.contains('empty'), $('bbGo').textContent];
    $('billBar').click();                                    // an empty bill: the bar opens the kept bills
    r.open = billsEl.open;
    r.days = [...$('billsList').querySelectorAll('.day h3')].map(h => h.textContent);
    r.rows = [...$('billsList').querySelectorAll('.past-row')].map(b => b.textContent);
    const first = $('billsList').querySelector('.past-row');
    first.click();                                           // the newest, 0002
    r.past = [$('billsTitle').textContent, $('billsSub').textContent, $('pastSlip').querySelector('.meta').textContent, $('pastView').hidden, $('billsList').hidden];
    let title = null; window.print = () => { title = document.title; };
    $('pastPrint').click();
    r.print = [title, $('receipt').querySelector('.meta').textContent];
    r.counter = [bill.no, bill.lines.length, bill.sold];     // printing a kept bill leaves the counter's alone
    billsEl.dispatchEvent(new Event('cancel', { cancelable: true }));   // Esc or Android back: the list again
    r.back = [$('billsList').hidden, billsEl.open, document.activeElement === $('billsList').querySelector('.past-row')];
    $('billsClose').click();
    $('billsBtn').click(); r.door = billsEl.open;
    r.sizes = [$('billsBtn'), $('billsList').querySelector('.past-row'), $('billsClose')].map(el => Math.round(el.getBoundingClientRect().height));
    billsEl.close();
    return r;
  });
  const today = kl.days[0] || '';
  t.check('kept: today\'s two and yesterday\'s one, the three-day-old bill dropped', JSON.stringify(kl.stored.slice(2)) === '["y1"]' && kl.stored.length === 3, kl.stored);
  t.check('an empty bill\'s bar opens the kept bills', !kl.bar[0] && kl.bar[1] && kl.bar[2] === 'ബില്ലുകൾ' && kl.open, [kl.bar, kl.open]);
  t.check('one heading per day, with its count and total', kl.days.length === 2 && /^ഇന്ന് · \d{1,2} [A-Z][a-z]{2}2 ബില്ലുകൾ · ₹/.test(today) && /^ഇന്നലെ · \d{1,2} [A-Z][a-z]{2}1 ബിൽ · ₹118$/.test(kl.days[1]), kl.days);
  t.check('a row: number, time, items, total; newest first', kl.rows.length === 3 && /^നം\. 0002\d{1,2}:\d{2} [AP]M · 1 ഇനംക്യാഷ്₹/.test(kl.rows[0]) && /^നം\. 0001/.test(kl.rows[1]) && kl.rows[2] === 'നം. 00098:31 PM · 1 ഇനം₹118', kl.rows);
  t.check('a row opens that bill as it prints', kl.past[0] === 'ബിൽ നം. 0002' && /^ഇന്ന് · \d{1,2}:\d{2} [AP]M · 1 ഇനം$/.test(kl.past[1]) && /^ബിൽ നം\. 0002 · /.test(kl.past[2]) && !kl.past[3] && kl.past[4], kl.past);
  t.check('printing a kept bill prints it, named by its date', kl.print[0] === `Thraasu-Bill-${p.day}-0002` && kl.print[1] === kl.past[2], kl.print);
  t.check('the counter\'s bill is untouched', JSON.stringify(kl.counter) === '[3,0,false]', kl.counter);
  t.check('back returns to the list, on the row it left', !kl.back[0] && kl.back[1] && kl.back[2], kl.back);
  t.check('the bill head\'s ബില്ലുകൾ opens it too; both ≥48 px', kl.door && kl.sizes.every(v => v >= 48), [kl.door, kl.sizes]);

  // Payment in the bills sheet (2026-10-24): a chip per kind filters both days, each heading counting and totalling
  // what it shows; every row says how it was paid; a kept bill shows its payment and can change it.
  const pf = await t.evaluate(() => {
    const $ = id => document.getElementById(id), r = {};
    openBills();
    const chip = k => $('payFilter').querySelector(`[data-pay="${k}"]`);
    const view = () => [[...$('billsList').querySelectorAll('.past-row .names b')].map(b => b.textContent),
      [...$('billsList').querySelectorAll('.day h3 b, .day .none')].map(e => e.textContent)];
    r.sub = $('billsSub').textContent;
    r.chips = [...$('payFilter').children].map(c => c.textContent + ':' + c.getAttribute('aria-pressed'));
    r.tags = [...$('billsList').querySelectorAll('.past-row')].map(b => b.querySelector('.pay-tag')?.textContent || '-');
    chip('upi').click(); r.upi = view();
    chip('cash').click(); r.cash = view();
    chip('credit').click(); r.credit = view();
    chip('').click(); r.all = view()[0].length;
    chip('upi').click(); billsEl.close(); openBills(); r.reset = $('payFilter').querySelector('[aria-pressed="true"]')?.dataset.pay;
    r.sizes = [...$('payFilter').children].map(c => Math.round(c.getBoundingClientRect().height));
    $('billsList').querySelector('.past-row').click();         // 0002, paid in cash
    r.past = [$('pastPay').querySelector('[aria-pressed="true"]')?.dataset.pay, /പണംക്യാഷ്/.test($('pastSlip').textContent), $('payFilter').hidden, $('pastPayNote').hidden];
    const seg = $('pastPay').querySelector('[data-pay="credit"]');
    seg.focus(); seg.click();
    r.changed = [kept.find(b => b.no === 2).pay, JSON.parse(localStorage.getItem('thraasu_bills')).find(b => b.no === 2).pay, /പണംകടം/.test($('pastSlip').textContent), document.activeElement === seg];
    billsEl.dispatchEvent(new Event('cancel', { cancelable: true }));
    r.tagAfter = $('billsList').querySelector('.past-row .pay-tag')?.textContent;
    billsEl.close();
    return r;
  });
  t.check("logged out, the bills are this phone's", pf.sub === 'ഇന്നും ഇന്നലെയും · ഈ ഫോണിൽ', pf.sub);
  t.check('chips: എല്ലാം picked, then ക്യാഷ്, UPI, കടം; all ≥48 px', pf.chips.join() === 'എല്ലാം:true,ക്യാഷ്:false,UPI:false,കടം:false' && pf.sizes.every(v => v >= 48), [pf.chips, pf.sizes]);
  t.check('each row says how it was paid; a bill kept before payments says nothing', pf.tags.join() === 'ക്യാഷ്,UPI,-', pf.tags);
  t.check("UPI: only its bills, today's count and total, and yesterday has none of it", JSON.stringify(pf.upi) === JSON.stringify([['നം. 0001'], ['1 ബിൽ · ₹250', 'ഇന്നലെ UPI ബില്ലുകളൊന്നുമില്ല']]), pf.upi);
  t.check('ക്യാഷ് and കടം filter the same way; എല്ലാം shows all three', pf.cash[0].join() === 'നം. 0002' && /^1 ബിൽ · ₹\d/.test(pf.cash[1][0]) && pf.cash[1][1] === 'ഇന്നലെ ക്യാഷ് ബില്ലുകളൊന്നുമില്ല' &&
    JSON.stringify(pf.credit) === JSON.stringify([[], ['ഇന്ന് കടം ബില്ലുകളൊന്നുമില്ല', 'ഇന്നലെ കടം ബില്ലുകളൊന്നുമില്ല']]) && pf.all === 3, [pf.cash, pf.credit, pf.all]);
  t.check('the sheet opens on എല്ലാം again', pf.reset === '', pf.reset);
  t.check('a kept bill shows its payment on the slip and in its toggle; no chips there', pf.past.join() === 'cash,true,true,true', pf.past);
  t.check('changing it saves at once, redraws the slip and keeps the focus', pf.changed.join() === 'credit,credit,true,true' && pf.tagAfter === 'കടം', [pf.changed, pf.tagAfter]);

  // The next morning: today's bills are yesterday's, and the empty bill starts again at 0001.
  await t.evaluate(() => localStorage.setItem('thraasu_bills', JSON.stringify(JSON.parse(localStorage.getItem('thraasu_bills'))
    .filter(b => b.id !== 'y1').map(b => { const d = new Date(b.started); d.setDate(d.getDate() - 1); return { ...b, started: d.toISOString() }; }))));
  await t.reload(); await ready(t);
  const mo = await t.evaluate(() => ({ no: document.getElementById('billNo').textContent, kept: kept.length, next: nextNo() }));
  t.check('the next morning the number starts again at 0001', mo.no === '0001' && mo.kept === 2 && mo.next === 1, mo);
  await t.evaluate(s => { localStorage.setItem('thraasu_bill', s); localStorage.removeItem('thraasu_bills'); }, kb.saved);   // bill 0001 again, for what follows
  await t.reload(); await ready(t);

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

  // Adding an item, one job per step: the name (letter keyboard), the category (only from search), the
  // price (number pad). A name the list has is refused and similar ones only shown; from a category the
  // keyboard's Enter goes from the name straight to the price, and Enter there adds. The new item joins
  // the end of its category, the Malayalam name shows large, it survives a reload, and the price list
  // removes it (with undo).
  const ad1 = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
    const shown = () => ['Name', 'Cat', 'Price'].filter(s => !$('addStep' + s).hidden).join();
    const r = {};
    bill = freshBill(1); saveBill(); renderBill(); hideToast();
    $('q').value = ''; cat = null; renderShelf();
    openCat('veg');
    r.head = [document.querySelector('.cat-head h2')?.textContent, Math.round($('addHere').getBoundingClientRect().height)];
    $('addHere').click();
    r.open = [addEl.open, document.activeElement === $('addName'), shown(), adding.cat, adding.unit, $('addSave').disabled, $('addSave').textContent, $('addBack').hidden];
    type('addName', 'Thakkali');
    r.same = [$('addHint').hidden, $('addOk').hidden, [...$('foundList').children].map(b => b.dataset.open + (b.classList.contains('same') ? '!' : '')).join(), $('addSave').disabled, $('foundHead').textContent];
    $('addForm').requestSubmit();
    r.stuck = shown();
    $('foundList').querySelector('[data-open="tomato"]').click();
    r.opened = [addEl.open, $('sheet').open, $('sheetName').textContent];
    $('sheet').close();
    $('addHere').click();
    type('addName', 'tomato sauce');
    r.similar = [$('addHint').hidden, $('addOk').hidden, $('foundList').children.length, $('foundList').firstElementChild?.dataset.open, $('addSave').disabled];
    $('addName').focus();
    return r;
  });
  t.check('a category shows its count and a 48 px add button above the grid', ad1.head.join() === '16 ഇനങ്ങൾ,48' || (ad1.head[0] === '16 ഇനങ്ങൾ' && ad1.head[1] >= 48), ad1.head);
  t.check('the add sheet opens on the name step, focused, with the category and its usual unit picked', ad1.open.join() === 'true,true,Name,veg,kg,true,അടുത്തത്,true', ad1.open);
  t.check('a name the list has is refused and offered instead (Thakkali = tomato); Next goes nowhere', ad1.same.join('|') === 'false|true|tomato!|true|ഇതേ പേര്' && ad1.stuck === 'Name', [ad1.same, ad1.stuck]);
  t.check('tapping the offered item opens its quantity sheet', ad1.opened.join() === 'false,true,തക്കാളി', ad1.opened);
  t.check('a similar name is shown (3 at most) with a tick, and does not block', ad1.similar[0] === true && ad1.similar[1] === false && ad1.similar[2] >= 1 && ad1.similar[2] <= 3 && ad1.similar[3] === 'tomato' && ad1.similar[4] === false, ad1.similar);
  await enter(t);   // the keyboard's Enter on the name: the category is known, so on to the price
  const ad2 = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
    const shown = () => ['Name', 'Cat', 'Price'].filter(s => !$('addStep' + s).hidden).join();
    const r = {};
    r.price = [shown(), document.activeElement === $('addRate'), $('addTitle').textContent, $('addCatNow').dataset.cat, $('addSave').textContent, $('addSave').disabled, $('addBack').hidden];
    const pc = document.querySelector('#addUnit [data-unit="pc"]'), md = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    pc.dispatchEvent(md); pc.click();
    type('addRate', '30');
    r.ready = [md.defaultPrevented, document.activeElement === $('addRate'), $('addSave').disabled, $('addPer').textContent];
    $('addBack').click();
    r.back = [shown(), document.activeElement === $('addName'), $('addName').value];
    $('addForm').requestSubmit();
    r.forward = [shown(), $('addRate').value, adding.unit];
    $('addRate').focus();
    return r;
  });
  t.check("the keyboard's Enter on the name goes straight to the price, on the number pad", ad2.price.join() === 'Price,true,tomato sauce,veg,പട്ടികയിൽ ചേർക്കുക,true,false', ad2.price);
  t.check('a unit tap keeps the focus on the price; with a price Add is on', ad2.ready.join() === 'true,true,false,ഒന്നിന്', ad2.ready);
  t.check('back returns to the name; Next keeps the price and unit', ad2.back.join() === 'Name,true,tomato sauce' && ad2.forward.join() === 'Price,30,pc', [ad2.back, ad2.forward]);
  await enter(t);   // Enter on the price adds
  const ad = await t.evaluate(() => {
    const $ = id => document.getElementById(id);
    const type = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
    const shown = () => ['Name', 'Cat', 'Price'].filter(s => !$('addStep' + s).hidden).join();
    const r = {};
    const id = Object.keys(shopItems)[0], x = shopItems[id] || {};
    r.saved = [addEl.open, /^u[A-Za-z0-9]{10}$/.test(id), [x.cat, x.ml, x.unit, x.rate].join(), $('toastMsg').textContent];
    const tile = document.querySelector(`.prod[data-pid="${id}"]`);
    r.tile = [!!tile, !!tile?.classList.contains('fresh'), [...document.querySelectorAll('.prod')].pop()?.dataset.pid === id, document.querySelector('.cat-head h2').textContent];
    $('toastUndo').click();
    r.undone = [Object.keys(shopItems).length, !!document.querySelector(`.prod[data-pid="${id}"]`)];
    $('q').value = 'qwxy'; renderShelf();
    $('addFound').click();
    r.fromSearch = [$('addName').value, adding.cat, shown()];
    type('addName', 'Tomato sauce');
    $('addEnOpen').click();
    r.enOpen = [$('addEnField').hidden, $('addEnOpen').hidden, document.activeElement === $('addEn')];
    type('addEn', 'ടൊമാറ്റോ സോസ്');
    $('addForm').requestSubmit();
    r.cat = [shown(), document.activeElement === $('addTitle'), $('addTitle').textContent, $('addSub').textContent, $('addCats').children.length === cats.length, !!$('addCats').querySelector('[aria-pressed="true"]'), $('addFoot').hidden];
    $('addCats').querySelector('[data-cat="veg"]').click();
    r.picked = [shown(), document.activeElement === $('addRate'), adding.cat, adding.unit, $('addTitle').textContent];
    $('addCatNow').click();
    r.change = [shown(), $('addCats').querySelector('[aria-pressed="true"]')?.dataset.cat];
    $('addCats').querySelector('[data-cat="fruit"]').click();
    r.changed = [shown(), adding.cat, adding.steps.join()];
    const esc = new Event('cancel', { cancelable: true });
    addEl.dispatchEvent(esc);
    r.escBack = [esc.defaultPrevented, addEl.open, shown()];
    $('addCats').querySelector('[data-cat="veg"]').click();
    document.querySelector('#addUnit [data-unit="pc"]').click();
    type('addRate', '45');
    $('addSave').click();
    const id2 = Object.keys(shopItems)[0];
    r.ml = [shopItems[id2]?.ml, shopItems[id2]?.en, shopItems[id2]?.cat, $('q').value, !!document.querySelector(`#shelf .row[data-pid="${id2}"]`)];
    $('q').value = ''; renderShelf(); openCat('veg');
    $('addHere').click(); type('addName', 'tomatosauce');
    r.again = [$('addHint').hidden, $('addSave').disabled];
    addEl.close();
    $('samplePill').click();
    const row = () => $('priceList').querySelector(`.price[data-pid="${id2}"]`);
    r.row = [row()?.querySelector('small')?.textContent, !!row()?.querySelector('button:not(.pan-btn)'), $('priceList').querySelectorAll('.drop, [data-drop]').length];
    const inp = row().querySelector('input'); inp.value = '50'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    r.rate = [shopItems[id2].rate, byId.get(id2).rate, (localStorage.getItem('thraasu_prices') || '').includes(id2)];
    $('pickStart').click(); $('priceList').querySelector(`[data-pick="${id2}"]`).click(); $('pickGo').click();
    r.ask1 = [$('dropTitle').textContent, $('dropNames').children.length];
    $('dropYes').click();
    r.dropped = [!!row(), !!shopItems[id2], $('toastMsg').textContent, $('toast').parentElement === pricesEl];
    $('toastUndo').click();
    r.back = [!!row(), shopItems[id2]?.rate];
    pricesEl.close(); hideToast();
    return { ...r, id2 };
  });
  t.check('Enter on the price saves: a new u-id item, toast says so', ad.saved.join('|') === 'false|true|veg,tomato sauce,pc,30|tomato sauce ചേർത്തു', ad.saved);
  t.check('the new tile ends its category, outlined, and the count goes up', ad.tile.join() === 'true,true,true,17 ഇനങ്ങൾ', ad.tile);
  t.check('undo on the toast takes the new item away', ad.undone.join() === '0,false', ad.undone);
  t.check('an empty search offers the add with the typed name and no category', ad.fromSearch.join() === 'qwxy,,Name', ad.fromSearch);
  t.check('+ മറ്റൊരു പേര് opens the second name on the same step, focused', ad.enOpen.join() === 'false,true,true', ad.enOpen);
  t.check('from search Next asks for the category: keyboard down, every category, no button', ad.cat.join() === 'Cat,true,ഏത് വിഭാഗം?,ടൊമാറ്റോ സോസ്,true,false,true', ad.cat);
  t.check('a category tap moves on to the price with that category’s usual unit', ad.picked.join() === 'Price,true,veg,kg,ടൊമാറ്റോ സോസ്', ad.picked);
  t.check('the category chip changes it and comes back to the price', ad.change.join() === 'Cat,veg' && ad.changed.join('|') === 'Price|fruit|name,cat,price', [ad.change, ad.changed]);
  t.check('Esc / Android back goes a step back before it closes', ad.escBack.join() === 'true,true,Cat', ad.escBack);
  t.check('the Malayalam name shows large; from search the new item is the result', ad.ml.join() === 'ടൊമാറ്റോ സോസ്,Tomato sauce,veg,ടൊമാറ്റോ സോസ്,true', ad.ml);
  t.check('the same name typed differently is refused next time', ad.again.join() === 'false,true', ad.again);
  t.check('the price list marks an added item, with no ✕ and no reset on any row', ad.row.join() === 'നിങ്ങൾ ചേർത്തത്,false,0', ad.row);
  t.check("an added item's price is its own rate, not a list override", ad.rate.join() === '50,5000,false', ad.rate);
  t.check('remove mode deletes it, named in the confirmation and the undo toast; undo puts it back',
    ad.ask1.join() === 'ടൊമാറ്റോ സോസ് നീക്കണോ?,1' && ad.dropped.join() === 'false,false,ടൊമാറ്റോ സോസ് നീക്കി,true' && ad.back.join() === 'true,50', [ad.ask1, ad.dropped, ad.back]);
  await t.reload(); await ready(t);
  const adKept = await t.evaluate(id => {
    const r = [byId.get(id)?.ml, byId.get(id)?.added];
    localStorage.removeItem('thraasu_items'); shopItems = {}; buildProducts(); cat = null; renderShelf();
    return r;
  }, ad.id2);
  t.check('an added item survives a reload', adKept.join() === 'ടൊമാറ്റോ സോസ്,true', adKept);

  // A free phone (2026-10-24): the shop sheet says what the account gives and what it costs; one hint in Bills
  // and one in Prices open it, and a ✕ hides a hint for good on this phone.
  const fr = await t.evaluate(async () => {
    const $ = id => document.getElementById(id), r = {};
    localStorage.removeItem('thraasu_hints');
    renderSync(); openBills();
    r.bills = [$('billsNote').hidden, $('billsNote').dataset.kind, $('billsNote').textContent.includes('ഈ ഫോണിലെ ബില്ലുകൾ മാത്രം'), Math.round($('billsNote').querySelector('.note-x').getBoundingClientRect().height)];
    $('billsNote').querySelector('.note-x').click();
    r.closed = [$('billsNote').hidden, localStorage.getItem('thraasu_hints')];
    billsEl.close(); openPrices();
    r.prices = [$('pricesNote').hidden, $('pricesNote').textContent.includes('സ്റ്റോക്ക് എത്ര ബാക്കി?')];
    $('pricesNote').querySelector('.note-go').click();
    r.go = [pricesEl.open, shopEl.open];
    r.offer = [$('offerLine').textContent, $('signedOut').querySelectorAll('.uses li').length, $('loginForm').hidden, $('loginOpen').hidden, $('signupOpen').classList.contains('primary')];
    $('loginOpen').click();
    r.login = [$('loginForm').hidden, $('loginOpen').hidden, document.activeElement.id, $('signupOpen').classList.contains('primary')];
    shopEl.close();
    return r;
  });
  t.check('free: a hint in Bills, with a 48 px ✕ that hides it on this phone', fr.bills.join() === 'false,free,true,48' && fr.closed.join() === 'true,{"bills":1}', [fr.bills, fr.closed]);
  t.check('free: a hint in Prices opens the shop sheet', fr.prices.join() === 'false,true' && fr.go.join() === 'false,true', [fr.prices, fr.go]);
  t.check('free: the shop sheet lists three uses and the offer; register leads, login waits behind its button', fr.offer.join() === '30 ദിവസം സൗജന്യം · പിന്നെ മാസം ₹199,3,true,false,true' && fr.login.join() === 'false,true,shopCode,false', [fr.offer, fr.login]);
  await t.reload(); await ready(t);
  const fr2 = await t.evaluate(() => {
    openBills(); const r = [document.getElementById('billsNote').hidden]; billsEl.close();
    openPrices(); r.push(document.getElementById('pricesNote').hidden); pricesEl.close();
    localStorage.removeItem('thraasu_hints');
    return r;
  });
  t.check('a closed hint stays closed after a reload; the other still shows', fr2.join() === 'true,false', fr2);

  // Sign-up: the form checks before the network; a request shows its code and fills Login;
  // logging in before approval says so.
  const su = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const until = async ok => { for (let i = 0; i < 60 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); };
    const sent = [], realFetch = window.fetch;
    window.fetch = async (u, o = {}) => {
      const url = String(u);
      if (!url.includes('/api/thraasu/')) return realFetch(u, o);
      const route = url.split('/api/thraasu/')[1], body = JSON.parse(o.body);
      const res = (b, status = 200) => new Response(JSON.stringify(b), { status });
      if (route === 'signup') { sent.push(body); return body.mobile === '9000000000' ? res({ error: 'already' }, 409) : res({ code: 'K7M3QX' }); }
      if (route === 'login') return body.pin === '2468' ? res({ error: 'pending' }, 403) : res({ error: 'wrong' }, 401);
      return res({ error: 'nf' }, 404);
    };
    const submit = async (name, mobile, pin, pin2) => {
      $('suName').value = name; $('suMobile').value = mobile; $('suPin').value = pin; $('suPin2').value = pin2;
      $('signupMsg').hidden = true; $('signupForm').requestSubmit();
      await until(() => !$('signupMsg').hidden || $('signupBox').hidden);
      return $('signupMsg').hidden ? '' : $('signupMsg').textContent;
    };
    const r = {};
    $('acctBtn').click();
    r.closed = [$('signupBox').hidden, $('signedOut').hidden, $('reqNote').hidden, Math.round($('signupOpen').getBoundingClientRect().height)];
    $('signupOpen').click();
    r.open = [$('signupBox').hidden, $('signedOut').hidden, document.activeElement.id, $('feeLine').textContent, !!$('signupBox').querySelector('a[href="./privacy.html"]')];
    r.errs = [await submit(' ', '9847012345', '2468', '2468'), await submit('Raju', '12345', '2468', '2468'),
      await submit('Raju', '9847012345', '24', '24'), await submit('Raju', '9847012345', '2468', '2469')];
    r.early = sent.length;
    r.dup = await submit('Raju', '9000000000', '2468', '2468');
    r.ok = await submit('Raju Stores', '+91 98470 12345', '2468', '2468');
    r.after = [sent[sent.length - 1].mobile, $('signupBox').hidden, $('signedOut').hidden, $('reqNote').querySelector('.code')?.textContent,
      $('shopCode').value, JSON.parse(localStorage.getItem('thraasu_signup')).code, $('suName').value];
    $('shopPin').value = '2468'; $('loginForm').requestSubmit();
    await until(() => !$('loginMsg').hidden);
    r.pending = [$('loginMsg').textContent, account];
    localStorage.removeItem('thraasu_signup'); $('shopCode').value = $('shopPin').value = ''; $('loginMsg').hidden = true;
    shopEl.close(); window.fetch = realFetch;
    return r;
  });
  t.check('sign-up opens from the shop sheet: the offer shown, policy linked, 48 px button', su.closed.join() === 'true,false,true,' + su.closed[3] && su.closed[3] >= 48 &&
    su.open.join() === 'false,true,suName,30 ദിവസം സൗജന്യം · പിന്നെ മാസം ₹199,true', su);
  t.check('sign-up checks name, mobile and PIN before the network', su.errs.join('|') === 'കടയുടെ പേര് നൽകുക|ശരിയായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക|പിൻ 4 മുതൽ 8 വരെ അക്കം വേണം|രണ്ടു പിനും ഒന്നല്ല' && su.early === 0, su);
  t.check('a mobile with a request already waiting is told so', su.dup === 'ഈ നമ്പറിൽ ഒരു അപേക്ഷ ഇപ്പോൾത്തന്നെ ഉണ്ട്', su.dup);
  t.check('a request shows its code, fills Login and clears the form', su.ok === '' && su.after.join() === '9847012345,true,false,K7M3QX,K7M3QX,K7M3QX,', su);
  t.check('logging in before approval says it is waiting', su.pending[0] === 'അംഗീകാരം ഇനിയും കിട്ടിയിട്ടില്ല: അംഗീകരിച്ചാൽ ലോഗിൻ ചെയ്യാം' && su.pending[1] === null, su.pending);

  // The shop account against a fake server in the page: login sends up what the phone had and
  // loads the shop's own list; changes go up, another phone's come down; offline they wait;
  // logout waits for them and then leaves nothing behind; a backup file carries and restores.
  const sy = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const until = async ok => { for (let i = 0; i < 60 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); };
    const server = { name: 'Nanma Store', prices: {}, photos: {}, token: null, fail: false, stock: { onion: 3000, tomato: 5000 }, sales: {}, items: {}, itemsAt: null, hidden: new Set(), bills: {}, billsAt: null,
      catalog: { sample: false, categories: [{ id: 'veg', ml: 'പച്ചക്കറി', en: 'Vegetables', icon: '🥬' }], products: [
        { id: 'tomato', cat: 'veg', ml: 'തക്കാളി', en: 'Tomato', icon: '🍅', unit: 'kg', rate: 44 },
        { id: 'onion', cat: 'veg', ml: 'സവാള', en: 'Onion', icon: '🧅', unit: 'kg', rate: 50 },
        { id: 'shallot', cat: 'veg', ml: 'ചെറിയ ഉള്ളി', en: 'Shallots', icon: '🧅', unit: 'kg', rate: 90 }] } };
    const realFetch = window.fetch;
    window.fetch = async (u, o = {}) => {
      const url = String(u);
      if (!url.includes('/api/thraasu/')) return realFetch(u, o);
      if (server.fail) throw new TypeError('Failed to fetch');
      const [route, qs] = url.split('/api/thraasu/')[1].split('?'), m = (o.method || 'GET') + ' ' + route, body = o.body ? JSON.parse(o.body) : null;
      const res = (b, status = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status });
      if (m === 'POST login') return body.code.trim().toUpperCase() === 'NANMA' && body.pin === '482913'
        ? res({ token: server.token = 'a'.repeat(64), shop: { code: 'NANMA', name: server.name } }) : res({ error: 'wrong' }, 401);
      if (o.headers?.authorization !== 'Bearer ' + server.token) return res({ error: 'login' }, 401);
      if (m === 'GET catalog') return res(JSON.stringify(server.catalog));
      if (m === 'GET state') return res({ shop: { code: 'NANMA', name: server.name }, catalog: 1, prices: server.prices,
        photos: Object.fromEntries(Object.entries(server.photos).map(([k, v]) => [k, v.at])), stock: server.stock, items: server.itemsAt, hidden: [...server.hidden], bills: server.billsAt });
      if (m === 'POST hidden') { body.hide.forEach(id => server.hidden.add(id)); body.show.forEach(id => server.hidden.delete(id)); return res({ ok: true }); }
      if (m === 'POST bills') { server.billsAt = Math.max((server.billsAt || 0) + 1, Date.now()); for (const [id, b] of Object.entries(body.bills)) server.bills[id] = { bill: b, at: server.billsAt }; return res({ ok: true }); }
      if (m === 'GET bills') {
        const since = Number(new URLSearchParams(qs).get('since')) || 0;
        return res({ at: server.billsAt, bills: Object.entries(server.bills).filter(([, x]) => x.at > since).map(([id, x]) => ({ id, bill: x.bill })) });
      }
      if (m === 'POST prices') { Object.assign(server.prices, body.set); body.clear.forEach(id => delete server.prices[id]); return res({ ok: true }); }
      if (m === 'POST sales') {
        for (const [k, items] of Object.entries(body.sales)) {
          const was = server.sales[k] || {};
          for (const id of new Set([...Object.keys(was), ...Object.keys(items)])) if (id in server.stock) server.stock[id] -= (items[id] || 0) - (was[id] || 0);
          server.sales[k] = items;
        }
        return res({ ok: true });
      }
      if (m === 'PUT photo') { server.photos[body.id] = { data: body.data, at: Date.now() }; return res({ ok: true, at: server.photos[body.id].at }); }
      if (m === 'GET photos') return res(Object.fromEntries(new URLSearchParams(qs).get('ids').split(',').filter(id => server.photos[id]).map(id => [id, server.photos[id]])));
      if (m === 'POST items') {
        const dup = [];
        for (const [id, x] of Object.entries(body.set)) if (Object.entries(server.items).some(([k, y]) => k !== id && y.key === x.key)) dup.push(id); else server.items[id] = x;
        body.drop.forEach(id => delete server.items[id]); server.itemsAt = Math.max((server.itemsAt || 0) + 1, Date.now());
        return res({ ok: true, dup });
      }
      if (m === 'GET items') return res(Object.fromEntries(Object.entries(server.items).map(([k, { key, ...x }]) => [k, x])));
      if (m === 'PUT shop') { server.name = body.name; return res({ ok: true }); }
      if (m === 'POST logout') { server.token = null; return res({ ok: true }); }
      return res({ error: 'nf' }, 404);
    };
    const r = {};
    const otherPhone = (id, b) => { server.billsAt = Math.max((server.billsAt || 0) + 1, Date.now()); server.bills[id] = { bill: b, at: server.billsAt }; };
    localStorage.removeItem('thraasu_prices'); mine = loadPrices(); applyPrices();
    r.btn = [$('acctBtn').dataset.state, Math.round($('acctBtn').getBoundingClientRect().height)];
    setMine(byId.get('tomato'), 4200);                     // set on the phone before logging in
    hidden.add('gone1');                                   // and an item removed on it
    $('acctBtn').click();
    r.open = shopEl.open && !$('signedOut').hidden;
    $('shopCode').value = 'nanma'; $('shopPin').value = '000000'; $('loginForm').requestSubmit();
    await until(() => !$('loginMsg').hidden);
    r.wrong = [$('loginMsg').textContent, account];
    $('shopPin').value = '482913'; $('loginForm').requestSubmit();
    await until(() => account && synced.at && !syncing);
    r.login = [account?.code, products.length, $('pillText').textContent, server.prices.tomato, $('signedIn').hidden, $('acctBtn').dataset.state, $('shopPin').value];
    r.hideLogin = server.hidden.has('gone1'); server.hidden.delete('gone1');   // the next sync brings that back down too
    setMine(byId.get('onion'), 5500); await sync();
    r.push = [server.prices.onion, pending()];
    server.prices.shallot = 9900; server.photos.onion = { data: 'data:image/jpeg;base64,/9j/AAAA', at: Date.now() };
    await sync();
    r.pull = [mine.shallot, (photos.get('onion') || '').slice(0, 15), byId.get('shallot').rate];
    // Items: one added here goes up; a name another phone took first is dropped here, and theirs comes down.
    setItem('uLOCAL00001', cleanItem({ cat: 'veg', ml: 'കോവക്ക', en: 'Ivy gourd', unit: 'kg', rate: 80, icon: '🥬' })); await sync();
    r.itemUp = [server.items.uLOCAL00001?.ml, server.items.uLOCAL00001?.key === nameKey('കോവക്ക'), pending()];
    server.items.uOTHER00001 = { cat: 'veg', ml: 'Kale', en: '', unit: 'kg', rate: 90, icon: '🥬', key: 'kale' };
    setItem('uLOCAL00002', cleanItem({ cat: 'veg', ml: 'KALE', en: '', unit: 'kg', rate: 95, icon: '🥬' })); await sync();
    r.itemDup = [!!shopItems.uLOCAL00002, byId.get('uOTHER00001')?.ml, $('toastMsg').textContent, pending()];
    // Removing a list item hides it on every phone of the shop; another phone's change comes down.
    dropItems(['shallot']); await sync();
    r.hideUp = [server.hidden.has('shallot'), byId.has('shallot'), pending()];
    server.hidden.delete('shallot'); server.hidden.add('tomato'); await sync();
    r.hideDown = [byId.has('shallot'), byId.has('tomato'), localStorage.getItem('thraasu_hidden')];
    server.hidden.clear(); await sync(); hideToast();
    // Stock: an open bill is not sold; closing it lowers stock, and later changes to it move stock by the difference.
    bill = freshBill(1); saveBill(); renderBill();
    openSheet(asItem(byId.get('onion'))); r.sheetStock = $('sheetStock').hidden ? '' : $('sheetStock').textContent;
    setQty(500); commit();
    r.unsold = [pending(), stockLeft('onion')];
    newBill(); r.noPay = [bill.sold, bill.lines.length, pending()];   // no payment picked: the bill stays open
    bill.pay = 'upi'; const soldId = bill.id;
    newBill(); r.queued = [stockLeft('onion'), pending()];
    await sync(); r.sold = [server.stock.onion, stockLeft('onion'), pending(), Object.keys(server.sales).length];
    r.billUp = [server.bills[soldId]?.bill.pay, server.bills[soldId]?.bill.lines.length, kept.find(b => b.id === soldId)?.pay];
    $('toastUndo').click(); openSheet(asItem(byId.get('onion'))); setQty(1000); commit(); await sync();
    r.edited = server.stock.onion;
    removeLine(0); await sync();
    r.emptied = [server.stock.onion, server.stock.tomato, pending()];
    r.billGone = [server.bills[soldId]?.bill.lines.length, kept.some(b => b.id === soldId)];
    // Bills of the shop's other phones: one comes down and the number series follows it; a payment changed there
    // reaches the counter's bill; a change made here offline wins once sent; an unfinished bill whose number
    // another phone took moves on; a kept bill's view changes the counter's bill too.
    otherPhone('other-1', { id: 'other-1', no: 5, started: new Date().toISOString(), discount: 0, pay: 'credit', lines: [{ ml: 'സവാള', qty: 1000, unit: 'kg', rate: 5000, sample: false }] });
    await sync();
    r.billDown = [kept.find(b => b.id === 'other-1')?.pay, nextNo()];
    bill = freshBill(nextNo()); openSheet(asItem(byId.get('tomato'))); setQty(1000); commit(); bill.pay = 'cash'; markSold(); await sync();
    const mineId = bill.id;
    otherPhone(mineId, { ...server.bills[mineId].bill, pay: 'upi' });
    await sync();
    r.payDown = [bill.pay, kept.find(b => b.id === mineId)?.pay, pending()];
    server.fail = true; bill.pay = 'credit'; saveBill(); await sync();
    server.fail = false; otherPhone(mineId, { ...server.bills[mineId].bill, pay: 'cash' });
    await sync();
    r.localWins = [bill.pay, server.bills[mineId].bill.pay, kept.find(b => b.id === mineId)?.pay];
    openBills(); r.subIn = $('billsSub').textContent;
    showPast(mineId); $('pastPay').querySelector('[data-pay="upi"]').click();
    r.pastCounter = [bill.pay, outbox.bills[mineId]?.pay, $('pastPayNote').hidden];
    billsEl.close(); await sync(); await sync();          // the sync the sheet started, then the change
    bill = freshBill(nextNo()); openSheet(asItem(byId.get('tomato'))); setQty(500); commit();   // unfinished
    const n0 = bill.no;
    otherPhone('taken', { id: 'taken', no: n0, started: new Date().toISOString(), discount: 0, pay: 'cash', lines: [{ ml: 'ഉപ്പ്', qty: 1, unit: 'pc', rate: 2000, sample: false }] });
    await sync();
    r.renumber = [n0, bill.no, bill.sold];
    openPrices(); r.row = $('priceList').querySelector('[data-pid="onion"] small')?.textContent; pricesEl.close();
    bill = freshBill(1); saveBill(); renderBill(); hideToast();
    server.fail = true; setMine(byId.get('onion'), 5600); await sync();
    r.offline = [pending(), $('acctBtn').dataset.state];
    r.blocked = [!!(await logout()), !!account];
    server.fail = false; await sync();
    r.back = [server.prices.onion, pending(), $('acctBtn').dataset.state];
    let shared = null; navigator.canShare = () => true; navigator.share = async d => { shared = d.files[0]; };
    hidden.add('shallot');                                 // as if removed here: the backup carries it
    $('backupBtn').click();
    const backup = JSON.parse(await shared.text());
    hidden.delete('shallot');
    r.backup = [backup.app, backup.prices.onion, !!backup.photos.onion, shared.name.startsWith('thraasu-backup-'), !!backup.items.uOTHER00001, backup.hidden.join()];
    r.logout = await logout();
    await until(() => products.length > 10);   // the template list again
    r.out = [account, Object.keys(mine).length, photos.size, products.length, $('acctBtn').dataset.state, localStorage.getItem('thraasu_session')];
    r.keptOut = [kept.length, localStorage.getItem('thraasu_bills')];
    await restoreBackup(JSON.stringify(backup));
    r.restored = [mine.onion, photos.has('onion'), byId.get('uOTHER00001')?.ml, [...hidden].join()];
    await restoreBackup('{"app":"other"}');
    r.junk = $('backupMsg').textContent;
    localStorage.removeItem('thraasu_prices'); mine = loadPrices(); photos.clear(); await idb('readwrite', st => st.clear());
    localStorage.removeItem('thraasu_items'); shopItems = {}; localStorage.removeItem('thraasu_hidden'); hidden = new Set(); buildProducts();
    applyPrices(); renderShelf(); shopEl.close(); window.fetch = realFetch;
    return r;
  });
  t.check('shop button: 48 px, "this phone only" until login', sy.btn[0] === 'out' && sy.btn[1] >= 48 && sy.open, sy);
  t.check('a wrong PIN says so and stays logged out', sy.wrong[0] === 'കോഡ് അല്ലെങ്കിൽ പിൻ തെറ്റാണ്' && sy.wrong[1] === null, sy.wrong);
  t.check("login loads the shop's own list and sends up what the phone had", sy.login.join() === 'NANMA,3,വിലകൾ,4200,false,ok,', sy.login);
  t.check('a price changed on the phone reaches the shop', sy.push.join() === '5500,0', sy.push);
  t.check("another phone's price and photo come down", sy.pull.join() === '9900,data:image/jpeg,9900', sy.pull);
  t.check('stock shows in the quantity sheet and the price list', sy.sheetStock === 'സ്റ്റോക്ക് 3 kg' && sy.row === 'പട്ടിക ₹50 · സ്റ്റോക്ക് 3 kg', [sy.sheetStock, sy.row]);
  t.check('an open bill is not sold: nothing goes to the shop', sy.unsold.join() === '0,3000', sy.unsold);
  t.check('a closed bill lowers stock on the phone at once, on the server at sync', sy.queued.join() === '2500,2' && sy.sold.join() === '2500,2500,0,1', sy);
  t.check('without a payment പുതിയ ബിൽ leaves the bill open', sy.noPay.join() === 'false,1,0', sy.noPay);
  t.check('a sold bill reaches the shop with its payment', sy.billUp.join() === 'upi,1,upi', sy.billUp);
  t.check('emptied after printing, the bill is removed there and here', sy.billGone.join() === '0,false', sy.billGone);
  t.check("another phone's bill comes down, and the next number follows it", sy.billDown.join() === 'credit,6', sy.billDown);
  t.check("a payment changed on another phone reaches the counter's bill", sy.payDown.join() === 'upi,upi,0', sy.payDown);
  t.check('a change made offline wins over the server copy once sent', sy.localWins.join() === 'credit,credit,credit', sy.localWins);
  t.check("logged in, the bills are the shop's; a kept bill's view changes the counter's bill", sy.subIn === 'ഇന്നും ഇന്നലെയും · കടയിലെ എല്ലാ ഫോണിലും' && sy.pastCounter.join() === 'upi,upi,false', [sy.subIn, sy.pastCounter]);
  t.check('an unfinished bill whose number another phone took moves to the next', sy.renumber[1] === sy.renumber[0] + 1 && sy.renumber[2] === false, sy.renumber);
  t.check('an edit after closing moves stock by the difference; emptying the bill puts it back', sy.edited === 2000 && sy.emptied.join() === '3000,5000,0', sy);
  t.check('offline, the change waits on the phone', sy.offline.join() === '1,wait', sy.offline);
  t.check('logout refuses while a change is unsent', sy.blocked.join() === 'true,true', sy.blocked);
  t.check('back online, the waiting change goes up', sy.back.join() === '5600,0,ok', sy.back);
  t.check('an item added on the phone reaches the shop', sy.itemUp.join() === 'കോവക്ക,true,0', sy.itemUp);
  t.check("a name another phone added first: theirs comes down, this phone's copy goes", sy.itemDup.join() === 'false,Kale,KALE ഇതിനകം ഉണ്ട്,0', sy.itemDup);
  t.check('login sends up what the phone had removed', sy.hideLogin === true, sy.hideLogin);
  t.check('a removed list item reaches the shop and leaves this phone', sy.hideUp.join() === 'true,false,0', sy.hideUp);
  t.check("another phone's removal comes down, and so does its putting one back", sy.hideDown.join() === 'true,false,["tomato"]', sy.hideDown);
  t.check('backup file carries prices, photos, added and removed items', sy.backup.join() === 'thraasu,5600,true,true,true,shallot', sy.backup);
  t.check('logout leaves nothing of the shop on the phone', sy.logout === '' && sy.out.join() === ',0,0,68,out,', sy.out);
  t.check("logout leaves none of the shop's bills on the phone", sy.keptOut.join() === '0,', sy.keptOut);
  t.check('a backup file restores; anything else is refused', sy.restored.join() === '5600,true,Kale,shallot' && sy.junk === 'ഇത് ത്രാസ് ബാക്കപ്പ് ഫയൽ അല്ല', sy);

  // A shop account with a date (2026-10-24): the server says when it ends; past it, 402 and the phone carries on
  // alone with 5 more bills and 5 new products; a renewal brings everything back; logging out is the way to go free.
  const pz = await t.evaluate(async () => {
    const $ = id => document.getElementById(id);
    const until = async ok => { for (let i = 0; i < 60 && !ok(); i++) await new Promise(r => setTimeout(r, 50)); };
    const srv = window.__srv = { paid: Date.now() + 20 * 864e5, paused: false, calls: 0, token: null, stock: { onion: 3000 },
      catalog: { sample: false, categories: [{ id: 'veg', ml: 'പച്ചക്കറി', en: 'Vegetables', icon: '🥬' }], products: [
        { id: 'tomato', cat: 'veg', ml: 'തക്കാളി', en: 'Tomato', icon: '🍅', unit: 'kg', rate: 44 },
        { id: 'onion', cat: 'veg', ml: 'സവാള', en: 'Onion', icon: '🧅', unit: 'kg', rate: 50 },
        { id: 'shallot', cat: 'veg', ml: 'ചെറിയ ഉള്ളി', en: 'Shallots', icon: '🧅', unit: 'kg', rate: 90 }] } };
    window.__realFetch = window.__realFetch || window.fetch;
    window.fetch = async (u, o = {}) => {
      const url = String(u);
      if (!url.includes('/api/thraasu/')) return window.__realFetch(u, o);
      const [route] = url.split('/api/thraasu/')[1].split('?'), m = (o.method || 'GET') + ' ' + route;
      const res = (b, status = 200) => new Response(typeof b === 'string' ? b : JSON.stringify(b), { status });
      srv.calls++;
      if (m === 'POST login') return res({ token: srv.token = 'b'.repeat(64), shop: { code: 'NANMA', name: 'Nanma Store' } });
      if (o.headers?.authorization !== 'Bearer ' + srv.token) return res({ error: 'login' }, 401);
      if (m === 'POST logout') { srv.token = null; return res({ ok: true }); }
      if (srv.paused) return res({ error: 'paused', until: srv.paid }, 402);
      if (m === 'GET catalog') return res(JSON.stringify(srv.catalog));
      if (m === 'GET state') return res({ shop: { code: 'NANMA', name: 'Nanma Store' }, catalog: 1, prices: {}, photos: {}, stock: srv.stock, items: null, hidden: [], bills: null, paid: srv.paid });
      if (m === 'GET bills') return res({ at: null, bills: [] });
      return res({ ok: true, dup: [], at: Date.now() });
    };
    const r = {};
    localStorage.removeItem('thraasu_signup');
    await login('NANMA', '482913');
    r.in = [account?.code, synced.paid === srv.paid, products.length, stockLeft('onion')];
    srv.paused = true; srv.paid = Date.now() - 3600e3;
    await sync();
    r.paused = [account.paused === srv.paid, JSON.stringify(account.grace), stockLeft('onion'), syncError];
    await loadCatalog(); r.ownList = [products.length, byId.has('shallot')];
    srv.calls = 0; setMine(byId.get('onion'), 5700); await new Promise(res => setTimeout(res, 1800));
    r.noTimer = [srv.calls, pending() > 0];
    for (let i = 0; i < 5; i++) { bill = freshBill(nextNo()); openSheet(asItem(byId.get('tomato'))); setQty(500); commit(); bill.pay = 'cash'; markSold(); }
    r.fiveBills = [account.grace.bills, blocked('bills')];
    bill = freshBill(nextNo()); saveBill(); renderBill();
    openSheet(asItem(byId.get('tomato'))); r.sixth = [sheetEl.open, shopEl.open]; shopEl.close();
    account.grace.bills = 4; openSheet(asItem(byId.get('tomato'))); setQty(500); commit(); account.grace.bills = 5;
    openSheet(asItem(byId.get('onion'))); r.started = sheetEl.open; sheetEl.close();   // a bill already started still takes items
    account.grace.items = 4;
    openAdd('കോവക്ക', 'veg'); $('addForm').requestSubmit(); $('addRate').value = '80'; $('addForm').requestSubmit();
    r.fifthItem = [account.grace.items, blocked('items'), Object.values(shopItems).some(x => x.ml === 'കോവക്ക')];
    openAdd('വെണ്ട', 'veg'); r.addBlocked = [addEl.open, shopEl.open]; shopEl.close(); hideToast();
    await syncing;                                         // the sync the shop sheet started, still paused
    srv.paused = false; srv.paid = Date.now() + 30 * 864e5;
    await sync();
    r.renewed = [account.paused, account.grace, pending(), stockLeft('onion')];
    srv.paused = true; srv.paid = Date.now() - 1000; await sync();
    setMine(byId.get('onion'), 5800);
    r.lo1 = [await logout(), !!account];
    r.lo2 = [await logout(), account];
    await until(() => products.length > 10);
    bill = freshBill(1); saveBill(); renderBill();
    return r;
  });
  t.check('an account carries its date; stock counts while paid', pz.in[0] === 'NANMA' && pz.in[1] && pz.in[2] === 3 && pz.in[3] === 3000, pz.in);
  t.check('a 402 pauses the phone: grace starts at 0/0, stock counts hide', pz.paused.join() === 'true,{"bills":0,"items":0},,paused', pz.paused);
  t.check("paused, the phone keeps the shop's own list, not the template", pz.ownList.join() === '3,true', pz.ownList);
  t.check('paused, a change waits on the phone and starts no sync timer', pz.noTimer.join() === '0,true', pz.noTimer);
  t.check('5 bills sold while paused use the grace; the first item of a 6th opens the shop sheet', pz.fiveBills.join() === '5,true' && pz.sixth.join() === 'false,true', [pz.fiveBills, pz.sixth]);
  t.check('a bill already started still takes items', pz.started === true, pz.started);
  t.check('the 5th new product is added; the 6th opens the shop sheet', pz.fifthItem.join() === '5,true,true' && pz.addBlocked.join() === 'false,true', [pz.fifthItem, pz.addBlocked]);
  t.check('renewed: paused and grace clear, changes go up, stock counts again', pz.renewed[0] == null && pz.renewed[1] == null && pz.renewed[2] === 0 && pz.renewed[3] !== null, pz.renewed);
  t.check('paused with unsent changes, logout asks for a second tap, then goes free', pz.lo1[0].includes('ഒന്നുകൂടി തൊട്ടാൽ ലോഗൗട്ട്') && pz.lo1[1] === true && pz.lo2.join() === ',', [pz.lo1, pz.lo2]);

  // What the account box and the bills sheet say: days left, the last 5 days, paused with the grace left.
  const pu = await t.evaluate(async () => {
    const $ = id => document.getElementById(id), srv = window.__srv;
    srv.paused = false; srv.paid = Date.now() + 3.5 * 864e5;
    await login('NANMA', '482913');
    const r = {};
    openShop(); await syncing;
    r.ending = [$('planLine').dataset.state, $('planLine').textContent.includes('3 ദിവസം ബാക്കി'), !!$('signedIn').querySelector('a[href="./privacy.html#delete"]'), $('acctBtn').dataset.state];
    shopEl.close(); openBills(); await syncing;
    r.strip = [$('billsNote').hidden, $('billsNote').dataset.kind, $('billsNote').textContent.includes('കാലാവധി 3 ദിവസം കൂടി'), $('billsNote').textContent.includes('₹199'), !$('billsNote').querySelector('.note-x')];
    $('billsNote').querySelector('.note-go').click(); r.go = [billsEl.open, shopEl.open]; shopEl.close(); await syncing;
    srv.paid = Date.now() + 20 * 864e5; await sync(); openBills(); await syncing; r.calm = $('billsNote').hidden; billsEl.close();
    srv.paused = true; srv.paid = Date.now() - 1000; await sync();
    openShop(); await syncing;
    r.paused = [$('planLine').dataset.state, $('planLine').textContent.includes('കഴിഞ്ഞു'), $('pausedNote').hidden, $('graceLine').textContent, $('renewLine').textContent, $('syncNow').textContent, $('shopSub').textContent, $('acctBtn').dataset.state];
    shopEl.close(); openBills(); await syncing;
    r.billsPaused = [$('billsNote').dataset.kind, $('billsNote').textContent.includes('സിങ്ക് നിർത്തിവെച്ചു'), $('billsSub').textContent.endsWith('സിങ്ക് നിർത്തിവെച്ചു')];
    billsEl.close();
    account.grace = { bills: 5, items: 2 }; renderSync(); r.used = $('graceLine').textContent;
    srv.paused = false; srv.paid = Date.now() + 30 * 864e5; await sync();
    r.out = [await logout(), account];
    window.fetch = window.__realFetch;
    bill = freshBill(1); saveBill(); renderBill();
    return r;
  });
  t.check('3 days left: a brass account line, a delete-account link', pu.ending.join() === 'ending,true,true,ok', pu.ending);
  t.check('the last days show in the bills sheet, with the price, no ✕, and open the shop sheet', pu.strip.join() === 'false,end,true,true,true' && pu.go.join() === 'false,true' && pu.calm === true, [pu.strip, pu.go, pu.calm]);
  t.check('paused: the box says so, with the grace left, the renewal line and check-again', pu.paused.join('|') === 'over|true|false|ഈ ഫോണിൽ: ഇനി 5 ബിൽ കൂടി · 5 പുതിയ സാധനം കൂടി|തുടരാൻ മാസം ₹199 · ഞങ്ങൾ വിളിക്കും|വീണ്ടും നോക്കുക|സിങ്ക് നിർത്തിവെച്ചു · ഈ ഫോണിൽ സൂക്ഷിക്കുന്നു|paused', pu.paused);
  t.check('paused: the bills sheet strip and subtitle say sync stopped', pu.billsPaused.join() === 'end,true,true', pu.billsPaused);
  t.check('a used-up grace says what waits for the renewal', pu.used === 'ഈ ഫോണിൽ: പുതിയ ബിൽ പുതുക്കിയ ശേഷം · 3 പുതിയ സാധനം കൂടി', pu.used);
  t.check('renewed, the shop logs out cleanly', pu.out.join() === ',', pu.out);

  // Removing items (2026-10-17, option A): no ✕ on any row; one button at the foot turns the price boxes into
  // ticks; tick any number (search keeps them), one red button, one confirmation, undo. Logged out here.
  const rm = await t.evaluate(async () => {
    const $ = id => document.getElementById(id), wait = ms => new Promise(res => setTimeout(res, ms)), r = {};
    const pressed = () => [...$('priceList').querySelectorAll('.pick[aria-pressed="true"]')].map(b => b.dataset.pick).sort().join();
    const search = v => { $('pq').value = v; $('pq').dispatchEvent(new Event('input')); };
    setItem('uDROP000001', cleanItem({ cat: 'veg', ml: 'കോവക്ക', en: 'Ivy gourd', unit: 'kg', rate: 80, icon: '🥬' }));
    openPrices(); await wait(300);
    r.normal = [$('priceList').querySelectorAll('.drop, [data-drop]').length, $('pickStart').hidden, $('pickBtns').hidden];
    $('priceList').querySelector('input').focus(); r.footTyping = getComputedStyle($('pricesFoot')).display; $('priceList').querySelector('input').blur();
    $('pickStart').click();
    r.pick = [$('pricesTitle').textContent, $('pricesSub').textContent, $('priceList').querySelectorAll('input').length,
      $('priceList').querySelectorAll('.pick').length === products.length, $('pickGo').disabled];
    $('priceList').querySelector('[data-pick="tomato"]').click();
    search('ivy'); $('priceList').querySelector('[data-pick="uDROP000001"]').click();
    search(''); $('priceList').querySelector('[data-pick="onion"]').click();
    r.ticked = [pressed(), $('pricesSub').textContent, $('pickGo').textContent.trim(), $('pickGo').disabled];
    $('pickGo').click();
    r.ask = [$('dropConfirm').open, $('dropTitle').textContent, [...$('dropNames').children].map(li => li.lastChild.textContent).join('|'),
      $('dropBody').textContent.includes('ഈ ഫോണിൽ നിന്ന് മാറും'), document.activeElement === $('dropNo')];
    $('dropNo').click();
    r.no = [$('dropConfirm').open, pressed(), byId.has('tomato')];
    $('pickGo').click(); $('dropYes').click();
    r.yes = [$('dropConfirm').open, picking, $('pricesTitle').textContent, byId.has('tomato'), byId.has('onion'), !!shopItems.uDROP000001,
      localStorage.getItem('thraasu_hidden'), $('toastMsg').textContent, $('priceList').querySelectorAll('.pick').length];
    pricesEl.close();
    $('q').value = 'thakkali'; $('q').dispatchEvent(new Event('input'));
    r.shelf = !!document.querySelector('#shelf [data-pid="tomato"]');
    $('q').value = ''; $('q').dispatchEvent(new Event('input'));
    $('toastUndo').click();
    r.undo = [byId.has('tomato'), byId.has('onion'), byId.get('uDROP000001')?.ml, localStorage.getItem('thraasu_hidden')];
    openPrices(); $('pickStart').click(); $('priceList').querySelector('[data-pick="tomato"]').click();
    pricesEl.dispatchEvent(new Event('cancel', { cancelable: true }));     // Esc or Android back: out of remove mode first
    r.cancel = [picking, pricesEl.open, $('pricesTitle').textContent, $('priceList').querySelectorAll('input').length > 0];
    $('pickStart').click(); $('priceList').querySelector('[data-pick="tomato"]').click(); $('pickGo').click(); $('dropYes').click();
    r.sizes = [$('pickStart'), $('priceList').querySelector('.price')].map(el => Math.round(el.getBoundingClientRect().height));
    pricesEl.close(); hideToast();
    return r;
  });
  t.check('price list: no ✕ on any row, one remove button at the foot', rm.normal.join() === '0,false,true', rm.normal);
  t.check('the foot hides while a price is typed', rm.footTyping === 'none', rm.footTyping);
  t.check('remove mode: ticks for price boxes, a new title, the red button off at none',
    rm.pick.join() === 'നീക്കേണ്ടവ തൊടുക,ഒന്നും തിരഞ്ഞെടുത്തിട്ടില്ല,0,true,true', rm.pick);
  t.check('ticks survive a search; the count and the button follow', rm.ticked.join() === 'onion,tomato,uDROP000001,3 എണ്ണം തിരഞ്ഞെടുത്തു,3 എണ്ണം നീക്കുക,false', rm.ticked);
  t.check('one confirmation names them, says this phone, starts on വേണ്ട', rm.ask.join() === 'true,3 സാധനങ്ങൾ നീക്കണോ?,തക്കാളി|കോവക്ക|സവാള,true,true', rm.ask);
  t.check('വേണ്ട keeps the ticks and the items', rm.no.join() === 'false,onion,tomato,uDROP000001,true', rm.no);
  t.check('നീക്കുക: list items hidden, the added one deleted, back to prices, undo offered',
    rm.yes.join() === 'false,,വിലയും ഫോട്ടോയും,false,false,false,["tomato","onion"],3 സാധനങ്ങൾ നീക്കി,0', rm.yes);
  t.check('a removed item is gone from the shelf search', rm.shelf === false);
  t.check('undo puts all three back', rm.undo.join() === 'true,true,കോവക്ക,[]', rm.undo);
  t.check('Esc / Android back leaves remove mode before it closes the list', rm.cancel.join() === ',true,വിലയും ഫോട്ടോയും,true', rm.cancel);
  t.check('the remove button and the rows are ≥48 px', rm.sizes.every(v => v >= 48), rm.sizes);
  await t.reload(); await ready(t);
  const rmKept = await t.evaluate(() => [byId.has('tomato'), localStorage.getItem('thraasu_hidden'), byId.has('uDROP000001')]);
  t.check('a removed item stays off after a reload', rmKept.join() === 'false,["tomato"],true', rmKept);
  await t.evaluate(() => { localStorage.removeItem('thraasu_hidden'); localStorage.removeItem('thraasu_items'); });   // the full list again for what follows
  await t.reload(); await ready(t);

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
  const CACHE = readFileSync(new URL('../../../8_thraasu/service-worker.js', import.meta.url), 'utf8').match(/CACHE_NAME = '([^']+)'/)[1];
  t.check(`service worker precached ${CACHE}`, sw === CACHE, sw);

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
  t.check('the public list is the labelled template until a shop logs in', real.pill === 'മാതൃകാ വിലകൾ', real.pill);
  t.check('a product without a photo shows its emoji and a 48 px camera button', real.bare[0] && real.bare[1] && real.bare[2] >= 48, real.bare);
  t.check('a photo added on the phone replaces the placeholder', real.after.every(Boolean), real.after);
  await t.reload(); await ready(t);
  const kept = await t.evaluate(async id => {
    for (let i = 0; i < 30 && !photos.has(id); i++) await new Promise(r => setTimeout(r, 100));
    return (photos.get(id) || '').slice(0, 15);
  }, real.id);
  t.check('the shop photo survives a reload', kept === 'data:image/jpeg', kept);

  // Every sheet, at its tallest, fits small and tall phones and a phone with the keyboard up (360x420):
  // the sheet and its buttons inside the screen, nothing wider than it.
  for (const [w, h] of [[320, 568], [360, 640], [412, 924], [360, 420]]) {
    await t.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await t.sleep(150);
    const out = await t.evaluate(async () => {
      const $ = id => document.getElementById(id), wait = ms => new Promise(r => setTimeout(r, ms)), bad = [];
      const inside = el => { const b = el.getBoundingClientRect(); return b.top >= -0.5 && b.left >= -0.5 && b.bottom <= innerHeight + 0.5 && b.right <= innerWidth + 0.5; };
      const measure = async (name, dlg) => {
        await wait(320);
        for (const b of dlg.querySelectorAll('.sheet-foot button, .sheet-head button, .add-head button, .confirm-btns button')) if (b.offsetParent && !inside(b)) bad.push(name + ':' + (b.id || b.textContent.trim()));
        if (!inside(dlg)) bad.push(name);
        if (dlg.scrollWidth > dlg.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1) bad.push(name + ':wide');
        dlg.close(); await wait(50);
      };
      cat = null; renderShelf(); openCat('veg');
      openAdd('tomato sauce', 'veg'); await measure('add name', addEl);
      openAdd('tomato sauce', 'veg'); $('addForm').requestSubmit(); await measure('add price', addEl);
      openAdd('tomato sauce', null); $('addForm').requestSubmit(); await measure('add category', addEl);
      document.querySelector('.prod').click(); await measure('qty', $('sheet'));
      openPrices(); await measure('prices', $('prices'));
      $('acctBtn').click(); await measure('shop', $('shopSheet'));
      $('acctBtn').click(); $('signupOpen').click(); await measure('signup', $('shopSheet'));
      if (!kept.length) keep({ id: 'fit', no: 1, started: new Date().toISOString(), discount: 0, lines: [{ ml: 'ഉപ്പ്', qty: 1, unit: 'pc', rate: 2000 }] });
      openBills(); await measure('bills', billsEl);
      openBills(); showPast(kept[0].id); await measure('kept bill', billsEl);
      openPrices(); pickMode(true); await measure('prices remove', pricesEl);
      openPrices(); pickMode(true); picking.add(products[0].id); renderPick(); askDrop(); await measure('confirm', $('dropConfirm')); pricesEl.close();
      return bad;
    });
    t.check(`every sheet and its buttons fit a ${w}x${h} screen`, out.length === 0, out);
  }

  // iPhone: the keyboard covers the page instead of shrinking it. innerHeight stays 844 while the visual
  // viewport drops to 343 px (Karthik's iPhone in Firefox Focus), at the top or panned 120 px down. Every
  // sheet (and both add steps that type) sits inside that strip, and the box being typed in is scrolled
  // back into view when its sheet shrinks (the lowest price box in view in the price list).
  await t.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await t.sleep(150);
  for (const top of [0, 120]) {
    const out = await t.evaluate(async top => {
      const $ = id => document.getElementById(id), wait = ms => new Promise(r => setTimeout(r, ms)), bad = [], H = 343;
      const kb = (on) => {
        for (const [k, v] of [['height', H], ['offsetTop', top], ['scale', 1]])
          on ? Object.defineProperty(visualViewport, k, { get: () => v, configurable: true }) : delete visualViewport[k];
        visualViewport.dispatchEvent(new Event('resize'));
      };
      const inside = el => { const b = el.getBoundingClientRect(); return b.top >= top - 0.5 && b.bottom <= top + H + 0.5 && b.left >= -0.5 && b.right <= innerWidth + 0.5; };
      const measure = async (name, dlg) => {
        kb(true); await wait(320);
        for (const b of dlg.querySelectorAll('.sheet-foot button, .sheet-head button, .prices-head button, .add-head button')) if (b.offsetParent && !inside(b)) bad.push(name + ':' + (b.id || b.textContent.trim()));
        if (!inside(dlg)) bad.push(name);
        dlg.close(); kb(false); await wait(50);
      };
      cat = null; renderShelf(); openCat('veg');
      openAdd('tomato sauce', 'veg'); await measure('add name', addEl);
      openAdd('tomato sauce', 'veg'); $('addForm').requestSubmit(); await measure('add price', addEl);
      openPrices(); await wait(320);
      const list = $('priceList'), low = [...list.querySelectorAll('input')].filter(i => i.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom).pop();
      low.focus(); kb(true); await wait(200);
      const lr = list.getBoundingClientRect(), ir = low.getBoundingClientRect();
      if (!(inside(low) && ir.top >= lr.top - 0.5 && ir.bottom <= lr.bottom + 0.5)) bad.push('prices:typed box hidden');
      pricesEl.close(); kb(false); await wait(50);
      document.querySelector('.prod').click(); await measure('qty', $('sheet'));
      openPrices(); await measure('prices', $('prices'));
      $('acctBtn').click(); await measure('shop', $('shopSheet'));
      $('acctBtn').click(); $('signupOpen').click(); await measure('signup', $('shopSheet'));
      return bad;
    }, top);
    t.check(`with an iPhone keyboard up (343 px visible, panned ${top}), every sheet sits above it`, out.length === 0, out);
  }
};
