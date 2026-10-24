#!/usr/bin/env node
/**
 * Link / asset checker for Commissioning.
 *
 * Starts http-server, then runs linkinator against BOTH delivered platforms to verify
 * same-origin links and assets resolve.
 *
 * It said "both apps" and crawled one. `urls` held a single entry — the root runtime —
 * so the document portal, which is the public five-page PWA and the half a citizen
 * actually reaches, was never checked. README.md and the CI job table both described
 * this as a crawl of both entry points. It is one now.
 *
 * Usage:  node scripts/check-links.mjs
 */

import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8081; // separate port so it does not conflict with the test server

/* Skipped, and why each one is here.
 *
 * The four CDN hosts this list used to carry — fonts.googleapis.com, fonts.gstatic.com,
 * cdn.tailwindcss.com, unpkg.com — and kanihamza.workers.dev are gone. Not skipped: absent.
 * The Activity Hub that used the workers.dev host was retired at D6(b), and the last
 * external stylesheet (the portal's Google Fonts @import) was removed with it. Nothing in
 * either tree fetches from an off-origin host any more, and tests/hardening.test.mjs fails
 * if that changes — so a skip pattern for one is a claim about the tree that is no longer
 * true, and leaves a real regression unreported if the @import ever comes back. */
const SKIP_PATTERNS = [
  // Signed Power Automate trigger URLs. Invoking one is a live write, not a link check.
  'powerplatform\\.com',
  'powerautomate\\.com',
  // Both config.local.js files are git-ignored and optional: each <script> tag carries
  // onerror="void 0", so a 404 is the documented fresh-clone state, not a broken link.
  'localhost:\\d+/config/config\\.local\\.js$',
  'localhost:\\d+/document-portal/config\\.local\\.js$',
  /* The agency's own site, linked from the portal footer. Skipped so this crawl reaches
   * nothing but localhost and is therefore deterministic: a red result means a link inside
   * this repository is broken, which is a fact about the commit and worth blocking on. It
   * used to be reachable-dependent, which is why the CI job was continue-on-error — and a
   * job that is allowed to fail is a job whose failures nobody reads. That already cost
   * this repository one silent breakage (see the Node 22 note in ci.yml). Whether
   * nitda.gov.ng is up is monitoring, not a property of this commit. */
  'nitda\\.gov\\.ng',
];

async function main() {
  // Start the static server
  const server = spawn(
    'npx',
    ['http-server', '.', '-p', String(PORT), '--cors', '-c-1', '--silent'],
    { stdio: 'inherit' }
  );

  /* Wait until the port actually answers, rather than assuming two seconds is enough.
   * A fixed sleep fails the wrong way: if http-server has not bound yet, linkinator gets
   * ECONNREFUSED on every URL and the job reports "broken links" for a server that was
   * merely slow. */
  const ready = await (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://localhost:${PORT}/index.html`, { method: 'HEAD' });
        if (r.ok) return true;
      } catch { /* not up yet */ }
      await sleep(250);
    }
    return false;
  })();
  if (!ready) {
    server.kill();
    console.error(`\n✗ http-server never answered on port ${PORT} — nothing was crawled.`);
    process.exit(1);
  }

  let exitCode = 0;
  try {
    const skipArg = SKIP_PATTERNS.join('|');
    /* Every entry point of both platforms. linkinator checks the links ON a page without
     * following them, so listing only the two front doors left submit/track/support and
     * their scripts unchecked, and 404.html unreachable — nothing links to it. */
    const urls = [
      `http://localhost:${PORT}/index.html`,
      `http://localhost:${PORT}/document-portal/index.html`,
      `http://localhost:${PORT}/document-portal/submit.html`,
      `http://localhost:${PORT}/document-portal/track.html`,
      `http://localhost:${PORT}/document-portal/support.html`,
      `http://localhost:${PORT}/document-portal/404.html`,
    ];

    for (const url of urls) {
      console.log(`\nChecking links in: ${url}`);
      try {
        execSync(
          `npx linkinator "${url}" --skip "${skipArg}" --format text --timeout 10000`,
          // Hard ceiling per entry point. Without it a recursive crawl that reaches an
          // unreachable host can hang indefinitely and stall CI rather than fail it.
          { stdio: 'inherit', timeout: 120_000 }
        );
      } catch (err) {
        if (err?.killed || err?.signal === 'SIGTERM') {
          console.error(`\n✗ Timed out after 120s crawling ${url}`);
        }
        exitCode = 1;
      }
    }
  } finally {
    server.kill();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
