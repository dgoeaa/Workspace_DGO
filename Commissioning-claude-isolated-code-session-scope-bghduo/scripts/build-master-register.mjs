#!/usr/bin/env node
/**
 * The master register — every open item in the estate, on one page, with what closes it.
 *
 *   npm run master
 *   npm run master -- --check      # fail if the written documents have drifted
 *
 * WHY THIS EXISTS
 *
 * `npm run outstanding` answers HOW MUCH is left: 87 items across five sources. It deliberately
 * does not answer WHAT ANY OF THEM NEEDS — it exists to stop work hiding, not to plan it. So the
 * next question after the total has no command behind it: for each of those 87, what is it, why is
 * it there, where does it stand, what has to happen, what would decisively close it, and can it be
 * done now or must something else go first.
 *
 * Answering that by reading five documents in four formats is how the estate got into the state
 * this baseline was corrected for. Two of the five name no owner per item; three carry no status
 * convention at all; one states a closure criterion and four do not. A person reconstructing that
 * by hand reconstructs it differently each time, and the differences are what reopen closed work.
 *
 * WHAT IS DERIVED AND WHAT IS READ
 *
 * READ: what it is, why it is, current state, actions, inputs, closure trigger, owner, severity.
 * Each comes from its source or is absent. Where a source states none, this prints
 * `not established by the source` and names what would establish it. That gap is a finding about
 * the estate — 56 of 87 items have no stated closure criterion — and filling it with a plausible
 * sentence would hide it.
 *
 * DERIVED: execution topology, and only from ordering relations the sources themselves state —
 * a dependency naming another item's id, or a sentence that constrains order. The derivation is
 * printed beside each verdict as the sentence it rests on, so it can be checked rather than
 * trusted. An item with no stated relation is reported as `PARALLEL-EXECUTION-NEUTRAL`, and the
 * document says in those words that this means the record states no constraint — not that one has
 * been proven absent.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not prioritise, schedule, or close anything. Status lives in the five sources. An item
 * leaves this document when its source says it has closed.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAll, actorOf, SOURCES_PATH as SOURCES } from './lib/outstanding-sources.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TARGET_MD = 'docs/deployment/MASTER_REGISTER.md';
const TARGET_JSON = 'docs/deployment/MASTER_REGISTER.json';
const CHECK = process.argv.includes('--check');

const { declared, results, problems, uncounted } = readAll(ROOT);
if (problems.length) {
  console.error('\n  ✖  Master register could not read every declared source:\n');
  for (const p of problems) console.error(`     ${p}`);
  console.error(`\n     Sources are declared in ${SOURCES}.\n`);
  process.exit(2);
}

const all = results.flatMap((r) => r.entries);
const open = all.filter((e) => e.open);
const byId = new Map(all.map((e) => [e.id, e]));
const sourceTitle = new Map(results.map((r) => [r.src.id, r.src.title]));

/* ------------------------------------------------------------------ *
 * The dependency graph the sources state
 * ------------------------------------------------------------------ */

/* Ids are disjoint across the five sources by construction — ITEM/G/CFG/MANUAL in the readiness
   register, GOV in the governance position, P in the pending-work register, F in the notification
   assessment, B/S/C in the flow-truth review — so an id found in prose resolves to exactly one
   item wherever it was written. An id that resolves to nothing is NOT dropped: it is carried as an
   unresolved reference and reported, because a prerequisite naming something no counted source
   holds is either a sixth register or a stale citation, and both matter. */
const unresolved = [];
for (const e of all) {
  e.deps = (e.deps || []).filter((d) => d !== e.id);
  for (const d of e.deps) if (!byId.has(d)) unresolved.push({ from: e.id, names: d, source: e.source });
}

const dependents = new Map();
for (const e of all) {
  for (const d of e.deps) {
    if (!dependents.has(d)) dependents.set(d, []);
    dependents.get(d).push(e.id);
  }
}

const isOpen = (id) => byId.has(id) && byId.get(id).open;

/* Ids sort by prefix then by number, not lexically: ITEM-9 before ITEM-12, and GOV-11 reads
   `B1 … B7` rather than `B1, B7, B2 …` in the order the patterns happened to find them. A
   generated document whose lists reorder on a whim fails its own --check for no reason.
   Codepoint comparison, deliberately: the locale-aware string comparator orders by the host's
   locale and ICU build, so a document generated on one machine fails --check on another.
   tests/preflight-addressing.test.mjs bans it by name from every generator that writes a tracked
   file — by scanning the source text, which is why the name is not written here either. */
const natural = (a, b) => {
  const [, pa, na] = /^(\D*)(\d*)/.exec(a);
  const [, pb, nb] = /^(\D*)(\d*)/.exec(b);
  if (pa !== pb) return pa < pb ? -1 : 1;
  return Number(na) - Number(nb);
};

/* ------------------------------------------------------------------ *
 * Topology — derived only from what a source states
 * ------------------------------------------------------------------ */

const TOPOLOGY = {
  'SEQUENCE-DEPENDENT': 'Its own source names something that must come first, or names it as something that must come first for another item, or states a sentence that constrains the order. Position in the sequence is not free.',
  INDEPENDENT: 'Its source names prerequisites and every one of them has closed. It is released: it can start now, in any order relative to the rest, and nothing open is waiting on it.',
  'PARALLEL-EXECUTION-NEUTRAL': 'No source states any ordering relation involving this item, in either direction. Read this as *the record constrains nothing* — not as proof that running it alongside anything else is safe. An absence of a stated dependency is not a demonstration of independence, and four of the five sources state dependencies for no item at all.',
};

function topologyOf(e) {
  const blockedBy = e.deps.filter(isOpen).sort(natural);
  const blocking = (dependents.get(e.id) || []).filter(isOpen).sort(natural);
  const releasedBy = e.deps.filter((d) => byId.has(d) && !byId.get(d).open).sort(natural);

  if (blockedBy.length || blocking.length || e.ordering) {
    const basis = [];
    if (blockedBy.length) basis.push(`waits on ${blockedBy.join(', ')} — still open`);
    if (blocking.length) basis.push(`${blocking.join(', ')} name${blocking.length === 1 ? 's' : ''} it as a prerequisite`);
    if (e.ordering) {
      const sentence = e.ordering.replace(/\s+/g, ' ').trim();
      /* AN ORDERING SENTENCE THAT NAMES NO ITEM IS A WEAKER CLAIM, AND IS LABELLED AS ONE.
         "must not proceed until this is settled" constrains order against a CONDITION — someone
         has to judge when it is met — where "waits on ITEM-2" constrains it against a row whose
         status a command can read. Both are order constraints and both are reported; conflating
         them would let a judgement call read as a measurement. */
      const namesAnItem = (e.deps || []).some((d) => sentence.includes(d));
      basis.push(`the source states${namesAnItem ? '' : ' a constraint against a condition rather than another item'}: "${sentence}"`);
      /* And if every prerequisite it does name has closed, say so in the same breath: the reader
         is owed the tension rather than the conservative verdict alone. */
      if (!blockedBy.length && !blocking.length && releasedBy.length) {
        basis.push(`every prerequisite it names (${releasedBy.join(', ')}) has closed, so the constraint may already be discharged — held as sequence-dependent because the sentence stands in the source and nothing here can judge the condition met`);
      }
    }
    return { topology: 'SEQUENCE-DEPENDENT', basis: basis.join('; '), blockedBy, blocking, releasedBy };
  }
  if (releasedBy.length) {
    return {
      topology: 'INDEPENDENT',
      basis: `named ${releasedBy.join(', ')} as prerequisite${releasedBy.length === 1 ? '' : 's'}; ${releasedBy.length === 1 ? 'it has' : 'all have'} closed, and nothing open names it`,
      blockedBy, blocking, releasedBy,
    };
  }
  return {
    topology: 'PARALLEL-EXECUTION-NEUTRAL',
    basis: 'no source states an ordering relation involving it, in either direction',
    blockedBy, blocking, releasedBy,
  };
}

/* ------------------------------------------------------------------ *
 * Compose each row
 * ------------------------------------------------------------------ */

/* What would establish a closure criterion for a source that states none. Read from the source's
   own declaration rather than asserted here, so the answer changes when the declaration does. */
const WOULD_ESTABLISH = {
  'pending-work': 'The register states one collective completion command — `npm run tenant:validate -- --strict` returning `ready: true` with no errors or blocked items — and no per-item criterion. Until an item states its own, the only honest closure test is the collective one, which cannot distinguish P-06 from P-14.',
  'notification-audit': 'An audit is never edited to agree with the present, so a finding cannot be closed in place. A criterion is established when an item in a tracked source supersedes it by id. None does yet.',
  'flow-truth-review': 'The review is held by `tests/flow-truth-persistence.test.mjs` (73 assertions), which names this document but asserts no finding by id. A criterion is established the moment one assertion cites a finding id — then that finding closes when its assertion passes.',
};

const rows = open.map((e) => {
  const t = topologyOf(e);
  return {
    id: e.id,
    title: e.title,
    source: e.source,
    sourceTitle: sourceTitle.get(e.source),
    actor: actorOf(e.owner),
    owner: e.owner,
    severity: e.severity,
    category: e.category,
    what: e.what,
    why: e.why,
    state: e.state || e.status,
    status: e.status,
    actions: e.actions || [],
    inputs: e.inputs || [],
    trigger: e.trigger,
    triggerEstablished: Boolean(e.trigger),
    wouldEstablish: e.trigger ? null : (WOULD_ESTABLISH[e.source] || null),
    validation: e.validation,
    ...t,
  };
});

const tally = (fn) => rows.reduce((m, r) => { const k = fn(r); m[k] = (m[k] || 0) + 1; return m; }, {});
const byTopology = tally((r) => r.topology);
const byActorCount = tally((r) => r.actor);
const bySource = tally((r) => r.source);
const withTrigger = rows.filter((r) => r.triggerEstablished).length;
const withActions = rows.filter((r) => r.actions.length).length;
const withOwner = rows.filter((r) => r.owner).length;

/* The commissioning lens: which of these stand between the estate and a commissioned endpoint
   surface, as opposed to work that is real and does not gate it. Read from the governance
   register's own blocksCommissioning field and from the readiness register's category. */
const gatesCommissioning = (r) => {
  const e = byId.get(r.id);
  if (r.source === 'governance') return e.blocksCommissioning === true;
  if (r.source === 'readiness') return ['BLOCKING', 'MANUAL_GATE', 'PROVISIONING', 'APPLY'].includes(r.category);
  return false;
};
const commissioning = rows.filter(gatesCommissioning);

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
const cut = (s, n) => { const t = esc(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const NONE = '_not established by the source_';
/* Steps that arrive already numbered ("1. Apply one flow…") are rendered as an ordered list
   rather than bulleted, so the source's own ordering survives instead of reading as `- 1.`. */
const bullets = (a) => {
  if (!a.length) return NONE;
  const numbered = a.every((x) => /^\s*\d+[.)]\s/.test(String(x)));
  return a.map((x) => (numbered ? esc(x) : `- ${esc(x)}`)).join('\n');
};
const pad = (s, n) => String(s).padStart(n);

const anchor = (id) => `#${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const link = (id) => (byId.has(id) ? `[\`${id}\`](${anchor(id)})` : `\`${id}\``);

let md = `# Master register — every open item, and what closes it

**Generated by \`npm run master\` from the five sources declared in
[\`OUTSTANDING_SOURCES.json\`](./OUTSTANDING_SOURCES.json).**
Do not edit by hand — \`npm run test:master\` fails on drift.

> **${rows.length} items are open** across ${results.length} sources.
> ${withTrigger} state what would decisively close them; **${rows.length - withTrigger} do not**.
> ${withOwner} name someone who can act; ${rows.length - withOwner} do not.
> ${byTopology['SEQUENCE-DEPENDENT'] || 0} are sequence-dependent,
> ${byTopology.INDEPENDENT || 0} independent, and
> ${byTopology['PARALLEL-EXECUTION-NEUTRAL'] || 0} carry no stated ordering relation at all.

[\`OUTSTANDING.md\`](./OUTSTANDING.md) answers *how much is left*. This answers *what each one is
and what would close it*. [\`CLOSED.md\`](./CLOSED.md) is the counterpart for the ${all.length - rows.length}
items already discharged.

---

## How to read this

Every column is either **read from the item's source** or **derived from ordering relations the
sources state**. Nothing is filled in with a plausible sentence, and the distinction is the point
of the document.

| Column | Where it comes from |
|---|---|
| What it is | The source's own description. |
| Why it is | The source's own statement of why it exists or why it is still open. |
| Current state | The source's status, or — for the three sources with no status convention — the position their own preamble states for every entry. |
| Actions, steps, inputs | The source's steps, requirements, decisions and constraints. |
| What decisively closes it | The source's resolution criterion. **${rows.length - withTrigger} of ${rows.length} items have none**, and are marked *${NONE.replace(/_/g, '')}* with what would establish one. |
| Execution topology | Derived. See below. |

### The three topologies

| Verdict | Count | What it means |
|---|---:|---|
${Object.entries(TOPOLOGY).map(([k, v]) => `| \`${k}\` | ${byTopology[k] || 0} | ${v} |`).join('\n')}

**The derivation is stated, not asserted.** Each item below carries the sentence its verdict rests
on — the prerequisite it waits for, the item that waits for it, or the ordering sentence its source
writes. Where the verdict is \`PARALLEL-EXECUTION-NEUTRAL\` the basis reads *no source states an
ordering relation involving it*, which is a statement about the record and not about the work.
Only two of the five sources state dependencies for any item; the other three state none for any,
so their entries land in that bucket by silence rather than by analysis. Treat it as *unconstrained
by the record* and verify before running two of them together.

---

## Lens 1 · By execution topology

What can start now, what must wait, and what nothing has ordered.

| Topology | Open | Items |
|---|---:|---|
${Object.keys(TOPOLOGY).map((k) => {
    const ids = rows.filter((r) => r.topology === k).map((r) => r.id);
    return `| \`${k}\` | ${ids.length} | ${ids.map(link).join(', ') || '—'} |`;
  }).join('\n')}

### The stated ordering, end to end

${(() => {
    const seq = rows.filter((r) => r.topology === 'SEQUENCE-DEPENDENT');
    if (!seq.length) return '_No source states an ordering relation between any two open items._';
    return `| Item | Waits on (open) | Waited on by (open) | The sentence it rests on |\n|---|---|---|---|\n${
      seq.map((r) => `| ${link(r.id)} | ${r.blockedBy.map(link).join(', ') || '—'} | ${r.blocking.map(link).join(', ') || '—'} | ${cut(r.basis, 200)} |`).join('\n')}`;
  })()}

## Lens 2 · By who can act

${withOwner} of ${rows.length} open items name an owner. The ${rows.length - withOwner} that do not are
not unowned work — they are work whose source carries no owner field, which is a different problem
and a smaller one to fix.

| Actor | Open | Items |
|---|---:|---|
${Object.entries(byActorCount).sort((a, b) => b[1] - a[1])
    .map(([a, n]) => `| ${a} | ${n} | ${rows.filter((r) => r.actor === a).map((r) => r.id).map(link).join(', ')} |`).join('\n')}

## Lens 3 · By source

| Source | Open | States a closure criterion | Names an owner | States an ordering relation |
|---|---:|---:|---:|---:|
${results.map((r) => {
    const mine = rows.filter((x) => x.source === r.src.id);
    return `| [${r.src.title}](${'../../' + r.src.path}) | ${mine.length} | ${mine.filter((x) => x.triggerEstablished).length} | ${mine.filter((x) => x.owner).length} | ${mine.filter((x) => x.topology !== 'PARALLEL-EXECUTION-NEUTRAL').length} |`;
  }).join('\n')}
| | **${rows.length}** | **${withTrigger}** | **${withOwner}** | **${rows.length - (byTopology['PARALLEL-EXECUTION-NEUTRAL'] || 0)}** |

## Lens 4 · Commissioning versus production readiness

${commissioning.length} of the ${rows.length} open items stand between this estate and a commissioned
endpoint surface. The rest are real work that does not gate it — governance features, notification
carriers, audit findings against a package that is not in the commissioning path.

The governance half is read, not judged: the position file carries \`blocksCommissioning\` on every
finding. **The readiness half is a judgement made here** — the register carries a category, and
this document treats \`BLOCKING\`, \`MANUAL_GATE\`, \`PROVISIONING\` and \`APPLY\` as gating and
\`CORRECTNESS\`, \`DEBT\`, \`ARCHITECTURE\` and \`UNSPECIFIED\` as not. That mapping is a choice, it is
stated here so it can be disagreed with, and it is the one line in this document that is neither
read from a source nor derived from one.

| | Item | Source | Topology | Actor |
|---|---|---|---|---|
${commissioning.map((r) => `| ⛔ | ${link(r.id)} ${cut(r.title, 66)} | ${r.source} | \`${r.topology}\` | ${r.actor} |`).join('\n')}

**Not gating commissioning** — ${rows.length - commissioning.length} items:
${rows.filter((r) => !gatesCommissioning(r)).map((r) => link(r.id)).join(', ')}

## Lens 5 · By whether anything states how to close it

The single largest gap in this estate's bookkeeping, and it is structural rather than careless.
Two sources of five state a closure criterion per item — the readiness register, which carries
\`resolutionCriteria\` on all 22, and the governance position, whose 9 close on a condition
\`npm run test:closure\` already enforces. The other three state none for any of their 56, and 43
of those state no action either: what is written down is the finding, not the remedy.

| | Open | Items |
|---|---:|---|
| States what decisively closes it | ${withTrigger} | ${rows.filter((r) => r.triggerEstablished).map((r) => r.id).map(link).join(', ')} |
| States actions but no closure criterion | ${rows.filter((r) => !r.triggerEstablished && r.actions.length).length} | ${rows.filter((r) => !r.triggerEstablished && r.actions.length).map((r) => r.id).map(link).join(', ') || '—'} |
| States neither | ${rows.filter((r) => !r.triggerEstablished && !r.actions.length).length} | ${rows.filter((r) => !r.triggerEstablished && !r.actions.length).map((r) => r.id).map(link).join(', ') || '—'} |

---

## The matrix

Every open item, every dimension, one row each. The full statement of each is in the enumeration
below; this is the index.

| Item | What it is | State | Closes when | Topology | Actor |
|---|---|---|---|---|---|
${rows.map((r) => `| ${link(r.id)} | ${cut(r.what || r.title, 90)} | ${cut(r.state, 44)} | ${r.triggerEstablished ? cut(r.trigger, 90) : '**not established**'} | \`${r.topology.replace('PARALLEL-EXECUTION-NEUTRAL', 'PARALLEL-NEUTRAL')}\` | ${cut(r.actor, 28)} |`).join('\n')}

---

## Every open item, in full

${rows.map((r) => `### ${r.id}

**${esc(r.title)}**

${[r.severity && `\`${esc(r.severity)}\``, r.category && `\`${r.category}\``,
  `source: [${r.sourceTitle}](${'../../' + results.find((x) => x.src.id === r.source).src.path})`,
  `actor: ${r.owner ? esc(r.owner) : '_not stated in the source_'}`].filter(Boolean).join(' · ')}

**What it is.** ${r.what ? esc(r.what) : NONE}

**Why it is.** ${r.why ? esc(r.why) : NONE}

**Current state.** ${esc(r.state)}

**Actions, steps and inputs required.**

${bullets(r.actions)}
${r.inputs.length ? `\n_Inputs that must be supplied:_\n\n${bullets(r.inputs)}\n` : ''}
**What decisively closes it.** ${r.triggerEstablished
  ? esc(r.trigger)
  : `${NONE}${r.wouldEstablish ? ` — ${esc(r.wouldEstablish)}` : ''}`}
${r.validation ? `\n**How closure would be checked.** ${esc(r.validation)}\n` : ''}
**Execution topology.** \`${r.topology}\` — ${esc(r.basis)}.${
  r.blockedBy.length ? ` Waits on ${r.blockedBy.map(link).join(', ')}.` : ''}${
  r.blocking.length ? ` ${r.blocking.map(link).join(', ')} wait${r.blocking.length === 1 ? 's' : ''} on it.` : ''}${
  r.releasedBy.length && !r.blockedBy.length ? ` Released by ${r.releasedBy.map(link).join(', ')}, now closed.` : ''}
`).join('\n---\n\n')}

---

## References this register could not resolve

${unresolved.length === 0
    ? '_Every prerequisite named by a source resolves to an item in a counted source._'
    : `${unresolved.length} prerequisite${unresolved.length === 1 ? ' is' : 's are'} named in a source and held
by no counted source. Each is either a stale citation or a sixth place work is recorded, and both
are worth knowing.

| Named by | Names | In source |
|---|---|---|
${unresolved.map((u) => `| \`${u.from}\` | \`${u.names}\` | ${u.source} |`).join('\n')}`}

---

## What this register does not do

**It does not prioritise.** Items are not equal: one agency decision can gate ten provisioning
steps, and the flow-truth review's ${bySource['flow-truth-review'] || 0} findings are all against a
single package that is not in the commissioning path. Read
[\`ACTION_PLAN.md\`](./ACTION_PLAN.md) for order of work.

**It does not close anything.** Status lives in the five sources. An item leaves this document when
its source says it has closed — and \`npm run test:closure\` holds every document, and
\`npm run commission\` itself, to that.

**It cannot tell you a finding in a record has been overtaken.** Audits are never edited to agree
with the present, so their findings stay counted until an item in a tracked source supersedes them
by id. That is the honest default and occasionally an overcount.

**Where this document and a command disagree, the command governs.**

\`\`\`bash
npm run master        # regenerate this document
npm run outstanding   # the total: ${rows.length} open across ${results.length} sources
npm run closed        # the ${all.length - rows.length} already discharged
npm run readiness     # the register of record's own tally
npm run commission    # what a commissioning run reports today
\`\`\`
`;

/* The same content as data, so a reader can query it rather than parse a document. */
const json = {
  schema: 'dgo-master-register/v1',
  generatedBy: 'npm run master',
  purpose: 'Every open item in the estate, across all five declared sources, with what it is, why it is, where it stands, what it needs, what decisively closes it, and its execution topology. Generated — never edited by hand.',
  derivation: {
    read: 'what, why, state, actions, inputs, trigger, owner, severity, category — each from the item\'s own source, or null where the source states none. Nothing is inferred.',
    derived: 'topology, blockedBy, blocking, releasedBy — from ordering relations the sources themselves state: a dependency naming another item\'s id, or a sentence constraining order. The basis is carried on every row.',
    caution: 'PARALLEL-EXECUTION-NEUTRAL means no source states an ordering relation involving the item. Three of the five sources state dependencies for no item at all, so entries land there by silence rather than by analysis.',
  },
  totals: {
    open: rows.length,
    closed: all.length - rows.length,
    sources: results.length,
    statingAClosureCriterion: withTrigger,
    statingActions: withActions,
    namingAnOwner: withOwner,
    byTopology, bySource, byActor: byActorCount,
    gatingCommissioning: commissioning.length,
  },
  /* The ids, not only the count: the mapping from readiness category to "gates commissioning" is
     the one judgement in this document, so anything rendering it should read the same list rather
     than re-derive the rule and quietly disagree. */
  gatingCommissioning: commissioning.map((r) => r.id),
  unresolvedReferences: unresolved,
  items: rows,
};

const jsonText = `${JSON.stringify(json, null, 2)}\n`;

/* ------------------------------------------------------------------ *
 * Write, or check
 * ------------------------------------------------------------------ */

const outputs = [[TARGET_MD, md], [TARGET_JSON, jsonText]];

if (CHECK) {
  const drifted = outputs.filter(([p, body]) => {
    const abs = join(ROOT, p);
    return !existsSync(abs) || readFileSync(abs, 'utf8') !== body;
  });
  if (!drifted.length) {
    console.log(`\n  ✅ the master register matches its sources — ${rows.length} open, ${withTrigger} with a stated closure criterion.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${drifted.map(([p]) => p).join(' and ')} ${drifted.length === 1 ? 'has' : 'have'} drifted from the sources.`);
  console.error('     Run: npm run master\n');
  process.exit(1);
}

for (const [p, body] of outputs) writeFileSync(join(ROOT, p), body);

console.log('\nMaster register\n');
for (const [p] of outputs) console.log(`  wrote ${p}`);
console.log(`\n  ${pad(rows.length, 4)}  open items across ${results.length} sources`);
console.log(`  ${pad(withTrigger, 4)}  state what decisively closes them`);
console.log(`  ${pad(withActions, 4)}  state actions`);
console.log(`  ${pad(withOwner, 4)}  name someone who can act`);
console.log(`  ${pad(commissioning.length, 4)}  gate commissioning`);
console.log('\n  by execution topology:');
for (const [k, n] of Object.entries(byTopology).sort((a, b) => b[1] - a[1])) console.log(`  ${pad(n, 4)}  ${k}`);
if (unresolved.length) {
  console.log(`\n  ${pad(unresolved.length, 4)}  prerequisite reference(s) resolve to no counted source:`);
  for (const u of unresolved) console.log(`        ${u.from} names ${u.names}`);
}
console.log('');
