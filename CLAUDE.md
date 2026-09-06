# Bangalore Apps — Agent Instructions

**Read `AGENTS.md` first** — it is the agent-agnostic brief for this repo (what
it is, the live origin, the rules that break things when ignored, and where the
open work lives). Everything in it applies here; this file only adds the
Claude-specific protocol.

1. **Second brain protocol:** a persistent second brain lives at `~/brain`.
   On session start, read its `CLAUDE.md` and follow the session-start protocol
   — it resolves this folder (`bangalore-apps`) against the projects registry
   and opens `~/brain/departments/product/projects/bangalore-apps.md` directly,
   then reads its last log entries. On session end, append a dated entry to that
   page's `## Log` section and update its `## Status` line.

@AGENTS.md
@MISTAKES.md
@NEXT_STEPS.md
