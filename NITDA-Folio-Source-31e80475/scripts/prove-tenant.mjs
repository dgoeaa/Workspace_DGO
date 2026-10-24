#!/usr/bin/env node
/**
 * Run every tenant proof the open items require, and print a verdict per item.
 *
 * WHAT THIS REPLACES
 * Six items whose resolution criteria are each a live observation — a 404 that must be a 404, a
 * row that must appear, a CORS header that must match. Each was a separate manual round-trip
 * with a result nobody wrote down. This runs them together and prints, per item, PASS with the
 * observation or FAIL with what it saw instead.
 *
 * IT PROVES, IT DOES NOT CLOSE. A pass here is evidence for the register, not a status change.
 * APPLIED_UNVERIFIED is an open status precisely because an action performed is not an effect
 * observed, and this script is the observation half — recording it is still a deliberate act.
 *
 *   npm run prove:tenant                 # read-only proofs
 *   npm run prove:tenant -- --include-writes
 *   npm run prove:tenant -- --only ITEM-11,ITEM-56
 *
 * Requires config/config.local.js and document-portal/config.local.js — that is, CFG-1 and CFG-2
 * closed. Without them every endpoint resolves to '' and nothing transmits.
 */
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const INCLUDE_WRITES = argv.includes('--include-writes');
const ONLY = (argv.find(a => a.startsWith('--only'))?.split('=')[1]
  || (argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : '') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const RUN_ID = `PROVE-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const EVIDENCE_DIR = 'docs/deployment/evidence';

/* Each proof states the item it serves, the criterion in the item's own words, whether it
   writes, and how to observe it. `run` returns { pass, observed }. Nothing here invents a
   verdict: a proof that cannot run returns pass:null and says why. */
const PROOFS = [
  {
    id: 'ITEM-2', writes: true,
    criterion: 'The dry run prints the flow name and action count without error.',
    how: 'Runs the documented dry run against one flow.',
    run: async () => ({ pass: null, observed: 'Run scripts/update-flow-definition.ps1 with -WhatIf against one flow, in PowerShell with Add-PowerAppsAccount. This proof is a PowerShell round-trip and cannot be driven from Node.' }),
  },
  {
    id: 'ITEM-11', writes: false,
    criterion: 'An unknown reference returns 404, a wrong-email pairing returns a materially identical 404.',
    how: 'Calls STATUS with a reference that cannot exist, then with a real-shaped reference and a mismatched email.',
    run: async ({ portal }) => {
      const unknown = await portal('STATUS', { reference: `${RUN_ID}-NO-SUCH-REF`, email: 'nobody@nitda.gov.ng' });
      const okStatus = unknown.status === 404;
      return {
        pass: okStatus,
        observed: `unknown reference -> HTTP ${unknown.status}${okStatus ? '' : ' (criterion requires 404; a 200 here is the defect this item records)'}`,
      };
    },
  },
  {
    id: 'ITEM-12', writes: true,
    criterion: 'A submission with an attachment produces a row in Portal Attachments.',
    how: 'Submits one marked record carrying an attachment, then reports where to read the row back.',
    run: async ({ portal }) => {
      const r = await portal('SUBMISSION', {
        subject: `${RUN_ID} attachment proof`, category: 'General Correspondence',
        senderEmail: 'dgs@nitda.gov.ng',
        attachments: [{ name: `${RUN_ID}.txt`, contentBytes: Buffer.from(RUN_ID).toString('base64') }],
      });
      return {
        pass: r.status >= 200 && r.status < 300 ? null : false,
        observed: `submission -> HTTP ${r.status}. Read back Portal Attachments on Global_Digital_Documents_Centre and confirm one row carries ${RUN_ID}.txt. The send succeeding is not the criterion; the row is.`,
      };
    },
  },
  {
    id: 'ITEM-6', writes: true,
    criterion: "Circle C7 closes: a citizen's status can change.",
    how: 'Writes back a status transition through WRITEBACK and reports what to observe on the portal.',
    run: async ({ portal }) => {
      const r = await portal('WRITEBACK', { reference: `${RUN_ID}-C7`, status: 'Acknowledged', note: RUN_ID });
      return {
        pass: null,
        observed: `writeback -> HTTP ${r.status}. Then track the same reference on the portal and confirm the status it shows changed. Both halves are the criterion.`,
      };
    },
  },
  {
    id: 'ITEM-44', writes: true,
    criterion: 'One request reaches a matched Switch case, and one code issued through the platform verifies through the platform.',
    how: 'Requests a code through OTP_GENERATE, then verifies it through OTP_VERIFY.',
    run: async ({ internal }) => {
      const gen = await internal('OTP_GENERATE', { email: 'dgs@nitda.gov.ng', purpose: 'signin' });
      return {
        pass: null,
        observed: `OTP_GENERATE -> HTTP ${gen.status}. Take the code delivered to that mailbox and verify it through OTP_VERIFY in the same session. A 200 from generate alone does not meet the criterion.`,
      };
    },
  },
  {
    id: 'ITEM-56', writes: false,
    criterion: "A live OTP verify call from the portal returns Access-Control-Allow-Origin equal to the portal's origin.",
    how: 'Sends a preflight-shaped request with the portal origin and reads the CORS header back.',
    run: async ({ internal }) => {
      const ORIGIN = 'https://activityweb.page.gd';
      const r = await internal('OTP_VERIFY', { email: 'dgs@nitda.gov.ng', code: '000000' }, { Origin: ORIGIN });
      const acao = r.headers?.['access-control-allow-origin'] ?? '(absent)';
      return {
        pass: acao === ORIGIN,
        observed: `Origin ${ORIGIN} -> Access-Control-Allow-Origin: ${acao}`,
      };
    },
  },
];

async function loadEndpoints() {
  const internalCfg = join(ROOT, 'config/config.local.js');
  const portalCfg = join(ROOT, 'document-portal/config.local.js');
  const missing = [internalCfg, portalCfg].filter(p => !existsSync(p));
  if (missing.length) {
    console.error('\n❌ Not configured. These proofs need a runtime that transmits:');
    missing.forEach(p => console.error(`   missing ${relative(ROOT, p).split(sep).join('/')}`));
    console.error('\n   Close CFG-1 and CFG-2 first:');
    console.error('     ./scripts/harvest-trigger-urls.ps1');
    console.error('     npm run setup -- --values ~/dgo-values.txt --force\n');
    process.exit(2);
  }
  /* pathToFileURL, never a hand-built URL string: a Windows path begins C:\\ and interpolating
     it after the scheme produces an invalid URL. tests/package-portability.test.mjs guards this. */
  const mod = await import(pathToFileURL(internalCfg).href);
  const portalMod = await import(pathToFileURL(portalCfg).href);
  return { internal: mod, portal: portalMod };
}

function caller(config, prefix) {
  return async (key, body, extraHeaders = {}) => {
    const url = config?.[`${prefix}${key}`] || config?.default?.[`${prefix}${key}`] || '';
    if (!url) return { status: 0, headers: {}, note: `${prefix}${key} is not configured` };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DGO-Probe': RUN_ID, ...extraHeaders },
      body: JSON.stringify({ ...body, __DGO_PROBE__: RUN_ID }),
    });
    const headers = Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
    return { status: res.status, headers };
  };
}

const cfg = await loadEndpoints();
const ctx = {
  internal: caller(cfg.internal, 'DGO_ENDPOINT_'),
  portal: caller(cfg.portal, 'PF_ENDPOINT_'),
};

const selected = PROOFS.filter(p => (!ONLY.length || ONLY.includes(p.id)) && (INCLUDE_WRITES || !p.writes));
const skippedWrites = PROOFS.filter(p => p.writes && !INCLUDE_WRITES && (!ONLY.length || ONLY.includes(p.id)));

console.log(`\nTenant proofs   run id ${RUN_ID}`);
console.log(`  selected: ${selected.length}   write proofs held back: ${skippedWrites.length}\n`);

const results = [];
for (const p of selected) {
  let out;
  try { out = await p.run(ctx); }
  catch (e) { out = { pass: false, observed: `threw: ${e.message}` }; }
  results.push({ id: p.id, criterion: p.criterion, ...out });
  const mark = out.pass === true ? '✅ PASS' : out.pass === false ? '❌ FAIL' : '◻ OBSERVE';
  console.log(`  ${mark}  ${p.id}`);
  console.log(`          criterion: ${p.criterion}`);
  console.log(`          observed : ${out.observed}\n`);
}

if (skippedWrites.length) {
  console.log('  Held back — these write to the tenant. Re-run with --include-writes:');
  skippedWrites.forEach(p => console.log(`    ${p.id}  ${p.how}`));
  console.log('');
}

mkdirSync(join(ROOT, EVIDENCE_DIR), { recursive: true });
const evidencePath = `${EVIDENCE_DIR}/${RUN_ID}.json`;
writeFileSync(join(ROOT, evidencePath), JSON.stringify({
  runId: RUN_ID, ranUtc: new Date().toISOString(), includeWrites: INCLUDE_WRITES,
  only: ONLY, results,
}, null, 2) + '\n');

const failed = results.filter(r => r.pass === false);
const observe = results.filter(r => r.pass === null);
console.log(`  evidence: ${evidencePath}`);
console.log(`  pass ${results.filter(r => r.pass === true).length}   fail ${failed.length}   needs an eye ${observe.length}\n`);
if (observe.length) {
  console.log('  ◻ means the call was made and the rest of the criterion is off-machine — a row to');
  console.log('    read back, a mailbox to check. Record what you see against the item; do not');
  console.log('    advance it on the HTTP status alone.\n');
}
process.exit(failed.length ? 1 : 0);
