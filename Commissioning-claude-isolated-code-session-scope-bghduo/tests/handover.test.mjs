#!/usr/bin/env node
/**
 * The handover is executable: every path it names resolves, and nothing it ships is a credential.
 *
 * WHY THIS EXISTS
 *
 * `HOW-TO-USE-THIS-BUNDLE.md` declares itself the only entry document and, until 2026-09-15, sent
 * every reader to `registers/ACTION_PLAN.md`, `packages/`, `notification/` and `evidence/`. No
 * directory named `registers/` has ever existed in this tree. A bundle was assembled by hand once;
 * the manual outlived the assembly and went on naming a layout nothing produced.
 *
 * Nothing caught it. Every gate around these documents checks that they match a REGISTER — the
 * counts, the section names, the item totals are all derived and all correct. Not one of them
 * checked the thing a reader does first, which is open a path.
 *
 * So this is the gate for the reader's side: a document that tells someone where to look must be
 * telling the truth about where the file is. It is deliberately dumb — it resolves paths and
 * nothing else — because that is the failure that occurred.
 *
 * Usage:  node tests/handover.test.mjs
 * Exit:   0 = every named path resolves and the export is sound, 1 = otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\n').filter(Boolean));

/** The two documents a recipient of an export opens, in the order the export tells them to. */
const DOCS = [
  'docs/deployment/HANDOVER_BRIEF.md',
  'docs/deployment/HOW-TO-USE-THIS-BUNDLE.md',
];

/**
 * Paths a reader will correctly fail to find, each for a stated reason. An entry here is a claim
 * that the path is absent BY DESIGN — not a way to quiet the check. Two kinds only:
 * created-by-the-reader, and created-by-a-command-into-a-git-ignored-directory.
 */
const ABSENT_BY_DESIGN = new Map([
  ['config/config.local.js', 'git-ignored: holds signed trigger URLs; the reader creates it'],
  ['document-portal/config.local.js', 'git-ignored: holds signed trigger URLs; the reader creates it'],
  ['config.local.js', 'git-ignored, named without its directory where both surfaces are meant'],
  ['~/dgo-values.txt', 'produced on the reader’s own host by the harvest step, and shredded after'],
  ['EXPORT_MANIFEST.json', 'written into the export by npm run export; not a tracked file'],
  ['node_modules/', 'installed, never shipped'],
  ['dist/', 'git-ignored build output'],
  ['tenant-inventory.json', 'the filled copy the reader returns; the blank form is tracked elsewhere'],
  ['connection-verification.json', 'the filled copy the reader returns; the blank form is tracked elsewhere'],
]);

/**
 * Looks like a path this repository would hold: has a slash or a file extension, and no glob.
 *
 * A bare extension is excluded. `.browser.js` and `.json` appear in these documents as the NAME of
 * a kind of file — "every time a runbook names a `.browser.js` file" — and reading those as paths
 * produced two findings that were only ever a sentence about a suffix.
 */
const LOOKS_LIKE_A_PATH = (s) => /^[\w@~][\w./@~-]*$/.test(s)
  && (s.includes('/') || /\.(md|json|mjs|js|html|css|txt|ps1|csv)$/.test(s))
  && !s.startsWith('http');

/** Every path a document names, from inline code spans and from relative markdown links. */
const namedPaths = (rel) => {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const out = new Map();
  const add = (raw, line) => {
    const s = raw.replace(/^\.\//, '').replace(/[.,;:]$/, '');
    if (LOOKS_LIKE_A_PATH(s)) out.set(s, out.get(s) ?? line);
  };
  const lineOf = (i) => text.slice(0, i).split('\n').length;
  for (const m of text.matchAll(/`([^`\n]+)`/g)) add(m[1], lineOf(m.index));
  for (const m of text.matchAll(/\]\((\.{0,2}\/[^)\s]+)\)/g)) add(m[1], lineOf(m.index));
  return out;
};

/** Resolve as a reader would: a repo-root path if it starts at a top-level directory, else beside the document. */
const resolves = (p, fromDoc) => {
  const asRoot = p;
  const asSibling = path.posix.join(path.dirname(fromDoc), p);
  for (const candidate of [asRoot, asSibling]) {
    if (fs.existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
};

console.log('\nHandover — every named path resolves, and the export ships nothing it should not\n');

for (const doc of DOCS) {
  check(`${path.basename(doc)} — every path it names resolves`, () => {
    const dead = [];
    for (const [p, line] of namedPaths(doc)) {
      if (ABSENT_BY_DESIGN.has(p)) continue;
      if (!resolves(p, doc)) dead.push(`${doc}:${line} names \`${p}\``);
    }
    assert(!dead.length, `${dead.length} path(s) a reader would open and not find:\n       ${dead.join('\n       ')}`);
  });
}

check('the entry document does not name a directory layout nothing produces', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs/deployment/HOW-TO-USE-THIS-BUNDLE.md'), 'utf8');
  /* The exact shape of the 2026-09-15 defect: a bundle-relative prefix with nothing behind it. */
  const invented = [...guide.matchAll(/`(registers|packages|notification)\/[^`]*`/g)].map((m) => m[0]);
  assert(!invented.length, `names a layout that does not exist: ${invented.join(', ')}`);
});

check('the handover brief carries no steps, as it claims', () => {
  const brief = fs.readFileSync(path.join(ROOT, 'docs/deployment/HANDOVER_BRIEF.md'), 'utf8');
  assert(/It carries\s*\n?no steps\.|It carries no steps\./.test(brief.replace(/\n/g, '\n')),
    'the brief no longer states that it carries no steps — either restore the claim or this check is measuring the wrong thing');
  const scripts = [...brief.matchAll(/[\w-]+\.browser\.js/g)].map((m) => m[0]);
  assert(!scripts.length, `names ${scripts.length} console script(s) — a document that carries no steps must not: ${[...new Set(scripts)].join(', ')}`);
});

check('both entry documents are tracked, so an export contains them', () => {
  for (const doc of DOCS) assert(tracked.has(doc), `${doc} is not tracked and would not be exported`);
});

check('no tracked file matches an ignore rule', () => {
  const bad = execFileSync('git', ['ls-files', '-i', '-c', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean);
  assert(!bad.length, `${bad.length} tracked file(s) match an ignore rule, and those rules are credential rules: ${bad.slice(0, 5).join(', ')}`);
});

check('the export declares an entry document that the entry document agrees with', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/export-handover.mjs'), 'utf8');
  for (const doc of DOCS) assert(src.includes(doc), `npm run export does not name ${doc} as an entry point`);
  const brief = fs.readFileSync(path.join(ROOT, 'docs/deployment/HANDOVER_BRIEF.md'), 'utf8');
  assert(brief.includes('HOW-TO-USE-THIS-BUNDLE.md'),
    'the brief does not hand the reader on to the entry document, so the chain breaks after page one');
});

console.log(`\n  ${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  console.error('Failures:\n');
  for (const f of failures) console.error(`  ✖  ${f}\n`);
  process.exit(1);
}
