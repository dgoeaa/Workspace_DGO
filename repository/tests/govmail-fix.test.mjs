/* GOV-01 to GOV-08's e-mail bodies (scripts/lib/govmail-fix.mjs, finding F3, ITEM-92), checked against the deployed
   definitions and run in the strict simulator. GOV-04 is checked as the tenant holds it: with its own fix applied. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixGovMail, storedDiff, FLOWS, REGISTRY_LINK, EXCEPTION_LINK } from '../scripts/lib/govmail-fix.mjs';
import { fixGov04, actionsByName } from '../scripts/lib/gov04-fix.mjs';
import { Simulator } from '../scripts/lib/wdl-sim.mjs';

const DIR = 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/';
const deployed = Object.fromEntries(fs.readdirSync(DIR).filter((f) => /^0\d - GOV - .*__full_definition\.json$/.test(f)).map((f) => {
  const id = f.match(/__([0-9a-f-]{36})__/)[1];
  const d = JSON.parse(fs.readFileSync(DIR + f, 'utf8'));
  let def = d.definition || d.properties.definition;
  if (FLOWS[id].startsWith('04 ')) def = fixGov04(def).definition;
  return [id, def];
}));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}\n       ${e.message}`); } };
const ID = Object.fromEntries(Object.entries(FLOWS).map(([id, n]) => [n.slice(0, 2), id]));
const fixed = Object.fromEntries(Object.entries(deployed).map(([id, def]) => [id, fixGovMail(def, id)]));
const sendsOf = (def) => Object.entries(actionsByName(def.actions)).filter(([, a]) => a?.type === 'OpenApiConnection' && /SendEmail/.test(a.inputs?.host?.operationId || ''));

console.log('\nGOV e-mail bodies (F3)\n');
t('all eight deployed GOV flows are recognised, and each changes', () => {
  assert.equal(Object.keys(deployed).length, 8);
  for (const [id, r] of Object.entries(fixed)) { assert.deepEqual(r.problems, [], FLOWS[id]); assert.ok(r.changes.length, FLOWS[id]); }
});
t('run again, every flow is already up to date (nothing written twice)', () => {
  for (const [id, r] of Object.entries(fixed)) { const again = fixGovMail(r.definition, id); assert.ok(again.already && !again.problems.length && !again.changes.length, FLOWS[id]); }
});
/* A flow converted with older designs (the tenant after release 43): every design Compose is refreshed, nothing else. */
const designSteps = (def) => Object.entries(actionsByName(def.actions)).filter(([n, a]) => a?.type === 'Compose' && typeof a.inputs === 'string' && a.inputs.includes('folio-template') && /_HTML_/.test(n));
t('a converted flow with older designs is refreshed: each design Compose takes the current design, and only those', () => {
  for (const [id, r] of Object.entries(fixed)) {
    const stale = structuredClone(r.definition);
    const steps = designSteps(stale);
    assert.ok(steps.length, `${FLOWS[id]}: no design steps found`);
    for (const [, a] of steps) a.inputs = a.inputs.replace('font-size:24px', 'font-size:27px') + '<!-- 2026-10-20 -->';
    const again = fixGovMail(stale, id);
    assert.deepEqual(again.problems, [], FLOWS[id]);
    assert.ok(!again.already, `${FLOWS[id]}: stale designs read as up to date`);
    assert.equal(again.changes.length, steps.length, `${FLOWS[id]}: ${again.changes.join('; ')}`);
    assert.ok(again.changes.every((c) => /design refreshed \(GV-/.test(c)), FLOWS[id]);
    assert.deepEqual(again.definition, r.definition, `${FLOWS[id]}: the refreshed flow is not the freshly converted one`);
  }
});
t('a converted flow whose design set no longer matches is refused, not rebuilt', () => {
  const r = fixed[ID['02']];
  const odd = structuredClone(r.definition);
  const [name, holderStep] = designSteps(odd)[0];
  const holder = Object.values(actionsByName(odd.actions)).length && (function find(actions) {
    if (actions[name]) return actions;
    for (const a of Object.values(actions)) for (const k of [a?.actions, a?.else?.actions, ...Object.values(a?.cases || {}).map((c) => c.actions), a?.default?.actions]) { const f = k && find(k); if (f) return f; }
    return null;
  })(odd.actions);
  holder[`${name}_Extra`] = { ...holderStep };
  delete holder[name];
  holder[name.replace(/_[^_]+$/, '_Gone')] = { ...holderStep };
  const again = fixGovMail(odd, ID['02']);
  assert.ok(again.problems.some((p) => /design set changed/.test(p)), again.problems.join('; '));
});
t('only the HTML each send reads changes: recipients, subjects, attachments and importance stay', () => {
  for (const [id, r] of Object.entries(fixed)) {
    const before = Object.fromEntries(sendsOf(deployed[id])), after = Object.fromEntries(sendsOf(r.definition));
    for (const [n, a] of Object.entries(before)) {
      const { 'emailMessage/Body': b1, ...p1 } = a.inputs.parameters, { 'emailMessage/Body': b2, ...p2 } = after[n].inputs.parameters;
      assert.deepEqual(p2, p1, `${FLOWS[id]} ${n}`);
      if (n !== 'Send_Exception_Email') assert.equal(b2, b1, `${FLOWS[id]} ${n} body reference`);
    }
  }
});
t('GOV-04 refuses to change a flow whose alerts lack the Admin Suite link (its own fix comes first)', () => {
  const raw = JSON.parse(fs.readFileSync(DIR + fs.readdirSync(DIR).find((f) => f.startsWith('04 - GOV')), 'utf8')).definition;
  assert.ok(fixGovMail(raw, ID['04']).problems.some((p) => /gov04:update first/.test(p)));
});

/* Run one HTML step with the outputs it reads supplied. */
const run = (def, name, prior = {}, item = null) => {
  const all = actionsByName(def.actions);
  const holder = Object.values({ x: def.actions, ...Object.fromEntries(Object.entries(all).map(([k, a]) => [k, a.actions])) }).find((c) => c && c[name]);
  const parts = Object.fromEntries(Object.entries(holder).filter(([n]) => n === name || n.startsWith(`${name}_`)));
  const first = Object.keys(parts).find((n) => n !== name && !Object.keys(parts[n].runAfter || {}).some((k) => k in parts));
  const acts = structuredClone(parts); acts[first].runAfter = {};
  const inner = { type: 'Scope', actions: acts };
  const scope = { nodeId: 'S', serializedValue: item ? { type: 'Scope', actions: { L: { type: 'Foreach', foreach: `@createArray(json('${JSON.stringify(item)}'))`, actions: acts } } } : inner };
  const sim = new Simulator({ prior: Object.fromEntries(Object.entries(prior).map(([k, v]) => [k, { status: 'Succeeded', outputs: v }])), clock: () => '2026-10-21T09:00:00Z', workflow: { name: 'w', run: { name: 'RUN' }, tags: {} } });
  sim.declare(scope).run(scope);
  const res = (c) => c?.results?.get?.(name)?.outputs;
  const find = (c) => { if (!c) return undefined; const v = res(c); if (v !== undefined) return v; for (const r of c.results?.values?.() || []) { const x = find(r); if (x !== undefined) return x; } return undefined; };
  return { html: String(find(sim.root) ?? sim.global.get(name)?.outputs ?? ''), errors: sim.templateErrors };
};
const designOf = (html) => (html.match(/name="folio-template" content="([^"]+)"/) || [])[1];

t('a run report is the GV design for its outcome, with the flow, the run and every detail row', () => {
  const def = fixed[ID['02']].definition;
  const J = (status) => ({ Compose_Final_Report_JSON: { flow: '02 - GOV - Register HTTP Flow Truth', status, runId: 'RUN-7', runUrl: 'https://make.powerautomate.com/x', generatedAtUtc: '2026-10-21T09:00:00Z',
    details: { registrationKey: 'env|flow', environmentId: 'env', flowId: 'flow', flowName: 'A flow', definitionVersion: '1.0.0', definitionFingerprint: 'abc' } } });
  for (const [status, want] of [['Succeeded', 'GV-Run-Report'], ['Failed', 'GV-Run-Report--failed'], ['TimedOut', 'GV-Run-Report--timed-out']]) {
    const r = run(def, 'Compose_Final_Report_HTML', J(status));
    assert.deepEqual(r.errors, [], status);
    assert.equal(designOf(r.html), want, status);
    for (const s of ['02 - GOV - Register HTTP Flow Truth', 'RUN-7', 'https://make.powerautomate.com/x', 'definitionFingerprint', '>abc<']) assert.ok(r.html.includes(s), `${status}: ${s}`);
    assert.ok(!/\{\{\w+(\.\w+)?\}\}/.test(r.html), `${status}: a placeholder is left`);
  }
});
t('GOV-01: Succeeded is the provisioning report; any other outcome says that outcome', () => {
  const def = fixed[ID['01']].definition;
  const J = (status) => ({ Compose_Final_Report_JSON: { flow: { displayName: '01 - GOV - Provision HTTP Flow Registry', runId: 'R1', runUrl: 'https://x' }, timing: { completedUtc: '2026-10-21T09:00:00Z' },
    validation: { validatedLists: 7, validatedListSettings: 7, validatedUniqueKeys: 7, validatedSeeds: 12, validatedViews: 7, errorCount: 0 }, errors: [], status } });
  const ok = run(def, 'Compose_Final_Report_HTML', J('Succeeded'));
  assert.equal(designOf(ok.html), 'GV-Run-Report--gov01-provisioning'); assert.deepEqual(ok.errors, []); assert.ok(ok.html.includes('>None<'));
  const other = run(def, 'Compose_Final_Report_HTML', J('CompletedWithErrors'));
  assert.equal(designOf(other.html), 'GV-Run-Report--failed'); assert.ok(other.html.includes('CompletedWithErrors') && !/Run record · Failed/.test(other.html));
});
t('an execution report lists every action\'s status; a TimedOut run says TimedOut, not Failed', () => {
  const def = fixed[ID['05']].definition;
  const E = (overall) => ({ Compose_Execution_Report_JSON: { reportMetadata: { generatedAtUtc: '2026-10-21T09:00:00Z' }, flow: { displayName: '05 - GOV - Retire HTTP Flow', environmentId: 'env' },
    run: { runId: 'R5', elapsedMilliseconds: 1234, runUrl: 'https://x' }, outcome: { overallStatus: overall, actionStatuses: { Key: 'Succeeded', Find: 'Succeeded', If_Found: overall } } } });
  const ok = run(def, 'Compose_Execution_Report_HTML', E('Succeeded'));
  assert.equal(designOf(ok.html), 'GV-Execution-Report'); assert.deepEqual(ok.errors, []);
  for (const s of ['>Key<', '>Find<', '>If_Found<', '1234']) assert.ok(ok.html.includes(s), s);
  const late = run(def, 'Compose_Execution_Report_HTML', E('TimedOut'));
  assert.equal(designOf(late.html), 'GV-Execution-Report--failed'); assert.ok(late.html.includes('TimedOut') && !/&nbsp; Failed</.test(late.html));
});
t('GOV-04: the reminders escalate after three days, and every alert opens the record in the Folio Admin Suite', () => {
  const def = fixed[ID['04']].definition;
  const all = actionsByName(def.actions);
  for (const n of ['Compose_Stale_Owner_Notification_HTML', 'Compose_Stale_Reminder_HTML', 'Compose_Failure_Owner_Notification_HTML', 'Compose_Failure_Reminder_HTML', 'Compose_Recovery_Notification_HTML']) {
    const parts = Object.keys(all).filter((k) => k.startsWith(`${n}_`));
    assert.ok(parts.length && parts.every((p) => all[p].inputs.includes(REGISTRY_LINK) && /folio-template/.test(all[p].inputs)), n);
  }
  assert.match(all.Compose_Stale_Reminder_HTML.inputs, /^@if\(greaterOrEquals\(div\(sub\(ticks\(utcNow\(\)\),ticks\(first\(body\('Find_Exception'\)\?\['value'\]\)\?\['DetectedUtc'\]\)\),864000000000\),3\),outputs\('Compose_Stale_Reminder_HTML_Stale_Escalation_escalated'\),outputs\('Compose_Stale_Reminder_HTML_Stale_Escalation'\)\)$/);
});
t('GOV-06: a high or critical exception is GV-Registry-Exception, others the medium-low design; values are escaped; it links the exception', () => {
  const all = actionsByName(fixed[ID['06']].definition.actions);
  assert.equal(all.Send_Exception_Email.inputs.parameters['emailMessage/Body'], "@outputs('Compose_Exception_Email_HTML')");
  assert.match(all.Compose_Exception_Email_HTML.inputs, /^@if\(or\(equals\(toLower\(trim\(string\(coalesce\(item\(\)\?\['Severity'\],''\)\)\)\),'critical'\),equals\([^]*'high'\)\),outputs\('Compose_Exception_Email_HTML_Registry_Exception'\),outputs\('Compose_Exception_Email_HTML_Registry_Exception_medium_low'\)\)$/);
  const d = all.Compose_Exception_Email_HTML_Registry_Exception.inputs;
  assert.ok(d.includes(EXCEPTION_LINK) && d.includes("replace(replace(replace(replace(replace(string(coalesce(item()?['Details'],''))"));
});

t('GOV-04 simulated: a stale reminder at four days is the escalated design, with the record link and the owner', () => {
  const def = fixed[ID['04']].definition;
  const item = { Id: 42, FlowName: 'IP_SEND_EMAIL', FlowId: 'df59a69f', RegistryKey: 'DGO:df59a69f', TechnicalOwnerEmail: 'owner@nitda.gov.ng' };
  const r = run(def, 'Compose_Stale_Reminder_HTML', { Find_Exception: { body: { value: [{ DetectedUtc: '2026-10-17T09:00:00Z' }] } } }, item);
  assert.deepEqual(r.errors, []);
  assert.equal(designOf(r.html), 'GV-Stale-Escalation--escalated');
  for (const x of ['IP_SEND_EMAIL', 'DGO:df59a69f', 'owner@nitda.gov.ng', `${REGISTRY_LINK}42`]) assert.ok(r.html.includes(x), x);
  const fresh = run(def, 'Compose_Stale_Reminder_HTML', { Find_Exception: { body: { value: [{ DetectedUtc: '2026-10-20T09:00:00Z' }] } } }, item);
  assert.equal(designOf(fresh.html), 'GV-Stale-Escalation');
});
t('GOV-06 simulated: severity picks the design, and a value with markup is escaped', () => {
  const def = fixed[ID['06']].definition;
  const item = { Id: 9, Severity: 'Medium', ExceptionType: 'Stale', ExceptionKey: 'K1', RegistryKey: 'R', FlowId: 'F', RunId: 'RUN', DetectedUtc: '2026-10-20T09:00:00Z', Details: '<b>x</b>', AssignedToEmail: 'a@nitda.gov.ng' };
  const med = run(def, 'Compose_Exception_Email_HTML', {}, item);
  assert.deepEqual(med.errors, []);
  assert.equal(designOf(med.html), 'GV-Registry-Exception--medium-low');
  assert.ok(med.html.includes('&lt;b&gt;x&lt;/b&gt;') && !med.html.includes('<b>x</b>') && med.html.includes(`${EXCEPTION_LINK}9`));
  assert.equal(designOf(run(def, 'Compose_Exception_Email_HTML', {}, { ...item, Severity: 'Critical' }).html), 'GV-Registry-Exception');
});


/* The flow service stores a definition with its keys reordered, empty runAfter dropped, metadata and a connector step's
   authentication added. The read-back must count that as landed, and a changed step as not landed. */
const asStored = (v) => {
  if (Array.isArray(v)) return v.map(asStored);
  if (!v || typeof v !== 'object') return v;
  const out = {};
  for (const k of Object.keys(v).reverse()) {
    if (k === 'runAfter' && v[k] && typeof v[k] === 'object' && !Object.keys(v[k]).length) continue;
    out[k] = v.type === 'Compose' && k === 'inputs' ? v[k] : asStored(v[k]); // a Compose's value is data, not steps
  }
  if (typeof v.type === 'string' && v.runAfter !== undefined) out.metadata = { operationMetadataId: '00000000-0000-0000-0000-000000000000' };
  if (v.type === 'OpenApiConnection' && v.inputs && typeof v.inputs === 'object' && !('authentication' in v.inputs)) out.inputs.authentication = "@parameters('$authentication')";
  return out;
};
t('the read-back counts a definition stored as the service stores it as landed', () => {
  for (const [id, r] of Object.entries(fixed)) assert.equal(storedDiff(asStored(r.definition), r.definition), null, FLOWS[id]);
});
t('the read-back names the step stored differently, and an unreadable flow', () => {
  for (const [id, r] of Object.entries(fixed)) {
    const stored = asStored(r.definition);
    const [name] = Object.entries(actionsByName(stored.actions)).find(([n, a]) => a?.type === 'Compose' && /_HTML_/.test(n));
    actionsByName(stored.actions)[name].inputs = 'changed';
    assert.match(storedDiff(stored, r.definition) || '', new RegExp(name), FLOWS[id]);
  }
  assert.equal(storedDiff(undefined, {}), 'the flow could not be read back');
});

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
