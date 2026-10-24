#!/usr/bin/env node
/**
 * The four columns that block the flow registry, and how much of them a person actually has to write.
 *
 *   npm run registry:decisions
 *   npm run registry:decisions -- --check
 *
 * WHY THIS EXISTS
 *
 * docs/reference/FLOW_REGISTRY_SEED.json holds 109 rows — every flow the estate has — and cannot
 * be written to the tenant, because four REQUIRED columns of DGO_HTTPFlowRegistry need a person:
 * SystemName, Criticality, TechnicalOwnerEmail and LastSeenUtc. 109 rows × 4 columns is 436 blanks,
 * and put that way it reads as a month of work nobody will start.
 *
 * It is not 436. Two of the four can be PROPOSED from evidence the repository already holds, which
 * turns them from authorship into ratification; one cannot be proposed at all; and one is not a
 * decision in the first place — it is an observation that only a run can make.
 *
 * So this sorts the four, proposes what can be proposed, cites why for every proposal, and counts
 * what is irreducibly human. That last number is the real ask.
 *
 * A PROPOSAL IS NOT A VALUE, AND THEY ARE KEPT IN DIFFERENT FILES
 *
 * Nothing here writes into the seed. tests/flow-registry-seed.test.mjs asserts that not one seed
 * row carries a value in a column that needs a person, and that assertion is the reason the seed
 * can be trusted — a register that fills its own owner column reads as knowledge and is fiction.
 * Proposals live here, marked as proposals, with the rule that produced each one, so the agency
 * ratifies or overrides rather than inheriting a guess that has quietly become a fact.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const SEED = 'docs/reference/FLOW_REGISTRY_SEED.json';
const TARGET_MD = 'docs/reference/REGISTRY_DECISIONS.md';
const TARGET_JSON = 'docs/reference/REGISTRY_DECISIONS.json';

const seed = read(SEED);
const rows = seed.registryRows;
const deps = seed.dependencyRows || [];

/* ------------------------------------------------------------------ *
 * SystemName — proposable from the estate's own naming, which is a real convention
 * ------------------------------------------------------------------ */

/* These prefixes are not a guess about what flows are called; they are what the 109 names
   actually start with, and each maps to a system this estate already names elsewhere. A flow
   matching none of them gets no proposal rather than a default bucket — "Other" is the value
   that makes a column look filled while carrying nothing. */
const SYSTEM_RULES = [
  [/^IP_/i, 'Internal Platform', 'name begins IP_ — the internal platform\'s own prefix'],
  [/^CG_/i, 'Public Portal', 'name begins CG_ — the portal endpoints, per the endpoint atlas'],
  [/^Portal[_ ]/i, 'Public Portal', 'name begins Portal_'],
  [/^\d+\s*-\s*GOV\s*-/i, 'Governance', 'name is a numbered GOV- flow'],
  [/^GOV[_ -]/i, 'Governance', 'name begins GOV'],
  [/^DGO[_ ]/i, 'Digital Operations', 'name begins DGO_'],
  [/^AI[_ ]|AI_DOC|AI_CHAT|AI_EMAIL/i, 'AI Processing', 'name marks it an AI processing flow'],
  [/^AUTO_|SCHEDULED_SWEEP/i, 'Scheduled Processing', 'name marks it a scheduled sweep'],
  [/^BULK/i, 'Internal Platform', 'name begins BULK — bulk operations on the internal platform'],
  [/^SUBMISSION_|^DGSO/i, 'Public Portal', 'name marks it a portal submission path'],
];

const proposeSystem = (r) => {
  for (const [re, value, why] of SYSTEM_RULES) if (re.test(r.FlowName)) return { value, why };
  return null;
};

/* ------------------------------------------------------------------ *
 * Criticality — proposable from what the flow is wired to, not from its name
 * ------------------------------------------------------------------ */

const depCount = deps.reduce((m, d) => { m[d.RegistryKey] = (m[d.RegistryKey] || 0) + 1; return m; }, {});

/* Evidence, in the order it decides. A flow a contract key calls is on the delivered platform's
   critical path by construction: the platform cannot serve that key without it. Everything below
   that is weaker and says so. */
const proposeCriticality = (r) => {
  const keys = r._servesContractKeys || [];
  if (keys.length) {
    return {
      value: 'High',
      why: `serves contract key${keys.length === 1 ? '' : 's'} ${keys.join(', ')} — the platform cannot answer that call without it`,
    };
  }
  if ((depCount[r.RegistryKey] || 0) >= 5) {
    return { value: 'Medium', why: `writes or reads ${depCount[r.RegistryKey]} SharePoint lists; no contract key calls it` };
  }
  if (r.LifecycleStatus === 'RegisterOnly') {
    return { value: null, why: null };
  }
  return null;
};

/* ------------------------------------------------------------------ *
 * Compose
 * ------------------------------------------------------------------ */

const COLUMNS = [
  {
    column: 'SystemName',
    proposable: true,
    whatItIs: 'The business or technical system a flow belongs to.',
    howProposed: 'From the estate\'s own naming convention, one rule per prefix, each stated. A flow matching no rule gets no proposal.',
  },
  {
    column: 'Criticality',
    proposable: true,
    whatItIs: 'How much depends on this flow working.',
    howProposed: 'From wiring, never from name: a flow a contract key calls is High because the platform cannot serve that key without it; a flow touching five or more lists with no key is Medium. Anything else is left for a person.',
  },
  {
    column: 'TechnicalOwnerEmail',
    proposable: false,
    whatItIs: 'Who is accountable for this flow.',
    howProposed: 'Not proposable. Nothing in a repository knows who owns a flow, and an invented address is worse than an empty column because a flow with a plausible owner stops being chased.',
  },
  {
    column: 'LastSeenUtc',
    proposable: false,
    whatItIs: 'When the flow was last observed running.',
    howProposed: 'Not a decision at all — an observation. No person can supply it and no repository holds it; it is written by the first registration that reads run history, or by the flow itself.',
  },
];

const decisions = rows.map((r) => {
  const sys = proposeSystem(r);
  const crit = proposeCriticality(r);
  return {
    RegistryKey: r.RegistryKey,
    FlowName: r.FlowName,
    alsoKnownAs: r._alsoKnownAs || [],
    identity: r._identity,
    servesContractKeys: r._servesContractKeys || [],
    listsTouched: depCount[r.RegistryKey] || 0,
    proposals: {
      SystemName: sys ? { proposed: sys.value, because: sys.why, status: 'PROPOSED — ratify or override' } : { proposed: null, because: 'no naming rule matches', status: 'NEEDS A PERSON' },
      Criticality: crit && crit.value
        ? { proposed: crit.value, because: crit.why, status: 'PROPOSED — ratify or override' }
        : { proposed: null, because: 'no contract key calls it and it touches fewer than five lists', status: 'NEEDS A PERSON' },
      TechnicalOwnerEmail: { proposed: null, because: 'not derivable from any repository', status: 'NEEDS A PERSON' },
      LastSeenUtc: { proposed: null, because: 'an observation, not a decision', status: 'NEEDS A RUN' },
    },
  };
});

const count = (col, pred) => decisions.filter((d) => pred(d.proposals[col])).length;
const proposed = {
  SystemName: count('SystemName', (p) => p.proposed !== null),
  Criticality: count('Criticality', (p) => p.proposed !== null),
  TechnicalOwnerEmail: 0,
  LastSeenUtc: 0,
};
const needsPerson = {
  SystemName: rows.length - proposed.SystemName,
  Criticality: rows.length - proposed.Criticality,
  TechnicalOwnerEmail: rows.length,
  LastSeenUtc: 0,          /* a run, not a person */
};

const blanks = rows.length * COLUMNS.length;
const toRatify = proposed.SystemName + proposed.Criticality;
const toAuthor = needsPerson.SystemName + needsPerson.Criticality + needsPerson.TechnicalOwnerEmail;
const toObserve = rows.length;   /* LastSeenUtc, on every row */

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n+\s*/g, ' ').trim();
const cut = (s, n) => { const t = esc(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

const bySystem = {};
for (const d of decisions) {
  const k = d.proposals.SystemName.proposed || '(no proposal)';
  bySystem[k] = (bySystem[k] || 0) + 1;
}
const byCrit = {};
for (const d of decisions) {
  const k = d.proposals.Criticality.proposed || '(no proposal)';
  byCrit[k] = (byCrit[k] || 0) + 1;
}

const md = `# Registry decisions — what a person actually has to write

**Generated by \`npm run registry:decisions\` from [\`FLOW_REGISTRY_SEED.json\`](./FLOW_REGISTRY_SEED.json).**
Do not edit by hand — \`npm run test:registrydecisions\` fails on drift.

> The flow registry holds **${rows.length} rows** and cannot be written, because four REQUIRED
> columns need a person. That is **${blanks} blanks** stated flatly — and stated that way it reads
> as a month of work nobody will start.
>
> It is not ${blanks}. **${toRatify} are proposals to ratify or override**, ${toAuthor} have to be
> authored, and ${toObserve} are not decisions at all — \`LastSeenUtc\` is an observation only a run
> can make.

## The four columns

| Column | Proposable | What it is | How, or why not |
|---|---|---|---|
${COLUMNS.map((c) => `| \`${c.column}\` | ${c.proposable ? `**yes** — ${proposed[c.column]} of ${rows.length}` : 'no'} | ${esc(c.whatItIs)} | ${esc(c.howProposed)} |`).join('\n')}

**A proposal is not a value.** Nothing here is written into the seed, and
\`npm run test:registryseed\` asserts that not one seed row carries a value in any of these four.
That assertion is why the seed can be trusted: a register that fills its own owner column reads as
knowledge and is fiction. Every proposal below carries the rule that produced it, so it can be
overridden on its merits.

## What the proposals say

### SystemName — ${proposed.SystemName} proposed, ${needsPerson.SystemName} need a person

| Proposed system | Flows |
|---|---:|
${Object.entries(bySystem).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k === '(no proposal)' ? '_no naming rule matches_' : k} | ${n} |`).join('\n')}

### Criticality — ${proposed.Criticality} proposed, ${needsPerson.Criticality} need a person

| Proposed | Flows | On what evidence |
|---|---:|---|
| High | ${byCrit.High || 0} | a contract key calls it — the platform cannot answer that call without it |
| Medium | ${byCrit.Medium || 0} | touches five or more SharePoint lists, and no contract key calls it |
| _no proposal_ | ${byCrit['(no proposal)'] || 0} | neither — a person decides |

---

## Every flow, and what it still needs

\`ratify\` means a proposal is waiting for yes or no. \`author\` means nothing can propose it.

| Flow | System | Criticality | Owner | Last seen |
|---|---|---|---|---|
${decisions.map((d) => {
    const s = d.proposals.SystemName, c = d.proposals.Criticality;
    return `| ${cut(d.FlowName, 44)}${d.alsoKnownAs.length ? ` _(also ${cut(d.alsoKnownAs.join(', '), 30)})_` : ''} `
      + `| ${s.proposed ? `**${s.proposed}** _ratify_` : '_author_'} `
      + `| ${c.proposed ? `**${c.proposed}** _ratify_` : '_author_'} `
      + '| _author_ | _run_ |';
  }).join('\n')}

---

## How to use this

The four columns are the only thing between the seed and a written register. Nothing else is
outstanding: the provisioner is complete, and the rows exist.

\`\`\`bash
npm run registry:seed                    # the 109 rows, as data
npm run governance:registryprovisioner   # the browser provisioner for the seven lists
npm run registry:decisions               # regenerate this sheet
\`\`\`

Override a proposal by recording the decision against the flow; the sheet regenerates from the
seed, so a proposal that is wrong is wrong about a rule, and the rule is stated beside it.

**Where this document and a command disagree, the command governs.**
`;

const json = {
  schema: 'dgo-registry-decisions/v1',
  generatedBy: 'npm run registry:decisions',
  purpose: 'The four REQUIRED DGO_HTTPFlowRegistry columns that need a person, with what can be proposed from evidence and what cannot. Proposals are kept out of the seed on purpose.',
  totals: {
    rows: rows.length,
    columns: COLUMNS.length,
    blanks,
    toRatify,
    toAuthor,
    toObserve,
    proposed,
    needsPerson,
  },
  columns: COLUMNS,
  rules: {
    SystemName: SYSTEM_RULES.map(([re, value, why]) => ({ pattern: String(re), value, why })),
    Criticality: [
      { rule: 'serves at least one contract key', value: 'High' },
      { rule: 'touches five or more SharePoint lists and serves no contract key', value: 'Medium' },
      { rule: 'anything else', value: null },
    ],
  },
  decisions,
};

const outputs = [[TARGET_MD, md], [TARGET_JSON, `${JSON.stringify(json, null, 2)}\n`]];

if (CHECK) {
  const drifted = outputs.filter(([p, body]) => {
    const abs = join(ROOT, p);
    return !existsSync(abs) || readFileSync(abs, 'utf8') !== body;
  });
  if (!drifted.length) {
    console.log(`\n  ✅ the decision sheet matches the seed — ${toRatify} to ratify, ${toAuthor} to author.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${drifted.map(([p]) => p).join(' and ')} drifted from the seed.`);
  console.error('     Run: npm run registry:decisions\n');
  process.exit(1);
}

for (const [p, body] of outputs) writeFileSync(join(ROOT, p), body);

const pad = (n) => String(n).padStart(4);
console.log('\nRegistry decisions — what a person actually has to write\n');
for (const [p] of outputs) console.log(`  wrote ${p}`);
console.log(`\n  ${pad(blanks)}  blanks, stated flatly (${rows.length} rows × ${COLUMNS.length} required columns)`);
console.log(`  ${pad(toRatify)}  are proposals to ratify or override`);
console.log(`  ${pad(toAuthor)}  have to be authored`);
console.log(`  ${pad(toObserve)}  are LastSeenUtc — an observation, not a decision`);
console.log('\n  proposed:');
for (const c of COLUMNS) console.log(`  ${pad(proposed[c.column])}  ${c.column}${c.proposable ? '' : '  (not proposable)'}`);
console.log('');
