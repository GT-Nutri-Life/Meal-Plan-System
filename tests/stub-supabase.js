/*
 * A stand-in for @supabase/supabase-js, injected into the page before any of
 * its own scripts run.
 *
 * The suites need to exercise the sign-in gate, the clinical record and the
 * cloud mirror without touching the practice's live Supabase project — and
 * without CI depending on a third-party service being up. This reproduces the
 * slice of the API that assets/gt-auth.js and assets/gt-context.js actually
 * use, including the detail that signInWithPassword reports failure by
 * *returning* an error rather than throwing.
 *
 * Set window.__SIGNED_IN__ before this loads to choose the starting state.
 */
window.__GT_DB__ = window.__GT_DB__ || {};
window.__SIGNED_IN__ = window.__SIGNED_IN__ || false;

window.GT_TEST_CREDENTIALS = {
  allowed:  { email: 'gayathrithakshila1997@gmail.com', password: 'correct-horse' },
  // A real Supabase account that is not on the app's allow-list.
  offList:  { email: 'stranger@example.com',            password: 'correct-horse' }
};

window.supabase = {
  createClient: function () {
    var cbs = [];
    var user = { id: 'u-test-0001', email: window.GT_TEST_CREDENTIALS.allowed.email };

    function session() { return window.__SIGNED_IN__ ? { user: user } : null; }
    function fire(evt) { cbs.forEach(function (f) { try { f(evt, session()); } catch (e) {} }); }

    return {
      auth: {
        getSession: async function () { return { data: { session: session() } }; },
        getUser: async function () {
          return { data: { user: window.__SIGNED_IN__ ? user : null } };
        },
        onAuthStateChange: function (cb) { cbs.push(cb); return { data: { subscription: {} } }; },

        signInWithPassword: async function (creds) {
          var C = window.GT_TEST_CREDENTIALS;
          if (creds.email === C.offList.email && creds.password === C.offList.password) {
            user = { id: 'u-stranger', email: C.offList.email };
            window.__SIGNED_IN__ = true;
            fire('SIGNED_IN');
            return { data: { user: user }, error: null };
          }
          if (creds.email !== C.allowed.email || creds.password !== C.allowed.password) {
            return { data: {}, error: { code: 'invalid_credentials', status: 400 } };
          }
          user = { id: 'u-test-0001', email: C.allowed.email };
          window.__SIGNED_IN__ = true;
          fire('SIGNED_IN');
          return { data: { user: user }, error: null };
        },

        signOut: async function () {
          window.__SIGNED_IN__ = false;
          fire('SIGNED_OUT');
          return { error: null };
        },

        updateUser: async function () { return { data: {}, error: null }; }
      },

      from: function (table) {
        return {
          upsert: async function (row) { window.__GT_DB__[table] = row; return { error: null }; },
          select: function () {
            return { eq: function () { return { maybeSingle: async function () {
              return { data: window.__GT_DB__[table] || null, error: null };
            } }; } };
          },
          delete: function () {
            return { eq: async function () { delete window.__GT_DB__[table]; return { error: null }; } };
          }
        };
      }
    };
  }
};
