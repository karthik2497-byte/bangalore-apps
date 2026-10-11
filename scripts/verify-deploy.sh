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

for app in 1_power_pulse 2_meter_smart 3_pg_buddy 4_nest_hub 5_lingo_local 6_stock_ping 7_card_guard 8_thraasu; do
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

# One statement per TWA, served from the origin root — this is what lets eight
# Play listings verify against eight paths on this one host.
n=$(curl -s --max-time 20 "$B/.well-known/assetlinks.json" | grep -c 'uk.tinkerhouse.')
[ "$n" = 8 ] || say "assetlinks: $n/8 package ids"

# A rate revision, a newly verified PG or a price change must reach clients on next launch.
for j in 2_meter_smart/fares.json 3_pg_buddy/pgs.json 8_thraasu/products.json; do
  hdr "$B/$j" | grep -qi 'cache-control:.*must-revalidate' || say "$j: not must-revalidate"
done

# The leak check below is only meaningful because the site ships a 404.html.
# Without one, Pages answers every unmatched path with the root index.html at
# HTTP 200, and a status code proves nothing — verified the hard way.
[ "$(code "$B/nonexistent-probe-$$")" = 404 ] || say "no 404.html: unmatched paths soft-404, leak check below is meaningless"
for leak in EXECUTION_PLAN.md WORK_LOG.md MISTAKES.md PLAYBOOK.html CLAUDE.md \
            scripts/build-site.sh .gitignore 2_meter_smart/test-fares.mjs 7_card_guard/TODO.md 8_thraasu/test-bill.mjs 8_thraasu/PRODUCT.md 8_thraasu/.impeccable/design.json \
            8_thraasu/tools/shop-admin.mjs 8_thraasu/tools/catalogs/NANMA.json 8_thraasu/NANMA-IMPORT-NOTES.md wrangler.toml workers/thraasu-mail/index.js; do
  c=$(code "$B/$leak"); [ "$c" = 404 ] || say "LEAKED $leak -> HTTP $c"
done

# Thraasu shop sync is a Pages Function: it must answer (not the static 404) and refuse
# without a login. A 500 here usually means the D1 binding in wrangler.toml did not apply.
api=$(curl -s --max-time 20 -w ' %{http_code}' "$B/api/thraasu/state")
[ "$api" = '{"error":"login"} 401' ] || say "Thraasu sync API: expected a JSON 401, got: ${api:0:80}"
api=$(curl -s --max-time 20 -w ' %{http_code}' -X POST -H 'content-type: application/json' -d '{"code":"NOSUCHSHOP","pin":"0000"}' "$B/api/thraasu/login")
[ "$api" = '{"error":"wrong"} 401' ] || say "Thraasu login (D1 reachable?): got: ${api:0:80}"
api=$(curl -s --max-time 20 -w ' %{http_code}' -X POST -H 'content-type: application/json' -d '{"name":"","mobile":"0","pin":"x"}' "$B/api/thraasu/signup")
[ "$api" = '{"error":"bad"} 400' ] || say "Thraasu sign-up should refuse a bad request, got: ${api:0:80}"
c=$(code "$B/api/thraasu/review?code=NANMA&sig=0"); [ "$c" = 403 ] || say "Thraasu review link with a bad signature should be 403, got $c"
curl -sL --max-time 20 "$B/8_thraasu/privacy.html" | grep -q 'Thraasu — Privacy Policy' || say "Thraasu privacy page missing"

[ $fail = 0 ] && echo "PASS — 8 apps, CSPs applied, assetlinks 8/8, 404s real, no leaks, sync API up" || echo "FAILED"
exit $fail
