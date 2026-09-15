/*
 * Suite 6 — a handout is ink on paper, and paper is white.
 *
 * Two of the three export routes read the live DOM, so in dark mode they took
 * the dark mode with them: html2canvas rasterised dark cards, and the
 * off-screen HTML these pages build for the PDF carries inline styles like
 * `var(--gt-border,#DDEAE2)`, which resolve against whatever theme is live.
 * Printing failed from the other end — the print sheet whitened the page
 * ground and left the dark cards on it.
 *
 * The real library cannot run here, so what is checked is the thing that was
 * actually broken: what the DOM looks like *at the moment the exporter reads
 * it*. A stand-in html2canvas samples the document from inside the call.
 */
'use strict';

const PAGES = [
  ['mpg',       '/apps/meal-plan-generator/index.html'],
  ['mpg-main',  '/apps/meal-plan-generator/main.html'],
  ['babies',    '/apps/meal-plan-generator/babies.html'],
  ['dpcg',      '/apps/diet-plan-calendar-generator/index.html'],
  ['dpcg-7day', '/apps/diet-plan-calendar-generator/7day-diet-menu.html']
];

const LUM = `((c) => { const m = (c || '').match(/[\\d.]+/g); if (!m) return null;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]); })`;

module.exports = async function run({ newIsolated, B, reporter }) {
  const r = reporter('EXPORTS ARE ALWAYS LIGHT');
  const { ok } = r;

  const ctx = await newIsolated({ signedIn: true });
  const page = await ctx.newPage();

  for (const [name, url] of PAGES) {
    await page.goto(B + url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('gt-theme', 'dark'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    const seen = await page.evaluate((lumSrc) => {
      const lum = eval(lumSrc);
      /* A card the skin repaints in dark, to sample what an exporter would
         actually rasterise. */
      const probe = document.createElement('div');
      probe.className = 'bg-white';
      probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:40px;height:40px';
      document.body.appendChild(probe);

      const sample = () => ({
        theme: document.documentElement.getAttribute('data-theme'),
        card: lum(getComputedStyle(probe).backgroundColor),
        ink: lum(getComputedStyle(document.body).color)
      });

      const before = sample();
      let inside = null;

      /* Assigned the way the lazy loader assigns it, so the accessor that
         wraps it is exercised rather than bypassed. */
      window.html2canvas = function () {
        inside = sample();
        return Promise.resolve({ toDataURL: () => 'data:,' });
      };

      return window.html2canvas(probe).then(() => {
        const after = sample();
        const stored = localStorage.getItem('gt-theme');
        probe.remove();
        return { before, inside, after, stored };
      });
    }, LUM);

    ok(seen.before.theme === 'dark', `${name}: the page is dark before the export`);
    ok(seen.inside && seen.inside.theme === 'light',
      `${name}: the document is light while html2canvas reads it (${seen.inside && seen.inside.theme})`);
    ok(seen.inside && seen.inside.card > 0.8,
      `${name}: and a card is a light surface for the capture (${seen.inside && seen.inside.card.toFixed(2)})`);
    ok(seen.inside && seen.inside.ink < 0.3,
      `${name}: with dark ink on it (${seen.inside && seen.inside.ink.toFixed(2)})`);
    ok(seen.after.theme === 'dark', `${name}: the page is dark again afterwards`);
    ok(seen.stored === 'dark',
      `${name}: and the export did not change the stored choice (${seen.stored})`);
  }

  /* Printing takes the same route, through beforeprint/afterprint. */
  {
    await page.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.setItem('gt-theme', 'dark'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(700);

    const p = await page.evaluate(() => {
      const at = () => document.documentElement.getAttribute('data-theme');
      const before = at();
      window.dispatchEvent(new Event('beforeprint'));
      const during = at();
      window.dispatchEvent(new Event('afterprint'));
      return { before, during, after: at(), stored: localStorage.getItem('gt-theme') };
    });

    ok(p.before === 'dark', 'bmi: the page is dark before printing');
    ok(p.during === 'light', `bmi: printing sees a light page (${p.during})`);
    ok(p.after === 'dark', `bmi: and it is dark again afterwards (${p.after})`);
    ok(p.stored === 'dark', `bmi: printing did not change the stored choice (${p.stored})`);
  }

  await ctx.close();
  return r;
};
