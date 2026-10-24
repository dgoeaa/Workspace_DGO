#!/usr/bin/env node
/**
 * A SIXTH PLACE TO HIDE WORK HAS TO BE DECLARED BEFORE IT CAN EXIST.
 *
 * `npm run outstanding` totals every source declared in OUTSTANDING_SOURCES.json. That is only
 * worth having if the declaration is complete, and nothing made it complete: the five sources were
 * found by reading the repository, and a sixth added next month would be found the same way, by
 * somebody noticing. Three of the original five were counted by no command at all — P-01…P-17 was
 * referenced by one prose sentence, and the two audits by nothing — so "somebody notices" has a
 * measured failure rate of three in five.
 *
 * WHAT THIS CHECKS
 *
 *   1. Every declared source exists, reads, and yields entries. A source whose pattern silently
 *      stops matching reports zero outstanding, which is the most dangerous number this estate
 *      can print.
 *   2. Every register-SHAPED document under docs/ is declared. Shape is defined below and is
 *      deliberately generous: it is better to make someone declare a document that turned out not
 *      to be a register than to let a register go uncounted.
 *   3. The rollup is current.
 *
 * WHAT "REGISTER-SHAPED" MEANS
 *
 * A document that carries several distinct `PREFIX-NN` or `PREFIX-N` identifiers as structural
 * markers — headings, bold run-in heads, or the first cell of table rows. That is what every one
 * of the five looks like, and it is what a sixth would look like. Prose that merely MENTIONS
 * ITEM-22 nine times is not shaped like a register: the ids have to be structure, not citation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

const SOURCES = 'docs/deployment/OUTSTANDING_SOURCES.json';
const declared = JSON.parse(read(SOURCES));
const declaredPaths = new Set(declared.sources.map((s) => s.path));

console.log('\nOutstanding sources — every place work hides, declared\n');

/* ------------------------------------------------------------------ *
 * 1 · the declaration is honest about itself
 * ------------------------------------------------------------------ */

{
  const missing = declared.sources.filter((s) => !existsSync(join(ROOT, s.path))).map((s) => `${s.id} → ${s.path}`);
  ok(missing.length === 0, 'every declared source exists', missing.join(', '));

  /* Each source must explain itself. A federation whose entries carry no reason for being separate
     is a merge that nobody finished. */
  const counted = declared.sources.filter((s) => s.counted !== false);
  const thin = counted.filter((s) => !s.authority || s.authority.length < 40).map((s) => s.id);
  ok(thin.length === 0, 'every counted source says what it is and why it is separate', thin.join(', '));

  /* A source counted entirely open must say why, because "all open" is an assertion about a
     document, not a reading of it. */
  const unexplained = counted.filter((s) => s.allOpen && !s.allOpenBecause).map((s) => s.id);
  ok(unexplained.length === 0,
    'every source counted wholly open states the grounds for that',
    unexplained.join(', '));

  /* AND AN UNCOUNTED ONE MUST SAY WHY IT IS UNCOUNTED. This is the field that keeps counted:false
     from becoming a checkbox. Eleven documents carry it; each names the counted source that
     already holds its work, or the reason it is a record of a scope that no longer exists. A
     twelfth added without a reason fails here. */
  const silent = declared.sources
    .filter((s) => s.counted === false)
    .filter((s) => !s.notCountedBecause || s.notCountedBecause.length < 30)
    .map((s) => s.id);
  ok(silent.length === 0,
    `every uncounted source states why it is not counted (${declared.sources.length - counted.length} uncounted)`,
    silent.join(', '));
}

/* ------------------------------------------------------------------ *
 * 2 · the rollup reads them, and none reads empty
 * ------------------------------------------------------------------ */

let rollup = '';
{
  let code = 0;
  try {
    rollup = execFileSync(process.execPath, [join(ROOT, 'scripts/build-outstanding-rollup.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; rollup = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run outstanding is current', rollup.trim().split('\n').slice(-3).join(' '));
  ok(!/read 0 entries/.test(rollup),
    'no declared source reads empty',
    'a pattern that stops matching reports zero outstanding, which reads exactly like finished work');
}

/* ------------------------------------------------------------------ *
 * 3 · nothing register-shaped is undeclared
 * ------------------------------------------------------------------ */

/* Records that are deliberately NOT task lists, and trees that hold evidence rather than work.
   Each is exempt for a reason this repository already states elsewhere; an exemption added
   without one is how this check would rot. */
const EXEMPT = [
  ['docs/archive', 'retired by definition'],
  ['docs/forensic', 'a forensic snapshot of one commit, never rewritten'],
  ['docs/reference/foundational', 'the pre-rotation estate verbatim, decision D5'],
  ['docs/reference/flow-contracts', 'tenant exports and probe transcripts'],
  ['docs/deployment/sharepoint/evidence', 'tenant readings'],
  ['docs/deployment/internal/evidence', 'tenant readings'],
  ['docs/process', 'generated from one discovery run'],
  ['docs/deployment/sharepoint/OPEN_ITEMS.md', 'the readiness register carries these; npm run test:closure holds it to them'],
  ['docs/deployment/ACTION_PLAN.md', 'generated FROM the readiness register'],
  ['docs/deployment/EXECUTION_RUNBOOK.md', 'generated FROM the readiness register'],
  ['docs/deployment/IMPLEMENTATION_WALKTHROUGH.md', 'generated FROM the readiness register'],
  ['docs/deployment/COMMISSIONING_SURFACE.md', 'generated FROM the readiness register'],
  ['docs/deployment/OUTSTANDING.md', 'generated FROM these sources'],
  ['docs/deployment/CLOSURE_DISPOSITION.md', 'generated FROM the readiness register'],
];
const exemptRel = (rel) => EXEMPT.some(([p]) => rel === p || rel.startsWith(`${p}/`));

/* Structural, not cited: an id at the head of a heading, a bold run-in, or a table row. */
const STRUCTURAL = [
  /^#{1,4}\s+\*{0,2}([A-Z][A-Z-]{0,12}-\d{1,3})\b/gm,
  /^\*\*([A-Z][A-Z-]{0,12}-\d{1,3})\s*[·—–-]/gm,
  /^\|\s*\*{0,2}~{0,2}([A-Z][A-Z-]{0,12}-\d{1,3})~{0,2}\*{0,2}\s*\|/gm,
];

/* IDS ALONE ARE NOT A REGISTER, AND THE FIRST VERSION OF THIS CHECK GOT THAT WRONG.
 *
 * Run on structure alone it flagged seventeen documents: ADR-001…ADR-010 (architecture decisions),
 * INT-004…INT-007 (integration contracts), OP-001…OP-014 (operation specifications), PRE-1 and the
 * RN- rows of the notification matrix, WP-0…WP-39 (work packages in a brief). Every one enumerates
 * things that EXIST. None of them is a place unfinished work hides, and demanding an exemption for
 * each would have produced seventeen rubber-stamped entries — the exact ceremony that makes a
 * check worthless.
 *
 * What separates a register is that its entries carry a DISPOSITION: each one is open, or done, or
 * blocked, or waiting on someone. A specification says what a thing is; a register says where a
 * thing stands. So an id must be accompanied by the vocabulary of standing before this fires.
 *
 * The bar stays deliberately low — one disposition word per four ids — because the failure this
 * guards against (work counted nowhere) costs more than the failure it risks (one unnecessary
 * exemption, written once, with a reason). */
const DISPOSITION = /\b(outstanding|still to do|not (?:yet )?(?:done|applied|implemented|provisioned|started)|remains? open|unresolved|pending|blocked|awaiting|to be (?:done|decided|applied)|owner\s*:|who (?:can )?acts?)\b/i;

function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    const rel = abs.slice(ROOT.length + 1);
    if (exemptRel(rel)) continue;
    if (statSync(abs).isDirectory()) markdownFiles(abs, out);
    else if (/\.md$/i.test(entry)) out.push(rel);
  }
  return out;
}

{
  const undeclared = [];
  for (const rel of markdownFiles(join(ROOT, 'docs'))) {
    if (declaredPaths.has(rel)) continue;
    const text = read(rel);
    const ids = new Set();
    for (const re of STRUCTURAL) for (const m of text.matchAll(re)) ids.add(m[1]);
    /* Four distinct structural ids is a register; one or two is a document that happens to head a
       section with an item id, which several procedures legitimately do. */
    if (ids.size < 4) continue;
    const dispositions = (text.match(new RegExp(DISPOSITION.source, 'gi')) || []).length;
    if (dispositions < Math.max(2, ids.size / 4)) continue;
    undeclared.push(`${rel} — ${ids.size} structural ids (${[...ids].slice(0, 4).join(', ')}…), `
      + `${dispositions} disposition marker(s)`);
  }

  ok(undeclared.length === 0,
    `every register-shaped document under docs/ is declared (${declaredPaths.size} declared)`,
    undeclared.length
      ? `${undeclared.length} undeclared:\n       ${undeclared.join('\n       ')}\n`
        + `       Add it to ${SOURCES}, or exempt it there with the reason it is not a register.`
      : '');
}

/* ------------------------------------------------------------------ *
 * 4 · the shape rule rejects what it claims to reject
 * ------------------------------------------------------------------ */

{
  const REGISTERISH = '## P-01 First\n## P-02 Second\n## P-03 Third\n## P-04 Fourth\n';
  const PROSE = 'ITEM-22 is closed. See ITEM-22, ITEM-23 and ITEM-25 for the rest of the story.\n';
  const count = (t) => { const s = new Set(); for (const re of STRUCTURAL) for (const m of t.matchAll(re)) s.add(m[1]); return s.size; };
  const wrong = [];
  if (count(REGISTERISH) < 4) wrong.push('does not recognise a plain markdown register');
  if (count(PROSE) >= 4) wrong.push('mistakes prose that cites item ids for a register');
  ok(wrong.length === 0, 'the register-shape rule separates a register from prose that cites items',
    wrong.join('; '));
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
