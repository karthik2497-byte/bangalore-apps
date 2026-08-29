#!/usr/bin/env bash
# Assembles the public site into dist/ for Cloudflare Pages.
#
# This exists because Pages serves whatever is in the output directory, and the
# repo root is not the site: EXECUTION_PLAN.md, WORK_LOG.md, PLAYBOOK.html and
# the per-app test-*.mjs files would all be fetchable at the live domain.
# Pages config: build command `bash scripts/build-site.sh`, output dir `dist`.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist
cp index.html _headers dist/

for app in [1-7]_*/; do
  rsync -a --exclude 'test-*.mjs' --exclude 'tools/' --exclude '*.md' "$app" "dist/$app"
done

# Fail loudly rather than shipping a site that leaks the plan.
leaked=$(find dist \( -name '*.md' -o -name 'test-*' -o -name 'tools' \) -print)
if [ -n "$leaked" ]; then
  echo "FAIL: build output contains files that must not be public" >&2
  echo "$leaked" >&2
  exit 1
fi

# Every app loads Google Fonts, and each app's service worker is served from the
# same path, so it inherits that app's CSP — its pass-through fetch() is a
# connect-src fetch. Miss any of the three and webfonts die once the SW is live.
missing=$(awk '/^  Content-Security-Policy:/ {
  ok = /fonts\.googleapis\.com.*fonts\.gstatic\.com/ && /connect-src[^;]*fonts\.googleapis\.com/
  if (!ok) print "  line " NR
}' dist/_headers)
if [ -n "$missing" ]; then
  echo "FAIL: a CSP is missing the Google Fonts origins in style-src/font-src/connect-src" >&2
  echo "$missing" >&2
  exit 1
fi

echo "OK: dist/ built — $(find dist -type f | wc -l | tr -d ' ') files, $(du -sh dist | cut -f1)"
