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
const HER_NAME = HER;
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
      'a middle name or a -ke spelling in a saved record is still recognised');
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

  /* The watermark and the on-page credit are written by applyCredits(), which
     runs while the page is parsed — before the deferred export layer is on
     window. They are re-applied once it is, and that is what this pins. */
  const marks = await page.evaluate(() => ({
    wmName: document.getElementById('wmName').textContent,
    wmRole: document.getElementById('wmRole').textContent,
    creditRole: document.getElementById('creditRole').textContent
  }));
  ok(marks.wmName === HER_NAME, `bmi: the print watermark still names her (${marks.wmName})`);
  ok(marks.wmRole === LINE,
    `bmi: and carries the registration, not the old role (${marks.wmRole})`);
  ok(marks.creditRole === LINE,
    `bmi: the on-page credit block says the same (${marks.creditRole})`);

  /* It has to stay on one line across an A4 sheet: it is rotated and nowrap,
     so a longer line would print off the edge of the page rather than wrap.
     Everything that sizes it lives in @media print, so this needs a page the
     size of the sheet with print media emulated — under the screen rules the
     element is unrotated and unsized and the measurement means nothing. */
  {
    const A4 = { width: 794, height: 1123 };          // A4 portrait at 96dpi
    const sheet = await newIsolated({ signedIn: true });
    const sp = await sheet.newPage();
    await sp.setViewportSize(A4);
    const cdp = await sheet.newCDPSession(sp);
    await sp.goto(B + '/apps/bmi-assessment/index.html', { waitUntil: 'load' });
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    await sp.waitForTimeout(300);
    const wm = await sp.evaluate(() => {
      const w = document.querySelector('.rpt-watermark');
      const b = w.getBoundingClientRect();
      return { left: b.left, right: b.right, shown: getComputedStyle(w).display };
    });
    await sheet.close();
    ok(wm.shown === 'block', `bmi: the watermark prints at all (${wm.shown})`);
    ok(wm.left > 0 && wm.right < A4.width,
      `bmi: and fits across the sheet (${Math.round(wm.left)}-${Math.round(wm.right)} of ${A4.width})`);
  }

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
      /* The sheet's own footer credits her as the author of the tool, so her
         registration is legitimately on the page; what must not happen is the
         locum's name carrying it. */
      ok(!sheet.includes(LOCUM + ' | '),
        'dna: a locum is not given her registration number');
      ok(sheet.includes(HERS),
        'dna: and the footer still credits the tool to her, in full');
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

  /* ── the footers that credit her in the page's own markup ──
     These are static text, not the helper's output, so what is checked is
     that they have not drifted from it. */
  {
    const line = await page.evaluate(() =>
      window.GTExportLight.credentials('Gayathri Dissanayaka'));

    const FOOTERS = [
      ['portal',    '/index.html'],
      ['about',     '/apps/about-dietitian/index.html'],
      ['dna',       '/apps/dietary-nutrition-assessment/index.html'],
      ['mpg',       '/apps/meal-plan-generator/index.html'],
      ['mpg-main',  '/apps/meal-plan-generator/main.html'],
      ['dpg',       '/apps/diet-plan-generator/index.html'],
      ['dpg-7day',  '/apps/diet-plan-generator/7-day-menu.html']
    ];
    for (const [name, url] of FOOTERS) {
      const html = await page.evaluate(
        (u) => fetch(u).then((res) => res.text()), B + url);
      const want = line.replace(/&/g, '&amp;');
      ok(html.includes(want),
        `${name}: the page footer credits her with the same registration line`);
      ok(!/Gayathri[^<|]*(Dietitian &amp; Nutritionist)(?!\s*\(SLMC)/.test(html),
        `${name}: and no bare "Dietitian & Nutritionist" credit is left behind it`);
    }
  }

  /* One spelling ships. The helper still matches the other, because a record
     saved before this could carry it, but no page writes it any more. */
  {
    const PAGES = ['/index.html', '/apps/about-dietitian/index.html',
      '/apps/bmi-assessment/index.html', '/apps/dietary-nutrition-assessment/index.html',
      '/apps/diet-plan-generator/index.html', '/apps/diet-plan-generator/7-day-menu.html',
      '/apps/meal-plan-generator/index.html', '/apps/meal-plan-generator/main.html',
      '/apps/meal-plan-generator/babies.html'];
    const wrong = [];
    for (const u of PAGES) {
      const html = await page.evaluate((x) => fetch(x).then((res) => res.text()), B + u);
      if (html.includes('Dissanayake')) wrong.push(u);
    }
    ok(wrong.length === 0, `every page spells her surname the one way (${wrong.join(', ') || 'all agree'})`);
  }

  await ctx.close();
  return r;
};
