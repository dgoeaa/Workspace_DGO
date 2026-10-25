#!/usr/bin/env node
// Register every flow in a live estate report with flow 02 - GOV - Register HTTP Flow Truth.
//
//   FLOW02_URL='<flow 02 trigger URL>' node scripts/register-live-flows.mjs <live-report.json>          dry run
//   FLOW02_URL='<flow 02 trigger URL>' node scripts/register-live-flows.mjs <live-report.json> --apply  register
//
// The report is the JSON the "Folio Flow Estate — Live Report" flow emails. Flow 02 computes the
// RegistryKey and upserts, so running this twice updates rather than duplicates. The trigger URL
// carries a sig= credential: it is read from the environment and never printed.

import fs from 'node:fs';

const [file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
const url = process.env.FLOW02_URL || '';
if (!file) { console.error('Usage: FLOW02_URL=... node scripts/register-live-flows.mjs <live-report.json> [--apply]'); process.exit(2); }
if (apply && !/^https:\/\/.+\/workflows\/[0-9a-f]{32}\/triggers\/manual\/paths\/invoke\?/.test(url)) {
  console.error('FLOW02_URL is not set to a flow trigger URL.'); process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const env = report.report?.environment;
const flows = (report.flowsLive || []).filter(f => f.FlowGuid);
if (!env || !flows.length) { console.error('The file has no report.environment or no flowsLive rows.'); process.exit(2); }

let ok = 0, failed = 0;
for (const f of flows) {
  const body = { flowId: f.FlowGuid, flowName: f.Name.trim(), environmentId: env };
  if (/^[0-9a-f]{32}$/i.test(f.WorkflowId || '')) body.workflowId = f.WorkflowId.toLowerCase();
  if (!apply) { console.log(`  would register  ${body.flowName}  ${body.flowId}`); ok++; continue; }
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await res.text();
    // The live flow 02 has no Response action, so Power Automate answers 202 Accepted and runs it
    // asynchronously: the outcome is in the flow's run history and the registry, not in this reply.
    const good = res.status === 202 || (res.status === 200 && /"outcome"\s*:\s*"succeeded"/i.test(text));
    console.log(`  ${good ? (res.status === 202 ? 'accepted' : 'registered') : `FAILED ${res.status}`}  ${body.flowName}${good ? '' : `  ${text.slice(0, 200)}`}`);
    good ? ok++ : failed++;
  } catch (e) {
    console.log(`  FAILED  ${body.flowName}  ${e.message}`); failed++;
  }
}
console.log(`\n  ${apply ? 'Sent' : 'Dry run'}: ${ok} of ${flows.length}${failed ? `, ${failed} failed` : ''}.${apply ? ' Check flow 02\'s run history and DGO_HTTPFlowRegistry for the result.' : ' Add --apply to register.'}\n`);
process.exit(failed ? 1 : 0);
