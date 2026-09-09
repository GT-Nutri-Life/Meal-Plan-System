#!/usr/bin/env bash
#
# Wire the shared layer into every bundled subsystem page.
#
# Four things get injected, and each has a different correct position:
#
#   assets/gt-theme.css      <head>, last — the pastel skin has to win on
#                            cascade order over the page's own stylesheet.
#   assets/gt-palette.js     end of <head>, in that order. Not next to the
#   assets/gt-tailwind.js    Tailwind CDN tag, which would look tidier but is
#                            wrong: two pages set a `tailwind.config` of their
#                            own further down the head, and assigning ours
#                            first would simply be overwritten. Last in the
#                            head means ours merges over theirs instead.
#   assets/gt-chrome.js      before </body> — needs document.body.
#   assets/gt-switcher.js    before </body>, last, as it always was.
#
# Idempotent: a page that already carries a tag is left alone, so this is safe
# to re-run after scripts/sync-apps.sh pulls fresh copies from upstream.
#
# Usage: scripts/inject-nav.sh [--check]
#   --check  report what would change and exit non-zero if anything would,
#            without writing. Used by CI to catch an un-wired page.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

injected=0; skipped=0; missing=0

for file in $(find "$ROOT/apps" -name '*.html' | sort); do
  rel="${file#"$ROOT"/}"
  changed=0
  why=()

  if ! grep -qi '</body>' "$file"; then
    echo "  !! no </body> in $rel — skipped, wire it by hand" >&2
    missing=$((missing + 1))
    continue
  fi

  # --- 1. palette, Tailwind bridge and pastel skin, last in <head> ------
  if ! grep -qF 'gt-theme.css' "$file"; then
    why+=("theme")
    changed=1
    if [[ $CHECK -eq 0 ]]; then
      HEAD_TAGS='<script src="../../assets/gt-palette.js"></script>
<script src="../../assets/gt-tailwind.js"></script>
<link rel="stylesheet" href="../../assets/gt-theme.css">'
      if grep -qi '</head>' "$file"; then
        HEAD_TAGS="$HEAD_TAGS" perl -0777 -i -pe 's{(.*)</head>}{$1 . $ENV{HEAD_TAGS} . "\n</head>"}se' "$file"
      else
        # No </head> to anchor to: put them before the first <body>, which is
        # still inside the implicit head as far as the parser is concerned.
        HEAD_TAGS="$HEAD_TAGS" perl -0777 -i -pe 's{<body}{$ENV{HEAD_TAGS} . "\n<body"}se' "$file"
      fi
    fi
  fi

  # --- 2. palette + Tailwind bridge, right after the Play CDN tag -------
  if ! grep -qF 'gt-palette.js' "$file"; then
    why+=("tailwind")
    changed=1
    if [[ $CHECK -eq 0 ]]; then
      if grep -qF 'cdn.tailwindcss.com' "$file"; then
        # After the CDN tag: the palette first, then the config that reads it.
        perl -0777 -i -pe 's{(<script[^>]*src="https://cdn\.tailwindcss\.com"[^>]*>\s*</script>)}
                           {$1 . qq{\n<script src="../../assets/gt-palette.js"></script>\n<script src="../../assets/gt-tailwind.js"></script>}}se' "$file"
      else
        # Not a Tailwind page: the palette still gets loaded, for the chrome.
        perl -0777 -i -pe 's{(.*)</body>}{$1 . qq{<script src="../../assets/gt-palette.js"></script>\n</body>}}se' "$file"
      fi
    fi
  fi

  # --- 3. the shared header and footer ----------------------------------
  if ! grep -qF 'gt-chrome.js' "$file"; then
    why+=("chrome")
    changed=1
    if [[ $CHECK -eq 0 ]]; then
      perl -0777 -i -pe 's{(.*)</body>}{$1 . qq{<script src="../../assets/gt-chrome.js" defer></script>\n</body>}}se' "$file"
    fi
  fi

  # --- 4. the switcher, last --------------------------------------------
  if ! grep -qF 'gt-switcher.js' "$file"; then
    why+=("switcher")
    changed=1
    if [[ $CHECK -eq 0 ]]; then
      perl -0777 -i -pe 's{(.*)</body>}{$1 . qq{<script src="../../assets/gt-switcher.js" defer></script>\n</body>}}se' "$file"
    fi
  fi

  if [[ $changed -eq 0 ]]; then
    skipped=$((skipped + 1))
  elif [[ $CHECK -eq 1 ]]; then
    echo "  would inject into $rel: ${why[*]}"
    injected=$((injected + 1))
  else
    echo "  injected into $rel: ${why[*]}"
    injected=$((injected + 1))
  fi
done

echo "---"
echo "injected: $injected   already wired: $skipped   needs attention: $missing"

if [[ $CHECK -eq 1 && $injected -gt 0 ]]; then
  echo "FAIL: pages above are missing part of the shared layer. Run scripts/inject-nav.sh" >&2
  exit 1
fi
[[ $missing -gt 0 ]] && exit 1
exit 0
