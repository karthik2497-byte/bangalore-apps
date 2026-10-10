# NestHub — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 1–1715, markup 1717–2635, script 2637–3224),
`service-worker.js`, `manifest.json`, the `/4_nest_hub/*` block in `_headers`,
EXECUTION_PLAN §4.7 and §6.2 #4. Design detector: `impeccable detect.mjs`.
Line numbers refer to the baseline commit.

## Verdict

NestHub is a clickable mockup of a society-management SaaS, deployed as if it were a working
app. Almost every action ends in a success toast for something that never happened:
"Gate notified", "Payment Successful! Transaction ID TXN…", "Receipt sent to your registered
email", "Complaint submitted! ID #…", "Calling Security…", and above all **"SOS Alert sent!
Security team has been notified."** The SOS and emergency-contact cases are a **safety
problem**. Someone who trusts that toast in a real emergency waits for help that was never
called. These need fixing today whatever the app's future. Past that, NestHub has no local-only
use (unlike PowerPulse). Every feature needs a shared backend (EXECUTION_PLAN §4.7 "do LAST").
The honest live version is a clearly labelled **demo** whose emergency paths really dial.

## Keep: works, don't change

- `showToast` appends the message as a text node (3179–3180). That is the 2026-08-29 XSS fix. Keep it.
- `esc()` on every user-entered visitor field in `renderVisitors()` (2840–2843).
- **Cancel Pass** and the RSVP counter fix that only touches the text node (3133–3144). Both are
  correct, and both were verified in the 2026-08-29 smoke test.
- `nesthub_state` is a single namespaced key with guarded read and write (2669–2689).
- The visual system is coherent: a teal accent, a calm neutral base, consistent cards. As a
  pitch demo for a pilot society (§4.7 P1) the look is credible. Keep it.
- Quick Approve chips (Swiggy/Zomato, Amazon, Milk) are the right instinct for how residents
  actually use gate apps.

## Findings

Severity: **P0** breaks data, trust, safety or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **SOS does nothing, then says it alerted security.** `triggerSOS()` (3147–3151) asks
  "This will alert Security and Management immediately" and then toasts "SOS Alert sent!".
  Nothing is sent anywhere. **Fix:** make SOS dial **112** (India's unified emergency number)
  through a `tel:` link. The text must never claim a notification that did not happen.
- [x] **Emergency Contacts are fake calls.** "Security", "Plumber", "Electrician" and
  "Management" only toast "Calling Security…" (More tab, `emergency-card` `onclick`). **Fix:**
  real `tel:` links for the public numbers: 112 emergency, 100 police, 101 fire, 108 ambulance.
  Remove the society-specific rows until a society configures real numbers.
- [x] **Fake payment success.** `processPayment()` (3025–3061) shows "Processing…" for 2 s, then
  "Payment Successful!", a made-up `TXN` id and "Receipt sent to your registered email", and
  marks the month paid. A resident could believe they paid their maintenance. **Fix:** no
  success screen without a real payment. In the demo, say "Demo — no money moved". A real
  backend-free path exists if a society ever configures it: a `upi://pay?pa=…&am=…` intent.
- [x] **Unlabelled demo.** "Good Morning, **Karthik**", "Block A, Flat 402", "April 2025
  Maintenance", fixed visitors, notices, marketplace and complaints. Every visitor to the live
  URL sees the developer's name and a fake society. **Fix:** a persistent "Demo society —
  nothing here reaches a real gate, guard or bank" banner, and a neutral resident name.
- [x] **Every app's service worker deletes every other app's caches.** `service-worker.js:10`.
  The details are in `1_power_pulse/REVIEW.md`. **Fix:** `k.startsWith('nesthub-') && k !== CACHE_NAME`,
  and bump to `nesthub-v3`.

### P1

- [x] **"Gate notified" and a QR that is not a QR.** Quick Approve and frequent-visitor approve
  toast "…approved! Gate notified." (2821, 2921). The pass shows a random 11×11 pixel pattern
  captioned "Show this QR to the security guard" (2851, 2925–2970). Nothing reaches a gate, and
  the pattern is not scannable. This is the known §6.2 #4 finding, still live. **Fix (now):**
  copy says "Pass saved on this phone (demo)". The caption names it a demo pass.
  **Fix (later, backend):** signed QR passes, §4.7.
- [x] **Toast-only actions** that claim something happened: "Complaint submitted! ID #…" with a
  random id (3125), "Downloading receipt…" (3090), "Gym slot booked for 6 AM!", "Parking spot
  reserved!", "Clubhouse booking opened!", "Contact request sent to B-201" (marketplace), "You
  have 3 new notifications" (1749), "Profile editor opening…", "Opening resident directory…",
  "Create post feature coming soon!" (FAB), and a notifications toggle (3154–3161). **Fix:**
  with the demo banner in place, change success claims to demo wording, and remove the pure
  "coming soon" buttons.
- [x] **Pinch-zoom disabled** (line 5). Fails WCAG 1.4.4.
- [x] **No focus indicator anywhere.** `input, select, textarea { outline: none }` (80), and
  there is no `:focus-visible` rule. Menu rows and emergency cards are clickable `<div>`s.
  Modals have no `role="dialog"` and no Escape key handling.
- [x] **Faint text.** `--gray-400` `#9CA3AF` on white is 2.54:1, used for meta and receipt
  lines. Fails WCAG 1.4.3.

### P2

- [x] **Single-quoted data in inline `onclick`:** `quickApproveFrequent('${v.name}', …)` (2893)
  and `downloadReceipt('${p.month}')` (3078). These values are constants today, but this is the
  exact pattern §0.2 forbids, and it becomes injectable the moment frequent visitors are
  user-editable. **Fix:** pass an index and look the object up.
- [x] `visitorLog` and `frequentVisitors` render without `esc()` (2869–2872, 2889–2890).
  They are constants today. Escape them anyway.
- [x] **UTC "today".** `toISOString().split('T')[0]` (2761, 2811, 2912) pre-fills yesterday's
  date between 00:00 and 05:30 IST.
- [x] **Hidden for ~1.8 s on every launch.** The app waits for `load` + 1500 ms + 300 ms before
  rendering anything (2692–2705).
- [x] **Stale dates:** April 2025 dues, Oct 2024–Mar 2025 history, "Diwali Oct 20th". As a demo,
  derive the month labels from today so it does not look abandoned.
- [x] "Prestige Lakeside Heights" borrows a real developer's brand (Prestige). **Fix:** use a
  plainly fictional society name.
- [ ] Notice-board "like" buttons increment a counter in inline JS and never persist it.

### P3 / design-detector findings (taste: leave unless redesigning)

- Inter (15). Overshoot easing (63). `max-height` transition on expanding visitor cards (818).
- SVG-only icons (cross-app; see PowerPulse).

## Deferred: needs the backend (EXECUTION_PLAN §4.7)

- Multi-tenant Supabase (societies, flats, members, visitors, dues, notices) with RLS on `society_id`.
- Signed QR passes + a guard-side scanner page. Real dues via UPI / payment gateway.
- Pilot with one society before generalising. B2B pricing, not passive income.
- **Decision for Karthik:** keep NestHub on the landing page as a labelled demo (recommended,
  since it is the pitch asset for a pilot), or pull it until Phase C.

## Status — 2026-10-10

Fixed this session (verified in headless Chrome, 25/25 checks: `node --check` both blocks,
every tab and community section, reload persistence, 0 app console errors):
SOS → `tel:112`; emergency grid → 112 / 100 / 101 / 108 `tel:` links (the old rows showed
invented mobile numbers); payment is a labelled demo mark with no fake transaction or
receipt; a demo banner on every screen; your name and the Prestige brand removed; honest
gate/QR/amenity/marketplace copy via one `demoOnly()`; complaint → prefilled WhatsApp
message; the fake settings menu removed; index-based inline handlers; `esc()` on the log;
local dates; dues and history derived from today; render on DOMContentLoaded;
`:focus-visible`, `role="dialog"`, Escape, keyboard-operable pass cards, `--gray-400` → 4.83:1;
SW `nesthub-v3` with a scoped purge.

Still open: notice-board likes don't persist (demo); static events and complaints are
still dated 2025 (demo content); everything under *Deferred*.

## Work order

1. **Safety first:** SOS → `tel:112`, real public emergency numbers, no fake "alert sent".
2. Demo banner. Payment, complaint, gate and receipt copy says what really happened.
   Neutral resident name, fictional society name.
3. SW purge scope + `nesthub-v3`.
4. Inline-onclick and escaping hygiene, local dates, instant render.
5. A11y: zoom, focus ring, dialog behaviour, `div` → `button`, gray-400 contrast.
