/*
 * GT Nutri Life — deferred loader for the export libraries.
 *
 * Eight of the eleven bundled pages pull a PDF writer, a canvas rasteriser, a
 * spreadsheet writer, a Word writer, a chart library, a dialog library or the
 * Supabase client from a CDN, and every one of them used to sit in <head> as a
 * render-blocking <script>. On the worst page that is about 1.5 MB the browser
 * has to fetch and execute before it is allowed to paint a single field — and
 * none of it is touched until somebody asks for an export.
 *
 * scripts/defer-libs.js rewrites those tags into inert placeholders carrying a
 * data-gt-lazy attribute. This file picks them up and loads them once the page
 * has painted: on the load event, or sooner at the first sign of interaction.
 *
 * A click that lands in the short window before the libraries arrive is held
 * rather than lost — the gate below swallows it, waits, and replays it. The
 * gate only ever applies to buttons, so typing, focus and navigation are never
 * delayed by it, and it removes itself the moment loading finishes.
 */
(function () {
  'use strict';

  var doc = document;
  var REPLAY = '__gtLazyReplay';
  var GATE_CAP_MS = 6000;

  var started = false;
  var done = false;
  var pending = null;

  function tags() {
    return [].slice.call(doc.querySelectorAll('script[data-gt-lazy]'));
  }

  /* Inject the real <script> next to its placeholder. Order among independent
     libraries does not matter; where it does — an autotable plugin needs its
     jsPDF — the placeholder names the dependency and we wait for it. */
  function inject(tag) {
    return new Promise(function (resolve) {
      var s = doc.createElement('script');
      s.src = tag.getAttribute('data-gt-lazy');
      var cross = tag.getAttribute('data-gt-lazy-crossorigin');
      if (cross) s.crossOrigin = cross;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        /* A failed export library must not stall the page: the pages all guard
           their own use of these globals and say so in the UI. */
        if (window.console) console.warn('[gt-lazy] could not load ' + s.src);
        resolve();
      };
      (tag.parentNode || doc.head).insertBefore(s, tag.nextSibling);
    });
  }

  function start() {
    if (started) return pending;
    started = true;

    var list = tags();
    if (!list.length) {
      done = true;
      pending = Promise.resolve();
      return pending;
    }

    /* Hand out a promise per placeholder first, so a dependent tag can wait on
       the tag that provides its global no matter which order they appear in. */
    var byName = {};
    var handles = list.map(function (tag) {
      var h = {};
      h.promise = new Promise(function (res) { h.resolve = res; });
      var provides = tag.getAttribute('data-gt-lazy-provides');
      if (provides) byName[provides] = h;
      return h;
    });

    list.forEach(function (tag, i) {
      var needs = tag.getAttribute('data-gt-lazy-needs');
      var gate = (needs && byName[needs]) ? byName[needs].promise : Promise.resolve();
      gate.then(function () { return inject(tag); }).then(handles[i].resolve, handles[i].resolve);
    });

    pending = Promise.all(handles.map(function (h) { return h.promise; })).then(function () {
      done = true;
      doc.documentElement.setAttribute('data-gt-lazy-state', 'ready');
    });
    return pending;
  }

  /* ---------------------------------------------------------------- gate */

  function gateable(ev) {
    if (done || ev[REPLAY] || !ev.isTrusted) return null;
    var t = ev.target;
    if (!t || t.nodeType !== 1) return null;
    /* Clicks retargeted out of the shared header/footer land on the shadow
       host; those never need an export library and must stay instant. */
    if (t.shadowRoot) return null;
    if (!t.closest) return null;
    var hit = t.closest('button, [role="button"], [onclick]');
    if (!hit) return null;
    if (hit.matches('input, select, textarea, a[href]')) return null;
    return hit;
  }

  var note = null;
  function busy(on) {
    if (on) {
      if (note) return;
      note = doc.createElement('div');
      note.textContent = 'Preparing export tools…';
      note.setAttribute('role', 'status');
      note.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);' +
        'z-index:2147483000;padding:8px 14px;border-radius:9999px;font:500 13px/1.2 ' +
        'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;' +
        'background:#2F6B52;color:#F7FAF8;box-shadow:0 6px 20px rgba(34,50,42,.22)';
      (doc.body || doc.documentElement).appendChild(note);
    } else if (note) {
      note.remove();
      note = null;
    }
  }

  function replay(el, ev) {
    var clone = new MouseEvent(ev.type, {
      bubbles: true, cancelable: true, composed: true, view: window,
      detail: ev.detail, button: ev.button, buttons: ev.buttons,
      clientX: ev.clientX, clientY: ev.clientY,
      ctrlKey: ev.ctrlKey, shiftKey: ev.shiftKey, altKey: ev.altKey, metaKey: ev.metaKey
    });
    clone[REPLAY] = true;
    el.dispatchEvent(clone);
  }

  function onClick(ev) {
    var el = gateable(ev);
    if (!el) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    busy(true);

    var settled = false;
    function go() {
      if (settled) return;
      settled = true;
      busy(false);
      replay(el, ev);
    }
    setTimeout(go, GATE_CAP_MS);
    start().then(go);
  }

  window.addEventListener('click', onClick, true);

  /* ------------------------------------------------------------- kickoff */

  /* Real user actions only. `focusin` looked like a useful fourth until you
     remember that a page with an autofocused field fires it during load, which
     would put the libraries back in the critical window they were taken out
     of. */
  var warm = function () { start(); };
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (t) {
    window.addEventListener(t, warm, { capture: true, once: true, passive: true });
  });

  function afterPaint() {
    if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: 1500 });
    else setTimeout(start, 200);
  }
  if (doc.readyState === 'complete') afterPaint();
  else window.addEventListener('load', afterPaint, { once: true });

  window.GTLazy = {
    load: start,
    ready: function () { return started ? pending : start(); },
    isReady: function () { return done; }
  };
})();
