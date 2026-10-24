#!/usr/bin/env node
/**
 * Assemble the paste-ready packages into numbered folders and a single archive.
 *
 * WHY A SCRIPT AND NOT A HAND-BUILT ZIP
 *   An archive assembled by hand is a fifteenth copy of every package that nothing keeps in step
 *   with the fourteen. This reads the validated files, refuses to build if any of them fails
 *   forensic validation, and writes each flow's README from the package itself — action count,
 *   variables, lists touched — so the folder cannot describe something the file does not do.
 *
 * NOTHING FROM dist/ EVER ENTERS THIS. That tree is git-ignored because it embeds live signed
 * trigger URLs, and a signed URL is a bearer credential. The archive is scanned for one before it
 * is written, and the build fails rather than shipping it.
 *
 *     node scripts/package-flow-bundle.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STAMP = new Date().toISOString().slice(0, 10);
const OUT = join(ROOT, 'dist-bundle', `dgo-flow-packages-${STAMP}`);
const INDEX = JSON.parse(readFileSync(join(ROOT, 'docs/reference/sharepoint-list-index.json'), 'utf8')).lists;
const RESOLUTION = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/sharepoint/evidence/2026-08-31-portal-paste-target-resolution.json'), 'utf8')).resolution;
const TARGETS = JSON.parse(readFileSync(join(ROOT, 'docs/reference/internal-paste-targets.json'), 'utf8')).packages;

/* A bundle assembled from packages that have not passed validation is a faster way to paste a
   defect. This is the gate, and it is not skippable. */
try { execFileSync('node', [join(ROOT, 'scripts/forensic-validate-packages.mjs')], { stdio: 'pipe' }); }
catch (e) { console.error('❌ forensic validation fails — the bundle is not built.\n' + e.stdout); process.exit(1); }

const INTERNAL_ORDER = [
  ['DGO_OTP', 'OTP_GENERATE, OTP_VERIFY', 'Nothing else can authenticate a caller'],
  ['DGO_FETCH_ALL', 'FETCH_ALL', 'The boot call — the read spine'],
  ['DGO_REFERENCE_DATA', 'REFERENCE_DATA', 'The other half of the read spine'],
  ['DGO_GET_DOCS', 'GET_DOCS', 'Narrower read'],
  ['DGO_SINGLE_ASSIGNMENT', 'SINGLE_ASSIGNMENT', 'First write'],
  ['DGO_BULK_ASSIGNMENT', 'BULK_ASSIGNMENT, BULK_ASSIGNMENT_DIRECT', 'Batch of the same write'],
  ['DGO_DYNAMIC_GLOBAL_ACTIONS', 'DYNAMIC_ACTIONS, EMAIL, DISPATCH_OUTBOUND, ARCHIVE_REFERENCE', 'The operation switch'],
  ['DGO_SEND_EMAIL', 'EMAIL', 'Last: it is the only one that sends mail as the registry, and the directory it gates on must already be readable'],
];

function describe(dir, flow) {
  const sv = JSON.parse(readFileSync(join(dir, `${flow}.designer-paste.json`), 'utf8')).serializedValue;
  let actions = 0; const lists = new Map(); const conns = new Set();
  (function walk(a) {
    for (const v of Object.values(a || {})) {
      if (!v || typeof v !== 'object') continue;
      actions++;
      const t = String(v.inputs?.parameters?.table || '').toLowerCase();
      if (t && INDEX[t]) lists.set(t, INDEX[t].title);
      if (v.inputs?.host?.connection) conns.add(v.inputs.host.connection);
      walk(v.actions); walk(v.else?.actions);
      if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
      walk(v.default?.actions);
    }
  })(sv.actions);
  const vp = JSON.parse(readFileSync(join(dir, `${flow}.variables.designer-paste.json`), 'utf8'));
  const vars = Object.values(vp.serializedValue.actions).map((a) => a.inputs.variables[0]);
  return { actions, lists: [...lists.values()].sort(), conns: [...conns].sort(), vars, scope: vp.nodeId };
}

const flowReadme = (flow, d, serves, why, target) => `# ${flow}

${serves ? `**Serves:** ${serves}\n` : ''}${why ? `**Why in this position:** ${why}\n` : ''}${target ? `**Paste into:** ${target}\n` : ''}
**${d.actions} actions.** Connections used: ${d.conns.join(', ')}.

## Paste these two files, in this order

### 1. \`${flow}.variables.designer-paste.json\`

Power Automate accepts *Initialize variable* only at a workflow's **top level**. A clipboard
package is a scope, so pasted declarations land nested — and the designer refuses to **save** a
definition that still has them nested. It does **not** refuse the paste. That distinction is what
makes this work:

1. Paste this file.
2. Drag every *Initialize variable* action **out** of \`${d.scope}\` to the top level, keeping this order.
3. Delete the now-empty \`${d.scope}\` scope.
4. Only then continue to step 2 below, and save.

Saving between 1 and 3 is the one thing that fails, and it fails safely: the designer refuses and
the flow is unchanged.

| # | Variable | Type | Initial value |
|---|---|---|---|
${d.vars.map((v, i) => `| ${i + 1} | \`${v.name}\` | ${v.type} | ${v.value === '' ? '*(empty string)*' : `\`${typeof v.value === 'string' ? v.value : JSON.stringify(v.value)}\``} |`).join('\n')}

### 2. \`${flow}.designer-paste.json\`

Paste it, then save.

**On the first paste of the session, check one thing:** every action must arrive already bound to
its connection, with **no connection picker shown**. If a picker appears, stop — you are in the
wrong Power Automate environment and the connection ids will not resolve.

## SharePoint lists this flow touches

${d.lists.length ? d.lists.map((l) => `- ${l}`).join('\n') : '_None._'}
`;

rmSync(join(ROOT, 'dist-bundle'), { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* preflight */
const pf = join(OUT, '00-PREFLIGHT');
mkdirSync(pf);
copyFileSync(join(ROOT, 'scripts/preflight-internal-flows.browser.js'), join(pf, 'preflight-internal-flows.browser.js'));
writeFileSync(join(pf, 'README.md'), `# Run this first

Sign in to https://nitdanigeria.sharepoint.com, open any page on any of the sites, open devtools →
Console, and paste \`preflight-internal-flows.browser.js\`.

It only ever **reads**. It checks every list the internal flows touch, every column they
write or filter on, the two indexes, and the three seed conditions the authorisation gate depends
on — then draws the verdict **on the page**, so it can be read without scrolling a console.

Do not paste any flow until it says **READY TO PASTE**.

If it says **INCONCLUSIVE — NOTHING WAS MEASURED**, every request failed before reaching
SharePoint. That says nothing about the tenant: check browser shields, extensions, the network,
and that you are signed in. Run it again.

**What it cannot check:** whether the two connection references resolve in your Power Automate
environment. A connection is an environment resource, not a SharePoint one. You see that on the
first paste — every action arrives already bound, no connection picker.
`);

const built = [];
INTERNAL_ORDER.forEach(([flow, serves, why], i) => {
  const src = join(ROOT, 'docs/deployment/internal/flows/designer-paste');
  const folder = join(OUT, '01-INTERNAL-FLOWS', `${String(i + 1).padStart(2, '0')}-${flow}`);
  mkdirSync(folder, { recursive: true });
  for (const f of [`${flow}.designer-paste.json`, `${flow}.variables.designer-paste.json`])
    copyFileSync(join(src, f), join(folder, f));
  const d = describe(src, flow);
  const t = TARGETS.find((x) => x.package === flow);
  /* A target with no workflow id is not a formatting problem to paper over: it means this
     repository cannot say which flow the endpoint's URL resolves to, and the README has to say
     that rather than print `workflow null`. */
  const target = t ? t.targets.map((x) => (x.workflowId
    ? `\`${x.flow}\` — workflow \`${x.workflowId}\` (serves ${x.contractKey})`
    : `${x.flow} (serves ${x.contractKey})`)).join('\n**and** ') : null;
  writeFileSync(join(folder, 'README.md'), flowReadme(flow, d, serves, why, target)
    + (t && t.targets.length > 1 ? `\n## This package replaces ${t.targets.length} flows with one\n\nIt answers ${t.targets.map((x) => x.contractKey).join(' and ')} on a single flow, switching on the\nrequested action. Paste it into ONE of the two above; the other then serves nothing and should be\nturned off — not deleted — until the replacement is confirmed working.\n` : ''));
  built.push({ estate: 'internal', flow, ...d });
});

const psrc = join(ROOT, 'docs/deployment/sharepoint/flows/designer-paste');
for (const f of readdirSync(psrc).filter((x) => x.endsWith('.designer-paste.json') && !x.includes('.variables.')).sort()) {
  const flow = f.replace('.designer-paste.json', '');
  const r = RESOLUTION.find((x) => x.package === flow);
  const folder = join(OUT, '02-PORTAL-FLOWS', flow);
  mkdirSync(folder, { recursive: true });
  for (const g of [`${flow}.designer-paste.json`, `${flow}.variables.designer-paste.json`])
    copyFileSync(join(psrc, g), join(folder, g));
  const d = describe(psrc, flow);
  const target = r ? `\`${r.targetDisplayNameNow}\` — workflow \`${r.targetFlowId}\`${r.status.startsWith('OPEN') ? ' — **UNCONFIRMED, see the warning below**' : ''}` : null;
  writeFileSync(join(folder, 'README.md'), flowReadme(flow, d, null, null, target)
    + (r && r.note ? `\n## On the paste target\n\n${r.note}\n` : ''));
  built.push({ estate: 'portal', flow, ...d });
}

writeFileSync(join(OUT, '02-PORTAL-FLOWS', 'READ-THIS-FIRST.md'), `# The portal set is NOT cleared to paste

The internal flows in \`01-INTERNAL-FLOWS\` are cleared by the preflight. **These are not**,
for two reasons that have nothing to do with the packages themselves.

## 1. Two paste targets are unconfirmed

\`Portal_VERIFY_CONFIRM_ECM_DOCS\` and \`Portal_WRITEBACK_ECM_DOCS\` name workflow ids that have no
export in the repository, so nothing here can say what they currently contain. Export both from
the environment and read them before pasting.

## 2. The UPLOAD target is the sanctioned crossing — open item 37

\`Portal_UPLOAD_ECM_DOCS\` targets workflow \`df7ddff1-9275-4f23-acf6-e169525f4e2f\`. That is the
same workflow the specification calls the single sanctioned crossing between the public portal
estate and the internal platform. It was exported twice: on 2026-08-19 as \`ECM_DOCS_INTAKE\` with
2 actions and a Portal Registry read, and on 2026-08-24 as \`CG_Upload_Endpoint\` with 9 actions and
**no Portal Registry read at all**.

Whatever that bridge is meant to be, **pasting UPLOAD writes over it**, and the paste would look
successful. Settle open item 37 first.

## Also true of all seven portal packages

Every one of them reads \`Flow Configuration\` on the internal operations site for its allowed CORS
origins. That crossing is accepted under decision D16, bounded to one list, one operation and one
column. It is not a defect; it is a decision you should know you are acting on.
`);

const readme = `# DGO flow packages — ${STAMP}

Power Automate designer clipboard packages, one folder per flow, each with the variables package
it needs and a README carrying that flow's paste steps.

Built by \`scripts/package-flow-bundle.mjs\` from files that pass
\`scripts/forensic-validate-packages.mjs\` — the build refuses to run otherwise.

## Order

1. **\`00-PREFLIGHT\`** — run it. Do not paste anything until it says READY TO PASTE.
2. **\`01-INTERNAL-FLOWS\`** — eight flows, numbered in paste order. Take them in that order:
   OTP first because nothing else can authenticate a caller; the reads before the writes.
3. **\`02-PORTAL-FLOWS\`** — **read \`READ-THIS-FIRST.md\` before touching these.** Two targets are
   unconfirmed and one would overwrite the sanctioned crossing.

## Every paste is an EDIT to a flow that already exists

Nothing here creates a flow. Each package is a scope pasted into the designer of a live flow, and
each folder's README names the one it belongs to, by flow name and workflow id.

**A pasted scope is ADDED, not swapped in.** The target already has actions answering its trigger,
so after the paste it has both. Before you save, decide what happens to what was there — and
**export the flow first**: that export is the only way back, and this repository does not hold one
for any internal flow.

## Every flow, the same two steps

Paste \`<FLOW>.variables.designer-paste.json\`, drag the declarations to the top level, delete the
empty scope, then paste \`<FLOW>.designer-paste.json\` and save. Each folder's README spells it out
with that flow's own variables.

## What is in each package

| Flow | Actions | Variables | Lists touched |
|---|---:|---:|---|
${built.map((b) => `| ${b.estate === 'internal' ? '' : '*(portal)* '}${b.flow} | ${b.actions} | ${b.vars.length} | ${b.lists.length} |`).join('\n')}

## Two things nothing in here can settle

**The connections.** Both are bound in every package — SharePoint
\`3f1943c5955a4cb8b301e8f22f2b590d\` and Office 365 \`c0b9e7a5b0854c39a435fd8ce92f48ad\` — and they
resolve only in the environment those ids belong to. You will see it on the first paste: every
action arrives already bound, with no connection picker. If a picker appears, stop.

**Content approval.** Turned OFF for \`DGO DIGITAL OPS\` on 2026-09-01, after a count found 14,882
of its 21,532 rows sitting **Pending** and invisible — every write since it was switched on. It is
still ON for \`Global Tracking Queue\` (12,079 of 15,936 hidden), and four of the seven internal
flows write to that list, so a row they create there lands Pending and is invisible until approved.
Decide that one before the first write test, or you will debug a success. Counts and the applied
change: \`docs/deployment/sharepoint/evidence/2026-09-01-content-approval-counts.json\`.

## No credentials

Nothing here carries a trigger URL. A signed Power Automate URL is a bearer credential; the build
scans the archive for one and fails rather than shipping it.
`;
writeFileSync(join(OUT, 'README.md'), readme);

/* Refuse to ship a credential. */
const suspicious = [];
(function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { scan(p); continue; }
    const t = readFileSync(p, 'utf8');
    if (/sig=[A-Za-z0-9_%\-]{20,}/.test(t)) suspicious.push(p);
  }
})(OUT);
if (suspicious.length) { console.error('❌ signed trigger URL found in: ' + suspicious.join(', ')); process.exit(1); }

const zip = join(ROOT, 'dist-bundle', `dgo-flow-packages-${STAMP}.zip`);
execFileSync('zip', ['-rq', zip, `dgo-flow-packages-${STAMP}`], { cwd: join(ROOT, 'dist-bundle') });
console.log(`Wrote ${zip}`);
console.log(execFileSync('unzip', ['-l', zip], { encoding: 'utf8' }).split('\n').slice(-2)[0].trim());
