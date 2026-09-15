/*
 * GT Nutri Life — exports are always light.
 *
 * Every tool here ends in a handout: a PDF, a Word file, a printed page that
 * goes to a client. Those are ink on paper, and paper is white.
 *
 * Two of the three export routes read the live DOM, so in dark mode they took
 * the dark mode with them:
 *
 *   - html2canvas rasterises the page itself, so a dark card came out a dark
 *     card. Setting its backgroundColor to white does not help — that is only
 *     the ground behind whatever the elements paint.
 *   - the off-screen HTML these pages build for the PDF carries inline styles
 *     like `border-top:1px solid var(--gt-border,#DDEAE2)`, and a custom
 *     property resolves against whatever theme is live at the time.
 *   - printing had the same trouble from the other end: the print stylesheet
 *     whitened the page ground but left the dark cards and their light ink.
 *
 * The DOCX builder writes its own colours as literals and never reads the
 * page, so it was already right and is untouched here.
 *
 * Rather than maintain a parallel light-only stylesheet for export — which
 * would have to shadow every dark rule and would drift the first time one
 * changed — this holds the document in light for as long as the export is
 * reading it, then puts it back. One mechanism, and it cannot fall behind the
 * theme it mirrors, because it *is* the theme.
 */
(function (root) {
  'use strict';
  if (root.GTExportLight) return;

  var doc = root.document;
  var depth = 0;
  var saved = null;

  function lock() {
    if (depth++) return;
    var el = doc.documentElement;
    var body = doc.body;
    saved = {
      attr: el.getAttribute('data-theme'),
      scheme: el.style.colorScheme,
      darkMode: body && body.classList.contains('dark-mode'),
      dark: body && body.classList.contains('dark')
    };
    /* Hold the controller off, or it reads this as a theme choice and stores
       it — the export would change the practitioner's theme behind them. */
    if (root.GTTheme && root.GTTheme.suspend) root.GTTheme.suspend();
    el.setAttribute('data-theme', 'light');
    el.style.colorScheme = 'light';
    if (body) { body.classList.remove('dark-mode'); body.classList.remove('dark'); }
  }

  function unlock() {
    if (!depth || --depth) return;
    var el = doc.documentElement;
    var body = doc.body;
    if (saved.attr === null) el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', saved.attr);
    el.style.colorScheme = saved.scheme || '';
    if (body) {
      body.classList.toggle('dark-mode', !!saved.darkMode);
      body.classList.toggle('dark', !!saved.dark);
    }
    saved = null;
    if (root.GTTheme && root.GTTheme.resume) root.GTTheme.resume();
  }

  /** Run fn with the document held light. Restores even if fn throws. */
  function withLight(fn) {
    lock();
    var out;
    try { out = fn(); } catch (e) { unlock(); throw e; }
    if (out && typeof out.then === 'function') {
      return out.then(
        function (v) { unlock(); return v; },
        function (e) { unlock(); throw e; }
      );
    }
    unlock();
    return out;
  }

  /* ---------------------------------------------------------- html2canvas */

  /*
   * The library arrives late — assets/gt-lazy.js loads it after first paint —
   * so wrapping whatever is on window right now would wrap nothing. An
   * accessor wraps it at the moment it is assigned instead, and keeps working
   * if it is ever replaced.
   */
  var real = root.html2canvas;
  function wrap(fn) {
    if (typeof fn !== 'function' || fn.__gtLightWrapped) return fn;
    var wrapped = function () {
      var args = arguments, self = this;
      return withLight(function () { return fn.apply(self, args); });
    };
    wrapped.__gtLightWrapped = true;
    /* html2canvas hangs helpers off the function; keep them reachable. */
    for (var k in fn) { try { wrapped[k] = fn[k]; } catch (e) {} }
    return wrapped;
  }
  try {
    Object.defineProperty(root, 'html2canvas', {
      configurable: true,
      get: function () { return real; },
      set: function (v) { real = wrap(v); }
    });
    if (real) real = wrap(real);
  } catch (e) {
    if (real) root.html2canvas = wrap(real);
  }

  /* ---------------------------------------------------------------- print */

  /*
   * beforeprint covers Ctrl+P as well as window.print(), and afterprint puts
   * the theme back. Wrapping print() too is belt and braces: the pages call
   * it behind a setTimeout, and a mode set synchronously before the dialog
   * opens cannot be missed.
   */
  root.addEventListener('beforeprint', lock);
  root.addEventListener('afterprint', unlock);

  var nativePrint = root.print;
  if (typeof nativePrint === 'function') {
    root.print = function () {
      lock();
      try { return nativePrint.apply(root, arguments); }
      finally {
        /* afterprint fires for the real dialog; this is the fallback for
           browsers that skip it, and unlock() is re-entrant so both is safe. */
        root.setTimeout(unlock, 0);
      }
    };
  }

  root.GTExportLight = { withLight: withLight, lock: lock, unlock: unlock,
    get depth() { return depth; } };
})(typeof window !== 'undefined' ? window : globalThis);
