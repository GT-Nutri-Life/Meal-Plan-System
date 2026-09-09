/*
 * Suite 3 — every subsystem fills itself from one client record.
 *
 * The other suites follow one clinical journey end to end. This one asks a
 * blunter question of every tool at once: given a complete record, does this
 * page actually fill in, and does what lands match what was in the record?
 *
 * It exists because the failure it catches is silent. An adapter addresses a
 * field by id or by name; if the page renamed it, or the adapter was written
 * against a sibling page that spells it differently, nothing throws — the
 * prefill just quietly does nothing. That is exactly what had happened to the
 * 7-Day Diet Menu Planner, whose client field carries a name rather than an
 * id: both its selectors matched nothing, for the life of the feature, with
 * every suite green.
 */
'use strict';

/** A full, internally consistent client. Values are distinctive on purpose,
 *  so a field that fills from somewhere else is visible as the wrong number. */
const RECORD = {
  patient: {
    name: 'Sunil Bandara', age: 47, sex: 'male', dob: '1979-03-14',
    phone: '+94 71 234 5678', email: 'sunil.bandara@example.com',
    address: '14 Temple Road, Kandy', id: 'PT-2026-118', ward: 'Medical Ward 3',
    occupation: 'Teacher', country: 'Sri Lanka'
  },
  measure: {
    heightCm: 174, weightKg: 88, waistCm: 102, hipCm: 108,
    targetWeightKg: 78, bodyFatPct: 31, bmi: 29.1, bmiCategory: 'Overweight'
  },
  energy: { bmr: 1780, tdee: 2450, activity: 'Moderate', target: 2100 },
  macros: { choPct: 50, proPct: 20, fatPct: 30 },
  clinical: {
    conditions: 'Type 2 diabetes', diagnosis: 'T2DM with dyslipidaemia',
    allergies: 'Prawns', medications: 'Metformin 500mg BD', supplements: 'Vitamin D'
  },
  plan: {
    calorieTarget: 2100, startDate: '2026-10-05', goal: 'weight-loss',
    durationWeeks: 12, proteinG: 105, carbsG: 262, fatG: 70,
    waterIntake: '2.5 L/day', exercise: 'Brisk walk 30 min',
    foodsToAvoid: 'Fried foods, sugary drinks', notes: 'Prefers rice at lunch.'
  },
  meals: {
    bedTeaTime: '06:00', breakfastTime: '07:30', midMorningTime: '10:00',
    lunchTime: '12:45', eveningSnackTime: '16:00', dinnerTime: '19:30'
  },
  dietitian: {
    name: 'Gayathri Dissanayaka', credentials: 'BSc (Hons) Nutrition',
    phone: '+94 77 000 0000', email: 'gt@example.com'
  },
  meta: { updatedAt: new Date().toISOString(), sources: {} }
};

/* Each bundled tool, and the least it must carry.
 *
 * The measure is a round trip: put the record in, let the page fill itself,
 * then read the page back through the same adapter and count the canonical
 * fields that survive. Counting what a call to apply() *writes* looks simpler
 * and is wrong — the page has already prefilled itself by then, so a correct
 * adapter reports nearly zero because there was nothing left to change.
 *
 * The floors sit below what the adapters manage today: this guards against a
 * field going dead, not against anyone improving the mapping. */
const EXPECT = [
  ['bmi-assessment',               '/apps/bmi-assessment/index.html',                        4],
  ['dietary-nutrition-assessment', '/apps/dietary-nutrition-assessment/index.html',          8],
  ['meal-plan-generator',          '/apps/meal-plan-generator/index.html',                  18],
  ['meal-plan-generator-docx',     '/apps/meal-plan-generator/main.html',                   18],
  ['diet-plan-generator',          '/apps/diet-plan-generator/index.html',                  18],
  ['diet-plan-calendar-generator', '/apps/diet-plan-calendar-generator/index.html',         10],
  ['dpg-7-day-menu',               '/apps/diet-plan-generator/7-day-menu.html',              8],
  ['dpcg-7-day-menu',              '/apps/diet-plan-calendar-generator/7day-diet-menu.html', 3],
  ['icu',                          '/apps/meal-plan-generator/icu.html',                     5]
];

module.exports = async function run({ context, B, reporter }) {
  const r = reporter('CROSS-SYSTEM PREFILL');
  const { ok } = r;

  /** Count the leaf values in a partial record. */
  const leaves = (o, pre) => Object.entries(o || {}).reduce((n, [k, v]) =>
    n + (v && typeof v === 'object' ? leaves(v) : (v === null || v === '' ? 0 : 1)), 0);

  for (const [id, url, floor] of EXPECT) {
    const p = await context.newPage();
    await p.goto(B + url, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1400);

    const got = await p.evaluate((args) => {
      localStorage.setItem('gt-clinical-record', JSON.stringify(args.rec));
      localStorage.removeItem('gt-open-client');
      // The module caches the record and drops that cache when another tab
      // writes it. Firing the same event is how a test tells it to re-read,
      // and it exercises the real listener rather than a hook added for us.
      window.dispatchEvent(new StorageEvent('storage', { key: 'gt-clinical-record' }));
      window.GTContext.apply(args.id);
      // Read the page back out through the same adapter.
      return window.GTContext.adapters[args.id].read();
    }, { rec: RECORD, id });

    const n = leaves(got);
    ok(n >= floor, `${id}: ${n} field${n === 1 ? '' : 's'} survive the round trip (floor ${floor})`);
    await p.close();
  }

  /* The scenario the practice actually runs: a plan built in the Diet Plan
     Generator, then scheduled and turned into a weekly menu. The values must
     survive the trip, not merely arrive. */
  {
    const p = await context.newPage();
    await p.goto(B + '/apps/diet-plan-generator/7-day-menu.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);
    await p.evaluate((rec) => {
      localStorage.setItem('gt-clinical-record', JSON.stringify(rec));
      window.dispatchEvent(new StorageEvent('storage', { key: 'gt-clinical-record' }));
      window.GTContext.apply('dpg-7-day-menu');
    }, RECORD);
    await p.waitForTimeout(300);

    const got = await p.evaluate(() => {
      const f = k => { const el = document.getElementById(k) || document.querySelector('[name="' + k + '"]'); return el ? el.value : null; };
      return { name: f('clientName'), start: f('startDate'), notes: f('specialNotes'),
               breakfast: f('mealTime-breakfast'), dinner: f('mealTime-dinner') };
    });
    ok(got.name === 'Sunil Bandara', `the weekly planner takes the client name (${got.name})`);
    ok(got.start === '2026-10-05', `and the plan start date (${got.start})`);
    ok(got.breakfast === '07:30', `and breakfast time (${got.breakfast})`);
    ok(got.dinner === '19:30', `and dinner time (${got.dinner})`);
    ok(/rice at lunch/.test(got.notes || ''), 'and the plan notes');
    await p.close();
  }

  /* Macro targets are grams on the calendar generator and percentages in the
     exchange calculator. A 50/20/30 split at 2100 kcal is 262/105/70 g, and
     for a while it arrived as 50/20/30 g. */
  {
    const p = await context.newPage();
    await p.goto(B + '/apps/diet-plan-calendar-generator/index.html', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1300);
    const noGrams = JSON.parse(JSON.stringify(RECORD));
    delete noGrams.plan.proteinG; delete noGrams.plan.carbsG; delete noGrams.plan.fatG;

    const got = await p.evaluate((rec) => {
      localStorage.setItem('gt-clinical-record', JSON.stringify(rec));
      window.dispatchEvent(new StorageEvent('storage', { key: 'gt-clinical-record' }));
      window.GTContext.apply('diet-plan-calendar-generator');
      const v = id => document.getElementById(id).value;
      return { pro: v('targetProtein'), cho: v('targetCarbs'), fat: v('targetFats'), goal: v('goal') };
    }, noGrams);

    // 2100 × 0.50 ÷ 4 = 262.5, which rounds to 263.
    ok(Number(got.cho) === 263, `carbohydrate grams derived from the split, not copied (${got.cho} g)`);
    ok(Number(got.pro) === 105, `protein grams derived (${got.pro} g)`);
    ok(Number(got.fat) === 70,  `fat grams derived at 9 kcal/g (${got.fat} g)`);
    ok(got.goal === 'weight-loss', `and the plan goal carried (${got.goal})`);
    await p.close();
  }

  return r;
};
