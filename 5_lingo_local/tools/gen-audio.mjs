#!/usr/bin/env node
// Generates one Opus file per phrase from the Kannada system voice, plus the
// manifest the service worker precaches. Re-run after editing SCENARIOS.
//
//   node 5_lingo_local/tools/gen-audio.mjs
//
// Requires macOS `say` with a kn_IN voice installed (System Settings > Spoken
// Content > System Voice > Manage Voices > Kannada) and ffmpeg with libopus.
//
// ponytail: synthesised, not a native speaker. It solves availability — the
// files ship and work offline on devices with no Kannada TTS at all, which is
// most Android devices. Swapping in human recordings later is dropping files
// with the same names into audio/ and re-running only the manifest write.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(APP, 'audio');
const VOICE = process.env.KN_VOICE || 'Soumya';
const TMP = join(OUT, '.tmp.aiff');

// Pull SCENARIOS out of the app rather than copying it — a copy would drift.
function loadScenarios() {
  const src = readFileSync(join(APP, 'index.html'), 'utf8');
  const start = src.indexOf('const SCENARIOS = [');
  const end = src.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error('SCENARIOS block not found in index.html');
  const literal = src.slice(src.indexOf('[', start), end + 2);
  return new Function(`return ${literal}`)(); // dev-only tool, own source
}

// "[place] ಗೆ ಎಷ್ಟು?" -> "ಗೆ ಎಷ್ಟು?" — the voice must not read the placeholder
// name aloud. The card still shows the bracket so the user knows to substitute.
const speakable = (kn) => kn.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

function voiceExists() {
  const list = execFileSync('say', ['-v', '?'], { encoding: 'utf8' });
  return list.split('\n').some((l) => l.startsWith(VOICE + ' ') && l.includes('kn_'));
}

const scenarios = loadScenarios();
if (!voiceExists()) {
  console.error(`FAIL — Kannada voice "${VOICE}" not installed. say -v '?' | grep kn_`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const files = [];
let failed = 0;
for (const s of scenarios) {
  s.phrases.forEach((p, i) => {
    const name = `${s.id}_${i}.opus`;
    try {
      execFileSync('say', ['-v', VOICE, '-r', '150', '-o', TMP, speakable(p.kn)]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', TMP, '-c:a', 'libopus', '-b:a', '24k', '-ac', '1', join(OUT, name)]);
      files.push(name);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}: ${e.message.split('\n')[0]}`);
    }
  });
}
rmSync(TMP, { force: true });

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify({ version: 1, voice: VOICE, generated: new Date().toISOString().slice(0, 10), files }, null, 2) + '\n'
);

const bytes = files.reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`${failed ? 'FAIL' : 'PASS'} — ${files.length} clips, ${(bytes / 1024).toFixed(0)} KB total, ${failed} failed`);
process.exit(failed ? 1 : 0);
