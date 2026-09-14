/*
 * Suite 5 — nothing a practitioner has to wait for is on the critical path.
 *
 * Every bundled page was written on its own and each one loaded its CDN
 * dependencies the same way: a render-blocking <script> in <head>. Added up,
 * the Meal Plan Generator made the browser fetch and run about 1.5 MB of PDF,
 * Word, spreadsheet, chart and dialog code before it was allowed to paint a
 * single field — none of which is touched until somebody presses Export.
 *
 * scripts/defer-libs.js turns those tags into placeholders and assets/
 * gt-lazy.js loads them after first paint. The risk that buys is a window in
 * which a button exists but the library behind it does not, so the checks
 * below are as much about that window as about the bytes: the libraries must
 * arrive on their own, and a click that beats them there must still run.
 *
 * The CDNs themselves are stubbed. What is under test is our machinery — the
 * placeholders, the ordering, the gate — not whether unpkg is up today.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const PAGES = [
  ['portal',      '/index.html'],
  ['bmi',         '/apps/bmi-assessment/index.html'],
  ['dna',         '/apps/dietary-nutrition-assessment/index.html'],
  ['mpg',         '/apps/meal-plan-generator/index.html'],
  ['mpg-main',    '/apps/meal-plan-generator/main.html'],
  ['icu',         '/apps/meal-plan-generator/icu.html'],
  ['babies',      '/apps/meal-plan-generator/babies.html'],
  ['dpg',         '/apps/diet-plan-generator/index.html'],
  ['dpg-7day',    '/apps/diet-plan-generator/7-day-menu.html'],
  ['dpcg',        '/apps/diet-plan-calendar-generator/index.html'],
  ['dpcg-7day',   '/apps/diet-plan-calendar-generator/7day-diet-menu.html'],
  ['about',       '/apps/about-dietitian/index.html']
];

/* Stand in for the CDN: define the global the page expects, and record that
   this particular URL was asked for. */
function stubFor(url) {
  const g =
    /jspdf\.plugin\.autotable/.test(url) ? null :
    /jspdf/.test(url)        ? 'jspdf' :
    /html2canvas/.test(url)  ? 'html2canvas' :
    /xlsx/.test(url)         ? 'XLSX' :
    /docx@/.test(url)        ? 'docx' :
    /chart/i.test(url)       ? 'Chart' :
    /sweetalert2/.test(url)  ? 'Swal' :
    /FileSaver/.test(url)    ? 'saveAs' :
    /ics@/.test(url)         ? 'ics' :
    /emailjs/.test(url)      ? 'emailjs' : null;

  let js = '(window.__gtLoaded=window.__gtLoaded||[]).push(' + JSON.stringify(url) + ');';
  if (/jspdf\.plugin\.autotable/.test(url)) {
    /* The plugin extends jsPDF, so it must never run before jsPDF does. */
    js += 'window.__gtAutotableSawJsPDF = typeof window.jspdf !== "undefined";';
  } else if (g) {
    js += 'window.' + g + '=window.' + g + '||function(){};';
  }
  return js;
}

module.exports = async function run({ newIsolated, B, reporter }) {
  const r = reporter('DEFERRED LIBRARIES');
  const { ok } = r;

  /* ---- static: no page may block its first paint on another origin ---- */

  let blocking = [];
  for (const [name, url] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, url.replace(/^\//, '')), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));

    for (const m of head.matchAll(/<script\b([^>]*)\bsrc="(https?:\/\/[^"]+)"/g)) {
      if (!/\bdefer\b|\basync\b/.test(m[1])) blocking.push(name + ' script ' + m[2]);
    }
    for (const m of head.matchAll(/<link\b([^>]*)>/g)) {
      const tag = m[0];
      if (!/rel="stylesheet"/.test(tag)) continue;
      if (!/href="https?:\/\//.test(tag)) continue;
      if (/media="print"/.test(tag)) continue;           // promoted on load
      if (head.slice(0, m.index).lastIndexOf('<noscript>') >
          head.slice(0, m.index).lastIndexOf('</noscript>')) continue;
      blocking.push(name + ' stylesheet ' + (tag.match(/href="([^"]+)"/) || [])[1]);
    }
  }
  /* Two exceptions, both deliberate: the diet plan pages call emailjs.init()
     while they parse, and the Meal Plan Generator's sign-in gate needs
     supabase-js before it can decide whether to show the app at all. A page
     that cannot authenticate has not loaded. Everything else must be off the
     critical path. */
  blocking = blocking.filter((b) => !/emailjs|supabase-js/.test(b));
  ok(blocking.length === 0, `no page blocks first paint on a CDN (${blocking.length} found)`);
  for (const b of blocking.slice(0, 6)) ok(false, '  ' + b);

  /* ---- every placeholder is backed by a loader ---- */

  let orphans = 0;
  for (const [, url] of PAGES) {
    const html = fs.readFileSync(path.join(ROOT, url.replace(/^\//, '')), 'utf8');
    if (/data-gt-lazy="/.test(html) && !/src="[^"]*assets\/gt-lazy\.js"/.test(html)) orphans++;
  }
  ok(orphans === 0, 'every page with deferred libraries ships the loader');

  /* ---- runtime: the libraries arrive on their own ---- */

  const ctx = await newIsolated({ signedIn: true });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(B)) return route.continue();
    if (/^https?:\/\//.test(u) && /\.js($|\?)|sweetalert2@|supabase-js@/.test(u)) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: stubFor(u) });
    }
    if (/^https?:\/\//.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    return route.continue();
  });

  const page = await ctx.newPage();

  for (const [name, url] of PAGES) {
    await page.goto(B + url, { waitUntil: 'load' });
    const declared = await page.evaluate(() =>
      [].slice.call(document.querySelectorAll('script[data-gt-lazy]'))
        .map((s) => s.getAttribute('data-gt-lazy-provides')).filter(Boolean));
    if (!declared.length) continue;

    await page.waitForFunction(() => window.GTLazy && window.GTLazy.isReady(), null, { timeout: 10000 })
      .catch(() => {});
    const state = await page.evaluate((names) => ({
      ready: !!(window.GTLazy && window.GTLazy.isReady()),
      missing: names.filter((n) => typeof window[n] === 'undefined')
    }), declared);
    ok(state.ready && !state.missing.length,
      `${name}: ${declared.length} deferred librar${declared.length === 1 ? 'y arrives' : 'ies arrive'} unprompted` +
      (state.missing.length ? ' — missing ' + state.missing.join(', ') : ''));
  }

  /* ---- ordering: the autotable plugin never runs before jsPDF ---- */

  await page.goto(B + '/apps/meal-plan-generator/main.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.GTLazy && window.GTLazy.isReady(), null, { timeout: 10000 }).catch(() => {});
  ok(await page.evaluate(() => window.__gtAutotableSawJsPDF === true),
    'the jsPDF autotable plugin loads after jsPDF, not beside it');

  /* ---- the gate: a click that beats the libraries is replayed, not lost ---- */

  const gated = await ctx.newPage();
  await gated.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith(B)) return route.continue();
    /* Hold the CDN long enough that a click is guaranteed to arrive first. */
    if (/^https?:\/\//.test(u)) {
      return new Promise((res) => setTimeout(() =>
        res(route.fulfill({ status: 200, contentType: 'text/javascript', body: stubFor(u) })), 1200));
    }
    return route.continue();
  });
  await gated.goto(B + '/apps/meal-plan-generator/main.html', { waitUntil: 'domcontentloaded' });
  await gated.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'gt-gate-probe';
    b.textContent = 'probe';
    b.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483647';
    b.addEventListener('click', () => {
      window.__probeRanWith = typeof window.jspdf !== 'undefined';
      window.__probeRan = (window.__probeRan || 0) + 1;
    });
    document.body.appendChild(b);
  });
  ok(await gated.evaluate(() => !window.GTLazy.isReady()), 'the gate is armed while the libraries are still in flight');
  await gated.click('#gt-gate-probe');
  await gated.waitForFunction(() => window.__probeRan, null, { timeout: 15000 }).catch(() => {});
  const probe = await gated.evaluate(() => ({ n: window.__probeRan || 0, withLib: !!window.__probeRanWith }));
  ok(probe.n === 1, `an early click runs exactly once (${probe.n})`);
  ok(probe.withLib, 'and it runs with the library it needed already present');

  await ctx.close();
  return r;
};
