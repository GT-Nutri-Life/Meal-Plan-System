#!/usr/bin/env bash
#
# Wire the shared layer into every bundled subsystem page.
#
# Four things get injected, and each has a different correct position:
#
#   assets/gt-theme.css      <head>, last — the pastel skin has to win on
#                            cascade order over the page's own stylesheet.
#   assets/gt-theme-boot.js  end of <head>, first of the three. It resolves the
#                            shared theme and stamps it on <html> while the head
#                            is still blocking, so a page never paints light and
#                            then flips — which on a portal of eleven separate
#                            documents would be a flash on every click.
#   assets/tailwind.css      end of <head>, before the skin. This replaces
#                            https://cdn.tailwindcss.com, which cost about
#                            400 KB on each of nine pages and then compiled the
#                            stylesheet in the browser before anything could be
#                            painted. The prebuilt file is a tenth of that and
#                            arrives ready to use. The CDN tag is swapped for a
#                            three-line stub so the two pages that assign
#                            `tailwind.config` do not throw.
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

  # --- 1. theme boot, compiled Tailwind and the pastel skin, in <head> ---
  #
  # The order matters and is enforced rather than assumed: the boot script has
  # to run before anything paints, and the skin has to come after Tailwind or
  # it loses every rule it means to override. Adding one tag at a time got that
  # wrong the moment a new tag joined an existing set — the newcomer landed
  # last whatever it was. So the known tags are stripped and re-inserted as a
  # block, and the file is only rewritten if the result actually differs, which
  # is what keeps this idempotent.
  HEAD_BLOCK='<script src="../../assets/gt-theme-boot.js"></script>
<script src="../../assets/gt-export-light.js" defer></script>
<link rel="stylesheet" href="../../assets/tailwind.css">
<link rel="stylesheet" href="../../assets/gt-theme.css">'

  before=$(cat "$file")
  stripped=$(printf '%s' "$before" | perl -0777 -pe '
    s{[ \t]*<script[^>]*src="[^"]*assets/gt-(theme-boot|palette|tailwind|export-light)\.js"[^>]*>\s*</script>\n?}{}gs;
    s{[ \t]*<link[^>]*href="[^"]*assets/(tailwind|gt-theme)\.css"[^>]*>\n?}{}gs;
  ')
  # Herestring, not a pipe. `grep -q` exits at the first match and closes the
  # pipe under it, so `printf … | grep -q` leaves printf with SIGPIPE — which
  # under `set -o pipefail` makes the whole pipeline fail and this test read as
  # "no </head>". Whether printf finishes before grep exits depends on the page
  # fitting in the pipe buffer, so CI failed on three pages that pass here.
  if grep -qi '</head>' <<< "$stripped"; then
    after=$(HEAD_BLOCK="$HEAD_BLOCK" perl -0777 -pe 's{(.*)</head>}{$1 . $ENV{HEAD_BLOCK} . "\n</head>"}se' <<< "$stripped")
  else
    after=$(HEAD_BLOCK="$HEAD_BLOCK" perl -0777 -pe 's{<body}{$ENV{HEAD_BLOCK} . "\n<body"}se' <<< "$stripped")
  fi

  if [[ "$after" != "$before" ]]; then
    why+=("head")
    changed=1
    [[ $CHECK -eq 0 ]] && printf '%s\n' "$after" > "$file"
  fi

  # --- 2. retire the Tailwind Play CDN ----------------------------------
  #
  # The stylesheet is compiled ahead of time now (scripts/build-tailwind.js).
  # The CDN script is replaced rather than deleted: two pages assign
  # `tailwind.config` immediately afterwards, and without the global that is a
  # ReferenceError on load.
  if grep -qE '(<script[^>]*cdn\.tailwindcss\.com|rel="(dns-prefetch|preconnect)"[^>]*cdn\.tailwindcss\.com)' "$file"; then
    why+=("drop-cdn")
    changed=1
    if [[ $CHECK -eq 0 ]]; then
      TW_STUB='<script>/* Tailwind is compiled ahead of time into assets/tailwind.css.
   This stub keeps this page'"'"'s own `tailwind.config` assignment harmless. */
window.tailwind = window.tailwind || { config: {} };</script>'
      TW_STUB="$TW_STUB" perl -0777 -i -pe \
        's{<script[^>]*src="https://cdn\.tailwindcss\.com"[^>]*>\s*</script>}{$ENV{TW_STUB}}se' "$file"
      # The warm-up hints pointed at a host we no longer call, which costs a
      # DNS lookup and a TLS handshake for nothing.
      perl -0777 -i -pe 's{[ \t]*<link[^>]*rel="(?:dns-prefetch|preconnect)"[^>]*cdn\.tailwindcss\.com[^>]*>\n?}{}gs' "$file"
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
