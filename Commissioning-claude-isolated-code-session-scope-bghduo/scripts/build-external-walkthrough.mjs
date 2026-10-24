#!/usr/bin/env node
/**
 * What is left, in the order it can actually be done, by whoever can do it.
 *
 *   npm run external
 *   npm run external -- --check
 *
 * WHY THIS EXISTS
 *
 * Every item that could be closed inside this repository is closed. The ones that remain — 58 at
 * the time of writing — share one property: none of them can be finished here. They need a tenant
 * session, an institutional decision, or an observation only a live run can make.
 *
 * That is not the same as saying "the rest is someone else's problem". The estate already knows,
 * per item, who can act, what would decisively close it, and what must go first — the master
 * register carries all three. What it does not do is put them in the order a person would work in,
 * or say what to bring back afterwards. So a reader with tenant access still has to assemble a
 * plan out of 58 rows, and assembles a different one each time.
 *
 * This assembles it once: the open work grouped by who can act, ordered by what the sources say
 * must go first, with the command or route for each step and — the part nothing else records —
 * WHAT TO CARRY BACK. Several items close only when a value observed in the tenant is written into
 * a file here: the seven list GUIDs the provisioner returns, the dry-run output of the first live
 * write, the re-captured list index. A step that produces a value nobody records is a step that
 * will be done twice.
 *
 * WHAT IT IS NOT
 *
 * It is not a new source of truth and it closes nothing. Every step is an open item from
 * MASTER_REGISTER.json, carrying that item's own id, owner and closure criterion. When an item
 * closes in its register, its step leaves this document on the next build.
 *
 * It also does not decide. Where the register says a decision is needed, the step says who decides
 * and what the decision is between — never which way it should go.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const MASTER = 'docs/deployment/MASTER_REGISTER.json';
const DECISIONS = 'docs/reference/REGISTRY_DECISIONS.json';
const GOVERNANCE = 'docs/reference/governance-estate-position.json';
const SEED = 'docs/reference/FLOW_REGISTRY_SEED.json';
const TARGET_MD = 'docs/deployment/EXTERNAL_EXECUTION.md';
const TARGET_JSON = 'docs/deployment/EXTERNAL_EXECUTION.json';

const master = read(MASTER);
const decisions = existsSync(join(ROOT, DECISIONS)) ? read(DECISIONS) : null;
const governance = read(GOVERNANCE);
const seed = existsSync(join(ROOT, SEED)) ? read(SEED) : null;

const items = master.items;
const byId = new Map(items.map((i) => [i.id, i]));

/* ------------------------------------------------------------------ *
 * Tracks — grouped by who holds the access, not by subject
 *
 * A person cannot do half a track: tenant work needs a Power Automate session, governance work
 * needs SharePoint administration, decisions need authority. Grouping by subject would scatter one
 * person's work across four headings and hand nobody a session they can finish.
 * ------------------------------------------------------------------ */

const TRACKS = [
  {
    id: 'live-call',
    title: 'Prove a write reaches the tenant',
    who: 'operator',
    access: 'A Power Automate session on the machine that will host the platform.',
    why: 'Five open items wait on this one and nothing else: it is the deepest root in the whole estate. Until one write is proven to reach the tenant from outside the designer, every APPLIED_UNVERIFIED item stays unverified no matter what else is done.',
    match: (i) => i.actor === 'operator' && (i.blocking.length > 0 || i.id === 'ITEM-2'),
  },
  {
    id: 'operator',
    title: 'The rest of the operator’s tenant work',
    who: 'operator',
    access: 'The same session, after the first track.',
    why: 'Each of these is an action in the tenant whose outcome nothing here can read. They are listed after the first track because most of them wait on it.',
    match: (i) => i.actor === 'operator',
  },
  {
    id: 'governance',
    title: 'Governance lists and the flow registry',
    who: 'tenant administrator, with the platform technical owner',
    access: 'SharePoint administration on DGO_ECM_GOVERNANCE, and a browser.',
    why: 'The ten governance lists exist and carry duplicates; the seven registry lists do not exist at all. The provisioner for the second is complete and has never been run.',
    match: (i) => i.source === 'governance' || i.actor === 'tenant administrator',
  },
  {
    id: 'decisions',
    title: 'Decisions only the agency can take',
    who: 'the agency',
    access: 'Authority, not a system.',
    why: 'Nothing technical blocks these. Each is a choice the repository has framed and cannot make — and two of them gate work in the other tracks.',
    match: (i) => i.actor === 'the agency',
  },
  {
    id: 'platform',
    title: 'Platform technical owner',
    who: 'platform technical owner',
    access: 'The notification estate and the governance endpoints.',
    why: 'Correctness work on deployed flows, and the governance contract gaps.',
    match: (i) => i.actor === 'platform technical owner' || i.actor === 'governance owner',
  },
  {
    id: 'notification',
    title: 'The notification workstream',
    who: 'operational owner, and whoever owns the workstream',
    access: 'Tenant, plus institutional approvals.',
    why: 'Seventeen entries of the pending-work register and the ten findings of the notification assessment. The register states one collective completion command and no per-item criterion, so this track is ordered as its own document orders it.',
    match: () => true,          /* whatever is left */
  },
];

/* Each item lands in exactly one track, in track order, so nothing is listed twice and nothing
   is dropped. The final track takes the remainder by construction. */
const assigned = new Set();
const tracks = TRACKS.map((t) => {
  const mine = items.filter((i) => !assigned.has(i.id) && t.match(i));
  for (const i of mine) assigned.add(i.id);
  return { ...t, items: mine };
}).filter((t) => t.items.length);

/* ------------------------------------------------------------------ *
 * Ordering inside a track — the sources' own dependency graph
 * ------------------------------------------------------------------ */

const level = new Map();
function levelOf(id, seen = new Set()) {
  if (level.has(id)) return level.get(id);
  if (seen.has(id)) return 0;
  seen.add(id);
  const preds = (byId.get(id)?.blockedBy || []).filter((p) => byId.has(p));
  const n = preds.length ? Math.max(...preds.map((p) => levelOf(p, seen))) + 1 : 0;
  level.set(id, n);
  return n;
}
items.forEach((i) => levelOf(i.id));

const order = (a, b) => (level.get(a.id) - level.get(b.id))
  || (b.blocking.length - a.blocking.length)
  || (a.id < b.id ? -1 : 1);
for (const t of tracks) t.items.sort(order);

/* ------------------------------------------------------------------ *
 * What to carry back
 *
 * The part no other instrument records. A step whose outcome must be written into a file here is
 * a step that will be done twice if nobody says so. These are read from the items' own text where
 * the item states a destination, and stated explicitly where a generator's output is the
 * destination.
 * ------------------------------------------------------------------ */

const CARRY_BACK = {
  'ITEM-2': 'The dry-run console output, recorded against the flow it was run on — the item’s own validation names exactly this.',
  'ITEM-23': 'The provisioner’s index pass report: it must read 5 already indexed.',
  'ITEM-30': 'A telemetry row carrying a run record.',
  'ITEM-40': 'An export of each endpoint trigger showing method POST and a request schema.',
  'ITEM-41': 'The recorded decision, and if approval is to be off, a read-back confirming EnableModeration is false.',
  'GOV-01': 'The seven list GUIDs the provisioner returns, into docs/reference/governance-list-registry.json — until they are recorded, the repository goes on describing those lists as unprovisioned.',
  'GOV-02': 'Confirmation that the seventeen renamed duplicates are deleted, and from which site.',
  'GOV-06': 'Nothing here: this closes when DGO_HTTPFlowRegistry carries FlowId and WorkflowId in one row, which is the registry stand-up below.',
};

/* Commands the estate already owns for a step. Cited, never restated: the runbook owns the steps
   themselves, and tests/single-source-of-truth.test.mjs holds one document to each instruction. */
const COMMANDS = {
  'ITEM-2': ['npm run console:apply', 'npm run commission'],
  'ITEM-23': ['npm run indextargets'],
  'GOV-01': ['npm run governance:registryprovisioner', 'npm run governance:registry'],
  'GOV-02': ['npm run governance:cleanup'],
  'ITEM-40': ['npm run triggerauth'],
  'ITEM-9': ['npm run catalogue'],
};

/* ------------------------------------------------------------------ *
 * The registry stand-up — the one piece of work that is ready end to end
 * ------------------------------------------------------------------ */

const registry = seed ? {
  rows: seed.totals.registryRows,
  dependencies: seed.totals.dependencyRows,
  lists: 7,
  columns: 102,
  blockedBy: decisions ? decisions.totals.toAuthor : null,
  toRatify: decisions ? decisions.totals.toRatify : null,
  steps: [
    { do: 'Run the provisioner in a browser on DGO_ECM_GOVERNANCE.', by: 'tenant administrator', via: 'npm run governance:registryprovisioner emits it; it is dry-run by default.' },
    { do: 'Record the seven GUIDs it returns.', by: 'tenant administrator', via: 'docs/reference/governance-list-registry.json' },
    { do: 'Ratify or override the proposed SystemName and Criticality.', by: 'the agency', via: 'docs/reference/REGISTRY_DECISIONS.md' },
    { do: 'Supply a technical owner for every flow.', by: 'the agency', via: 'The one column nothing can propose.' },
    { do: 'Seed the rows.', by: 'operator', via: 'docs/reference/FLOW_REGISTRY_SEED.json' },
  ],
} : null;

/* ------------------------------------------------------------------ *
 * Compose
 * ------------------------------------------------------------------ */

const step = (i, n) => ({
  n,
  id: i.id,
  title: i.title,
  source: i.source,
  actor: i.actor,
  owner: i.owner,
  what: i.what,
  why: i.why,
  state: i.state,
  actions: i.actions,
  inputs: i.inputs,
  closesWhen: i.triggerEstablished ? i.trigger : null,
  closureNotEstablished: i.triggerEstablished ? null : (i.wouldEstablish || 'The source states no closure criterion.'),
  validation: i.validation,
  waitsOn: i.blockedBy,
  waitedOnBy: i.blocking,
  topology: i.topology,
  level: level.get(i.id),
  commands: COMMANDS[i.id] || [],
  carryBack: CARRY_BACK[i.id] || null,
});

let n = 0;
const plan = tracks.map((t) => ({
  id: t.id, title: t.title, who: t.who, access: t.access, why: t.why,
  steps: t.items.map((i) => step(i, ++n)),
}));

const doc = {
  schema: 'dgo-external-execution/v1',
  generatedBy: 'npm run external',
  purpose: 'Everything that cannot be finished inside this repository, grouped by who can act, ordered by what the sources say must go first, with what to carry back. Generated from MASTER_REGISTER.json; it closes nothing and holds no item of its own.',
  totals: {
    open: items.length,
    tracks: plan.length,
    statingAClosureCriterion: items.filter((i) => i.triggerEstablished).length,
    gatingCommissioning: (master.gatingCommissioning || []).length,
    carryBackSteps: Object.keys(CARRY_BACK).filter((k) => byId.has(k)).length,
  },
  registryStandUp: registry,
  governanceRunbookState: (governance.openFindings || [])
    .filter((f) => f.blocksNote && /Step \d/.test(f.blocksNote))
    .map((f) => ({ id: f.id, ordering: f.blocksNote })),
  tracks: plan,
};

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
const cut = (s, m) => { const t = esc(s); return t.length > m ? `${t.slice(0, m - 1)}…` : t; };
const list = (a) => (a && a.length
  ? (a.every((x) => /^\s*\d+[.)]\s/.test(String(x)))
    ? a.map((x) => esc(x)).join('\n')
    : a.map((x) => `- ${esc(x)}`).join('\n'))
  : '_none stated_');

const md = `# What is left, and who can do it

**Generated by \`npm run external\` from [\`MASTER_REGISTER.json\`](./MASTER_REGISTER.json).**
Do not edit by hand — \`npm run test:external\` fails on drift.

> **${doc.totals.open} items remain, and not one of them can be finished in this repository.**
> Every item that could be closed here has been. What is left needs a tenant session, an
> institutional decision, or an observation only a live run can make.
>
> They are grouped below by **who holds the access**, because a person cannot do half a track —
> and ordered inside each by what the sources themselves say must go first.

## Before anything else

**${(master.gatingCommissioning || []).length} of the ${doc.totals.open} stand between this estate and a
commissioned endpoint surface.** The rest is real work that does not gate it.

The deepest root is **\`ITEM-2\`** — one write proven to reach the tenant from outside the designer.
${(byId.get('ITEM-2')?.blocking || []).length} items wait on it and nothing else. Until it is done,
every \`APPLIED_UNVERIFIED\` item stays unverified however much else is finished.

${registry ? `**One piece of work is ready end to end.** The flow registry — the single register of
every flow this estate has — needs no new analysis: the provisioner emits ${registry.lists} lists
and ${registry.columns} columns with nothing deferred, and ${registry.rows} rows are built and
waiting in [\`FLOW_REGISTRY_SEED.json\`](../reference/FLOW_REGISTRY_SEED.json). What it needs is
${registry.blockedBy} values a person must author and ${registry.toRatify} proposals to ratify.
See the end of this document.` : ''}

---

${plan.map((t) => `## ${t.title}

**Who** ${t.who}
**Access** ${t.access}

${t.why}

${t.steps.map((s) => `### ${s.n}. ${esc(s.title)}

\`${s.id}\` · ${s.source} · \`${s.topology}\`${s.waitsOn.length ? ` · waits on ${s.waitsOn.map((x) => `\`${x}\``).join(', ')}` : ''}${s.waitedOnBy.length ? ` · **${s.waitedOnBy.length} item${s.waitedOnBy.length === 1 ? '' : 's'} wait on this**` : ''}

${s.what ? esc(s.what) : ''}

**Where it stands.** ${esc(s.state)}

**Do**

${list(s.actions)}
${s.inputs && s.inputs.length ? `\n**Bring**\n\n${list(s.inputs)}\n` : ''}${s.commands.length ? `\n**Commands the estate already owns**\n\n${s.commands.map((c) => `\`${c}\``).join(' · ')}\n` : ''}
**Done when.** ${s.closesWhen ? esc(s.closesWhen) : `_Not established by the source._ ${esc(s.closureNotEstablished)}`}
${s.carryBack ? `\n**Carry back.** ${esc(s.carryBack)}\n` : ''}`).join('\n')}
`).join('\n---\n\n')}

---

${registry ? `## The flow registry, end to end

${registry.rows} rows, ${registry.dependencies} flow-to-list edges, ${registry.lists} lists that do
not exist yet. Nothing here needs analysis; it needs a tenant session and four columns.

| | Do | Who | Where |
|---:|---|---|---|
${registry.steps.map((s, k) => `| ${k + 1} | ${esc(s.do)} | ${esc(s.by)} | ${esc(s.via)} |`).join('\n')}

**The four columns are the whole blocker.** ${registry.toRatify} of the blanks are proposals to
ratify or override; ${registry.blockedBy} must be authored, of which every row needs a technical
owner. See [\`REGISTRY_DECISIONS.md\`](../reference/REGISTRY_DECISIONS.md).

` : ''}## The one ordering that is irreversible

${doc.governanceRunbookState.length
    ? doc.governanceRunbookState.map((g) => `**${g.id}** — ${esc(g.ordering)}`).join('\n\n')
    : '_No source states an ordering constraint over the governance runbook._'}

---

## How to check any of this

\`\`\`bash
npm run master        # every open item, with what would close it
npm run outstanding   # the total, across all five registers
npm run external      # regenerate this document
npm run commission    # what a commissioning run reports today
\`\`\`

Every step above is an open item in a register. When the register says it has closed, the step
leaves this document on the next build. **Where this document and a command disagree, the command
governs.**
`;

const outputs = [[TARGET_MD, md], [TARGET_JSON, `${JSON.stringify(doc, null, 2)}\n`]];

if (CHECK) {
  const drifted = outputs.filter(([p, body]) => {
    const abs = join(ROOT, p);
    return !existsSync(abs) || readFileSync(abs, 'utf8') !== body;
  });
  if (!drifted.length) {
    console.log(`\n  ✅ the external walkthrough matches the register — ${doc.totals.open} items, ${plan.length} tracks.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${drifted.map(([p]) => p).join(' and ')} drifted from the register.`);
  console.error('     Run: npm run external\n');
  process.exit(1);
}

for (const [p, body] of outputs) writeFileSync(join(ROOT, p), body);

console.log('\nWhat is left, and who can do it\n');
for (const [p] of outputs) console.log(`  wrote ${p}`);
console.log(`\n  ${String(doc.totals.open).padStart(4)}  items, none finishable in this repository`);
for (const t of plan) console.log(`  ${String(t.steps.length).padStart(4)}  ${t.title} — ${t.who}`);
console.log(`\n  ${String(doc.totals.carryBackSteps).padStart(4)}  step(s) produce a value that must be written back here`);
console.log('');
