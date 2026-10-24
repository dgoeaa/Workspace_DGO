#!/usr/bin/env node
/**
 * Rebuild every derived document in this repository.
 *
 * The documents listed in `.gitignore` under "Derived documentation" are not
 * tracked: each one is printed from a tracked source by a builder in this
 * directory, and a checkout therefore starts without them. This script puts
 * them back. `npm run test:node` runs it first, so the gates that read a
 * derived document find one.
 *
 * Builders feed each other — a register is rendered, and the rendering is then
 * counted by the surface — so a single pass in the wrong order leaves a stale
 * file behind. Rather than encode the dependency graph, this runs the whole set
 * repeatedly until a pass changes nothing. Convergence is the contract; the
 * order is not.
 *
 * Usage:
 *   node scripts/generate-all.mjs            rebuild until settled
 *   node scripts/generate-all.mjs --check    rebuild, then fail if anything is
 *                                            still missing (CI use)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MAX_PASSES = 4;

// Every builder whose output is pinned by a `--check` gate, plus the
// provisioning reference, which has no `--check` of its own but is held to the
// packages by tests/provisioning-reference.test.mjs.
const BUILDERS = readFileSync(new URL('./generate-all.builders', import.meta.url), 'utf8')
  .split('\n')
  .map(line => line.replace(/#.*$/, '').trim())
  .filter(Boolean);

// Where builders write. Hashed between passes to detect settling.
const WATCHED = ['docs', 'tools', 'config', 'tests', 'assets', 'styles'];

function hashTree() {
  const h = createHash('sha256');
  const walk = dir => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(p);
      } else if (e.isFile()) {
        h.update(p);
        h.update(String(statSync(p).size));
        h.update(readFileSync(p));
      }
    }
  };
  for (const root of WATCHED) if (existsSync(root)) walk(root);
  return h.digest('hex');
}

function runPass(pass) {
  const failed = [];
  for (const builder of BUILDERS) {
    try {
      execFileSync('npm', ['run', '--silent', builder], { stdio: 'pipe' });
    } catch (err) {
      failed.push({ builder, err });
    }
  }
  return failed;
}

console.log('\nGenerate derived documentation\n');

let settled = false;
let before = hashTree();
let lastFailures = [];

for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
  lastFailures = runPass(pass);
  const after = hashTree();
  if (after === before) {
    console.log(`  pass ${pass}  settled`);
    settled = true;
    break;
  }
  console.log(`  pass ${pass}  rebuilt`);
  before = after;
}

if (!settled) {
  console.error(
    `\n  ✖  still changing after ${MAX_PASSES} passes.\n` +
      '     A builder is non-deterministic, or two disagree about one file.\n'
  );
  process.exit(1);
}

if (lastFailures.length) {
  console.error('\n  ✖  a builder failed on the settling pass:\n');
  for (const { builder } of lastFailures) console.error(`       npm run ${builder}`);
  console.error('');
  process.exit(1);
}

console.log(`\n  ✅ ${BUILDERS.length} builder(s), all derived documents present\n`);
