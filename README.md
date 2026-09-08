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
  registry.js               single source of truth: tools, categories, data flow
  gt-context.js             the shared clinical record and the per-app adapters
  gt-auth.js                the shared sign-in gate
  gt-switcher.js            the switcher injected into every bundled page
  favicon.svg
apps/<slug>/…               bundled subsystems, byte-identical to upstream
                            apart from one injected <script> tag
scripts/
  sync-apps.sh              refresh the bundled copies from upstream
  inject-nav.sh             attach the switcher to bundled pages (idempotent)
  verify-registry.js        catch registry/disk/adapter drift — run by CI
```

## How navigation works

`assets/registry.js` describes every tool once — name, summary, category,
path, provenance and search tags. Both the portal and the switcher read from
it, so a tool can never appear in one and not the other.

The switcher is added to each bundled page as a single line before `</body>`:

```html
<script src="../../assets/gt-switcher.js" defer></script>
```

It renders into a **shadow root**. That matters here because the eleven
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

## Signing in

One login covers the whole system, using the credentials that already existed:
the same Supabase project, the same publishable key and the same two-account
allow-list that Meal Plan Generator has always used.

Because every subsystem is now served from a single origin, the Supabase
session is shared. Sign in once on the portal and every tool is open —
including Meal Plan Generator's own built-in login, which finds the session
already present and lets you through. The shared gate detects that app's
overlay and stands down there, so there is never a second password prompt.

| | |
|---|---|
| Gated | The portal and all 10 clinical tools |
| Not gated | About the Dietitian — the practice's public page, which clients and search engines must reach |
| Idle timeout | 30 minutes, with a 60-second warning |
| Off-allow-list accounts | Signed straight back out with an explanation |

**What this gate does and does not do.** It controls access to *data* — cloud
templates, saved progress and clinical records — and that is enforced
server-side by Supabase row-level security tied to `auth.uid()`, not by the
browser. It is not a secret-keeping mechanism for the pages themselves: these
are static HTML files, and anyone can read their source and their calculator
logic whether or not the overlay is showing. Do not put anything confidential
into the markup and expect the login to hide it.

The publishable key in `assets/gt-auth.js` is meant to be public — that is what
"publishable" means in Supabase's key model. It grants nothing on its own.

To change who can sign in, edit `ALLOWED_EMAILS` in `assets/gt-auth.js` **and**
add the account in Supabase. Note that the allow-list is a client-side
convenience; the durable boundary is the RLS policy on each table.

## How the subsystems connect

Each tool used to be an island. They now share one clinical record, so an
assessment flows into a prescription and on into a plan without anything being
retyped.

```
Intake            Assessment          Prescription        Plan               Schedule
Diet Plan    →    BMI            →    Dietary        →    Meal Plan     →    Calendar Generator
Generator         Assessment          Nutrition           Generator          7-Day Menus
                                      Assessment
```

Ten connections are wired, each carrying named fields:

| From | To | Carries |
|---|---|---|
| BMI Assessment | Dietary Nutrition Assessment | Daily energy needs → the prescription, plus height, weight, age, sex |
| BMI Assessment | Meal Plan Generator | Height, weight, BMI, daily energy needs → calorie target |
| BMI Assessment | ICU NutriPlan | Height, weight, age, sex |
| Dietary Nutrition Assessment | Meal Plan Generator | Energy prescription and macro split |
| Dietary Nutrition Assessment | Diet Plan Calendar Generator | Energy prescription and macro split |
| Diet Plan Generator | BMI Assessment | Intake measurements |
| Diet Plan Generator | Meal Plan Generator | Client details |
| Meal Plan Generator | Diet Plan Calendar Generator | Name, calorie target, start date |
| Meal Plan Generator | 7-Day Diet Menu Planner | Name, start date |
| Diet Plan Calendar Generator | 7-Day Menu (options) | Name, start date |

### How it works

`assets/gt-context.js` defines one canonical record — `patient.*`, `measure.*`,
`energy.*`, `macros.*`, `plan.*`, `dietitian.*` — and an adapter per app that
maps it on and off that app's own DOM. The apps never learn each other's field
names, and they stay byte-identical to upstream.

Writes go in as real `input`/`change` events, so each app recalculates exactly
as if the value had been typed: prefilling the Meal Plan Generator's height and
weight makes its own BMI badge update on its own.

Units and vocabularies are translated at the boundary. BMI Assessment works in
whatever unit is selected (cm/m/in/ft+in, kg/g/lb/st+lb) and the record stores
cm and kg; sex is `male`/`female` in the record and becomes `Male`/`Female` for
the apps that expect that.

**Placeholder values are never captured.** Several tools open with defaults —
BMI Assessment starts at 170 cm and 68 kg and computes a BMI from them.
Capture stays disarmed until the clinician actually enters something, so those
numbers never travel downstream as if they were measurements.

**Baby Growth & Feeding is deliberately not wired in.** Its subject is an
infant with its own identity and measurements; prefilling it from an adult
record would be a clinical error, not a convenience.

### Where the record lives

`localStorage` first — instant, shared across tabs on this origin, and enough
on its own. When you are signed in it is also mirrored to the
`gt_clinical_records` table so a record started on one machine can be finished
on another. That table is protected by row-level security: every policy is
scoped to `auth.uid()`, so a record is readable only by the account that
created it.

Clear it from the record bar on the portal, or from the switcher, at any time.

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
