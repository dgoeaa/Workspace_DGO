#!/usr/bin/env node
/**
 * Which flows conform to the house build standard, and where each one departs from it.
 *
 * WHY THIS EXISTS
 * The legacy flows carry a deliberate and substantial standard - a fixed variable set, a
 * Scope skeleton, one response envelope, a redaction rule and a versioned telemetry record
 * with its own JSON Schema. It was never written down, so nothing could be held to it and
 * every later flow drifted from it silently. The portal flows were built outside it entirely.
 *
 * This measures conformance rather than asserting it, so a new flow that ignores the standard
 * shows up as a number moving rather than as a discovery someone makes a year later.
 *
 * The standard is documented in docs/deployment/sharepoint/flow-standard.json, and that file
 * was derived from the deployed definitions - it describes what the estate already does, not
 * what someone thought it should.
 *
 * Usage:
 *   node scripts/verify-flow-standard.mjs            # conformance report
 *   node scripts/verify-flow-standard.mjs --json     # machine-readable
 *   node scripts/verify-flow-standard.mjs --portal   # only the flows the portal contract uses
 */

import { readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk, definitionRoot, identity, isFlowDocument, collectActions } from './lib/flow-definition-reader.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STD = JSON.parse(readFileSync(join(ROOT, 'docs/deployment/sharepoint/flow-standard.json'), 'utf8'));
const DEPLOYED = join(ROOT, 'docs/reference/flow-contracts/deployed');
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

const PORTAL = new Set(STD.portalFlows);

const flows = [];
for (const file of walk(DEPLOYED)) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { continue; }
  if (!isFlowDocument(doc)) continue;
  const def = definitionRoot(doc);
  const id = identity(doc);
  const src = JSON.stringify(def);
  const top = new Set(Object.keys(def.actions || {}));
  const actionList = collectActions(def.actions, '', []);
  const all = new Set(actionList.map((a) => a.name));

  /* A catch scope is a shape, not a name. Portal_Verify calls its catch
   * Scope_Flow_Processing_Catch and configures it correctly on Failed, Skipped and
   * TimedOut; an earlier version of this check matched a fixed list of names taken from
   * the conforming flows, scored that flow as having no catch, and the remediation
   * worksheet generated from the result told the operator to add a second one. Detect
   * what the rule is actually about: a Scope that runs when something before it failed. */
  const hasCatchShape = actionList.some(({ action }) =>
    action?.type === 'Scope'
    && Object.values(action.runAfter || {}).some((states) =>
      (states || []).some((st) => String(st).toLowerCase() === 'failed')));
  const vars = new Set([...src.matchAll(/variables\('(\w+)'\)/g)].map((m) => m[1]));

  const checks = STD.checks.map((c) => {
    let present = false;
    if (c.kind === 'topLevelAction') present = c.anyOf.some((n) => top.has(n));
    else if (c.kind === 'action') present = c.anyOf.some((n) => all.has(n));
    else if (c.kind === 'variables') present = c.allOf.every((v) => vars.has(v));
    else if (c.kind === 'substring') present = c.anyOf.some((n) => src.includes(n));
    else if (c.kind === 'catchScope') present = hasCatchShape;
    return { id: c.id, title: c.title, weight: c.weight, present };
  });

  const score = checks.filter((c) => c.present).reduce((n, c) => n + c.weight, 0);
  const total = STD.checks.reduce((n, c) => n + c.weight, 0);
  flows.push({
    flow: id.displayName || relative(ROOT, file),
    internalName: id.internalName,
    portal: PORTAL.has(id.displayName),
    score, total, pct: Math.round((score / total) * 100),
    missing: checks.filter((c) => !c.present).map((c) => c.id),
  });
}

const subject = flags.has('--portal') ? flows.filter((f) => f.portal) : flows;
subject.sort((a, b) => b.pct - a.pct || a.flow.localeCompare(b.flow));

const byCheck = STD.checks.map((c) => ({
  id: c.id, title: c.title,
  conforming: flows.filter((f) => !f.missing.includes(c.id)).length,
  of: flows.length,
  portalConforming: flows.filter((f) => f.portal && !f.missing.includes(c.id)).length,
  ofPortal: flows.filter((f) => f.portal).length,
}));

const summary = {
  standardVersion: STD.standardVersion,
  flowsRead: flows.length,
  portalFlows: flows.filter((f) => f.portal).length,
  fullyConforming: flows.filter((f) => f.pct === 100).length,
  medianPct: subject.length ? subject[Math.floor(subject.length / 2)].pct : 0,
  portalMedianPct: (() => {
    const p = flows.filter((f) => f.portal).sort((a, b) => a.pct - b.pct);
    return p.length ? p[Math.floor(p.length / 2)].pct : 0;
  })(),
};

if (flags.has('--json')) {
  console.log(JSON.stringify({ summary, byCheck, flows: subject }, null, 2));
} else {
  console.log(`\nFlow build standard ${STD.standardVersion} - ${flows.length} deployed definition(s)\n`);
  console.log('  Conformance by rule:\n');
  for (const c of byCheck) {
    console.log(`    ${String(c.conforming).padStart(2)}/${c.of}  all   ${String(c.portalConforming).padStart(2)}/${c.ofPortal}  portal   ${c.title}`);
  }
  console.log(`\n  ${flows.filter((f) => f.pct === 100).length} flow(s) conform fully. Median ${summary.medianPct}%, portal median ${summary.portalMedianPct}%.\n`);
  console.log('  Lowest conforming:\n');
  for (const f of subject.slice(-12).reverse()) {
    console.log(`    ${String(f.pct).padStart(3)}%  ${f.portal ? '[portal] ' : '         '}${f.flow.slice(0, 44).padEnd(46)} missing: ${f.missing.join(', ') || '-'}`);
  }
  console.log('');
}
