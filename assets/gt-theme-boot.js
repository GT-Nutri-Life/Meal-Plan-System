/*!
 * GT Meal Plan System — one theme, every subsystem
 * ------------------------------------------------------------------
 * Before this existed the theme was a per-page affair, and it showed: choose
 * dark on the portal, open BMI Assessment, and you were back in daylight.
 *
 * There were three separate systems and no agreement between them —
 *
 *   the portal            html[data-theme]   saved under 'gt-theme'
 *   About the Dietitian   html[data-theme]   saved under 'pt'
 *   both calendar tools   body.dark-mode     saved under 'darkMode'
 *
 * — and eight of the eleven bundled pages had no theme code whatsoever, so
 * they could only ever follow the operating system. BMI Assessment was one of
 * those: nothing on the page could make it dark, whatever the rest of the
 * portal was doing.
 *
 * This file is the single source of truth. It resolves the theme, writes it
 * where every one of those mechanisms will see it, and keeps all three keys in
 * step so each page's own toggle continues to work and continues to agree with
 * everyone else's.
 *
 * It must load synchronously, first in <head>. Applying the theme after the
 * first paint is what produces the white flash on every navigation, which on a
 * portal built out of eleven separate documents would mean a flash on every
 * single click.
 */
(function (root) {
  'use strict';

  if (root.GTTheme) return;

  var KEY = 'gt-theme';              // the shared choice
  var LEGACY_DOC = 'pt';             // About the Dietitian
  var LEGACY_BOOL = 'darkMode';      // both calendar tools, 'true' / 'false'

  var doc = document;
  var listeners = [];

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function prefersDark() {
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /**
   * What theme are we in?
   *
   * The shared key wins. Failing that, a choice already made under one of the
   * old keys is honoured rather than discarded — someone who set dark on the
   * calendar generator last week should not be silently reset by this upgrade.
   * Only with nothing stored anywhere do we fall back to the OS.
   */
  function resolve() {
    var v = read(KEY);
    if (v === 'dark' || v === 'light') return v;

    var legacy = read(LEGACY_DOC);
    if (legacy === 'dark' || legacy === 'light') return legacy;

    var bool = read(LEGACY_BOOL);
    if (bool === 'true') return 'dark';
    if (bool === 'false') return 'light';

    return prefersDark() ? 'dark' : 'light';
  }

  /**
   * Write the theme everywhere it is read from.
   *
   * The attribute goes on <html> immediately; the class has to wait for <body>
   * to exist, which on a synchronous head script it does not yet. Both are
   * needed: the shared skin and two pages key off the attribute, the calendar
   * tools' own stylesheets key off the class.
   */
  function paint(mode) {
    var el = doc.documentElement;
    el.setAttribute('data-theme', mode);
    el.style.colorScheme = mode;

    var body = doc.body;
    if (body) {
      body.classList.toggle('dark-mode', mode === 'dark');
      body.classList.toggle('dark', mode === 'dark');
    }
  }

  function persist(mode) {
    write(KEY, mode);
    // Kept in step so each page's own toggle reads the same answer we did.
    write(LEGACY_DOC, mode);
    write(LEGACY_BOOL, mode === 'dark' ? 'true' : 'false');
  }

  function set(mode, save) {
    mode = mode === 'dark' ? 'dark' : 'light';
    paint(mode);
    if (save !== false) persist(mode);
    listeners.forEach(function (fn) { try { fn(mode); } catch (e) {} });
  }

  function current() {
    return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  /* ---------- apply, now, before anything paints ------------------------ */

  var initial = resolve();
  paint(initial);
  persist(initial);

  // <body> does not exist yet in a head script, so finish the job when it does.
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () { paint(current()); });
  } else {
    paint(current());
  }

  /* ---------- keep everyone in agreement -------------------------------- */

  /*
   * A page's own toggle still works, and still wins — it just no longer gets
   * to disagree with the rest of the portal. The calendar tools flip a class
   * on <body> and the older pages flip the attribute on <html>; either way the
   * change is observed here and written back to the shared key, so the next
   * subsystem opens in the theme the practitioner just chose.
   */
  function watchPageToggles() {
    var syncing = false;

    var onMutation = function () {
      if (syncing || root.__gtThemeSuspended) return;
      var attr = doc.documentElement.getAttribute('data-theme');
      var cls = doc.body && (doc.body.classList.contains('dark-mode') ||
                             doc.body.classList.contains('dark'));
      var mode = (attr === 'dark' || attr === 'light') ? attr : (cls ? 'dark' : 'light');

      // A page that toggled only its class leaves the attribute stale, and the
      // other way about; reconcile to whichever actually changed.
      if (attr !== null && cls !== undefined && (attr === 'dark') !== !!cls) {
        mode = doc.__gtLastAttr !== attr ? attr : (cls ? 'dark' : 'light');
      }
      doc.__gtLastAttr = attr;

      if (mode === read(KEY)) return;
      syncing = true;
      set(mode);
      syncing = false;
    };

    var mo = new MutationObserver(onMutation);
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    var startBody = function () {
      if (doc.body) mo.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', startBody);
    else startBody();
  }
  watchPageToggles();

  // Another tab, or another subsystem open alongside this one.
  root.addEventListener('storage', function (e) {
    if (e.key !== KEY || !e.newValue) return;
    if (e.newValue === current()) return;
    set(e.newValue, false);
  });

  // Only follow the OS while nothing has been chosen.
  if (root.matchMedia) {
    var mq = root.matchMedia('(prefers-color-scheme: dark)');
    var onOS = function () { if (!read(KEY)) set(prefersDark() ? 'dark' : 'light', false); };
    if (mq.addEventListener) mq.addEventListener('change', onOS);
    else if (mq.addListener) mq.addListener(onOS);
  }

  root.GTTheme = {
    get: current,
    set: set,
    toggle: function () { set(current() === 'dark' ? 'light' : 'dark'); return current(); },
    onChange: function (fn) { listeners.push(fn); },

    /*
     * Paint a mode without recording it as the choice.
     *
     * Exports need this: a PDF is rasterised from the live DOM, so the page
     * has to be light while html2canvas reads it. Painting light the ordinary
     * way would have the observer below treat it as the practitioner choosing
     * light and write it to localStorage — every export would silently flip
     * their theme. suspend() holds that off; resume() restores the choice
     * that was already stored, whatever the DOM was doing meanwhile.
     */
    suspend: function () { root.__gtThemeSuspended = (root.__gtThemeSuspended || 0) + 1; },
    resume: function () {
      root.__gtThemeSuspended = Math.max(0, (root.__gtThemeSuspended || 0) - 1);
      if (!root.__gtThemeSuspended) paint(current());
    },
    /** Paint without persisting. Only meaningful while suspended. */
    paintOnly: paint
  };
})(typeof window !== 'undefined' ? window : globalThis);
