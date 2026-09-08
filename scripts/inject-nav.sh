#!/usr/bin/env bash
#
# Wire the cross-app switcher into every bundled subsystem page.
#
# Adds a single <script> tag immediately before </body>. Idempotent: pages
# that already carry the tag are left untouched, so this is safe to re-run
# after scripts/sync-apps.sh pulls fresh copies from upstream.
#
# Usage: scripts/inject-nav.sh [--check]
#   --check  report what would change and exit non-zero if anything would,
#            without writing. Used by CI to catch an un-wired page.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

MARKER='gt-switcher.js'
TAG='<script src="../../assets/gt-switcher.js" defer></script>'

injected=0; skipped=0; missing=0

while IFS= read -r -d '' file; do
  rel="${file#"$ROOT"/}"

  if grep -qF "$MARKER" "$file"; then
    skipped=$((skipped + 1))
    continue
  fi

  if ! grep -qi '</body>' "$file"; then
    echo "  !! no </body> in $rel — skipped, wire it by hand" >&2
    missing=$((missing + 1))
    continue
  fi

  if [[ $CHECK -eq 1 ]]; then
    echo "  would inject: $rel"
    injected=$((injected + 1))
    continue
  fi

  # Replace only the final </body>, preserving the rest of the document byte
  # for byte. perl slurps the file so the anchor is unambiguous, and the tag
  # travels via the environment so no shell quoting can mangle it.
  TAG="$TAG" perl -0777 -i -pe 's{(.*)</body>}{$1 . $ENV{TAG} . "\n</body>"}se' "$file"

  echo "  injected: $rel"
  injected=$((injected + 1))
done < <(find "$ROOT/apps" -name '*.html' -print0 | sort -z)

echo "---"
echo "injected: $injected   already wired: $skipped   needs attention: $missing"

if [[ $CHECK -eq 1 && $injected -gt 0 ]]; then
  echo "FAIL: pages above are missing the switcher. Run scripts/inject-nav.sh" >&2
  exit 1
fi
[[ $missing -gt 0 ]] && exit 1
exit 0
