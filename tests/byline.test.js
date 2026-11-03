/*
 * Suite 7 — the practitioner's registration travels with her name.
 *
 * Every tool here ends in a handout that goes to a client, and a diet sheet
 * signed by a name alone is not a clinical document: wherever a generated
 * document names her, it has to name her as
 * "Gayathri Dissanayaka | Dietitian & Nutritionist (SLMC Reg No. 148 & 375)".
 *
 * The apps cannot have that typed into their markup, because each holds the
 * name in a field the practitioner can edit and the clinical record can
 * autofill — a locum's name would come out over someone else's registration
 * number. So one helper in assets/gt-export-light.js decides, and both halves
 * of that decision are checked here: her name gains the line, another name is
 * left exactly as entered.
 *
 * The checks read the generated document rather than the screen. The real PDF
 * libraries cannot load here, so each page is driven the way the exporter
 * drives it — the print sheets through beforeprint, the meal plan PDFs
 * through generatePDF() with a stand-in html2canvas that reports the markup
 * it was handed.
 */
'use strict';

const LINE = 'Dietitian & Nutritionist (SLMC Reg No. 148 & 375)';
const HER = 'Gayathri Dissanayaka';
const HERS = HER + ' | ' + LINE;
const LOCUM = 'Dr. N. Rajapaksa';

module.exports = async function run({ newIsolated, B, reporter }) {
  const r = reporter("THE PRACTITIONER'S BYLINE");
  const { ok } = r;

  const ctx = await newIsolated({ signedIn: true });
  const page = await ctx.newPage();

  /* ── the helper itself, on a page that generates documents (the portal
     generates none, so it does not carry the export layer at all) ── */
  await page.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'load' });
  const h = await page.evaluate(() => {
    const XL = window.GTExportLight;
    if (!XL || !XL.byline) return null;
    return {
      plain:     XL.byline('Gayathri Dissanayaka'),
      withRole:  XL.byline('Gayathri Dissanayaka', 'Clinical Dietitian and Nutritionist'),
      spelling:  XL.byline('Gayathri Dissanayake'),
      middle:    XL.byline('Gayathri Thakshila Dissanayaka'),
      other:     XL.byline('Dr. N. Rajapaksa'),
      otherRole: XL.byline('Dr. N. Rajapaksa', 'Consultant'),
      blank:     XL.byline(''),
      twice:     XL.byline('Gayathri Dissanayaka | Dietitian & Nutritionist (SLMC Reg No. 148 & 375)')
    };
  });

  ok(h !== null, 'the shared export layer exposes GTExportLight.byline');
  if (h) {
    ok(h.plain === HERS, `her name gains the registration line (${h.plain})`);
    ok(h.withRole === HERS,
      'the registration supersedes a free-text role rather than stacking on it');
    ok(h.spelling.endsWith(LINE) && h.middle.endsWith(LINE),
      'the name spellings the bundled tools use are all recognised');
    ok(h.other === LOCUM, `another name is left exactly as entered (${h.other})`);
    ok(h.otherRole === LOCUM + ' · Consultant', 'and keeps its own role');
    ok(h.blank === '', 'an empty field stays empty');
    ok(h.twice === HERS, 'a name that already carries the line is not doubled');
  }

  /* ── BMI: the printed report, rebuilt on beforeprint like the real one ── */
  await page.waitForTimeout(400);
  const bmi = await page.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'));
    const t = document.getElementById('printReport').textContent;
    window.dispatchEvent(new Event('afterprint'));
    return t;
  });
  ok(bmi.split(HERS).length - 1 >= 2,
    `bmi: the report names her with the registration in masthead and footer (${bmi.split(HERS).length - 1})`);
  ok(bmi.includes(HER) && bmi.includes(LINE) && !bmi.includes('Clinical Dietitian and Nutritionist'),
    'bmi: and the old free-text role no longer appears in the report');

  /* ── DNA: the print sheet, which is what its PDF rasterises ── */
  await page.goto(B + '/apps/dietary-nutrition-assessment/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);
  for (const [who, expect] of [[HER, HERS], [LOCUM, LOCUM]]) {
    const sheet = await page.evaluate((name) => {
      document.getElementById('pDietitian').value = name;
      window.dispatchEvent(new Event('beforeprint'));
      const t = document.getElementById('printDoc').textContent;
      window.dispatchEvent(new Event('afterprint'));
      return t;
    }, who);
    const hits = sheet.split(expect).length - 1;
    ok(hits >= 3,
      `dna: "${who}" is named in the sheet's meta, particulars and signature (${hits})`);
    if (who === LOCUM) {
      ok(!sheet.includes('SLMC'), 'dna: a locum does not inherit her registration number');
    }
  }

  /* ── the meal plan PDFs, built by the page's own exporter ── */
  for (const [name, url, field] of [
    ['mpg',      '/apps/meal-plan-generator/index.html',  'nutritionistName'],
    ['mpg-main', '/apps/meal-plan-generator/main.html',   'nutritionistName'],
    ['babies',   '/apps/meal-plan-generator/babies.html', 'providerName']
  ]) {
    await page.goto(B + url, { waitUntil: 'load' });
    await page.waitForTimeout(400);

    for (const [who, expect] of [[HER, HERS], [LOCUM, LOCUM]]) {
      const got = await page.evaluate(async (a) => {
        const seen = [];
        window.Swal = { fire: () => Promise.resolve({ isConfirmed: true }),
          update: () => {}, close: () => {}, showLoading: () => {} };
        /* Assigned the way the lazy loader assigns it, so the light-lock
           accessor wraps it rather than being bypassed. */
        window.html2canvas = (el) => {
          seen.push(el.innerText || el.textContent);
          return Promise.resolve({ width: 794, height: 1123, toDataURL: () => 'data:,' });
        };
        window.jspdf = { jsPDF: function () { return {
          internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
          addImage() {}, addPage() {}, save() {}, setProperties() {}
        }; } };

        const el = document.getElementById(a.field);
        if (!el) return null;
        el.removeAttribute('readonly');
        el.value = a.who;

        /* generatePDF kicks the build off without awaiting it. */
        window.generatePDF();
        for (let i = 0; i < 160 && !seen.length; i++) {
          await new Promise((res) => setTimeout(res, 50));
        }
        return seen[0] || null;
      }, { field, who });

      ok(got !== null, `${name}: the pdf exporter produced a page for "${who}"`);
      if (got === null) continue;

      ok(got.includes(expect),
        `${name}: the pdf header names "${who}" as "${expect}"`);
      if (who === HER) {
        /* The Credentials field says "Dietitian & Nutritionist" too, and the
           byline already carries those words — the header must not say them
           twice. */
        const head = got.split('\n').slice(0, 4).join('\n');
        ok(head.split('Dietitian & Nutritionist').length - 1 === 1,
          `${name}: and says the role once, not once per field`);
      } else {
        ok(!got.includes('SLMC'),
          `${name}: a locum does not inherit her registration number`);
      }
    }
  }

  await ctx.close();
  return r;
};
