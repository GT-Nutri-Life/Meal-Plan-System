/*
 * Suite 2 — the shared sign-in and the cross-system handoff.
 *
 * The handoff runs in a single browser context on purpose: it is built on
 * same-origin localStorage, so isolating each page would test something no
 * user ever experiences. The sign-in checks ask for fresh contexts, because
 * there isolation is the point.
 */
'use strict';

module.exports = async function run({ browser, context, newIsolated, B, reporter }) {
  const r = reporter('SIGN-IN AND CROSS-SYSTEM HANDOFF');
  const { ok } = r;

  const CREDS = { email: 'gayathrithakshila1997@gmail.com', password: 'correct-horse' };

  /* ---------------- the gate ---------------- */
  {
    const c = await newIsolated({ signedIn: false });
    const p = await c.newPage();
    await p.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(900);

    const veil = p.locator('#gt-auth-root .veil').first();
    ok(await veil.isVisible(), 'the portal is gated when signed out');

    await p.fill('#gt-auth-root input[name=email]', CREDS.email);
    await p.fill('#gt-auth-root input[name=password]', 'wrong');
    await p.click('#gt-auth-root .go');
    await p.waitForTimeout(400);
    ok(/Incorrect email or password/.test(await p.locator('#gt-auth-root .err').textContent()),
       'a wrong password is named as such, not as an outage');
    ok(await veil.isVisible(), 'and the gate holds');

    await p.click('#gt-auth-root .peek');
    ok((await p.getAttribute('#gt-auth-root input[name=password]', 'type')) === 'text',
       'the password can be revealed');
    await p.click('#gt-auth-root .peek');

    await p.fill('#gt-auth-root input[name=password]', CREDS.password);
    await p.click('#gt-auth-root .go');
    await p.waitForTimeout(600);
    ok(!(await veil.isVisible()), 'the right password opens the portal');
    ok(await p.locator('#main .card').first().isVisible(), 'and the catalogue is there');
    await c.close();
  }

  {
    const c = await newIsolated({ signedIn: false });
    const p = await c.newPage();
    await p.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(800);
    await p.fill('#gt-auth-root input[name=email]', 'stranger@example.com');
    await p.fill('#gt-auth-root input[name=password]', 'correct-horse');
    await p.click('#gt-auth-root .go');
    await p.waitForTimeout(700);
    ok(/not authorized/i.test(await p.locator('#gt-auth-root .err').textContent()),
       'an account off the allow-list is refused and signed back out');
    ok(await p.locator('#gt-auth-root .veil').first().isVisible(), 'and stays out');
    await c.close();
  }

  {
    const c = await newIsolated({ signedIn: false });
    const p = await c.newPage();
    await p.goto(B + '/apps/about-dietitian/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    const veil = p.locator('#gt-auth-root .veil');
    ok((await veil.count()) === 0 || !(await veil.first().isVisible()),
       'the public profile page is not gated');
    ok(await p.locator('#gt-switcher-root .fab').isVisible(), 'but still carries the switcher');
    await c.close();
  }

  {
    const c = await newIsolated({ signedIn: false });
    const p = await c.newPage();
    await p.goto(B + '/apps/meal-plan-generator/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    const ours = p.locator('#gt-auth-root .veil');
    ok((await ours.count()) === 0 || !(await ours.first().isVisible()),
       'the shared gate stands down where the app has its own — no double prompt');
    await c.close();
  }

  /* ---------------- BMI -> exchanges -> meal plan ---------------- */

  const bmi = await context.newPage();
  await bmi.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
  await bmi.waitForTimeout(1200);

  // BMI Assessment opens at 170 cm / 68 kg and computes a BMI from those
  // placeholders. None of it may travel downstream as if it were measured.
  await bmi.waitForTimeout(2800);
  ok((await bmi.evaluate(() => window.GTContext.filledCount())) === 0,
     'placeholder values are never captured as clinical data');

  await bmi.evaluate(() => { const d = document.getElementById('moreDetails'); if (d) d.open = true; });
  await bmi.fill('#hSingle', '172');
  await bmi.fill('#wSingle', '82');
  await bmi.fill('#ageVal', '41');
  await bmi.selectOption('#sexVal', 'female');
  await bmi.fill('#waistVal', '88');
  await bmi.waitForTimeout(1300);

  const rec = await bmi.evaluate(() => {
    window.GTContext.capture('bmi-assessment');
    return window.GTContext.get();
  });
  ok(rec.measure.heightCm === 172, `height captured (${rec.measure.heightCm} cm)`);
  ok(rec.measure.weightKg === 82,  `weight captured (${rec.measure.weightKg} kg)`);
  ok(rec.patient.age === 41,       `age captured (${rec.patient.age})`);
  ok(rec.patient.sex === 'female', `sex captured (${rec.patient.sex})`);
  ok(rec.measure.waistCm === 88,   `waist captured (${rec.measure.waistCm} cm)`);
  ok(rec.measure.bmi > 25 && rec.measure.bmi < 30, `BMI captured (${rec.measure.bmi})`);
  ok(rec.energy.bmr > 1000 && rec.energy.bmr < 2200, `BMR captured (${rec.energy.bmr} kcal)`);
  ok(rec.energy.tdee > rec.energy.bmr, `daily energy needs captured (${rec.energy.tdee} > BMR ${rec.energy.bmr})`);
  const tdee = rec.energy.tdee;

  await bmi.locator('#gt-switcher-root .fab').click();
  await bmi.waitForTimeout(400);
  const sw = bmi.locator('#gt-switcher-root');
  ok(await sw.locator('.rec').isVisible(), 'the switcher surfaces the record in hand');
  ok((await sw.locator('.itm.nxt').count()) === 3, 'and offers the three onward systems');
  ok((await sw.locator('.itm.nxt .nm').allTextContents()).some((n) => /Dietary Nutrition/.test(n)),
     '"Continue in" names the exchange calculator');
  await bmi.keyboard.press('Escape');
  await bmi.close();

  // A fresh BMI page must reveal the collapsed disclosure it prefills into,
  // otherwise the values land where nobody can see them.
  {
    const p = await context.newPage();
    await p.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    ok(!(await p.locator('#moreDetails').evaluate((d) => d.open)), 'the age/sex disclosure starts collapsed');
    await p.evaluate(() => window.GTContext.apply('bmi-assessment'));
    await p.waitForTimeout(300);
    ok(await p.locator('#moreDetails').evaluate((d) => d.open), 'prefilling opens the disclosure it wrote into');
    ok(await p.locator('#ageVal').isVisible(), 'so the prefilled age is actually visible');
    await p.close();
  }

  {
    const p = await context.newPage();
    await p.goto(B + '/apps/dietary-nutrition-assessment/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1100);
    ok((await p.inputValue('#energyReq')) === '', 'the exchange calculator starts empty');

    await p.locator('#gt-switcher-root .fab').click();
    await p.waitForTimeout(400);
    ok(await p.locator('#gt-switcher-root .rec').isVisible(), 'the record carried across to the next app');
    await p.locator('#gt-switcher-root .rec-fill').click();
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);

    ok((await p.inputValue('#pAge')) === '41', 'age prefilled');
    ok((await p.inputValue('#pSex')) === 'Female', 'sex prefilled, case mapped to this app\'s vocabulary');
    ok((await p.inputValue('#pHeight')) === '172', 'height prefilled');
    ok((await p.inputValue('#pWeight')) === '82', 'weight prefilled');
    const energy = await p.inputValue('#energyReq');
    ok(Math.abs(Number(energy) - tdee) <= 1,
       `BMI's daily energy needs became the prescription (${energy} kcal)`);
    await p.close();
  }

  {
    const p = await context.newPage();
    await p.goto(B + '/apps/meal-plan-generator/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);
    const filled = await p.evaluate(() => window.GTContext.apply('meal-plan-generator'));
    await p.waitForTimeout(600);
    ok(filled >= 5, `the meal plan generator prefilled ${filled} fields`);
    ok((await p.inputValue('#patientHeight')) === '172', 'height reached the meal plan');
    ok((await p.inputValue('#patientWeight')) === '82', 'weight reached the meal plan');
    ok((await p.inputValue('#patientGender')) === 'Female', 'gender mapped to this app\'s vocabulary');
    ok(Number(await p.inputValue('#calorieTarget')) > 1000,
       `calorie target derived from the energy prescription (${await p.inputValue('#calorieTarget')})`);
    ok(/^\d/.test((await p.locator('#bmiValue').textContent()).trim()),
       `the app recalculated its own BMI from the prefill (${(await p.locator('#bmiValue').textContent()).trim()})`);
    await p.close();
  }

  /* ---------------- the record on the portal, and its mirror ---------------- */
  {
    const p = await context.newPage();
    await p.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1000);
    ok(await p.locator('#recwrap').isVisible(), 'the portal shows the record in hand');
    ok((await p.locator('#recchips .chip').count()) >= 3, 'with its clinical values as chips');

    await p.evaluate(() => window.GTContext.syncToCloud());
    await p.waitForTimeout(400);
    const saved = await p.evaluate(() => window.__GT_DB__['gt_clinical_records']);
    ok(!!(saved && saved.record && saved.record.measure.heightCm === 172),
       'the record is mirrored to gt_clinical_records');
    ok(saved && saved.user_id === 'u-test-0001', 'and the mirrored row is scoped to the signed-in user');

    await p.click('#recclear');
    await p.waitForTimeout(300);
    ok(!(await p.locator('#recwrap').isVisible()), 'clearing the record empties the bar');
    await p.close();
  }

  return r;
};
