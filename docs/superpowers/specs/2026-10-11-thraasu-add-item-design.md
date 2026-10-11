# Thraasu: a shop adds its own items (search first, no duplicates)

Approved by Karthik 2026-10-11. Mockup: https://claude.ai/artifact/9ND5iVVYPHCknFrvDNysWU
A shop adds items to its list from the phone. Every add starts as a search of the whole list, and a
name the list already has cannot be added.

## Owner (app)
- **Entry points.**
  - Category screen: a row under the crumb, with the item count on the left ("43 ഇനങ്ങൾ") and a tinted
    **+ പുതിയ സാധനം** button on the right. The button sits above the grid, never as a tile: categories
    run to 76 items, and the top-left tile is where billing taps land.
  - Counter search with no result: under the existing message, a ghost button **+ പുതിയ സാധനമായി ചേർക്കുക**.
    It opens the sheet with the typed text as the name.
- **Add sheet** (a bottom sheet, like the price list):
  - Title പുതിയ സാധനം, then the name box (പേര്) with focus.
  - **Matches as you type** ("ഇതിനകം ഉള്ളവ · ഇതാണെങ്കിൽ തൊടുക"):
    - At most 4 items from all categories: the hits for the whole name, then for each word of 3 or more
      letters, with no repeats.
    - Each row shows the item, its English name and category, and a ›.
    - Tapping a row closes the sheet and opens that item's quantity sheet.
  - **Same name, so blocked:**
    - The name box turns chilli and the hint reads "ഈ പേരിൽ ഒരു സാധനം ഇതിനകം ഉണ്ട്. പുതിയത് ചേർക്കാനാവില്ല."
    - The matching item shows alone under "ഇതേ പേര്", on a chilli wash, with "തുറക്കുക ›".
    - The details stay hidden and the Add button is disabled.
  - **New name:** the details appear below a divider, in this order:
    - **വിഭാഗം:** a row of category chips that scrolls sideways. The category is pre-picked when the sheet
      opens from a category; from search, the owner must pick one.
    - **അളവ്:** kg / L / എണ്ണം. The default is the unit most items in the chosen category use.
    - **വില:** ₹ and the unit word, as elsewhere. It must be a valid amount above 0 (`parseMoney`).
    - **മറ്റൊരു പേര്** (optional, "തിരയാൻ സഹായിക്കും"). It is checked for duplicates the same way.
  - Footer: **പട്ടികയിൽ ചേർക്കുക**, enabled only when the name is new, a category is picked and the price
    is valid.
- **Saved:**
  - The sheet closes and a toast shows "<name> ചേർത്തു".
  - Opened from a category: the grid scrolls to the new tile, at the end of its category, and outlines
    it in leaf for about 2 s.
  - Opened from search: the search still holds the name, so the new item shows as the result, one tap
    from billing.
- **Price list (വിലയും ഫോട്ടോയും):**
  - An added item is marked "നിങ്ങൾ ചേർത്തത്" and has a chilli ✕ instead of ↺.
  - ✕ removes the item, and a toast offers undo, as for bill lines.
  - Its price box changes the item's own rate, so an added item has no "list price" to reset to.
  - Items from the shop's sheet or the template have no ✕.
- **What a saved item looks like:**
  - The tile and the quantity sheet show the name containing Malayalam letters (U+0D00–U+0D7F) large. If
    neither name has any, the first name is shown large.
  - The other name is the small English line.
  - The picture is the category's emoji until a photo is taken from the camera corner.
- Not included: new categories, a stock count when adding, renaming (remove the item and add it again).

## Duplicate rule (`bill-core.js`, pure and tested)
- **`nameKey(s)`:** `skeleton(s)` with all spaces removed. This is the same forgiving spelling as search,
  so takkali, Thakkali and thakali give one key, and so do "Milky bar" and "Milkybar".
- **`sameName(products, name)`:** returns the product whose key matches `nameKey(name)`, or null. A product
  matches on its ml, its en, or any one of its alias words. Every typed name is checked: the name and,
  if filled, the other name.
  - Known limit: an alias word can block a one-word name. KitKat's alias "kit cat win" blocks a new item
    called "win". The blocked row shows which item matched, so the owner can type a fuller name.
- **`similar(products, name, 4)`:** the match list described above. It never blocks adding.
- Added items are products, so they are checked like the rest.

## Storage and sync
Added items are kept apart from the imported list and merged in when the list loads, so re-importing a
shop's sheet with `shop-admin.mjs catalog` keeps them.
- **Item shape:** `{id, cat, ml, en, unit, rate, icon}`, with rate in rupees as in products.json.
  - The id is `u` plus 10 random characters from [A-Za-z0-9], which passes the server's ID check.
  - The icon is the category's emoji.
- **Phone:**
  - Items are kept in localStorage `thraasu_items` as `{id: item}` and merged after the list loads:
    `validProducts({categories, products: [...list, ...items]})`.
  - An item whose category is missing from a re-imported list stays stored but is not shown.
  - They work without an account (this phone only), and the Backup file carries them: `cleanBackup`
    validates them with the same rules as the server.
- **Outbox:** `outbox.items = {id: item | null}`, where null means removed. It is queued like a price.
- **Server (`functions/api/thraasu/[[path]].js`):**
  - `POST items {set: {id: item}, drop: [ids]}` validates each item:
    - the id matches ID;
    - cat is a string of 40 characters or fewer;
    - ml is 1–60 characters and en 0–60;
    - unit is one of kg / l / pc;
    - rate is greater than 0 and less than 1e7;
    - key is 1–80 characters.
  - The writes go as one json_each batch. The phone sends `key = nameKey(ml)`. Storage has
    `UNIQUE (shop, key)`, and the server answers `{ok, dup: [ids]}`.
  - **Duplicates between phones:** when two phones add the same name offline, the server keeps the first.
    The other phone drops its copy and shows "<name> ഇതിനകം ഉണ്ട്". Its bill lines keep their snapshot.
  - Dropping an item also deletes its price and photo rows. At most 1000 items per shop (413 beyond).
  - Each POST sets `shops.items_at`. `GET state` returns `items: items_at`, and the phone runs
    `GET items` (`{id: item}`) only when that has changed, the same way `catalog_at` works now.
- **Schema:**
  - `items (shop, id, body, key, at, PRIMARY KEY (shop, id), UNIQUE (shop, key))` and `shops.items_at`.
  - The one-off migration is `tools/migrate-items.sql`, and `schema.sql` is updated to match.
- **`shop-admin.mjs`:**
  - `list` gains an items count.
  - `remove` deletes the shop's items.
  - Folding added items into a shop's sheet stays manual. Add an `items CODE` export when a shop needs it.
- Stock is unaffected: added items have no count, and `POST sales` changes only counted rows.

## Copy (Malayalam, to be proofread with the rest)
പുതിയ സാധനം · പുതിയ സാധനമായി ചേർക്കുക · ഇതിനകം ഉള്ളവ · ഇതാണെങ്കിൽ തൊടുക · ഇതേ പേര് · തുറക്കുക ·
ഈ പേരിൽ ഒരു സാധനം ഇതിനകം ഉണ്ട്. പുതിയത് ചേർക്കാനാവില്ല. · വിഭാഗം · അളവ് · വില · മറ്റൊരു പേര് ·
തിരയാൻ സഹായിക്കും · പട്ടികയിൽ ചേർക്കുക · ചേർത്തു · നിങ്ങൾ ചേർത്തത് · ഇതിനകം ഉണ്ട് · N ഇനങ്ങൾ

## Tests
- **`test-bill.mjs`:**
  - `nameKey`: h, doubled letters, spaces and case.
  - `sameName`: matches on ml, en and an alias word, but not on a substring (Milkybar 50 against Milkybar 30).
  - `similar`: the cap and the order.
  - `cleanBackup` with items.
- **`test-sync.mjs`:**
  - `POST items` set/drop, validation, a duplicate key returned in `dup`, and the 1000 cap.
  - Drop removes the item's price and photo.
  - `items_at` in state, and `GET items`.
- **Browser (`scripts/browser/tests/thraasu`):**
  - The category button opens the sheet with the category picked.
  - A search with no result offers the add, with the name filled in.
  - Thakkali is blocked and the tomato row opens tomato.
  - A similar name is shown but doesn't block.
  - Add, then reload, and the item is still there; from search it shows as the result.
  - The price list ✕ removes the item and undo restores it.
  - Changing an added item's price changes its rate.
  - Backup and restore carry the items.
- **Live, after deploying:** a throwaway shop adds an item, a second session sees it, a duplicate key is
  refused, and the shop is removed.
