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
- Prices change often (vegetables daily); a line's rate can be overridden on the spot.
- Printing goes through Android's system print dialog: Save as PDF, Wi-Fi printers via
  Mopria/vendor print services, Bluetooth receipt printers via the RawBT print service.
- Installed via Add to Home Screen from tinkerhouse.uk/8_thraasu/; Play Store via TWA later.

## Capabilities and Constraints
- Single-file PWA, no backend: the price list is `products.json` on the same origin.
- Units: kg (priced per kg), L (per litre), pc (per piece). Money in integer paise.
- Current bill persists on the device. No bill history, GST, customers or in-app price
  editing in v1 (deliberately deferred, not forgotten).
- localStorage keys prefixed `thraasu_`; Cache Storage prefixed `thraasu-` (shared origin).

## Brand Commitments
- Name: Thraasu (ത്രാസ്), the counter weighing balance. Malayalam-first UI.
- User-approved look (2026-10-10): banana-leaf green, thraasu brass, warm paper-white
  ground, chilli red for removal; Anek Malayalam; light theme only.

## Evidence on Hand
- `products.json` prices are **sample data**, not market prices; the app labels them so.
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
