# Bangalore Apps — working agreement

Read this first. It is written to be agent-agnostic: Claude Code, Codex, Cursor,
Aider, Gemini and anything else that reads `AGENTS.md` get the same brief. Open
this repo at its **root**, never inside a single app folder — the apps share one
origin, one headers file and one build, and changes made from inside one folder
routinely break the other six.

## What this is

Seven standalone PWAs, each a single `index.html` with inline JS plus a service
worker and manifest. No framework, no bundler, no backend, no npm install.
`node` is used only to run the test files.

```
1_power_pulse  2_meter_smart  3_pg_buddy  4_nest_hub
5_lingo_local  6_stock_ping   7_card_guard
```

- `index.html` — landing page listing all 7
- `_headers` — Cloudflare Pages headers; a separate CSP per app
- `.well-known/assetlinks.json` — Digital Asset Links, one statement per Android app
- `scripts/build-site.sh` — assembles `dist/`; **fails the build** if a private file or an under-specified CSP gets through
- `scripts/verify-deploy.sh` — checks the deployed origin
- `EXECUTION_PLAN.md` — roadmap, audit log, per-app backlog. **The source of truth for what to do next**
- `MISTAKES.md` — one line per mistake that cost a retry. Read before touching an area it names

## Live

**https://tinkerhouse.uk** — Cloudflare Pages project `tinkerhouse`, connected to
this repo, auto-deploys on every push to `main`. Each app is a path:
`tinkerhouse.uk/2_meter_smart/`.

## Commands

```bash
bash scripts/build-site.sh          # build dist/ (also the CI build command)
bash scripts/verify-deploy.sh       # verify the live origin; exit code is the verdict
for t in [1-7]_*/test-*.mjs; do node "$t"; done   # 5 suites
node --check <file>                 # syntax-check any extracted inline script
```

## Rules that are load-bearing

1. **Never change the origin.** `tinkerhouse.uk` is baked into every user's
   `localStorage` (scoped per origin) and into every signed Android bundle.
   Changing it silently destroys user data and breaks every published app.
2. **Namespace every `localStorage` key.** All 7 apps share one origin and
   therefore one storage bucket. Existing prefixes: `pp_`, `meterSmart`,
   `pgbuddy_`, `nesthub_state`, `ll_`, `stockping_`, `cardguard_`. An unprefixed
   key will collide with another app.
3. **Keep paths relative.** `./service-worker.js`, `start_url: "./index.html"`.
   An absolute path escapes the app's subpath and lands on the site root.
4. **`_headers` only takes effect on Cloudflare Pages.** Nothing in this repo
   proves a CSP works. After deploying, run `scripts/verify-deploy.sh`.
5. **CI has coreutils only** — no `rsync`. Build scripts must assume a bare image.
6. **Verify before claiming done.** Syntax, runtime, persistence across reload,
   and every tab opened once. `EXECUTION_PLAN.md` §0.3 is the full gate.
7. **Append an audit row** to `EXECUTION_PLAN.md` §0.4 per work session, and a
   line to `MISTAKES.md` for anything that cost a retry.

## Where the work is

- **`NEXT_STEPS.md`** — the open-items index. Start here.
- **`EXECUTION_PLAN.md`** — §4 per-app roadmap, §7 phases, §0.3 verification gate,
  §0.4 audit log (append a row per work session).
- **`MISTAKES.md`** — one line per mistake that cost a retry. Read the entries
  covering any area you are about to touch; each ends with a rule to apply.

Phase A (deploy) is closed. The unblocked path is the Play Store release, which
is blocked on one $25 spend and a signing decision — see `NEXT_STEPS.md` §2.

## Package ids

`uk.tinkerhouse.<app>` — powerpulse, metersmart, pgbuddy, nesthub, lingolocal,
stockping, cardguard. Permanent once first published. Set in two places that must
agree: the matrix in `.github/workflows/build-aab.yml` and `.well-known/assetlinks.json`.
