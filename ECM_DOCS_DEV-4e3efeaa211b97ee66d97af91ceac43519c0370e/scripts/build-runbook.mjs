#!/usr/bin/env node
/**
 * THE PROOF CUTOVER, AS INSTRUCTIONS SOMEONE CAN ACTUALLY FOLLOW.
 *
 * WHY THIS EXISTS
 *
 * The identity build landed and the next step was written as "paste the packages". That is not
 * an instruction. It does not say which tenant flow each package goes into, it does not say what
 * to do where two flows answer to the same name, it used the clipboard route 10-install-route-and-reference.md
 * §6.0 supersedes for breaking four flows in this tenant, and it gave no way to tell afterwards
 * whether the thing had worked. Every fact needed to write it properly was already in the
 * repository and none of it was in the instruction.
 *
 * So this file assembles the runbook from that data rather than restating it. Flow ids come from
 * the tenant reading, action counts from the packages themselves, contract keys from the endpoint
 * register. Nothing here is typed twice, so nothing here can quietly stop being true.
 *
 * WHAT IT REFUSES TO PRETEND
 *
 * Three of the eight packages have no single flow the evidence resolves them to: the tenant
 * registry returns two candidates for some and nothing at all for others. Writing one of them
 * down as if it were settled would be the worst kind of precision — an instruction that looks
 * exact and points at the wrong flow. Those are printed as unresolved, with the one procedure
 * that settles them, which is to match the workflow id inside the configured trigger URL against
 * docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json.
 *
 *     node scripts/build-runbook.mjs            # write it
 *     node scripts/build-runbook.mjs --check    # exit 1 if it drifted
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PASTE = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4';
const OUT = join(ROOT, 'docs/deployment/RUNBOOK.md');

const tenant = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-18-tenant-flow-inventory.json'), 'utf8'));
const register = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json'), 'utf8'));
/* The platform owner's mapping of 2026-09-24. Before it, three of these eight packages had no
   flow the evidence could name and this runbook printed them as unresolved. It names all
   twenty-three keys, so nothing here is guessed and nothing is left to the reader. Where it names
   a different flow from the one currently wired, the reconciliation carries that as a migration
   and this runbook says so on the row rather than picking one. */
const MAP = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json'), 'utf8'));
const RECON = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-reconciliation.json'), 'utf8'));
const mapByKey = new Map(MAP.map.map((r) => [r.contractKey, r]));
const reconByKey = new Map(RECON.rows.map((r) => [r.contractKey, r]));

/* The identification Phase 4 packages that carry G-04 (the caller from the sign-in proof), in dependency order: the
   proof mint first, because every package after it refuses a caller with no proof once IDENTITY_PROOF_REQUIRED is set.
   The DGO_* replacement packages this runbook installed before 2026-10-06 are retired (registers/flow-retirement.json);
   these change the adopted flows instead. [package file, contract keys, role, why] */
const ORDER = [
  ['OTP_VERIFY__IP_OTP_VERIFY__4dbe6dde', ['OTP_GENERATE', 'OTP_VERIFY'], 'mints', 'Mails the code and exchanges it for the proof every package below verifies. Nothing else works with the switch on until this is in.'],
  ['FETCH_ALL__IP_FETCH_ALL_BOOTSTRAP__b79e6707', ['FETCH_ALL'], 'verifies', 'The boot call, and the endpoint that leaked. Prove the refusal here before going further.'],
  ['SINGLE_ASSIGNMENT__Single_Task_Assignment__3caf9458', ['SINGLE_ASSIGNMENT'], 'verifies', 'First write.'],
  ['BULK_ASSIGNMENT__BULK_OPS_DATA_RETRIEVAL_HTTP__5aab9e61', ['BULK_ASSIGNMENT'], 'verifies', 'Batch of the same write.'],
  ['DYNAMIC_ACTIONS__IP_Dynamic_Global_Actions_Endpoint__31c0aaf0', ['DYNAMIC_GLOBAL_ACTIONS', 'SUBSIDIARY_ACTIONS'], 'verifies', 'The operation switch; SUBSIDIARY_ACTIONS shares the flow.'],
  ['EMAIL_RELATED_TASK__IP_Create_Task_for_received_Email_Endpoint__ab1a3555', ['EMAIL_RELATED_TASK'], 'verifies', 'A task raised from an e-mail.'],
  ['REFERENCE_DATA__IP_Reference_Data_Endpoint__9a4dea8e', ['REFERENCE_DATA'], 'verifies', 'The directory and pickers. Its gate was hard-coded to pass; it also serves the full directory only to a holder of user:view.'],
  ['GET_DOCS__IP_Get_Docs_Endpoint__28f6e62a', ['GET_DOCS'], 'verifies', 'Documents, and FETCH_ACTIVITIES, which the same flow serves; its gate was hard-coded to pass.'],
  ['FETCH_EMAIL_ATTACHMENTS__IP_Retrieve_Email_Attachment_Endpoint__5bc87cf3', ['FETCH_EMAIL_ATTACHMENTS'], 'verifies', 'Had no caller check at all. The gate reads SharePoint, which this flow did not: pick the SharePoint connection (3f1943c5) when the designer asks.'],
  ['EMAIL__IP_SEND_EMAIL__df59a69f', ['EMAIL'], 'verifies', 'Outgoing mail; its own directory check then refuses a caller with no proof.'],
  ['AI_DOC_ANALYSIS__AI_Document_Processing__fefa43c6', ['AI_EMAIL_ANALYSIS', 'AI_DOC_ANALYSIS', 'AI_CHAT'], 'verifies', 'Had no caller check at all. Added, not replaced: paste it between Initialize_variable_2 and Get_item (the identification-phase4 README).'],
];

const liveByFlow = new Map(tenant.flows.map((f) => [f.flowId, f]));
for (const later of (tenant.laterReadings || {}).readings || []) {
  liveByFlow.set(later.flowId, { ...(liveByFlow.get(later.flowId) || {}), ...later });
}
const byKey = new Map();
for (const j of tenant.registryJoin) {
  for (const k of j.contractKeys || []) {
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(j);
  }
}
const registerByKey = new Map(register.current_configuration.map((e) => [
  e.key.replace(/^DGO_ENDPOINT_|^PF_ENDPOINT_/, ''), e]));

/* Counted the way scripts/verify-execution-guide.mjs counts, deliberately: it walks `actions`
   maps only. A looser walk that calls anything with a `type` an action reads one extra per
   package \u2014 and two documents in the same repository disagreeing by one about the same number
   is exactly the drift that guide exists to stop. */
function actionCount(pkg) {
  const doc = JSON.parse(readFileSync(join(ROOT, PASTE, `${pkg}.paste.json`), 'utf8'));
  let n = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.actions && typeof node.actions === 'object') {
      for (const act of Object.values(node.actions)) { n++; walk(act); }
    }
    for (const key of ['else', 'default']) if (node[key]) walk(node[key]);
    if (node.cases && typeof node.cases === 'object') for (const c of Object.values(node.cases)) walk(c);
  };
  walk(doc.serializedValue || doc);
  return n;
}

/* Every package's flow now comes from the platform owner's mapping. Nothing is inferred from a
   flow name and nothing is left unresolved, which is what this file printed for three of them
   before the mapping existed. The reconciliation is carried alongside so a row that is a
   MIGRATION says so on its own face rather than reading like a straight update. */
function targetFor(keys) {
  return {
    mapped: keys.map((k) => mapByKey.get(k)).filter(Boolean),
    recon: keys.map((k) => reconByKey.get(k)).filter(Boolean),
  };
}

const rows = ORDER.map(([pkg, keys, role, why]) => ({
  pkg, keys, role, why, actions: actionCount(pkg), ...targetFor(keys),
}));

const LEDGER = JSON.parse(readFileSync(join(ROOT, 'docs/reference/internal-proof-ledger.json'), 'utf8'));
const REG = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'), 'utf8'));
const item = (id) => REG.items.find((x) => x.id === id) || {};
const MIGRATIONS = RECON.rows.filter((r) => r.verdict === 'MIGRATION');

const L = [];
const p = (...s) => L.push(...s);

p('# Cutover — every step, end to end');
p('');
p('<!-- Generated by scripts/build-runbook.mjs. Do not edit by hand: run');
p('     `npm run runbook`. `npm run test:runbook` fails on drift. -->');
p('');
p('> **This document carries steps, and owns none.** The install route is');
p('> Part 2 of this runbook, §6.0\u2019s and that remains the source for HOW a');
p('> package is installed. What this adds is the ORDER, the target flow for each package, and the');
p('> check after each \u2014 read from the platform owner\u2019s mapping, the endpoint register and the');
p('> packages themselves, not typed here.');
p('');
p('Four open items close along one path. This is that path, in the only order that does not create');
p('rework.');
p('');
p('| Phase | Item | What it is |');
p('| --- | --- | --- |');
p(`| 0 | ITEM-64 | ${item('ITEM-64').title} |`);
p(`| 1 | ITEM-63 | ${item('ITEM-63').title} |`);
p(`| 2 | G-04 | ${rows.length} identification packages that resolve the caller from the sign-in proof |`);
p(`| 3 | ITEM-2 | ${item('ITEM-2').title} |`);
p('');
p('**Why this order.** Phase 0 changes which list the packages name, so doing it after Phase 2');
p(`means rebuilding and re-pasting all ${rows.length} packages a second time. Phase 1 is settled: every key runs on its`);
p('adopted flow. Phase 3 is not a separate task: ITEM-2 closes on the first write Phase 2\u2019s');
p('verification performs, provided the result is kept.');
p('');
p('---');
p('');
p('## Phase 0 \u2014 the internal proof ledger (ITEM-64)');
p('');
p(`**Decision, already taken:** ${LEDGER.decision}`);
p('');
p(`**Why it is first:** ${LEDGER.whatIsBlocked}`);
p('');
p('### 0.1 Create the list');
p('');
p(`On **${LEDGER.listToProvision.site}**, create a list named **\`${LEDGER.listToProvision.title}\`**.`);
p('');
p(`${LEDGER.listToProvision.whyThatSite}`);
p('');
p('| Column | Type | Required | What it holds |');
p('| --- | --- | --- | --- |');
for (const c of LEDGER.listToProvision.columns) {
  p(`| \`${c.internalName}\` | ${c.type} | ${c.required ? 'yes' : 'no'} | ${c.holds} |`);
}
p('');
p(`**Index \`${LEDGER.listToProvision.indexOn.join('`, `')}\`.** ${LEDGER.listToProvision.whyIndexTitle}`);
p('');
p('### 0.2 Tell the repository');
p('');
p('Put the new list\u2019s GUID into `listId` in');
p('[`docs/reference/internal-proof-ledger.json`](../reference/internal-proof-ledger.json), then:');
p('');
p('```bash');
p('npm run idphase4          # rebuilds the identification packages against the new list');
p('npm run test:proofidentity');
p('```');
p('');
p('That last command changes behaviour at this point: while `listId` was null it permitted the');
p('shared ledger as a declared interim. Once set, a package still naming the shared ledger is a');
p('failure. If it passes, Phase 0 is done.');
p('');
p('---');
p('');
p('## Phase 1 \u2014 the four migration decisions (ITEM-63) \u2014 settled');
p('');
p('For every contract key, two questions: which flow SHOULD serve it (the platform owner\u2019s');
p('mapping) and which flow DOES (the endpoint register and the tenant reading). For');
p(`${RECON.counts.confirmed} keys the answers matched; for ${RECON.counts.suppliedByTheMap} the mapping supplied`);
p(`the answer; ${MIGRATIONS.length} differed. The adoption ledger`);
p('([`FLOW_ADOPTION.md`](../folio-Master-Flows-and-Endpoints/reference/FLOW_ADOPTION.md), 2026-10-05)');
p('settles every one: each key runs on one adopted flow, and every package below installs into it.');
p('');
p('| Contract key | The map named | Wired on 2026-09-18 | Settled |');
p('| --- | --- | --- | --- |');
for (const m of MIGRATIONS) {
  p(`| \`${m.contractKey}\` | \`${m.intendedFlow.flowId}\` ${m.intendedFlow.name} | ${m.wiredFlowIds.map((f) => `\`${f}\``).join(', ')} | ${m.settled || '**not settled**'} |`);
}
p('');
p('Nothing to decide here. **The trigger URL belongs to the flow that is wired**, so a package is');
p('installed into the adopted flow, which is the one the endpoint register names.');
p('');
p('---');
p('');
p(`## Phase 2 \u2014 paste the ${rows.length} packages (G-04)`);
p('');
p('Each package is the adopted flow\u2019s root scope with the identification changes, the caller resolution among');
p('them. Until Flow Configuration `IDENTITY_PROOF_REQUIRED` is `true` the flows answer as before; set it only after');
p('the first package below has returned a proof to a real sign-in.');
p('');
p('> **The order below is a dependency, not a preference.** With the switch on, an endpoint refuses a caller with no');
p('> valid proof, and only the first package mints one.');
p('');
p('### 2.1 The route');
p('');
p('Per [`packages/identification-phase4/README.md`](../folio-Master-Flows-and-Endpoints/packages/identification-phase4/README.md):');
p('open the flow, **Export** it first (that export is the rollback), then replace the named root scope with the file and save.');
p('');
p('### 2.2 The flows, in order');
p('');
for (const [i, r] of rows.entries()) {
  // Relative to the runbook's own folder: since the docs/folio-Master-Flows-and-Endpoints/ consolidation the packages are no
  // longer under docs/deployment/, so stripping that prefix left a path that resolved nowhere.
  const rel = PASTE.startsWith('docs/deployment/') ? PASTE.slice('docs/deployment/'.length) : `../${PASTE.slice('docs/'.length)}`;
  const role = r.role === 'verifies' ? 'verifies the proof'
    : r.role === 'mints' ? 'mints the proof' : 'establishes identity';
  p(`#### 2.2.${i + 1} \`${r.pkg}\` — ${role}`);
  p('');
  p(`${r.why}`);
  p('');
  p('| | |');
  p('| --- | --- |');
  p(`| Package | [\`${r.pkg}.paste.json\`](${rel}/${r.pkg}.paste.json) |`);
  p(`| Actions in the pasted scope | ${r.actions} |`);
  p(`| Contract keys | ${r.keys.map((k) => `\`${k}\``).join(', ') || '—'} |`);
  /* The adoption ledger settles every migration; a settled row installs into the adopted flow. */
  const migrating = r.recon.filter((x) => x.verdict === 'MIGRATION' && !x.settled);
  const supplied = r.recon.filter((x) => x.verdict === 'SUPPLIED_BY_THE_MAP');
  if (!migrating.length) {
    const into = new Set();
    for (const m of r.mapped) {
      const ad = r.recon.find((x) => x.contractKey === m.contractKey)?.adopted;
      into.add(ad ? `| Install into | **${ad.name}** \`${ad.flowId}\` (adopted) |` : `| Install into | **${m.expectedFlowName}** \`${m.flowId}\` |`);
    }
    for (const line of into) p(line);
    if (!r.mapped.length) p('| Install into | the flow the endpoint register names for `EMAIL` — see Appendix A |');
  } else {
    p('| Install into | **depends on your Phase 1 decision**, below |');
  }
  p('');
  for (const x of migrating) {
    p(`> **Phase 1 decision required for \`${x.contractKey}\`.**`);
    p(`> **REPOINT** → install into \`${x.intendedFlow.flowId}\` (${x.intendedFlow.name}), then change the`);
    p('> endpoint URL in the deployed configuration to that flow’s trigger. Two actions; the second');
    p('> is the one that gets forgotten.');
    p(`> **DEFER** → install into \`${x.wiredFlowIds[0]}\` instead and leave the endpoint alone.`);
    p('> Either is valid. Installing into the intended flow WITHOUT the repoint is not.');
    p('');
  }
  if (supplied.length) {
    p('The mapping is the only source naming a flow for this key — no tenant reading resolved it.');
    p('Confirm the trigger URL matches before importing, per Appendix B.');
    p('');
  }
  p('**Check before moving on:**');
  p('');
  if (r.role === 'establishes') {
    p('Request a code for a real directory address. It must arrive. This flow issues no proof, so');
    p('there is nothing else to check here.');
  } else if (r.role === 'mints') {
    p('Request a code for a real directory address and complete it. It must return a **token**. Before this package the');
    p('flow returned the literal string `optional-server-issued-token`, which the client refuses —');
    p('so if sign-in still fails with a missing-token error, the paste did not take.');
    p('');
    p(`Then look at the ledger. A new row must be there: that address, \`Purpose\` \`internal-session\`,`);
    p('and an `ExpiresAtUtc` four hours out.');
  } else {
    p('With `IDENTITY_PROOF_REQUIRED` set to `true`, call the endpoint **with no `Authorization` header**. It must answer **401**.');
    p('Then call it with the proof from 2.2.1 and confirm it answers normally.');
  }
  p('');
  if (i === 0) {
    p('> **This is also ITEM-2’s evidence.** It is the first tenant write in this sequence: export the flow fresh');
    p('> afterwards and confirm the export carries the change. See §3.2.');
    p('');
  }
}

p('---');
p('');
p('## Phase 3 — verification, and the write path (ITEM-2)');
p('');
p('### 3.1 The test that decides whether any of this worked');
p('');
p('Everything above can be green and the estate still be open, because the defect this closes is');
p('not "no check runs" — it is "the check ran against an identity the caller supplied". So the');
p('acceptance test is not that a call with no proof is refused. It is this:');
p('');
p('> **Call `FETCH_ALL` with no `Authorization` header and a body naming an active administrator.**');
p('> It must answer **401**.');
p('');
p('A call with an EMPTY caller was already refused on 2026-09-24, before any of this. The request');
p('above is the one that still worked: the gate was correct, and the identity it checked came from');
p('the request body. That is what the ledger replaces.');
p('');
p('Then call it again with a valid proof and confirm it answers normally. A gate that refuses');
p('everyone is not a fix.');
p('');
p('### 3.2 ITEM-2 — the tenant write path');
p('');
p(`**What it is:** ${item('ITEM-2').title}. Ten items name it as a prerequisite. It is not extra work`);
p('here: Phase 2 performs exactly the write it asks for, and it closes on the evidence being kept.');
p('');
p(`**What closes it:** ${item('ITEM-2').resolutionCriteria}`);
p('');
p('So on the FIRST package you install:');
p('');
p('1. After the paste, export that flow again — fresh, from the tenant.');
p(`2. Confirm the export carries the change: its root scope holds the number of actions in that package’s row in §2.2,`);
p(`   and for the first package (\`${rows[0].pkg}\`) it contains \`Create_Otp_Proof\`.`);
p('3. Keep that export. It is the evidence, and it is all that stands between ITEM-2 and closed.');
p('');
p('### 3.3 What to record, once');
p('');
p('One dated file holding: the new list GUID; for each package, the');
p('flow it went into and its action count; the two `FETCH_ALL` calls from §3.1 with');
p('their status codes; and the fresh export from §3.2.');
p('');
p('That is every open criterion across all four items. Nothing else on this path is outstanding.');
p('');
p("## Appendix A · The one key the mapping does not name");
p('');
p('The mapping covers 24 contract keys. The endpoint register wires 25. The one it does not name is');
p('**`FETCH_ACTIVITIES`**, and it is not a gap: the register wires it to the same workflow as');
p('`GET_DOCS`, so the flow named for `GET_DOCS` serves it too.');
p('');
p('`EMAIL` was the other, until 2026-09-24. Two candidate packages were supplied for it and they');
p('turned out to be one flow saved twice eight minutes apart — identical across all 70 actions and');
p('both connector maps, differing only in two metadata timestamps and the display name.');
p('`IP_SEND_EMAIL` (`df59a69f`) is adopted because it is what the key is wired to;');
p('`IP_DGO_SEND_EXTERNAL_CORRESPONDENCE` (`faceec58`) is wired to nothing and is recorded as a');
p('duplicate in');
p('[`docs/folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-24-email-flow-adoption.json`](../folio-Master-Flows-and-Endpoints/deployment/internal/evidence/2026-09-24-email-flow-adoption.json)');
p('so nobody adopts it later.');
p('');
p('## Appendix B · Confirming a flow before you import');
p('');
p('Do not guess from the name. Several of these flows have near-identical names and one is a');
p('superseded predecessor of another; ITEM-60 records six supplied packages that are exports of');
p('flows no wired endpoint resolves to at all.');
p('');
p('The trigger URL is what decides. Take the configured URL for the contract key — from');
p('`config/config.local.js`, or from the endpoint register — and read the 32-hex id in its path:');
p('');
p('```');
p('.../workflows/<32-hex workflow id>/triggers/manual/paths/invoke?...');
p('```');
p('');
p('Look that id up in [`docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json`](../folio-Master-Flows-and-Endpoints/registers/endpoint-register.json)');
p('under `current_configuration`. The `flow_name` beside it is the flow to export. If two flows in');
p('the tenant carry that name, open each and compare its trigger URL to the configured one: only');
p('one will match.');
p('');
p('## Appendix C · If something is wrong');
p('');
p('**Every caller refused after setting the switch.** Expected, if the IP_OTP_VERIFY package is not in yet.');
p('Paste it, or set the switch back; nothing is damaged in the meantime.');
p('');
p('**Sign-in returns a token but calls still 401.** The proof is minted with `Purpose`');
p('`internal-session` and read back on exactly that value. Check the row the mint wrote.');
p('');
p('**A caller is refused near the end of a session.** The row and the response read one expiry');
p('expression, so they cannot disagree — if this happens the paste did not take the mint.');
p('');
p('**Rolling back.** Re-import the export taken in §2.1, choosing UPDATE. It is per-flow, so a bad paste is undone');
p('without touching the others.');
p('');
p('## Appendix D · What this does not do');
p('');
p('- `SCAN_INTAKE` is not in this list and must not be. It takes the tenant-authenticated');
p('  principal header, which is a stronger identity than a bearer proof.');
p('- Obligations 5, 6 and 7 of [`AUTHENTICATION_CONTRACT.md`](../architecture/AUTHENTICATION_CONTRACT.md)');
p('  §2 — per-action authorisation, idempotency, and server-side audit of the proof-derived');
p('  identity — are untouched by this build and keep G-04 open after the paste.');
p('- The proof is an opaque token in a ledger, not a signed structure. Power Automate has no HMAC');
p('  function. The ledger is what makes the token mean anything, and revoking one is a `Consumed`');
p('  flag rather than a key rotation.');
p('');

/* PARTS 2 TO 5, CARRIED RATHER THAN RESTATED.
 *
 * Four separate runbooks used to stand beside this one: the install route and estate reference,
 * portal commissioning, notifications, and the governance estate — 4,038 lines across four files,
 * each calling itself a runbook. An operator asking "which runbook do I follow" had four answers
 * and no way to choose.
 *
 * They are one runbook now, in parts, because the work really is sequential: the route before the
 * installs, the installs before the portal is commissioned, and the governance estate alongside.
 * Their bodies live in scripts/runbook-parts/ and are embedded here verbatim rather than
 * rewritten — rewriting 4,000 lines of tenant procedure to make it shorter is how steps that
 * somebody depended on quietly stop existing. Heading levels are demoted one so the parts nest
 * under this document rather than competing with it. */
const PARTS = join(ROOT, 'scripts/runbook-parts');
const partFiles = readdirSync(PARTS).filter((f) => f.endsWith('.md')).sort(byteCompare);
L.push('---', '');
L.push('# Parts 2\u20135 \u2014 the standing procedures', '');
L.push('Phases 0 to 3 above are the work in front of you. What follows is the rest of the estate\u2019s');
L.push('tenant procedure, carried here so there is one runbook rather than five. Nothing below is');
L.push('rewritten: these are the four documents that used to stand separately, in the order they run.');
L.push('');
for (const [n, f] of partFiles.entries()) {
  /* Links in the parts are written relative to scripts/runbook-parts/, so they resolve where the
     file actually sits and the reference checker can verify them there. Rebase on the way in,
     because once embedded they are read from docs/deployment/. One source, correct in both
     places, and no exclusion carved into the checker for a directory it ought to be reading. */
  const raw = readFileSync(join(PARTS, f), 'utf8').replace(/\r\n/g, '\n').trimEnd()
    .replace(/\]\(\.\.\/\.\.\/docs\/deployment\//g, '](./')
    .replace(/\]\(\.\.\/\.\.\/docs\//g, '](../');
  const lines = raw.split('\n');
  const title = (lines.find((l) => l.startsWith('# ')) || `# ${f}`).replace(/^#\s*/, '');
  L.push(`## Part ${n + 2} \u00b7 ${title}`, '');
  /* Demote every ATX heading by one, outside fenced blocks. A `#` inside a code fence is a shell
     comment, not a heading, and promoting it would corrupt the command it belongs to. */
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^#{1,5} /.test(line)) {
      if (line.startsWith('# ')) continue;          // the part title, already emitted
      L.push('#' + line);
    } else {
      L.push(line);
    }
  }
  L.push('');
}

const built = L.join('\n');

if (process.argv.includes('--check')) {
  const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
  if (current !== built) {
    console.log(`\n\u274c ${relative(ROOT, OUT)} drifted. Run: npm run runbook\n`);
    process.exit(1);
  }
  const migrations = rows.filter((r) => r.recon.some((x) => x.verdict === 'MIGRATION' && !x.settled));
  const unmapped = rows.filter((r) => r.mapped.length !== r.keys.length);
  console.log('\n\u2705 the proof cutover runbook matches the estate');
  console.log(`   ${rows.length} package(s): ${rows.filter((r) => r.role === 'mints').length} mints the proof, ${rows.filter((r) => r.role === 'verifies').length} verify`);
  if (unmapped.length) {
    console.log(`   \u274c ${unmapped.length} package(s) have a key the mapping does not name:`);
    for (const r of unmapped) console.log(`      ${r.pkg}`);
    console.log('');
    process.exit(1);
  }
  console.log('   every package\u2019s flow is named by docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json');
  if (migrations.length) {
    console.log(`   \u26a0 ${migrations.length} package(s) target a flow the estate is not wired to \u2014 a migration, flagged on the row:`);
    for (const r of migrations) {
      for (const x of r.recon.filter((y) => y.verdict === 'MIGRATION' && !y.settled)) {
        console.log(`      ${x.contractKey}: intended ${x.intendedFlow.flowId.slice(0, 8)}, wired ${x.wiredFlowIds.map((f) => f.slice(0, 8)).join(', ')}`);
      }
    }
  }
  console.log('');
  process.exit(0);
}

writeFileSync(OUT, built);
console.log(`Wrote ${relative(ROOT, OUT)} \u2014 ${rows.length} package(s), `
  + `${rows.filter((r) => r.recon.some((x) => x.verdict === 'MIGRATION' && !x.settled)).length} migration(s) flagged.`);
