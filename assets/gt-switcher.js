/*!
 * GT Meal Plan System — cross-app switcher
 * ------------------------------------------------------------------
 * Injected into every bundled subsystem as the last element in <body>:
 *
 *     <script src="../../assets/gt-switcher.js" defer></script>
 *
 * Design constraints, because this runs inside eleven unrelated pages
 * that were never written to host it:
 *
 *   - Everything lives in a shadow root, so the host page's CSS cannot
 *     reach in and this file's CSS cannot leak out. The apps variously
 *     ship Tailwind, hand-rolled CSS and inline styles; none of it can
 *     collide with what is rendered here. The root is open rather than
 *     closed: the isolation comes from the shadow boundary either way,
 *     and an open root stays inspectable in DevTools and reachable from
 *     the test suite.
 *   - Only one global is claimed (__GT_SWITCHER__) and only as a
 *     double-injection guard.
 *   - The launcher is anchored bottom-right, which no bundled app uses
 *     for fixed UI, so nothing is ever covered.
 *   - The portal root is derived from this script's own URL, so the
 *     same file works at a domain root, under a project path such as
 *     /Meal-Plan-System/, and from the local filesystem.
 */
(function () {
  'use strict';

  if (window.__GT_SWITCHER__) return;
  window.__GT_SWITCHER__ = true;

  /* ---------- locate the portal root ---------------------------------- */

  var self = document.currentScript ||
             document.querySelector('script[src$="gt-switcher.js"]');
  if (!self) return;

  // ".../assets/gt-switcher.js" -> ".../"
  var BASE = new URL(self.src, location.href).href.replace(/assets\/gt-switcher\.js(?:\?.*)?$/, '');

  /* ---------- load the registry, then build --------------------------- */

  // registry -> context -> auth -> switcher. Each waits for the one before it
  // because the switcher renders the record, and the record syncs through auth.
  need('assets/registry.js', function () { return window.GTRegistry; }, function (ok) {
    if (!ok) {
      if (window.console && console.warn) {
        console.warn('[GT] switcher: registry could not be loaded from ' + BASE);
      }
      return;
    }
    need('assets/gt-context.js', function () { return window.GTContext; }, function () {
      need('assets/gt-auth.js', function () { return window.GTAuth; }, function () {
        startAuth(window.GTRegistry);
        build(window.GTRegistry);
      });
    });
  });

  /** Load a sibling script once, then continue. */
  function need(path, present, done) {
    if (present()) return done(true);
    var existing = document.querySelector('script[data-gt="' + path + '"]');
    if (existing) {
      existing.addEventListener('load',  function () { done(present()); });
      existing.addEventListener('error', function () { done(false); });
      return;
    }
    var el = document.createElement('script');
    el.src = BASE + path;
    el.setAttribute('data-gt', path);
    el.onload  = function () { done(present()); };
    el.onerror = function () { done(false); };
    document.head.appendChild(el);
  }

  /**
   * Bring up the shared sign-in. Pages flagged public in the registry are not
   * gated, but still get a client so the record can sync when signed in.
   */
  function startAuth(REG) {
    if (!window.GTAuth) return;
    var here = normalise(location.href);
    var tool = null;
    REG.tools.forEach(function (t) { if (normalise(BASE + t.path) === here) tool = t; });
    // Anything not in the registry (the portal itself included) is gated.
    var isPublic = !!(tool && tool.isPublic);
    window.GTAuth.init({ gated: !isPublic });
    // Pull a newer record down once the session is known.
    window.GTAuth.onChange(function (user) {
      if (user && window.GTContext) window.GTContext.syncFromCloud();
    });
  }

  /* ==================================================================== */

  function build(REG) {
    var host = document.createElement('div');
    host.id = 'gt-switcher-root';
    // The host element itself is inert; all fixed positioning happens inside.
    host.style.cssText = 'all:initial';
    var root = host.attachShadow({ mode: 'open' });

    /* ---------- which tool are we currently inside? ------------------- */

    var here = normalise(location.href);
    var current = null;
    REG.tools.forEach(function (t) {
      if (normalise(BASE + t.path) === here) current = t;
    });

    /* ---------- markup ------------------------------------------------ */

    root.innerHTML =
      '<style>' + CSS + '</style>' +
      '<button class="fab" type="button" aria-haspopup="dialog" aria-expanded="false"' +
        ' aria-label="Open the GT system switcher">' +
        svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>' +
            '<rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>') +
        '<span class="fab-label">Systems</span>' +
      '</button>' +
      '<div class="scrim" hidden></div>' +
      '<div class="panel" role="dialog" aria-modal="true" aria-label="GT Meal Plan System — switch subsystem" hidden>' +
        '<header class="ph">' +
          '<div class="ph-txt">' +
            '<p class="eyebrow">GT Meal Plan System</p>' +
            '<h2>Switch subsystem</h2>' +
          '</div>' +
          '<button class="x" type="button" aria-label="Close the switcher">' +
            svg('<path d="M6 6l12 12M18 6L6 18"/>') +
          '</button>' +
        '</header>' +
        '<div class="rec" hidden>' +
          '<div class="rec-top">' +
            '<span class="rec-lab">Current record</span>' +
            '<button class="rec-clear" type="button">Clear</button>' +
          '</div>' +
          '<p class="rec-sum"></p>' +
          '<div class="rec-act">' +
            '<button class="rec-fill" type="button">Fill this page</button>' +
            '<span class="rec-n"></span>' +
          '</div>' +
        '</div>' +
        '<div class="srch">' +
          svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.5-4.5"/>') +
          '<input type="search" placeholder="Search systems…" aria-label="Search systems"' +
                ' autocomplete="off" spellcheck="false">' +
        '</div>' +
        '<div class="list" role="listbox" aria-label="Available systems"></div>' +
        '<footer class="pf">' +
          '<a class="home" href="' + esc(BASE) + 'index.html">' +
            svg('<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>') +
            '<span>Portal home</span>' +
          '</a>' +
          '<span class="acct"><span class="who"></span>' +
            '<button class="signout" type="button" hidden>Sign out</button></span>' +
        '</footer>' +
      '</div>';

    var CTX    = window.GTContext || null;
    var recBox = root.querySelector('.rec');
    var recSum = root.querySelector('.rec-sum');
    var recFill= root.querySelector('.rec-fill');
    var recN   = root.querySelector('.rec-n');
    var recClr = root.querySelector('.rec-clear');
    var who    = root.querySelector('.who');
    var signout= root.querySelector('.signout');
    var fab    = root.querySelector('.fab');
    var scrim  = root.querySelector('.scrim');
    var panel  = root.querySelector('.panel');
    var input  = root.querySelector('input');
    var list   = root.querySelector('.list');
    var closeB = root.querySelector('.x');

    /* ---------- render the (filtered) list ---------------------------- */

    var results = [];
    var active  = -1;

    function render(query) {
      var matches = REG.search(query);
      results = [];
      list.innerHTML = '';

      if (!matches.length) {
        list.innerHTML = '<p class="empty">No system matches that search.</p>';
        return;
      }

      // Where the data in hand can go next. Only on an unfiltered list, and
      // only when there is actually something to carry forward.
      if (!String(query || '').trim() && current && CTX && CTX.filledCount() > 0) {
        var edges = REG.flowFrom(current.id).filter(function (e) { return REG.get(e.to); });
        if (edges.length) {
          var nh = document.createElement('p');
          nh.className = 'grp';
          nh.textContent = 'Continue in';
          list.appendChild(nh);

          edges.forEach(function (e) {
            var t = REG.get(e.to);
            var a = document.createElement('a');
            a.className = 'itm nxt';
            a.href = BASE + t.path;
            a.setAttribute('role', 'option');
            a.setAttribute('aria-selected', 'false');
            a.innerHTML =
              '<span class="ico">' + svg(REG.icons[t.icon] || '') + '</span>' +
              '<span class="txt">' +
                '<span class="nm">' + esc(t.name) + '</span>' +
                '<span class="sm">' + esc(e.label) + '</span>' +
              '</span>';
            list.appendChild(a);
            results.push(a);
          });
        }
      }

      REG.categories.forEach(function (cat) {
        var inCat = matches.filter(function (t) { return t.category === cat.id; });
        if (!inCat.length) return;

        var h = document.createElement('p');
        h.className = 'grp';
        h.textContent = cat.name;
        list.appendChild(h);

        inCat.forEach(function (t) {
          var isHere = current && t.id === current.id;
          var a = document.createElement('a');
          a.className = 'itm' + (isHere ? ' here' : '');
          a.href = BASE + t.path;
          a.setAttribute('role', 'option');
          a.setAttribute('aria-selected', isHere ? 'true' : 'false');
          a.innerHTML =
            '<span class="ico">' + svg(REG.icons[t.icon] || '') + '</span>' +
            '<span class="txt">' +
              '<span class="nm">' + esc(t.name) +
                (isHere ? '<span class="badge">You are here</span>' : '') + '</span>' +
              '<span class="sm">' + esc(t.summary) + '</span>' +
            '</span>';
          if (isHere) a.setAttribute('aria-current', 'page');
          list.appendChild(a);
          results.push(a);
        });
      });

      active = -1;
    }

    function highlight(i) {
      results.forEach(function (el) { el.classList.remove('kb'); });
      if (i < 0 || i >= results.length) { active = -1; return; }
      active = i;
      results[i].classList.add('kb');
      results[i].scrollIntoView({ block: 'nearest' });
    }

    /* ---------- shared clinical record --------------------------------- */

    function refreshRecord() {
      if (!CTX) { recBox.hidden = true; return; }
      var filled = CTX.filledCount();
      recBox.hidden = filled === 0;
      if (!filled) return;

      var sum = CTX.summary();
      recSum.textContent = sum || (filled + ' field' + (filled === 1 ? '' : 's') + ' carried');
      recN.textContent = filled + ' field' + (filled === 1 ? '' : 's');
      // Only offer to fill a page that actually knows how to receive the record.
      recFill.hidden = !(current && CTX.adapters[current.id]);
    }

    if (CTX) {
      recFill.addEventListener('click', function () {
        if (!current) return;
        var n = CTX.apply(current.id);
        recFill.textContent = n ? 'Filled ' + n + ' field' + (n === 1 ? '' : 's') : 'Nothing to fill';
        setTimeout(function () { recFill.textContent = 'Fill this page'; }, 2200);
      });

      recClr.addEventListener('click', function () {
        CTX.clear();
        refreshRecord();
        render(input.value);
      });

      CTX.onChange(function () { refreshRecord(); });

      // Lift whatever the page holds into the record. Cheap enough to run on a
      // timer, which covers apps that compute results without firing events we
      // could otherwise hook.
      //
      // Capture stays disarmed until the clinician actually enters something.
      // Several tools ship with placeholder values — BMI Assessment opens at
      // 170 cm and 68 kg and computes a BMI from them — and carrying those
      // into a meal plan as if they were measurements would be worse than
      // carrying nothing at all. Only 'input' and 'change' arm it: a stray
      // click or keypress is not data entry.
      if (current && CTX.adapters[current.id]) {
        var armed = false;
        var grab = function () { if (armed) CTX.capture(current.id); };

        // Input events are composed, so typing in the switcher's own search
        // box or the sign-in form reaches this document listener too. Those
        // are not data entry in the host app, and treating them as such would
        // arm capture and let the app's placeholder values through.
        var ours = function (e) {
          var path = e.composedPath ? e.composedPath() : [];
          for (var i = 0; i < path.length; i++) {
            var id = path[i] && path[i].id;
            if (id === 'gt-switcher-root' || id === 'gt-auth-root') return true;
          }
          return !!(e.target && (e.target.id === 'gt-switcher-root' || e.target.id === 'gt-auth-root'));
        };

        var arm = function (e) {
          if (armed || ours(e)) return;
          // A prefill fires the same events typing does. Capturing the page
          // back into the record while we are writing into it would overwrite
          // the record with whatever placeholders the page happened to hold.
          if (CTX.isWriting && CTX.isWriting()) return;
          armed = true;
          grab();
        };
        document.addEventListener('input',  arm, true);
        document.addEventListener('change', arm, true);

        setInterval(grab, 2500);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') grab();
        });
        window.addEventListener('pagehide', grab);
      }
    }

    /* ---------- account row -------------------------------------------- */

    function refreshAccount() {
      var A = window.GTAuth;
      if (!A) { who.textContent = ''; signout.hidden = true; return; }
      var u = A.user();
      who.textContent = u ? u.email : '';
      who.title = u ? u.role + ' account' : '';
      signout.hidden = !u;
    }

    if (window.GTAuth) {
      window.GTAuth.onChange(function () { refreshAccount(); refreshRecord(); });
      signout.addEventListener('click', function () { window.GTAuth.signOut(); close(); });
      refreshAccount();
    }

    /* ---------- open / close ------------------------------------------ */

    var lastFocus = null;

    function open() {
      lastFocus = document.activeElement;
      scrim.hidden = false;
      panel.hidden = false;
      fab.setAttribute('aria-expanded', 'true');
      // Force a frame so the transition runs from the hidden state.
      requestAnimationFrame(function () {
        scrim.classList.add('on');
        panel.classList.add('on');
      });
      input.value = '';
      refreshRecord();
      render('');
      input.focus();
      document.addEventListener('keydown', onKey, true);
    }

    function close() {
      scrim.classList.remove('on');
      panel.classList.remove('on');
      fab.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey, true);
      var done = function () { scrim.hidden = true; panel.hidden = true; };
      if (reduced()) done(); else setTimeout(done, 180);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function isOpen() { return !panel.hidden; }

    /* ---------- keyboard ---------------------------------------------- */

    function onKey(e) {
      if (!isOpen()) return;

      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); close(); return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault(); highlight(active + 1 >= results.length ? 0 : active + 1); return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); highlight(active - 1 < 0 ? results.length - 1 : active - 1); return;
      }
      if (e.key === 'Enter' && active > -1) {
        e.preventDefault(); results[active].click(); return;
      }
      if (e.key === 'Tab') {
        // Keep focus inside the dialog.
        var f = [input].concat(results, [closeB, root.querySelector('.home')]);
        f = f.filter(Boolean);
        var i = f.indexOf(root.activeElement);
        if (e.shiftKey && i <= 0)          { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    }

    // Global shortcut: Cmd/Ctrl+K toggles the switcher from anywhere in the app.
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        isOpen() ? close() : open();
      }
    });

    fab.addEventListener('click', function () { isOpen() ? close() : open(); });
    closeB.addEventListener('click', close);
    scrim.addEventListener('click', close);
    input.addEventListener('input', function () { render(input.value); });

    /* ---------- mount -------------------------------------------------- */

    (document.body || document.documentElement).appendChild(host);
  }

  /* ---------- helpers -------------------------------------------------- */

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Compare URLs ignoring query, hash and an implicit index.html. */
  function normalise(href) {
    var u = new URL(href, location.href);
    return (u.origin + u.pathname).replace(/index\.html$/, '').replace(/\/$/, '');
  }

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---------- styles (scoped to the shadow root) ----------------------- */

  var CSS = [
    ':host,*{box-sizing:border-box}',
    /* The author rules below set display on .panel, which would otherwise beat the
       UA stylesheet's [hidden]{display:none} and leave the panel permanently open. */
    '[hidden]{display:none!important}',
    ':host{--ac:#2D7A5F;--ac2:#3A9E7A;--bg:#FFFFFF;--bg2:#F4F7F5;--tx:#1B2A22;--tx2:#5F8474;',
    '--bdr:rgba(45,122,95,.14);--sh:0 24px 64px rgba(27,42,34,.20);--z:2147483000;',
    "--f:'Outfit',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    '@media (prefers-color-scheme:dark){:host{--bg:#16261E;--bg2:#1F332A;--tx:#E8F0EB;--tx2:#9DBEAD;',
    '--ac:#4AE09A;--ac2:#3CC48A;--bdr:rgba(74,224,154,.18);--sh:0 24px 64px rgba(0,0,0,.55)}}',

    'svg{width:20px;height:20px;flex:none;display:block}',

    /* launcher */
    '.fab{position:fixed;right:20px;bottom:20px;z-index:var(--z);display:inline-flex;align-items:center;gap:9px;',
    'padding:12px 18px 12px 15px;border:1px solid var(--bdr);border-radius:9999px;background:var(--ac);color:#fff;',
    'font:600 14px/1 var(--f);letter-spacing:.01em;cursor:pointer;box-shadow:0 8px 28px rgba(27,42,34,.28);',
    '-webkit-tap-highlight-color:transparent;transition:transform .18s cubic-bezier(.16,1,.3,1),background .18s,box-shadow .18s}',
    '.fab:hover{background:var(--ac2);transform:translateY(-2px);box-shadow:0 14px 36px rgba(27,42,34,.34)}',
    '.fab:active{transform:translateY(0)}',
    '.fab:focus-visible{outline:3px solid var(--ac2);outline-offset:3px}',
    '@media (max-width:520px){.fab{right:14px;bottom:14px;padding:13px}.fab-label{display:none}}',

    /* scrim */
    '.scrim{position:fixed;inset:0;z-index:calc(var(--z) + 1);background:rgba(12,22,17,.46);',
    'backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);opacity:0;transition:opacity .18s}',
    '.scrim.on{opacity:1}',

    /* panel */
    '.panel{position:fixed;right:20px;bottom:20px;z-index:calc(var(--z) + 2);width:min(430px,calc(100vw - 40px));',
    'max-height:min(660px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden;',
    'background:var(--bg);color:var(--tx);border:1px solid var(--bdr);border-radius:20px;box-shadow:var(--sh);',
    'font:400 14px/1.55 var(--f);opacity:0;transform:translateY(12px) scale(.985);',
    'transition:opacity .2s cubic-bezier(.16,1,.3,1),transform .2s cubic-bezier(.16,1,.3,1)}',
    '.panel.on{opacity:1;transform:none}',
    '@media (max-width:520px){.panel{right:10px;left:10px;bottom:10px;width:auto;max-height:calc(100vh - 20px)}}',

    /* header */
    '.ph{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 18px 12px}',
    '.eyebrow{margin:0 0 3px;font-size:10.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ac)}',
    '.ph h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:var(--tx)}',
    '.x{display:grid;place-items:center;width:32px;height:32px;flex:none;border:0;border-radius:9px;',
    'background:transparent;color:var(--tx2);cursor:pointer;transition:background .15s,color .15s}',
    '.x:hover{background:var(--bg2);color:var(--tx)}',
    '.x:focus-visible{outline:2px solid var(--ac);outline-offset:2px}',

    /* search */
    '.srch{display:flex;align-items:center;gap:9px;margin:0 18px 10px;padding:0 12px;',
    'background:var(--bg2);border:1px solid var(--bdr);border-radius:11px;color:var(--tx2)}',
    '.srch input{flex:1;min-width:0;padding:11px 0;border:0;background:transparent;color:var(--tx);',
    'font:400 14px/1.4 var(--f);outline:none}',
    '.srch input::placeholder{color:var(--tx2);opacity:.85}',
    '.srch input::-webkit-search-cancel-button{-webkit-appearance:none}',
    '.srch:focus-within{border-color:var(--ac);box-shadow:0 0 0 3px rgba(45,122,95,.13)}',

    /* current clinical record */
    '.rec{margin:0 18px 12px;padding:12px 14px;border:1px solid var(--bdr);border-radius:12px;background:var(--bg2)}',
    '.rec-top{display:flex;align-items:center;justify-content:space-between;gap:10px}',
    '.rec-lab{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ac)}',
    '.rec-clear{padding:2px 7px;border:0;border-radius:6px;background:transparent;color:var(--tx2);',
    'font:500 11.5px var(--f);cursor:pointer}',
    '.rec-clear:hover{background:var(--bg);color:var(--tx)}',
    '.rec-sum{margin:5px 0 0;font-size:13.5px;font-weight:600;color:var(--tx);',
    'overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rec-act{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px}',
    '.rec-fill{padding:6px 12px;border:0;border-radius:8px;background:var(--ac);color:var(--bg);',
    'font:600 12px var(--f);cursor:pointer;transition:background .16s}',
    '.rec-fill:hover{background:var(--ac2)}',
    '.rec-n{font:400 11.5px var(--f);color:var(--tx2)}',

    /* list */
    '.list{flex:1;min-height:0;overflow-y:auto;padding:0 10px 8px;overscroll-behavior:contain}',
    '.itm.nxt .ico{background:var(--ac);color:var(--bg);border-color:transparent}',
    '.itm.nxt .sm{color:var(--ac)}',
    '.grp{margin:12px 8px 5px;font-size:10.5px;font-weight:600;letter-spacing:.14em;',
    'text-transform:uppercase;color:var(--tx2)}',
    '.itm{display:flex;align-items:flex-start;gap:11px;padding:10px;border-radius:12px;',
    'color:inherit;text-decoration:none;transition:background .14s}',
    '.itm:hover,.itm.kb{background:var(--bg2)}',
    '.itm:focus-visible{outline:2px solid var(--ac);outline-offset:-2px}',
    '.itm.kb{box-shadow:inset 0 0 0 1.5px var(--ac)}',
    '.ico{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:9px;',
    'background:var(--bg2);color:var(--ac);border:1px solid var(--bdr)}',
    '.itm.here .ico{background:var(--ac);color:var(--bg);border-color:transparent}',
    '.txt{min-width:0;display:flex;flex-direction:column;gap:1px}',
    '.nm{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:13.5px;font-weight:600;color:var(--tx)}',
    '.sm{font-size:12px;line-height:1.45;color:var(--tx2)}',
    '.badge{padding:1.5px 7px;border-radius:9999px;background:var(--ac);color:var(--bg);',
    'font-size:9.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}',
    '.empty{margin:18px 10px;font-size:13px;color:var(--tx2);text-align:center}',

    /* footer */
    '.pf{display:flex;align-items:center;justify-content:space-between;gap:10px;',
    'padding:11px 18px;border-top:1px solid var(--bdr);background:var(--bg2)}',
    '.home{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;',
    'color:var(--ac);text-decoration:none}',
    '.home:hover{color:var(--ac2)}',
    '.home:focus-visible{outline:2px solid var(--ac);outline-offset:3px;border-radius:5px}',
    '.home svg{width:15px;height:15px}',
    '.acct{display:flex;align-items:center;gap:9px;min-width:0}',
    '.who{font:400 11.5px var(--f);color:var(--tx2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}',
    '.signout{padding:4px 9px;border:1px solid var(--bdr);border-radius:7px;background:transparent;',
    'color:var(--tx2);font:600 11.5px var(--f);cursor:pointer}',
    '.signout:hover{color:var(--tx);border-color:var(--ac)}',

    /* scrollbar */
    '.list::-webkit-scrollbar{width:9px}',
    '.list::-webkit-scrollbar-thumb{background:var(--bdr);border-radius:9999px;border:3px solid transparent;background-clip:padding-box}',

    '@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}'
  ].join('');
})();
