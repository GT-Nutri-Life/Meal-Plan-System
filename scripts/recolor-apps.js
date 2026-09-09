#!/usr/bin/env node
/*
 * Repoint the colour literals the bundled pages hardcode.
 *
 *   scripts/recolor-apps.js [--check]
 *
 * gt-tailwind.js already turns every Tailwind colour utility in the bundle
 * pastel, and gt-theme.css covers the shared surfaces. Neither can reach a hex
 * written directly into a page's own <style> block — and that is where the
 * loudest colour in this bundle lives: the #667eea → #764ba2 banner gradient,
 * the #1877F2 title bars, the #EF4444 alerts. Left alone they are the only
 * saturated things on an otherwise pastel screen.
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

  return { css: out, hits };
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
