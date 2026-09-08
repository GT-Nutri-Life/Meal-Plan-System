/*
 * Test harness: static servers, the browser, and the assertion helper.
 *
 * Two servers run:
 *   - the portal itself, straight off the repo
 *   - a "control" server that serves each bundled page with the injected
 *     <script> tag stripped back out, i.e. the upstream file as it was
 *
 * Deriving the control locally rather than re-cloning the six upstream repos
 * keeps the suite self-contained and offline: the whole point of the bundling
 * contract is that the only difference is that one line, so removing it
 * reconstructs the original exactly. sync-apps.sh checks that contract against
 * the real upstreams separately.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TAG_RE = /^.*gt-switcher\.js.*$\n?/m;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml'
};

function serve({ port, strip }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(ROOT, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));

      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }

      let body = fs.readFileSync(file);
      if (strip && file.endsWith('.html')) {
        body = Buffer.from(String(body).replace(TAG_RE, ''), 'utf8');
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

/** Resolve a Chromium binary: an explicit path, this image's, or Playwright's. */
function chromiumOptions() {
  const explicit = process.env.PW_CHROMIUM;
  if (explicit && fs.existsSync(explicit)) return { executablePath: explicit };

  const bundled = '/opt/pw-browsers';
  if (fs.existsSync(bundled)) {
    for (const dir of fs.readdirSync(bundled)) {
      const candidate = path.join(bundled, dir, 'chrome-linux', 'chrome');
      if (dir.startsWith('chromium-') && fs.existsSync(candidate)) {
        return { executablePath: candidate };
      }
    }
  }
  return {};   // let Playwright find its own download
}

/** Collects results so a suite can report a single tally. */
function reporter(title) {
  let pass = 0, fail = 0;
  console.log(`\n================ ${title} ================`);
  return {
    ok(condition, message) {
      if (condition) { pass++; console.log(`  PASS  ${message}`); }
      else           { fail++; console.log(`  **FAIL**  ${message}`); }
      return !!condition;
    },
    note(message) { console.log(`      · ${message}`); },
    get pass() { return pass; },
    get fail() { return fail; }
  };
}

module.exports = { ROOT, serve, chromiumOptions, reporter };
