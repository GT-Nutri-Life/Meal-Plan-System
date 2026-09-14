#!/usr/bin/env node
/*
 * Repoint the colour literals the bundled pages hardcode.
 *
 *   scripts/recolor-apps.js [--check]
 *
 * The prebuilt assets/tailwind.css already turns every Tailwind colour utility
 * in the bundle pastel, and gt-theme.css covers the shared surfaces. Neither
 * can reach a hex written directly into a page's own <style> block — and that
 * is where the loudest colour in this bundle lives: the #667eea → #764ba2
 * banner gradient, the #1877F2 title bars, the #EF4444 alerts. Left alone they
 * are the only saturated things on an otherwise pastel screen.
 *
 * Scope is deliberately narrow. Only <style> blocks and inline style="…"
 * attributes are rewritten. Hex literals inside the pages' JavaScript are left
 * alone: some of them are colour, but others are chart data, thresholds and
 * ids, and no rewrite worth having is worth guessing about that.
 *
 * The mapping is one-way — no pastel value maps to another pastel value — so
 * running this twice changes nothing the second time, which is what makes it
 * safe to re-run after scripts/sync-apps.sh pulls fresh copies from upstream.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

/*
 * Every mapping keeps white text legible where the original carried it: the
 * saturated 500s and 600s become pastel 600s and 700s rather than the pale
 * steps, because a banner that goes pastel while its hardcoded white heading
 * stays put is not a nicer page, it is an unreadable one.
 */
const MAP = {
  /* indigo/violet banner gradients — the loudest thing in the bundle */
  '#667EEA': '#7566A8', '#764BA2': '#5E5288', '#8B5CF6': '#8B7BC0', '#7B4DD8': '#7566A8',
  '#4472C4': '#7566A8',

  /* blues: title bars, links, primary buttons */
  '#1877F2': '#4A76AB', '#166FE5': '#3C5F8A', '#E7F3FF': '#EEF4FB',
  '#0066CC': '#4A76AB', '#3B82F6': '#5E8CC4', '#2563EB': '#4A76AB',
  '#1E40AF': '#3C5F8A', '#1565C0': '#4A76AB',

  /* teals and cyans */
  '#0EA5A5': '#489A93', '#06B6D4': '#489A93', '#0D9488': '#3B7C76',

  /* greens */
  '#10B981': '#4E9E77', '#059669': '#3E7F60', '#16A34A': '#3E7F60',
  '#42B72A': '#4E9E77', '#2E9E1E': '#3E7F60', '#70AD47': '#4E9E77',
  '#92D050': '#9ECFB6', '#2E7D32': '#3E7F60',

  /* reds — still unmistakably an error, just quieter */
  '#EF4444': '#B5555F', '#DC2626': '#A44E58', '#F43F5E': '#B5555F',
  '#FA383E': '#B5555F', '#C9252B': '#A44E58',

  /* ambers and oranges */
  '#F59E0B': '#B08442', '#F7B928': '#D8A752', '#F7770F': '#B08442',
  '#EF6C00': '#B08442', '#FFF2CC': '#FDF6EA', '#E2C87A': '#F4DBA9',

  /* near-blacks and slates — warmed to match the palette's ink */
  '#2D3748': '#46574F', '#1A202C': '#33413B', '#111827': '#22322A',
  '#0F172A': '#22322A', '#0F2B4A': '#22322A', '#4A5568': '#5E7268',
  '#050505': '#22322A', '#1A1A2E': '#33413B', '#16213E': '#22322A',

  /* the greys each page picked for itself */
  '#F0F2F5': '#EEF3F0', '#65676B': '#5E7268', '#8A8D91': '#63796D',
  '#CED0D4': '#C9D6CE', '#E4E6EB': '#DFE8E3', '#F2F2F5': '#EEF3F0',
  '#EEF1F6': '#F1F7F3', '#F2F2F2': '#F7F9F8', '#C9CED8': '#C9D6CE',
  '#9AA3B2': '#93A89B', '#CCD0D5': '#DDEAE2', '#F3F7F8': '#F1F7F3',

  /* stragglers: a hot-pink accent and a saturated teal on the infant page,
     and the original practice green on About the Dietitian */
  '#F472B6': '#D27E87', '#0B8686': '#3B7C76', '#E6FBF9': '#EAF6F5',
  '#2D7A5F': '#3E7F60', '#3A9E7A': '#4E9E77', '#FAFBF9': '#F7FAF8',
  '#1B2A22': '#22322A', '#3D5A4C': '#46574F', '#5F8474': '#63796D'
};

/*
 * One page needs its own table before the shared one runs.
 *
 * ICU NutriPlan is the only dark-themed page in the bundle, and a global hex
 * map cannot convert it: #0F172A is a page background there and body text
 * elsewhere, so a single rule for it is wrong on one page or the other. These
 * mappings turn its surfaces light and its type dark — the same inversion, done
 * where the meaning of each colour is actually known.
 */
const PAGE_MAP = {
  'apps/meal-plan-generator/icu.html': {
    '#0A0E17': '#F7FAF8',   /* page             */
    '#111827': '#F1F7F3',   /* secondary surface */
    '#1A2236': '#FFFFFF',   /* card             */
    '#1F2A42': '#EFF7F2',   /* card hover       */
    '#0D1321': '#FFFFFF',   /* input            */
    '#2A3654': '#DDEAE2',   /* border           */
    '#E8EDF5': '#22322A',   /* primary text     */
    '#8896B3': '#46574F',   /* secondary text   */
    '#5A6A8A': '#63796D'    /* muted text       */
  }
};

/** Expand #abc to #aabbcc so the table matches either spelling. */
function expand(hex) {
  const h = hex.slice(1);
  return h.length === 3 ? '#' + h.split('').map((c) => c + c).join('').toUpperCase()
                        : '#' + h.toUpperCase();
}

/** "#RRGGBB" -> [r, g, b] */
function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/*
 * Surfaces, rewritten to follow the theme.
 *
 * The pass above makes a page's colours pastel, but pastel *light*: a card
 * hardcoded to #FFFFFF stays white when the portal goes dark, and the shared
 * skin's light ink then lands on it. That is most of what "this page does not
 * handle dark mode" actually means — measured across the bundle it was 68
 * failing colour pairs, nearly all of them light-on-light.
 *
 * These point at the theme variables the skin already defines, which hold the
 * same value in light mode and flip in dark. Only backgrounds and borders are
 * touched: the same hex in a `color:` declaration is ink, not a surface, and
 * must not follow the theme.
 */
const SURFACE = {
  page:   ['#F7FAF8'],
  card:   ['#FFFFFF', '#FEFEFE'],
  soft:   ['#F7F9F8', '#F8FAFC', '#F3F4F4', '#EEF3F0', '#F1F7F3', '#F2F2F2',
           '#FAFBF9', '#F0F2F5', '#F9FAFB', '#F5F5F5', '#FAFBFD', '#EFF6FF'],
  sunken: ['#EFF7F2', '#EAF6F5', '#EEF4FB', '#F4F0FA', '#FCEFF0', '#FDF6EA',
           '#DCEEE4', '#D9E1F2', '#E5EDF2', '#DBEAFE', '#D1FAE5', '#EDF3EF'],
  border: ['#DDEAE2', '#DFE8E3', '#C9D6CE', '#E5E7EB', '#CBD5E1', '#D9D9D9',
           '#D5D9D7', '#E4E6EB', '#CED0D4', '#E2E8F0', '#B6BBB9', '#E5E8EE']
};

const SURFACE_FALLBACK = { page: '#F7FAF8', card: '#FFFFFF', soft: '#F1F7F3', sunken: '#EDF3EF', border: '#DDEAE2' };
const SURFACE_VAR = {};
for (const [token, list] of Object.entries(SURFACE)) {
  for (const hex of list) SURFACE_VAR[hex.toUpperCase()] = `var(--gt-${token},${SURFACE_FALLBACK[token]})`;
}

/* Declarations whose value paints a surface rather than ink. box-shadow is
   left out on purpose: it is mostly rgba, and a soft shadow reads acceptably
   in either theme.

   Custom properties are included by name, because a page that drives itself
   from its own variables — ICU NutriPlan sets --bg-card, --bg-input, --border
   — never reaches the concrete declarations below. Those variables *are* its
   surfaces. */
const SURFACE_PROP = /^(background|background-color|border|border-top|border-right|border-bottom|border-left|border-color|border-top-color|border-right-color|border-bottom-color|border-left-color|outline|outline-color|--(bg|background|card|surface|panel|border)[-a-z0-9]*|--[a-z0-9]*-(bg|background|border)[-a-z0-9]*)$/i;

/*
 * Ink.
 *
 * The same treatment for text: the body greys point at --gt-ink and its two
 * quieter steps, and the accents at --gt-a-*, which hold the 600 steps in
 * light and the 300 steps in dark. Without this a page's own .badge-green
 * keeps a mid-tone green that measures 3.3:1 on a dark card.
 */
const INK = {
  '#22322A': 'var(--gt-ink,#22322A)',
  '#46574F': 'var(--gt-ink-2,#46574F)',
  '#63796D': 'var(--gt-ink-3,#63796D)',
  '#3E7F60': 'var(--gt-a-sage,#3E7F60)',
  '#4A76AB': 'var(--gt-a-sky,#4A76AB)',
  '#7566A8': 'var(--gt-a-lilac,#7566A8)',
  '#3B7C76': 'var(--gt-a-aqua,#3B7C76)',
  '#A44E58': 'var(--gt-a-blush,#A44E58)',
  '#B5555F': 'var(--gt-a-blush,#A44E58)',
  '#8A6737': 'var(--gt-a-butter,#8A6737)',
  '#B08442': 'var(--gt-a-butter,#8A6737)',
  /* Stock Tailwind/Chakra greys the pages wrote in by hand. */
  '#A0AEC0': 'var(--gt-ink-3,#63796D)',
  '#6B7280': 'var(--gt-ink-3,#63796D)',
  '#334155': 'var(--gt-ink-2,#46574F)',
  '#0F172A': 'var(--gt-ink,#22322A)',
  '#111827': 'var(--gt-ink,#22322A)',
  '#1F2937': 'var(--gt-ink,#22322A)',
  '#4B5563': 'var(--gt-ink-2,#46574F)',
  '#718096': 'var(--gt-ink-3,#63796D)',
  /* The 500 steps, which pages use for accent text. */
  '#5E8CC4': 'var(--gt-a-sky,#4A76AB)',
  '#489A93': 'var(--gt-a-aqua,#3B7C76)',
  '#4E9E77': 'var(--gt-a-sage,#3E7F60)',
  '#8B7BC0': 'var(--gt-a-lilac,#7566A8)'
};

const INK_PROP = /^(color|fill|stroke|--(text|ink|fg|foreground|accent)[-a-z0-9]*|--[a-z0-9]*-(text|ink|fg|accent)[-a-z0-9]*)$/i;

/* `background: white` appears 26 times across the bundle and never reached the
   hex table, because it is a keyword. `color: white` appears 43 times and must
   stay white — it is the label on a coloured fill. So the keyword is only
   translated in a surface declaration. */
const SURFACE_KEYWORD = /\bwhite\b/gi;

/** Point a page's hardcoded surfaces and ink at the theme variables. */
function themeSurfaces(css) {
  let hits = 0;
  const out = css.replace(/([-a-zA-Z0-9]+)\s*:\s*([^;{}]+)/g, (m, prop, value) => {
    const name = prop.trim();
    const table = SURFACE_PROP.test(name) ? SURFACE_VAR
                : INK_PROP.test(name)     ? INK
                : null;
    if (!table) return m;
    // Already pointed at a variable: leave it, or the fallback hex inside it
    // would be rewritten again on every run.
    if (value.includes('var(--gt-')) return m;
    let next = value.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (h) => {
      const to = table[expand(h)];
      if (!to) return h;
      hits++;
      return to;
    });
    if (table === SURFACE_VAR) {
      next = next.replace(SURFACE_KEYWORD, () => { hits++; return 'var(--gt-card,#FFFFFF)'; });
      /*
       * A nearly-opaque near-white is a surface, and must follow the theme:
       * ICU NutriPlan's sticky header is rgba(247,250,248,.85), which stayed
       * light when the page went dark and then carried the shared skin's light
       * ink at 1.2:1.
       *
       * A *translucent* white is not a surface — it is a highlight laid over
       * something else, and the pages use it that way:
       * `linear-gradient(45deg, transparent, rgba(255,255,255,0.1))` over a
       * coloured banner. Converting those too turned the banners solid white
       * and left their pale headings at 1:1 in light mode. So only alpha ≥ 0.7
       * counts, and the alpha itself is dropped, there being no portable way
       * to put a variable inside rgba().
       */
      next = next.replace(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/g,
        (m2, r, g, b, a) => {
          if (!(+r > 200 && +g > 200 && +b > 200)) return m2;
          if (a !== undefined && parseFloat(a) < 0.7) return m2;
          hits++;
          return 'var(--gt-card,#FFFFFF)';
        });
    }
    return next === value ? m : prop + ': ' + next;
  });
  return { css: out, hits };
}

/**
 * Rewrite the colour literals inside one chunk of CSS.
 *
 * Both spellings are handled, because these pages use both for the same
 * colour: #3b82f6 for a solid fill and rgba(59,130,246,.15) for the glow
 * under it. Translating only the hex would leave the glow the wrong hue, so
 * the rgb() forms are looked up through the same table and keep their alpha.
 */
function recolorCss(css, pageMap) {
  let hits = 0;
  const lookup = (key) => (pageMap && pageMap[key]) || MAP[key];

  let out = css.replace(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m) => {
    const to = lookup(expand(m));
    if (!to) return m;
    hits++;
    return to;
  });

  out = out.replace(
    /\brgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,[^)]*)?\)/g,
    (m, r, g, b, rest) => {
      const key = '#' + [r, g, b]
        .map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
      const to = lookup(key);
      if (!to) return m;
      hits++;
      const [nr, ng, nb] = rgbOf(to);
      return (rest ? 'rgba(' : 'rgb(') + nr + ',' + ng + ',' + nb + (rest || '') + ')';
    }
  );

  const surf = themeSurfaces(out);
  return { css: surf.css, hits: hits + surf.hits };
}

/** Apply that to a page's <style> blocks and style="…" attributes only. */
function recolorHtml(html, pageMap) {
  let hits = 0;

  html = html.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, body, close) => {
    const r = recolorCss(body, pageMap);
    hits += r.hits;
    return open + r.css + close;
  });

  html = html.replace(/\sstyle="([^"]*)"/g, (m, body) => {
    const r = recolorCss(body, pageMap);
    hits += r.hits;
    return r.hits ? ' style="' + r.css + '"' : m;
  });

  return { html, hits };
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : (p.endsWith('.html') ? [p] : []);
  });
}

let changed = 0, total = 0;
for (const file of walk(path.join(ROOT, 'apps')).sort()) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const { html, hits } = recolorHtml(src, PAGE_MAP[rel.split(path.sep).join('/')]);
  if (!hits) continue;
  total += hits;
  changed++;
  if (CHECK) console.log(`  would recolour ${rel}: ${hits} literal${hits === 1 ? '' : 's'}`);
  else { fs.writeFileSync(file, html); console.log(`  recoloured ${rel}: ${hits} literal${hits === 1 ? '' : 's'}`); }
}

console.log('---');
console.log(`${CHECK ? 'would recolour' : 'recoloured'}: ${total} literal(s) across ${changed} page(s)`);

if (CHECK && changed) {
  console.error('FAIL: pages above still carry pre-palette colours. Run scripts/recolor-apps.js');
  process.exit(1);
}
