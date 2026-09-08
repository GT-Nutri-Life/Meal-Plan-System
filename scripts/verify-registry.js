#!/usr/bin/env node
/*
 * Registry integrity check.
 *
 * Catches the failure mode this portal is most exposed to: a registry entry
 * and the files on disk drifting apart, which would leave a dead card on the
 * hub and a dead row in the switcher. Run by CI before every deploy.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

global.window = {};
require(path.join(ROOT, 'assets', 'registry.js'));
const REG = global.window.GTRegistry;

const errors = [];
const seen = new Set();

if (!REG || !Array.isArray(REG.tools) || !REG.tools.length) {
  console.error('FAIL: registry did not load, or contains no tools.');
  process.exit(1);
}

for (const t of REG.tools) {
  const where = `tool "${t.id || '(no id)'}"`;

  for (const field of ['id', 'name', 'system', 'source', 'category', 'path', 'icon', 'summary', 'detail']) {
    if (!t[field]) errors.push(`${where}: missing required field "${field}"`);
  }

  if (seen.has(t.id)) errors.push(`${where}: duplicate id`);
  seen.add(t.id);

  if (!REG.categories.some((c) => c.id === t.category)) {
    errors.push(`${where}: unknown category "${t.category}"`);
  }
  if (!REG.sources[t.source]) {
    errors.push(`${where}: unknown source "${t.source}"`);
  }
  if (!REG.icons[t.icon]) {
    errors.push(`${where}: unknown icon "${t.icon}"`);
  }

  const file = path.join(ROOT, t.path);
  if (!fs.existsSync(file)) {
    errors.push(`${where}: path does not exist on disk -> ${t.path}`);
  } else if (!fs.readFileSync(file, 'utf8').includes('gt-switcher.js')) {
    errors.push(`${where}: ${t.path} is missing the switcher (run scripts/inject-nav.sh)`);
  }
}

// Every bundled page should be reachable from the registry, or it is orphaned.
const bundled = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) bundled.push(path.relative(ROOT, p));
  }
})(path.join(ROOT, 'apps'));

const registered = new Set(REG.tools.map((t) => t.path));
for (const f of bundled) {
  if (!registered.has(f)) errors.push(`orphaned page (bundled but not in the registry): ${f}`);
}

if (errors.length) {
  console.error('Registry check FAILED:\n' + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}

console.log(`Registry OK — ${REG.tools.length} tools, ${bundled.length} bundled pages, ` +
            `${Object.keys(REG.sources).length} source systems.`);
