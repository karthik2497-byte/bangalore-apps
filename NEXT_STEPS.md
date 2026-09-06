# Next Steps

Live carry-over list. Newest state at the top of each block. Delete a line when
it is genuinely done — this file is auto-imported by `CLAUDE.md`, so a stale
entry costs every future session.

Authoritative detail lives in `EXECUTION_PLAN.md` (§4 per-app roadmap, §7 phases)
and `WORK_LOG.md` (what was built and how it was verified). This file is only the
"what is still open" index.

## 1. Phase A is done — the site is live

**`https://tinkerhouse.uk`** — Cloudflare Pages project `tinkerhouse`, repo-connected,
auto-deploys from `main`. Build command `bash scripts/build-site.sh`, output `dist`.
Domain is Cloudflare Registrar, $5.30/yr. Android package ids are `uk.tinkerhouse.<app>`,
**fixed permanently at first Play publish** — get them right before submitting.

- [ ] **Run `bash scripts/verify-deploy.sh` after every deploy.** `_headers` only takes
      effect on Pages, so nothing in the repo proves the CSPs work. Last run: PASS —
      7 apps, CSPs applied, assetlinks 7/7, real 404s, no repo file reachable.

Phase B (Play Store) is now the unblocked path; Phase C (backends) is what §4 needs.

## 2. Config values that must be filled before anything earns

Each of these ships blank on purpose — blank is safe, wrong is not.

- [ ] `6_stock_ping/index.html` → `const AFFILIATE` (line ~1636). Amazon Associates
      `tag` and Flipkart `affid`. **Until these are set StockPing earns nothing**;
      an unset tag passes URLs through untouched, so shipping blank is harmless.
- [ ] `3_pg_buddy/pgs.json` → `listingContact` (owner-submission target), then
      `phone` / `ownerName` / `verifiedOn` per listing as each PG is actually
      verified. The 8 current rows are the original demo data. Numbers were left
      blank deliberately: inventing plausible Indian mobile numbers would point
      real users at real strangers.
- [ ] `REPLACE_WITH_CONTACT_EMAIL` in `2_meter_smart/privacy.html` and
      `7_card_guard/privacy.html`. Play Store listing requires a reachable address.

## 3. Missing artifacts before Play submission

- [ ] `privacy.html` for **LingoLocal** and **StockPing** (`2_meter_smart/privacy.html`
      is the template). Mandatory for the Play listing, and Amazon Associates wants
      one for the affiliate disclosure.
- [ ] **LingoLocal audio is synthesised**, not a native speaker (macOS `kn_IN` voice
      via `tools/gen-audio.mjs`). It solves availability — most Android devices ship
      no Kannada TTS at all — but not accent. A native speaker should review the 18
      new phrases and re-record; replacements are a drop-in under the same
      filenames, then re-run the tool for the manifest.
- [ ] **CardGuard Play Billing**: create the `cardguard_premium_yearly` product in
      Play Console, and verify bubblewrap's `alphaDependencies.playBilling` field
      name against the installed `@bubblewrap/core` before wiring it into
      `scripts/generate-twa.mjs` — it was not verifiable offline.

## 4. Unblocked only by Phase A / Phase C

- [ ] **StockPing P0** — server-side checking (Workers cron + KV) + Web Push. The
      client CORS proxies are the #1 reliability *and* privacy problem: they see
      every tracked URL. Marked with a `ponytail:` comment at `CORS_PROXIES`.
- [ ] **CardGuard P0** — move Gmail OAuth server-side (§6.2 #3). Currently
      client-side, labelled Advanced, Premium-gated and warned, but still wrong.
- [ ] **PowerPulse §4.5** — both P0s are backend (Supabase realtime + BESCOM
      scheduled-outage scrape). Until then it is a demo.
- [ ] **PG Buddy** — photos via Supabase Storage; featured placement / lead-gen
      needs the sales motion, not code.
- [ ] **NestHub §4.7** — multi-tenant Supabase + real signed QR passes. Do last;
      it is B2B SaaS, not passive income.

## 5. Verification debt

- [ ] **§8 browser smoke test for PowerPulse and NestHub** — never run since the
      2026-07-11 fix pass. MeterSmart, LingoLocal, StockPing, PG Buddy and CardGuard
      all have browser evidence in the Audit Log; these two do not.
- [ ] **StockPing's proxy origins in `connect-src`** are in `_headers` but were never
      exercised live — driving that path hits the real CORS proxies and real retail
      sites. Confirm on the first live deploy.
- [ ] **LingoLocal `clip.play()` under a real user gesture** — not verifiable in
      automation (the tab stays `visibilityState: hidden` and Chrome blocks media
      there). Decode is proven end to end; one tap on a real device closes it.
- [ ] **CardGuard notification actually painting** — same shape: proven up to and
      including the `showNotification` call; needs one tap on a real device.
- [ ] **SW cache version bump** — deliberately skipped for the first deploy (nothing
      is live, so no client holds a stale cache). Applies from the *second* deploy
      onward, per §0.2.

## 6. Design findings — all pre-existing, none introduced by recent work

`git blame` puts every one of these in `446e6c1` (2026-04-09) and `012801f`
(2026-04-10). Run `/impeccable audit` for the authoritative current list.
**No ignore command has been run** — suppressing a finding needs Karthik's explicit
confirmation, and none has been given.

Worth fixing (real defects, small diffs):

- [ ] `5_lingo_local/index.html:117` — `[dark-glow]` zero-offset purple halo
      (`box-shadow: 0 0 60px rgba(124,58,237,0.15)`). Replace with a neutral
      elevation shadow.
- [ ] `5_lingo_local/index.html:233` and `:428` — `[layout-transition]` animating
      `width` (progress bars). Use `transform: scaleX` instead.

Taste calls — Karthik's decision, do not "fix" unasked:

- [ ] `[overused-font]` Inter — `6_stock_ping/index.html:14`, `3_pg_buddy/index.html:15`.
      Note this now interacts with `_headers`: the CSP pins `fonts.googleapis.com`
      and `fonts.gstatic.com`, so a self-hosted face needs `font-src 'self'` and a
      non-Google host needs adding to `style-src`/`font-src`/`connect-src` alike.
- [ ] `[bounce-easing]` — `5_lingo_local/index.html:194,349,626` and
      `3_pg_buddy/index.html:146,395`. The `cubic-bezier(…1.275)` card overshoot is
      the more defensible; the `dotBounce` loader dots are the more dated.

## 7. Standing rule

Per `EXECUTION_PLAN.md` §0.2: **one app per change-set.** Design fixes are app code
and do not belong in an infrastructure commit. Every session appends a §0.4 Audit
Log row before it closes.
