/*
 * Suite 1 — the portal and the switcher.
 *
 * Two guarantees this suite exists to defend:
 *   1. the catalogue and switcher behave, and every link resolves
 *   2. bundling a subsystem changes nothing about it — same layout width,
 *      and no JavaScript error the untouched upstream file does not already
 *      produce (several apps load CDNs that may be blocked or offline)
 */
'use strict';

const PAGES = [
  ['about-dietitian',              'apps/about-dietitian/index.html'],
  ['bmi-assessment',               'apps/bmi-assessment/index.html'],
  ['dietary-nutrition-assessment', 'apps/dietary-nutrition-assessment/index.html'],
  ['meal-plan-generator',          'apps/meal-plan-generator/index.html'],
  ['mpg-word',                     'apps/meal-plan-generator/main.html'],
  ['babies',                       'apps/meal-plan-generator/babies.html'],
  ['icu',                          'apps/meal-plan-generator/icu.html'],
  ['diet-plan-generator',          'apps/diet-plan-generator/index.html'],
  ['dpg-7day',                     'apps/diet-plan-generator/7-day-menu.html'],
  ['dpcg',                         'apps/diet-plan-calendar-generator/index.html'],
  ['dpcg-7day',                    'apps/diet-plan-calendar-generator/7day-diet-menu.html'],
  ['feeding-schedule',             'apps/feeding-schedule-builder/index.html']
];

const firstLine = (e) => String(e).split('\n')[0].trim();

/* These were written out as literals — "all 11 tools", "all 6 source
   repositories" — so bundling a twelfth subsystem failed fifteen checks that
   were not actually wrong about anything. Read the expected shape from the
   registry the portal itself renders from, and the suite keeps testing that
   the page agrees with the registry rather than with a number typed in 2026. */
const REG = (() => {
  const path = require('path');
  const prev = global.window;
  global.window = {};
  delete require.cache[require.resolve(path.join(__dirname, '..', 'assets', 'registry.js'))];
  require(path.join(__dirname, '..', 'assets', 'registry.js'));
  const reg = global.window.GTRegistry;
  global.window = prev;
  return reg;
})();

const N_TOOLS = REG.tools.length;
const N_SOURCES = Object.keys(REG.sources).length;
const N_EDGES = REG.flow.length;
const N_STAGES = REG.categories.length;

module.exports = async function run({ context, B, C, reporter }) {
  const r = reporter('PORTAL AND SWITCHER');
  const { ok } = r;

  /* ---------------- the portal ---------------- */
  {
    const page = await context.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(firstLine(e.message)));
    await page.goto(B + '/index.html', { waitUntil: 'networkidle' });

    ok(errs.length === 0, `portal loads without JavaScript errors${errs.length ? ' -> ' + errs[0] : ''}`);
    ok((await page.locator('#main .card').count()) === N_TOOLS, `all ${N_TOOLS} tools are catalogued`);
    ok((await page.locator('#main .grp').count()) === N_STAGES, `grouped into ${N_STAGES} workflow stages`);
    ok((await page.locator('.flag').count()) === 1, 'the flagship is marked once');
    ok((await page.locator('#srcs li').count()) === N_SOURCES, `all ${N_SOURCES} source repositories are credited`);
    ok((await page.locator('#rail li').count()) === N_STAGES, 'the clinical journey rail renders');
    ok((await page.locator('.edge').count()) === N_EDGES, `all ${N_EDGES} cross-system connections are documented`);

    await page.fill('#q', 'diabetes'); await page.waitForTimeout(120);
    ok((await page.locator('#main .card').count()) === 1, 'search "diabetes" narrows to the exchange calculator');
    await page.fill('#q', 'infant'); await page.waitForTimeout(120);
    ok(/Baby/.test(await page.locator('.cname').first().textContent()), 'search "infant" finds the paediatric planner');
    await page.fill('#q', 'ics'); await page.waitForTimeout(120);
    ok(/Calendar/.test(await page.locator('.cname').first().textContent()), 'search "ics" finds the calendar generator');
    await page.fill('#q', 'zzzz'); await page.waitForTimeout(120);
    ok((await page.locator('.none').count()) === 1, 'an unmatched search explains itself');
    await page.fill('#q', ''); await page.waitForTimeout(120);
    ok((await page.locator('#main .card').count()) === N_TOOLS, 'clearing the search restores everything');

    await page.click('h1');
    await page.keyboard.press('Control+k');
    ok((await page.evaluate(() => document.activeElement.id)) === 'q', 'Ctrl+K jumps to search');

    const before = await page.getAttribute('html', 'data-theme');
    await page.click('#theme');
    const after = await page.getAttribute('html', 'data-theme');
    ok(before !== after, `theme toggles (${before} -> ${after})`);
    await page.reload({ waitUntil: 'networkidle' });
    ok((await page.getAttribute('html', 'data-theme')) === after, 'the theme choice survives a reload');
    await page.click('#theme');

    const hrefs = await page.locator('.cname a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    let dead = 0;
    for (const h of hrefs) {
      const res = await page.request.get(B + '/' + h);
      if (!res.ok()) { dead++; r.note(`dead link ${h} -> ${res.status()}`); }
    }
    ok(dead === 0, `all ${hrefs.length} catalogue links resolve`);

    await page.locator('#main .card').first().click();
    await page.waitForLoadState('domcontentloaded');
    ok(page.url().includes('/apps/'), 'a card opens its subsystem');
    await page.close();
  }

  /* -------- the switcher, in every bundled app, against the original -------- */
  for (const [name, rel] of PAGES) {
    // The control is the same file with the injected tag stripped.
    const control = await context.newPage();
    const cErrs = [];
    control.on('pageerror', (e) => cErrs.push(firstLine(e.message)));
    await control.goto(C + '/' + rel, { waitUntil: 'domcontentloaded' });
    await control.waitForTimeout(800);
    const cWidth = await control.evaluate(() => Math.round(document.body.getBoundingClientRect().width));
    await control.close();

    const page = await context.newPage();
    const pErrs = [];
    page.on('pageerror', (e) => pErrs.push(firstLine(e.message)));
    // A record left by another suite would add "Continue in" rows.
    await page.addInitScript(() => { try { localStorage.removeItem('gt-clinical-record'); } catch (e) {} });
    await page.goto(B + '/' + rel, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    if (!ok((await page.locator('#gt-switcher-root').count()) === 1, `${name}: switcher mounted`)) {
      await page.close();
      continue;
    }

    const sw = page.locator('#gt-switcher-root');
    const fab = sw.locator('.fab');
    const panel = sw.locator('.panel');

    ok(await fab.isVisible(), `${name}: launcher visible`);
    ok(!(await panel.isVisible()), `${name}: panel starts closed`);

    await fab.click();
    await page.waitForTimeout(300);
    ok(await panel.isVisible(), `${name}: clicking the launcher opens it`);
    ok((await fab.getAttribute('aria-expanded')) === 'true', `${name}: aria-expanded tracks the panel`);
    ok((await sw.locator('.itm:not(.nxt)').count()) === N_TOOLS, `${name}: every subsystem is reachable`);
    ok((await sw.locator('.itm.here').count()) === 1, `${name}: the current tool is marked once`);

    await sw.locator('input').fill('icu');
    await page.waitForTimeout(150);
    ok((await sw.locator('.itm:not(.nxt)').count()) === 1, `${name}: panel search filters`);
    await sw.locator('input').fill('');
    await page.waitForTimeout(150);

    await page.keyboard.press('ArrowDown');
    ok((await sw.locator('.itm.kb').count()) === 1, `${name}: arrow keys move through the list`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(280);
    ok(!(await panel.isVisible()), `${name}: Escape closes it`);
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(280);
    ok(await panel.isVisible(), `${name}: Ctrl+K opens it`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(220);

    const pWidth = await page.evaluate(() => Math.round(document.body.getBoundingClientRect().width));
    ok(pWidth === cWidth, `${name}: layout untouched by bundling (${cWidth}px)`);

    const introduced = pErrs.filter((e) => !cErrs.includes(e));
    ok(introduced.length === 0,
      `${name}: introduces no error the original lacks` +
      (introduced.length ? ` -> ${introduced[0]}` : (cErrs.length ? `  [pre-existing upstream: ${cErrs[0]}]` : '')));

    await page.close();
  }

  return r;
};
