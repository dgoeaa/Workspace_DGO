#!/usr/bin/env node
/**
 * THE WALKTHROUGH MUST STAY A VIEW OF THE REGISTER, NOT A SECOND BACKLOG.
 *
 * docs/deployment/EXTERNAL_EXECUTION.md orders the 58 items nothing here can finish. The danger in
 * a document like that is not drift — --check catches drift — it is DIVERGENCE OF AUTHORITY: it
 * reads like a plan, so the next person works from it, and the moment it holds a step the register
 * does not, or drops one the register still carries, the estate has two backlogs and the older one
 * wins arguments it should lose.
 *
 * So: every step is an open item, every open item is a step, exactly once.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nExternal execution — a view of the register, not a second backlog\n');

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-external-walkthrough.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run external is current', out.trim().split('\n').slice(-2).join(' '));
}

const TARGET = 'docs/deployment/EXTERNAL_EXECUTION.json';
if (!existsSync(join(ROOT, TARGET))) {
  console.log(`\n❌ ${TARGET} does not exist — run npm run external\n`);
  process.exit(1);
}

const doc = read(TARGET);
const master = read('docs/deployment/MASTER_REGISTER.json');
const steps = doc.tracks.flatMap((t) => t.steps);

/* ------------------------------------------------------------------ *
 * 1 · every open item is a step, exactly once
 * ------------------------------------------------------------------ */
{
  const open = master.items.map((i) => i.id);
  const planned = steps.map((s) => s.id);

  const missing = open.filter((id) => !planned.includes(id));
  ok(missing.length === 0, `every open item is a step (${open.length})`, missing.join(', '));

  const extra = planned.filter((id) => !open.includes(id));
  ok(extra.length === 0, 'no step names an item the register does not hold open', extra.join(', '));

  const dupes = planned.filter((id, i) => planned.indexOf(id) !== i);
  ok(dupes.length === 0, 'no item appears in two tracks', [...new Set(dupes)].join(', '));

  ok(doc.totals.open === open.length, `the stated total matches the register (${doc.totals.open})`);
}

/* ------------------------------------------------------------------ *
 * 2 · nothing is restated, everything is quoted
 * ------------------------------------------------------------------ */
{
  const byId = new Map(master.items.map((i) => [i.id, i]));
  const drifted = [];
  for (const s of steps) {
    const i = byId.get(s.id);
    if (!i) continue;
    if ((s.what ?? null) !== (i.what ?? null)) drifted.push(`${s.id}.what`);
    if ((s.closesWhen ?? null) !== (i.triggerEstablished ? i.trigger : null)) drifted.push(`${s.id}.closesWhen`);
    if (s.actor !== i.actor) drifted.push(`${s.id}.actor`);
    if (JSON.stringify(s.actions) !== JSON.stringify(i.actions)) drifted.push(`${s.id}.actions`);
  }
  ok(drifted.length === 0, 'every step quotes its item rather than restating it',
    drifted.slice(0, 6).join(', '));

  /* A step with no closure criterion must still say so — the walkthrough must not look more
     finished than the register it views. */
  const silent = steps.filter((s) => !s.closesWhen && !s.closureNotEstablished);
  ok(silent.length === 0, 'a step with no stated closure criterion says so', silent.map((s) => s.id).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3 · the ordering is the sources', and it is internally consistent
 * ------------------------------------------------------------------ */
{
  const pos = new Map(steps.map((s, n) => [s.id, n]));
  const inverted = [];
  for (const s of steps) {
    for (const w of s.waitsOn) {
      /* Only meaningful inside one track: a prerequisite held by a different actor cannot be
         ordered against this track's steps, and pretending otherwise would invent a sequence. */
      const sameTrack = doc.tracks.find((t) => t.steps.some((x) => x.id === s.id))
        ?.steps.some((x) => x.id === w);
      if (sameTrack && pos.get(w) > pos.get(s.id)) inverted.push(`${s.id} before ${w}`);
    }
  }
  ok(inverted.length === 0, 'inside a track, nothing is listed before what it waits on',
    inverted.join(', '));

  /* The keystone must be first in its track, or the document buries the one thing that unblocks
     the most. */
  const first = doc.tracks[0]?.steps[0];
  ok(first && first.waitsOn.length === 0,
    `the first step waits on nothing (${first ? first.id : 'none'})`);
}

/* ------------------------------------------------------------------ *
 * 4 · carry-back is named where a step produces a value
 * ------------------------------------------------------------------ */
{
  const carry = steps.filter((s) => s.carryBack);
  ok(carry.length > 0, `at least one step names what to write back (${carry.length})`);
  ok(carry.every((s) => s.carryBack.length > 30),
    'every carry-back says where the value goes, not just that there is one',
    carry.filter((s) => s.carryBack.length <= 30).map((s) => s.id).join(', '));

  /* GOV-01 is the one that has bitten twice: a provisioner run whose GUIDs nobody records leaves
     the repository describing provisioned lists as unprovisioned. */
  const gov1 = steps.find((s) => s.id === 'GOV-01');
  if (gov1) {
    ok(Boolean(gov1.carryBack) && /governance-list-registry/.test(gov1.carryBack),
      'the provisioner step names the file its GUIDs must land in');
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
