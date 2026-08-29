# Mistakes

Newest at top. One line each. Format:
`- YYYY-MM-DD — <what I assumed/did> → <what was actually true>. Rule: <do this instead>.`

- 2026-08-29 — Audited XSS by grepping render functions (`renderX`, `.innerHTML = ...map(...)`) → the `showToast()` helper also builds its body with `innerHTML = icon + message` and callers interpolate user input, so NestHub and StockPing stayed exploitable for 7 weeks after the "all XSS fixed" pass. Rule: when auditing a sink, grep every helper that writes `innerHTML`, not just the ones named `render*` — toasts, modals, and tooltips are sinks too.
- 2026-08-29 — Summarised this repo's state (claimed 8 uncommitted files, "last work 2026-08-07") from a stale read → the tree was clean and five more app builds had landed since. Rule: run `rtk proxy git status` / `git log --oneline -5` before describing repo state; the rtk-wrapped `git diff` can return output that does not match the working tree.
