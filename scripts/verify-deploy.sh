#!/usr/bin/env bash
# Verifies a deployed origin. Run after every deploy:
#   bash scripts/verify-deploy.sh [origin]        # default https://tinkerhouse.uk
#
# This exists because the things most likely to break are invisible in the
# repo: `_headers` only takes effect on Cloudflare Pages, and a CSP that is
# wrong only fails in a real browser against real response headers. Prints
# nothing but failures plus a verdict; exit code is the verdict.
set -uo pipefail
B="${1:-https://tinkerhouse.uk}"; B="${B%/}"; fail=0
say(){ echo "  FAIL: $*"; fail=1; }
code(){ curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$1"; }
hdr(){ curl -sI --max-time 20 "$1"; }

[ "$(code "$B/")" = 200 ] || say "root / not 200"

for app in 1_power_pulse 2_meter_smart 3_pg_buddy 4_nest_hub 5_lingo_local 6_stock_ping 7_card_guard; do
  c=$(code "$B/$app/"); [ "$c" = 200 ] || say "$app -> HTTP $c"
  h=$(hdr "$B/$app/")
  csp=$(printf '%s' "$h" | grep -i '^content-security-policy:')
  [ -n "$csp" ] || { say "$app: no CSP header"; continue; }
  # font-src AND connect-src both need the font origins: the service worker is
  # served from this path, inherits this CSP, and its pass-through fetch() is a
  # connect-src fetch. Missing it kills every webfont once the SW controls.
  printf '%s' "$csp" | grep -q "connect-src[^;]*fonts.gstatic.com" || say "$app: connect-src missing gstatic"
  printf '%s' "$csp" | grep -q "font-src[^;]*fonts.gstatic.com"    || say "$app: font-src missing gstatic"
  printf '%s' "$h" | grep -qi '^x-frame-options: *DENY'            || say "$app: no X-Frame-Options"
done

# One statement per TWA, served from the origin root — this is what lets seven
# Play listings verify against seven paths on this one host.
n=$(curl -s --max-time 20 "$B/.well-known/assetlinks.json" | grep -c 'uk.tinkerhouse.')
[ "$n" = 7 ] || say "assetlinks: $n/7 package ids"

# A rate revision or a newly verified PG must reach clients on next launch.
for j in 2_meter_smart/fares.json 3_pg_buddy/pgs.json; do
  hdr "$B/$j" | grep -qi 'cache-control:.*must-revalidate' || say "$j: not must-revalidate"
done

# The leak check below is only meaningful because the site ships a 404.html.
# Without one, Pages answers every unmatched path with the root index.html at
# HTTP 200, and a status code proves nothing — verified the hard way.
[ "$(code "$B/nonexistent-probe-$$")" = 404 ] || say "no 404.html: unmatched paths soft-404, leak check below is meaningless"
for leak in EXECUTION_PLAN.md WORK_LOG.md MISTAKES.md PLAYBOOK.html CLAUDE.md \
            scripts/build-site.sh .gitignore 2_meter_smart/test-fares.mjs 7_card_guard/TODO.md; do
  c=$(code "$B/$leak"); [ "$c" = 404 ] || say "LEAKED $leak -> HTTP $c"
done

[ $fail = 0 ] && echo "PASS — 7 apps, CSPs applied, assetlinks 7/7, 404s real, no leaks" || echo "FAILED"
exit $fail
