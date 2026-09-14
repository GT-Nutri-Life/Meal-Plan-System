#!/usr/bin/env node
/*
 * Take the export libraries and the web fonts off the critical path.
 *
 *   scripts/defer-libs.js [--check]
 *
 * The bundled pages were each written on their own, and every one of them
 * loads its CDN dependencies the same way: a render-blocking <script> in
 * <head>. Added up that is 1.5 MB of PDF, spreadsheet, Word, chart and dialog
 * code the browser must fetch and run before it paints anything — none of it
 * needed until somebody presses Export.
 *
 * Two rewrites, both idempotent:
 *
 *   1. Every library in LAZY becomes an inert placeholder carrying its URL in
 *      data-gt-lazy. assets/gt-lazy.js loads them after first paint and holds
 *      any button click that beats them there.
 *
 *      Two are deliberately not in that list, because their pages use them
 *      while they parse rather than on a button: EmailJS, which the diet plan
 *      pages hand a public key to as they load, and supabase-js, which the
 *      Meal Plan Generator's sign-in gate needs before it can decide whether
 *      to show the app at all. A page that cannot authenticate has not
 *      loaded, so its auth client belongs on the critical path.
 *
 *   2. Third-party stylesheets — Google Fonts, Font Awesome — are loaded with
 *      media="print" and promoted on load, so the browser paints in the
 *      fallback face instead of waiting on another origin. Every font URL in
 *      the bundle already asks for display=swap, so the swap was always going
 *      to happen; this just stops it holding up the first paint.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');

/*
 * Keyed by a distinctive fragment of the URL. `provides` names the global the
 * library defines, `needs` the global it extends — the only ordering that
 * matters here is that jspdf-autotable sees jsPDF before it runs.
 */
const LAZY = [
  { match: 'jspdf.plugin.autotable', needs: 'jspdf' },
  { match: 'jspdf/', provides: 'jspdf' },
  { match: 'html2canvas', provides: 'html2canvas' },
  { match: 'xlsx.full', provides: 'XLSX' },
  { match: 'docx@', provides: 'docx' },
  { match: 'chart.umd', provides: 'Chart' },
  { match: 'Chart.js/', provides: 'Chart' },
  { match: 'sweetalert2', provides: 'Swal' },
  { match: 'FileSaver', provides: 'saveAs' },
  { match: 'ics@', provides: 'ics' }
];

const LAZY_SRC = 'assets/gt-lazy.js';

function lazyRule(url) {
  return LAZY.find((r) => url.includes(r.match)) || null;
}

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
  return m ? m[1] : null;
}

/* --------------------------------------------------------------- scripts */

function deferScripts(html, depth) {
  let hits = 0;

  html = html.replace(/([ \t]*)<script\b([^>]*)\bsrc="(https?:\/\/[^"]+)"([^>]*)><\/script>/g,
    (whole, indent, pre, url, post) => {
      const rule = lazyRule(url);
      if (!rule) return whole;
      hits++;
      const tag = pre + post;
      const cross = attr(tag, 'crossorigin');
      const bits = ['<script data-gt-lazy="' + url + '"'];
      if (rule.provides) bits.push(' data-gt-lazy-provides="' + rule.provides + '"');
      if (rule.needs) bits.push(' data-gt-lazy-needs="' + rule.needs + '"');
      if (cross !== null) bits.push(' data-gt-lazy-crossorigin="' + cross + '"');
      bits.push('></script>');
      return indent + bits.join('');
    });

  /* The loader only ships on pages that have something to defer, and it goes
     in ahead of the first placeholder so the click gate is armed before the
     page's own scripts can wire up an export button. */
  const wants = /data-gt-lazy="/.test(html);
  const has = new RegExp('src="[^"]*' + LAZY_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(html);
  if (wants && !has) {
    html = html.replace(/([ \t]*)(<script data-gt-lazy=")/,
      (m, indent, tagStart) =>
        indent + '<script src="' + depth + LAZY_SRC + '" defer></script>\n' + indent + tagStart);
    hits++;
  }

  return { html, hits };
}

/* ------------------------------------------------------------ stylesheets */

function deferStyles(html) {
  let hits = 0;

  /* The <noscript> fallback we emit holds a plain stylesheet link by design.
     Mask those blocks first so a second run does not "defer" the fallback. */
  const masked = [];
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, (m) => {
    masked.push(m);
    return '\u0000noscript' + (masked.length - 1) + '\u0000';
  });

  html = html.replace(/<link\b([^>]*)>/g, (whole, body) => {
    if (!/\brel="stylesheet"/.test(body)) return whole;
    const href = attr(whole, 'href');
    if (!href || !/^https?:\/\//.test(href)) return whole;
    if (/\bmedia="/.test(body)) return whole;          // already handled
    hits++;
    return '<link' + body + ' media="print" onload="this.media=\'all\'">' +
      '<noscript><link' + body + '></noscript>';
  });

  html = html.replace(/\u0000noscript(\d+)\u0000/g, (m, i) => masked[Number(i)]);

  return { html, hits };
}

/* ------------------------------------------------------------------ walk */

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : (p.endsWith('.html') ? [p] : []);
  });
}

const files = [path.join(ROOT, 'index.html'), ...walk(path.join(ROOT, 'apps'))].sort();

let changed = 0;
let total = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const depth = '../'.repeat(rel.split('/').length - 1);
  const src = fs.readFileSync(file, 'utf8');

  const a = deferScripts(src, depth);
  const b = deferStyles(a.html);
  const hits = a.hits + b.hits;
  if (!hits) continue;

  total += hits;
  changed++;
  const verb = CHECK ? 'would defer' : 'deferred';
  console.log(`  ${verb} in ${rel}: ${a.hits} script(s), ${b.hits} stylesheet(s)`);
  if (!CHECK) fs.writeFileSync(file, b.html);
}

console.log('---');
console.log(`${CHECK ? 'would defer' : 'deferred'}: ${total} tag(s) across ${changed} page(s)`);

if (CHECK && changed) {
  console.error('FAIL: pages above still block first paint on a CDN. Run scripts/defer-libs.js');
  process.exit(1);
}
