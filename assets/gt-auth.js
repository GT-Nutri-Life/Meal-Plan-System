/*!
 * GT Meal Plan System — shared sign-in
 * ------------------------------------------------------------------
 * One login across the whole portal, using the credentials that already exist:
 * the same Supabase project, the same publishable key and the same allow-list
 * that Meal Plan Generator has always used. Because every subsystem is now
 * served from a single origin, the Supabase session in localStorage is shared,
 * so signing in once reaches every tool — including Meal Plan Generator's own
 * built-in login, which finds the session already present and lets the user
 * straight through.
 *
 * Scope of this gate, stated plainly: it controls access to the *data* — the
 * cloud templates, saved progress and clinical records, all of which are
 * protected server-side by Supabase row-level security tied to auth.uid().
 * It is not a secret-keeping mechanism for the page itself. These are static
 * HTML files; anyone can read their source or the calculator logic inside
 * them whether or not this overlay is showing. Do not treat the overlay as
 * protection for anything embedded in the markup.
 *
 * The publishable key below is designed to be public — that is what
 * "publishable" means in Supabase's key model. It grants nothing on its own;
 * every table is gated by RLS policies.
 */
(function (root) {
  'use strict';

  if (root.GTAuth) return;

  var SUPABASE_URL = 'https://oadssynldelrkinhreza.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_Y1jiS-zw5beFYQj1vWQixw_IHJUGjRN';
  var SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  // The same two accounts Meal Plan Generator has always allowed.
  var ALLOWED_EMAILS = ['inbox.ashen@gmail.com', 'gayathrithakshila1997@gmail.com'];
  var OWNER_EMAIL    = 'inbox.ashen@gmail.com';

  var IDLE_LIMIT_MS = 30 * 60 * 1000;   // sign out after 30 minutes idle
  var IDLE_WARN_MS  = 60 * 1000;        // warn 60 seconds before

  /* ---------- state ----------------------------------------------------- */

  var client = null;
  var currentUser = null;
  var listeners = [];
  var gate = null;             // shadow-root UI, built lazily
  var gated = false;           // does this page require sign-in?
  var idleTimer = null, idleWarnOpen = false, lastReset = 0;

  /* ---------- supabase client ------------------------------------------- */

  function loadLib() {
    return new Promise(function (resolve, reject) {
      if (root.supabase && root.supabase.createClient) return resolve();
      var existing = document.querySelector('script[src="' + SUPABASE_LIB + '"]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () { reject(new Error('lib')); });
        return;
      }
      var s = document.createElement('script');
      s.src = SUPABASE_LIB;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('lib')); };
      document.head.appendChild(s);
    });
  }

  function getClient() {
    if (client) return client;
    if (!root.supabase || !root.supabase.createClient) return null;
    client = root.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return client;
  }

  /* ---------- error wording (mirrors the Meal Plan Generator's) --------- */

  function unreachable() {
    return navigator.onLine === false
      ? 'You appear to be offline. Reconnect and try again.'
      : 'The sign-in service is not responding. It may be temporarily unavailable — please try again in a few minutes.';
  }

  function authErrorMessage(error) {
    var code = (error && (error.code || error.error_code)) || '';
    var status = Number(error && error.status);
    if ((error && error.name === 'AuthRetryableFetchError') || status === 0 || status >= 500) return unreachable();
    switch (code) {
      case 'invalid_credentials':
      case 'invalid_grant':            return 'Incorrect email or password.';
      case 'email_not_confirmed':      return 'Confirm your email address first — check your inbox for the confirmation link.';
      case 'user_banned':              return 'This account has been suspended. Contact the administrator.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit': return 'Too many sign-in attempts. Wait a minute and try again.';
      case 'validation_failed':        return 'Enter a valid email address and password.';
    }
    if (status === 429) return 'Too many sign-in attempts. Wait a minute and try again.';
    if (status === 400 || status === 401) return 'Incorrect email or password.';
    return (error && error.message) || 'Could not sign in. Please try again.';
  }

  /* ---------- idle auto-logout ------------------------------------------ */

  function clearIdle() { if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; } }

  function startIdle() {
    clearIdle();
    lastReset = Date.now();
    idleTimer = setTimeout(warnIdle, Math.max(0, IDLE_LIMIT_MS - IDLE_WARN_MS));
  }

  function resetIdle() {
    if (idleWarnOpen || !currentUser) return;
    if (Date.now() - lastReset < 5000) return;   // throttle: mousemove fires constantly
    startIdle();
  }

  function warnIdle() {
    if (idleWarnOpen || !currentUser || !gate) return;
    idleWarnOpen = true;
    gate.showIdleWarning(IDLE_WARN_MS, function (stay) {
      idleWarnOpen = false;
      if (stay) startIdle();
      else signOut('You were signed out due to inactivity.');
    });
  }

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, resetIdle, { passive: true });
  });

  /* ---------- session handling ------------------------------------------ */

  function handleSession(session) {
    var email = session && session.user && session.user.email
      ? session.user.email.toLowerCase() : null;

    if (session && email && ALLOWED_EMAILS.indexOf(email) !== -1) {
      var first = !currentUser || currentUser.email !== email;
      currentUser = { email: email, id: session.user.id, role: email === OWNER_EMAIL ? 'Owner' : 'Admin' };
      if (gate) gate.hide();
      if (first) startIdle();
      notify();
      return;
    }

    if (session && email) {
      // Signed in with Supabase but not on this system's allow-list. Drop the
      // session so the token cannot linger, and keep the reason on screen —
      // signOut triggers another handleSession that would otherwise clear it.
      var msg = 'This account is not authorized to use this system.';
      currentUser = null;
      if (gate) { gate.show(); gate.error(msg); }
      notify();
      setTimeout(function () {
        var c = getClient();
        if (!c) return;
        Promise.resolve(c.auth.signOut()).catch(function () {}).then(function () {
          if (gate) gate.error(msg);
        });
      }, 0);
      return;
    }

    currentUser = null;
    clearIdle();
    if (gated && gate) gate.show();
    notify();
  }

  function notify() {
    listeners.forEach(function (fn) { try { fn(currentUser); } catch (e) {} });
  }

  async function signIn(email, password) {
    var c = getClient();
    if (!c) throw new Error(unreachable());
    var res = await c.auth.signInWithPassword({ email: email, password: password });
    // signInWithPassword reports failures by returning an error, not throwing.
    if (res.error) throw new Error(authErrorMessage(res.error));
    return res.data;
  }

  async function signOut(reason) {
    clearIdle();
    var c = getClient();
    try { if (c) await c.auth.signOut(); } catch (e) {}
    currentUser = null;
    notify();
    if (gated && gate) { gate.show(); if (reason) gate.error(reason); }
  }

  async function changePassword(pw) {
    var c = getClient();
    if (!c) throw new Error(unreachable());
    var res = await c.auth.updateUser({ password: pw });
    if (res.error) throw new Error(res.error.message || 'Could not change password.');
  }

  /* ==================================================================== *
   * The overlay. Shadow DOM again, for the same reason as the switcher:   *
   * it must look and behave identically inside eleven unrelated pages.    *
   * ==================================================================== */

  function buildGate() {
    var host = document.createElement('div');
    host.id = 'gt-auth-root';
    host.style.cssText = 'all:initial';
    var sr = host.attachShadow({ mode: 'open' });

    sr.innerHTML =
      '<style>' + CSS + '</style>' +
      '<div class="veil" hidden>' +
        '<form class="card" novalidate>' +
          '<div class="mark">GT</div>' +
          '<h1>GT Meal Plan System</h1>' +
          '<p class="sub">Sign in to reach the clinical tools.</p>' +
          '<p class="err" hidden></p>' +
          '<label class="fld"><span>Email</span>' +
            '<input type="email" name="email" autocomplete="username" required></label>' +
          '<label class="fld"><span>Password</span>' +
            '<span class="pw"><input type="password" name="password" autocomplete="current-password" required>' +
            '<button type="button" class="peek" aria-label="Show password">Show</button></span></label>' +
          '<button type="submit" class="go">Sign in</button>' +
          '<button type="button" class="link retry" hidden>Try again</button>' +
          '<p class="foot">Access is limited to authorised practice accounts.</p>' +
        '</form>' +
      '</div>' +
      '<div class="veil idle" hidden>' +
        '<div class="card">' +
          '<h1>Are you still there?</h1>' +
          '<p class="sub">You will be signed out due to inactivity.</p>' +
          '<div class="bar"><i></i></div>' +
          '<button type="button" class="go stay">Stay signed in</button>' +
          '<button type="button" class="link out">Sign out now</button>' +
        '</div>' +
      '</div>';

    var veil   = sr.querySelector('.veil');
    var form   = sr.querySelector('form');
    var errEl  = sr.querySelector('.err');
    var emailI = sr.querySelector('input[name=email]');
    var pwI    = sr.querySelector('input[name=password]');
    var peek   = sr.querySelector('.peek');
    var submit = sr.querySelector('.go');
    var idle   = sr.querySelector('.veil.idle');
    var bar    = sr.querySelector('.bar i');

    peek.addEventListener('click', function () {
      var showing = pwI.type === 'text';
      pwI.type = showing ? 'password' : 'text';
      peek.textContent = showing ? 'Show' : 'Hide';
      pwI.focus();
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = emailI.value.trim().toLowerCase(), pw = pwI.value;
      api.error('');
      if (!email || !pw) { api.error('Enter your email and password.'); return; }
      var label = submit.textContent;
      submit.disabled = true; submit.textContent = 'Signing in…';
      try {
        await signIn(email, pw);
        // Success is handled by onAuthStateChange -> handleSession.
      } catch (err) {
        api.error(err.message || 'Could not sign in.');
      } finally {
        submit.disabled = false; submit.textContent = label;
      }
    });

    sr.querySelector('.retry').addEventListener('click', function () { location.reload(); });

    sr.querySelector('.stay').addEventListener('click', function () { api._idleDone(true); });
    sr.querySelector('.out').addEventListener('click',  function () { api._idleDone(false); });

    // Keep focus inside the sign-in card while it is up.
    document.addEventListener('focusin', function () {
      if (veil.hidden || sr.activeElement) return;
      emailI.focus();
    });

    var api = {
      root: sr,
      show: function () {
        if (!veil.hidden) return;
        veil.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        setTimeout(function () { emailI.focus(); }, 30);
      },
      hide: function () {
        veil.hidden = true;
        idle.hidden = true;
        document.documentElement.style.overflow = '';
        pwI.value = '';
        api.error('');
      },
      /**
       * @param {string} msg      message to show, '' to clear
       * @param {boolean} offline true when the failure is the service being
       *                          unreachable rather than a rejected password,
       *                          in which case retrying is the only useful action
       */
      error: function (msg, offline) {
        errEl.textContent = msg || '';
        errEl.hidden = !msg;
        var retry = sr.querySelector('.retry');
        var form_ = sr.querySelector('.go');
        retry.hidden = !offline;
        form_.hidden = !!offline;
      },
      showIdleWarning: function (ms, done) {
        api._idleDone = function (stay) {
          idle.hidden = true;
          api._idleDone = function () {};
          done(stay);
        };
        idle.hidden = false;
        bar.style.transition = 'none';
        bar.style.width = '100%';
        requestAnimationFrame(function () {
          bar.style.transition = 'width ' + ms + 'ms linear';
          bar.style.width = '0%';
        });
        setTimeout(function () { if (!idle.hidden) api._idleDone(false); }, ms);
      },
      _idleDone: function () {}
    };

    (document.body || document.documentElement).appendChild(host);
    return api;
  }

  /* ---------- boot ------------------------------------------------------- */

  /**
   * Meal Plan Generator ships its own sign-in overlay against the same
   * Supabase project. Two gates on one page would mean two password prompts,
   * so this one steps aside there and lets the app's own gate run; the shared
   * session means a user who signed in on the portal is already through it.
   */
  function hostHasOwnGate() {
    return !!document.getElementById('authOverlay');
  }

  async function init(options) {
    gated = !!(options && options.gated) && !hostHasOwnGate();

    try {
      await loadLib();
    } catch (e) {
      if (gated) {
        gate = gate || buildGate();
        gate.show();
        gate.error(unreachable(), true);
      }
      return;
    }

    var c = getClient();
    if (!c) return;

    if (gated) gate = buildGate();

    try {
      var got = await c.auth.getSession();
      handleSession(got && got.data ? got.data.session : null);
    } catch (e) {
      if (gated && gate) { gate.show(); gate.error(unreachable(), true); }
    }

    c.auth.onAuthStateChange(function (_evt, session) { handleSession(session); });
  }

  /* ---------- public API -------------------------------------------------- */

  root.GTAuth = {
    init: init,
    client: getClient,
    user: function () { return currentUser; },
    isSignedIn: function () { return !!currentUser; },
    onChange: function (fn) { listeners.push(fn); if (currentUser) { try { fn(currentUser); } catch (e) {} } },
    signOut: signOut,
    changePassword: changePassword,
    allowedEmails: ALLOWED_EMAILS.slice()
  };

  /* ---------- styles ------------------------------------------------------ */

  var CSS = [
    ':host,*{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    ':host{--ac:#2D7A5F;--ac2:#3A9E7A;--bg:#FFFFFF;--bg2:#F4F7F5;--tx:#1B2A22;--tx2:#5F8474;',
    '--bdr:rgba(45,122,95,.16);--z:2147483600;',
    "--f:'Outfit',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}",
    '@media (prefers-color-scheme:dark){:host{--bg:#16261E;--bg2:#1F332A;--tx:#E8F0EB;--tx2:#9DBEAD;',
    '--ac:#4AE09A;--ac2:#3CC48A;--bdr:rgba(74,224,154,.2)}}',

    '.veil{position:fixed;inset:0;z-index:var(--z);display:flex;align-items:center;justify-content:center;',
    'padding:20px;background:rgba(10,20,15,.72);backdrop-filter:blur(10px) saturate(140%);',
    '-webkit-backdrop-filter:blur(10px) saturate(140%);font:400 14px/1.6 var(--f)}',
    '.veil.idle{z-index:calc(var(--z) + 1)}',

    '.card{width:100%;max-width:390px;display:flex;flex-direction:column;padding:30px 28px 24px;',
    'background:var(--bg);color:var(--tx);border:1px solid var(--bdr);border-radius:20px;',
    'box-shadow:0 30px 80px rgba(0,0,0,.4)}',

    '.mark{align-self:flex-start;display:grid;place-items:center;width:42px;height:42px;border-radius:12px;',
    "background:var(--ac);color:#fff;font:700 16px/1 'Playfair Display',Georgia,serif;letter-spacing:-.02em}",
    '.card h1{margin:16px 0 0;font-size:20px;font-weight:600;letter-spacing:-.015em}',
    '.sub{margin:5px 0 0;font-size:13.5px;color:var(--tx2)}',

    '.err{margin:15px 0 0;padding:10px 13px;border-radius:10px;font-size:13px;',
    'background:rgba(200,40,40,.10);border:1px solid rgba(200,40,40,.28);color:#C0392B}',
    '@media (prefers-color-scheme:dark){.err{background:rgba(255,110,110,.12);border-color:rgba(255,110,110,.3);color:#FF9B9B}}',

    '.fld{display:flex;flex-direction:column;gap:6px;margin-top:16px}',
    '.fld>span{font-size:12.5px;font-weight:600;color:var(--tx2)}',
    '.fld input{width:100%;padding:11px 13px;border:1px solid var(--bdr);border-radius:10px;',
    'background:var(--bg2);color:var(--tx);font:400 14.5px var(--f);outline:none}',
    '.fld input:focus{border-color:var(--ac);box-shadow:0 0 0 3px rgba(45,122,95,.14)}',
    '.pw{position:relative;display:block}',
    '.pw input{padding-right:62px}',
    '.peek{position:absolute;right:6px;top:50%;transform:translateY(-50%);padding:6px 10px;border:0;',
    'border-radius:7px;background:transparent;color:var(--ac);font:600 12px var(--f);cursor:pointer}',
    '.peek:hover{background:var(--bg2)}',

    '.go{margin-top:20px;padding:12px 18px;border:0;border-radius:10px;background:var(--ac);color:#fff;',
    'font:600 14.5px var(--f);cursor:pointer;transition:background .18s}',
    '.go:hover:not(:disabled){background:var(--ac2)}',
    '.go:disabled{opacity:.65;cursor:default}',
    '.link{margin-top:9px;padding:8px;border:0;background:none;color:var(--tx2);',
    'font:500 13px var(--f);cursor:pointer;text-decoration:underline}',
    '.link:hover{color:var(--tx)}',
    '.foot{margin:16px 0 0;font-size:11.5px;color:var(--tx2);text-align:center}',

    '.bar{margin-top:18px;height:4px;border-radius:9999px;background:var(--bg2);overflow:hidden}',
    '.bar i{display:block;height:100%;width:100%;background:var(--ac)}',

    'button:focus-visible,input:focus-visible{outline:2px solid var(--ac);outline-offset:2px}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important}}'
  ].join('');
})(typeof window !== 'undefined' ? window : globalThis);
