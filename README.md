# GT Meal Plan System

One entry point to every GT Nutri Life clinical nutrition subsystem.

Each tool used to live in its own repository, deployed to its own GitHub Pages
site, with no links between them — three of them (`babies.html`, `icu.html`,
`main.html`) were reachable only by typing the URL directly. This portal bundles
all of them into a single deployment, adds a searchable catalogue at the root,
and injects a switcher into every page so you can move between subsystems
without going back to a menu.

## What is bundled

| Tool | Stage | Source repository |
|---|---|---|
| BMI Assessment | Assessment | `AshenWijesingha/BMI-Assessment` |
| Dietary Nutrition Assessment | Assessment | `AshenWijesingha/Dietary-Nutrition-Assessment` |
| Meal Plan Generator | Plan Generation | `AshenWijesingha/Meal-Plan-Generator` |
| Meal Plan Generator — Word export | Plan Generation | `AshenWijesingha/Meal-Plan-Generator` |
| Diet Plan Generator | Plan Generation | `AshenWijesingha/Diet-Plan-Generator` |
| Diet Plan Calendar Generator | Plan Generation | `AshenWijesingha/Diet-Plan-Calendar-Generator` |
| 7-Day Diet Menu Planner | Menus & Scheduling | `AshenWijesingha/Diet-Plan-Generator` |
| 7-Day Menu — multiple options | Menus & Scheduling | `AshenWijesingha/Diet-Plan-Calendar-Generator` |
| Baby Growth & Feeding Plan | Specialist Care | `AshenWijesingha/Meal-Plan-Generator` |
| ICU NutriPlan | Specialist Care | `AshenWijesingha/Meal-Plan-Generator` |
| About the Dietitian | Practice | `GT-Nutri-Life/About-Dietitian` |

## Layout

```
index.html                  the portal — searchable, grouped catalogue
assets/
  registry.js               single source of truth for every subsystem
  gt-switcher.js            the switcher injected into every bundled page
  favicon.svg
apps/<slug>/…               bundled subsystems, byte-identical to upstream
                            apart from one injected <script> tag
scripts/
  sync-apps.sh              refresh the bundled copies from upstream
  inject-nav.sh             attach the switcher to bundled pages (idempotent)
  verify-registry.js        catch registry/disk drift — run by CI
```

## How navigation works

`assets/registry.js` describes every tool once — name, summary, category,
path, provenance and search tags. Both the portal and the switcher read from
it, so a tool can never appear in one and not the other.

The switcher is added to each bundled page as a single line before `</body>`:

```html
<script src="../../assets/gt-switcher.js" defer></script>
```

It renders into a **closed shadow root**. That matters here because the eleven
bundled pages were written independently and ship a mix of Tailwind, hand-rolled
CSS and inline styles — the shadow boundary means none of that can reach the
switcher, and the switcher's own CSS cannot leak into the app it is sitting in.
The launcher is anchored bottom-right, which no bundled app uses for fixed UI,
so it never covers anything.

Inside any subsystem:

| Action | Result |
|---|---|
| Click **Systems** (bottom-right) | Open the switcher |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd> | Toggle the switcher |
| Type | Filter by name, task or condition |
| <kbd>↑</kbd> <kbd>↓</kbd> then <kbd>Enter</kbd> | Move through results and open one |
| <kbd>Esc</kbd> | Close |

The switcher marks the tool you are currently in with a *You are here* badge,
and always offers a route back to the portal.

The portal root derives its own base path from the switcher script's URL, so
the same files work at a domain root, under a project path such as
`/GT-Meal-Plan-System/`, and from `file://`.

## Keeping up with upstream

The upstream repositories remain the source of truth. Bundled copies are
refreshed on demand, never edited in place:

```bash
scripts/sync-apps.sh --dry-run     # what changed upstream?
scripts/sync-apps.sh               # pull the changes down
scripts/inject-nav.sh              # re-attach the switcher to fresh files
scripts/verify-registry.js         # confirm registry and disk agree
```

`sync-apps.sh` compares upstream against the bundled copy *with the injected tag
removed*, so the injection itself never registers as a change. You can also sync
a single subsystem: `scripts/sync-apps.sh bmi-assessment`.

## Adding a subsystem

1. Copy its files into `apps/<slug>/`.
2. Add an entry to `TOOLS` in `assets/registry.js` (and to `SOURCES` if the
   repository is new).
3. Add the slug, repository and file list to the `MAP` block in
   `scripts/sync-apps.sh`.
4. Run `scripts/inject-nav.sh && scripts/verify-registry.js`.

The portal and the switcher both pick it up with no further changes.

## Deployment

Pushing to `main` runs `.github/workflows/static.yml`, which verifies that every
bundled page carries the switcher and that the registry matches what is on disk,
then publishes the whole repository to GitHub Pages.

To serve locally:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Notes

- No build step and no framework. The portal is one HTML file plus two small
  scripts; the subsystems are unchanged.
- The bundled apps load their own dependencies (Tailwind, jsPDF, docx,
  Supabase) from their original CDNs, exactly as they do upstream.
- `index-old.html`, `main.old.txt` and `test_ics_validation.html` were left
  behind deliberately — they are superseded or test-only files upstream.

---

Clinical nutrition tools by Gayathri Thakshila Dissanayaka — Dietitian & Nutritionist.
