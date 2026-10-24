#!/usr/bin/env node
/**
 * Write a values file for `npm run package -- --values <file>`.
 *
 * One line per endpoint, every key both platforms read, each annotated with the flow it must
 * point at and that flow's workflow id — so a URL can be checked against its heading before it
 * is pasted, rather than after the platform has been calling the wrong flow for a week.
 *
 *   node scripts/make-values-template.mjs ~/dgo-values.txt
 *
 * Write it OUTSIDE the repository. A filled values file holds bearer credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json'), 'utf8'));
const OUT = process.argv[2];
if (!OUT) { console.error('usage: node scripts/make-values-template.mjs <path-outside-the-repo>'); process.exit(2); }

const abs = path.resolve(OUT.replace(/^~(?=$|\/)/, os.homedir()));
if (abs.startsWith(ROOT + path.sep)) {
  console.error(`\n  ✖  ${abs}\n     is inside the repository. A filled values file holds bearer`);
  console.error(`     credentials — write it somewhere else, e.g. ~/dgo-values.txt\n`);
  process.exit(2);
}

const section = (title, prefix, entries, notes) => {
  let s = `\n# ${'═'.repeat(74)}\n# ${title}\n# ${'═'.repeat(74)}\n`;
  if (notes) s += notes.map((n) => `# ${n}`).join('\n') + '\n';
  const byFlow = new Map();
  for (const [k, e] of Object.entries(entries)) {
    const id = e.workflowId || `unknown:${k}`;
    if (!byFlow.has(id)) byFlow.set(id, []);
    byFlow.get(id).push([k, e]);
  }
  for (const [id, ks] of byFlow) {
    const e = ks[0][1];
    s += `\n# ${e.flow || ks[0][0]}\n`;
    s += `#   workflow ${e.workflowId || 'id not on record — this key cannot be verified'}\n`;
    if (e.note) s += `#   ${e.note}\n`;
    if (ks.length > 1) s += `#   ${ks.length} keys, ONE url — paste the same signature under each\n`;
    /* The URL is emitted in full with only `sig=` left empty, when the register knows it.
       This is the whole point of reconciling against the tenant's register: the operator is
       no longer copying a 300-character URL, they are pasting the 43 characters that are the
       secret. A URL truncated on copy — the characteristic failure of the old flow, and one
       that surfaces much later as a 401 — is not possible when there is nothing left to
       truncate. Where the register has no URL the line falls back to a bare `KEY=`, so a key
       it does not cover still works the way it always did. */
    for (const [k] of ks) {
      const e = entries[k];
      s += e.urlTemplate ? `${prefix}${k}=${e.urlTemplate}\n` : `${prefix}${k}=\n`;
    }
  }
  return s;
};

/* THE FIRST LINE AN OPERATOR READS MUST BE THE COMMAND THEY WERE SENT HERE TO RUN.
   This printed `npm run package` while CLEAR-THE-LAST-BLOCKER.md §6 — the document that sends
   people here — says `npm run setup`. Two different commands, and the one on their screen
   disagreed with the runbook open beside it. They do different jobs: setup wires this working
   tree, package builds a distributable. Wiring is what the runbook is for, so it leads. */
const header = `# DGO endpoint values — fill in the signatures, then:
#
#     npm run check:values -- ${OUT}
#     npm run setup -- --values ${OUT} --force
#     npm run commission
#
# That wires this working tree, which is what docs/deployment/CLEAR-THE-LAST-BLOCKER.md does.
# To build a distributable instead, once the values are right:
#
#     npm run package -- --values ${OUT}
#     node scripts/check-config-local.mjs dist/dgo-internal-platform/config/config.local.js
#     node scripts/check-config-local.mjs --portal dist/dgo-document-portal/config.local.js
#
# ONLY what is in this file is used. The documented-estate fallback was retired along with
# --recover: that corpus describes the pre-rotation estate, so a key it filled in would answer
# 401. Leave a key blank deliberately and its feature reports itself unconfigured, which is the
# honest outcome.
#
# Format: KEY=<full trigger URL>   · one line each · # comments · no quotes needed
#
# EVERY URL BELOW IS ALREADY FILLED IN, from docs/reference/endpoint-register.json, complete
# except for the one thing a register may never carry: the signature. Each line ends
#
#     ...&sig=
#
# and your job is to put the signature after that "=" and nothing else. Open the flow named
# above the line, expand its "When an HTTP request is received" trigger, and copy the part of
# the HTTP POST URL that follows "sig=" — 43 characters, the last parameter, to the end.
#
# Do not replace the whole line. The host, the routing segment and the workflow id are already
# correct and were reconciled against the tenant; retyping them can only introduce an error.
# If you would rather paste whole URLs, that still works — overwrite the line entirely.
#
# ⚠  THIS FILE WILL HOLD BEARER CREDENTIALS. Keep it out of the repository, out of shared
#    storage, and delete it once the packages are built and verified.
`;

const body = header
  + section('INTERNAL OPERATOR PLATFORM', 'DGO_ENDPOINT_', MAP.internal, [
      'Every key below is read by the platform. A blank one is an endpoint it cannot call.',
    ])
  + section('PUBLIC DOCUMENT PORTAL', 'PF_ENDPOINT_', MAP.portal, [
      'PUBLIC SITE: every URL here is delivered to every visitor. Configure only flows built',
      'to be invoked by an anonymous stranger.',
      'Leave SUBMISSION blank and the whole portal stays in demo mode — nothing is transmitted.',
    ]);

fs.writeFileSync(abs, body);
const lines = body.match(/^(?:DGO|PF)_ENDPOINT_[A-Z_]+=.*$/gm) || [];
const prefilled = lines.filter((l) => l.includes('sig=')).length;
console.log(`\n✅ wrote ${abs}`);
console.log(`   ${lines.length} keys — ${Object.keys(MAP.internal).length} internal, ${Object.keys(MAP.portal).length} portal`);
console.log(`   ${prefilled} arrive with the URL already complete; add the signature after each 'sig='.`);
if (prefilled < lines.length) {
  console.log(`   ${lines.length - prefilled} have no URL on record — paste those whole.`);
}
console.log(`\n   then: npm run check:values -- ${OUT}`);
console.log(`         npm run setup -- --values ${OUT} --force\n`);
