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
  gt-palette.js             the pastel palette, defined once
  tailwind.css              the bundle's Tailwind utilities, compiled ahead of time
  gt-theme.css              the pastel skin: surfaces, forms, tables, print
  gt-theme-boot.js          resolves the shared theme before the first paint
  gt-chrome.js              the shared page header and footer, and the client bar
  gt-context.js             the shared clinical record and the per-app adapters
  gt-auth.js                the shared sign-in gate
  gt-lazy.js                loads the export libraries after the page has painted
  gt-switcher.js            the switcher injected into every bundled page
  favicon.svg
apps/<slug>/…               bundled subsystems, upstream copies with the shared
                            layer injected and their colour literals repointed
scripts/
  sync-apps.sh              refresh the bundled copies from upstream
  inject-nav.sh             attach the shared layer to bundled pages (idempotent)
  recolor-apps.js           repoint hardcoded colours to the palette (idempotent)
  defer-libs.js             take CDN libraries and fonts off the critical path
  build-tailwind.js         compile assets/tailwind.css from the palette
  check-supabase.js         live connectivity check against the Supabase project
  verify-registry.js        catch registry/disk/adapter drift — run by CI
tests/
  run.js                    entry point: node tests/run.js [portal|handoff|…]
  harness.js                static servers, browser lookup, assertions
  portal.test.js            catalogue, switcher, and the no-regression contract
  handoff.test.js           sign-in and the cross-system record
  crossref.test.js          what each subsystem hands the next one
  theme.test.js             one theme across eleven separate documents
  lazy.test.js              nothing a practitioner waits for is render-blocking
  stub-supabase.js          offline stand-in for the Supabase client
```

## One theme, eleven separate documents

The portal is not a single-page app. Every subsystem is its own HTML file, so
"the theme" only exists if each document independently arrives at the same
answer — and for a while none of them did. There were three mechanisms and
three storage keys:

| Where | Mechanism | Saved under |
|---|---|---|
| the portal | `html[data-theme]` | `gt-theme` |
| About the Dietitian | `html[data-theme]` | `pt` |
| both calendar tools | `body.dark-mode` | `darkMode` |

and **eight of the eleven bundled pages had no theme code whatsoever**, so they
could only ever follow the operating system. Choosing dark on the portal and
opening BMI Assessment put you back in daylight, because nothing on that page
could make it dark.

`assets/gt-theme-boot.js` is the single source of truth. It loads first and
synchronously in every `<head>` — applying the theme after first paint is what
produces a white flash, which on a portal of eleven separate documents means a
flash on every click. It writes the answer to all three mechanisms, keeps all
three keys in step so each page's own toggle still works and still agrees, and
watches for a page flipping its own class or attribute so that choice becomes
everyone's. The shared header carries a toggle, which is how the eight pages
without one got theirs.

`tests/theme.test.js` holds it there: choose dark once, then assert every
subsystem opens dark, that BMI reads light-on-dark, and that a calendar tool's
own button still steers the rest of the portal.

## How the pastel theme reaches eleven different pages

The bundled tools were written independently, against four different colour
vocabularies: Tailwind's default scales, per-page Tailwind configs with their
own names (`fbblue`, `brand`, `tablehd`), hand-rolled CSS custom properties,
and bare hex literals. Restyling them one at a time would guarantee drift, so
the palette is defined once in `assets/gt-palette.js` and reaches each
vocabulary by its own route:

| Where the colour lives | How it is repointed |
|---|---|
| Tailwind utility classes (`text-gray-700`, `bg-blue-50`) | `scripts/build-tailwind.js` compiles them from the palette into `assets/tailwind.css` |
| A page's own `tailwind.config` names | the same build, which keeps their keys and re-points their values |
| Hex and `rgba()` literals in a page's `<style>` block | `scripts/recolor-apps.js`, run once and checked by CI |
| Surfaces and ink a page hardcodes | the same script, pointed at the theme variables so they follow light and dark |
| Shared surfaces, forms, tables, print | `gt-theme.css`, loaded last so it wins on cascade order |

Two decisions are worth knowing about, because both were mistakes first:

* **The skin sets no heading colour.** Several pages put a heading inside a
  coloured banner and set it white; forcing an ink colour turned those
  unreadable.
* **CSS custom properties are repointed at their definition, not globally.**
  A name like `--text` means "dark text on a light card" on one page and
  "light text on a dark bar" on another, so one global value broke one of them
  every time. `recolor-apps.js` has a per-page table for the one page —
  ICU NutriPlan — that was designed dark and is now light.

Every colour in the palette clears WCAG AA where it carries text: the 600
steps sit at 4.7–5.5:1 on white and behind white labels, the 300 steps at
7–8:1 on the dark card, and the ratios are recorded next to each scale in
`gt-palette.js`. Accent names that serve as both a fill and an ink keep their
600 value — Tailwind allows one value per name — and their ink side is
corrected by the dark rules in `gt-theme.css`; pointing the name itself at a
variable made the text read and turned the mastheads into pale bands still
carrying their white headings.

Measured across the bundle, every distinct text-on-background pair, against the
background actually painted behind it:

| | before | after |
|---|---|---|
| failing pairs, dark | 70 — and dark did not apply at all on eight pages | 21 |
| failing pairs, light | 74 | 69 |

A translucent white is the one case that needs judgement. At α ≥ 0.7 it is a
surface and must follow the theme — ICU NutriPlan's sticky header is
`rgba(247,250,248,.85)`, which stayed light and took the shared skin's light
ink with it. Below that it is a highlight laid over something else
(`linear-gradient(45deg, transparent, rgba(255,255,255,0.1))` over a coloured
banner), and converting those too turned the banners solid white and left their
pale headings at 1:1.

## What the browser has to fetch before it can paint

Each subsystem was written on its own, and each one loaded its dependencies the
same way: render-blocking `<script>` and `<link>` tags in `<head>`, pointed at
four different CDNs. Nothing in the pages was slow. The waiting was.

| What used to block the first paint | What happens now |
|---|---|
| `cdn.tailwindcss.com` on nine pages — ~400 KB, and it compiles the stylesheet in the browser | `assets/tailwind.css`, 49 KB, compiled by `scripts/build-tailwind.js` from the same palette |
| jsPDF, html2canvas, SheetJS, docx, Chart.js, SweetAlert2, FileSaver, ics — up to 1.5 MB on one page | placeholders that `assets/gt-lazy.js` loads after the first paint |
| Google Fonts and Font Awesome stylesheets, on another origin | `media="print"`, promoted on load, with a `<noscript>` fallback |

Two libraries stay on the critical path on purpose. The diet plan pages call
`emailjs.init()` while they parse, and the Meal Plan Generator's sign-in gate
needs `supabase-js` before it can decide whether to show the app at all — a
page that cannot authenticate has not loaded.

Deferring an export library creates a window in which the button exists and the
library does not. `gt-lazy.js` closes it from both ends: loading starts at the
`load` event or at the first pointer, key or focus event, whichever comes
first, and a click that still beats it is swallowed, held, and replayed once
the libraries are in. The gate only ever sees buttons, so typing, focus and
navigation are never delayed by it, and it disarms itself as soon as loading
finishes. `tests/lazy.test.js` holds a stubbed CDN back deliberately and checks
that an early click runs exactly once, with its library present.

Measured across all twelve pages on a modelled 4G connection (170 ms RTT,
9 Mbit), first contentful paint went from 683 ms to 565 ms on average — 908 ms
to 608 ms on the worst page — and the bytes fetched before the load event fell
from 532 KB to 378 KB per page, 877 KB to 509 KB on the Meal Plan Generator.
The deferred libraries finish arriving about half a second later.

## The client library

The shared record follows the practitioner from tool to tool on its own. That
is a single slot, so starting a second client overwrites the first. Saving one
by name is a separate, deliberate act:

* **Save client** in the page header commits the record in hand to
  `gt_clients` under a name. Saving again under a name already in use updates
  that client — enforced by a unique index on `(user_id, lower(name))`, not
  just by the code that calls it.
* **Open** restores that client's record and makes it the client in hand, so
  every tool prefills from it.
* Rows are per practitioner, under the same row-level security as the rest of
  the schema: `auth.uid() = user_id and is_app_user()`.

## What crosses between subsystems

One client record, 52 canonical fields, and an adapter per tool that maps it on
and off that tool's own DOM. The apps stay ignorant of each other; the mapping
lives in `assets/gt-context.js`.

| Group | Carried |
|---|---|
| Patient | name, age, sex, date of birth, phone, email, address, patient ID, ward, occupation, country |
| Measurements | height, weight, waist, hip, target weight, body fat, BMI and its category |
| Energy | BMR, daily energy needs, activity level, energy prescription |
| Macros | carbohydrate / protein / fat split, as percentages **and** as grams |
| Clinical | conditions, diagnosis, allergies, medications, supplements |
| Plan | calorie target, start date, goal, duration, water, exercise, foods to avoid, notes |
| Meal times | bed tea, breakfast, mid-morning, lunch, evening snack, dinner |
| Dietitian | name, credentials, phone, email |

How much each tool exchanges, measured as a round trip — record in, page fills
itself, page read back out:

| Tool | Fields |
|---|---|
| Meal Plan Generator (and its Word export) | 27 |
| Diet Plan Generator | 21 |
| Dietary Nutrition Assessment | 13 |
| Diet Plan Calendar Generator | 12 |
| BMI Assessment | 10 |
| 7-Day Diet Menu Planner | 9 |
| ICU NutriPlan | 5 |
| 7-Day Menu — multiple options | 3 |

Baby Growth & Feeding stays deliberately unwired: its subject is an infant with
its own name, birth date, weight and length, and prefilling it from an adult
record would be a clinical error rather than a convenience.

Two things this had wrong, both silent:

* **The 7-Day Diet Menu Planner carried nothing at all.** Its client field
  carries a `name` rather than an `id`, the adapter it shared with the other
  weekly planner asked by id, and a lookup that finds nothing is
  indistinguishable from a field that was already correct. `$f()` now asks for
  the field either way, and the two planners have separate adapters because
  they are not actually twins.
* **Macro targets were percentages written into gram fields.** The calendar
  generator's inputs are labelled "Protein (g)", but they were mapped to
  `macros.*Pct`, so a 50/20/30 split arrived as a 50 g carbohydrate target.
  Grams and percentages are now separate fields, and grams are derived from the
  split at 4/4/9 kcal per gram when only the split is known.

`tests/crossref.test.js` puts a complete client through every tool and asserts a
floor on how much survives, so a field going dead fails the build instead of
quietly not filling.

## Cross-references fill themselves

A tool opened with a record in hand fills itself, rather than waiting to be
asked. Two rules keep that safe:

* **An unsaved record fills only empty fields.** It never replaces something
  already on screen. An explicitly opened client is a stronger claim — "show
  me this person" — and does overwrite.
* **A prefill is not data entry.** Writing into a field fires `input` and
  `change`, which is what makes the app's own listeners recalculate. The
  switcher listens for those same events to decide the clinician has started
  typing, at which point it captures the page back into the record. Left
  alone, a prefill therefore triggered a capture of the page it had just
  written — and on a page carrying placeholder values (BMI opens at 170 cm and
  68 kg) that overwrote the real record with the placeholders.
  `GTContext.isWriting()` is how a listener tells the two apart.

What was filled is announced with an undo, since a number appearing in a
clinical field on its own deserves an explanation.

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
`/Meal-Plan-System/`, and from `file://`.

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
scripts/inject-nav.sh              # re-attach the shared layer to fresh files
scripts/recolor-apps.js            # repoint the colours a fresh copy brings back
scripts/defer-libs.js              # re-defer the CDN libraries it brings back
scripts/build-tailwind.js          # rebuild the stylesheet for any new utilities
scripts/verify-registry.js         # confirm registry and disk agree
```

All four are idempotent, and CI runs each with `--check`, so a page that came
back from upstream without the shared layer, still carrying its original
colours, or blocking its first paint on a CDN fails the build rather than
shipping.

`sync-apps.sh` compares upstream against the bundled copy *with the injected tag
removed*, so the injection itself never registers as a change. You can also sync
a single subsystem: `scripts/sync-apps.sh bmi-assessment`.

## Adding a subsystem

1. Copy its files into `apps/<slug>/`.
2. Add an entry to `TOOLS` in `assets/registry.js` (and to `SOURCES` if the
   repository is new).
3. Add the slug, repository and file list to the `MAP` block in
   `scripts/sync-apps.sh`.
4. Run `scripts/inject-nav.sh && scripts/recolor-apps.js && scripts/defer-libs.js
   && scripts/build-tailwind.js && scripts/verify-registry.js`.

The portal and the switcher both pick it up with no further changes.

## Tests

```bash
npm install                 # playwright
npx playwright install chromium
npm test                    # verification + both browser suites
node tests/run.js portal    # just the catalogue and switcher
node tests/run.js handoff   # just sign-in, the record and the client library
node tests/run.js crossref  # just the cross-system prefill checks
node tests/run.js theme     # just the shared-theme checks
node tests/run.js lazy      # just the deferred-library checks
npm run check:supabase      # live check against the Supabase project
```

`check:supabase` is the one thing not wired into `npm test`. The suites stub
Supabase on purpose, so CI never fails because a third-party service is having
a bad morning — which leaves nothing that answers "is the project the deployed
site points at actually reachable, and is the key it ships still good?". That
script asks directly, reading the URL and key out of `assets/gt-auth.js` so it
cannot drift from what the site serves. There is a manual-dispatch workflow,
**Check Supabase connectivity**, that runs it on demand.

`tests/run.js` starts two throwaway static servers: one serving the portal, and
a **control** server that serves each bundled page with the injected `<script>`
line stripped back out — reconstructing the upstream file exactly. Every app is
then loaded twice, so a JavaScript error only counts against the portal if the
original page does not already produce it. Several apps load Tailwind, jsPDF and
similar from CDNs, and those failing offline must not read as a regression.

The suites also assert the contract that makes bundling safe: **layout width
identical to the original**, on all eleven pages.

Sign-in and the cloud mirror run against `tests/stub-supabase.js` rather than
the practice's live project, so the suite is offline and CI does not depend on
a third-party service. That means the checks cover the *logic* — wrong password,
off-allow-list account, public-page exemption, no double prompt — but not the
live Supabase endpoint. Verify a real sign-in by hand after deploying.

## Deployment

This repository is `GT-Nutri-Life/Meal-Plan-System`, published at
<https://gt-nutri-life.github.io/Meal-Plan-System/>. Enable it under
**Settings → Pages → Source: GitHub Actions**.

The deployment path is not baked in anywhere: the switcher works out the portal
root from its own script URL, so the same files serve correctly from a domain
root, a project path, or `file://`.


`.github/workflows/static.yml` runs on every push and pull request. It checks
that every bundled page carries the switcher, that the registry, adapters and
data-flow declarations agree with what is on disk, and then runs both browser
suites in Chromium. Only a push to `main` that passes all of it publishes to
GitHub Pages.

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
