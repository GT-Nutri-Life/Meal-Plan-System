#!/usr/bin/env node
/*
 * Compile the bundle's Tailwind CSS ahead of time.
 *
 *   scripts/build-tailwind.js [--check]
 *
 * Nine of the eleven bundled pages loaded https://cdn.tailwindcss.com — the
 * Play CDN, which Tailwind itself documents as a development convenience. It
 * costs about 400 KB on each of those pages, and then, having arrived, it scans
 * the DOM and compiles the stylesheet in the browser before anything can be
 * painted. That is the single largest thing standing between a click and a
 * usable page.
 *
 * The same stylesheet built here is around a tenth of that and needs no
 * compilation at the far end. It is generated from assets/gt-palette.js, so the
 * pastel palette and the compiled CSS cannot drift apart.
 *
 * --check rebuilds into memory and fails if the committed file differs, so a
 * page that starts using a new utility class cannot ship a stylesheet that
 * lacks it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const tailwind = require('tailwindcss');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'tailwind.css');
const CHECK = process.argv.includes('--check');

const P = require(path.join(ROOT, 'assets', 'gt-palette.js'));

const config = {
  content: [path.join(ROOT, 'apps', '**', '*.html')],
  theme: {
    extend: {
      colors: Object.assign({}, P.tailwindColors, P.legacyAliases,
                            { gt: P.sage, gtash: P.ash }),
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
      },
      borderRadius: {
        DEFAULT: '10px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px',
        /* BMI Assessment's own inline config names these, and its markup uses
           rounded-fb and rounded-fbl throughout. Compiling without them is how
           a prebuilt stylesheet silently loses a page's corners. */
        fb: '8px', fbl: '12px'
      },
      boxShadow: {
        sm: '0 1px 2px rgba(34,50,42,.05)',
        DEFAULT: '0 2px 8px rgba(34,50,42,.06)',
        md: '0 6px 20px rgba(34,50,42,.07)',
        lg: '0 14px 40px rgba(34,50,42,.09)',
        xl: '0 24px 60px rgba(34,50,42,.11)',
        fb: '0 1px 2px rgba(34,50,42,.10), 0 0 1px rgba(34,50,42,.12)',
        fbup: '0 4px 12px rgba(34,50,42,.12)'
      }
    }
  },
  /*
   * The pages build a few class names in template literals. Tailwind's scanner
   * reads raw file text, so `${on ? 'bg-fbblue3/60' : ''}` is found — the whole
   * name is there as a literal. These are the handful that are assembled from
   * parts and therefore are not.
   */
  safelist: [
    'dark', 'dark-mode',
    { pattern: /^(bg|text|border)-(gt|gtash)-(50|100|200|300|400|500|600|700|800|900)$/ }
  ]
};

const INPUT = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';

(async () => {
  const result = await postcss([
    tailwind(config),
    require('cssnano')({ preset: ['default', { discardComments: { removeAll: true } }] })
  ]).process(INPUT, { from: undefined });

  const built = result.css;
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

  if (CHECK) {
    if (existing === built) {
      console.log(`assets/tailwind.css is current (${(built.length / 1024).toFixed(1)} KB)`);
      return;
    }
    console.error('FAIL: assets/tailwind.css is stale. Run scripts/build-tailwind.js');
    process.exit(1);
  }

  fs.writeFileSync(OUT, built);
  console.log(`assets/tailwind.css written — ${(built.length / 1024).toFixed(1)} KB` +
              (existing ? ` (was ${(existing.length / 1024).toFixed(1)} KB)` : ''));
})().catch((e) => { console.error(e.message); process.exit(2); });
