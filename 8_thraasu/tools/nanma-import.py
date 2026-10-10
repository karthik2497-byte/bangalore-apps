# Builds products.json from Nanma Store's inventory sheet.
# usage: python3 8_thraasu/tools/nanma-import.py "Inventory - Nanma store .xlsx"
# The sheet gives price, unit and stock; nanma-table.txt (one line per sheet row, by row index
# from 0 = first data row) gives each item its English and Malayalam name, category, emoji,
# photo and extra search words. A new sheet row needs a new table line, or the run stops.
import json, os, re, collections, sys, zipfile, xml.etree.ElementTree as ET
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)

def read_sheet(path):           # stdlib only: an .xlsx is zipped XML
    z = zipfile.ZipFile(path); M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    ss = [''.join(t.text or '' for t in si.iter(M + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(M + 'si')]
    out = []
    for r in list(ET.fromstring(z.read('xl/worksheets/sheet1.xml')).find(M + 'sheetData'))[1:]:
        d = {}
        for c in r:
            col = ''.join(ch for ch in c.get('r') if ch.isalpha()); v = c.find(M + 'v')
            d[col] = (ss[int(v.text)] if c.get('t') == 's' else v.text) if v is not None else ''.join(x.text or '' for x in c.iter(M + 't'))
        out.append({'sku': d.get('A', ''), 'name': (d.get('B') or '').strip(), 'unit': d.get('D', ''), 'price': d.get('G', ''), 'inv': d.get('H', '')})
    return out

rows = read_sheet(sys.argv[1])
table = {}
for l in open(os.path.join(HERE, 'nanma-table.txt')):
    l = l.rstrip('\n')
    if not l or l.startswith('#'): continue
    f = l.split('|')
    table[int(f[0])] = dict(cat=f[1], en=f[2], ml=f[3], icon=f[4], photo=f[5], alias=f[6] if len(f) > 6 else '')

CATS = [
    ('veg', 'പച്ചക്കറി', 'Vegetables', '🥬'),
    ('fruit', 'പഴങ്ങൾ', 'Fruits', '🍌'),
    ('rice', 'അരി · പൊടികൾ', 'Rice, flours & cereals', '🍚'),
    ('pulses', 'പയർ · പരിപ്പ്', 'Pulses & dals', '🫘'),
    ('spice', 'മസാല · പലചരക്ക്', 'Spices & provisions', '🌶️'),
    ('oil', 'എണ്ണ · നെയ്യ്', 'Oil & ghee', '🫗'),
    ('dairy', 'പാൽ · മുട്ട', 'Milk, eggs & chilled', '🥛'),
    ('drinks', 'ചായ · കാപ്പി', 'Tea, coffee & drinks', '☕'),
    ('snacks', 'ബിസ്കറ്റ് · പലഹാരം', 'Biscuits, cakes & sweets', '🍪'),
    ('instant', 'നൂഡിൽസ് · പായസം', 'Noodles, vermicelli & mixes', '🍜'),
    ('sauces', 'സോസ് · അച്ചാർ · ജാം', 'Sauces, pickles, jams & honey', '🥫'),
    ('care', 'സോപ്പ് · ഷാംപൂ', 'Soap & personal care', '🧼'),
    ('clean', 'അലക്ക് · ക്ലീനിങ്', 'Laundry & cleaning', '🫧'),
    ('pooja', 'പൂജാ സാധനങ്ങൾ', 'Pooja needs', '🪔'),
    ('misc', 'പലവക', 'Odds & ends', '🧺'),     # the "others": പലവക = assorted
]
LOOSE_KG = {431, 432, 433, 434}                  # bananas: priced per gram like the loose rows

# Keys below are table row indexes (sheet row - 2).
# Prices Karthik confirmed on 2026-10-10 where the sheet had a decimal slip: ₹ per kg.
FIX_RATE = {27: 59, 26: 85, 6: 190, 433: 45}     # sugar, jaggery, kaima rice, Robusta banana
# Held back until the shop clarifies them (Karthik, 2026-10-10). To bring one back, correct the
# sheet (or FIX_RATE), delete its line here and re-run. NANMA-IMPORT-NOTES.md lists them.
SHIFTED_OIL = 'Coconut oil prices look shifted between rows (1 L ₹47, 500 ml ₹320, 200 ml ₹160); the whole block waits'
SHIFTED_GHEE = 'Milma ghee prices look shifted between rows (1 L ₹157 is about a 200 ml price, 50 ml ₹110); the whole block waits'
HOLD = {
    177: SHIFTED_OIL, 178: SHIFTED_OIL, 179: SHIFTED_OIL, 180: SHIFTED_OIL, 181: SHIFTED_OIL, 182: SHIFTED_OIL, 183: SHIFTED_OIL,
    185: SHIFTED_GHEE, 186: SHIFTED_GHEE, 187: SHIFTED_GHEE, 188: SHIFTED_GHEE,
    194: 'Price ₹1 for a 200 ml bottle',
    169: 'Same name and price as sheet row 74 (Swamees pappadam ₹33): double entry?',
    165: 'Same name and price as sheet row 75 (Bambino vermicelli ₹36): double entry?',
    166: 'Same name and price as sheet row 76 (Bambino vermicelli ₹58): double entry?',
    145: 'Same name and price as sheet row 111 (Hyza chicken masala ₹10): double entry?',
    127: 'Same name and price as sheet row 113 (Hyza chilli powder ₹38): double entry?',
    226: "Same name and price as sheet row 225 (Sunfeast Mom's Magic ₹10): double entry?",
    402: 'Same name and price as sheet row 403 (Ujala whitener ₹10): double entry?',
    426: 'Same name and price as sheet row 427 (Milky Mist butter ₹85): double entry?',
    125: 'SKU P0000000129 is also on sheet row 117 (Rasam powder): needs its own SKU',
    152: 'SKU P0000000156 is also on sheet row 153 (Food colour): needs its own SKU',
    197: 'SKU P0000000201 is also on sheet row 99 (Eastern Adimali coffee): needs its own SKU',
    36: 'Name unclear: "con flower" (corn flour? ₹200/kg is high for it)',
    42: 'Name unclear: "savoonari" (sago / chowari?)',
    43: 'Name unclear: "savoonari small" (small sago?)',
}

def img(slug):
    return f'img/{slug}.webp' if slug and os.path.exists(os.path.join(APP, 'img', slug + '.webp')) else None
def num(x):
    x = round(float(x), 2)
    return int(x) if x == int(x) else x

products, skipped, held, seen_sku = [], [], [], collections.Counter()
for i, r in enumerate(rows):
    if not r['name']: continue
    t = table.get(i)
    if not t: sys.exit(f'row {i} {r["name"]!r} missing from table')
    price = float(r['price']) if r['price'] else 0
    why = HOLD.get(i) or (None if price > 0 else f'Price {r["price"] or "empty"}: cannot be billed')
    if why:
        held.append((i + 2, r['sku'], r['name'], r['price'], r['inv'], why)); continue
    loose = r['unit'].lower() in ('g', 'kg') or i in LOOSE_KG
    if i in FIX_RATE: price = FIX_RATE[i] / 1000
    seen_sku[r['sku']] += 1
    pid = r['sku'] if seen_sku[r['sku']] == 1 else f'{r["sku"]}-{seen_sku[r["sku"]]}'
    p = {'id': pid, 'cat': t['cat'], 'ml': t['ml'], 'en': t['en'],
         'alias': ' '.join(dict.fromkeys((r['name'].lower() + ' ' + t['alias']).split())),
         'icon': t['icon'], 'unit': 'kg' if loose else 'pc',
         'rate': num(price * 1000) if loose else num(price)}
    if r['inv'] not in ('', None): p['stock'] = int(float(r['inv']))   # grams for kg items, pieces for pc
    if img(t['photo']): p['img'] = img(t['photo'])
    p['_row'] = i + 2; p['_price'] = r['price']
    products.append(p)

# Same name more than once: tell them apart by price, then by a count.
groups = collections.defaultdict(list)
for p in products: groups[p['en']].append(p)
doubles = []
for name, ps in groups.items():
    if len(ps) < 2: continue
    for p in ps:
        tag = f' · {num(p["rate"])}'
        p['en'] += tag; p['ml'] += tag
    again = collections.defaultdict(list)
    for p in ps: again[p['en']].append(p)
    for n2, qs in again.items():
        if len(qs) > 1:
            doubles.append(f'{n2} (rows {", ".join(str(q["_row"]) for q in qs)})')
            for k, q in enumerate(qs[1:], 2): q['en'] += f' ({k})'; q['ml'] += f' ({k})'

order = {c[0]: k for k, c in enumerate(CATS)}
products.sort(key=lambda p: (order[p['cat']], p['_row']))
report = {'held': len(held), 'doubles': doubles,
          'dup_sku': [f'{p["id"]} row {p["_row"]} {p["en"]}' for p in products if re.search(r'-\d$', p['id'])]}
for p in products: p.pop('_row'); p.pop('_price')

cats = [{'id': c, 'ml': ml, 'en': en, 'icon': ic, **({'img': img('cat-' + c)} if img('cat-' + c) else {})} for c, ml, en, ic in CATS]
def line(o): return json.dumps(o, ensure_ascii=False)
def write(path, head, items):
    out = '{\n' + ''.join(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},\n' for k, v in head.items())
    out += '  "categories": [\n' + ',\n'.join('    ' + line(c) for c in cats) + '\n  ],\n'
    out += '  "products": [\n' + ',\n'.join('    ' + line(p) for p in items) + '\n  ]\n}\n'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write(out)

# Two outputs. The shop's own list (real prices, stock) goes to the server with
#   node 8_thraasu/tools/shop-admin.mjs catalog NANMA 8_thraasu/tools/catalogs/NANMA.json
# and stays out of git (the repo is public). products.json is the public template every shop
# sees until it logs in: the same items, labelled sample, without stock.
data = {'source': 'Inventory - Nanma store .xlsx'}
write(os.path.join(HERE, 'catalogs', 'NANMA.json'),
      {'version': 2, 'updated': '2026-10-10', 'sample': False, 'shop': 'Nanma Store', 'source': data['source']}, products)
write(os.path.join(APP, 'products.json'),
      {'version': 3, 'updated': '2026-10-10', 'sample': True,
       'note': 'Template for shops that have not logged in; a logged-in shop gets its own list from the server.'},
      [{k: v for k, v in p.items() if k != 'stock'} for p in products])
icons = ''.join(sorted({ch for x in cats + products for ch in x['icon']}))
print('emoji subset (index.html &text=, test-bill checks it):', icons)
print(len(products), 'products,', len(cats), 'categories,', sum('img' in p for p in products), 'with photos,',
      sum('stock' in p for p in products), 'with stock;', collections.Counter(p['cat'] for p in products))
print(json.dumps(report, ensure_ascii=False, indent=1))

def cell(x): return str(x).replace('|', '/')
fixed = [(i + 2, rows[i]['name'], f"{rows[i]['price']} ({rows[i]['unit']})", FIX_RATE[i]) for i in sorted(FIX_RATE)]
open(os.path.join(APP, 'NANMA-IMPORT-NOTES.md'), 'w').write(f'''# Nanma Store import notes

Generated by `tools/nanma-import.py` from `{data['source']}`. Do not edit by hand: change the
sheet, `FIX_RATE` or `HOLD` in the tool, then re-run it.

{len(products)} items are in the app. {len(held)} sheet rows are **not**, listed below until the shop
clarifies them. Row numbers are the sheet's own (row 1 is the header).

## Prices corrected (confirmed by Karthik, 2026-10-10)

| Sheet row | Sheet name | Sheet price | In the app |
|---|---|---|---|
''' + ''.join(f'| {r} | {cell(n)} | {p} | ₹{v}/kg |\n' for r, n, p, v in fixed) + f'''
## Held back ({len(held)})

| Sheet row | SKU | Sheet name | Sheet price | Why |
|---|---|---|---|---|
''' + ''.join(f'| {r} | {k} | {cell(n)} | {p} | {cell(w)} |\n' for r, k, n, p, v, w in sorted(held)) + '''
## Also worth a look

- **Odds & ends (പലവക)** holds items the sheet names but does not describe: Body Guard, Ria, Power,
  Revito, Freek bar, Neo 100, Lackrol, Shinol. Tell me what they are and they move to a category.
- Malayalam names were written from the sheet's English and Manglish; a native speaker should read them.
''')
