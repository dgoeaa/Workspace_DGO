#!/usr/bin/env node
/**
 * DGO_USERDIRECTORY_SYNC — the corrected Scope_Global, held to what the review found and run
 * end-to-end in a local simulator before anyone pastes it.
 *
 * Static: the package is current, well formed, bound, writes only real columns and real choice
 * values, and every expression parses and uses only known functions and declared variables.
 * Dynamic: six scenarios through scripts/lib/wdl-sim.mjs against in-memory Microsoft 365 and
 * SharePoint — first run, steady state, mass absence, empty source, a rejected write, and a
 * reporting path whose side services fail.
 *
 * Set UDSYNC_RENDER_DIR to also write each scenario's email and report HTML for visual review.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pkg, VARIABLES } from '../scripts/build-userdirectory-sync.mjs';
import { parse, expressionsIn, functionsIn } from '../scripts/lib/wdl-sim.mjs';
import { USERDIR, AUDIT, SITE, TELEMETRY, COHORTS, LISTS, SITE_OF, choicesOf, tenant, run, reportMail, telemetryMail, byUserId } from './lib/userdirectory-tenant.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const section = (t) => console.log(`\n${t}\n`);

const OUT = 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance/DGO_USERDIRECTORY_SYNC.Scope_Global.designer-paste.json';

console.log('\nDGO_USERDIRECTORY_SYNC — corrected Scope_Global\n');

/* ───────────── static ───────────── */

section('The package is current and pastes as a scope');

let stale = '';
try { execFileSync('node', ['scripts/build-userdirectory-sync.mjs', '--check'], { stdio: 'pipe' }); } catch (e) { stale = String(e.stderr || e.message); }
ok(!stale, 'the committed package matches the generator', stale.trim());
const committed = JSON.parse(readFileSync(OUT, 'utf8'));
ok(committed.nodeId === 'Scope_Global' && committed.serializedValue?.type === 'Scope', 'nodeId Scope_Global, type Scope');
ok(committed.isScopeNode === true && committed.mslaNode === true && committed.staticResults && committed.allConnectionData, 'clipboard envelope is complete');
ok(Object.keys(committed.serializedValue.runAfter || {}).length === 0, 'the scope is a root (runAfter {}), anchored by the designer where it is pasted');

const all = [];
const walk = (actions, siblings, path) => {
  for (const [name, act] of Object.entries(actions || {})) {
    all.push({ name, act, siblings: actions, path });
    walk(act.actions, act.actions, [...path, name]);
    if (act.else) walk(act.else.actions, act.else.actions, [...path, name]);
    if (act.cases) for (const c of Object.values(act.cases)) walk(c.actions, c.actions, [...path, name]);
    if (act.default) walk(act.default.actions, act.default.actions, [...path, name]);
  }
};
walk(pkg.serializedValue.actions, pkg.serializedValue.actions, []);
const byName = new Map(all.map((a) => [a.name, a]));
const ANY_OK = (st) => Array.isArray(st) && ['Succeeded', 'Failed', 'TimedOut', 'Skipped'].every((x) => st.includes(x));

section('Schedule');

const trig = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/surfaces/governance/DGO_USERDIRECTORY_SYNC.trigger.json', 'utf8')).Recurrence;
ok(trig?.type === 'Recurrence' && trig.recurrence.frequency === 'Day' && trig.recurrence.interval === 1 && trig.recurrence.timeZone === 'W. Central Africa Standard Time', 'the reference trigger runs daily on Nigerian time');
ok(trig.runtimeConfiguration?.concurrency?.runs === 1, 'runs never overlap');

section('Structure');

ok(byName.size === all.length, 'every action name is unique', `${all.length - byName.size} duplicates`);
const badAfter = all.flatMap(({ name, act, siblings }) => Object.keys(act.runAfter || {}).filter((d) => !(d in siblings)).map((d) => `${name} -> ${d}`));
ok(!badAfter.length, 'every runAfter names a sibling', badAfter.join(', '));
const placeholders = JSON.stringify(pkg).match(/\{"equals":\["",""\]\}/g) || [];
ok(!placeholders.length, 'no placeholder condition (equals "" "") survives');
const terminates = all.filter(({ act }) => act.type === 'Terminate');
ok(terminates.length === 1 && terminates[0].path.includes('Condition_Run_Outcome'), 'the only Terminate is the final outcome gate — the report always runs first');
const report = byName.get('Scope_Report_And_Notify');
ok(['Failed', 'TimedOut', 'Succeeded'].every((s) => report.act.runAfter.Scope_UserDirectory_Synchronization.includes(s)), 'the report scope runs after the sync whatever its outcome');
const capture = byName.get('Scope_Flow_Data_Capture');
ok(capture && ANY_OK(capture.act.runAfter.Scope_Report_And_Notify) && ANY_OK(byName.get('Condition_Run_Outcome').act.runAfter.Scope_Flow_Data_Capture), 'Scope_Flow_Data_Capture runs after the report whatever its outcome, and the outcome gate after it');
ok(['Compose_Flow_Run_Record', 'Compose_Flow_Run_Record_Schema', 'Compose_Telemetry_Attachments', 'Create_Flow_Telemetry', 'Send_Telemetry_Email', 'Get_Flow_Definition'].every((n) => byName.has(n)), 'the estate telemetry actions are present under their standard names');
const estate = JSON.parse(readFileSync('docs/folio-Master-Flows-and-Endpoints/contracts/flow-run-record-schema.json', 'utf8'));
ok(JSON.stringify(byName.get('Compose_Flow_Run_Record_Schema').act.inputs) === JSON.stringify(estate.recordSchema), 'the run record schema is the estate schema, verbatim');
const recordKeys = Object.keys(byName.get('Compose_Flow_Run_Record').act.inputs);
ok(JSON.stringify(recordKeys) === JSON.stringify(estate.recordSections), 'the run record has the estate v2.0.0 sections, in order', recordKeys.join(', '));
ok(byName.get('Compose_Flow_Run_Record').act.inputs.capture_metadata.capture_version === '2.0.0', 'capture_version 2.0.0');
ok(byName.get('Compose_Telemetry_Attachments').act.inputs.map((a) => a.Name.split('__').pop()).join() === estate.telemetryAttachmentSuffixes.join(), 'the five telemetry attachments follow the estate naming convention');
const settings = byName.get('Compose_Settings').act.inputs;
ok(byName.get('Search_for_users_V2').act.runtimeConfiguration.paginationPolicy.minimumItemCount === settings.M365PageCap, 'the Microsoft 365 pagination cap equals the completeness guard cap');
ok(['Get_existing_UserDirectory_items', 'Get_UserDirectory_After_Sync'].every((n) => byName.get(n).act.runtimeConfiguration.paginationPolicy.minimumItemCount === settings.ListPageCap), 'both UserDirectory reads use the list completeness cap');
const notExpr = all.filter(({ act }) => (act.type === 'Query' || act.type === 'Select') ? !String(act.inputs.from).startsWith('@') : act.type === 'Foreach' ? !String(act.foreach).startsWith('@') : false).map(({ name }) => name);
ok(!notExpr.length, 'every Query/Select from and Foreach input is an expression, not literal text', notExpr.join(', '));
ok(all.filter(({ act }) => act.type === 'Foreach').every(({ act }) => act.runtimeConfiguration?.concurrency?.repetitions === 1), 'loops that write counters run one at a time');

section('Connections');

const conn = all.filter(({ act }) => act.type === 'OpenApiConnection');
const acd = pkg.allConnectionData;
ok(conn.every(({ name, act }) => acd[name]?.referenceKey === act.inputs.host.connection), 'every connector action has a matching allConnectionData entry');
ok(Object.keys(acd).every((n) => conn.some((c) => c.name === n)), 'no stray connection entries');
ok(conn.every(({ name, act }) => acd[name].connectionReference.connection.id === `/providers/Microsoft.PowerApps/apis/${act.inputs.host.connection}/connections/${acd[name].connectionReference.connectionName}`), 'connection ids agree with connection names');

section('Columns and choice values against the provisioning spec');

for (const { name, act } of conn) {
  const p = act.inputs.parameters;
  if (!p.table) continue;
  ok(LISTS[p.table] && p.dataset === SITE_OF[p.table], `${name} targets a provisioned list on its own site`);
  const fields = LISTS[p.table];
  const bad = Object.keys(p).filter((k) => k.startsWith('item/')).map((k) => k.slice(5).split('/')[0]).filter((c) => c !== 'Title' && !fields.has(c));
  ok(!bad.length, `${name} writes only provisioned columns`, bad.join(', '));
  for (const [k, v] of Object.entries(p)) {
    if (!k.endsWith('/Value') || typeof v !== 'string' || v.startsWith('@')) continue;
    const f = fields.get(k.slice(5).split('/')[0]);
    ok(choicesOf(f).includes(v), `${name} writes a real ${f.InternalName} choice ('${v}')`);
  }
}
const statusChoices = choicesOf(LISTS[USERDIR].get('Status'));
const severityChoices = choicesOf(LISTS[AUDIT].get('Severity'));
const outcome = byName.get('Compose_Outcome').act.inputs;
const literals = (expr) => [...expr.matchAll(/'([^']*)'/g)].map((m) => m[1]);
ok(literals(outcome.severity).filter((v) => !['success', 'warning', 'Compose_Outcome_Key'].includes(v)).every((v) => severityChoices.includes(v)), `every audit severity is a Severity choice (${severityChoices.join(', ')})`);
const raw = JSON.stringify(pkg);
ok(!/verification-required|'Information'|'Warning','Information'/.test(raw), 'the retired values verification-required / Information are gone');
ok(statusChoices.includes(settings.NewUserStatus), `NewUserStatus '${settings.NewUserStatus}' is a Status choice`);

section('Expressions');

const exprs = all.flatMap(({ name, act }) => expressionsIn({ i: act.inputs, e: act.expression, f: act.foreach }).map((src) => ({ name, src })));
const KNOWN = new Set(['concat', 'if', 'equals', 'and', 'or', 'not', 'greater', 'greaterOrEquals', 'less', 'lessOrEquals', 'length', 'coalesce', 'string', 'toLower', 'toUpper', 'trim', 'empty', 'contains', 'startsWith', 'first', 'take', 'skip', 'join', 'union', 'createArray', 'addProperty', 'replace', 'json', 'int', 'add', 'sub', 'mul', 'div', 'mod', 'max', 'min', 'utcNow', 'addMinutes', 'ticks', 'formatDateTime', 'convertFromUtc', 'formatNumber', 'base64', 'base64ToBinary', 'workflow', 'trigger', 'triggerOutputs', 'triggerBody', 'removeProperty', 'indexOf', 'lastIndexOf', 'last', 'split', 'variables', 'item', 'items', 'outputs', 'body', 'actions', 'result']);
const parseErrors = []; const unknownFns = new Set(); let longest = 0;
for (const { name, src } of exprs) {
  longest = Math.max(longest, src.length);
  try { for (const f of functionsIn(parse(src))) if (!KNOWN.has(f)) unknownFns.add(f); } catch (e) { parseErrors.push(`${name}: ${e.message.slice(0, 160)}`); }
}
ok(!parseErrors.length, `all ${exprs.length} expressions parse`, parseErrors.slice(0, 3).join(' | '));
ok(!unknownFns.size, 'only workflow-language functions are called', [...unknownFns].join(', '));
ok(longest < 8192, `every expression is under the 8,192-character limit (longest ${longest})`);
const usedVars = new Set([...raw.matchAll(/variables\('([A-Za-z]+)'\)/g)].map((m) => m[1]).concat(all.filter(({ act }) => /Variable$/.test(act.type)).map(({ act }) => act.inputs.name)));
ok([...usedVars].every((v) => v in VARIABLES), `every variable is one the flow declares above the scope (${[...usedVars].sort().join(', ')})`);
ok(all.filter(({ act }) => act.type === 'IncrementVariable').every(({ act }) => VARIABLES[act.inputs.name] === 'Integer'), 'increments target Integer variables');
ok(all.filter(({ act }) => act.type === 'AppendToArrayVariable').every(({ act }) => VARIABLES[act.inputs.name] === 'Array'), 'appends target Array variables (Errors, DecisionLog)');
const refs = new Set([...raw.matchAll(/\b(?:outputs|body|actions|result)\('([^']+)'\)/g)].map((m) => m[1]));
ok([...refs].every((r) => byName.has(r)), 'every outputs()/body()/actions()/result() names an action in the package', [...refs].filter((r) => !byName.has(r)).join(', '));

/* ───────────── dynamic ───────────── */

const render = (label, t) => {
  const dir = process.env.UDSYNC_RENDER_DIR;
  if (!dir || !reportMail(t)) return;
  mkdirSync(dir, { recursive: true });
  const mail = reportMail(t);
  writeFileSync(join(dir, `${label}.email.html`), mail['emailMessage/Body']);
  const rep = mail['emailMessage/Attachments'].find((a) => a.Name.endsWith('.html'));
  writeFileSync(join(dir, `${label}.report.html`), rep.ContentBytes);
  const json = mail['emailMessage/Attachments'].find((a) => a.Name.endsWith('.json'));
  writeFileSync(join(dir, `${label}.sync-data.json`), json.ContentBytes);
};

const VOID = new Set(['meta', 'br', 'input', 'hr', 'img', 'link']);
function balanced(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g)) {
    const [, close, tag0, self] = m; const tag = tag0.toLowerCase();
    if (tag === '!doctype' || VOID.has(tag) || self) continue;
    if (!close) stack.push(tag);
    else { const top = stack.pop(); if (top !== tag) return `</${tag}> closes <${top}>`; }
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : '';
}
const docChecks = (label, t) => {
  const mail = reportMail(t);
  const html = mail['emailMessage/Body'];
  const rep = mail['emailMessage/Attachments'].find((a) => a.Name.endsWith('.html')).ContentBytes;
  const rec = JSON.parse(mail['emailMessage/Attachments'].find((a) => a.Name.endsWith('.json')).ContentBytes);
  ok(!balanced(html), `${label}: the email HTML is well formed`, balanced(html));
  ok(!balanced(rep), `${label}: the report HTML is well formed`, balanced(rep));
  ok(!/@\{|undefined|\[object Object\]/.test(html + rep), `${label}: no unevaluated expression or JS artefact leaks into either document`);
  ok(['flow', 'run', 'inputs', 'outputs', 'steps'].every((k) => k in rec) && rec.outputs.metrics && Array.isArray(rec.steps), `${label}: the run record carries flow, run, inputs, outputs and steps`);
  const tm = telemetryMail(t);
  const files = (tm?.['emailMessage/Attachments'] || []).map((a) => a.Name.split('__').pop());
  ok(files.join() === 'flow_run_record.json,flow_run_record_schema.json,trigger_input_schema.json,full_definition.json,varResponse.json', `${label}: the telemetry email carries the five standard attachments`, files.join());
  const runRec = JSON.parse(tm['emailMessage/Attachments'][0].ContentBytes);
  const schema = JSON.parse(tm['emailMessage/Attachments'][1].ContentBytes);
  ok(schema.required.every((k) => k in runRec) && runRec.capture_metadata.capture_version === '2.0.0', `${label}: the flow run record has every section its schema requires`);
  ok(schema.properties.outcome.properties.flow_outcome.enum.includes(runRec.outcome.flow_outcome), `${label}: flow_outcome is a schema value (${runRec.outcome.flow_outcome})`);
  ok(runRec.outcome.all_scope_action_results.length > 20 && runRec.outcome.all_scope_action_results.every((r) => !('outputs' in r)), `${label}: every step of both scopes is recorded, without outputs`);
  ok(!JSON.stringify(runRec).includes('ngozi.okafor@nitda.gov.ng') || label === 'none', `${label}: the run record carries no directory data`);
  const row = t.store[TELEMETRY].at(-1);
  ok(row && row.RunId && row.Outcome === runRec.outcome.flow_outcome && row.RunRecordJson.length <= 60000 && JSON.parse(row.RunRecordJson).run_identity, `${label}: one Portal Flow Telemetry row with the compact run record`);
  return { html, rep, rec, mail, runRec };
};

section('Scenario A — first run: create, adopt, protect, exclude, update, reactivate, disable');

const NOW = '2026-09-25T06:00:00.500Z';
const M365 = [
  { Id: 'id-ngozi', DisplayName: 'Ngozi Okafor', Mail: 'ngozi.okafor@nitda.gov.ng', UserPrincipalName: 'ngozi.okafor@nitda.gov.ng', Department: 'Legal Services and Board Matters', JobTitle: 'Legal Officer', BusinessPhones: ['+234 9 000 0001'], AccountEnabled: true },
  { Id: 'id-musa', DisplayName: 'Musa Ibrahim', Mail: 'musa.ibrahim@nitda.gov.ng', UserPrincipalName: 'musa.ibrahim@nitda.gov.ng', Department: null, CompanyName: 'Procurement', JobTitle: null, BusinessPhones: [] },
  { Id: 'ID-AMINA', DisplayName: 'Amina Bello', Mail: 'Amina.Bello@nitda.gov.ng', UserPrincipalName: 'amina.bello@nitda.gov.ng', Department: 'DGs Office', JobTitle: 'Director', MobilePhone: '+234 800 000 0002', AccountEnabled: true },
  { Id: 'id-registry', DisplayName: 'DG Registry', Mail: 'dgsregistry@nitda.gov.ng', UserPrincipalName: 'dgsregistry@nitda.gov.ng', AccountEnabled: true },
  { Id: 'id-guest', DisplayName: 'External Consultant', Mail: 'consultant@example.com', UserPrincipalName: 'consultant_example.com#EXT#@nitda.onmicrosoft.com', Department: 'Legacy Unit', AccountEnabled: true },
  { Id: 'id-gone', DisplayName: 'Old Account', Mail: 'old.account@nitda.gov.ng', UserPrincipalName: 'old.account@nitda.gov.ng', AccountEnabled: false },
  { Id: 'id-chidi', DisplayName: 'Chidi Eze', Mail: 'chidi.eze@nitda.gov.ng', UserPrincipalName: 'chidi.eze@nitda.gov.ng', Department: 'Cybersecurity Department', JobTitle: 'Senior Analyst', AccountEnabled: true },
  { Id: 'id-kemi', DisplayName: 'Kemi Adeyemi', Mail: 'kemi.adeyemi@nitda.gov.ng', UserPrincipalName: 'kemi.adeyemi@nitda.gov.ng', Department: 'Finance Management and Control Department', JobTitle: 'Accountant', AccountEnabled: true },
  { Id: 'id-tunde', DisplayName: 'Tunde <Bakare> & Co', Mail: 'tunde.bakare@nitda.gov.ng', UserPrincipalName: 'tunde.bakare@nitda.gov.ng', Department: 'HRA', JobTitle: 'Clerk', AccountEnabled: true },
  { Id: 'id-room', DisplayName: 'Board Room', Mail: null, UserPrincipalName: 'boardroom', AccountEnabled: true },
];
const sync = { CreatedBy: 'DGO_UserDirectory_M365_Sync', UpdatedBy: 'DGO_UserDirectory_M365_Sync', CreatedAt: '2026-08-01T00:00:00Z', UpdatedAt: '2026-08-01T00:00:00Z', PilotCohort: 'directory-sync', AccessScope: '[]' };
const ROWS = [
  { ID: 1, Title: 'Registry Bootstrap Administrator', UserId: 'bootstrap-registry-admin', FullName: 'Registry', Email: 'dgsregistry@nitda.gov.ng', Directorate: 'Registry', Role: 'systemAdmin', Persona: 'admin', Status: 'active', AccessScope: '["all"]', PilotCohort: 'bootstrap' },
  { ID: 2, Title: 'Amina Bello', UserId: '6f1c2d3e-4b5a-4c6d-8e7f-001122334455', FullName: 'Amina Bello', Email: 'amina.bello@nitda.gov.ng', Directorate: 'DGO', Role: 'director', Persona: 'executive', Status: 'active', AccessScope: '["all"]', PilotCohort: 'pilot-1', CreatedBy: 'admin@nitda.gov.ng' },
  { ID: 3, Title: 'Former Staff', UserId: 'id-former', FullName: 'Former Staff', Email: 'former.staff@nitda.gov.ng', Directorate: 'ICT', Role: 'operator', Persona: 'registry', Status: 'active', PilotCohort: 'pilot-1' },
  { ID: 4, ...sync, Title: 'Chidi Eze', UserId: 'id-chidi', FullName: 'Chidi Eze', Email: 'chidi.eze@nitda.gov.ng', Directorate: 'ITD', Department: 'Information Technology Department', JobTitle: 'Analyst', Phone: '', Role: 'viewer', Persona: 'general', Status: 'active', DisabledReason: '' },
  { ID: 5, ...sync, Title: 'Kemi Adeyemi', UserId: 'id-kemi', FullName: 'Kemi Adeyemi', Email: 'kemi.adeyemi@nitda.gov.ng', Directorate: 'FMC', Department: 'Finance Management and Control Department', JobTitle: 'Accountant', Phone: '', Role: 'viewer', Persona: 'general', Status: 'disabled', DisabledReason: 'Suspended by an administrator' },
  { ID: 6, ...sync, Title: 'Tunde <Bakare> & Co', UserId: 'id-tunde', FullName: 'Tunde <Bakare> & Co', Email: 'tunde.bakare@nitda.gov.ng', Directorate: 'HRM', Department: 'HRA', JobTitle: 'Clerk', Phone: '', Role: 'viewer', Persona: 'general', Status: 'disabled', DisabledReason: 'User absent from the complete Microsoft 365 directory read on 2026-09-01 (run R0).' },
];

const A = tenant({ users: M365, rows: structuredClone(ROWS) });
const simA = run(A, NOW, 'A1');
ok(!simA.templateErrors.length, 'no expression faults anywhere in the run', simA.templateErrors.map((e) => `${e.action}: ${e.message}`).slice(0, 3).join(' | '));
ok(simA.runStatus === 'Succeeded', 'the run succeeds', simA.runError?.message);
ok(simA.variables.CreatedCount === 3 && simA.variables.UpdatedCount === 3 && simA.variables.DisabledCount === 1 && simA.variables.SkippedCount === 3,
  'created 3 (the guest included), updated 3, disabled 1, skipped 3', JSON.stringify({ c: simA.variables.CreatedCount, u: simA.variables.UpdatedCount, d: simA.variables.DisabledCount, s: simA.variables.SkippedCount, e: simA.variables.Errors }));
ok(simA.variables.Errors.length === 0, 'no issues recorded', JSON.stringify(simA.variables.Errors));
ok(byUserId(A, 'id-ngozi')?.Status === 'active' && byUserId(A, 'id-ngozi')?.Role === 'viewer', 'a new enabled account is created active, as a viewer');
ok(byUserId(A, 'id-musa')?.Status === 'staged' && byUserId(A, 'id-musa')?.Directorate === 'PU', 'an account with no reported state is created staged; with no department, the company name (Procurement) resolves to its unit key');
const amina = A.store[USERDIR].find((r) => r.ID === 2);
ok(amina.UserId === 'id-amina' && amina.Role === 'director' && amina.Persona === 'executive' && amina.AccessScope === '["all"]', 'an app-enrolled row is adopted by email: object id written, role, persona and scope kept');
ok(A.store[USERDIR].filter((r) => /amina/i.test(r.Email)).length === 1, 'adoption does not duplicate the person');
ok(JSON.stringify(A.store[USERDIR].find((r) => r.ID === 1)) === JSON.stringify(ROWS[0]), 'the bootstrap row is untouched');
ok(A.store[USERDIR].find((r) => r.Email === 'consultant@example.com')?.Role === 'viewer' && !A.store[USERDIR].some((r) => /boardroom|old\.account/.test(r.Email)), 'a guest with a mailbox is created (IncludeGuests on); mailbox-less and disabled-without-row accounts are not');
ok(byUserId(A, 'id-chidi').Department === 'Cybersecurity Department' && byUserId(A, 'id-chidi').Directorate === 'CS' && byUserId(A, 'id-chidi').JobTitle === 'Senior Analyst', 'a changed attribute is updated; the department resolves to its approved unit key (CS)');
ok(byUserId(A, 'id-ngozi').Directorate === 'LBMU' && byUserId(A, 'id-tunde').Directorate === 'HRM', 'a unit title resolves to its key, and HRA to HRM by the adopted correction');
ok(byUserId(A, 'id-kemi').Status === 'disabled' && byUserId(A, 'id-kemi').DisabledReason === 'Suspended by an administrator', 'an administrator\'s disable is kept');
ok(byUserId(A, 'id-tunde').Status === 'active' && byUserId(A, 'id-tunde').DisabledReason === '', 'a row the sync disabled is re-activated when the account returns');
const former = byUserId(A, 'id-former');
ok(former.Status === 'disabled' && /^User absent/.test(former.DisabledReason) && former.Role === 'operator', 'a row absent from Microsoft 365 is disabled, role kept');
const auditA = A.store[AUDIT].at(-1);
ok(auditA && auditA.Severity === 'info' && auditA.Event === 'audit:user-directory-synced' && auditA.Module === 'user-directory' && auditA.AuditId === 'user-directory:user-directory-synced:REQ-A1' && auditA.ActorRole === 'systemAdmin' && JSON.parse(auditA.MetaJson).metrics.created === 3, 'one audit row, severity info, with metrics in MetaJson');
ok(A.attachments.length === 2 && A.attachments.every((a) => a.itemId === auditA.ID), 'report and sync data are attached to the audit row');
ok(A.emails.length === 2 && /^\[DGO\]\[SUCCEEDED\] User Directory sync: 3 created, 3 updated, 1 disabled \| A1$/.test(reportMail(A)['emailMessage/Subject']), 'one report email (plus the telemetry email), subject states the outcome and counts', reportMail(A)?.['emailMessage/Subject']);
const dA = docChecks('A', A);
ok(A.store[USERDIR].find((r) => r.Email === 'consultant@example.com')?.Directorate === 'Unassigned' && dA.html.includes('Departments with no unit key') && dA.html.includes('Legacy Unit'), 'A: a department matching no unit is Unassigned and listed in the report');
ok(dA.html.includes('Tunde &lt;Bakare&gt; &amp; Co') && !dA.html.includes('Tunde <Bakare>'), 'A: user-supplied text is HTML-escaped');
ok(dA.rec.outputs.changes.length === 7, 'A: the change list holds every row written (3 created, 3 updated, 1 disabled)', String(dA.rec.outputs.changes.length));
ok(dA.rep.includes('data-type="Created"') && dA.rep.includes('data-chip="Disabled"'), 'A: the report carries filterable change rows');
const log = simA.variables.DecisionLog;
const dec = (email) => log.find((e) => e.email === email);
const tally = log.reduce((m, e) => ({ ...m, [e.decision]: (m[e.decision] || 0) + 1 }), {});
ok(JSON.stringify(Object.entries(tally).sort()) === JSON.stringify(Object.entries({ Created: 3, Updated: 3, Unchanged: 1, Protected: 1, Ignored: 1, Disabled: 1 }).sort()), 'A: every reviewed user is in the decision log with its decision', JSON.stringify(tally));
ok(dec('chidi.eze@nitda.gov.ng').summary === 'Directorate: ITD → CS | Department: Information Technology Department → Cybersecurity Department | JobTitle: Analyst → Senior Analyst', 'A: an update records each changed field, old → new', dec('chidi.eze@nitda.gov.ng').summary);
ok(dec('amina.bello@nitda.gov.ng').matchedBy === 'Email' && /Adopted/.test(dec('amina.bello@nitda.gov.ng').reason) && dec('amina.bello@nitda.gov.ng').changes.some((c) => c.field === 'UserId' && c.from.startsWith('6f1c') && c.to === 'id-amina'), 'A: an adoption says so and shows the UserId replaced');
ok(/Status: disabled → active/.test(dec('tunde.bakare@nitda.gov.ng').summary) && /DisabledReason: User absent.* → \(empty\)/.test(dec('tunde.bakare@nitda.gov.ng').summary), 'A: a re-activation shows status and reason cleared');
ok(dec('former.staff@nitda.gov.ng').decision === 'Disabled' && dec('former.staff@nitda.gov.ng').summary === 'Status: active → disabled' && dec('former.staff@nitda.gov.ng').matchedBy === 'Absent', 'A: a reconciliation disable is logged with its old status');
ok(/administrator/.test(dec('kemi.adeyemi@nitda.gov.ng').reason) && /Bootstrap/.test(dec('dgsregistry@nitda.gov.ng').reason) && /no row created/.test(dec('old.account@nitda.gov.ng').reason), 'A: unchanged, protected and ignored users each carry their reason');
ok(dA.html.includes('ITD → CS') && dA.rep.includes('id="t-reviewed"') && (dA.rep.match(/<tr data-type="/g) || []).length === 7 + 10, 'A: email and report show the old → new changes and every reviewed user');
const cohort = A.store[COHORTS];
ok(cohort.length === 1 && cohort[0].CohortId === 'directory-sync' && cohort[0].Status === 'active' && cohort[0].CohortName, 'A: the sync registers its pilot cohort in DGO_PilotCohorts');
render('A-first-run', A);

section('Scenario B — steady state: a rerun changes nothing and does little work');

const simB = run(A, '2026-09-26T06:00:00.250Z', 'B1');
const loop = simB.global.get('Apply_to_each_M365_user');
ok(!simB.templateErrors.length && simB.runStatus === 'Succeeded', 'the rerun succeeds without faults', simB.templateErrors.map((e) => e.message).join(' | '));
ok(simB.variables.CreatedCount === 0 && simB.variables.UpdatedCount === 0 && simB.variables.DisabledCount === 0, 'nothing is created, updated or disabled');
ok(loop.iterations.length === 3, 'only the 3 users whose row differs by design (bootstrap, admin-disabled, disabled without a row) enter the loop', String(loop.iterations.length));
ok(/\[SUCCEEDED\]/.test(reportMail(A)['emailMessage/Subject']), 'the email reports success');
ok(A.store[COHORTS].length === 1, 'the cohort is not registered twice');

section('Scenario C — mass absence: disabling is withheld above the limit');

const many = Array.from({ length: 40 }, (_, i) => ({ ID: 500 + i, ...sync, Title: `Staff ${i}`, UserId: `id-staff-${i}`, FullName: `Staff ${i}`, Email: `staff${i}@nitda.gov.ng`, Directorate: 'ICT', Role: 'viewer', Persona: 'general', Status: 'active' }));
const Cq = tenant({ users: [M365[0]], rows: many });
const simC = run(Cq, NOW, 'C1');
ok(!simC.templateErrors.length && simC.runStatus === 'Succeeded', 'the run completes', simC.templateErrors.map((e) => e.message).join(' | '));
ok(simC.variables.DisabledCount === 0 && Cq.store[USERDIR].every((r) => r.Status === 'active'), 'no row is disabled');
ok(simC.variables.Errors.some((e) => e.stage === 'Reconciliation' && /above the safety limit of 25/.test(e.detail)), 'the withholding is recorded as an issue');
ok(/\[WARNING\]/.test(reportMail(Cq)['emailMessage/Subject']) && reportMail(Cq)['emailMessage/Importance'] === 'High' && Cq.store[AUDIT].at(-1).Severity === 'warning', 'warning email (high importance) and warning audit');
const dC = docChecks('C', Cq);
ok(dC.html.includes('Disabling was withheld') && (dC.html.match(/>Withheld</g) || []).length === 25, 'C: the email shows the banner and lists absent accounts (capped at 25)');
render('C-mass-absence', Cq);

section('Scenario D — empty Microsoft 365 read: nothing written, failure reported, run failed');

const Dq = tenant({ users: [], rows: structuredClone(ROWS) });
const simD = run(Dq, NOW, 'D1');
ok(simD.templateErrors.length === 1 && simD.templateErrors[0].action === 'Stop_Incomplete_Source', 'the only fault is the deliberate stop', simD.templateErrors.map((e) => `${e.action}: ${e.message}`).join(' | '));
ok(!simD.calls.some((c) => c.params.table === USERDIR && /PatchItem|PostItem/.test(c.op)), 'no UserDirectory row is written');
ok(simD.runStatus === 'Failed' && simD.runError.code === 'UserDirectorySyncFailed', 'the run ends Failed through the outcome gate');
ok(/\[FAILED\]/.test(reportMail(Dq)['emailMessage/Subject']) && Dq.store[AUDIT].at(-1).Severity === 'error' && Dq.store[AUDIT].at(-1).Event === 'audit:user-directory-sync-failed', 'failure email and error audit are delivered first');
const dD = docChecks('D', Dq);
ok(dD.html.includes('Failed steps') && dD.html.includes('Condition Source Complete') && dD.html.includes('safety cap'), 'D: the email names the failed step and the reason');
render('D-empty-source', Dq);

section('Scenario E — one rejected write: recorded, the rest carry on');

const Eq = tenant({ users: M365, rows: structuredClone(ROWS), failPatch: new Set(['id-chidi']) });
const simE = run(Eq, NOW, 'E1');
ok(!simE.templateErrors.length && simE.runStatus === 'Succeeded', 'the run completes', simE.templateErrors.map((e) => e.message).join(' | '));
ok(simE.variables.UpdatedCount === 2 && simE.variables.CreatedCount === 3 && simE.variables.DisabledCount === 1, 'every other write still happens');
ok(simE.variables.Errors.length === 1 && simE.variables.Errors[0].stage === 'Update' && /changed by another user/.test(simE.variables.Errors[0].detail), 'the rejection is recorded with SharePoint\'s message');
ok(/\[WARNING\].*1 issue\(s\)/.test(reportMail(Eq)['emailMessage/Subject']), 'the email flags one issue');
docChecks('E', Eq);
const failedE = simE.variables.DecisionLog.find((e) => e.decision === 'Failed');
ok(failedE && failedE.email === 'chidi.eze@nitda.gov.ng' && /changed by another user/.test(failedE.reason) && /Directorate: ITD → CS/.test(failedE.summary), 'E: the rejected update is logged as Failed, with the intended changes and SharePoint\'s reason');
render('E-rejected-write', Eq);

section('Scenario F — the flow lookup and the audit write both fail: the email still goes');

const Fq = tenant({ users: M365, rows: structuredClone(ROWS), failFlow: true, failAudit: true });
const simF = run(Fq, NOW, 'F1');
ok(!simF.templateErrors.length, 'no expression faults', simF.templateErrors.map((e) => `${e.action}: ${e.message}`).join(' | '));
ok(Fq.emails.length === 2 && Fq.attachments.length === 0, 'the email is sent even though nothing could be attached to an audit row');
const dF = docChecks('F', Fq);
ok(dF.html.includes('Not created') && dF.html.includes('DGO User Directory Microsoft 365 Synchronization'), 'F: the email says the audit row is missing and falls back to the flow name from the run context');
ok(simF.runStatus === 'Succeeded', 'the sync itself succeeded, so the run does too');

section('Scenario G — IncludeGuests off: existing guest rows are reconciled as excluded, not absent');

const noGuests = structuredClone(pkg);
noGuests.serializedValue.actions.Compose_Settings.inputs.IncludeGuests = false;
const guestRow = { ID: 40, ...sync, Title: 'External Consultant', UserId: 'id-guest', FullName: 'External Consultant', Email: 'consultant@example.com', Directorate: 'Unassigned', Role: 'viewer', Persona: 'general', Status: 'active' };
const Gq = tenant({ users: M365, rows: [...structuredClone(ROWS), guestRow] });
const simG = run(Gq, NOW, 'G1', noGuests);
const g = Gq.store[USERDIR].find((r) => r.ID === 40);
ok(!simG.templateErrors.length && simG.runStatus === 'Succeeded', 'the run completes', simG.templateErrors.map((e) => e.message).join(' | '));
ok(g.Status === 'disabled' && /^Excluded from the directory/.test(g.DisabledReason), 'the guest row is disabled as excluded, not as absent', g.DisabledReason);
ok(simG.variables.DecisionLog.find((e) => e.email === 'consultant@example.com')?.matchedBy === 'Excluded', 'the decision log says Excluded');
const Gq2 = tenant({ users: M365, rows: Gq.store[USERDIR] });
run(Gq2, '2026-09-26T06:00:00.250Z', 'G2');
ok(Gq2.store[USERDIR].find((r) => r.ID === 40).Status === 'active', 'switching IncludeGuests back on re-activates it');

section('Scenario H — duplicate rows: named, raised, and resolved by deleting the extra row');

/* The shape found in the first live run: an administrator-enrolled row keyed by email and
   disabled by the old flow as "absent", beside a viewer row the old flow created for the same
   person. */
const enrolled = { ID: 3, Title: 'Hauwa Kabir', UserId: 'hkabir@nitda.gov.ng', FullName: 'Hauwa A. Kabir', Email: 'Hkabir@nitda.gov.ng', Directorate: 'ITD', Department: 'ITIS', JobTitle: 'Executive Assistant', Role: 'operator', Persona: 'executive', Status: 'disabled', DisabledReason: 'User absent from the completed paginated Microsoft 365 directory extraction', PilotCohort: null };
const synced = { ID: 360, ...sync, Title: 'Hauwa Kabir', UserId: 'id-hauwa', FullName: 'Hauwa Kabir', Email: 'hkabir@nitda.gov.ng', Directorate: 'Unassigned', Department: '', JobTitle: 'Engineer', Phone: '', Role: 'viewer', Persona: 'general', Status: 'active', DisabledReason: '' };
const hauwa = { Id: 'id-hauwa', DisplayName: 'Hauwa Kabir', Mail: 'hkabir@nitda.gov.ng', UserPrincipalName: 'hkabir@nitda.gov.ng', Department: null, JobTitle: 'Engineer', AccountEnabled: true };
const Hq = tenant({ users: [hauwa], rows: [structuredClone(ROWS[0]), enrolled, synced] });
const simH = run(Hq, NOW, 'H1');
const mH = simH.global.get('Compose_Metrics').outputs;
ok(!simH.templateErrors.length && mH.duplicateRows === 2, 'both rows sharing the email are found', String(mH.duplicateRows));
ok(simH.variables.Errors.some((e) => e.stage === 'Data quality' && /hkabir@nitda\.gov\.ng/.test(e.detail)) && /\[WARNING\]/.test(reportMail(Hq)['emailMessage/Subject']), 'they are raised as a data-quality issue: a warning, not a success');
const dH = docChecks('H', Hq);
ok(dH.html.includes('Duplicate rows') && dH.html.includes('Item&nbsp;3<') && dH.html.includes('Item&nbsp;360') && dH.html.includes('created by hand'), 'H: the email lists each duplicate row with its role, status and origin');
ok(Hq.store[USERDIR].find((r) => r.ID === 3).Status === 'disabled', 'the sync does not guess which row is the person');
const Hq2 = tenant({ users: [hauwa], rows: Hq.store[USERDIR].filter((r) => r.ID !== 360) });
const simH2 = run(Hq2, '2026-09-26T06:00:00.250Z', 'H2');
const kept = Hq2.store[USERDIR].find((r) => r.ID === 3);
ok(kept.UserId === 'id-hauwa' && kept.Status === 'active' && kept.Role === 'operator' && kept.Persona === 'executive' && kept.DisabledReason === '', 'after deleting the extra row, the next run adopts the enrolled row, writes the id and re-activates it, role kept');
ok(kept.Directorate === 'ITD' && kept.Department === 'ITIS' && kept.JobTitle === 'Engineer', 'a value Microsoft 365 leaves blank never erases one an administrator entered; a value it has still wins', JSON.stringify({ d: kept.Directorate, dep: kept.Department, j: kept.JobTitle }));
ok(simH2.global.get('Compose_Metrics').outputs.duplicateRows === 0 && /\[SUCCEEDED\]/.test(reportMail(Hq2)['emailMessage/Subject']), 'and the run is clean again');
render('H-duplicates', Hq);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
