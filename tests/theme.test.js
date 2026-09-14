/*
 * Suite 4 — one theme, across eleven separate documents.
 *
 * The portal is not a single-page app: every subsystem is its own HTML file,
 * so "the theme" only exists if each document independently arrives at the
 * same answer. It did not. There were three mechanisms and three storage keys
 *
 *   the portal            html[data-theme]   under 'gt-theme'
 *   About the Dietitian   html[data-theme]   under 'pt'
 *   both calendar tools   body.dark-mode     under 'darkMode'
 *
 * and eight pages with no theme code at all, which could only follow the OS.
 * Choosing dark on the portal and opening BMI Assessment put you back in
 * daylight, because nothing on that page could make it dark.
 */
'use strict';

const BUNDLED = [
  ['portal',      '/index.html'],
  ['bmi',         '/apps/bmi-assessment/index.html'],
  ['dna',         '/apps/dietary-nutrition-assessment/index.html'],
  ['mpg',         '/apps/meal-plan-generator/index.html'],
  ['icu',         '/apps/meal-plan-generator/icu.html'],
  ['babies',      '/apps/meal-plan-generator/babies.html'],
  ['dpg',         '/apps/diet-plan-generator/index.html'],
  ['dpg-7day',    '/apps/diet-plan-generator/7-day-menu.html'],
  ['dpcg',        '/apps/diet-plan-calendar-generator/index.html'],
  ['dpcg-7day',   '/apps/diet-plan-calendar-generator/7day-diet-menu.html'],
  ['about',       '/apps/about-dietitian/index.html']
];

/** Relative luminance of a computed colour, 0 (black) to 1 (white). */
const LUM = `(c => { const m = (c||'').match(/\\d+/g); if (!m) return null;
  return (0.2126*+m[0] + 0.7152*+m[1] + 0.0722*+m[2]) / 255; })`;

module.exports = async function run({ context, B, reporter }) {
  const r = reporter('THEME ACROSS SUBSYSTEMS');
  const { ok } = r;

  const p = await context.newPage();

  /* Choose dark once, on the portal, the way a practitioner would. */
  await p.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(900);
  ok(await p.evaluate(() => !!window.GTTheme), 'the portal loads the shared theme controller');
  await p.evaluate(() => window.GTTheme.set('dark'));
  await p.waitForTimeout(200);

  const keys = await p.evaluate(() => ({
    shared: localStorage.getItem('gt-theme'),
    doc:    localStorage.getItem('pt'),
    bool:   localStorage.getItem('darkMode')
  }));
  ok(keys.shared === 'dark', `the shared key records the choice (${keys.shared})`);
  ok(keys.doc === 'dark', 'and the key About the Dietitian reads');
  ok(keys.bool === 'true', 'and the one both calendar tools read');

  /* Every subsystem must open in that theme, not just the ones that had a
     toggle of their own. */
  for (const [name, url] of BUNDLED) {
    await p.goto(B + url, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const got = await p.evaluate((lum) => {
      const f = eval(lum);
      return { attr: document.documentElement.getAttribute('data-theme'),
               bodyLum: f(getComputedStyle(document.body).backgroundColor) };
    }, LUM);
    ok(got.attr === 'dark' && got.bodyLum !== null && got.bodyLum < 0.35,
       `${name} opens dark (ground ${got.bodyLum === null ? '?' : got.bodyLum.toFixed(2)})`);
  }

  /* BMI Assessment is the page the report named, and the one that had no
     theme code whatsoever. Its ink must be light on that dark ground. */
  {
    await p.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    const got = await p.evaluate((lum) => {
      const f = eval(lum);
      const h = document.querySelector('h1, h2');
      return { ink: h ? f(getComputedStyle(h).color) : null,
               ground: f(getComputedStyle(document.body).backgroundColor) };
    }, LUM);
    ok(got.ink !== null && got.ground !== null && got.ink > got.ground + 0.3,
       `BMI Assessment reads light-on-dark (ink ${got.ink && got.ink.toFixed(2)} over ${got.ground && got.ground.toFixed(2)})`);
  }

  /* A page's own toggle still works, and the rest of the portal follows it. */
  {
    await p.goto(B + '/apps/diet-plan-calendar-generator/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    await p.evaluate(() => {
      // what that page's own dark-mode button does
      document.body.classList.remove('dark-mode');
      document.body.classList.remove('dark');
    });
    await p.waitForTimeout(300);
    const after = await p.evaluate(() => localStorage.getItem('gt-theme'));
    ok(after === 'light', `the calendar tool's own toggle updates the shared key (${after})`);

    await p.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);
    const back = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(back === 'light', 'and the next subsystem opens in the theme it chose');
  }

  /* The shared header carries a control on pages that never had one. */
  {
    await p.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    const has = await p.evaluate(() =>
      !!document.querySelector('.gt-chrome-header').shadowRoot.querySelector('.theme'));
    ok(has, 'a page with no toggle of its own gets one from the shared header');

    await p.evaluate(() =>
      document.querySelector('.gt-chrome-header').shadowRoot.querySelector('.theme').click());
    await p.waitForTimeout(300);
    const now = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    ok(now === 'dark', `and it switches the page (${now})`);
  }

  /*
   * The client chip mounts two ways: inside the shared header on a bundled
   * page, and on its own in the portal's masthead, which has a header
   * already. Only the first renders a .bar, and .bar was the one rule putting
   * a colour back after `all:initial` reset it — so on the portal the saved
   * profile name inherited the initial colour, black, which on the dark chip
   * measured 1.48:1. Both mounts, both themes, or it is not fixed.
   */
  {
    const CONTRAST = `((a, b) => {
      const lin = (c) => { const m = (c||'').match(/[\\d.]+/g);
        if (!m) return null;
        const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
        return 0.2126*f(+m[0]) + 0.7152*f(+m[1]) + 0.0722*f(+m[2]); };
      const [x, y] = [lin(a), lin(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    })`;

    const seen = {};
    for (const theme of ['light', 'dark']) {
      for (const [where, url] of [['portal', '/index.html'],
                                  ['bmi', '/apps/bmi-assessment/index.html']]) {
        await p.goto(B + url, { waitUntil: 'domcontentloaded' });
        await p.evaluate(([t, c]) => {
          localStorage.setItem('gt-theme', t);
          localStorage.setItem('gt-open-client', JSON.stringify(c));
        }, [theme, { id: 'c-theme-probe', name: 'Ashen' }]);
        await p.reload({ waitUntil: 'load' });
        await p.waitForTimeout(900);

        const got = await p.evaluate((contrastSrc) => {
          const contrast = eval(contrastSrc);
          const host = document.querySelector('.gt-chrome-client') ||
                       document.querySelector('.gt-chrome-header');
          if (!host || !host.shadowRoot) return null;
          const el = host.shadowRoot.querySelector('.who b');
          if (!el) return null;
          let n = el, bg = null;
          while (n) {
            const b = getComputedStyle(n).backgroundColor;
            if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bg = b; break; }
            n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
          }
          return { ratio: contrast(getComputedStyle(el).color, bg),
                   color: getComputedStyle(el).color };
        }, CONTRAST);

        ok(got && got.ratio >= 4.5,
          `${where} in ${theme}: the saved profile name reads on its chip ` +
          `(${got ? got.ratio.toFixed(2) : '?'}:1)`);
        seen[theme + '/' + where] = got && got.color;
      }

      /* Contrast alone would not have caught this in light, where the initial
         colour is black on a pale chip — a high ratio, and still the wrong
         colour. The two mounts have to agree. */
      ok(seen[theme + '/portal'] && seen[theme + '/portal'] === seen[theme + '/bmi'],
        `and it is the theme's ink either way in ${theme} ` +
        `(${seen[theme + '/portal']} vs ${seen[theme + '/bmi']})`);
    }
    await p.evaluate(() => localStorage.removeItem('gt-open-client'));
  }

  await p.close();
  return r;
};
