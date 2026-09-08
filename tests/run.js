#!/usr/bin/env node
/*
 * Runs the browser suites against a throwaway copy of the portal.
 *
 *   node tests/run.js              both suites
 *   node tests/run.js portal       just the portal/switcher suite
 *   node tests/run.js handoff      just the sign-in/handoff suite
 *
 * Exits non-zero if any check fails, so CI can gate a deploy on it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { serve, chromiumOptions, reporter } = require('./harness');

const PORT_APP = Number(process.env.GT_TEST_PORT || 8975);
const PORT_CTL = PORT_APP + 1;
const B = `http://127.0.0.1:${PORT_APP}`;
const C = `http://127.0.0.1:${PORT_CTL}`;

const STUB = fs.readFileSync(path.join(__dirname, 'stub-supabase.js'), 'utf8');

(async () => {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (e) {
    console.error('Playwright is not installed. Run:  npm install  (then npx playwright install chromium)');
    process.exit(2);
  }

  const which = (process.argv[2] || 'all').toLowerCase();
  const servers = [await serve({ port: PORT_APP, strip: false }),
                   await serve({ port: PORT_CTL, strip: true })];
  const browser = await chromium.launch(chromiumOptions());

  /** A context primed with the Supabase stub and a starting session state. */
  async function newIsolated({ signedIn = true } = {}) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript(`window.__SIGNED_IN__ = ${signedIn};`);
    await c.addInitScript(STUB);
    return c;
  }

  // The shared context: signed in, storage persisted across pages, which is
  // what the cross-system handoff actually relies on.
  const context = await newIsolated({ signedIn: true });

  let pass = 0, fail = 0;
  try {
    const suites = [];
    if (which === 'all' || which === 'portal')  suites.push(require('./portal.test'));
    if (which === 'all' || which === 'handoff') suites.push(require('./handoff.test'));
    if (!suites.length) { console.error(`Unknown suite "${which}". Use: portal | handoff | all`); process.exit(2); }

    for (const suite of suites) {
      const r = await suite({ browser, context, newIsolated, B, C, reporter });
      pass += r.pass; fail += r.fail;
    }
  } finally {
    await browser.close();
    servers.forEach((s) => s.close());
  }

  console.log(`\n================ ${pass} passed, ${fail} failed ================`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('\nTest run crashed:\n', e);
  process.exit(1);
});
