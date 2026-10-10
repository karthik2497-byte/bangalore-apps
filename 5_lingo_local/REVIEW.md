# LingoLocal — Review

**Date:** 2026-10-10 · **Reviewer:** Claude (Opus 5.5) · **Baseline:** `c6d74dd`
**Read in full:** `index.html` (CSS 1–658, markup 666–925, script 926–1886, including all
19 scenarios / 108 phrases), `service-worker.js`, `manifest.json`, `audio/manifest.json`,
`tools/gen-audio.mjs`, `test-srs.mjs` (PASS, 15 cases), the `/5_lingo_local/*` block in
`_headers`, EXECUTION_PLAN §4.2. Design detector: `impeccable detect.mjs`.
Line numbers refer to the baseline commit.

## Verdict

LingoLocal is the most *honest* app in the repo. It makes no fake claims and needs no
server, and its offline audio really is the product. The engineering is careful: the SRS is
tested, clips are precached one by one so one 404 cannot fail the install, and placeholders
are stripped before synthesis. The gaps are learning-design and access. **The quiz shows only
Kannada script**, so the app's main audience, newcomers who cannot read Kannada, can only guess.
There is **no search**, and a phrasebook gets opened in the moment ("how do I say *stop here*?").
Also, another app's service worker can silently delete the 108 precached clips, which removes
the offline audio this app exists for.

## Keep: works, don't change

- **Bundled Opus clips + precache** with per-clip `cache.add().catch()` (service-worker.js:9–16).
  A missing clip falls back to device TTS (1577–1586). The fallback order is right for Android,
  where most devices have no Kannada voice.
- **SM-2-lite in one place driving two surfaces** (deck order + quiz pick), graded from actions
  users already take (1280–1311). The tests pull the real code out of `index.html`.
- The quiz shuffles first, then does a stable sort, so ties in due-ness are random (1706–1714).
  Small but correct.
- `gen-audio.mjs` strips `[place]` placeholders before synthesis (`speakable`), so the voice
  never reads "place" aloud.
- Flashcards render through `textContent` (1409–1417). Every storage key is `ll_`-prefixed.
- Scenario coverage is genuinely Bangalore-specific: auto stand, landlord, water and power, BMTC.
- The typography choice of Noto Sans Kannada + Poppins is right, since script legibility is
  the whole job. The purple identity is distinct from the other six apps.

## Findings

Severity: **P0** breaks data, trust or the core flow · **P1** real bug or WCAG AA failure ·
**P2** minor · **P3** polish.

### P0

- [x] **Other apps can delete the offline audio.** Every app's service worker keeps only its
  own `CACHE_NAME` across the shared origin (service-worker.js:23 here, and the same line in
  the other 6). When any other app updates, it deletes `lingolocal-v2`, and with it the
  108 clips (487 KB) and the app shell. Offline launch then fails. Details are in
  `1_power_pulse/REVIEW.md`. **Fix:** `k.startsWith('lingolocal-') && k !== CACHE_NAME`,
  and bump to `lingolocal-v3`.

### P1

- [x] **Beginners cannot do the quiz.** It shows only `quizPhrase.kn`, in script (1720), with
  no transliteration and no audio. "Beginner" mode means "I can't read script yet".
  **Fix:** in Beginner mode, show the transliteration under the prompt. Add a 🔊 button that
  plays the same bundled clip (`playPhrase`).
- [x] **No search.** 108 phrases sit across 19 scenario cards, and the only way to find "Stop
  here" is to guess the scenario. **Fix:** a search box on the Scenarios tab that matches
  `en` / `tr` / `kn` and lists hits with play and bookmark buttons.
- [x] **Saved phrases drop the transliteration.** Bookmarks store `tr` (1552), but
  `renderSavedPhrases()` shows only `en` + `kn` (1825–1826). A beginner's saved list is
  unreadable without it. Saved items also cannot be played. **Fix:** render `tr`, and add play.
- [x] **Keyboard and screen-reader gaps.**
  - Scenario cards are clickable `<div>`s (1337).
  - The flashcard is a `<div onclick>` (865).
  - The dark-mode switch is a `<div onclick>` with no role or state (805).
  - These icon-only buttons have no accessible name: modal close (859), bookmark (892),
    prev/next (898, 902), remove-bookmark (1828).

  Fails WCAG 2.1.1 / 4.1.2.
- [x] **Pinch-zoom disabled** (line 5). This matters doubly here: Kannada glyphs at 32 px are
  exactly what low-vision learners need to zoom.
- [x] **Faint text.** `--text-light` is `#A8A29E` on white, **2.52:1** (nav labels, card counts,
  tap hint, subtitles). Dark mode is `#78716C` on `#292524`, 3.16:1. Fails WCAG 1.4.3.
- [x] **No `:focus-visible` style anywhere.**

### P2

- [x] **Quiz answers are passed as quoted strings in inline `onclick`** (1741). Only `'` is
  escaped. A `"` in any future phrase breaks the attribute. This is the pattern §0.2 forbids.
  **Fix:** pass the option index.
- [x] **Corrupt storage kills the app.** `JSON.parse(localStorage…)` runs at top level with no
  guard (1207–1210). One corrupt `ll_*` value throws before anything renders. **Fix:** a
  guarded `load(key, fallback)`.
- [x] **The streak counts app opens, not learning** (1253–1272), while the copy says "Keep
  learning every day". **Fix:** count a day only when a phrase is graded (learned or quizzed).
- [ ] **Script/transliteration mismatches** a native speaker should confirm. `ಟ್ಯಾಪ್ ಸೋರುತ್ತಿದೆ`
  is transliterated "Tap *soritide*", but the script reads *sōruttide*. `ಹೋಗ್ಬೇಕು` is written
  as "hog*bekku*". Is `ನೇರೆ ಹೋಗಿ` idiomatic for "go straight", or should it be *nēravāgi* /
  *sīdhā*? NEXT_STEPS asks for review of the 18 new phrases only. **Extend that review to all 108.**
- [x] The splash takes a fixed 1.8 s + 0.5 s fade (1224–1227) before an app that is entirely local.
- [x] Phrase of the Day has no play button.
- [ ] `privacy.html` is missing. It is required for the Play listing (known, NEXT_STEPS §4).

### P3 / design-detector findings

These two were marked "worth fixing" in NEXT_STEPS §7:

- [x] `[dark-glow]`: a zero-offset purple halo `0 0 60px rgba(124,58,237,0.15)` (117).
  Replace it with a neutral elevation shadow.
- [x] `[layout-transition]`: the progress bars animate `width` (233, 428). Use
  `transform: scaleX()`.

Leave the rest: overshoot easing on cards (194, 349, 626) and the infinite splash loader
(a taste call). The SRS day boundary is UTC (`Date.now()/DAY`), so cards come due at
05:30 IST, not midnight. Harmless.

## Status — 2026-10-10

Fixed this session (`test-srs.mjs` 15 cases still PASS; headless Chrome 22/22, with `Audio`
wrapped to record which clip each button requests: search finds "Stop here", hides the
grid, plays `auto_stand_4.opus`, bookmarks it; the saved list shows the transliteration
and plays; the beginner quiz shows the transliteration and plays its clip; script-only
hides it; answers pass by index; practice starts the streak; Phrase of the Day plays;
Enter opens, Space flips, Escape closes; streak and bookmark survive reload; 0 console messages):

- **Search** across all 108 phrases. Results can be played and bookmarked.
- **Quiz:** transliteration + 🔊 in Beginner mode.
- **Saved phrases** show the transliteration and can be played.
- **Phrase of the Day** can be played.
- **Streak** counts practice days. It now shows 0 until the first practice. This is a
  deliberate change from the 2026-07-11 "day 1 on first open" behaviour, which counted
  opening the app.
- **Robustness:** guarded `load()` / `save()`, plus `esc()` on saved and search text.
- **A11y:** keyboard-operable cards, flashcard and switch; named icon buttons; dialog +
  Escape; zoom; `:focus-visible`; stone-scale text tokens that pass AA.
- **NEXT_STEPS §7 design fixes:** neutral shadow instead of the purple glow, and `scaleX`
  progress bars.
- **Transliteration:** "hogbekku" → "hogbeku" and "soritide" → "soruttide". These match the
  script; the audio is generated from the script, so it is unchanged.
- **SW:** `lingolocal-v3` with a scoped purge.

Still open: the native-speaker review of all 108 phrases (and whether ನೇರೆ is idiomatic);
`privacy.html` (see below).

## Work order

1. SW purge scope + `lingolocal-v3`.
2. Learning fixes: transliteration and audio in the quiz for Beginner, search, saved phrases
   with transliteration and play.
3. A11y: zoom, focus ring, buttons for cards / flashcard / switch, accessible names,
   `--text-light` contrast.
4. P2 hygiene: quiz index, guarded storage, streak on activity, translit fixes (only the
   certain ones).
5. The two NEXT_STEPS §7 design fixes (glow, scaleX).
