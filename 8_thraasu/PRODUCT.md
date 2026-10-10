# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Shopkeepers at small Kerala counters: palacharakku (grocery) shops, mini marts and
stationery stores. They bill one customer at a time, standing, phone in one hand, goods
in the other, often with a queue waiting. Malayalam is their working language; they type
product names in Manglish (thakkali, velichenna) as often as in Malayalam script.

## Product Purpose
Replace the handwritten bill pad and the mental arithmetic at the weighing scale. Pick a
product (search or tiles), pick a quantity (preset or typed, kg⇄g / L⇄ml), and the
amount is computed from the shop's price list. The finished bill can be edited line by
line or as a whole, then printed or saved as a PDF from the phone.

## Positioning
Not a POS suite (cf. luapos.com). One job, done at counter speed, in Malayalam, offline,
with no account, no install step and no hardware beyond the phone and any printer the
phone can already reach.

## Operating Context
- Counter in daylight or under tube lights; quick taps, possibly wet or floury fingers.
- Prices change often (vegetables daily); a line's rate can be overridden on the spot and kept
  as the shop's price, and every price can be set from the price list behind the price pill.
- Printing goes through Android's system print dialog: Save as PDF, Wi-Fi printers via
  Mopria/vendor print services, Bluetooth receipt printers via the RawBT print service.
- Installed via Add to Home Screen from tinkerhouse.uk/8_thraasu/; Play Store via TWA later.

## Capabilities and Constraints
- Single-file PWA. The public `products.json` is a template; a shop that logs in (code + PIN) gets
  its own list, prices and photos from the sync API on the same origin (Pages Function + D1).
- Units: kg (priced per kg), L (per litre), pc (per piece). Money in integer paise.
- Local first: the bill, prices and photos save on the phone at once and sync when online; a backup
  file (share to WhatsApp/Drive) carries prices and photos without an account. No bill history, GST
  or customers in v1 (deliberately deferred, not forgotten).
- localStorage keys prefixed `thraasu_`; Cache Storage prefixed `thraasu-` (shared origin).

## Brand Commitments
- Name: Thraasu (ത്രാസ്), the counter weighing balance. Malayalam-first UI.
- User-approved look (2026-10-10): banana-leaf green, thraasu brass, warm paper-white
  ground, chilli red for removal; Anek Malayalam; light theme only.

## Evidence on Hand
- Nanma Store's list (2026-10-10, from `Inventory - Nanma store .xlsx`): 433 items, 15 categories.
  `products.json` is the public template (sample, no stock); the real list with prices is on the
  server behind the shop's login. Stock counts (g for kg items, pieces otherwise) live in D1 `stock`,
  set by `shop-admin.mjs stock` and lowered by each bill once it is printed, shared or closed. Stock photos (Unsplash) for single-ingredient items; branded packs keep an emoji
  until the shop adds its own photo (stored on the phone, IndexedDB). Behaviour tests run against
  the frozen sample list in `scripts/browser/fixtures/thraasu-sample.json`.
- Malayalam copy and product names were written by the build agent and need a native
  speaker's proofread before release.

## Product Principles
1. Counter speed beats completeness: every common bill is reachable in a few taps.
2. The arithmetic is never wrong: integer paise, explicit round-off.
3. Malayalam first, Manglish-tolerant.
4. Works with what the shop already has: any Android phone, any printer it can reach.

## Accessibility & Inclusion
48 px minimum touch targets, WCAG AA contrast in bright light, pinch-zoom allowed,
`lang="ml"` with English fragments marked `lang="en"`.
