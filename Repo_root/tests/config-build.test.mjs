/**
 * The deployed config files' build record and drift check (owner request, 2026-10-08: a rebuild is suggested whenever a
 * change invalidates an endpoint address in any of the three variants, and is available on request).
 *
 *   1. the ledger records every key the three variants deliver, and no URL or signature
 *   2. each recorded key names the flow the adoption ledger gives it
 *   3. compare(): an unchanged address is current; a regenerated key, a moved workflow, an unreadable flow and a key
 *      the build never had each suggest a rebuild; a key empty by decision never does
 */
import { readFileSync } from 'node:fs';
import { keyPlan, compare, ledgerOf, digest, verdict } from '../scripts/lib/config-drift.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nConfig build ledger and drift check\n');
const MF = 'docs/folio-Master-Flows-and-Endpoints';
const raw = readFileSync(`${MF}/registers/config-build-ledger.json`, 'utf8');
const ledger = JSON.parse(raw);
const plan = keyPlan(JSON.parse(readFileSync(`${MF}/registers/flow-adoption.json`, 'utf8')));

const due = plan.filter((p) => !p.emptyByDecision);
const absent = due.filter((p) => !ledger.variants?.[p.variant]?.[p.key]).map((p) => `${p.variant}:${p.key}`);
ok(!absent.length, `the ledger records every delivered key (${due.length} across ${Object.keys(ledger.variants || {}).length} variants)`, absent.join(', '));
ok(!/sig=|https?:\/\/[^"]*\/workflows\//i.test(raw), 'the ledger holds no URL or signature');
const wrong = due.filter((p) => ledger.variants?.[p.variant]?.[p.key] && ledger.variants[p.variant][p.key].flowId !== p.flowId).map((p) => `${p.variant}:${p.key}`);
ok(!wrong.length, 'each recorded key names its adopted flow', `${wrong.join(', ')} — the adoption ledger moved a key: npm run config:drift, then config:rebuild`);

const url = (w, s) => `https://x.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/${w}/triggers/manual/paths/invoke?api-version=1&sig=${s.padEnd(43, 'A')}`;
const W1 = 'a'.repeat(32), W2 = 'b'.repeat(32);
const row = (key, u, extra = {}) => ({ variant: 'workspace', key, flow: 'F', flowId: 'f1', status: 'READ', url: u, digest: digest(u), workflowId: /workflows\/([0-9a-f]{32})/.exec(u)[1], ...extra });
const base = [row('FETCH_ALL', url(W1, 'one')), row('EMAIL', url(W1, 'two')), { variant: 'workspace', key: 'SCAN_INTAKE', status: 'EMPTY_BY_DECISION' }];
const built = ledgerOf(base, { builtUtc: 't0', commit: 'c' });
ok(!compare(base, built).rebuild, 'unchanged addresses: current');
ok(compare([row('FETCH_ALL', url(W1, 'three')), base[1], base[2]], built).changes[0]?.change.startsWith('address changed'), 'a regenerated trigger key suggests a rebuild');
ok(/different workflow/.test(compare([row('FETCH_ALL', url(W2, 'one')), base[1], base[2]], built).changes[0]?.change || ''), 'a key moved to another workflow suggests a rebuild');
ok(compare([{ ...base[0], status: 'READ_404' }, base[1], base[2]], built).rebuild, 'a flow that can no longer be read suggests a rebuild');
ok(compare([...base, row('OTP_GENERATE', url(W2, 'four'))], built).rebuild, 'a key the last build did not carry suggests a rebuild');
ok(!compare(base, built).changes.some((c) => c.key === 'SCAN_INTAKE'), 'a key empty by decision never suggests one');
ok(/npm run config:rebuild/.test(verdict(compare([row('FETCH_ALL', url(W1, 'x')), base[1]], built))), 'the suggestion names the rebuild command');

/* 4. Package identity (owner, 2026-10-20): one rebuild is one version, carried in every package's name and inside it. */
const PI = await import('../scripts/lib/package-identity.mjs');
const fsm = await import('node:fs'), osm = await import('node:os'), pm = await import('node:path');
const day = new Date('2026-10-20T12:00:00Z');
ok(PI.nextVersion(null, day) === '2026.10.20-1' && PI.nextVersion({ version: '2026.10.20-1' }, day) === '2026.10.20-2' && PI.nextVersion({ version: '2026.10.19-4' }, day) === '2026.10.20-1', 'versions count up within a day and start again at 1 the next');
const tree = fsm.mkdtempSync(pm.join(osm.tmpdir(), 'pkgid-'));
fsm.mkdirSync(pm.join(tree, 'config')); fsm.writeFileSync(pm.join(tree, 'index.html'), 'a'); fsm.writeFileSync(pm.join(tree, 'config', 'config.local.js'), 'sig=one');
const id1 = PI.stamp(tree, { product: 'WORKSPACE', version: '2026.10.20-1', commit: 'c0ffee', builtUtc: 't' });
fsm.writeFileSync(pm.join(tree, 'config', 'config.local.js'), 'sig=two');
const id2 = PI.stamp(tree, { product: 'WORKSPACE', version: '2026.10.20-2', commit: 'c0ffee', builtUtc: 't' });
ok(id1.codeFingerprint === id2.codeFingerprint && id1.configDigest !== id2.configDigest, 'the same code keeps its fingerprint; a changed config shows in the config digest');
fsm.writeFileSync(pm.join(tree, 'index.html'), 'b');
ok(PI.fingerprint(tree).codeFingerprint !== id2.codeFingerprint, 'a changed file changes the code fingerprint');
const written = fsm.readFileSync(pm.join(tree, 'BUILD-ID.json'), 'utf8');
ok(JSON.parse(written).label === 'FOLIO-WORKSPACE v2026.10.20-2' && !/sig=/.test(written), 'BUILD-ID.json names the package and version and holds no address');
ok(PI.zipName('WORKSPACE', '2026.10.20-2', 'upload-to-site-root') === 'FOLIO-WORKSPACE-v2026.10.20-2-upload-to-site-root.zip', 'the zip is named for its package and version');
for (const v of ['2026.10.20-2', '2026.10.20-10', '2026.10.19-3']) fsm.writeFileSync(pm.join(tree, PI.zipName('WORKSPACE', v, 'upload-to-site-root')), '');
ok(PI.findZip(tree, 'WORKSPACE', 'upload-to-site-root')?.version === '2026.10.20-10', 'the handover takes the newest version in a build folder');
fsm.rmSync(tree, { recursive: true, force: true });
const src = fsm.readFileSync('scripts/config-build.mjs', 'utf8');
ok(/stampId\(path\.join\(OUT, 'workspace'\)/.test(src) && /stampId\(path\.join\(OUT, 'portal', 'CG'\)/.test(src) && /ledgerOf\(live, \{ builtUtc, commit, version, builds \}\)/.test(src), 'config:rebuild stamps both sites and records the version in the ledger');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
