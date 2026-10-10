#!/usr/bin/env bash
# Headless-Chrome smoke test of all 8 apps (EXECUTION_PLAN §0.3: runtime, every tab,
# reload persistence) against a local server that applies _headers the way Cloudflare
# Pages does. One line per suite; full detail only for a failing suite. Exit code is
# the verdict. Needs Google Chrome (CHROME=/path/to/chrome to override) and node.
#   bash scripts/browser-smoke.sh              # all suites
#   bash scripts/browser-smoke.sh cardguard    # one suite (scripts/browser/tests/<name>.mjs)
set -uo pipefail
cd "$(dirname "$0")/.."
PORT=8811   # the suites address http://localhost:8811/
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "FAIL: port $PORT is already in use; stop that server first" >&2; exit 2
fi
node scripts/browser/serve.mjs "$PWD" "$PORT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null' EXIT
for _ in $(seq 1 50); do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.1; done

suites=("$@")
[ ${#suites[@]} -eq 0 ] && suites=(cachepurge powerpulse metersmart pgbuddy nesthub lingolocal stockping cardguard thraasu privacy)
fail=0
for s in "${suites[@]}"; do
  out=$(node scripts/browser/cdp.mjs "scripts/browser/tests/$s.mjs" --quiet 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo "PASS  $s  $(printf '%s\n' "$out" | tail -1 | sed 's/^PASS — //')"
  else
    echo "FAIL  $s"; printf '%s\n' "$out" | sed 's/^/      /'; fail=1
  fi
done
exit $fail
