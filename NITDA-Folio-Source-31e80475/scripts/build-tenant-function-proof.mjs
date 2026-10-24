#!/usr/bin/env node
/**
 * The workflow expression functions proven to run in this tenant by flows that are now retired.
 *
 *   npm run functionproof            write registers/tenant-function-proof.json
 *   npm run functionproof -- --check
 *
 * The identification and portal package tests accept a function only when a flow the tenant ran already uses it. Most
 * of that proof came from flow definitions retired on 2026-10-05 (registers/flow-adoption.json): their files are gone
 * from the folder, but each is held at the commit the retirement record names, with its SHA-256. This reads every
 * retired definition at that commit and records, per function, every retired file it occurs in. The proof is historical
 * and does not change. It also records the connection names the retired export packages carried.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse, expressionsIn, functionsIn } from './lib/wdl-sim.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CHECK = process.argv.includes('--check');
const B = 'docs/folio-Master-Flows-and-Endpoints';
const OUT = `${B}/registers/tenant-function-proof.json`;
const rec = JSON.parse(readFileSync(join(ROOT, `${B}/registers/flow-retirement.json`), 'utf8'));
const proof = {};
/* The tenant's own naming of the connections these flows bound (packageProvenance.connections: the export manifest's
   resources joined to connectionsMap.json). The notification matrix's PRE-1 rests on it, and the exports that carried
   it are retired. */
const connections = [];
/* Flow artefacts only (`flow` set): tooling retired with them — remediation proposals, a patched definition that was
   never the tenant's — proves nothing about what the tenant ran. */
for (const f of rec.files.filter((x) => x.flow && /\.json$/.test(x.path) && !/designer-paste|trigger_input_schema|varResponse|flow_run_record/.test(x.path))) {
  const buf = execFileSync('git', ['show', `${f.commit || rec.lastCommitHoldingThem}:${f.path}`], { cwd: ROOT, maxBuffer: 1 << 28 });
  if (createHash('sha256').update(buf).digest('hex') !== f.sha256) throw new Error(`${f.path}: the commit's copy does not match the recorded SHA-256`);
  let doc; try { doc = JSON.parse(buf.toString('utf8').replace(/^﻿/, '')); } catch { continue; }
  const fns = new Set();
  for (const e of expressionsIn(doc)) { try { functionsIn(parse(e), fns); } catch { /* not an expression */ } }
  for (const fn of fns) (proof[fn] ||= []).push(f.path);
  for (const [api, c] of Object.entries(doc?.packageProvenance?.connections || {})) {
    connections.push({ flow: doc.workflow_identity?.tags?.flowDisplayName ?? f.path.split('/').pop(), api, displayName: String(c.displayName ?? ''), path: f.path });
  }
}
const out = { generatedBy: 'scripts/build-tenant-function-proof.mjs', commit: rec.lastCommitHoldingThem, read: `git show ${rec.lastCommitHoldingThem}:<path>`,
  functions: Object.fromEntries(Object.keys(proof).sort().map((k) => [k, proof[k]])),
  packageConnections: connections.sort((a, b) => (a.path + a.api < b.path + b.api ? -1 : a.path + a.api > b.path + b.api ? 1 : 0)) };
const body = `${JSON.stringify(out, null, 2)}\n`;
let cur = null; try { cur = readFileSync(join(ROOT, OUT), 'utf8'); } catch { /* new */ }
if (CHECK) { if (cur !== body) { console.error(`${OUT} is out of date — run: npm run functionproof`); process.exit(1); } console.log(`tenant function proof: up to date (${Object.keys(proof).length} functions)`); }
else { writeFileSync(join(ROOT, OUT), body); console.log(`tenant function proof: ${Object.keys(proof).length} functions from retired definitions at ${rec.lastCommitHoldingThem}`); }
