/*
 * Suite 8 — the Feeding Schedule Builder.
 *
 * Three things about this page are not like the rest of the bundle, and each
 * is a way it could break quietly:
 *
 *   - Its whole interface is Alpine. Every field is x-model and every panel
 *     x-show, so if Alpine does not run the page is not degraded, it is
 *     inert: boxes that cannot be typed into and a preview that never draws.
 *     That is why Alpine is served from this repository rather than a CDN,
 *     and why the first thing checked here is that the page came alive.
 *
 *   - Its document faces are half a megabyte, split out of the page and
 *     fetched on demand. The page has to work before they arrive and has to
 *     have them in hand before it builds a PDF.
 *
 *   - The preview is a picture of the printed page, so it keeps paper's
 *     colours while the editor around it follows the theme.
 */
'use strict';

const URL = '/apps/feeding-schedule-builder/index.html';

const lum = (c) => {
  const m = (c || '').match(/[\d.]+/g);
  if (!m) return null;
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]);
};

module.exports = async function run({ newIsolated, B, reporter }) {
  const r = reporter('FEEDING SCHEDULE BUILDER');
  const { ok } = r;

  const ctx = await newIsolated({ signedIn: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).split('\n')[0]));

  await page.goto(B + URL, { waitUntil: 'load' });
  const alive = await page.waitForFunction(() => !!window.Alpine, null, { timeout: 10000 })
    .then(() => true).catch(() => false);
  await page.waitForTimeout(700);

  ok(alive, 'Alpine runs from this repository, so the page is never an inert form');
  ok(errs.length === 0, `the page loads without JavaScript errors${errs.length ? ' -> ' + errs[0] : ''}`);

  /* ---- it actually renders a schedule ---- */
  const doc = await page.evaluate(() => {
    const el = document.querySelector('.gt-paper');
    return { text: el ? el.textContent.replace(/\s+/g, ' ').trim() : null,
             rows: document.querySelectorAll('.gt-paper tbody tr').length };
  });
  ok(doc.text && doc.text.length > 200, 'the preview draws a document, not an empty shell');
  ok(doc.rows >= 9, `every feed in the schedule reaches the table (${doc.rows} rows)`);
  ok(/Name of the Patient/i.test(doc.text), 'with the patient block the ward reads first');

  /* The prescriber belongs at the top of the chart as well as over the
     signature: a ward reading it off a clipboard should not have to reach
     the foot of the page to find out whose chart it is. */
  const LINE = 'Gayathri Dissanayaka | Dietitian & Nutritionist (SLMC Reg No. 148 & 375)';
  const head = doc.text.slice(0, doc.text.indexOf('Time'));
  ok(head.includes('Dietitian: ' + LINE),
    'the chart names the dietitian in its header, above the table');
  ok(doc.text.includes('By ' + LINE),
    'and signs it with the same line at the foot');

  /* The app itself credits her too, as every other tool in the portal does. */
  const pageFoot = await page.evaluate(() => {
    const f = document.querySelector('body > footer');
    return f ? f.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  ok(pageFoot.includes(LINE), `the page has a footer crediting her (${pageFoot.slice(0, 60)})`);

  /* ---- typing reaches the document ---- */
  const typed = await page.evaluate(async () => {
    const el = document.getElementById('pt-name');
    el.value = 'K. Wijeratne';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 350));
    return document.querySelector('.gt-paper').textContent;
  });
  ok(typed.includes('K. Wijeratne'), 'what is typed in the form appears in the document');

  /* ---- the faces are not in the page, and arrive when asked for ---- */
  const fonts = await page.evaluate(async (u) => ({
    api: typeof window.GTDocFonts === 'object',
    /* The *delivered* document, not the live DOM: by now the idle warm-up has
       very likely fetched the faces and installed them, which would make
       outerHTML look exactly as heavy as the thing this is checking against. */
    servedBytes: (await (await fetch(u)).text()).length
  }), B + URL);
  ok(fonts.api, 'the page exposes an on-demand loader for the document faces');
  ok(fonts.servedBytes < 150000,
    `the half-megabyte of base64 faces is no longer in the page (served ${Math.round(fonts.servedBytes / 1024)} KB)`);

  const loaded = await page.evaluate(async () => {
    await window.GTDocFonts.load();
    return {
      data: !!window.DOC_FONT_DATA && Object.keys(window.DOC_FONT_DATA).length,
      faces: !!document.getElementById('gt-doc-faces')
    };
  });
  ok(loaded.data === 16, `asking for them fetches all sixteen faces (${loaded.data})`);
  ok(loaded.faces, 'and installs them as @font-face rules for the preview');

  const twice = await page.evaluate(async () => {
    await window.GTDocFonts.load();
    return document.querySelectorAll('#gt-doc-faces').length;
  });
  ok(twice === 1, 'asking twice does not install them twice');

  /* ---- exports ---- */
  const exported = await page.evaluate(async () => {
    /* Stand in for the two libraries and capture what the page hands them,
       so this tests the page's document model rather than theirs. */
    const seen = {};
    window.docx = {
      Document: function (o) { seen.docx = o; }, Packer: { toBlob: () => Promise.resolve(new Blob(['x'])) },
      Paragraph: function (o) { return o; }, TextRun: function (o) { return o; },
      Table: function (o) { return o; }, TableRow: function (o) { return o; },
      TableCell: function (o) { return o; }, WidthType: { PERCENTAGE: 'pct', DXA: 'dxa' },
      AlignmentType: {}, TabStopType: {}, BorderStyle: {}, ShadingType: {}, Tab: function () {}
    };
    window.pdfMake = {
      vfs: {},
      createPdf: (dd) => { seen.pdf = dd; return { getBlob: (cb) => cb(new Blob(['x'])) }; }
    };
    const saved = [];
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = (b) => { saved.push(b); return 'blob:stub'; };
    const app = Alpine.$data(document.querySelector('[x-data]'));
    await app.exportDocx();
    await app.exportPdf();
    URL.createObjectURL = realCreate;
    return { docx: !!seen.docx, pdf: !!seen.pdf, saved: saved.length,
             pdfFonts: seen.pdf ? Object.keys(seen.pdf.content || {}).length > 0 : false,
             busy: app.busy };
  });
  ok(exported.docx, 'Export Word builds a document and hands it to docx');
  ok(exported.pdf, 'Export PDF builds a document definition and hands it to pdfmake');
  ok(exported.pdfFonts, 'with content in it');
  ok(exported.saved === 2, `both exports reach a download (${exported.saved})`);
  ok(exported.busy === false, 'and the busy overlay is cleared afterwards');

  await ctx.close();

  /* ---- the preview keeps paper's colours in dark ---- */
  for (const theme of ['dark', 'light']) {
    const c = await newIsolated({ signedIn: true });
    const p2 = await c.newPage();
    await p2.goto(B + URL, { waitUntil: 'load' });
    await p2.evaluate((t) => localStorage.setItem('gt-theme', t), theme);
    await p2.reload({ waitUntil: 'load' });
    await p2.waitForFunction(() => !!window.Alpine, null, { timeout: 10000 }).catch(() => {});
    await p2.waitForTimeout(700);

    const seen = await p2.evaluate((lumSrc) => {
      const L = eval(lumSrc);
      const paper = document.querySelector('.gt-paper');
      const head = document.querySelector('.gt-paper th');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        paperBg: L(getComputedStyle(paper).backgroundColor),
        paperInk: L(getComputedStyle(paper).color),
        headBg: head ? L(getComputedStyle(head).backgroundColor) : null,
        bodyBg: L(getComputedStyle(document.body).backgroundColor)
      };
    }, String(lum));

    ok(seen.theme === theme, `${theme}: the page is in the theme asked for`);
    ok(seen.paperBg > 0.9, `${theme}: the sheet is paper-white (${seen.paperBg.toFixed(2)})`);
    ok(seen.paperInk < 0.1, `${theme}: with black ink on it (${seen.paperInk.toFixed(2)})`);
    ok(seen.headBg !== null && seen.headBg > 0.7,
      `${theme}: and the table head keeps its light tint (${seen.headBg && seen.headBg.toFixed(2)})`);
    if (theme === 'dark') {
      ok(seen.bodyBg < 0.2, `dark: while the editor around it stays dark (${seen.bodyBg.toFixed(2)})`);
    }
    await c.close();
  }

  /* ---- the phone layout keeps its own columns ---- */
  {
    const c = await newIsolated({ signedIn: true });
    const p3 = await c.newPage();
    await p3.setViewportSize({ width: 390, height: 844 });
    await p3.goto(B + URL, { waitUntil: 'load' });
    await p3.waitForFunction(() => !!window.Alpine, null, { timeout: 10000 }).catch(() => {});
    await p3.waitForTimeout(700);

    const m = await p3.evaluate(() => {
      const w = (id) => Math.round(document.getElementById(id).getBoundingClientRect().width);
      return { title: w('pt-title'), name: w('pt-name'), bht: w('pt-bht'), uhid: w('pt-uhid'),
               scroll: document.documentElement.scrollWidth, inner: window.innerWidth };
    });
    /* The shared mobile rule collapses every grid-cols-* to one track; this
       page opts out because it sized its own columns, and when that opt-out
       regressed the Title select came out 36px wide. */
    ok(m.title > 70, `the Title select is usable on a phone (${m.title}px)`);
    ok(Math.abs(m.bht - m.uhid) < 40,
      `paired fields share the row evenly (BHT ${m.bht}px vs UHID ${m.uhid}px)`);
    ok(m.scroll <= m.inner + 1, `nothing overflows the viewport (${m.scroll} vs ${m.inner})`);
    await c.close();
  }

  return r;
};
