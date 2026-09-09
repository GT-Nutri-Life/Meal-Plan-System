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

/*
 * A tiny stand-in for PostgREST.
 *
 * The original stub held one row per table, which was all the shared clinical
 * record ever needed. The client library needs more than that — it lists,
 * filters, orders and updates many rows — so this is a small in-memory table
 * with just the operators that assets/gt-context.js actually calls.
 *
 * window.__GT_DB__[table] still exposes the most recently written row, because
 * the existing suites assert against it directly.
 */
window.__GT_ROWS__ = window.__GT_ROWS__ || {};

function query(table) {
  var rows = (window.__GT_ROWS__[table] = window.__GT_ROWS__[table] || []);
  var filters = [];
  var pending = null;         // the row(s) an upsert/update just produced
  var orderBy = null, limit = null;

  function matches(row) {
    return filters.every(function (f) {
      var v = row[f.col];
      if (f.op === 'eq') return String(v) === String(f.val);
      if (f.op === 'ilike') return String(v || '').toLowerCase() === String(f.val || '').toLowerCase();
      return true;
    });
  }

  function result() {
    if (pending) return { data: pending, error: null };
    var out = rows.filter(matches);
    if (orderBy) {
      out = out.slice().sort(function (a, b) {
        var x = a[orderBy.field], y = b[orderBy.field];
        return orderBy.asc ? (x > y ? 1 : x < y ? -1 : 0) : (x < y ? 1 : x > y ? -1 : 0);
      });
    }
    if (limit !== null) out = out.slice(0, limit);
    return { data: out, error: null };
  }

  var api = {
    upsert: function (row, opts) {
      var key = (opts && opts.onConflict) ? String(opts.onConflict).split(',') : ['id'];
      var existing = rows.filter(function (r) {
        return key.every(function (k) {
          return String(r[k] || '').toLowerCase() === String(row[k] || '').toLowerCase();
        });
      })[0];
      var saved;
      if (existing) {
        Object.keys(row).forEach(function (k) { existing[k] = row[k]; });
        existing.updated_at = new Date().toISOString();
        saved = existing;
      } else {
        saved = Object.assign({ id: 'row-' + (rows.length + 1), archived: false,
                                updated_at: new Date().toISOString() }, row);
        rows.push(saved);
      }
      window.__GT_DB__[table] = saved;
      pending = saved;
      return api;
    },
    update: function (patch) {
      pending = null;
      api._patch = patch;
      return api;
    },
    delete: function () { api._delete = true; return api; },
    select: function () { return api; },
    eq: function (col, val) {
      filters.push({ op: 'eq', col: col, val: val });
      if (api._delete) {
        for (var i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1);
        if (window.__GT_DB__[table] && !rows.length) delete window.__GT_DB__[table];
      } else if (api._patch) {
        rows.filter(matches).forEach(function (r) {
          Object.keys(api._patch).forEach(function (k) { r[k] = api._patch[k]; });
          r.updated_at = new Date().toISOString();
          window.__GT_DB__[table] = r;
          pending = r;
        });
      }
      return api;
    },
    ilike: function (col, val) { filters.push({ op: 'ilike', col: col, val: val }); return api; },
    order: function (field, opts) {
      orderBy = { field: field, asc: !!(opts && opts.ascending) };
      return api;
    },
    limit: function (n) { limit = n; return api; },
    maybeSingle: async function () {
      var r = result();
      var d = Array.isArray(r.data) ? (r.data[0] || null) : r.data;
      return { data: d, error: null };
    },
    // Awaiting the builder itself resolves the query, the way PostgREST does.
    then: function (resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
  };
  return api;
}

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

      from: function (table) { return query(table); }
    };
  }
};
