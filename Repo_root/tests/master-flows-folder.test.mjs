#!/usr/bin/env node
/**
 * Every flow and endpoint record lives in docs/folio-Master-Flows-and-Endpoints/, and nowhere else.
 *
 * Owner direction, 3 October 2026: all registers, details, documents and evidence relating to flows
 * and endpoints sit in one master folder. What may stay outside, and why, is listed below — each
 * exception carries its reason, so adding one is a visible decision rather than a quiet drift.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MASTER = 'docs/folio-Master-Flows-and-Endpoints/';
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

/* Platform code: what a platform needs to run or ship, and the tooling that builds and checks the
   records. It stays with its platform (owner decision of 3 Oct 2026, "platform code stays"). */
const PLATFORM_CODE = ['config/', 'core/', 'modules/', 'shared/', 'scripts/', 'tests/', 'tools/', 'mailer/',
  'document-portal/', 'releases/', 'styles/', 'assets/'];

/* Named exceptions outside platform code, each with its reason. */
const EXCEPTIONS = {
  'docs/reference/foundational/': 'The harvest the estate was derived from (decision D5). tests/check-secrets.mjs quarantines it by this exact path because it carries superseded signed URLs; moving it would move them into the scanned tree.',
  '.github/workflows/': 'GitHub Actions CI workflows, not Power Automate flows.',
  'docs/reference/correspondence-email-templates/partials/flow-attachment-section.html': 'An e-mail template partial of the Correspondence Email Desk, rendered by core/correspondence-email-service.js.',
};

/* Folders that held flow and endpoint records before the consolidation. */
const RETIRED = ['docs/flows/', 'flows/', 'artifacts/', 'evidence/', 'docs/deployment/internal/', 'docs/deployment/governance/',
  'docs/deployment/rotation/', 'docs/deployment/verification/', 'docs/deployment/notification-instrument/',
  'docs/deployment/live-operations-console/', 'docs/deployment/sharepoint/', 'docs/reference/connector/', 'docs/reference/out-of-band/'];

const allowed = (f) => f.startsWith(MASTER) || PLATFORM_CODE.some((p) => f.startsWith(p)) || Object.keys(EXCEPTIONS).some((p) => f === p || f.startsWith(p));

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`  ✅ ${name}`); };
console.log('\nFlow and endpoint records — one master folder\n');

ok('none of the retired record folders holds a file', () => {
  const back = tracked.filter((f) => RETIRED.some((r) => f.startsWith(r)));
  assert.deepEqual(back, [], `files back in a retired folder:\n  ${back.join('\n  ')}`);
});

ok('no file named for a flow, endpoint, workflow or trigger sits outside the master folder', () => {
  const stray = tracked.filter((f) => /flow|endpoint|trigger/i.test(f) && !allowed(f));
  assert.deepEqual(stray, [], `move these into ${MASTER}, or add an exception with its reason:\n  ${stray.join('\n  ')}`);
});

ok('no Power Automate definition sits outside the master folder', () => {
  const MARK = /schemas\.microsoft\.com\/azure\/logic|"triggerAuthenticationType"|Microsoft\.Logic\/workflows/;
  const stray = tracked.filter((f) => /\.(json|txt|md)$/.test(f) && !allowed(f))
    .filter((f) => { try { return statSync(join(ROOT, f)).size < 20e6 && MARK.test(readFileSync(join(ROOT, f), 'utf8')); } catch { return false; } });
  assert.deepEqual(stray, [], `flow definitions outside ${MASTER}:\n  ${stray.join('\n  ')}`);
});

ok('the master index names every folder in it', () => {
  const readme = readFileSync(join(ROOT, MASTER, 'README.md'), 'utf8');
  const dirs = readdirSync(join(ROOT, MASTER), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const missing = dirs.filter((d) => !readme.includes(`(./${d}/`));
  assert.deepEqual(missing, [], `README.md does not describe: ${missing.join(', ')}`);
});

ok('every exception is still needed', () => {
  for (const p of Object.keys(EXCEPTIONS)) assert.ok(tracked.some((f) => f === p || f.startsWith(p)), `${p} no longer exists — remove its exception`);
});

console.log(`\n✅ ${passed} passed, 0 failed\n`);
