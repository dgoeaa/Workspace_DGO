#!/usr/bin/env node
/**
 * The flow adoption ledger: one adopted flow per function, and every other flow this estate holds retired.
 *
 *   npm run flowadoption              write registers/flow-adoption.json and reference/FLOW_ADOPTION.md
 *   npm run flowadoption -- --check   fail if either is out of date, or if any artefact of a retired flow remains
 *   npm run flowadoption -- --retire  remove every artefact of a retired flow from the folder, recording each file's
 *                                     SHA-256, size and the last commit holding it in registers/flow-retirement.json
 *
 * Owner direction (2026-10-05): no duplicate, orphaned or purposeless flow is retained for any reason; each conflict was
 * resolved by selecting one copy, by the owner's selection or by evidence-based inference. The selection rule, in order:
 *   1. the owner's latest explicit selection: a package pasted into a flow for its key (5 October 2026), or a flow the
 *      owner named for its key;
 *   2. the latest tenant evidence of what serves the key: the live read of 2026-09-27 (readiness ITEM-65), the endpoint
 *      register's wired flow names, the tenant captures of 2026-10-01;
 *   3. the owner's contract key → flow map of 2026-09-24 (reference/contract-key-flow-map.json).
 * A flow with no contract key, no caller in Folio or the portal, and no list, library or schedule trigger the platform
 * relies on is an orphan. A one-off provisioning or repair flow whose job is done is retired.
 *
 * Scope: the flows this repository holds an artefact of, and the flows its registers name for a contract key. The rest of
 * the agency's tenant (about 600 flows in the 2026-09-26 export, most owned by other people and units) is not evidenced
 * as part of this platform and is not classified here.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { openZip } from './lib/zip-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const RETIRE = process.argv.includes('--retire');
const B = 'docs/folio-Master-Flows-and-Endpoints';
const OUT_JSON = `${B}/registers/flow-adoption.json`;
const OUT_MD = `${B}/reference/FLOW_ADOPTION.md`;
const RECORD = `${B}/registers/flow-retirement.json`;
import { ADOPTED, RETIRED, RETIRED_KEYS, RETIRED_TOOLING, RETIRED_TENANT_STATE } from './lib/flow-adoption-data.mjs';

/* ---------------------------------------------------------------- artefacts */
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const walk = (d) => (existsSync(join(ROOT, d)) ? readdirSync(join(ROOT, d)).flatMap((f) => { const p = `${d}/${f}`; return statSync(join(ROOT, p)).isDirectory() ? walk(p) : [p]; }) : []);
const zipId = (p) => { try { return JSON.parse(openZip(join(ROOT, p)).members.find((m) => /^Microsoft\.Flow\/flows\/[^/]+\/definition\.json$/.test(m.name)).read().toString('utf8')).name; } catch { return null; } };
/* Artefacts named for a flow without its GUID: the recovered definitions (run ids), the foundational copies, the
   capture of the email flow taken under its workflow id, and the deeplink patches. */
const BY_NAME = [
  [/contracts\/recovered\/Copy of - Fetch_All_Data/, '10f0d76b'],
  [/contracts\/recovered\/Dynamic_Multi-Actions__/, '2784d4e0'],
  [/foundational\/flows\/definitions\/Fetch_Tasks_POST__/, 'd477fe23'],
  [/foundational\/flows\/definitions\/Fetch_Emails_POST__/, 'a2b43ce3'],
  [/foundational\/flows\/definitions\/Fetch_References_and_Lookups_Data - POST__/, '3dc47349'],
  [/foundational\/flows\/definitions\/Deployed - Create Task__/, 'b9d07010'],
  [/foundational\/flows\/definitions\/Deployed Bulk Task Assignment_Create Task__/, '122bb363'],
  [/captures\/IP_Create_Email_Assignment_Endpoint__unread_/, '2fbb5485'],
  [/foundational\/flows\/definitions\/OTP_FLOWS\/OTP_GENERATE\/Web - OTP Generate__/, 'a03d0ae8'],
  [/foundational\/flows\/definitions\/OTP_FLOWS\/OTP_VERIFY\/Web - OTP Verify__/, '3e201620'],
  /* The later builds the conformance stage starts from (build-identification-conformance.mjs), moved here 2026-10-21. */
  [/captures\/build-sources\/CG_Portal_Daily_Sweep\./, 'f12aec6d'],
  [/captures\/build-sources\/CG_Portal_Status_Check_Endpoint\./, '60042a2e'],
  [/captures\/build-sources\/CG_Portal_Writeback_Endpoint\./, 'bde13d27'],
  [/captures\/build-sources\/CG_Registry_Status_Notifier\./, '8ebf6001'],
  [/captures\/build-sources\/CG_Upload_Endpoint\./, 'df82e331'],
  [/patches\/deeplinks(-flows)?\/Bulk-Assign-Direct\//, '57f137b6'],
  [/patches\/deeplinks(-flows)?\/optimized-Bulk-Assign-Direct\//, '9e098918'],
  [/patches\/deeplinks(-flows)?\/Deployed-Create-Task\//, 'b9d07010'],
  [/patches\/deeplinks(-flows)?\/Web-Email-Task-Created\//, '3f2f649b'],
];
const SCAN = [`${B}/contracts/deployed`, `${B}/contracts/recovered`, `${B}/captures`, `${B}/exports`, `${B}/patches`, 'docs/reference/foundational/flows/definitions'];
const files = SCAN.flatMap(walk).filter((p) => !/README\.md$/.test(p));
const flowOf = (p) => {
  for (const [re, id] of BY_NAME) if (re.test(p)) return id;
  if (p.endsWith('.zip')) return zipId(p);
  const m = GUID.exec(p.split('/').pop()); return m ? m[0].toLowerCase() : null;
};
const owner = (id) => (id ? ADOPTED.find((a) => a.id.startsWith(id.slice(0, 8))) || RETIRED.find((r) => id.startsWith(r.id)) : null);
const placed = files.map((p) => ({ p, id: flowOf(p) })).map((x) => ({ ...x, o: owner(x.id) }));
/* Two exports of one adopted flow: the newer is its record; the older is a duplicate record. */
const exportsOf = {};
for (const x of placed.filter((y) => y.p.endsWith('.zip') && ADOPTED.includes(y.o))) (exportsOf[x.o.id] ||= []).push(x.p);
const olderExports = new Set(Object.values(exportsOf).flatMap((l) => l.sort().slice(0, -1)));
/* Two deployed definitions of one adopted flow: the later export is its record; the earlier is a duplicate record. */
const exportedAt = (p) => { try { return JSON.parse(readFileSync(join(ROOT, p), 'utf8').replace(/^\uFEFF/, '')).exportedAtUtc || ''; } catch { return ''; } };
const deployedOf = {};
for (const x of placed.filter((y) => y.p.includes('/contracts/deployed/') && ADOPTED.includes(y.o))) (deployedOf[x.o.id] ||= []).push(x.p);
for (const l of Object.values(deployedOf)) for (const p of l.sort((a, b) => (exportedAt(a) < exportedAt(b) ? -1 : exportedAt(a) > exportedAt(b) ? 1 : 0)).slice(0, -1)) olderExports.add(p);

/* A tooling entry names one file (path) or every file under a folder (dir). */
/* An older export that a package builder reads as its source stays: the package is built from it (the newer export
   records what the tenant runs after a paste, which is not a source to build from). */
const BUILDER_SOURCES = ['scripts/build-identification-phase3.mjs', 'scripts/build-identification-phase4.mjs']
  .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
for (const p of [...olderExports]) if (BUILDER_SOURCES.includes(p)) olderExports.delete(p);
const TOOLING = RETIRED_TOOLING.flatMap((t) => (t.dir ? walk(t.dir).map((p) => ({ path: p, why: t.why })) : [t]));
const retireFiles = [...placed.filter((x) => RETIRED.includes(x.o) || olderExports.has(x.p)).map((x) => x.p), ...TOOLING.map((t) => t.path).filter((p) => existsSync(join(ROOT, p)))].sort();
const unknown = placed.filter((x) => !x.o && /contracts\/(deployed|recovered)|captures|exports|foundational\/flows\/definitions\/.*full_definition/.test(x.p)).map((x) => x.p);

if (process.argv.includes('--list')) { for (const p of retireFiles) console.log(p); process.exit(0); }

/* ---------------------------------------------------------------- retire */
if (RETIRE) {
  const head = execSync('git rev-parse --short=8 HEAD', { cwd: ROOT }).toString().trim();
  const prev = existsSync(join(ROOT, RECORD)) ? JSON.parse(readFileSync(join(ROOT, RECORD), 'utf8')) : { files: [] };
  /* Files retired by an earlier run keep the commit that run recorded (lastCommitHoldingThem); each file retired now
     records its own commit and date. */
  const today = new Date().toISOString().slice(0, 10);
  const rec = { retired: prev.retired || today, direction: 'owner, 2026-10-05: no duplicate, orphaned or purposeless flow is retained', lastCommitHoldingThem: prev.lastCommitHoldingThem || head,
    toRead: 'git show <commit>:<path>, where <commit> is the file\'s own commit, else lastCommitHoldingThem', files: [...prev.files] };
  for (const p of retireFiles) {
    const buf = readFileSync(join(ROOT, p));
    const x = placed.find((y) => y.p === p);
    const tool = TOOLING.find((t) => t.path === p);
    rec.files.push({ path: p, sha256: createHash('sha256').update(buf).digest('hex'), size_bytes: buf.length, flow: x ? x.id : null, why: tool ? tool.why : olderExports.has(p) ? 'an older export of an adopted flow; the newer one is its record' : x.o.why,
      ...(prev.lastCommitHoldingThem && prev.lastCommitHoldingThem !== head ? { commit: head, retired: today } : {}) });
    rmSync(join(ROOT, p));
  }
  writeFileSync(join(ROOT, RECORD), `${JSON.stringify(rec, null, 2)}\n`);
  console.log(`flow adoption: retired ${retireFiles.length} artefact files (record: ${RECORD})`);
  process.exit(0);
}

/* ---------------------------------------------------------------- ledger */
const record = existsSync(join(ROOT, RECORD)) ? JSON.parse(readFileSync(join(ROOT, RECORD), 'utf8')) : { files: [] };
const artefacts = (id) => placed.filter((x) => x.o && x.o.id === id && !olderExports.has(x.p)).map((x) => x.p).sort();
const ledger = {
  schema: 'dgo-flow-adoption/v1',
  generatedBy: 'scripts/build-flow-adoption.mjs',
  direction: 'Owner, 2026-10-05: no duplicate, orphaned or purposeless flow is retained for any reason. One copy per function is adopted, by the owner\'s selection or by evidence-based inference.',
  selectionRule: ['1. the owner\'s latest explicit selection (pastes of 2026-10-05; a flow the owner named for its key)', '2. the latest tenant evidence of what serves the key (live read 2026-09-27, endpoint register, tenant captures 2026-10-01)', '3. the owner\'s map of 2026-09-24'],
  scope: 'The flows this repository holds an artefact of, and the flows its registers name for a contract key. The rest of the agency tenant is not evidenced as part of this platform.',
  counts: { adopted: ADOPTED.length, retired: RETIRED.length, retiredKeys: RETIRED_KEYS.length, artefactsRetired: record.files.length },
  adopted: ADOPTED.map((a) => ({ function: a.fn, contractKeys: a.keys, flowId: a.id, name: a.name, basis: a.basis, artefacts: artefacts(a.id) })),
  retiredContractKeys: RETIRED_KEYS,
  retired: RETIRED.map((r) => ({ flowIdPrefix: r.id, name: r.name, why: r.why, successor: r.successor ? { flowId: r.successor.id, name: r.successor.name } : null,
    tenantAction: 'If it is in the tenant: turn it off, then delete it once its run history shows no call for 14 days.',
    tenantState: RETIRED_TENANT_STATE.state, deleteFrom: RETIRED_TENANT_STATE.deleteFrom })),
  retiredArtefactsRecord: RECORD,
};
const md = `# Flow adoption

**Generated by \`npm run flowadoption\` from \`scripts/build-flow-adoption.mjs\`. Do not edit by hand.**

${ledger.direction}

**Selection rule**, in order: ${ledger.selectionRule.join('; ')}.

**Scope.** ${ledger.scope}

${ADOPTED.length} flows are adopted and ${RETIRED.length} are retired. Contract key retired with no flow of its own: ${RETIRED_KEYS.map((k) => `\`${k.key}\` (${k.why})`).join('; ')}.
The repository holds no artefact of a retired flow: ${record.files.length} files were removed (\`${RECORD}\` records each one's SHA-256, size and the last commit holding it).

## Adopted: one flow per function

| Function | Contract keys | Flow | Flow id | Basis |
|---|---|---|---|---|
${ledger.adopted.map((a) => `| ${a.function} | ${a.contractKeys.map((k) => `\`${k}\``).join(', ') || '—'} | ${a.name} | \`${a.flowId}\` | ${a.basis} |`).join('\n')}

## Retired: turn off in the tenant, then delete

Turn each off; delete it once its run history shows no call for 14 days. Tenant state: ${RETIRED_TENANT_STATE.state}; delete from ${RETIRED_TENANT_STATE.deleteFrom} where the run history shows no call since.

| Flow | Id | Why | Adopted in its place |
|---|---|---|---|
${ledger.retired.map((r) => `| ${r.name} | \`${r.flowIdPrefix}\` | ${r.why} | ${r.successor ? `${r.successor.name} (\`${r.successor.flowId.slice(0, 8)}\`)` : '—'} |`).join('\n')}
`;

let bad = 0;
if (unknown.length) { console.error(`flow adoption: unclassified flow artefacts:\n  ${unknown.join('\n  ')}`); bad++; }
const left = retireFiles;
if (CHECK && left.length) { console.error(`flow adoption: ${left.length} artefact(s) of retired flows remain — run: npm run flowadoption -- --retire\n  ${left.slice(0, 10).join('\n  ')}`); bad++; }
for (const [p, body] of [[OUT_JSON, `${JSON.stringify(ledger, null, 2)}\n`], [OUT_MD, md]]) {
  let cur = null; try { cur = readFileSync(join(ROOT, p), 'utf8'); } catch { /* new */ }
  if (cur === body) continue;
  if (CHECK) { console.error(`flow adoption: ${p} is out of date — run: npm run flowadoption`); bad++; } else writeFileSync(join(ROOT, p), body);
}
if (bad) process.exit(1);
console.log(`flow adoption: ${ADOPTED.length} adopted, ${RETIRED.length} retired, ${left.length} retired artefact(s) present${CHECK ? '' : ' (written)'}`);
