#!/usr/bin/env node
/**
 * Regenerate the build-standard section of each remediation artifact and worksheet.
 *
 * WHY THIS EXISTS
 * The conformance gaps in the artifacts were transcribed by hand from one run of
 * verify-flow-standard.mjs. When that measurement was later corrected — it had been
 * matching catch scopes by name against a fixed list, and scored Portal_Verify_Confirm
 * as having none when it has a correct one — every artifact and worksheet still carried
 * the old answer, and Step S told an operator to add a second catch scope to a flow that
 * already had one. Transcribed measurements go stale silently; generated ones do not.
 *
 * The remedy text lives in flow-standard.json under `remedies`, keyed by check id, so
 * the wording is written once and this script decides only WHICH remedies each flow
 * needs — from the live measurement, every time it runs.
 *
 * Usage:
 *   node scripts/build-remediation-standard.mjs           # write
 *   node scripts/build-remediation-standard.mjs --check   # fail if anything is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = join(ROOT, 'docs/deployment/sharepoint/remediation');
const STD_PATH = join(ROOT, 'docs/deployment/sharepoint/flow-standard.json');
const check = process.argv.includes('--check');

const STD = JSON.parse(readFileSync(STD_PATH, 'utf8'));
const measurement = JSON.parse(execFileSync(process.execPath,
  [join(ROOT, 'scripts/verify-flow-standard.mjs'), '--json'], { encoding: 'utf8' }));
const byFlow = new Map(measurement.flows.map((f) => [f.flow, f]));

/* Ordered as the standard lists its checks, so Step S reads in the order the work is
   actually done: variables, then the scope that holds them, then what goes inside it. */
const CHECK_ORDER = STD.checks.map((c) => c.id);

const ARTIFACTS = [
  ['01-otp-estate-split', 'WORKSHEET-01.md'],
  ['02-submission-registry-write', 'WORKSHEET-02.md'],
  ['03-status-registry-read', 'WORKSHEET-03.md'],
  ['04-intake-writeback', 'WORKSHEET-04.md'],
  ['05-upload-and-support', 'WORKSHEET-05.md'],
];

const stale = [];
const writeOrCompare = (path, next) => {
  const now = readFileSync(path, 'utf8');
  if (now === next) return;
  if (check) stale.push(relative(ROOT, path).split(sep).join('/'));
  else writeFileSync(path, next);
};

/** The per-flow block an artifact carries, rebuilt from what the flow is missing today. */
function perFlow(flowName) {
  const m = byFlow.get(flowName);
  if (!m) throw new Error(`no measurement for ${flowName} — is it named differently in the export?`);
  const missing = CHECK_ORDER.filter((id) => m.missing.includes(id))
    .map((id) => {
      const remedy = STD.remedies[id];
      if (!remedy) throw new Error(`no remedy written for check ${id}`);
      return { check: id, ...remedy };
    });
  return {
    flow: flowName,
    conformanceBefore: `${m.pct}% by rule count`,
    conforms: missing.length === 0,
    missing,
  };
}

/* A value may be a number, an empty object or an empty array as well as a string.
   Interpolating those straight into markdown gives `[object Object]`, which is not
   something anyone can type into the designer. */
const cell = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Step S as markdown. A flow with nothing missing still gets a line — silence would read
    as an omission rather than as "this one is already there". */
function stepS(blocks, order) {
  const out = ['## Step S - bring the flow onto the build standard', ''];
  out.push(`> ${order}`, '');
  out.push('> D7 - the standard work rides along with each visit rather than waiting for a'
    + ' sixth pass. The flow is already open, and adding a catch scope to a flow whose'
    + ' actions you have just rewritten costs a fraction of coming back to it.', '');
  for (const b of blocks) {
    out.push(`### \`${b.flow}\`  -  ${b.conformanceBefore} before`, '');
    if (b.conforms) {
      out.push('**Nothing to do here.** This flow already meets every rule in the build'
        + ' standard. Go straight to the next step.', '');
      continue;
    }
    for (const m of b.missing) {
      out.push(`**${m.title}**  ·  \`${m.check}\``, '', m.how, '');
      if (m.add) {
        out.push('| Action to add | Type | Value |', '|---|---|---|');
        for (const a of m.add) out.push(`| \`${a.name}\` | ${a.type || '-'} | \`${cell(a.value)}\` |`);
        out.push('');
      }
      if (m.inputs) out.push('Paste into **Inputs**:', '', '```json', m.inputs, '```', '');
      if (m.wireInto) {
        out.push(`Then open \`${m.wireInto.action}\` and add one key under \`${m.wireInto.underKey}\`:`, '');
        out.push('| Key | Value |', '|---|---|',
          `| \`${m.wireInto.pair.key}\` | \`${m.wireInto.pair.value}\` |`, '');
        out.push(`> ${m.wireInto.note}`, '');
      }
      if (m.copyFrom) out.push(`Copy it from \`${m.copyFrom}\` — character for character, not retyped.`, '');
      if (m.alsoAdd) {
        out.push(`Then add a Scope named \`${m.alsoAdd.name}\`. ${m.alsoAdd.where}.`, '');
        out.push('| Action inside it | Value |', '|---|---|');
        for (const a of m.alsoAdd.actions) out.push(`| \`${a.name}\` | \`${cell(a.value)}\` |`);
        out.push('');
      }
      out.push(`*Why:* ${m.why}`, '');
    }
  }
  return out.join('\n');
}

for (const [id, sheet] of ARTIFACTS) {
  const artPath = join(DIR, `${id}.json`);
  const art = JSON.parse(readFileSync(artPath, 'utf8'));
  const sc = art.standardConformance;
  if (!sc) throw new Error(`${id} has no standardConformance block`);

  const blocks = sc.perFlow.map((p) => perFlow(p.flow));
  sc.perFlow = blocks;
  sc.measuredFrom = 'scripts/verify-flow-standard.mjs, at generation time';
  sc.generatedBy = 'scripts/build-remediation-standard.mjs';
  writeOrCompare(artPath, `${JSON.stringify(art, null, 2)}\n`);

  const sheetPath = join(DIR, sheet);
  const md = readFileSync(sheetPath, 'utf8');
  const start = md.indexOf('## Step S');
  const after = md.indexOf('\n## ', start + 1);
  if (start === -1 || after === -1) throw new Error(`${sheet}: no Step S section to replace`);
  writeOrCompare(sheetPath, md.slice(0, start) + stepS(blocks, sc.order) + md.slice(after));
}

if (check) {
  if (stale.length) {
    console.error(`\n❌ stale — run: node scripts/build-remediation-standard.mjs\n${stale.map((s) => `   ${s}`).join('\n')}\n`);
    process.exit(1);
  }
  console.log('\n✅ every artifact and worksheet matches the live conformance measurement\n');
} else {
  const total = ARTIFACTS.length;
  const conforming = measurement.flows.filter((f) => f.portal && f.pct === 100).length;
  console.log(`\nRegenerated ${total} artifact(s) and ${total} worksheet(s) from the live measurement.`);
  console.log(`Portal median ${measurement.summary.portalMedianPct}%, ${conforming} portal flow(s) already conform fully.\n`);
}
