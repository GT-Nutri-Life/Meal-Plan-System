#!/usr/bin/env bash
#
# Refresh the bundled subsystems from their upstream repositories.
#
# The upstream repos remain the source of truth for each tool; this portal
# only ever holds a copy. Run this when a subsystem has moved on, then run
# scripts/inject-nav.sh to re-attach the switcher to the fresh files.
#
# Usage:
#   scripts/sync-apps.sh              # sync every subsystem
#   scripts/sync-apps.sh bmi-assessment diet-plan-generator
#   scripts/sync-apps.sh --dry-run    # show what would change, write nothing
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$ROOT/.sync-tmp"
DRY=0

args=()
for a in "$@"; do
  if [[ "$a" == "--dry-run" ]]; then DRY=1; else args+=("$a"); fi
done

# slug <TAB> upstream repo <TAB> space-separated files to copy
MAP=$(cat <<'MAP_EOF'
about-dietitian	GT-Nutri-Life/About-Dietitian	index.html
bmi-assessment	AshenWijesingha/BMI-Assessment	index.html
dietary-nutrition-assessment	AshenWijesingha/Dietary-Nutrition-Assessment	index.html
meal-plan-generator	AshenWijesingha/Meal-Plan-Generator	index.html main.html babies.html icu.html
diet-plan-generator	AshenWijesingha/Diet-Plan-Generator	index.html 7-day-menu.html
diet-plan-calendar-generator	AshenWijesingha/Diet-Plan-Calendar-Generator	index.html 7day-diet-menu.html manifest.json
MAP_EOF
)

rm -rf "$TMP"; mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

changed=0

while IFS=$'\t' read -r slug repo files; do
  [[ -z "$slug" ]] && continue

  # When slugs are passed on the command line, sync only those.
  if [[ ${#args[@]} -gt 0 ]]; then
    match=0
    for a in "${args[@]}"; do [[ "$a" == "$slug" ]] && match=1; done
    [[ $match -eq 0 ]] && continue
  fi

  echo "==> $slug  ($repo)"
  if ! git clone --depth 1 --quiet "https://github.com/$repo.git" "$TMP/$slug" 2>/dev/null; then
    echo "    !! clone failed — skipped" >&2
    continue
  fi

  for f in $files; do
    src="$TMP/$slug/$f"
    dst="$ROOT/apps/$slug/$f"

    if [[ ! -f "$src" ]]; then
      echo "    !! $f not found upstream — skipped" >&2
      continue
    fi

    # Compare against the bundled copy with the injected tag removed, so the
    # injection itself never registers as an upstream change.
    if [[ -f "$dst" ]] && diff -q <(grep -v 'gt-switcher\.js' "$dst") "$src" >/dev/null 2>&1; then
      echo "    =  $f unchanged"
      continue
    fi

    changed=$((changed + 1))
    if [[ $DRY -eq 1 ]]; then
      echo "    ~  $f would be updated"
    else
      cp "$src" "$dst"
      echo "    ~  $f updated"
    fi
  done
done <<< "$MAP"

echo "---"
if [[ $DRY -eq 1 ]]; then
  echo "$changed file(s) would change. Re-run without --dry-run to apply."
elif [[ $changed -gt 0 ]]; then
  echo "$changed file(s) updated. Now run:"
  echo "    scripts/inject-nav.sh && scripts/verify-registry.js"
else
  echo "Everything already up to date with upstream."
fi
