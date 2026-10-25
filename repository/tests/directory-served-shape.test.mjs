#!/usr/bin/env node
/**
 * DGO_UserDirectory, as the platform receives it.
 *
 * The directory is correct only if the flows that serve it and the client that reads it agree.
 * They did not: DGO_FETCH_ALL and DGO_REFERENCE_DATA passed Role, Persona and Status through as
 * SharePoint Choice objects ({ Value }) and read only the first 500 rows, and DGO_OTP_VERIFY
 * stated the role as an object inside `roles` while core/auth.js reads a `role` string and an
 * `email`. Served that way, every user arrived with status "[object Object]" and was refused.
 *
 * This runs the packages' own Select and claim expressions (scripts/lib/wdl-sim.mjs) over rows
 * shaped exactly as SharePoint GetItems returns them, then through the client's normalizeUser,
 * explainAccess and verifiedRole.
 *
 * The packages are the identification Phase 4 packages for the adopted flows: FETCH_ALL (IP_FETCH_ALL_BOOTSTRAP) and the
 * proof mint (IP_OTP_VERIFY). The DGO_* replacement packages this read before 2026-10-06 are retired; their directory
 * fixes were ported into the FETCH_ALL package. REFERENCE_DATA has no package yet (readiness register ITEM-76).
 */
import { readFileSync } from 'node:fs';
import { simulate } from '../scripts/lib/wdl-sim.mjs';
import { normalizeUser } from '../core/domain.js';
import { explainAccess } from '../config/rbac.config.js';
import { verifiedRole } from '../core/auth.js';
import { normalizeDepartment, normalizeCategory } from '../core/domain.js';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
const DIR = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/';
const FA = 'FETCH_ALL__IP_FETCH_ALL_BOOTSTRAP__b79e6707.paste.json';
const OTP = 'OTP_VERIFY__IP_OTP_VERIFY__4dbe6dde.paste.json';
const USERDIR = '3d591f5b-3f2f-409c-983a-a77b5c174834';
const load = (f) => JSON.parse(readFileSync(DIR + f, 'utf8'));
const find = (node, name) => {
  for (const [k, v] of Object.entries(node.actions || {})) {
    if (k === name) return v;
    for (const sub of [v, v.else, ...Object.values(v.cases || {}), v.default].filter(Boolean)) { const r = find(sub, name); if (r) return r; }
  }
  return null;
};
const choice = (v) => ({ '@odata.type': '#Microsoft.Azure.Connectors.SharePoint.SPListExpandedReference', Id: 1, Value: v });
const ROW = { ID: 3, UserId: 'ad81bb39-2042-401a-9d51-85c69d8ff8c4', FullName: 'Operator User', Email: 'operator@nitda.gov.ng', Directorate: 'EAA', Department: 'EAA', Role: choice('operator'), Persona: choice('executive'), Status: choice('active'), AccessScope: '[]', PilotCohort: null };

/* Run one action from a package with a named upstream action mocked to return `outputs`. */
function runAction(action, upstream, outputs) {
  const pkg = { nodeId: 'Scope', serializedValue: { type: 'Scope', actions: {
    [upstream]: { type: 'Compose', inputs: 'mock', runAfter: {} },
    Under_Test: { ...structuredClone(action), runAfter: { [upstream]: ['Succeeded'] } },
  } } };
  const sim = simulate(pkg, { variables: { varStatusCode: 0, varData: {} } });
  sim.global.get(upstream).outputs = outputs; // replace the mock's outputs, then re-run the action under test
  sim.templateErrors = []; // the first pass saw the placeholder, not the rows
  sim.runAction('Under_Test', pkg.serializedValue.actions.Under_Test, { results: new Map(), parent: null, binding: [] });
  return sim;
}

console.log('\nDGO_UserDirectory as the platform receives it\n');

for (const [file, getName, selName] of [[FA, 'Get_All_Users', 'Select_Users']]) {
  const pkg = load(file).serializedValue;
  const get = find(pkg, getName), sel = find(pkg, selName);
  ok(get?.inputs?.parameters?.table === USERDIR && !get.inputs.parameters.$filter, `${file}: ${getName} reads the whole directory`);
  ok(get.runtimeConfiguration?.paginationPolicy?.minimumItemCount >= 5000, `${file}: ${getName} pages past 500 rows (the directory holds 852)`, JSON.stringify(get.runtimeConfiguration));
  const sim = runAction(sel, getName, { statusCode: 200, body: { value: [ROW] } });
  const served = sim.global.get('Under_Test').outputs?.body?.[0];
  ok(!sim.templateErrors.length && served, `${file}: ${selName} evaluates over a SharePoint-shaped row`, sim.templateErrors.map((e) => e.message).join(' | '));
  ok(served && ['Role', 'Persona', 'Status'].every((k) => typeof served[k] === 'string'), `${file}: Role, Persona and Status are served as text`, JSON.stringify(served && { Role: served.Role, Status: served.Status }));
  const user = normalizeUser(served || {});
  ok(user.role === 'operator' && user.persona === 'executive' && user.status === 'active', `${file}: the client reads operator / executive / active`, JSON.stringify({ role: user.role, persona: user.persona, status: user.status }));
  ok(explainAccess(user, 'home').allowed, `${file}: the served user is admitted`, explainAccess(user, 'home').reason);
  const plain = runAction(sel, getName, { statusCode: 200, body: { value: [{ ...ROW, Role: 'operator', Persona: 'executive', Status: 'active' }] } });
  ok(!plain.templateErrors.length && plain.global.get('Under_Test').outputs?.body?.[0]?.Role === 'operator', `${file}: a row whose Role is already text is served unchanged`);
}

section('The gate resolves the caller\'s role');
{
  const pkg = load(FA).serializedValue;
  const sim = runAction(find(pkg, 'Compose_FetchAll_Role'), 'Get_FetchAll_Directory_User', { statusCode: 200, body: { value: [ROW] } });
  const role = sim.global.get('Under_Test').outputs;
  ok(role === 'operator', `${FA}: the gate reads the caller's role as 'operator', which DGO_RoleCatalogue can match`, JSON.stringify(role)?.slice(0, 80));
}

section('The client, whatever shape a flow sends');

function section(t) { console.log(`\n${t}\n`); }
const raw = normalizeUser(ROW);
ok(raw.role === 'operator' && raw.status === 'active' && raw.persona === 'executive' && explainAccess(raw, 'home').allowed, 'normalizeUser unwraps Choice objects, so a raw GetItems row is read correctly too');
const disabled = normalizeUser({ ...ROW, Status: choice('disabled') });
ok(disabled.status === 'disabled' && !explainAccess(disabled, 'home').allowed, 'a disabled row is still refused');

section('One-time-code sign-in');

const verify = load(OTP).serializedValue;
const setData = find(verify, 'Append_to_string_variable_Verification_Successful');
const claimsAction = { type: 'Compose', inputs: setData.inputs.value.claims };
const csim = runAction(claimsAction, 'Get_Otp_Directory_User', { statusCode: 200, body: { value: [{ ...ROW, Email: 'Operator@nitda.gov.ng' }] } });
const claims = csim.global.get('Under_Test').outputs || {};
ok(!csim.templateErrors.length, 'the verified claims evaluate over a SharePoint-shaped row', csim.templateErrors.map((e) => e.message).join(' | '));
ok(claims.role === 'operator' && claims.roles?.[0] === 'operator', 'the proof states role and roles as text', JSON.stringify({ role: claims.role, roles: claims.roles }));
ok(claims.email === 'operator@nitda.gov.ng' && claims.preferred_username === 'operator@nitda.gov.ng', 'the proof states the email core/auth.js reads, lower-cased');
ok(verifiedRole(claims) === 'operator', 'core/auth.js resolves the role from the proof');
ok(verifiedRole({ roles: [choice('director')] }) === 'director' && verifiedRole({ roles: [] }) === null && verifiedRole({}) === null, 'verifiedRole accepts roles[0] and a Choice object, and still returns null when there is no role');

section('Departments and categories: internal column names');

/* Both lists were imported from spreadsheets: GetItems returns field_1…field_N, never the display
   name. Rows shaped as the Departments export of 26 Sep 2026 and the category matrix return them. */
const DEPT_ROW = { ID: 8, Title: 'Cybersecurity Department', field_1: 'CS', field_2: 'CS@nitda.gov.ng', field_3: 'DCS@nitda.gov.ng', field_4: 'Substantive', field_5: 'person@nitda.gov.ng', field_6: 'DCS' };
const CAT_ROW = { ID: 1, Title: 'GOV TO GOV', field_1: 'GOV', field_2: 'StakeHolder Engagements', field_3: 'STE', field_4: 'SMP', field_5: 'SDO', field_6: 'DGO', field_7: 'CEO', field_8: '', field_9: '5', field_14: 'High' };
for (const [file, dSel, cSel, dGet, cGet] of [
  [FA, 'Select_Departments', 'Select_Categories', 'Get_All_Departments', 'Get_All_Categories'],
]) {
  const flow = load(file).serializedValue;
  const ds = runAction(find(flow, dSel), dGet, { body: { value: [DEPT_ROW] } });
  const d = normalizeDepartment((ds.global.get('Under_Test').outputs?.body || [])[0] || {});
  ok(!ds.templateErrors.length && d.dsuKey === 'CS' && d.email === 'cs@nitda.gov.ng' && d.headEmail === 'dcs@nitda.gov.ng' && d.headTitle === 'DCS', `${file}: a department arrives with its key, mailbox, head mailbox and head title`, JSON.stringify(d));
  ok(d.headPersonalEmail === '', `${file}: the head's personal address is not served`);
  const cs = runAction(find(flow, cSel), cGet, { body: { value: [CAT_ROW] } });
  const c = normalizeCategory((cs.global.get('Under_Test').outputs?.body || [])[0] || {});
  ok(!cs.templateErrors.length && c.category === 'GOV TO GOV' && c.subcategory === 'StakeHolder Engagements' && c.categoryCode === 'GOV' && c.subcategoryCode === 'STE', `${file}: a category arrives with its names and codes`, JSON.stringify(c));
  ok(c.dsuKey === 'SMP' && c.primaryResponsible === 'SMP' && c.supportingDsu === 'SDO' && c.inform.join() === 'DGO,CEO' && c.priority === 'High' && c.timeline === '5', `${file}: a category arrives with its routing units, priority and timeline`, JSON.stringify(c));
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
