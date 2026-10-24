#!/usr/bin/env node
/**
 * The archive scanner runs without `unzip`, and reads what `unzip` reads.
 *
 * WHY THIS SUITE EXISTS
 *
 * `tests/check-secrets.mjs` scans inside tracked archives, because an archive is text in a
 * container: `ECM_DOCS_DEV.zip` held 31 distinct signatures across 18 of its 837 members, nine
 * of which appeared in no commit and no tracked text file.
 *
 * It did that by shelling out to `unzip`, and refused to report green when `unzip` was missing —
 * correct in principle, and unrunnable in practice on Windows, where `unzip` is not on the PATH.
 * A Windows clone reported all 13 tracked archives unscannable, exited 1, and `npm run
 * commission` raised it as a blocker worded identically to a real credential leak. It was found
 * exactly that way: a verified clone, `2a9b6cd`, 1811 tracked files, reporting three blockers
 * where the same commit reports two on Linux.
 *
 * A security control that is permanently red on the most common developer platform teaches
 * people to ignore it. These assertions hold the fix in place:
 *
 *   1. The reader lists and extracts identically to `unzip`, on the real tracked archives —
 *      because a portable reader that reads DIFFERENTLY would be a silent narrowing of the
 *      control, which is worse than the failure it replaced.
 *   2. The ratchet exits 0 when `unzip` is unavailable — reproduced by shadowing it with a stub
 *      that always fails, rather than by stripping the PATH, which also breaks `git` and would
 *      fail the ratchet for the wrong reason.
 *   3. Neither `check-secrets.mjs` nor the reader shells out to `unzip` — the reader spawns
 *      nothing at all, which is what makes it immune to a missing or broken binary.
 *   4. An unreadable archive is still reported unscannable rather than skipped.
 *
 * Assertion 1 is skipped when `unzip` is not installed — there is nothing to compare against.
 * The others run everywhere, which is the point.
 *
 * Usage:  node tests/zip-reader.test.mjs
 * Exit:   0 = the control runs and reads correctly, 1 = otherwise
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { openZip } from '../scripts/lib/zip-reader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failures.push(`${name}\n      ${e.message}`); console.log(`  ❌ ${name}\n       ${e.message}`); }
};
const skip = (name, why) => console.log(`  ⊘ ${name} — ${why}`);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const hasUnzip = spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status === 0;

const archives = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
  .toString('utf8').split('\0').filter(Boolean)
  .filter((f) => /\.(zip|docx|xlsx|pptx)$/i.test(f));

console.log(`\nArchive scanning — ${archives.length} tracked archive(s)\n`);

check('every tracked archive parses', () => {
  const broken = [];
  for (const rel of archives) {
    try { openZip(path.join(ROOT, rel)); }
    catch (e) { broken.push(`${rel}: ${e.message}`); }
  }
  assert(broken.length === 0, `${broken.length} archive(s) failed to parse:\n      ${broken.join('\n      ')}`);
});

if (!hasUnzip) {
  skip('the reader agrees with unzip', 'unzip is not installed — nothing to compare against');
} else {
  check('the reader lists the same members as unzip, on every tracked archive', () => {
    const differ = [];
    for (const rel of archives) {
      const abs = path.join(ROOT, rel);
      const mine = openZip(abs).members.map((m) => m.name).sort();
      const theirs = execFileSync('unzip', ['-Z1', abs], { maxBuffer: 64 * 1024 * 1024 })
        .toString('utf8').split('\n').filter(Boolean).sort();
      if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
        differ.push(`${rel}: ${mine.length} vs ${theirs.length} members`);
      }
    }
    assert(differ.length === 0, `${differ.length} listing mismatch(es):\n      ${differ.join('\n      ')}`);
  });

  check('the reader extracts byte-identical content to unzip', () => {
    /* EVERY tracked archive, member by member. A reader that lists correctly and decompresses
       wrongly would pass the assertion above and silently scan garbage.

       This used to pin to one large archive by name and require 100+ members from it alone. That
       archive lived in the harvest corpus, which is no longer carried, and a check that depends on
       one named file fails for a reason that has nothing to do with what it tests. Comparing the
       whole tracked set keeps the sample as large as the estate actually offers, and the floor
       below still refuses a vacuous pass. */
    let compared = 0;
    const differ = [];
    for (const rel of archives) {
      const abs = path.join(ROOT, rel);
      for (const m of openZip(abs).members) {
        if (m.isDirectory) continue;
        let mine;
        try { mine = m.read(); } catch { continue; }
        /* unzip treats the member name as a GLOB, so an OOXML part literally called
           `[Content_Types].xml` matches nothing and unzip returns empty with a caution. Escaping
           the metacharacters asks for the file that is actually there. */
        const pattern = m.name.replace(/[[\]*?]/g, (ch) => `\\${ch}`);
        const theirs = execFileSync('unzip', ['-p', abs, pattern], { maxBuffer: 64 * 1024 * 1024 });
        compared++;
        const a = crypto.createHash('sha256').update(mine).digest('hex');
        const b = crypto.createHash('sha256').update(theirs).digest('hex');
        if (a !== b) differ.push(`${rel}:${m.name}`);
      }
    }
    assert(compared > 0,
      `no member of any of the ${archives.length} tracked archive(s) could be compared`);
    assert(differ.length === 0, `${differ.length} member(s) differ: ${differ.slice(0, 5).join(', ')}`);
  });
}

check('check-secrets no longer shells out to unzip', () => {
  const src = fs.readFileSync(path.join(ROOT, 'tests/check-secrets.mjs'), 'utf8');
  assert(!/execFileSync\(\s*'unzip'/.test(src),
    'check-secrets.mjs still calls unzip — the Windows failure would return');
  assert(/openZip/.test(src), 'check-secrets.mjs does not use the portable reader');
});

check('the ratchet exits 0 when unzip is unavailable', () => {
  /* THE WINDOWS CONDITION, REPRODUCED PORTABLY.
   *
   * The first version of this assertion stripped the PATH down to a temp directory holding
   * node and git, on the theory that removing `unzip` reproduces Windows. It does not. On
   * Windows a copied `git.exe` cannot find its own DLLs and libexec, so `git ls-files` — which
   * check-secrets.mjs calls on its first line of work — failed, the ratchet exited 1, and the
   * assertion reported the Windows defect as still present when it had been fixed. It was found
   * that way: `npm run commission` on a Windows clone printed `secret ratchet passes` while this
   * suite insisted the ratchet was broken.
   *
   * A test that breaks the tool it is measuring proves nothing about the tool. So the PATH is
   * left intact and `unzip` is SHADOWED instead: a stub that always exits 1 is placed first on
   * the PATH. Everything else — git above all — resolves exactly as it normally does. If the
   * ratchet still exits 0, it does not depend on unzip working, which is the actual claim.
   */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-unzip-stub-'));
  try {
    if (process.platform === 'win32') {
      fs.writeFileSync(path.join(dir, 'unzip.cmd'), '@echo off\r\nexit /b 1\r\n');
    } else {
      const stub = path.join(dir, 'unzip');
      fs.writeFileSync(stub, '#!/bin/sh\nexit 1\n');
      fs.chmodSync(stub, 0o755);
    }
    const env = { ...process.env, PATH: dir + path.delimiter + process.env.PATH };

    assert(spawnSync('unzip', ['-v'], { env, shell: process.platform === 'win32', stdio: 'ignore' }).status !== 0,
      'the unzip stub is not being resolved first — this assertion is not testing what it claims');

    const r = spawnSync(process.execPath, [path.join(ROOT, 'tests/check-secrets.mjs')], {
      cwd: ROOT, env, encoding: 'utf8',
    });
    assert(r.status === 0,
      `the ratchet exits ${r.status} when unzip fails. That is the Windows condition, and it makes `
      + 'npm run commission report a security blocker on a clean tree.\n      '
      + String(r.stderr || r.stdout || '(no output)').split('\n').slice(-6).join('\n      '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

check('the reader itself spawns nothing', () => {
  /* The strongest guarantee, and the one that holds on every platform: a reader that starts no
     child process cannot be defeated by a missing or broken binary. */
  const src = fs.readFileSync(path.join(ROOT, 'scripts/lib/zip-reader.mjs'), 'utf8');
  assert(!/child_process/.test(src), 'zip-reader.mjs imports child_process — it must not spawn anything');
  assert(!/execFileSync|spawnSync|execSync/.test(src), 'zip-reader.mjs spawns a process');
});

check('an unreadable archive is still reported, not skipped', () => {
  /* The original design is preserved: a control that cannot run must say so. A portable reader
     that swallowed a corrupt archive would be a quieter version of the same failure. */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dgo-badzip-'));
  try {
    const bad = path.join(dir, 'corrupt.zip');
    fs.writeFileSync(bad, Buffer.from('PK this is not a zip'));
    let threw = false;
    try { openZip(bad); } catch { threw = true; }
    assert(threw, 'openZip accepted a corrupt archive — check-secrets would report it scanned and clean');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed\n`);
if (failures.length) for (const f of failures) console.log(`   ${f}\n`);
process.exit(failures.length ? 1 : 0);
