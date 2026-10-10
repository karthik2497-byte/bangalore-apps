# PG Buddy — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 1–1366, markup 1368–1695, script 1697–2607),
`service-worker.js`, `manifest.json`, `pgs.json` (all 8 rows), `test-pgs.mjs` (PASS, 28 cases),
the `/3_pg_buddy/*` blocks in `_headers`, and EXECUTION_PLAN §4.6. Design detector:
`impeccable detect.mjs`. Line numbers refer to the baseline commit.

## Verdict

The listings pipeline is sound: a versioned, validated `pgs.json`, network-first, with
owner submissions sent as WhatsApp/mail intents. **The content it ships is the problem.**
Six of the eight live listings carry a green **"Verified"** badge, yet no PG has been visited
(`verifiedOn` is empty on every row). Two of them use real Bangalore co-living brands,
**Zolo Stays** and **CoLive**, next to invented prices, house rules, star ratings and reviews
signed by named people. That is a false-endorsement and fake-review exposure on a live
domain. Fake reviews are an unfair trade practice under India's Consumer Protection Act. It
also undermines the badge itself, which the roadmap calls the thing worth selling. Second:
user reviews and photos look shared but never leave the phone, and several buttons only
show a toast.

## Keep: works, don't change

- **`pgs.json` + `validPGs()`.** It rejects the whole payload, rejects duplicate ids,
  uses cache→network, is network-first in the SW, and the edge header is `must-revalidate`.
  Adding a PG is a one-file edit. `test-pgs.mjs` pulls the real functions out of `index.html`.
- **Contact is honest.** `contactPG()` refuses to open an empty chat when no number is listed,
  and it prepends `91` to bare 10-digit mobiles (2231–2245).
- **Owner submission as an intent**, not a DB write (2556–2583). It validates phone and rent,
  and falls back to the chooser when no contact is configured.
- **Budget slider at max means "Any budget"** (2524–2528). This is the right default.
- The empty states tell apart "load failed", "filters too tight" and "seen them all" (1873–1883).
  That is good, honest UX.
- `showToast` uses `textContent`. User review text goes through `esc()` (2363–2364).
- **The swipe deck** has explicit Skip / Info / Save buttons alongside the gesture. That is the
  right accessibility fallback; the buttons just need names (below).
- The PG Hunting Checklist is a small, genuinely useful tool. Keep it.

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **"Verified" badges with no verification, on real brand names.** `pgs.json` has
  `verified: true` on 6/8 rows, while `verifiedOn` is `""` on all 8. Rows 2 (**Zolo Stays HSR**)
  and 4 (**CoLive Indiranagar**) are real companies shown with made-up ratings, rules, menus
  and reviews ("Priya Sharma, 2 weeks ago"). **Fix (code):** render the badge only when
  `verifiedOn` is a real date, and make `validPGs()` reject `verified: true` without one. That
  turns the badge into a rule that enforces itself. **Fix (data):** rename the two brand rows to
  clearly fictional names, set `verified: false` everywhere, and add a top-level `"sample": true`
  that shows a "Sample listings" banner until real verified rows replace them.
- [x] **Every app's service worker deletes every other app's caches.** `service-worker.js:10`.
  The details are in `1_power_pulse/REVIEW.md`. **Fix:** `k.startsWith('pgbuddy-') && k !== CACHE_NAME`,
  and bump to `pgbuddy-v3`.

### P1

- [x] **Reviews never leave the device, but the UI says they help others.** "Help fellow PG
  hunters make better choices" (1480) and "Review submitted! Thank you!" (2337). A submitted
  review is only ever shown back to its author under "Your Reviews". It never reaches the
  listing, its rating, or anyone else. **Fix:** say "Saved on this phone". Add **Send to
  PG Buddy** through the same WhatsApp/mail intent owners use, so a review can actually reach
  the curator and land in `pgs.json`.
- [x] **Fake photo upload.** `simulatePhotoUpload()` (2294–2302) has no file picker. It inserts
  a random gradient tile and toasts "Photo added! 📸". **Fix:** remove it until Supabase
  Storage (§4.6) exists.
- [x] **Buttons that only toast.** The header bell says "Notifications coming soon!" (1393).
  Both **See all** buttons toast "Showing all PGs" / "Showing all reviews" and change nothing
  (1461, 1468). **Fix:** remove all three.
- [x] **"Preferred Areas" does nothing.** `toggleAreaPref()` (2585) toggles a CSS class. The
  choice is not saved and not used, and two areas look pre-selected. **Fix:** persist it
  (`pgbuddy_areas`) and apply it in `applyFilters()` next to budget. Otherwise remove the card.
- [x] **Listing data is inserted into `innerHTML` unescaped:** `pg.name`, `area`, `tags`,
  review `name` / `text` / `color` (inside a `style` attribute), menu, rules and `r.pgName`
  (1907–1920, 2039–2066, 2117–2196, 2282, 2405–2458, 2359, 2509–2510). Owner submissions arrive
  by WhatsApp and get pasted into `pgs.json`, and the roadmap moves these rows to Supabase
  unchanged. The CSP allows inline handlers, so an `onerror` hidden in a PG name would run.
  **Fix:** use the `esc()` that already exists (2341) at every interpolation.
- [x] **Icon-only buttons have no accessible names:** the header bell, the swipe Skip / Info /
  Save buttons (1444–1452), the card bookmark hearts (1902, 2034), and the modal close (1666).
  Fails WCAG 4.1.2.
- [x] **Contrast.** The primary CTA, white on `#FF6B35`, is **2.84:1** ("Contact on WhatsApp",
  "Submit Review"). `--text-muted` `#A89092` on white is 2.97:1. Orange text on white is
  2.84:1. Fails WCAG 1.4.3. **Fix:** darken `--primary` for text and button fills (about
  `#C2410C`, ≥ 4.5:1) and keep the bright orange for decoration.
- [x] **Pinch-zoom disabled** (line 5).
- [x] **The detail modal** has no `role="dialog"`, no Escape key handling and no focus
  return. Checklist rows are clickable `<div>`s (2468).

### P2

- [x] Profile shows a hardcoded stranger: "Rahul Kumar, PG Hunter since Dec 2024" (1601–1602).
  The user's reviews show an "R" avatar (2357). **Fix:** use "You".
- [x] "Recently Reviewed" (1467) is just the first 6 filtered listings, not sorted by review
  date. **Fix:** rename it "All PGs" or sort it.
- [x] The budget slider is not saved. It resets to "Any budget" on every launch.
- [x] `reviewRent` is `type="text"` (1536). **Fix:** `inputmode="numeric"`.
- [x] The splash waits a fixed 1.8 s + 0.5 s (1793–1796). **Fix:** hide it once the first
  render is done.
- [x] Two filter chips match only 1 of 8 listings ("Near Metro", "Women Only"). That is fine
  with real data, but with samples it looks broken. No change needed beyond the sample banner.
- [x] When every saved id has dropped out of `pgs.json`, `renderSavedList()` renders an empty
  box with no empty-state message (2500–2518).

### P3 / design-detector findings (taste: leave unless redesigning)

- Inter (15). `dotBounce` loader (146). Overshoot card easing (395). `width` transitions on
  the rating and compare bars (687, 1021, 1196). Use `transform: scaleX` if they are touched.
- The Compare "Overall Pick" counts category wins and ignores price. Fine for v1.
- SVG-only icons (cross-app; see PowerPulse).

## Deferred: needs the backend (EXECUTION_PLAN §4.6)

- Photos (Supabase Storage). Shared reviews. Featured placement and lead-gen (a sales motion).

## Status — 2026-10-10

Fixed this session (`test-pgs.mjs` 32 cases PASS, 4 new: the Verified rule, honest sample
data, attribute values, the sample flag. 4/4 mutants killed; one first survived and exposed
a real gap, because `Date.parse(2026)` is valid in V8, so a numeric `verifiedOn` would have
passed. Headless Chrome 18/18: the sample banner, no badges, no brand names, injected listing
markup rendered as inert text, the sample chip in details, Escape, the area and budget
filters persisting across reload, Send to PG Buddy prefilled, all 4 tabs + Compare,
0 console messages):

- **The badge is now a rule:** `isVerified()` requires `verified` plus a real `verifiedOn`
  date, and `validPGs()` rejects a publish that breaks it.
- **`pgs.json` v2:** the data is marked `sample: true`, Zolo/CoLive are renamed, and nothing
  is verified.
- **Escaping:** `esc()` is applied at every listing interpolation, and `gradOf()` /
  `safeColor()` guard the values that go into attributes.
- **Removed fakes:** the photo upload and the toast-only buttons are gone.
- **Reviews:** honest copy, plus Send to PG Buddy.
- **Preferences:** Preferred Areas and budget filter and persist.
- **Contrast:** `--primary` is #C2410C.
- **A11y:** named buttons, dialog + Escape, checkbox rows.
- **Copy and launch:** neutral profile, "All PGs", and no fixed splash.
- **SW:** `pgbuddy-v3` with a scoped purge.

Still open: focus return when the sheet closes; real listings to replace the samples (then set
`sample: false`); everything under *Deferred*.

## Work order

1. Self-enforcing Verified badge + sample banner + renamed brand rows (code + `pgs.json` v2).
2. SW purge scope + `pgbuddy-v3`.
3. Escape every listing interpolation. Remove the fake photo upload and the toast-only buttons.
   Honest review copy + Send to PG Buddy.
4. Preferred Areas as a real, saved filter. Persist the budget.
5. A11y: button names, contrast tokens, zoom, dialog behaviour, checklist buttons.
