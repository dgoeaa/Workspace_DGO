#!/usr/bin/env node
/**
 * The GOV-04 notice-link change (scripts/lib/gov04-notice-links.mjs), against the flow as captured from the tenant:
 * it changes exactly the five registry links and three labels, the result reads as applied, and a flow that differs
 * from the capture is refused.
 *
 * Run: node tests/gov04-notice-links.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteGov04, OLD_URL, NEW_URL } from '../scripts/lib/gov04-notice-links.mjs';
import { NoticeTargets } from '../config/notice-links.config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; const failures = [];
const ok = (name, cond, detail = '') => { if (cond) { passed++; console.log(`  ✅ ${name}`); } else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); } };

console.log('\nGOV-04 notice links\n');
const capture = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures/04_-_GOV_-_Audit_HTTP_Flow_Registry__3e9e1342-5027-4c0f-bdd3-1e06aa7f2a3b.json'), 'utf8')).Definition;

const r = rewriteGov04(capture);
ok('the captured flow is changed', r.state === 'change', JSON.stringify(r.counts));
const before = JSON.stringify(capture), after = JSON.stringify(r.definition || {});
ok('no registry list address is left', !after.includes(OLD_URL) && !/DGO_HTTPFlowRegistry\/DispForm/.test(after));
ok('the five links open the Admin Suite on the record', after.split(`${NEW_URL}',string(`).length - 1 === 5);
ok('only the links and labels change', before.length - after.length === 5 * (OLD_URL.length - NEW_URL.length) + 3 * ("'Open registry record'".length - "'Open in the Folio Admin Suite'".length));
ok('the changed flow reads as applied', rewriteGov04(r.definition).state === 'applied');
ok('the key it sends is in the allow-list', 'http-flow-registry' in NoticeTargets);
const drifted = JSON.parse(before.replace(OLD_URL, 'https://example.invalid/?ID='));
ok('a flow that differs from the capture is refused', rewriteGov04(drifted).state === 'refused');

console.log(`\n${failures.length ? '❌' : '✅'} ${passed}/${passed + failures.length} assertions hold`);
process.exit(failures.length ? 1 : 0);
