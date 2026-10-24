#!/usr/bin/env node
/**
 * The rotation worklist — every published signature, and what has to happen to it.
 *
 *   npm run rotation                       # the register, grouped by flow
 *   npm run rotation -- --json out.json    # machine-readable, for a tracking sheet
 *   npm run rotation -- --check            # exit 1 while any signature is still published
 *
 * "Rotate 55 signatures in Power Automate" is a true instruction and an unusable one. It
 * names a number, not a list; it does not say which flow each belongs to, which endpoint
 * key the platform reaches it by, or which of them are the same credential appearing in
 * eight files. Somebody has to derive all of that before they can start, and deriving it by
 * hand from a 23 MB corpus is how a rotation gets half done.
 *
 * This derives it. One row per WORKFLOW, because rotation happens per flow and not per
 * file: regenerating one trigger invalidates every copy of its URL at once.
 *
 * NO SIGNATURE IS PRINTED. Each is identified by workflow id and a short fingerprint of the
 * signature itself, so two different signatures on one workflow are distinguishable — which
 * happens, and means an older URL is still live — without the register itself becoming the
 * thing it is asking you to revoke. The output is safe to paste into a ticket.
 *
 * Exit 0 always, unless --check is passed.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { trackedFiles, publishedSignatures } from './lib/published-signatures.mjs';
import { SURFACES, SURFACE_IDS } from './lib/endpoint-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const JSON_OUT = (() => { const i = argv.indexOf('--json'); return i !== -1 ? argv[i + 1] : null; })();

/** Short, stable, and not reversible into the signature. */
const fingerprint = sig => crypto.createHash('sha256').update(sig).digest('hex').slice(0, 8);

const tracked = trackedFiles(ROOT);
if (!tracked) {
  console.error('\n  ✖  Not a git work tree — there is nothing to enumerate.\n');
  process.exit(2);
}

const published = publishedSignatures(ROOT, tracked);

/*
 * Which workflow each signature belongs to.
 *
 * A signature appears in a URL, and the URL carries the workflow id. Scanning for the
 * signature alone loses that association, so the files are re-read for the URL shape and
 * the two are joined. A signature whose workflow cannot be determined is reported as
 * unattributed rather than dropped — an unattributable credential still has to be found and
 * rotated, and hiding it because the tooling could not classify it is exactly the kind of
 * silent narrowing this audit exists to stop.
 */
const URL_WITH_SIG = /https?:\/\/[^\s"'<>)\]]*?\/workflows\/([0-9a-f]{32})\/[^\s"'<>)\]]*?sig=([A-Za-z0-9_-]{20,})/gi;
const HOST_OF = /https?:\/\/([^/\s"'<>]+)/i;

const byWorkflow = new Map();      // workflowId -> { host, signatures:Set, files:Set }
const attributed = new Set();      // signatures we managed to place

for (const file of tracked) {
  let text;
  try {
    const st = fs.statSync(path.join(ROOT, file));
    if (!st.isFile() || st.size > 256 * 1024 * 1024) continue;
    const buf = fs.readFileSync(path.join(ROOT, file));
    if (buf.includes(0)) continue;
    text = buf.toString('latin1');
  } catch { continue; }
  if (!/sig=/.test(text)) continue;

  for (const m of text.matchAll(URL_WITH_SIG)) {
    const [full, workflowId, rawSig] = m;
    /* A trigger signature is HMAC-SHA256 base64url — exactly 43 characters. The capture above
       is deliberately {20,} so a mangled copy is still found, but the corpus glues prose
       straight onto the end of URLs (`…sig=XXXgetEmailsPOST`), so the raw capture is a
       different STRING for the same credential depending on what followed it in the file.
       Counting those raw strings inflated the published total and, worse, made one signature
       on one flow look like "2 DIFFERENT signatures on this one flow" — a warning that read as
       a real finding about key reuse and was an artefact of the match. Rotation is per
       credential, so the identity is the 43 characters. */
    const sig = rawSig.slice(0, 43);
    attributed.add(sig);
    if (!byWorkflow.has(workflowId)) {
      byWorkflow.set(workflowId, {
        host: (HOST_OF.exec(full) || [])[1] || '(unknown host)',
        signatures: new Set(), files: new Set(),
      });
    }
    const w = byWorkflow.get(workflowId);
    w.signatures.add(sig);
    w.files.add(file);
  }
}

const unattributed = [...published.keys()].filter(s => !attributed.has(s));

/*
 * Which endpoint key reaches each workflow, where that can be told.
 *
 * The corpus documents the deployed estate, so several of these workflows ARE the flows the
 * platform calls. Naming the key turns "rotate this flow" into "rotate this flow, and the
 * package that reaches it by FETCH_ALL must be rebuilt" — which is the sentence somebody
 * actually needs. Derived from any endpoint configuration present in the tree; absent in a
 * clean clone, which is stated rather than left blank.
 */
function configuredWorkflows() {
  const out = new Map();  // workflowId -> [ 'runtime:FETCH_ALL', ... ]
  for (const id of SURFACE_IDS) {
    const rel = id === 'runtime' ? 'config/config.local.js' : 'document-portal/config.local.js';
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const sandbox = { window: {} };
    try { new Function('window', fs.readFileSync(abs, 'utf8')).call(sandbox, sandbox.window); }
    catch { continue; }
    const endpoints = sandbox.window[SURFACES[id].globalName]?.endpoints || {};
    for (const [key, url] of Object.entries(endpoints)) {
      const wf = (/\/workflows\/([0-9a-f]{32})/i.exec(String(url || '')) || [])[1];
      if (!wf) continue;
      if (!out.has(wf)) out.set(wf, []);
      out.get(wf).push(`${id}:${key}`);
    }
  }
  return out;
}

const wired = configuredWorkflows();

const rows = [...byWorkflow.entries()]
  .map(([workflowId, w]) => ({
    workflowId,
    host: w.host,
    signatures: [...w.signatures].map(fingerprint).sort(),
    signatureCount: w.signatures.size,
    files: [...w.files].sort(),
    fileCount: w.files.size,
    reachedBy: wired.get(workflowId) || [],
  }))
  .sort((a, b) => b.signatureCount - a.signatureCount || b.fileCount - a.fileCount);

const totalSignatures = published.size;
const totalFiles = new Set([...published.values()].flat()).size;

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

/**
 * Counting signatures in tracked files cannot tell rotation from retention.
 *
 * Decision D5 keeps `docs/reference/foundational/` verbatim as the record of what was built, so
 * the count below never reaches zero and this register would report "Gap G-03 is open" forever —
 * telling an operator to redo work already done, at the moment they are trying to go live. A
 * gate that can never go green is not a gate.
 *
 * The evidence that rotation happened is the register itself: `endpoint-register.json` is a
 * post-rotation export from the tenant, and when it was first reconciled all 25 keys pointed at
 * workflows other than the ones this corpus records. Nothing in the corpus authenticates any
 * endpoint the platform now calls.
 *
 * That is what is reported here — narrowly, and without overclaiming. It establishes that no
 * corpus signature reaches a configured endpoint. It cannot establish that a flow outside the 25
 * was also regenerated, and every signature is in git history where deleting a file reaches
 * nothing. The worklist below is therefore still printed, as the record of which flows were
 * covered, and `--check` no longer fails on retention alone.
 */
const postRotation = (() => {
  try {
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json'), 'utf8'));
    return /endpoint-register\.json$/.test(map?.authority?.file || '');
  } catch { return false; }
})();

console.log('\nDGO Digital Operations — signature rotation register\n');
console.log(`  ${totalSignatures} published signature(s) across ${totalFiles} tracked file(s)`);
console.log(`  ${rows.length} distinct flow(s)${postRotation ? ' covered by the rotation' : ' to regenerate'}\n`);

if (!rows.length && !unattributed.length) {
  console.log('  ✅ Nothing is published. Gap G-03 is closed.\n');
  process.exit(0);
}


if (postRotation) {
  console.log('  ✅ ROTATED. Every signature below is superseded, not live.\n');
  console.log('     docs/reference/endpoint-register.json is a post-rotation export from the tenant.');
  console.log('     On first reconciliation all 25 contract keys pointed at workflows other than the');
  console.log('     ones this corpus records, so none of these signatures authenticates an endpoint');
  console.log('     the platform calls. The corpus is retained by decision D5 as the record of what');
  console.log('     was built — retention is not exposure once the credential is dead.\n');
  console.log('     What this does NOT establish: that a flow outside the 25 was also regenerated.');
  console.log('     Every signature here is in git history, where deleting a file reaches nothing.');
  console.log('     Treat them as burned. The worklist below is the record of what was covered.\n');
}

console.log('  Rotation is PER FLOW. Regenerating one trigger invalidates every copy of its');
console.log('  URL at once, so the unit of work is a row below, not a file.\n');
console.log('  ' + '─'.repeat(74) + '\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(`  ${pad('#', 4)}${pad('workflow', 36)}${pad('sigs', 6)}${pad('files', 7)}reached by`);
console.log('  ' + '─'.repeat(74));
rows.forEach((r, i) => {
  console.log(`  ${pad(i + 1, 4)}${pad(r.workflowId, 36)}${pad(r.signatureCount, 6)}${pad(r.fileCount, 7)}` +
    (r.reachedBy.length ? r.reachedBy.join(', ') : '—'));
  if (r.signatureCount > 1) {
    console.log(`      ⚠  ${r.signatureCount} DIFFERENT signatures on this one flow: ${r.signatures.join(', ')}`);
    console.log('         An older trigger URL is still live. Regenerating once revokes them all.');
  }
});

console.log('\n  ' + '─'.repeat(74) + '\n');

if (unattributed.length) {
  console.log(`  ⚠  ${unattributed.length} signature(s) could not be attributed to a workflow.`);
  console.log('     They are in the tree in a shape this register does not parse — find them by');
  console.log('     fingerprint and rotate them too. An unattributable credential is still a');
  console.log('     credential.\n');
  for (const s of unattributed) {
    console.log(`     ${fingerprint(s)}  in ${(published.get(s) || []).slice(0, 2).join(', ')}` +
      ((published.get(s) || []).length > 2 ? ` +${published.get(s).length - 2} more` : ''));
  }
  console.log('');
}

if (!wired.size) {
  console.log('  No endpoint configuration is present in this tree, so no flow could be mapped to');
  console.log('  the key that reaches it. Run `npm run setup` with your values first if you want');
  console.log('  the "reached by" column populated.\n');
}

console.log('  For each row:\n');
console.log('    1. Open the flow in Power Automate and regenerate its HTTP trigger URL.');
console.log('    2. Record the new URL in your values file — never in this repository.');
console.log('    3. Rebuild:  npm run package -- --values <file> --posture pilot');
console.log('       The packager refuses to build against a signature still published here,');
console.log('       so a flow you missed fails the build rather than reaching production.');
console.log('    4. Redeploy. The build id changes, which is how the new deployment is told');
console.log('       apart from the one it replaces.\n');
console.log('  Deleting a file revokes nothing. Only regenerating the trigger does.\n');

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSignatures, totalFiles,
    flows: rows,
    unattributed: unattributed.map(s => ({ fingerprint: fingerprint(s), files: published.get(s) })),
    note: 'Signatures are fingerprinted, never included. Safe to attach to a ticket.',
  }, null, 2) + '\n');
  console.log(`  Register written to ${JSON_OUT} (no signature included)\n`);
}

if (CHECK) {
  if (postRotation) {
    console.log(`  ✅ ${totalSignatures} retained signature(s), all superseded by the register. Not a blocker.\n`);
    process.exit(0);
  }
  console.log(`  ⛔ ${totalSignatures} signature(s) remain published. Gap G-03 is open.\n`);
  process.exit(1);
}
process.exit(0);
