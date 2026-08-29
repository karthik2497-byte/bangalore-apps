# BANGALORE-APPS — MASTER EXECUTION PLAN
**Version:** 1.0 · **Date:** 2026-07-11 · **Owner:** Karthik · **Author:** Claude Code session
**Companion docs:** [WORK_LOG.md](WORK_LOG.md) (completed fixes) · [PLAYBOOK.html](PLAYBOOK.html) (visual architecture playbook)

**Goal:** Turn 7 single-file Bangalore utility PWAs into live, low-maintenance apps on Android (and optionally iOS) that generate passive income, using only free-tier infrastructure that holds up long-term.

---

## 0. FORCED AUDIT PROTOCOL — MANDATORY FOR ANY MODEL/AGENT WORKING ON THIS REPO

> Any AI model or human picking up work in this repo MUST complete this protocol.
> Do not skip steps. Do not mark a phase complete without the required evidence.

### 0.1 Before touching any code (READ GATE)
1. Read `WORK_LOG.md` — what has already been fixed. Do not re-fix or regress these.
2. Read this file top to bottom.
3. Read the target app's entire `<script>` block before editing it (find it: `grep -n '<script>' <app>/index.html`). These files are 2–3k lines; the JS is at the bottom.
4. Check the Audit Log (§0.4) for the last entry on the app you're touching.

### 0.2 While working (CHANGE RULES)
- One app per change-set. Never batch edits across apps in one commit.
- Any string that originates from user input and reaches `innerHTML` MUST pass through the app's `esc()`/`escapeHtml()` helper. This repo was bitten by this 5 times already.
- Never put single-quoted user data inside inline `onclick="..."` attributes — pass IDs, look up the object inside the function (see StockPing `openProductPage()` for the pattern).
- Never add a dependency/CDN script without recording the justification in the Audit Log.
- If you change any app's assets or logic, bump its service worker `CACHE_NAME` (e.g. `powerpulse-v1` → `powerpulse-v2`), otherwise users keep the stale cached version indefinitely.

### 0.3 Before declaring done (VERIFY GATE — all four required)
1. **Syntax:** extract inline scripts and run `node --check` (see WORK_LOG for the python one-liner).
2. **Runtime:** serve the app (`python3 -m http.server`) and load it in a browser; exercise the changed flow, check console for errors.
3. **Persistence:** reload the page and confirm localStorage state survives and renders.
4. **Regression:** open every tab of the app once.

### 0.4 Audit Log (append one row per work session — MANDATORY)

| Date | Model/Agent | App(s) | What changed | Verify gate evidence | Regressions found |
|---|---|---|---|---|---|
| 2026-07-11 | Claude (Fable 5) | all 7 | Bug/XSS fix pass, see WORK_LOG.md | node --check all 7 PASS; browser smoke test NOT done | — |
| 2026-08-29 | Claude (Opus 5) | all 7 (deploy config only) | Phase A repo side. `_headers` extended from 3 apps to all 7; added `scripts/build-site.sh` so Pages deploys a `dist/` containing only the site, never the plan/work-log/tests, with the build failing if a stray file or an under-specified CSP gets through. `pgs.json` given MeterSmart's `must-revalidate` rule. No app code touched. Pages project + domain deliberately not done — account login, OAuth grant and a purchase are Karthik's to make. | Served `dist/` through a local server that applies `_headers` verbatim and drove it in Chrome. **Found two real CSP bugs this way that reading the file did not show:** MeterSmart and LingoLocal had no Google Fonts origin at all, and every app's SW inherits its app CSP so the pass-through `fetch()` needs the font origins in `connect-src` too — reproduced as `TypeError: Failed to fetch` from inside the worker, fixed, re-verified. Post-fix, under the real headers with the real SW controlling: LingoLocal loaded both webfonts and decoded a bundled clip (0.94 s) over `connect-src 'self'`; PG Buddy loaded 8 listings from `pgs.json`, cached them, and the response carried `public, max-age=0, must-revalidate`; CardGuard loaded `reminder-core.js` under `script-src 'self'` and rendered. Build guard mutation-tested: dropping one font origin from one CSP fails the build. All 4 test suites still PASS. | None introduced. **Found, not mine:** `4_nest_hub` and `6_stock_ping` had uncommitted `showToast` innerHTML→append fixes with matching SW bumps sitting in the working tree from another session — left untouched and reported rather than swept into this commit. |
| 2026-08-29 | Claude (Opus 5) | all 7 (fixes: NestHub, StockPing) | Closed the 2026-07-11 browser-smoke-test debt for all 7 apps. Found + fixed XSS in `showToast()` (`innerHTML = icon + message`) in NestHub and StockPing — fixed in the shared function, message now appended as a text node. SW bumps: nesthub-v2, stockping-v3. | node --check 14 inline blocks + 7 SWs PASS; all 7 driven in Chrome with SW/caches cleared first; NestHub XSS reproduced pre-fix and inert post-fix; PowerPulse 12h auto-expiry 5→4 active / 2→3 resolved; RSVP 18→19 with SVG attrs intact; Cancel Pass 3→2; persistence survived reload on both; all 29 tabs across 7 apps render; 0 app console errors | **XSS in NestHub + StockPing `showToast()`** — missed by the 2026-07-11 pass, reachable from a visitor name and from a scraped product name. Fixed. |
| 2026-08-20 | Claude (Opus 5) | CardGuard | §4.4 backend-free path: background reminders via `periodicsync` + a Cache Storage state mirror the worker can read, with the whole reminder rule extracted to a new `reminder-core.js` shared by page, worker and tests (the page's five date/format helpers became wrappers over it). Premium tier (free = 2 cards; ₹99/yr via Digital Goods API + PaymentRequest, with Restore), Gmail import relabelled Advanced + Premium-gated + warned, on-device spend insights, `privacy.html`, CardGuard CSP and `payment=(self)` in `_headers`. New `test-cardguard.mjs`. SW → `cardguard-v2`. No new dependencies. Gmail-OAuth-to-backend (§6.2 #3) and family sharing deliberately not done — both need a server. | node --check both inline blocks + SW + core PASS; `test-cardguard.mjs` 34 cases PASS, mutation tested 16/16 killed (the `dueDay` range-check survivor was a real gap — an imported backup with a negative day reminds forever — and got a test; a 17th mutant, day stamp → `toISOString()`, is equivalent and was dropped); browser run at :8904 with SW+caches cleared — fresh install cached 7 files, free plan admitted 2 cards and paywalled the 3rd with the right copy, web-side purchase/restore refused to grant anything, **the Test button proved the full background chain: page mirror → worker read → importScripts core → correct reminders selected → showNotification attempted → failure reported back, with `notified` left empty so it retries**, paying a bill removed it from the worker's due list, snooze silenced today but not tomorrow, insights arithmetic hand-checked, all 4 tabs + every modal + reload persistence, 0 app console errors | None. **Not verifiable headlessly:** the notification actually painting — granting the OS permission needs a click on a browser prompt, and `Notification.requestPermission()` from automation froze the tab. Proven up to and including the `showNotification` call; one tap on a real device closes it. |
| 2026-08-15 | Claude (Opus 5) | PG Buddy | §4.6 backend-free path: listings extracted from `index.html` into versioned `pgs.json` (validated, cache→network, SW network-first), owner submission form → WhatsApp/mailto intent, real WhatsApp contact per listing replacing a fake toast, budget slider became a real filter. New `pgs.json`, `test-pgs.mjs`. SW → `pgbuddy-v2`. No new dependencies. Supabase-dependent P1 items deliberately not done. | node --check both inline blocks + SW PASS, `pgs.json` parses; `test-pgs.mjs` 28 cases PASS, mutation tested 14/14 killed (the `res.ok` survivor was a real gap — a non-OK response with a parseable body — and got a test); browser run at :8903 with SW+caches cleared — 8 listings loaded from JSON and cached, budget filter correct at 20k/10k/7k/5k (8/5/2/0 shown), **live v1→v2 publish picked up a 9th listing into the deck, the selects and its contact button, with `listingContact` from the file driving the submission target**, WhatsApp intents correct (`wa.me/91…`, prefilled), blank number warns instead of opening an empty chat, owner form validates and rejects bad phone/rent, all 4 tabs render, compare + detail modal render from loaded data, 0 console errors. `pgs.json` restored to v1 afterwards. | None. The 8 rows are still the original demo listings — real ones replace them. Contact numbers ship blank by design. |
| 2026-08-15 | Claude (Opus 5) | StockPing | §4.3 P0 affiliate rewrite + P1 price tracking + P1 JSON-LD scrapers. Consolidated the duplicated proxy list / regex sets / post-check bookkeeping that `checkProduct` and `fetchAndDetect` held a copy of each. New `test-stockping.mjs`. SW → `stockping-v2`. No new dependencies. P0 server-side checking deliberately NOT done — no Workers project exists yet. | node --check both inline blocks + SW PASS; `test-stockping.mjs` 26 cases PASS, mutation tested 13/14 killed (survivor is a deliberately redundant `oldPrice != null` guard, documented in place — the `<=` survivor was a real gap and got a test); browser run at :8902 with SW+caches cleared and `fetch` stubbed so the CORS proxies were never contacted — JSON-LD detection end to end (name/price/status), restock+drop produced one stock and one price alert, Buy now tagged exactly once while preserving `ref`, untagged config passed URLs through clean, Flipkart got `affid` not `tag`, Myntra untouched, disclosure appeared only with a tag set, legacy type-less alerts still render, reload persistence, all 3 tabs, 0 console errors | None. Legacy alerts saved before this change have no `type` field; `renderAlerts` treats a missing type as a stock change, verified with a synthetic legacy record. |
| 2026-08-15 | Claude (Opus 5) | LingoLocal | §4.2 P0+P1: 108 bundled Opus clips + SW precache, SM-2-lite spaced repetition driving both the flashcard deck and the quiz, 3 new scenario packs (16→19 scenarios, 90→108 phrases). New `tools/gen-audio.mjs`, `test-srs.mjs`. SW → `lingolocal-v2`. No new dependencies. | node --check both inline blocks + SW PASS; `test-srs.mjs` 15 cases PASS, mutation tested 10/10 killed (1 survivor was dead code — an explicit tie-break made redundant by ES2019 stable sort — deleted rather than tested); browser run at :8901 — fresh install after clearing SW+caches, 108/108 clips precached into `lingolocal-v2`, deck reorder verified in the live UI (learned markers followed the phrases, not the positions), bookmarks keyed by original index, quiz picks most-overdue and grades it, reload persistence, all 3 tabs render, 0 console errors | None. **Not verifiable headlessly:** `clip.play()` under a real user gesture — the automation tab stays `visibilityState: hidden` and Chrome blocks media there. Everything up to decode is proven (valid `OggS`, `canPlayType` = "probably", `decodeAudioData` → 2.30s/mono/48kHz) and a missing clip provably falls back to TTS, so worst case is graceful degradation. Tap Speak once on a real device to close it. |
| 2026-08-01 | Claude (Opus 5) | MeterSmart | §4.1 roadmap P0+P1+P2 shipped: remote `fares.json` rate config, verified-date UI, ride-app estimates, night auto-detect, WhatsApp/email complaint intents, Kannada toggle. Added `privacy.html`, repo `_headers`, SW → `metersmart-v2`. No new dependencies. | node --check both inline blocks + SW PASS; browser run at :8899 — fresh install, reload persistence, all 5 tabs, live v1→v2 rate push (10 km ₹150→₹174, routes recomputed), night surcharge math, validator rejects 5 bad configs, 0 console errors | None found. Route-card fares are now derived, and they reproduce the previously hardcoded values exactly (₹120/₹240/₹180/₹525/₹270). |

---

## 1. CURRENT STATE (verified 2026-07-11)

| App | What it is | Data | Realness |
|---|---|---|---|
| 1 PowerPulse | BESCOM/BWSSB outage tracker | localStorage (added) | Mock/demo — no shared data |
| 2 MeterSmart | Auto fare calculator + complaint generator | localStorage | Fully functional offline tool |
| 3 PG Buddy | PG discovery, swipe UI, reviews | Hardcoded 8 PGs | Mock/demo |
| 4 NestHub | Apartment community (visitors, dues, events) | localStorage + mock | Mock/demo |
| 5 LingoLocal | Kannada phrasebook, flashcards, quiz, TTS | Static content + localStorage | Fully functional offline tool |
| 6 StockPing | E-commerce stock tracker | localStorage + live fetches via CORS proxies | Semi-real (proxy-dependent) |
| 7 CardGuard | Card bill reminders, Gmail import | localStorage + Cache Storage mirror + optional Gmail API | Functional; reminders fire with the app closed (installed PWA on Chromium) |

Infrastructure that already exists: PWA manifests + service workers per app, landing page, GitHub Actions workflow building Android AABs (Gradle/TWA, `.github/workflows/build-aab.yml`, `scripts/generate-twa.mjs`).

Key insight for planning: **MeterSmart and LingoLocal are shippable today** (no backend needed). **StockPing and CardGuard are shippable with a small backend**. **PowerPulse, PG Buddy, NestHub are demos until they get a shared backend** — their entire value is community data.

---

## 2. RECOMMENDED STACK (free-tier, durable)

Chosen for: generous free tiers that have historically NOT been rug-pulled, minimal ops, and one skill set across all 7 apps.

| Layer | Pick | Free tier reality | Why |
|---|---|---|---|
| Static hosting + CDN | **Cloudflare Pages** | Unlimited bandwidth/requests, 500 builds/mo. The most durable free tier in the industry. | All 7 apps are static files. Zero cost at any scale. |
| API/backend compute | **Cloudflare Workers** | 100k requests/day free, no cold-start pain | Stock checks, report APIs, cron jobs — all fit comfortably |
| Database | **Supabase** (Postgres + Auth + RLS + Realtime) | Free: 500MB DB, 50k MAU auth. ⚠ pauses after 1 week of inactivity — mitigate with a Workers cron ping. | Karthik already runs mangai-website on Supabase — zero new learning. Row Level Security is the security model. |
| KV/cache/simple data | **Cloudflare KV / D1** | KV 100k reads/day; D1 5M reads/day free | For StockPing product status — cheaper than Postgres for this shape |
| Scheduled jobs | **Cloudflare Cron Triggers** | Free with Workers | StockPing periodic checks, CardGuard reminder dispatch, Supabase keepalive |
| Push notifications | **Web Push (VAPID) via Workers** + FCM free tier for TWA | Both free, unlimited for this scale | The killer feature for StockPing/CardGuard/PowerPulse |
| Auth | Supabase Auth (email OTP / Google) | free | Only needed for community apps |
| Android distribution | **TWA via existing Bubblewrap workflow** → Play Store | $25 one-time developer fee | Workflow already exists in repo |
| iOS distribution | Phase 1: installable PWA (free). Phase 2 (only if revenue justifies): **Capacitor** wrap | Apple dev = $99/yr — defer until income > cost | PWAs on iOS support A2HS, push (iOS 16.4+), offline |
| Analytics | Cloudflare Web Analytics | free, no cookie banner needed | Know which app to invest in |
| Error tracking | Sentry free tier (5k events/mo) | free | Optional, add when live |

**Explicitly avoided:** Heroku-style dynos (free tier killed), Firebase Firestore as primary DB (lock-in, costs spike), Railway/Render free tiers (sleep + limited hours), running your own VPS (not passive).

**Total fixed cost to go live on Android: $25 one-time + ~$10/yr for a domain.** Everything else $0 until real traction.

---

## 3. GO-LIVE PATH — ANDROID & iOS

### Phase A — Web live (Week 1) — 🟡 repo side DONE 2026-08-29, account side needs Karthik
1. ❌ Create Cloudflare Pages project → connect this GitHub repo. **Needs Karthik** — it is an account login and an OAuth grant, which an agent must not do. Settings to use:
   - Build command: `bash scripts/build-site.sh` · Output directory: `dist`
   - **Do not deploy the repo root.** Pages serves whatever is in the output directory, and the root is not the site: `EXECUTION_PLAN.md`, `WORK_LOG.md`, `PLAYBOOK.html`, `MISTAKES.md` and every `test-*.mjs` would be fetchable on the live domain. `scripts/build-site.sh` copies only `index.html`, `_headers` and the 7 app folders into `dist/`, and **fails the build** if anything else lands there.
2. ❌ Buy one domain (e.g. `blrapps.in`, ~₹800/yr). **Needs Karthik** — a purchase. Subpath or subdomain per app (`meter.blrapps.in`).
3. ✅ `_headers` now carries a CSP for **all 7 apps**, not 3. Two real bugs were found and fixed by testing it against a live browser rather than reading it:
   - Every app loads its typeface from Google Fonts, but the MeterSmart and LingoLocal CSPs allowed only `style-src 'self'`. Those two apps would have shipped with no webfonts.
   - **Each app's service worker is served from the app's own path, so it inherits that app's CSP** — and its pass-through `fetch(event.request)` is a `connect-src` fetch regardless of what the page originally asked for. With `connect-src 'self'` every webfont died with `TypeError: Failed to fetch` the moment the SW took control. The font origins are now in `style-src`, `font-src` **and** `connect-src`, and `scripts/build-site.sh` fails the build if any CSP loses one.
   - Also added: `/3_pg_buddy/pgs.json` gets the same `must-revalidate` rule `fares.json` has, so a newly verified PG reaches clients on the next launch.
4. ⏭️ Bump all service worker cache versions once at launch — **deliberately not done.** Nothing is live, so no client holds a stale cache and a bump is pure churn. Do it on the *second* deploy onward, per §0.2.

### Phase B — Android / Play Store (Week 2–3)
1. Play Console account ($25 one-time).
2. The repo's GitHub Actions workflow already builds AABs per app via Bubblewrap/Gradle. Update each app's `assetlinks.json` on the live domain (TWA requirement — Digital Asset Links must match the signing key).
3. Ship **2 apps first**: MeterSmart + LingoLocal (no backend dependency, lowest review risk). Learn the review process on the simple ones.
4. Then StockPing + CardGuard after backend Phase C.
5. Listing assets: use each app's existing SVG icons; write 80-char + 4000-char descriptions; 4–8 screenshots (capture from Chrome device mode at 1080×2340).

### Phase C — Backend for the data apps (Week 3–6)
Priority order (income-weighted, see §5):
1. **StockPing**: Workers cron checks products server-side (kills the flaky client-side CORS-proxy dependency), stores status in D1/KV, sends Web Push on restock. This transforms it from "works while tab open" to a real product.
2. **CardGuard**: optional account sync (Supabase) + server-side reminder push. Gmail OAuth moves server-side (see §6.3).
3. **PowerPulse**: Supabase table `outage_reports` with RLS; anonymous device-id reporting + rate limit in a Worker; realtime subscription for live map.
4. **PG Buddy**: Supabase `pgs`, `reviews` tables; owner-submitted listings (this is the monetization surface).
5. **NestHub**: multi-tenant Supabase (society_id on every row + RLS) — biggest lift, do last.

### Phase D — iOS (only when monthly revenue > $15)
- PWAs already installable on iOS Safari; Web Push works on iOS 16.4+. Cost: $0. Do this immediately at Phase A (add `apple-touch-icon` ✓ already present).
- Native App Store only if an app proves revenue: wrap with Capacitor (same codebase), $99/yr. Candidates: CardGuard or LingoLocal (categories that monetize well on iOS).

---

## 4. PER-APP ENHANCEMENT ROADMAP

Format: P0 = must-have to be a real product · P1 = growth · P2 = later.

### 4.1 MeterSmart (ship first — zero backend) — ✅ DONE 2026-08-01
- ✅ P0: Fare table driven by one constant block (`DEFAULT_RATES`) with a visible "verified {date}" line. Every rate string in the UI (breakdown, toggles, popular-route fares, share text) is now derived from it — no hardcoded ₹30/₹15 left.
- ✅ P0: `2_meter_smart/fares.json` fetched on launch (cache-first, network-refresh, monotonic `version`, schema-validated, SW network-first). **Rate revisions ship by editing that one file — bump `version` or clients ignore it.**
- ✅ P1: Ola/Uber/Rapido estimate card (range derived from meter fare + platform fee, config-driven, labelled as an estimate). Night auto-detect at 10 PM–5 AM; a manual toggle sets `nightManual` and wins for the session.
- ✅ P1: Complaint → WhatsApp (`wa.me`, chooser when no number configured) and email (`mailto:`) intents, recipients configurable in `fares.json`.
- ✅ P2: Kannada UI toggle (`data-i18n` + `I18N` dict): header, bottom nav, calculator tab, breakdown, fair-fare badge, share button. **Not yet translated: Ride Log / Tips / Profile tab bodies** — add keys to `I18N` and `data-i18n` attributes as needed.
- Remaining before Play submission: fill the contact email in `privacy.html` (placeholder `REPLACE_WITH_CONTACT_EMAIL`), and optionally the verified BTP WhatsApp/email in `fares.json`.

### 4.2 LingoLocal (ship first — zero backend) — ✅ P0+P1 DONE 2026-08-15
- ✅ P0: Bundled audio for all 108 phrases (`audio/*.opus`, 487 KB total), precached by the SW at install so the app is fully voiced offline. Generated by `tools/gen-audio.mjs` from the macOS `kn_IN` voice — **synthesised, not a native speaker.** It solves availability (most Android devices ship no Kannada TTS at all); replacing the files with human recordings is a drop-in, same filenames, re-run the tool for the manifest only.
- ✅ P1: SM-2-lite spaced repetition (`ll_srs` in localStorage). One scheduler drives two surfaces — the flashcard deck is ordered most-overdue-first and the quiz asks the most-overdue phrase. Grades come from existing UI (marking Learned = 5, quiz correct = 4, quiz wrong = 2), so no new buttons.
- ✅ P1: 3 new packs — At the Office (Daily Life), At the Hospital (Emergencies), Temples & Festivals (Social). 16 → 19 scenarios, 90 → 108 phrases. Reused existing categories/themes, so zero CSS change.
- P2: "Phrase of the day" web push.
- **Before Play submission:** a native Kannada speaker should review the 18 new phrases and re-record the audio. Also needs a `privacy.html` (MeterSmart's is the template).

### 4.3 StockPing (highest passive-income potential) — 🟡 PARTIAL 2026-08-15 (backend items still open)
- ❌ P0: Server-side checking (Workers cron + KV) + Web Push — **still open, blocked on Phase A/C.** Client proxies (allorigins/corsproxy) remain the #1 reliability and privacy problem (they see every tracked URL). Marked with a `ponytail:` comment at the proxy list.
- ✅ P0: **Affiliate rewrite** — `affiliateUrl()` tags outbound Amazon (`tag=`) and Flipkart (`affid=`) links, applied in `openProductPage()`, which every outbound click now routes through (including the new "Buy now" button on restock/price-drop alerts). **Tags are unset in `AFFILIATE` — fill them in from the Associates/Flipkart dashboards to switch revenue on.** An unset tag passes the URL through untouched, so shipping with blanks is safe.
- ✅ P1: Price tracking — `price` + `lowestPrice` per product, shown on the card, with price-drop alerts and notifications. Only a genuine drop alerts; unchanged/rising/first-seen prices do not.
- ✅ P1: Per-site scrapers — schema.org JSON-LD (`offers.price` / `offers.availability`) is now the primary parser, with the old keyword regex as fallback. Fixes the case where a "Sold Out" string in a recommendation carousel decided the answer for the tracked product.
- P2: Public "deal feed" page from aggregated restocks (SEO surface → more affiliate clicks).
- **Before revenue:** fill in `AFFILIATE`, and add a `privacy.html` (the app discloses affiliate earnings in Settings once a tag is set, but Play + Associates also want a policy page).

### 4.4 CardGuard — 🟡 PARTIAL 2026-08-20 (backend-free path shipped)
- ✅ P0 (re-scoped): **Reminders now fire with the app closed, with no server at all.** Every input to the decision is already on the device; what was missing was a wake-up and a way for the service worker to see the data. `reminder-core.js` holds the one copy of the rule (page `<script src>`, SW `importScripts`, tests), the page mirrors `{cards, settings, paidCycleKeys, notified}` into Cache Storage (`cardguard-state`), and a `periodicsync` registration (`cardguard-check`, 12 h) runs the same check in the worker. **Workers cron + Web Push are no longer needed for reminders** — reconsider them only if reminders must survive the app being uninstalled, or must reach iOS.
  - Ceiling, stated in the UI rather than hidden: `periodicSync` is Chromium-only and only in an installed PWA. Settings shows Active / "Install to your home screen" / "Not supported here", and a Test button runs the worker's check on demand and reports the real result.
- ❌ P0: Gmail OAuth still client-side — **still open** (§6.2 #3). Now labelled **Advanced**, gated behind Premium, and carrying a warning that says what the design means. Moving it to a Worker is unchanged work.
- ✅ P1: Premium tier — free plan 2 cards + manual entry, ₹99/yr unlocks unlimited cards and Gmail auto-sync, via **Play Billing through the Digital Goods API** with Restore purchase. Outside the Play-installed TWA the billing service does not resolve and the button says so, rather than faking a sale. **Family sharing not built** — it needs accounts, which means a backend.
  - **Before revenue:** create the `cardguard_premium_yearly` product in Play Console, and enable Play Billing in the TWA build (bubblewrap `alphaDependencies.playBilling` — verify the field name against the installed `@bubblewrap/core` before wiring it into `scripts/generate-twa.mjs`, it was not verifiable offline). Purchases are acknowledged locally; server-side receipt validation is Phase C2.
- ✅ P2: Spend insights — six-month chart, monthly average, highest-spend card, derived on-device from recorded payments. Statement parsing deferred: recorded payments are the same numbers a parser would produce, so parse statements only when users ask for line items.
- ✅ `privacy.html` added (§6.2 #5 honoured: last-4 only, and the policy says so). CSP + `payment=(self)` added to `_headers` (§6.2 #1 closed for this app).
- **Before Play submission:** fill the contact email in `privacy.html` (placeholder `REPLACE_WITH_CONTACT_EMAIL`).

### 4.5 PowerPulse
- P0: Shared backend (Supabase realtime) — without it this is a demo. Anonymous device-id + Worker rate-limit (1 report / area / 10 min / device).
- P0: Scrape BESCOM's official scheduled-outage page (Workers cron) and merge with community reports — official data solves the cold-start problem (community apps die without seed data).
- P1: Area-subscription web push ("outage reported in HSR Layout").
- P2: Ward-level accuracy, BWSSB water tanker booking info.

### 4.6 PG Buddy — 🟡 PARTIAL 2026-08-15 (backend-free path shipped)
- ✅ P0: Listings moved out of `index.html` into `3_pg_buddy/pgs.json` (versioned, schema-validated, cache-first + network-refresh, SW network-first). **Adding or verifying a PG is now a one-file edit + redeploy.** The row shape is deliberately Supabase-compatible — when it moves, changing the fetch URL in `refreshPGs()` is the whole migration.
- ✅ P0: Owner submission form (Profile tab) → prefilled WhatsApp / mailto intent, recipients configurable via `listingContact` in `pgs.json`. Not a DB write: submissions come to you, you verify by visiting, which is what makes the "Verified" badge worth selling.
- ✅ P1: WhatsApp deep-link contact per listing, replacing a fake button that toasted "Contact details copied!" while doing nothing. Numbers live in `pgs.json` and **ship blank** — inventing plausible Indian mobile numbers would point real users at real strangers. The button says so rather than opening an empty chat.
- ✅ Budget slider is a real filter now (was a label-only preference; listed as a deliberate skip in WORK_LOG). Defaults to "Any budget" so the app does not open with two thirds of the listings hidden.
- ❌ P1: Featured placement ₹299/mo, lead-gen ₹49/lead — needs the sales motion, not code.
- ❌ P1: Photos via Supabase Storage — needs Supabase.
- P2: Seeker accounts, saved-search alerts.
- **Before revenue:** fill `listingContact` in `pgs.json`, and fill `phone`/`ownerName`/`verifiedOn` per listing as each PG is actually verified. The current 8 rows are the original demo data — real listings replace them.

### 4.7 NestHub (largest ceiling, largest lift — do LAST)
- P0: Multi-tenant Supabase schema (`societies`, `flats`, `members`, `visitors`, `dues`, `notices` — RLS on society_id).
- P0: Real QR passes (signed payload: JWT in QR; guard-side scanner page verifies signature). The current decorative QR must be replaced before any real deployment.
- P1: Pilot with ONE society (yours, if applicable) before generalizing.
- P2: This is a B2B SaaS (₹2–5/flat/month), not passive income — park it until the passive apps are live.

---

## 5. PASSIVE INCOME PLAN

Ranked by (income potential × passivity ÷ effort):

| Rank | App | Model | Mechanism | Realistic 12-mo range* |
|---|---|---|---|---|
| 1 | StockPing | **Affiliate commissions** | Amazon Associates (up to ~8%/category), Flipkart Affiliate, EarnKaro/Cuelinks aggregator. Every restock alert is a high-intent purchase click. | ₹2k–40k/mo if it finds an audience (sneaker/GPU/console restock niches) |
| 2 | PG Buddy | **Listing fees / leads** | Featured listings + pay-per-lead from PG owners. Bangalore has thousands of PGs with real marketing budgets. | ₹0 until listings exist; then ₹5k–50k/mo. Semi-passive (verification work). |
| 3 | CardGuard | **Freemium subscription** | Play Billing ₹99/yr premium. Finance apps convert at 2–5%. | ₹1k–10k/mo at 5–20k installs |
| 4 | LingoLocal | **One-time IAP + ads** | ₹149 "unlock all packs" + AdMob banner in TWA-wrapped free tier. Newcomers-to-Bangalore is a perpetual audience. | ₹500–8k/mo |
| 5 | PowerPulse | **AdSense + sponsorship** | Display ads on web; hyperlocal sponsor slot ("powered by X inverters"). | ₹200–5k/mo, needs traffic |
| 6 | MeterSmart | **AdSense** | Pure utility, ad-supported. SEO surface: "bangalore auto fare calculator". | ₹100–3k/mo |
| 7 | NestHub | B2B SaaS | Not passive. Park it. | — |

\* honest ranges, not projections. The compounding strategy: every app cross-promotes the others via a shared "More BLR Apps" footer — one audience, seven surfaces.

**Sequencing rule:** do NOT build all monetization at once. Order: (1) StockPing affiliate tags (days of work, immediate), (2) AdSense on web versions (hours), (3) LingoLocal IAP, (4) CardGuard premium, (5) PG Buddy sales motion.

**Legal/compliance for India:** affiliate income needs disclosure text; AdSense needs privacy policy pages (add one static page per app — mandatory for Play Store listing anyway); Play requires a data-safety form (all apps currently store data on-device only → easy answers, keep it that way where possible).

---

## 6. SECURITY — AUDIT RESULTS & REQUIRED APPROACH

### 6.1 Completed this session (verified)
- ✅ XSS: all identified user-input→innerHTML paths escaped (5 apps). Pattern documented in §0.2.
- ✅ Inline `onclick` URL injection fixed (StockPing).
- ✅ Input validation tightened (CardGuard last-4 digits, MeterSmart complaint amounts).
- ✅ Sweep confirmed: no `eval`/`new Function`; only external script is Google GSI in CardGuard (legitimate, needed for OAuth).

### 6.2 Open findings (ordered by severity) — for the next work session
1. **CSP: done for MeterSmart, LingoLocal and CardGuard** (see `_headers`); still missing on PowerPulse / PG Buddy / NestHub / StockPing, whose network surface is not settled. Template:
   `Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://gmail.googleapis.com`
   (inline scripts/styles are structural to these single-file apps — `'unsafe-inline'` is the pragmatic compromise; migrating to hashed inline scripts is P2). Also add `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
2. **StockPing leaks every tracked URL to third-party CORS proxies** (allorigins.win, corsproxy.io) — privacy + reliability issue. Fixed by Phase C server-side checking.
3. **CardGuard client-side OAuth** — **still open.** User pastes a Google Client ID; token has `gmail.readonly` scope in browser memory. Move to backend: Worker holds client secret, does the OAuth code flow, parses emails server-side, returns only extracted card metadata; token never touches the client. Done 2026-08-20 in the meantime: the feature is labelled Advanced, gated behind Premium, and carries an in-app warning naming the exposure; `privacy.html` documents the Google Limited Use position.
4. **NestHub QR passes are decorative** — anyone can screenshot/forge. Must become signed tokens before any real society uses it (§4.7).
5. **localStorage is unencrypted** — CardGuard stores bank + last-4 + amounts. Acceptable risk (no PAN/CVV, device-local), but never store more than last-4. ✅ Stated in `7_card_guard/privacy.html` (2026-08-20), which also covers the Cache Storage mirror the background reminders read.
6. **No SRI on the GSI script tag** — Google rotates it so SRI isn't possible; CSP script-src allowlist (item 1) is the mitigation.

### 6.3 Security rules for the backend build-out (bind future agents)
- All Supabase tables get RLS from day one; anonymous community writes go through a Worker that enforces rate limits (device-id + IP) — never direct table inserts from the client for community data.
- Secrets live only in Worker/Supabase env vars. A pre-commit grep for `sk_`, `client_secret`, `service_role` is mandatory before every push.
- Server-side validation duplicates every client check (client checks are UX, not security).
- Web Push VAPID private key: Workers secret, never in repo.
- Follow the wiki hard rule: no secrets in the LLM wiki either.

---

## 7. PHASED TIMELINE (compounding, ~5–8 hrs/week)

| Phase | Weeks | Deliverable | Exit criteria (forced audit §0.3 applies) |
|---|---|---|---|
| A | 1 | All 7 live on Cloudflare Pages + domain + security headers + analytics | Lighthouse PWA pass on all 7; headers verified via curl |
| B | 2–3 | MeterSmart + LingoLocal on Play Store | Both approved & installable |
| C1 | 3–4 | StockPing backend (Workers cron + KV + Web Push) + affiliate tags | A real restock alert received with app closed; affiliate click tracked |
| C2 | 5–6 | CardGuard Play listing + premium product; Gmail OAuth to a Worker; AdSense live on web apps | Premium purchased end to end; first ad impression. (Background reminders already work without a server — §4.4.) |
| D | 7–8 | PowerPulse Supabase backend + BESCOM scrape; Play listing | Two devices see each other's reports in <5s |
| E | 9–12 | PG Buddy real listings + owner funnel; LingoLocal IAP | First paying PG owner OR first IAP |
| F | later | NestHub pilot; iOS/Capacitor for best performer | Only if revenue justifies |

**Kill criteria (be honest):** if an app has <100 MAU and ₹0 revenue after 3 months live, freeze it (it stays deployed at zero cost — that's the beauty of this stack) and reinvest effort in the leaders.

---

## 8. HANDOFF CHECKLIST FOR THE NEXT MODEL/SESSION
- [ ] Commit + push this working tree (7 modified apps + WORK_LOG.md + this file + PLAYBOOK.html).
- [ ] Browser smoke test all 7 (Verify Gate §0.3 — NOT yet done for the 2026-07-11 fixes).
- [ ] Bump all 7 service worker cache versions.
- [ ] Phase A: Cloudflare Pages deploy — repo side ready (`scripts/build-site.sh` → `dist`, `_headers` covers all 7 apps). Remaining: create the Pages project, connect the repo, buy the domain.
- [ ] Append your row to the Audit Log (§0.4).
