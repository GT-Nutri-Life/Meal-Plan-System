/*!
 * GT Meal Plan System — the shared page header and footer
 * ------------------------------------------------------------------
 * Eleven pages, eleven different mastheads: some had a title bar, some had a
 * bare <h1>, one had nothing at all. This gives every page in the bundle the
 * same header and the same footer, so moving between tools stops feeling like
 * leaving one website for another.
 *
 * Both render into shadow roots, for the reason the switcher already does:
 * the host pages ship a mix of Tailwind, hand-rolled CSS and inline styles,
 * and the shadow boundary is the only way to guarantee that none of it reaches
 * in — and that nothing here leaks back out and disturbs the app it is sitting
 * above.
 *
 * The header carries the client control, which is the point of contact with
 * GTContext.clients: it names whose record is loaded, and it is where saving
 * that record under a client name happens.
 */
(function (root) {
  'use strict';

  if (root.GTChrome) return;

  var doc = document;

  /* ---------- which tool is this? ---------------------------------------- */

  /**
   * Derive the portal root from this script's own URL rather than from the
   * page's location, so the chrome works at any depth and on any host — the
   * same trick the switcher uses, and the reason neither has to be told where
   * it was deployed.
   */
  function portalRoot() {
    var el = doc.currentScript || (function () {
      var all = doc.querySelectorAll('script[src*="gt-chrome.js"]');
      return all[all.length - 1] || null;
    })();
    if (!el) return './';
    return el.src.replace(/assets\/gt-chrome\.js.*$/, '');
  }

  var ROOT = portalRoot();

  /** Match the current page against the registry, so the header can name it. */
  function currentTool() {
    var reg = root.GTRegistry;
    if (!reg || !reg.tools) return null;
    var here = location.pathname.replace(/\/+$/, '');
    var best = null;
    reg.tools.forEach(function (t) {
      if (!t.path) return;
      var p = String(t.path).replace(/^\.?\//, '').replace(/\/+$/, '');
      if (!p) return;
      if (here.length >= p.length && here.slice(-p.length) === p) {
        if (!best || p.length > best._len) { best = t; best._len = p.length; }
      }
    });
    return best;
  }

  function categoryName(tool) {
    var reg = root.GTRegistry;
    if (!reg || !reg.categories || !tool) return '';
    var c = reg.categories.filter(function (x) { return x.id === tool.category; })[0];
    return c ? c.name : '';
  }

  /* ---------- shared styles ---------------------------------------------- */

  var TOKENS = [
    ':host{',
    '--sage-50:#EFF7F2;--sage-100:#DCEEE4;--sage-200:#BFE0CE;--sage-300:#9ECFB6;',
    '--sage-400:#6FB894;--sage-500:#4E9E77;--sage-600:#3E7F60;--sage-700:#326650;',
    '--ash-100:#EEF3F0;--ash-200:#DFE8E3;--ash-300:#C9D6CE;--ash-400:#93A89B;',
    '--ash-500:#63796D;--ash-600:#5E7268;--ash-700:#46574F;',
    '--card:#FFFFFF;--soft:#F1F7F3;--border:#DDEAE2;',
    '--ink:#22322A;--ink2:#46574F;--ink3:#63796D;',
    "--f:'Outfit',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;",
    "--fd:'Playfair Display',Georgia,serif;",
    '--ease:cubic-bezier(.16,1,.3,1);',
    'all:initial;font-family:var(--f);',
    '}',

    /*
     * Dark.
     *
     * A shadow root cannot see the page's own theme: :host-context() would do
     * it but is not implemented outside Chromium, and prefers-color-scheme
     * only knows about the OS, not about a page whose toggle the user just
     * pressed. So the theme is resolved in script (see watchTheme) and stamped
     * on the host as data-theme, which every one of these rules reads.
     */
    ':host([data-theme="dark"]){',
    '--bar-bg:rgba(22,33,28,.88);',
    '--ash-100:#22302A;--ash-200:#2E3F37;--ash-300:#3E5348;--ash-400:#7E9A8B;',
    '--ash-500:#9BB8A8;--ash-600:#C3D8CB;--ash-700:#E9F1EC;',
    '--card:#1E2B25;--soft:#22302A;--border:#2E3F37;',
    '--ink:#E9F1EC;--ink2:#C3D8CB;--ink3:#9BB8A8;',
    /* On a dark ground the 600 steps read as muddy; the accent moves up the
       scale so the chip, its label and the links keep their contrast. */
    '--sage-50:#1F2E26;--sage-100:#24382E;--sage-200:#2F4A3C;',
    '--sage-600:#7FC3A2;--sage-700:#9ECFB6;',
    '}',

    ':host,*{box-sizing:border-box}',
    '[hidden]{display:none!important}'
  ].join('');

  /* ==================================================================== *
   * Header                                                                *
   * ==================================================================== */

  var HEADER_CSS = TOKENS + [
    ':host{display:block}',
    '.bar{display:flex;align-items:center;gap:14px;padding:10px 20px;',
    'background:var(--bar-bg,rgba(255,255,255,.86));backdrop-filter:blur(14px) saturate(150%);',
    '-webkit-backdrop-filter:blur(14px) saturate(150%);',
    'border-bottom:1px solid var(--border);font:400 14px/1.5 var(--f);color:var(--ink)}',

    '.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit;flex:none}',
    '.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;',
    'background:linear-gradient(145deg,var(--sage-500),var(--sage-600));color:#fff;',
    "font:700 13px/1 var(--fd);letter-spacing:-.02em;box-shadow:0 2px 8px rgba(62,127,96,.25)}",
    '.names{display:flex;flex-direction:column;line-height:1.2}',
    '.practice{font-size:13.5px;font-weight:600;letter-spacing:-.01em}',
    '.practice em{font-style:normal;color:var(--sage-600)}',
    '.tool{font-size:11.5px;color:var(--ink3)}',

    '.spacer{flex:1 1 auto;min-width:8px}',

    /* the client control */
    '.client{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;',
    'background:var(--sage-50);border:1px solid var(--sage-200);border-radius:9999px;max-width:min(46vw,420px)}',
    '.client.empty{background:var(--soft);border-color:var(--border)}',
    '.who{display:flex;flex-direction:column;min-width:0;line-height:1.25}',
    '.who b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.who span{font-size:10.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',

    'button{font-family:var(--f);cursor:pointer;border:0;background:none;color:inherit}',
    '.chip{flex:none;padding:6px 12px;border-radius:9999px;font:600 12px var(--f);',
    'background:var(--sage-600);color:#fff;transition:background .16s var(--ease)}',
    '.chip:hover{background:var(--sage-700)}',
    '.chip.ghost{background:transparent;color:var(--sage-700);border:1px solid var(--sage-300)}',
    '.chip.ghost:hover{background:var(--sage-100)}',

    '.who-actions{display:flex;gap:6px;flex:none}',

    '@media (max-width:720px){',
    ' .bar{padding:8px 12px;gap:8px}',
    ' .tool{display:none}',
    ' .who span{display:none}',
    ' .client{padding-left:10px}',
    '}',

    /* Narrower still: with no client loaded the label says nothing the button
       does not, so it goes and the control becomes a single compact target.
       A loaded client keeps its name — that is the one thing worth the space. */
    '@media (max-width:480px){',
    ' .client{max-width:56vw}',
    ' .client.empty{padding:4px;background:none;border-color:transparent}',
    ' .client.empty .who{display:none}',
    ' .chip{min-height:36px;display:inline-flex;align-items:center}',
    '}',

    /* the save / open panel */
    '.veil{position:fixed;inset:0;z-index:2147483500;display:flex;align-items:flex-start;',
    'justify-content:center;padding:76px 16px 16px;background:rgba(22,40,32,.42);',
    'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
    '.panel{width:100%;max-width:460px;max-height:min(72vh,620px);display:flex;flex-direction:column;',
    'background:var(--card);border:1px solid var(--border);border-radius:18px;',
    'box-shadow:0 28px 70px rgba(22,40,32,.28);overflow:hidden;font:400 14px/1.55 var(--f);color:var(--ink)}',
    '.panel h2{margin:0;padding:16px 18px 12px;font:600 16px/1.3 var(--fd);letter-spacing:-.01em;',
    'border-bottom:1px solid var(--border)}',
    '.body{padding:16px 18px;overflow:auto}',
    '.row{display:flex;gap:8px;align-items:stretch}',
    'input[type=text]{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--ash-300);',
    'border-radius:10px;background:var(--card);color:var(--ink);font:400 14px var(--f)}',
    'input[type=text]:focus{outline:none;border-color:var(--sage-500);box-shadow:0 0 0 3px rgba(78,158,119,.16)}',
    '.hint{margin:9px 0 0;font-size:12px;color:var(--ink3)}',
    '.err{margin:10px 0 0;padding:9px 12px;border-radius:10px;font-size:12.5px;',
    'background:#FCEFF0;border:1px solid #F1C4C8;color:#873F48}',
    '.ok{margin:10px 0 0;padding:9px 12px;border-radius:10px;font-size:12.5px;',
    'background:var(--sage-50);border:1px solid var(--sage-200);color:var(--sage-700)}',

    '.sep{margin:18px 0 10px;font:600 11px var(--f);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}',
    'ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}',
    'li{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--border);',
    'border-radius:12px;background:var(--soft);transition:border-color .14s,background .14s}',
    'li:hover{border-color:var(--sage-300);background:var(--sage-50)}',
    'li.on{border-color:var(--sage-400);background:var(--sage-50)}',
    'li .nm{flex:1;min-width:0}',
    'li .nm b{display:block;font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    'li .nm span{display:block;font-size:11px;color:var(--ink3)}',
    'li button{flex:none;padding:5px 10px;border-radius:8px;font:600 11.5px var(--f)}',
    'li .open{background:var(--sage-600);color:#fff}',
    'li .open:hover{background:var(--sage-700)}',
    'li .del{color:var(--ink3)}',
    'li .del:hover{background:#FCEFF0;color:#873F48}',
    '.empty-note{padding:14px;border:1px dashed var(--ash-300);border-radius:12px;',
    'font-size:12.5px;color:var(--ink3);text-align:center}',
    '.foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--border);background:var(--soft)}',
    '.foot button{padding:8px 14px;border-radius:10px;font:600 13px var(--f)}',
    '.foot .close{color:var(--ink2)}',
    '.foot .close:hover{background:var(--ash-200)}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important}}'
  ].join('');

  /** The client chip on its own, for a page that supplies its own header. */
  function buildClientControl() {
    var host = doc.createElement('span');
    host.className = 'gt-chrome-client';
    var sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML =
      '<style>' + HEADER_CSS + ':host{display:inline-flex}.client{margin:0}</style>' +
      '<div class="client empty">' +
        '<span class="who"><b>No client loaded</b><span>Open or save one</span></span>' +
        '<span class="who-actions"><button type="button" class="chip save">Clients</button></span>' +
      '</div>';
    return wireClient(sr, host);
  }

  function buildHeader(tool) {
    var host = doc.createElement('div');
    host.className = 'gt-chrome-header';
    host.setAttribute('role', 'banner');
    var sr = host.attachShadow({ mode: 'open' });

    var toolName = tool ? tool.name : '';
    var cat = categoryName(tool);

    sr.innerHTML =
      '<style>' + HEADER_CSS + '</style>' +
      '<div class="bar">' +
        '<a class="brand" href="' + ROOT + '">' +
          '<span class="mark">GT</span>' +
          '<span class="names">' +
            '<span class="practice">GT <em>Nutri Life</em></span>' +
            '<span class="tool">' + esc(toolName || 'Clinical nutrition portal') +
              (cat ? ' · ' + esc(cat) : '') + '</span>' +
          '</span>' +
        '</a>' +
        '<span class="spacer"></span>' +
        '<div class="client empty">' +
          '<span class="who"><b>No client loaded</b><span>Nothing saved yet</span></span>' +
          '<span class="who-actions">' +
            '<button type="button" class="chip save">Save client</button>' +
          '</span>' +
        '</div>' +
      '</div>';

    return wireClient(sr, host);
  }

  /** Give a rendered client chip its behaviour. Shared by both mount paths. */
  function wireClient(sr, host) {
    var clientBox = sr.querySelector('.client');
    var whoName   = sr.querySelector('.who b');
    var whoSub    = sr.querySelector('.who span');
    var saveBtn   = sr.querySelector('.save');

    saveBtn.addEventListener('click', function () { openPanel(sr); });

    /** Reflect the record in hand and the open client into the header. */
    function refresh() {
      var C = root.GTContext;
      if (!C) return;
      var open = C.clients ? C.clients.current() : null;
      var filled = C.filledCount ? C.filledCount() : 0;
      var summary = C.summary ? C.summary() : '';

      if (open) {
        clientBox.classList.remove('empty');
        whoName.textContent = open.name;
        whoSub.textContent = summary || (filled + ' field' + (filled === 1 ? '' : 's') + ' in hand');
        saveBtn.textContent = 'Save';
      } else if (filled) {
        clientBox.classList.remove('empty');
        whoName.textContent = summary || 'Unsaved record';
        whoSub.textContent = filled + ' field' + (filled === 1 ? '' : 's') + ' · not saved to a client';
        saveBtn.textContent = 'Save client';
      } else {
        clientBox.classList.add('empty');
        whoName.textContent = 'No client loaded';
        whoSub.textContent = 'Open or save one';
        saveBtn.textContent = 'Clients';
      }
    }

    var api = {
      host: host, sr: sr, refresh: refresh, bound: false,

      /** Name the tool once the registry has identified this page.
       *  A no-op on the portal, where the chip renders without a header. */
      setTool: function (t, cat) {
        var el = sr.querySelector('.tool');
        if (!el) return;
        el.textContent = (t ? t.name : 'Clinical nutrition portal') + (cat ? ' · ' + cat : '');
      },

      /** Start reflecting the clinical record once it is available. */
      bind: function () {
        if (api.bound || !root.GTContext) return;
        api.bound = true;
        root.GTContext.onChange(refresh);
        if (root.GTContext.clients) root.GTContext.clients.onChange(refresh);
        refresh();
      }
    };

    api.bind();
    refresh();
    return api;
  }

  /* ---------- the save / open panel -------------------------------------- */

  function openPanel(sr) {
    var C = root.GTContext;
    if (!C || !C.clients) return;

    var veil = doc.createElement('div');
    veil.className = 'veil';
    veil.innerHTML =
      '<div class="panel" role="dialog" aria-modal="true" aria-label="Clients">' +
        '<h2>Clients</h2>' +
        '<div class="body">' +
          '<div class="row">' +
            '<input type="text" placeholder="Client name" autocomplete="off" spellcheck="false">' +
            '<button type="button" class="chip do-save">Save</button>' +
          '</div>' +
          '<p class="hint"></p>' +
          '<p class="err" hidden></p>' +
          '<p class="ok" hidden></p>' +
          '<div class="sep">Saved clients</div>' +
          '<ul></ul>' +
        '</div>' +
        '<div class="foot"><button type="button" class="close">Close</button></div>' +
      '</div>';
    sr.appendChild(veil);

    var input = veil.querySelector('input');
    var list  = veil.querySelector('ul');
    var errEl = veil.querySelector('.err');
    var okEl  = veil.querySelector('.ok');
    var hint  = veil.querySelector('.hint');

    var open = C.clients.current();
    var filled = C.filledCount ? C.filledCount() : 0;
    if (open) input.value = open.name;
    else {
      var nm = C.get && C.get().patient && C.get().patient.name;
      if (nm) input.value = nm;
    }
    hint.textContent = filled
      ? 'Saves the ' + filled + ' field' + (filled === 1 ? '' : 's') + ' currently in hand against this name.'
      : 'Nothing is in hand yet — fill a tool in first, or open a saved client below.';

    function say(el, msg) {
      [errEl, okEl].forEach(function (e) { e.hidden = true; });
      if (!msg) return;
      el.textContent = msg; el.hidden = false;
    }

    function close() { veil.remove(); }
    veil.querySelector('.close').addEventListener('click', close);
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    doc.addEventListener('keydown', function esc_(e) {
      if (e.key === 'Escape' && veil.isConnected) { close(); doc.removeEventListener('keydown', esc_); }
    });

    veil.querySelector('.do-save').addEventListener('click', async function () {
      var btn = this, label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        var saved = await C.clients.save(input.value);
        say(okEl, 'Saved “' + saved.name + '”.');
        await paint();
      } catch (e) {
        say(errEl, e.message || 'Could not save.');
      } finally { btn.disabled = false; btn.textContent = label; }
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); veil.querySelector('.do-save').click(); }
    });

    async function paint() {
      list.innerHTML = '<li class="empty-note" style="justify-content:center">Loading…</li>';
      var rows = await C.clients.list();
      var cur = C.clients.current();
      if (!rows.length) {
        list.innerHTML = '<li class="empty-note" style="justify-content:center">' +
          'No clients saved yet.</li>';
        return;
      }
      list.innerHTML = '';
      rows.forEach(function (r) {
        var li = doc.createElement('li');
        if (cur && cur.id === r.id) li.className = 'on';
        li.innerHTML =
          '<span class="nm"><b></b><span></span></span>' +
          '<button type="button" class="open">Open</button>' +
          '<button type="button" class="del" aria-label="Delete">Delete</button>';
        li.querySelector('b').textContent = r.name;
        li.querySelector('.nm span').textContent =
          (cur && cur.id === r.id ? 'Currently open · ' : '') + when(r.updated_at);

        li.querySelector('.open').addEventListener('click', async function () {
          try { await C.clients.open(r.id); say(okEl, 'Opened “' + r.name + '”.'); await paint(); }
          catch (e) { say(errEl, e.message || 'Could not open.'); }
        });
        li.querySelector('.del').addEventListener('click', async function () {
          if (!root.confirm('Delete the saved client “' + r.name + '”? The record in hand is not affected.')) return;
          try { await C.clients.remove(r.id); say(okEl, 'Deleted “' + r.name + '”.'); await paint(); }
          catch (e) { say(errEl, e.message || 'Could not delete.'); }
        });
        list.appendChild(li);
      });
    }

    paint();
    setTimeout(function () { input.focus(); input.select(); }, 30);
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), now = new Date();
    var mins = Math.round((now - d) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    if (mins < 60 * 24) return Math.round(mins / 60) + ' h ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ==================================================================== *
   * Footer                                                                *
   * ==================================================================== */

  var FOOTER_CSS = TOKENS + [
    ':host{display:block;margin-top:40px}',
    '.ft{padding:26px 20px 30px;background:var(--soft);border-top:1px solid var(--border);',
    'font:400 13px/1.6 var(--f);color:var(--ink2)}',
    '.in{max-width:1120px;margin:0 auto;display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}',
    '.col{min-width:0}',
    '.col.grow{flex:1 1 260px}',
    '.name{display:flex;align-items:center;gap:9px;margin-bottom:6px}',
    '.mk{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;',
    "background:var(--sage-600);color:#fff;font:700 11px/1 var(--fd)}",
    '.name b{font:600 14px var(--f);color:var(--ink);letter-spacing:-.01em}',
    '.blurb{font-size:12.5px;color:var(--ink3);max-width:44ch}',
    'h3{margin:0 0 7px;font:600 11px var(--f);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}',
    'a{color:var(--sage-700);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .14s}',
    'a:hover{border-bottom-color:var(--sage-400)}',
    'ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;font-size:12.5px}',
    '.rule{width:100%;height:1px;background:var(--border);margin:4px 0 0}',
    '.legal{width:100%;display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:space-between;',
    'font-size:11.5px;color:var(--ink3);padding-top:14px}',
    '@media (max-width:640px){.in{gap:18px}}'
  ].join('');

  function buildFooter(tool) {
    var host = doc.createElement('div');
    host.className = 'gt-chrome-footer';
    host.setAttribute('role', 'contentinfo');
    var sr = host.attachShadow({ mode: 'open' });

    var cat = categoryName(tool);
    var year = new Date().getFullYear();

    sr.innerHTML =
      '<style>' + FOOTER_CSS + '</style>' +
      '<footer class="ft"><div class="in">' +
        '<div class="col grow">' +
          '<div class="name"><span class="mk">GT</span><b>GT Nutri Life</b></div>' +
          '<div class="blurb">Clinical nutrition assessment, planning and menu tools for the ' +
            'practice — one record carried across every subsystem.</div>' +
        '</div>' +
        '<div class="col">' +
          '<h3>This tool</h3>' +
          '<ul>' +
            '<li>' + esc(tool ? tool.name : 'Portal') + '</li>' +
            (cat ? '<li>' + esc(cat) + '</li>' : '') +
          '</ul>' +
        '</div>' +
        '<div class="col">' +
          '<h3>Go to</h3>' +
          '<ul>' +
            '<li><a href="' + ROOT + '">All systems</a></li>' +
            '<li><a href="' + ROOT + 'apps/about-dietitian/index.html">About the dietitian</a></li>' +
          '</ul>' +
        '</div>' +
        '<div class="rule"></div>' +
        '<div class="legal">' +
          '<span>© ' + year + ' GT Nutri Life. For use by authorised practice accounts.</span>' +
          '<span>Clinical judgement remains with the practitioner.</span>' +
        '</div>' +
      '</div></footer>';

    return host;
  }

  /* ==================================================================== *
   * Theme                                                                 *
   * ==================================================================== */

  /*
   * Work out whether the page is currently dark.
   *
   * The bundle expresses it three ways and no single selector covers them: the
   * portal and About the Dietitian set html[data-theme], the two calendar
   * generators toggle a class on <body>, and a reader may simply have their OS
   * set to dark with no page toggle involved. An explicit choice on the page
   * beats the OS preference, in both directions.
   */
  function isDark() {
    var explicit = doc.documentElement.getAttribute('data-theme');
    if (explicit === 'dark') return true;
    if (explicit === 'light') return false;
    var b = doc.body;
    if (b && (b.classList.contains('dark-mode') || b.classList.contains('dark'))) return true;
    if (b && (b.classList.contains('light-mode') || b.classList.contains('light'))) return false;
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  var themed = [];      // shadow hosts that follow the page theme

  function applyTheme() {
    var mode = isDark() ? 'dark' : 'light';
    themed.forEach(function (host) {
      if (host.getAttribute('data-theme') !== mode) host.setAttribute('data-theme', mode);
    });
  }

  /** Register a host and keep it in step with the page from then on. */
  function followTheme(host) {
    themed.push(host);
    applyTheme();
  }

  /*
   * A shadow root cannot see the page's theme on its own — :host-context()
   * would do it but is Chromium-only, and prefers-color-scheme knows about the
   * OS rather than about a toggle the user just pressed. So the page is
   * watched instead, and the answer stamped on each host as data-theme.
   */
  function watchTheme() {
    var mo = new MutationObserver(applyTheme);
    mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    if (doc.body) mo.observe(doc.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
      else if (mq.addListener) mq.addListener(applyTheme);
    }
  }

  /* ---------- helpers ----------------------------------------------------- */

  /* ==================================================================== *
   * Automatic prefill                                                     *
   * ==================================================================== */

  var autofilled = false;

  /**
   * Fill this page from the record in hand, without being asked.
   *
   * The switcher has always offered a "Fill this page" button; this is the
   * same thing done for you, which is the whole point of carrying a record
   * between tools in the first place. Two things keep it safe:
   *
   *   - it only ever writes into empty fields (see GTContext.autofill), so
   *     nothing the clinician typed is replaced;
   *   - it waits for the app to finish its own setup. These pages set default
   *     values, restore drafts and wire listeners on DOMContentLoaded, and a
   *     prefill that lands first is simply overwritten a moment later.
   *
   * What it filled is announced rather than done silently, with an undo, since
   * a number appearing in a clinical field on its own deserves an explanation.
   */
  function autofillWhenReady(tool, header) {
    if (autofilled || !tool || !root.GTContext) return;
    var C = root.GTContext;
    if (!C.adapters || !C.adapters[tool.id]) return;
    if (!C.filledCount || !C.filledCount()) return;
    autofilled = true;

    // One frame after load, plus a beat for the app's own initialisation.
    setTimeout(function () {
      var res = C.autofill(tool.id);
      if (!res.filled) return;
      announceFill(res, header);
    }, 450);
  }

  function announceFill(res, header) {
    var C = root.GTContext;
    var open = C.clients ? C.clients.current() : null;
    var host = doc.createElement('div');
    host.className = 'gt-chrome-toast';
    var sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML =
      '<style>' + TOKENS + [
        ':host{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483400}',
        '.t{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:14px;',
        'background:var(--card);border:1px solid var(--sage-200);box-shadow:0 14px 40px rgba(34,50,42,.16);',
        'font:400 13px/1.4 var(--f);color:var(--ink);animation:in .3s var(--ease)}',
        '@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '.dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--sage-500)}',
        'b{font-weight:600}',
        'button{border:0;background:none;font:600 12.5px var(--f);cursor:pointer;',
        'padding:5px 9px;border-radius:8px;color:var(--sage-700)}',
        'button:hover{background:var(--sage-50)}',
        '.x{color:var(--ink3)}',
        '@media (prefers-reduced-motion:reduce){.t{animation:none}}'
      ].join('') + '</style>' +
      '<div class="t" role="status">' +
        '<span class="dot"></span>' +
        '<span><b>' + res.filled + ' field' + (res.filled === 1 ? '' : 's') + '</b> filled from ' +
          esc(open ? open.name : 'the record in hand') + '</span>' +
        '<button type="button" class="undo">Undo</button>' +
        '<button type="button" class="x" aria-label="Dismiss">Dismiss</button>' +
      '</div>';

    doc.body.appendChild(host);
    followTheme(host);

    var close = function () {
      themed = themed.filter(function (h) { return h !== host; });
      host.remove();
    };
    sr.querySelector('.x').addEventListener('click', close);
    sr.querySelector('.undo').addEventListener('click', function () {
      res.elements.forEach(function (el) {
        try {
          el.classList.remove('gt-prefilled');
          el.value = '';
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {}
      });
      close();
    });
    setTimeout(function () { if (host.isConnected) close(); }, 9000);
  }

  /**
   * Move viewport-pinned elements clear of the header.
   *
   * These pages between them pin a dark-mode toggle, a print button and a
   * couple of floating panels to `top: 1rem`, which lands underneath the
   * header. There is no selector for "fixed and near the top", so this reads
   * the computed style of the elements that could collide and offsets only
   * those that actually do. Full-viewport overlays (modals, loading veils)
   * are left alone — they are meant to cover everything, header included.
   */
  function nudgeFixed(headerHost) {
    var h = headerHost.getBoundingClientRect().height;
    if (!h) return;

    Array.prototype.forEach.call(doc.body.querySelectorAll('*'), function (el) {
      if (el === headerHost || headerHost.contains(el)) return;
      if (el.dataset && el.dataset.gtNudged) return;

      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed') return;

      var top = parseFloat(cs.top);
      if (!isFinite(top) || top >= h) return;

      // An overlay that also stretches to the bottom is covering the page on
      // purpose; shifting it down would leave a gap at the foot instead.
      var bottom = parseFloat(cs.bottom);
      if (isFinite(bottom) && bottom <= 0 && el.getBoundingClientRect().height > innerHeight * 0.8) return;

      el.style.top = (top + h) + 'px';
      if (el.dataset) el.dataset.gtNudged = '1';
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------- boot -------------------------------------------------------- */

  function mount() {
    if (doc.querySelector('.gt-chrome-header') || doc.querySelector('.gt-chrome-client')) return;
    var body = doc.body;
    if (!body) return;

    doc.documentElement.classList.add('gt-themed');

    var tool = currentTool();

    /*
     * A page that already has a header and footter of its own — the portal —
     * marks where the client control should go and gets only that. Stacking a
     * second masthead on the one page that is already the front door would be
     * consistency for its own sake, which is not the point of any of this.
     */
    var slot = doc.querySelector('[data-gt-client-slot]');
    if (slot) {
      var control = buildClientControl();
      slot.appendChild(control.host);
      followTheme(control.host);
      watchTheme();
      root.GTChrome = { header: control, refresh: control.refresh };
      return;
    }

    var header = buildHeader(tool);
    body.insertBefore(header.host, body.firstChild);
    var footer = buildFooter(tool);
    body.appendChild(footer);
    followTheme(header.host);
    followTheme(footer);
    watchTheme();

    root.GTChrome = { header: header, refresh: header.refresh, nudge: nudgeFixed };

    // Page furniture pinned to the top of the viewport would sit on top of the
    // header. Measure rather than enumerate: several pages have such a button
    // and they share no class name between them.
    nudgeFixed(header.host);

    autofillWhenReady(tool, header);

    /*
     * The registry and the clinical record are loaded by the switcher, which
     * is injected after this script and fetches them asynchronously. Rather
     * than duplicate its loader, render now with what is available and fill
     * the rest in when it arrives — the header is useful either way, and a
     * page where those never load simply keeps a header without a tool name.
     */
    if (tool && root.GTContext) return;
    var tries = 0;
    var t = setInterval(function () {
      var haveReg = !tool && root.GTRegistry;
      var haveCtx = root.GTContext;
      if (haveReg) {
        var found = currentTool();
        if (found) {
          tool = found;
          var fresh = buildFooter(tool);
          footer.replaceWith(fresh);
          themed = themed.filter(function (h) { return h !== footer; });
          footer = fresh;
          followTheme(footer);
          header.setTool(tool, categoryName(tool));
        }
      }
      if (haveCtx && !header.bound) {
        header.bind();
        autofillWhenReady(tool, header);
      }
      if ((tool || tries > 40) && (header.bound || tries > 40)) clearInterval(t);
      if (++tries > 200) clearInterval(t);
    }, 50);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
  else mount();
})(typeof window !== 'undefined' ? window : globalThis);
