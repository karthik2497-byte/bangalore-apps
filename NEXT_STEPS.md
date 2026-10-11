# Next Steps

Live carry-over list. Newest state at the top of each block. Delete a line when
it is genuinely done — this file is auto-imported by `CLAUDE.md`, so a stale
entry costs every future session.

Authoritative detail lives in `EXECUTION_PLAN.md` (§4 per-app roadmap, §7 phases)
and `WORK_LOG.md` (what was built and how it was verified). This file is only the
"what is still open" index.

## 0. Per-app reviews (2026-10-10): read `<app>/REVIEW.md` before touching an app

Each app folder has a `REVIEW.md`: findings ranked P0–P3, what to keep, and a **Status**
block listing what was fixed on 2026-10-10 and what is still open. All P0/P1 items that
need no server or account were fixed, verified in headless Chrome (162 checks, 6 unit
suites) and deployed on 2026-10-10 (`main` at `421f465`). Items below marked *(review)*
came out of that pass.

## 1. Phase A is done — the site is live

**`https://tinkerhouse.uk`** — Cloudflare Pages project `tinkerhouse`, repo-connected,
auto-deploys from `main`. Build command `bash scripts/build-site.sh`, output `dist`.
Domain is Cloudflare Registrar, $5.30/yr. Android package ids are `uk.tinkerhouse.<app>`,
**fixed permanently at first Play publish** — get them right before submitting.

- [ ] **Run `bash scripts/verify-deploy.sh` after every deploy.** `_headers` only takes
      effect on Pages, so nothing in the repo proves the CSPs work. Last run 2026-10-11,
      after the Thraasu iPhone-keyboard fix (`main` at `966fa2b`): PASS — 8 apps, CSPs applied,
      assetlinks 8/8, real 404s, no repo file reachable, sync API answering.

Phase B (Play Store) is now the unblocked path; Phase C (backends) is what §4 needs.

## 2. Play Store release — blocked on $25 and a signing key

Play App Signing is **mandatory for new apps and free**; the $25 is the one-time
Google Play Console registration, covering all 7 apps and any future ones. Two
keys exist: an *upload key* you hold, and the *app signing key* Google holds and
re-signs with before shipping to devices.

- [ ] Open a Play Console account — **$25, one time.**
- [ ] Generate ONE upload keystore locally; one key can sign all 7 apps:
      `keytool -genkey -v -keystore upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`
      Do **not** commit it. Back it up somewhere you will still have in five years.
- [ ] Add GitHub repo secrets: `UPLOAD_KEYSTORE_BASE64` (`base64 -i upload.keystore`),
      `UPLOAD_KEYSTORE_PASSWORD`, `UPLOAD_KEY_ALIAS`, `UPLOAD_KEY_PASSWORD`.
- [ ] **Rewrite `.github/workflows/build-aab.yml` to restore that keystore instead of
      running `keytool -genkey` per run, and delete the hardcoded `bangaloreapps123`
      passwords. This is the actual blocker** — CI currently signs every build with a
      different throwaway key, so no fingerprint is stable and Play would reject every
      update.
- [ ] Build the 7 AABs (workflow dispatch, `origin` = `https://tinkerhouse.uk`), create
      7 Play listings, upload each to internal testing.
- [ ] Read each app's **app signing key** SHA-256 from Play Console → Setup → App
      integrity, and replace the 7 `REPLACE_WITH_*_SHA256` placeholders in
      `.well-known/assetlinks.json`. **Use Google's app signing key, not the upload
      key** — the upload key's fingerprint makes TWA verification fail *silently*: the
      app installs and runs, but shows a browser URL bar.
- [ ] Re-run `bash scripts/verify-deploy.sh`, then install one AAB on a real device and
      confirm there is no URL bar.

Ordering note: the fingerprints cannot be read until the apps exist in Play Console,
so the placeholders necessarily stay in `assetlinks.json` until then. That is expected,
not an oversight.

Not needed for any of this: users can already install every app from
`https://tinkerhouse.uk` via Add to Home Screen. The $25 buys Play discovery, not
the ability to run the apps.

## 3. Config values that must be filled before anything earns

Each of these ships blank on purpose — blank is safe, wrong is not. Why these two are
the *only* passive revenue paths across all 7 apps, with the numbers: `MONETISATION.md`.

- [ ] `6_stock_ping/index.html` → `const AFFILIATE` (line ~1636). Amazon Associates
      `tag` and Flipkart `affid`. **Until these are set StockPing earns nothing**;
      an unset tag passes URLs through untouched, so shipping blank is harmless.
- [ ] `3_pg_buddy/pgs.json` → `listingContact` (owner-submission target), then
      `phone` / `ownerName` / `verifiedOn` per listing as each PG is actually
      verified. The 8 current rows are the original demo data. Numbers were left
      blank deliberately: inventing plausible Indian mobile numbers would point
      real users at real strangers.
- [ ] **Thraasu shop accounts are live** (2026-10-10): Nanma Store is shop `NANMA` (PIN given to Karthik;
      reset with `node 8_thraasu/tools/shop-admin.mjs pin NANMA`). Its own list (real prices, stock)
      is on the server; the public `products.json` is now the labelled template without stock.
      **New shops sign up in the app** (live 2026-10-10, `4763a5c`): the owner taps പുതിയ കട രജിസ്റ്റർ
      ചെയ്യുക in the shop sheet and gets a code; run `shop-admin.mjs requests`, call the mobile if unsure,
      then `approve CODE` (or `reject CODE`). Each request is emailed to ckventurestech@gmail.com (Email Routing on
      tinkerhouse.uk, Worker `workers/thraasu-mail`, from alerts@tinkerhouse.uk) with a "Review and approve"
      link (signed with the Pages secret `REVIEW_KEY`): Approve / Reject from the phone. A Pages secret
      takes effect on the next deploy. Failures log to `wrangler pages deployment tail <id>` and
      `npx wrangler@4 tail --config workers/thraasu-mail/wrangler.toml` (from the root, a bare
      `wrangler tail` picks up the Pages config and refuses). Or make one directly with
      `add CODE "Name"`; `catalog CODE list.json` if it has its own list. Fee: `MONTHLY_FEE = 0` in the
      app, a label only; charging (manual UPI or Razorpay) is built when it goes above 0. At most 20
      requests wait at once; 25 MB of photos per shop; sold bills kept 60 days.
      **Shops add their own items from the phone** (live 2026-10-11, `93a0f63`): + പുതിയ സാധനം in a
      category's head row or in an empty search; a name the list already has is refused (spelling forgiven),
      similar ones are only shown. Added items sync to all the shop's phones (D1 `items`, one per name, 1000
      cap), survive a `catalog` re-import, and are removed from the price list (✕, undo). `shop-admin.mjs list`
      counts them (`added`); folding them into the shop's sheet is still by hand. Not built: renaming (remove
      and add again), new categories, a stock count at add.
      Open: a shop must log in once on each phone.
- [ ] **Thraasu stock goes down as bills are sold (live 2026-10-10, `1561c60`).** A bill counts once
      printed, shared or closed (പുതിയ ബിൽ); later edits move stock by the difference. Counts show in
      the quantity sheet and price list. NANMA has 394 counts from the sheet (`shop-admin.mjs stock
      NANMA 8_thraasu/tools/catalogs/NANMA.json`; re-running it is a stocktake that replaces all).
      Open: restocking from the phone; loose vegetables/bananas have no count in the sheet. **No
      Nanma phone had logged in as of the deploy** (0 sessions), so nothing at the shop syncs yet.
- [ ] **Thraasu carries Nanma Store's real list**: 433 items (template public, real list on the server). **27 sheet rows
      are held back until the shop clarifies them**, each with its sheet row and reason in
      **`8_thraasu/NANMA-IMPORT-NOTES.md`**: all UK/Hyza coconut oil and Milma ghee rows (prices
      shifted), Punerva gingelly 200 ml (₹1), glucose (₹0), 8 double entries, 3 shared SKUs, and the
      unclear "con flower" / "savoonari". Karthik fixed sugar ₹59, jaggery ₹85, kaima rice ₹190,
      Robusta ₹45 per kg.
      A corrected sheet re-imports with `python3 8_thraasu/tools/nanma-import.py "<sheet>.xlsx"`
      (names/categories live in `tools/nanma-table.txt`, one line per sheet row).
- [ ] *(review)* MeterSmart now uses the **Aug 2025 Bengaluru tariff** (₹36 + ₹18/km,
      waiting ₹10 per 15 min after 5 free). It was checked on 2026-10-10 against press
      reports of the 14 Jul 2025 DTA notification. Confirm it against the notification
      itself, and settle whether meters step per km or per 100 m (`ponytail:` in `fareBreakdown`).
- [ ] *(review)* PG Buddy ships **sample** listings (`"sample": true` shows a banner). When
      real, visited PGs replace them, set `sample: false`. Set `verified` only together with
      a `verifiedOn` date, since `validPGs()` rejects one without the other.

## 4. Missing artifacts before Play submission

- [ ] **LingoLocal audio is synthesised**, not a native speaker (macOS `kn_IN` voice
      via `tools/gen-audio.mjs`). It solves availability — most Android devices ship
      no Kannada TTS at all — but not accent. A native speaker should review all 108
      phrases (is ನೇರೆ ಹೋಗಿ idiomatic?) and re-record; replacements are a drop-in under
      the same filenames, then re-run the tool for the manifest.
- [ ] **Thraasu Malayalam is unreviewed.** The add-item copy (2026-10-11) is listed in its spec. The UI copy and the 459 product names (Nanma Store) were written
      by the build agent. A native speaker should read every label in `8_thraasu/index.html`
      and every `ml` field in `products.json`. Thraasu also needs a `privacy.html` before Play.
- [ ] **CardGuard Play Billing**: create the `cardguard_premium_yearly` product in
      Play Console, and verify bubblewrap's `alphaDependencies.playBilling` field
      name against the installed `@bubblewrap/core` before wiring it into
      `scripts/generate-twa.mjs` — it was not verifiable offline.

## 5. Unblocked only by Phase A / Phase C

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

## 6. Verification debt

- [ ] *(review)* **One real Android device:** StockPing restock alerts and CardGuard
      in-app reminders now go through `registration.showNotification`, because
      `new Notification()` throws on Chrome for Android. This was proven in headless Chrome
      with the constructor forced to throw. Confirm once on a phone.
- [ ] *(review)* **CardGuard Gmail Sync with a real Client ID.** The COOP detach is live
      (2026-10-10: `curl -sI https://tinkerhouse.uk/7_card_guard/ | grep -i opener` prints
      nothing; the other apps still send `same-origin`). One real sync proves the OAuth popup
      gets its `window.opener`.
- [ ] **StockPing's proxy origins in `connect-src`** are in `_headers` but were never
      exercised live — driving that path hits the real CORS proxies and real retail
      sites. Confirm on the first live deploy.
- [ ] **LingoLocal `clip.play()` under a real user gesture** — not verifiable in
      automation (the tab stays `visibilityState: hidden` and Chrome blocks media
      there). Decode is proven end to end; one tap on a real device closes it.
- [ ] **Thraasu sheets with a real keyboard** (2026-10-11, `966fa2b`): sheets fit above the keyboard via
      `visualViewport`, proven in a Chrome simulation only. Open the add sheet with the keyboard up once on an
      iPhone and once on an Android phone: title, name box and Add button visible, the middle scrolls.
- [ ] **Thraasu printing on a real phone.** `window.print()` is proven to fire with the PDF
      title `Thraasu-Bill-NNNN`, and print media is proven to show only the receipt. Not proven:
      Android's dialog itself, a Wi-Fi printer, and a 58 mm Bluetooth printer through RawBT.
      **iPhone:** Print is a plain `window.print()`, **confirmed in Safari on Karthik's iPhone
      2026-10-10**; Firefox Focus ignores it, so a separate **Share** button sends the bill as a
      576 px PNG (share sheet → Print / WhatsApp), **confirmed in Firefox Focus 2026-10-10**. WebKit defers `print()` while
      any image is still loading, so on a slow connection the sheet can lag the tap.
- [ ] **Thraasu photos are generic Unsplash stock** (option C, photo tiles, chosen 2026-10-10; review
      page https://claude.ai/artifact/VQ4SJJgo6EWVLy6BQ91Dtp). Swap in a shop's own photos as
      `img/<id>.webp` under a **new filename** (installed copies cache photos by URL); credits in
      `8_thraasu/img/CREDITS.md`.
- [ ] **CardGuard notification actually painting** — same shape: proven up to and
      including the `showNotification` call; needs one tap on a real device.

- [ ] **Cloudflare Web Analytics is on but blocked.** Pages injects
      `static.cloudflareinsights.com/beacon.min.js`, and every app's CSP blocks it, so no
      analytics are collected. Either switch it off in the Pages project, or add that origin
      to `script-src` and `cloudflareinsights.com` to `connect-src` per app. Karthik's call.

## 7. Design findings — all pre-existing, none introduced by recent work

`git blame` puts every one of these in `446e6c1` (2026-04-09) and `012801f`
(2026-04-10). Run `/impeccable audit` for the authoritative current list.
**No ignore command has been run** — suppressing a finding needs Karthik's explicit
confirmation, and none has been given.

The two "worth fixing" LingoLocal findings (purple glow, `width` transitions) were fixed on
2026-10-10, along with PowerPulse's `height` transition.

Taste calls — Karthik's decision, do not "fix" unasked:

- [ ] `[overused-font]` Inter — `6_stock_ping/index.html:14`, `3_pg_buddy/index.html:15`.
      Note this now interacts with `_headers`: the CSP pins `fonts.googleapis.com`
      and `fonts.gstatic.com`, so a self-hosted face needs `font-src 'self'` and a
      non-Google host needs adding to `style-src`/`font-src`/`connect-src` alike.
- [ ] `[bounce-easing]` — `5_lingo_local/index.html:194,349,626` and
      `3_pg_buddy/index.html:146,395`. The `cubic-bezier(…1.275)` card overshoot is
      the more defensible; the `dotBounce` loader dots are the more dated.

## 8. Standing rule

Per `EXECUTION_PLAN.md` §0.2: **one app per change-set.** Design fixes are app code
and do not belong in an infrastructure commit. Every session appends a §0.4 Audit
Log row before it closes.
