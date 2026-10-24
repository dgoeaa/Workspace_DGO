/**
 * The portal domain's console artifacts, and whether the status view of them is true.
 *
 * WHY THIS EXISTS
 *
 * The governance domain has carried a per-step status view since `governance/GOVERNANCE-STATUS.md`:
 * one row per step, what it did, and whether a run established it. The portal domain had the same
 * information and no such view. It was spread across three files — `document-ownership.json` for
 * what the domain owns, `PORTAL-TENANT-RUNBOOK.md` for where each is run, and
 * `PRODUCTION_READINESS_REGISTER.json` for what is recorded about the work each serves — and
 * answering "has this already been done, and is it still needed?" meant joining them by hand.
 * A join done by hand is done once, by one person, and is stale by the next commit.
 *
 * IMPLEMENTATION_WALKTHROUGH.md now renders that join, which is exactly its declared role in the
 * ownership register: status and traceability for the portal domain, restating no step. Its
 * `--check` proves the file matches its builder. This proves the builder matches the world.
 *
 * WHAT IT ASSERTS, AND WHY EACH IS WORTH A BUILD
 *
 *   1. Every owned artifact has a row, and no row invents one. A script dropped from the view is
 *      a script nobody re-checks.
 *   2. The section a row claims is the section the runbook actually runs it in — checked by
 *      finding the heading and looking between it and the next, not by trusting the label.
 *   3. Rows are in runbook order, because the order IS the answer to "what runs when".
 *   4. Every cited item exists, carries exactly that status now, and genuinely names the script.
 *      A status copied into prose and left there is the drift this estate keeps paying for.
 *   5. "no item names it" is true when it is claimed. That phrase is what tells a reader an
 *      artifact closes nothing — a verifier — and it must not be a shrug.
 *
 * Run: node tests/portal-script-status.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const VIEW = 'docs/deployment/IMPLEMENTATION_WALKTHROUGH.md';
const RUNBOOK = 'docs/deployment/PORTAL-TENANT-RUNBOOK.md';

let passed = 0, failed = 0;
const ok = (name) => { passed++; console.log(`  ✅ ${name}`); };
const no = (name, detail) => { failed++; console.log(`  ❌ ${name}\n       ${detail}`); };
const is = (name, cond, detail) => (cond ? ok(name) : no(name, detail));

console.log('\nPortal domain — the console artifacts and what the record says\n');

const view = read(VIEW);
const runbookLines = read(RUNBOOK).split('\n');
const register = JSON.parse(read('docs/deployment/PRODUCTION_READINESS_REGISTER.json'));
const ownership = JSON.parse(read('docs/reference/document-ownership.json'));
const owned = ownership.domains.find((d) => d.owner === RUNBOOK).scripts;

/** The rows of one table, addressed by the bold lead-in above it. */
function rowsUnder(lead) {
  const lines = view.split('\n');
  const at = lines.findIndex((l) => l.startsWith(lead));
  if (at === -1) return null;
  const rows = [];
  for (let i = at; i < lines.length; i++) {
    if (!lines[i].startsWith('|')) { if (rows.length) break; continue; }
    if (/^\|\s*-+/.test(lines[i]) || /^\|\s*Artifact\s*\|/.test(lines[i])) continue;
    rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}

const rows = rowsUnder('**Every console artifact of this domain');
is('the view carries the artifact table', Array.isArray(rows) && rows.length > 0,
  `${VIEW} has no table under the artifact lead-in — the status view is gone, not merely wrong`);

if (rows && rows.length) {
  const named = rows.map((r) => (/`([^`]+)`/.exec(r[0]) || [])[1]);

  is('every owned artifact has a row', owned.every((s) => named.includes(s)),
    `missing: ${owned.filter((s) => !named.includes(s)).join(', ')}`);
  is('no row names an artifact the domain does not own', named.every((n) => owned.includes(n)),
    `invented: ${named.filter((n) => !owned.includes(n)).join(', ')}`);
  is('no artifact is listed twice', new Set(named).size === named.length,
    'a duplicated row is two verdicts for one artifact, and one of them is stale');

  /* ── the section a row claims is the section that runs it ───────────────────────────────── */
  const headingAt = (label) => {
    /* `§3.2 — Get the worklist` and `§3 — Rotate…` are rendered from `### 3.2 Get the worklist`
       and `## §3 · Rotate…`. Match on the number and the title, never on the rendered string. */
    const m = /^§(\S+)\s+—\s+(.*)$/.exec(label);
    if (!m) return -1;
    const [, num, title] = m;
    return runbookLines.findIndex((l) =>
      (l.startsWith('### ') && l.slice(4).trim() === `${num} ${title}`)
      || (l.startsWith('## ') && !l.startsWith('### ') && l.slice(3).trim() === `§${num} · ${title}`));
  };
  const nextHeadingAfter = (i) => {
    const depth = runbookLines[i].startsWith('### ') ? 3 : 2;
    for (let j = i + 1; j < runbookLines.length; j++) {
      const h = /^(#{2,3})\s/.exec(runbookLines[j]);
      if (h && h[1].length <= depth) return j;
    }
    return runbookLines.length;
  };

  const wrong = [];
  const order = [];
  for (const r of rows) {
    const name = (/`([^`]+)`/.exec(r[0]) || [])[1];
    const at = headingAt(r[1]);
    if (at === -1) { wrong.push(`${name}: ${RUNBOOK} has no heading "${r[1]}"`); continue; }
    const body = runbookLines.slice(at, nextHeadingAfter(at)).join('\n');
    if (!body.includes(name)) wrong.push(`${name}: "${r[1]}" does not name it`);
    order.push(at);
  }
  is('every row names the section that actually runs it', !wrong.length, wrong.join('\n       '));
  is('the rows are in runbook order', order.every((v, i) => i === 0 || order[i - 1] <= v),
    'the order of this table is the answer to "what runs when"; sorted any other way it is a list');

  /* ── the verdicts are the register's, as it stands now ──────────────────────────────────── */
  const byId = Object.fromEntries(register.items.map((i) => [i.id, i]));
  const namesIt = (item, script) => JSON.stringify(item).includes(script);
  const bad = [];
  for (const r of rows) {
    const name = (/`([^`]+)`/.exec(r[0]) || [])[1];
    const verdict = r[2];
    const cited = [...verdict.matchAll(/`([A-Z]+-\d+)`\s+([A-Z_]+)/g)].map((m) => [m[1], m[2]]);
    if (!cited.length) {
      if (!/no item names it/.test(verdict)) { bad.push(`${name}: verdict "${verdict}" cites nothing and claims nothing`); continue; }
      const actual = register.items.filter((i) => namesIt(i, name)).map((i) => i.id);
      if (actual.length) bad.push(`${name}: says no item names it; ${actual.join(', ')} do`);
      continue;
    }
    for (const [id, status] of cited) {
      if (!byId[id]) { bad.push(`${name}: cites ${id}, which the register does not carry`); continue; }
      if (byId[id].status !== status) bad.push(`${name}: says ${id} is ${status}; the register says ${byId[id].status}`);
      if (!namesIt(byId[id], name)) bad.push(`${name}: cites ${id}, which does not name it`);
    }
  }
  is('every verdict is the register\'s current status, for an item that names the artifact',
    !bad.length, bad.join('\n       '));
}

/* ── the artifacts that no domain owns are shown as such ──────────────────────────────────── */
const recorded = rowsUnder('**Artifacts recorded rather than owned**');
is('the view carries the recorded-artifact table', Array.isArray(recorded) && recorded.length > 0,
  'the artifacts nobody owns are the ones most worth showing');

if (recorded && recorded.length) {
  const entries = ownership.consoleArtifacts.artifacts;
  is('one row per recorded artifact', recorded.length === entries.length,
    `${entries.length} recorded, ${recorded.length} shown`);
  const unowned = entries.filter((a) => !a.instructedBy);
  const blunt = recorded.filter((r) => /nothing instructs it/i.test(r[1]));
  is('an artifact no document instructs says so in the view', blunt.length === unowned.length,
    `${unowned.length} recorded with no instructing document, ${blunt.length} shown that way — `
    + 'a blank cell is how an orphan stays an orphan');
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
