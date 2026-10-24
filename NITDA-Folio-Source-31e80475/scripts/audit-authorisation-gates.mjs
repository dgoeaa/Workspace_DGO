#!/usr/bin/env node
/**
 * AN AUTHORISATION DECISION THAT CANNOT SAY NO.
 *
 * WHY THIS EXISTS
 *
 * On 2026-09-22 the wired FETCH_ALL endpoint returned 500 documents, 500 tasks and a directory
 * user record to a caller that supplied no identity at all. The flow was not missing a check. It
 * looked the caller up, found nobody, computed `false` for "is this caller permitted", recorded
 * that `false` in its own telemetry — and then read a different value: a Compose whose input is
 * the literal `true`. The real expression had been moved into an action named
 * `Compose_FetchAll_Permitted_actual__permission_condition_expression`, which runs immediately
 * before the decision and which nothing reads.
 *
 * Every existing control in this repository was green through that. `npm run triggerauth` reads
 * trigger posture and says nothing about what a flow does after the trigger fires. The seam
 * tests read request and response shapes. Nothing read the flow's own decision logic, so a gate
 * wired to a constant was indistinguishable from a gate that works.
 *
 * WHAT IT LOOKS FOR, AND WHY THAT SHAPE
 *
 * A Compose whose input is a constant boolean, read by a Condition that compares it against
 * nothing dynamic. Both halves matter, and the second was learned the hard way. The first
 * version of this file flagged any constant Compose a Condition branched on — and the fix for
 * ITEM-61 left the constant in place and moved the real expression into the OTHER side of the
 * comparison, so `equals(true, <real check>)` is now the decision. That is correct: the branch
 * goes both ways, driven entirely by the real expression. A control that reported a correctly
 * fixed flow as a bypass would have taught its readers to ignore it within a week.
 *
 * So the test is INVARIANCE, not shape: a decision is a bypass when substituting the constant
 * leaves nothing that can vary — every other operand in the comparison is itself a literal. If
 * any other operand reaches an action output, a trigger body, a variable or a parameter, the
 * decision is live and this file says nothing about it. Where a bypass IS found, the audit also
 * reports any Compose in the same flow computing a real expression nothing reads — which is
 * where the displaced logic usually went, and which turns "this looks odd" into "here is the
 * check that was replaced".
 *
 * It deliberately does NOT flag:
 *   · a constant Compose nothing branches on — that is a default, a flag, a label;
 *   · an unread Compose on its own — exports are full of scaffolding, and a dead action is
 *     untidy rather than dangerous;
 *   · a Condition with a complex expression, however permissive. Whether a real check is STRICT
 *     enough is a judgement; whether it can return false at all is a fact, and this file only
 *     asserts facts.
 *
 * Across every flow definition this repository holds — deployed contracts, flow exports, and the
 * packages inside committed archives — exactly one match exists. That is the point: the signal
 * is rare, so it is worth failing on rather than counting.
 *
 *     node scripts/audit-authorisation-gates.mjs            # write the record
 *     node scripts/audit-authorisation-gates.mjs --check    # exit 1 on a new one, or on drift
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip } from './lib/zip-reader.mjs';
import { byteCompare } from './lib/stable-sort.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference/authorisation-gates.json');

/* The one match this repository knows about, and the item that carries it. A NEW match is a
   finding and fails; this one is failed on only if it disappears without the item being
   settled, because a bypass that silently vanishes from the exports is not the same as one
   that was fixed in the tenant and re-exported. */
const KNOWN = {
  where: 'docs/folio-Master-Flows-and-Endpoints/exports/IP_FETCH_ALL_BOOTSTRAP_20260917225904.zip',
  decision: 'Compose_FetchAll_Permitted',
  item: 'ITEM-61',
  why: 'The superseded build, retained deliberately. ITEM-61 closed on 2026-09-24 when the flow '
    + 'was fixed in the tenant and re-exported as IP_FETCH_ALL_BOOTSTRAP_20260924035751.zip, '
    + 'which is in this directory beside it and is clean. This package is kept because it is the '
    + 'artefact of the defect and because ITEM-60 establishes that packages get imported on the '
    + 'strength of their file name: anyone who imports THIS one re-opens the bypass. It stays '
    + 'flagged for exactly that reason. Retired 2026-10-05 with every other superseded copy of an '
    + 'adopted flow (registers/flow-adoption.json): the package is no longer in the repository, so it '
    + 'can no longer be imported from here. registers/flow-retirement.json records its hash and the '
    + 'last commit that holds it.',
};
const RETIRED = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-retirement.json'), 'utf8')); } catch { return null; }
})();
const knownRetired = !!RETIRED && JSON.stringify(RETIRED).includes(JSON.stringify(KNOWN.where));

const SKIP_DIRS = new Set(['node_modules', '.git', 'test-results', 'playwright-report']);

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => byteCompare(a.name, b.name))) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function readInnerZip(bytes, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'dgo-auth-'));
  const p = join(dir, 'inner.zip');
  try { writeFileSync(p, bytes); return fn(openZip(p)); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

/* One flow definition per yield, wherever it lives. A definition inside a package inside an
   archive is as much a description of a flow as a loose .json, and the bypass was found in
   exactly that position — two zips deep. A reader that stops at the first zip would have
   reported this estate clean. */
function* definitions() {
  for (const file of [...walk(join(ROOT, 'docs/reference')), ...walk(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/reference'))]) {
    if (!file.endsWith('.json')) continue;
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { continue; }
    const defn = doc.definition || (doc.properties || {}).definition || doc;
    if (defn && defn.actions) yield [relative(ROOT, file), defn];
  }
  const archives = [...walk(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/exports'))]
    .filter((f) => f.endsWith('.zip'));
  for (const archive of archives) {
    let zip;
    try { zip = openZip(archive); } catch { continue; }
    for (const m of zip.members) {
      if (m.isDirectory) continue;
      const label = `${relative(ROOT, archive)}${m.name.endsWith('.zip') ? `!${basename(m.name)}` : ''}`;
      if (m.name.endsWith('.zip')) {
        try {
          readInnerZip(m.read(), (inner) => {
            for (const im of inner.members) {
              if (im.isDirectory || !/definition\.json$/i.test(im.name)) continue;
              const doc = JSON.parse(im.read().toString('utf8').replace(/^﻿/, ''));
              const defn = (doc.properties || doc).definition || doc;
              if (defn && defn.actions) results.push([label, defn]);
            }
          });
        } catch { /* an unreadable member is reported by check-secrets, not here */ }
      } else if (/definition\.json$/i.test(m.name)) {
        try {
          const doc = JSON.parse(m.read().toString('utf8').replace(/^﻿/, ''));
          const defn = (doc.properties || doc).definition || doc;
          if (defn && defn.actions) results.push([label, defn]);
        } catch { /* as above */ }
      }
    }
  }
  yield* results.splice(0, results.length);
}
const results = [];

/* Actions nest inside scopes, conditions, branches and switch cases without limit, and the
   bypass sat four levels down. Flatten by name rather than recursing at each use site. */
function flatten(defn) {
  const out = new Map();
  const deep = (node) => {
    if (Array.isArray(node)) { node.forEach(deep); return; }
    if (!node || typeof node !== 'object') return;
    for (const [name, value] of Object.entries(node)) {
      if (value && typeof value === 'object' && typeof value.type === 'string') out.set(name, value);
      deep(value);
    }
  };
  deep(defn.actions || {});
  return out;
}

const isConstant = (v) => typeof v === 'boolean'
  || (typeof v === 'string' && ['true', 'false'].includes(v.trim().toLowerCase()));

/* Anything that can differ between two requests. A comparison against one of these is a live
   decision however the constant beside it is written. */
const DYNAMIC = /outputs\('|body\('|triggerBody\(|triggerOutputs\(|variables\(|parameters\(|items\(/;

/* The operands a Condition compares the named Compose against, excluding the reference itself.
   Walked rather than pattern-matched because a Condition nests and/or/not to any depth, and the
   comparison that matters can sit anywhere inside it. */
function comparedAgainst(expression, name) {
  const needle = `outputs('${name}')`;
  const others = [];
  const deep = (node) => {
    if (Array.isArray(node)) { node.forEach(deep); return; }
    if (!node || typeof node !== 'object') return;
    for (const args of Object.values(node)) {
      if (Array.isArray(args) && args.some((a) => typeof a === 'string' && a.includes(needle))) {
        for (const a of args) if (!(typeof a === 'string' && a.includes(needle))) others.push(a);
      }
      deep(args);
    }
  };
  deep(expression || {});
  return others;
}

const findings = [];
for (const [where, defn] of definitions()) {
  const acts = flatten(defn);
  const blob = JSON.stringify(defn);
  for (const [name, action] of [...acts].sort((a, b) => byteCompare(a[0], b[0]))) {
    if (action.type !== 'Compose' || !isConstant(action.inputs)) continue;
    const branchedOn = [...acts]
      .filter(([, b]) => b.type === 'If' && JSON.stringify(b.expression || {}).includes(`outputs('${name}')`))
      .map(([n]) => n).sort(byteCompare);
    if (!branchedOn.length) continue;
    /* The whole test. If ANY condition branching on this constant compares it against something
       that can vary between requests, the decision is live and there is nothing to report. */
    const operands = branchedOn.flatMap((n) => comparedAgainst(acts.get(n).expression, name));
    const dynamic = operands.filter((o) => typeof o === 'string' && DYNAMIC.test(o));
    if (dynamic.length) continue;
    /* Where the displaced check went, if it went anywhere. An expression long enough to be a
       real condition that no other action reads. */
    const unread = [...acts]
      .filter(([n2, b2]) => n2 !== name && b2.type === 'Compose'
        && typeof b2.inputs === 'string' && b2.inputs.startsWith('@') && b2.inputs.length > 60
        && !blob.includes(`outputs('${n2}')`))
      .map(([n2, b2]) => ({ action: n2, expression: b2.inputs }))
      .sort((a, b) => byteCompare(a.action, b.action));
    const refusalPath = branchedOn.map((n) => {
      const cond = acts.get(n);
      return { condition: n, elseActions: Object.keys((cond.else || {}).actions || {}).sort(byteCompare) };
    });
    findings.push({
      where, decision: name, pinnedTo: action.inputs, branchedOn,
      comparedAgainst: operands.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))),
      refusalPath, unreadExpressionsBeside: unread,
    });
  }
}
findings.sort((a, b) => byteCompare(a.where + '\u0000' + a.decision, b.where + '\u0000' + b.decision));

const built = JSON.stringify({
  schema: 'dgo-authorisation-gates/v1',
  generatedBy: 'scripts/audit-authorisation-gates.mjs',
  whatThisIs: 'Every place in this estate where a Condition branches on a Compose whose input is '
    + 'a constant — an authorisation decision that cannot go both ways. Beside each, any '
    + 'expression in the same flow that computes a real answer nothing reads, which is where the '
    + 'displaced check usually is.',
  whatItDoesNotClaim: 'That a flow with no finding authorises correctly. This asks only whether a '
    + 'decision CAN return false, not whether it returns false often enough. A check that is real '
    + 'but far too permissive looks exactly like a good one from here. Nor does it say anything '
    + 'about WHO the caller is: every endpoint in this estate still takes its caller from the '
    + 'request body, which is G-04 and is not what this file measures.',
  theTest: 'A Compose whose input is a constant boolean, read by a Condition that compares it '
    + 'against nothing that can vary between requests. Comparing a constant against a real '
    + 'expression \u2014 equals(true, <check>) \u2014 is a live decision and is not reported; that is '
    + 'the shape the ITEM-61 fix took.',
  known: KNOWN,
  counts: { decisionsPinnedToAConstant: findings.length },
  findings,
}, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let bad = 0;
  const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return null; } })();
  console.log('\nAuthorisation gates\n');
  const novel = findings.filter((f) => !(f.where === KNOWN.where && f.decision === KNOWN.decision));
  for (const f of novel) {
    console.log(`  ❌ ${f.decision} is pinned to ${JSON.stringify(f.pinnedTo)} and ${f.branchedOn.join(', ')} branches on it`);
    console.log(`       ${f.where}`);
    console.log('       An authorisation decision that cannot return false is not a decision. '
      + 'Restore the real expression, or say in the register why this one is constant.');
    bad++;
  }
  const knownStillThere = findings.some((f) => f.where === KNOWN.where && f.decision === KNOWN.decision);
  if (knownStillThere) {
    console.log(`  ⚠ ${KNOWN.decision} in ${KNOWN.where} is pinned to a constant. Expected — ${KNOWN.item}.`);
    console.log(`       ${KNOWN.why}`);
  } else if (knownRetired) {
    console.log(`  ✅ ${KNOWN.where} (${KNOWN.item}) is retired and recorded in registers/flow-retirement.json`);
  } else {
    console.log(`  ❌ ${KNOWN.decision} is no longer in ${KNOWN.where}.`);
    console.log(`       ${KNOWN.item} records a live authorisation bypass in that package. If it was fixed and re-exported, `
      + 'settle the item and update KNOWN in this script in the same commit. A finding must not leave the estate silently.');
    bad++;
  }
  if (current !== built) {
    console.log(`  ❌ ${relative(ROOT, OUT)} drifted. Review it, then run: npm run authgates`);
    bad++;
  } else if (!novel.length) {
    console.log(`  ✅ no new authorisation decision is pinned to a constant (${findings.length} known)`);
  }
  console.log(`\n${bad ? '❌' : '✅'} ${bad} problem(s)\n`);
  process.exit(bad ? 1 : 0);
}

writeFileSync(OUT, built);
console.log(`Wrote ${relative(ROOT, OUT)} — ${findings.length} decision(s) pinned to a constant.`);
