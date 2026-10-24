#!/usr/bin/env node
/**
 * `Web - Send Email` — address the mail from the payload instead of a fixed mailbox.
 *
 *   npm run sendemail            # build the patched definition
 *   npm run sendemail -- --check # fail if the committed definition is stale
 *
 * THE DEFECT.
 *
 * This flow is the carrier behind the internal `EMAIL` endpoint. Three things call it:
 * outward official correspondence (`core/correspondence-email-service.js`), the reports desk and
 * the statistics desk. All three send a recipient. All three sends in the flow hard-code
 * `emailMessage/To` to `dgsRegistry@nitda.gov.ng` and never read it.
 *
 * So an officer composes a correspondence to an external party, the flow mails it to the registry
 * mailbox, and `markSent` records the row as sent — the Sent Register then displays the intended
 * recipient beside a message that never went to them. A visible failure would be better: the
 * officer would follow up. This is RN-021 and RN-024.
 *
 * THE FIX, AND WHY IT IS THIS SMALL.
 *
 * One Compose normalises the recipient out of the payload, one normalises Cc, and the three sends
 * read them. Nothing else changes — not the trigger, not the response shape, not the control flow.
 * The trigger is left exactly as it is because regenerating it would mint a new URL and break
 * every configured client.
 *
 * THREE PAYLOAD SHAPES, ONE EXPRESSION, AND ALL OF THEM NESTED UNDER `payload`.
 *
 * Correspondence sends `payload.email = {to, cc, …}`; statistics sends `payload.to`, an ARRAY;
 * reports sends no recipient at all and relies on the envelope's `userEmail`. See the correction
 * note on the expressions below — this file's first version read them one level too shallow.
 * `join(array(x), ';')` handles the array and the string without asking which it got.
 *
 * FAIL-CLOSED BY CONSTRUCTION. If no recipient is present the expression yields an empty string
 * and SendEmailV2 fails the action. That is the intended behaviour: a failed send is recoverable
 * and visible, a send to the wrong mailbox reported as success is neither. It needs no extra
 * condition, which is why none was added.
 *
 * THIS IS THE SECOND OF TWO ROUTES, AND THE NARROWER ONE.
 *
 * docs/deployment/internal/flows/designer-paste/DGO_SEND_EMAIL.designer-paste.json rebuilds the
 * body: the same payload-first addressing, plus a directory gate, a 400 on an unaddressed
 * request, an outbox receipt per send and a duplicate-request guard. Pasting preserves the
 * trigger just as patching does. Prefer it. See EXECUTION_GUIDE §6.7.
 *
 * This file stays because it changes three parameters and nothing else, which is the right
 * trade when the deployed body must be kept as it is — its subject and its response are literals
 * this patch does not touch, and it needs no maker session to paste.
 *
 * Delivery: `scripts/update-flow-definition.ps1 -FlowId e5e2c6a2-52ea-2ba8-b0b3-60f25d43387f
 * -DefinitionPath docs/deployment/sharepoint/remediation/patched/Web_Send_Email.definition.json`
 * — WhatIf first, then `-Apply`.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
/* Repo rule: never slice a path root off with string replacement — it breaks on Windows and on
   any checkout whose path differs. */
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const DEPLOYED = join(ROOT, 'docs/reference/flow-contracts/deployed');
const OUT_DIR = join(ROOT, 'docs/deployment/sharepoint/remediation/patched');
const OUT = join(OUT_DIR, 'Web_Send_Email.definition.json');

const src = readdirSync(DEPLOYED).find((f) => f.startsWith('Web - Send Email__'));
if (!src) { console.error('❌ Web - Send Email export not found'); process.exit(1); }
const exported = JSON.parse(readFileSync(join(DEPLOYED, src), 'utf8'));
const definition = JSON.parse(JSON.stringify(exported.definition));

/* CORRECTED 2026-09-02 — THE FIELD IS ONE LEVEL DEEPER THAN THIS ORIGINALLY READ.
 *
 * The first version of these expressions read `triggerBody()?['email']?['to']` and
 * `triggerBody()?['to']`. Neither exists on any of the three callers. core/data-client.js
 * posts `{action, payload:{…}, userEmail, requestId, timestamp}` — the caller's own fields are
 * NESTED under `payload` on every request that does not pass `flatPayload:true`, and none of
 * the three does. So correspondence's recipient is at `payload.email.to`, statistics' at
 * `payload.to`, and reports sends none at all: it tells the officer "Sent to: <their address>"
 * and relies on the envelope's `userEmail`. The original expression would have resolved empty
 * on all three, turning a wrong-recipient defect into a failing send — better, but not the fix.
 *
 * Every level is kept in the chain rather than only the correct one, because a future caller
 * passing flatPayload:true would post the field at the top level and this must still find it. */
const chain = (...keys) => keys.flatMap((k) => [
  `triggerBody()?['payload']?['email']?['${k}']`,
  `triggerBody()?['payload']?['${k}']`,
  `triggerBody()?['${k}']`,
]).join(',');
/* array()/join() serves the array and the string without a type test: array() returns an array
   unchanged and wraps a string, so the join yields a string either way. */
const RECIPIENT =
  `@trim(join(array(coalesce(${chain('to', 'recipientEmail')},triggerBody()?['userEmail'],'')),';'))`;
const CC = `@trim(join(array(coalesce(${chain('cc')},'')),';'))`;

const meta = (n) => ({ operationMetadataId: `b1000000-0000-4000-8000-${String(n).padStart(12, '0')}` });

/* The two Composes are inserted at the top level, before anything that sends. They depend on
   nothing, so they carry no runAfter and run on entry alongside the other entry actions. */
definition.actions = {
  Compose_Mail_Recipient: { type: 'Compose', inputs: RECIPIENT, metadata: meta(1) },
  Compose_Mail_Cc: { type: 'Compose', inputs: CC, metadata: meta(2) },
  ...definition.actions,
};

let patched = 0;
(function walk(node) {
  if (!node || typeof node !== 'object') return;
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object'
        && String(v.inputs?.host?.operationId || '').includes('SendEmail')) {
      const p = v.inputs.parameters;
      p['emailMessage/To'] = "@outputs('Compose_Mail_Recipient')";
      /* Cc is only meaningful when the payload carried one; an empty Cc is accepted by the
         connector and sends to nobody extra, so no condition is needed around it. */
      p['emailMessage/Cc'] = "@outputs('Compose_Mail_Cc')";
      patched++;
    }
    walk(v);
  }
})(definition.actions);

const out = { definition };
const serialised = JSON.stringify(out, null, 2);

if (CHECK) {
  const same = existsSync(OUT) && readFileSync(OUT, 'utf8') === serialised;
  console.log(same
    ? `✅ Web_Send_Email.definition.json matches the generator (${patched} sends addressed from the payload)`
    : '❌ Web_Send_Email.definition.json is stale — run: npm run sendemail');
  process.exit(same ? 0 : 1);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, serialised);
console.log(`Web - Send Email — ${patched} send(s) now addressed from the payload`);
console.log(`  wrote ${rel(OUT)}`);
console.log('  apply: scripts/update-flow-definition.ps1 -FlowId e5e2c6a2-52ea-2ba8-b0b3-60f25d43387f \\');
console.log(`           -DefinitionPath .\\${rel(OUT).replace(/\//g, '\\')} -Apply`);
