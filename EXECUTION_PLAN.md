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
| 7 CardGuard | Card bill reminders, Gmail import | localStorage + optional Gmail API | Functional locally |

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

### Phase A — Web live (Week 1)
1. Create Cloudflare Pages project → connect this GitHub repo → root deploys landing page + all 7 apps at `/1_power_pulse/` etc. (already relative-path friendly).
2. Buy one domain (e.g. `blrapps.in`, ~₹800/yr). Subpath or subdomain per app (`meter.blrapps.in`).
3. Add `_headers` file for security headers (see §6).
4. Bump all service worker cache versions once at launch.

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

### 4.3 StockPing (highest passive-income potential)
- P0: Server-side checking (Workers cron + KV) + Web Push — see Phase C. Client proxies (allorigins/corsproxy) are the #1 reliability and privacy problem (they see every tracked URL).
- P0: **Affiliate rewrite**: when a tracked Amazon/Flipkart product is opened or a restock alert links out, append Amazon Associates / Flipkart Affiliate / EarnKaro tags. This is the core monetization and needs zero UI change.
- P1: Price tracking alongside stock (same scrape, one more regex), price-drop alerts.
- P1: Per-site scrapers (Amazon/Flipkart have stable JSON-LD blocks — more reliable than keyword regex).
- P2: Public "deal feed" page from aggregated restocks (SEO surface → more affiliate clicks).

### 4.4 CardGuard
- P0: Move Gmail OAuth to backend (§6.3). Never ask users to paste an OAuth client ID (current UX is developer-grade, not consumer-grade).
- P0: Server-side reminder push (Workers cron reading Supabase) so reminders fire with the app closed — the entire value proposition.
- P1: Premium tier (₹99/yr via Play Billing): unlimited cards, Gmail auto-sync, family sharing. Free: 2 cards, manual entry.
- P2: Spend insights from statement parsing (on-device only — privacy selling point).

### 4.5 PowerPulse
- P0: Shared backend (Supabase realtime) — without it this is a demo. Anonymous device-id + Worker rate-limit (1 report / area / 10 min / device).
- P0: Scrape BESCOM's official scheduled-outage page (Workers cron) and merge with community reports — official data solves the cold-start problem (community apps die without seed data).
- P1: Area-subscription web push ("outage reported in HSR Layout").
- P2: Ward-level accuracy, BWSSB water tanker booking info.

### 4.6 PG Buddy
- P0: Real listings in Supabase; owner submission form (free) with your manual verification (the "Verified" badge becomes the paid product).
- P1: Monetize: featured placement ₹299/mo per PG; lead generation (owner gets seeker's contact) ₹49/lead.
- P1: Photos via Supabase Storage (free 1GB), WhatsApp deep-link contact button.
- P2: Seeker accounts, saved-search alerts.

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
1. **No CSP on any app.** Add via Cloudflare Pages `_headers`:
   `Content-Security-Policy: default-src 'self'; script-src 'self' https://accounts.google.com 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co https://gmail.googleapis.com`
   (inline scripts/styles are structural to these single-file apps — `'unsafe-inline'` is the pragmatic compromise; migrating to hashed inline scripts is P2). Also add `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
2. **StockPing leaks every tracked URL to third-party CORS proxies** (allorigins.win, corsproxy.io) — privacy + reliability issue. Fixed by Phase C server-side checking.
3. **CardGuard client-side OAuth**: user pastes a Google Client ID; token has `gmail.readonly` scope in browser memory. Move to backend: Worker holds client secret, does the OAuth code flow, parses emails server-side, returns only extracted card metadata; token never touches the client. Until then, the feature should be labeled "advanced/self-hosted".
4. **NestHub QR passes are decorative** — anyone can screenshot/forge. Must become signed tokens before any real society uses it (§4.7).
5. **localStorage is unencrypted** — CardGuard stores bank + last-4 + amounts. Acceptable risk (no PAN/CVV, device-local), but never store more than last-4; state this in the privacy policy.
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
| C2 | 5–6 | CardGuard backend push + Play listing; AdSense live on web apps | Reminder push with app closed; first ad impression |
| D | 7–8 | PowerPulse Supabase backend + BESCOM scrape; Play listing | Two devices see each other's reports in <5s |
| E | 9–12 | PG Buddy real listings + owner funnel; LingoLocal IAP | First paying PG owner OR first IAP |
| F | later | NestHub pilot; iOS/Capacitor for best performer | Only if revenue justifies |

**Kill criteria (be honest):** if an app has <100 MAU and ₹0 revenue after 3 months live, freeze it (it stays deployed at zero cost — that's the beauty of this stack) and reinvest effort in the leaders.

---

## 8. HANDOFF CHECKLIST FOR THE NEXT MODEL/SESSION
- [ ] Commit + push this working tree (7 modified apps + WORK_LOG.md + this file + PLAYBOOK.html).
- [ ] Browser smoke test all 7 (Verify Gate §0.3 — NOT yet done for the 2026-07-11 fixes).
- [ ] Bump all 7 service worker cache versions.
- [ ] Phase A: Cloudflare Pages deploy.
- [ ] Append your row to the Audit Log (§0.4).
