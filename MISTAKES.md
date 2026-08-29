# Mistakes

Newest at top. One line each. Format:
`- YYYY-MM-DD — <what I assumed/did> → <what was actually true>. Rule: <do this instead>.`

- 2026-08-29 — Assumed re-registering a service worker re-fetches its script with fresh response headers → Chrome served it from the HTTP cache, so the worker kept the *old* CSP and a correct fix still looked broken. Rule: when testing anything carried by a SW script's response headers, register the probe under a **new filename**; `unregister()` + `caches.delete()` + `updateViaCache:'none'` is not enough.
- 2026-08-29 — Assumed a CSP blocking a service worker's pass-through `fetch()` would surface as a CSP error → it does not: no `securitypolicyviolation` event, clean console, only a rejected promise inside the worker. Rule: to test a CSP under a SW, instrument the worker's `fetch()` and `postMessage` the failure out — a clean console proves nothing.
- 2026-08-29 — Audited XSS by grepping render functions (`renderX`, `.innerHTML = ...map(...)`) → the `showToast()` helper also builds its body with `innerHTML = icon + message` and callers interpolate user input, so NestHub and StockPing stayed exploitable for 7 weeks after the "all XSS fixed" pass. Rule: when auditing a sink, grep every helper that writes `innerHTML`, not just the ones named `render*` — toasts, modals, and tooltips are sinks too.
- 2026-08-29 — Summarised this repo's state (claimed 8 uncommitted files, "last work 2026-08-07") from a stale read → the tree was clean and five more app builds had landed since. Rule: run `rtk proxy git status` / `git log --oneline -5` before describing repo state; the rtk-wrapped `git diff` can return output that does not match the working tree.
