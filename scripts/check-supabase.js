#!/usr/bin/env node
/*
 * Live connectivity check against the practice's Supabase project.
 *
 *   node scripts/check-supabase.js        (or: npm run check:supabase)
 *
 * The browser suites in tests/ deliberately stub Supabase so CI never depends
 * on a third-party service being up. That leaves one question they cannot
 * answer: is the project the deployed site actually points at reachable, and
 * does the publishable key it ships still work? This script answers that, and
 * is kept out of `npm test` for the same reason the stub exists.
 *
 * The URL and key are read out of assets/gt-auth.js rather than repeated here,
 * so the check can never drift from what the site ships.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const AUTH_JS = path.join(__dirname, '..', 'assets', 'gt-auth.js');

function readConfig() {
  const src = fs.readFileSync(AUTH_JS, 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp("var\\s+" + name + "\\s*=\\s*'([^']+)'"));
    if (!m) throw new Error(`could not find ${name} in assets/gt-auth.js`);
    return m[1];
  };
  return { url: grab('SUPABASE_URL'), key: grab('SUPABASE_KEY'), lib: grab('SUPABASE_LIB') };
}

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function probe(name, url, options, judge) {
  const started = Date.now();
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    record(name, false, `unreachable: ${err.message}`);
    return null;
  }
  const ms = Date.now() - started;
  let body = '';
  try { body = await res.text(); } catch (e) {}
  const verdict = judge(res, body);
  record(name, verdict.ok, `HTTP ${res.status} in ${ms}ms${verdict.detail ? ' — ' + verdict.detail : ''}`);
  return { res, body };
}

(async () => {
  const cfg = readConfig();
  const host = new URL(cfg.url).host;
  console.log(`\nSupabase connectivity — ${host}`);
  console.log(`key: ${cfg.key.slice(0, 22)}…  (publishable; RLS is what protects the data)\n`);

  const apikey = { apikey: cfg.key };
  const asAnon = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };

  // GoTrue is up. /health needs no key, so a failure here is the service or
  // the network, never the credentials.
  const health = await probe('auth service reachable', `${cfg.url}/auth/v1/health`, {},
    (res) => ({ ok: res.ok }));

  // If nothing reached the project at all, every check below would be
  // reporting on the network rather than on Supabase. Say so once and stop,
  // rather than printing six more failures that all mean the same thing.
  if (!health || !health.res.ok) {
    console.log('\nCould not reach the project. Everything below depends on that,');
    console.log('so nothing further was checked.\n');
    process.exit(1);
  }

  // The publishable key the site ships is accepted by GoTrue. A 401 here is
  // the signature of a rotated or disabled key.
  await probe('publishable key accepted by auth', `${cfg.url}/auth/v1/settings`, { headers: apikey },
    (res) => ({ ok: res.ok, detail: res.status === 401 ? 'key rejected — has it been rotated?' : '' }));

  // PostgREST is up and accepts the same key.
  await probe('rest api reachable', `${cfg.url}/rest/v1/`, { headers: asAnon },
    (res) => ({ ok: res.ok }));

  /*
   * The tables the client code reads must exist.
   *
   * Only a 200 counts. It is tempting to treat 401/403 as "RLS refused us,
   * so the table must be there" — but nothing about those statuses proves the
   * request ever reached PostgREST: a proxy in the way returns exactly the
   * same thing, and this check then reports healthy tables on a machine that
   * cannot see Supabase at all. RLS does not refuse a select in any case; it
   * filters the rows and returns an empty array, which is the 200 below.
   */
  for (const table of ['meal_plan_templates', 'user_progress', 'gt_clinical_records', 'gt_clients']) {
    await probe(`table ${table} present`,
      `${cfg.url}/rest/v1/${table}?select=*&limit=1`, { headers: asAnon },
      (res, body) => {
        if (res.status === 404 || /does not exist/i.test(body)) return { ok: false, detail: 'table missing' };
        if (res.status === 401 || res.status === 403) {
          return { ok: false, detail: 'refused before PostgREST answered — key or network, not RLS' };
        }
        if (res.ok) {
          let rows = [];
          try { rows = JSON.parse(body); } catch (e) {}
          return { ok: true, detail: rows.length
            ? `${rows.length} row readable anonymously — check this table's RLS`
            : 'reachable, no rows exposed to anon' };
        }
        return { ok: false, detail: body.slice(0, 120) };
      });
  }

  // The gate loads the client library from a CDN at runtime; if that is
  // blocked the sign-in overlay never gets a client to talk to.
  await probe('supabase-js CDN reachable', cfg.lib, {}, (res) => ({ ok: res.ok }));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed\n`);
  process.exit(failed.length ? 1 : 0);
})().catch((err) => {
  console.error(`\ncheck aborted: ${err.message}\n`);
  process.exit(2);
});
