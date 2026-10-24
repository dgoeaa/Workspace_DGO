/* GOV-01 to GOV-08: their e-mail bodies become the GV-* designs of the e-mail template package (finding F3, ITEM-92), as
 * a pure function.
 *
 * The GOV flows are not built from identification packages. This transform is applied to each definition read live
 * from the tenant (scripts/govmail-update.mjs) and is checked against the deployed definitions
 * (tests/govmail-fix.test.mjs). For every send it changes only the HTML the send's body reads; recipients, subjects,
 * attachments and everything else stay. Each value is the expression the flow's own HTML already printed. A body is
 * chosen by the outcome the flow already computes (Succeeded, Failed, TimedOut; escalated after three days; severity),
 * one Compose per design and one that picks. It refuses, and writes nothing, when a flow does not look as expected.
 * A flow converted before is refreshed: each design Compose takes the current design (the package revision of
 * 2026-10-21, ITEM-93), and nothing else changes.
 *
 * Designs: docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/email/GV-*.html.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { actionsByName } from './gov04-fix.mjs';
import { firstDiff, withoutServiceAdded } from './flow-bulk-update.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DESIGNS = 'docs/folio-Master-Flows-and-Endpoints/email-templates/01-Templates/email';
export const ADMIN = 'https://folio-platform.page.gd/?notice=';
export const REGISTRY_LINK = `${ADMIN}http-flow-registry&record=`;
export const EXCEPTION_LINK = `${ADMIN}http-flow-registry-exception&record=`;
export const MARK = 'folio-template';

export const FLOWS = Object.freeze({
  '17a85efb-1ed2-45c9-a602-2ad6f8bb7ead': '01 - GOV - Provision HTTP Flow Registry',
  '651ae389-eeed-4bf0-9799-67bd964ebe71': '02 - GOV - Register HTTP Flow Truth',
  '0545e19a-c34a-45db-bd11-27b87a34973e': '03 - GOV - Record HTTP Flow Execution',
  '3e9e1342-5027-4c0f-bdd3-1e06aa7f2a3b': '04 - GOV - Audit HTTP Flow Registry',
  '493b4ab7-8f63-4fab-8121-746c2cac7f98': '05 - GOV - Retire HTTP Flow',
  '87a74d7e-7435-4e34-baa1-7e759ebf5565': '06 - GOV - Registry Exception Notification',
  'c6a011c5-7b11-4241-82ae-a45b88ebf276': '07 - GOV - Consumer HTTP Self-Registration Template',
  'f5e7679f-ca1b-4216-8a6e-bb6c044ed06f': '08 - GOV - Discover and Register HTTP Consumers',
});

const clone = (v) => JSON.parse(JSON.stringify(v));
const esc = (e) => `replace(replace(replace(replace(replace(string(${e}),'&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),'''','&#39;')`;
const lit = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* A design, with its run of sample rows collapsed to one row pattern. Since the package of 2026-10-21 the last sample
   row drops its bottom rule, so rows count as the same when they differ only by that rule; the pattern keeps it. */
const RULE = 'border-bottom:1px solid #E8E6E7;';
function design(id) {
  let html = fs.readFileSync(path.join(ROOT, DESIGNS, `${id}.html`), 'utf8').trim();
  let row = null;
  html = html.replace(/(?:\s*<tr>(?:(?!<\/?tr\b)[\s\S])*?\{\{row\.(?:(?!<\/?tr\b)[\s\S])*<\/tr>)+/g, (run) => {
    const rows = run.match(/<tr>[\s\S]*?<\/tr>/g);
    if (rows.length < 2 || rows.some((r) => r.split(RULE).join('') !== rows[0].split(RULE).join(''))) return run;
    if (row) throw new Error(`${id}: two row lists`);
    row = rows[0];
    return '<!--ROWS-->';
  });
  if (/\{\{row\./.test(html)) throw new Error(`${id}: a sample row is left outside the row list`);
  return { id, html, row };
}

/* One body: every {{x}} becomes @{<expression>}; rows are written out, one per entry. `status` makes a design's fixed
   status words follow the flow's outcome (a failed design used for TimedOut). */
function body(id, values, rows = null, status = null) {
  const d = design(id);
  let html = d.html;
  if (d.row) {
    if (!rows) throw new Error(`${id}: rows expected`);
    html = html.replace('<!--ROWS-->', rows.map((r) => d.row.replace(/\{\{row\.(\w+)\}\}/g, (_, k) => {
      if (!(k in r)) throw new Error(`${id}: no row.${k}`);
      return r[k].lit !== undefined ? lit(r[k].lit) : `@{${r[k]}}`;
    })).join(''));
  } else if (rows) throw new Error(`${id}: the design has no row list`);
  if (status) {
    const before = html;
    html = html.replace(/>([^<]*?)\bFailed\b/g, (m, pre) => (/^\s*$/.test(pre) || /[·:]\s*$|&nbsp;\s*$/.test(pre) ? `>${pre}@{${status}}` : m));
    if (html === before) throw new Error(`${id}: no status word to follow the outcome`);
  }
  html = html.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (k === 'year') return "@{formatDateTime(utcNow(),'yyyy')}";
    if (!(k in values)) throw new Error(`${id}: no value for {{${k}}}`);
    return `@{${values[k]}}`;
  });
  return html;
}

/* The flows' report shapes. */
function runReport(json, J) {
  const k = json.inputs;
  for (const key of ['flow', 'runId', 'runUrl', 'generatedAtUtc', 'status', 'details']) if (!(key in k)) throw new Error(`Compose_Final_Report_JSON has no ${key}`);
  const rows = Object.keys(k.details).map((key) => ({ key: { lit: key }, value: `string(${J}?['details']?['${key}'])` }));
  const v = { flowName: `${J}?['flow']`, runId: `${J}?['runId']`, runUrl: `${J}?['runUrl']`, timestamp: `${J}?['generatedAtUtc']` };
  return [
    { id: 'GV-Run-Report--failed', when: `equals(${J}?['status'],'Failed')`, html: body('GV-Run-Report--failed', v, rows) },
    { id: 'GV-Run-Report--timed-out', when: `equals(${J}?['status'],'TimedOut')`, html: body('GV-Run-Report--timed-out', v, rows) },
    { id: 'GV-Run-Report', html: body('GV-Run-Report', v, rows) },
  ];
}
function provisioningReport(json, J) {
  const k = json.inputs;
  for (const key of ['flow', 'timing', 'validation', 'status']) if (!(key in k)) throw new Error(`GOV-01 Compose_Final_Report_JSON has no ${key}`);
  const V = (x) => `string(${J}?['validation']?['${x}'])`;
  const errors = `if(equals(int(coalesce(${J}?['validation']?['errorCount'],0)),0),'None',string(${J}?['errors']))`;
  const ok = { runId: `${J}?['flow']?['runId']`, runUrl: `${J}?['flow']?['runUrl']`, timestamp: `${J}?['timing']?['completedUtc']`,
    validatedLists: V('validatedLists'), validatedListSettings: V('validatedListSettings'), validatedUniqueKeys: V('validatedUniqueKeys'),
    validatedSeeds: V('validatedSeeds'), validatedViews: V('validatedViews'), errorCount: V('errorCount') };
  const rows = [
    ['Lists', 'validatedLists'], ['List settings', 'validatedListSettings'], ['Unique keys', 'validatedUniqueKeys'],
    ['Seeds', 'validatedSeeds'], ['Views', 'validatedViews'], ['Errors', 'errorCount'],
  ].map(([label, key]) => ({ key: { lit: label }, value: V(key) })).concat([{ key: { lit: 'Errors and mismatches' }, value: errors }]);
  const failed = { flowName: `${J}?['flow']?['displayName']`, runId: ok.runId, runUrl: ok.runUrl, timestamp: ok.timestamp };
  return [
    { id: 'GV-Run-Report--gov01-provisioning', when: `equals(${J}?['status'],'Succeeded')`, html: body('GV-Run-Report--gov01-provisioning', ok, [{ key: { lit: 'Errors and mismatches' }, value: errors }]) },
    { id: 'GV-Run-Report--timed-out', when: `equals(${J}?['status'],'TimedOut')`, html: body('GV-Run-Report--timed-out', failed, rows) },
    { id: 'GV-Run-Report--failed', html: body('GV-Run-Report--failed', failed, rows, `${J}?['status']`) },
  ];
}
function executionReport(json, E) {
  const k = json.inputs;
  if (!k.outcome?.actionStatuses || !k.run || !k.flow || !k.reportMetadata) throw new Error('Compose_Execution_Report_JSON is not the execution report shape');
  const rows = Object.keys(k.outcome.actionStatuses).map((n) => ({ name: { lit: n }, status: `string(${E}?['outcome']?['actionStatuses']?['${n}'])` }));
  const v = { flowDisplayName: `${E}?['flow']?['displayName']`, runId: `${E}?['run']?['runId']`, environmentId: `${E}?['flow']?['environmentId']`,
    generatedAtUtc: `${E}?['reportMetadata']?['generatedAtUtc']`, elapsedMilliseconds: `string(${E}?['run']?['elapsedMilliseconds'])`, runUrl: `${E}?['run']?['runUrl']` };
  return [
    { id: 'GV-Execution-Report', when: `equals(${E}?['outcome']?['overallStatus'],'Succeeded')`, html: body('GV-Execution-Report', v, rows) },
    { id: 'GV-Execution-Report--failed', html: body('GV-Execution-Report--failed', v, rows, `${E}?['outcome']?['overallStatus']`) },
  ];
}

/* GOV-04's alerts read the registry row of the loop (item()); the reminders the exception they found. */
const OWNER = "coalesce(item()?['TechnicalOwnerEmail'],'dgsRegistry@nitda.gov.ng')";
const FLOW_NAME = "coalesce(item()?['FlowName'],item()?['FlowId'])";
const ESCALATED = (find) => `greaterOrEquals(div(sub(ticks(utcNow()),ticks(first(body('${find}')?['value'])?['DetectedUtc'])),864000000000),3)`;
const REC = "first(body('Get_Recovery_Registry_Record')?['value'])";
const gov04 = {
  Compose_Stale_Owner_Notification_HTML: () => [{ id: 'GV-Stale-Alert', html: body('GV-Stale-Alert', {
    flowName: FLOW_NAME, flowId: "item()?['FlowId']", lastSeenUtc: "string(item()?['LastSeenUtc'])", registryKey: "item()?['RegistryKey']",
    technicalOwnerEmail: OWNER, nowUtc: 'utcNow()', registryRecordUrl: `concat('${REGISTRY_LINK}',string(item()?['Id']))` }) }],
  Compose_Stale_Reminder_HTML: () => reminder('Stale', 'Find_Exception'),
  Compose_Failure_Owner_Notification_HTML: () => [{ id: 'GV-Failing-Alert', html: body('GV-Failing-Alert', {
    flowName: FLOW_NAME, flowId: "item()?['FlowId']", consecutiveFailures: "string(item()?['ConsecutiveFailures'])", registryKey: "item()?['RegistryKey']",
    technicalOwnerEmail: OWNER, nowUtc: 'utcNow()', registryRecordUrl: `concat('${REGISTRY_LINK}',string(item()?['Id']))` }) }],
  Compose_Failure_Reminder_HTML: () => reminder('Failing', 'Find_Failure_Exception'),
  Compose_Recovery_Notification_HTML: () => [{ id: 'GV-Recovered', html: body('GV-Recovered', {
    flowName: `${REC}?['FlowName']`, registryKey: "item()?['RegistryKey']", exceptionType: "item()?['ExceptionType']",
    technicalOwnerEmail: `coalesce(${REC}?['TechnicalOwnerEmail'],'dgsRegistry@nitda.gov.ng')`, nowUtc: 'utcNow()',
    registryRecordUrl: `concat('${REGISTRY_LINK}',string(${REC}?['Id']))` }) }],
};
function reminder(kind, find) {
  const v = { flowName: FLOW_NAME, detectedUtc: `first(body('${find}')?['value'])?['DetectedUtc']`, registryKey: "item()?['RegistryKey']",
    technicalOwnerEmail: OWNER, nowUtc: 'utcNow()', registryRecordUrl: `concat('${REGISTRY_LINK}',string(item()?['Id']))` };
  return [
    { id: `GV-${kind}-Escalation--escalated`, when: ESCALATED(find), html: body(`GV-${kind}-Escalation--escalated`, v) },
    { id: `GV-${kind}-Escalation`, html: body(`GV-${kind}-Escalation`, v) },
  ];
}
const SEV = "toLower(trim(string(coalesce(item()?['Severity'],''))))";
function exceptionMail() {
  const I = (k) => esc(`coalesce(item()?['${k}'],'')`);
  const v = { SEVERITY: esc("toUpper(coalesce(item()?['Severity'],'UNKNOWN'))"), severity: esc(SEV), exceptionType: I('ExceptionType'),
    exceptionKey: I('ExceptionKey'), registryKey: I('RegistryKey'), flowId: I('FlowId'), runId: I('RunId'), detectedUtc: I('DetectedUtc'),
    details: I('Details'), assignedToEmail: esc("coalesce(item()?['AssignedToEmail'],'dgsRegistry@nitda.gov.ng')"),
    registryRecordUrl: `concat('${EXCEPTION_LINK}',string(item()?['Id']))` };
  return [
    { id: 'GV-Registry-Exception', when: `or(equals(${SEV},'critical'),equals(${SEV},'high'))`, html: body('GV-Registry-Exception', v) },
    { id: 'GV-Registry-Exception--medium-low', html: body('GV-Registry-Exception--medium-low', v) },
  ];
}

/* One Compose per design, chained after what the HTML step ran after, and the HTML step picks among them. */
const variantName = (htmlName, id) => `${htmlName}_${id.replace(/^GV-/, '').replace(/[^A-Za-z0-9]+/g, '_')}`;
function place(container, htmlName, variants) {
  const target = container[htmlName];
  let after = target.runAfter || {};
  const names = variants.map((v) => variantName(htmlName, v.id));
  variants.forEach((v, i) => {
    if (container[names[i]]) throw new Error(`${names[i]} already exists`);
    container[names[i]] = { type: 'Compose', runAfter: after, inputs: v.html };
    after = { [names[i]]: ['Succeeded'] };
  });
  const pick = variants.slice(0, -1).reduceRight((acc, v, i) => `if(${v.when},outputs('${names[i]}'),${acc})`, `outputs('${names[names.length - 1]}')`);
  target.inputs = `@${pick}`;
  target.runAfter = after;
  return names;
}

/* Every container (an actions map) holding `name`, however deeply nested. */
function containersOf(actions, name, out = []) {
  for (const a of Object.values(actions || {})) {
    if (!a || typeof a !== 'object') continue;
    for (const kids of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions]) {
      if (kids && kids[name]) out.push(kids);
      containersOf(kids, name, out);
    }
  }
  return out;
}

/* The designs of one converted HTML step, from the same builders the conversion used; null for a step it does not know. */
function variantsOf(htmlName, holder, all, label) {
  if (htmlName === 'Compose_Exception_Email_HTML') return exceptionMail();
  if (gov04[htmlName]) return gov04[htmlName]();
  if (htmlName === 'Compose_Final_Report_HTML' || htmlName === 'Compose_Execution_Report_HTML') {
    const jsonName = htmlName.replace('_HTML', '_JSON');
    const json = holder[jsonName] || all[jsonName];
    if (!json || json.type !== 'Compose' || typeof json.inputs !== 'object') throw new Error(`${jsonName} is missing or not an object`);
    const J = `outputs('${jsonName}')`;
    return htmlName === 'Compose_Execution_Report_HTML' ? executionReport(json, J) : label.startsWith('01 ') ? provisioningReport(json, J) : runReport(json, J);
  }
  return null;
}
/* A flow converted before: each design Compose takes the current design's HTML. Only those inputs change; the picks,
   recipients and subjects stay. A design set that no longer matches the flow's Composes is a problem, not a rebuild. */
function refresh(def, all, label, changes, problems) {
  const holders = [def.actions];
  (function walk(actions) {
    for (const a of Object.values(actions || {})) {
      if (!a || typeof a !== 'object') continue;
      for (const kids of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions), a.default?.actions]) if (kids) { holders.push(kids); walk(kids); }
    }
  })(def.actions);
  for (const holder of holders) {
    for (const htmlName of Object.keys(holder)) {
      let variants;
      try { variants = variantsOf(htmlName, holder, all, label); } catch (e) { problems.push(`${htmlName}: ${e.message}`); continue; }
      if (!variants) continue;
      const names = variants.map((v) => variantName(htmlName, v.id));
      const placed = Object.keys(holder).filter((n) => n.startsWith(`${htmlName}_`) && holder[n]?.type === 'Compose');
      if (names.some((n) => !holder[n]) || placed.some((n) => !names.includes(n))) {
        problems.push(`${htmlName}: the design set changed (${names.join(', ')}); re-convert this flow`);
        continue;
      }
      variants.forEach((v, i) => {
        if (holder[names[i]].inputs === v.html) return;
        holder[names[i]].inputs = v.html;
        changes.push(`${names[i]}: design refreshed (${v.id})`);
      });
    }
  }
}

/* Returns { definition, changes, already, problems }. `problems` non-empty means: do not write. A flow converted before
   is refreshed to the current designs. */
export function fixGovMail(definition, flowId) {
  const def = clone(definition);
  const changes = [];
  const problems = [];
  const label = FLOWS[flowId];
  if (!label) return { definition: def, changes, already: false, problems: [`${flowId} is not a GOV flow this change knows`] };
  const all = actionsByName(def.actions);
  const sends = Object.entries(all).filter(([, a]) => a?.type === 'OpenApiConnection' && /SendEmail/.test(a.inputs?.host?.operationId || ''));
  if (!sends.length) problems.push(`${label} has no send`);
  if (sends.every(([, a]) => JSON.stringify(a.inputs).includes(MARK)) || Object.values(all).some((a) => typeof a?.inputs === 'string' && a.inputs.includes(`name="${MARK}"`))) {
    refresh(def, all, label, changes, problems);
    return { definition: def, changes, already: !problems.length && !changes.length, problems };
  }
  const done = new Set();
  for (const [sendName] of sends) {
    for (const holder of [def.actions, ...containersOf(def.actions, sendName)].filter((c) => c[sendName])) {
      const send = holder[sendName];
      const b = send.inputs?.parameters?.['emailMessage/Body'];
      try {
        const m = /^@outputs\('(\w+)'\)$/.exec(b || '');
        if (sendName === 'Send_Exception_Email') {
          if (!/^@concat\('<!DOCTYPE html>/.test(b || '') || !b.includes('DGO Registry Exception')) throw new Error('its body is not the exception notice this change replaces');
          const html = 'Compose_Exception_Email_HTML';
          if (holder[html]) throw new Error(`${html} already exists`);
          holder[html] = { type: 'Compose', runAfter: send.runAfter || {}, inputs: '' };
          const names = place(holder, html, exceptionMail());
          send.runAfter = { [html]: ['Succeeded'] };
          send.inputs.parameters['emailMessage/Body'] = `@outputs('${html}')`;
          changes.push(`${sendName}: ${names.length} designs (GV-Registry-Exception by severity), "Open in the Folio Admin Suite" linking the exception`);
          continue;
        }
        if (!m || !holder[m[1]] || holder[m[1]].type !== 'Compose') throw new Error(`its body is not a Compose beside it (${String(b).slice(0, 60)})`);
        const htmlName = m[1];
        if (done.has(holder[htmlName])) continue;
        done.add(holder[htmlName]);
        let variants;
        if (gov04[htmlName]) {
          if (!String(holder[htmlName].inputs).includes(REGISTRY_LINK)) throw new Error(`${htmlName} does not carry the Admin Suite link: run npm run gov04:update first`);
          variants = gov04[htmlName]();
        } else if (htmlName === 'Compose_Final_Report_HTML' || htmlName === 'Compose_Execution_Report_HTML') {
          const jsonName = htmlName.replace('_HTML', '_JSON');
          const json = holder[jsonName] || all[jsonName];
          if (!json || json.type !== 'Compose' || typeof json.inputs !== 'object') throw new Error(`${jsonName} is missing or not an object`);
          const J = `outputs('${jsonName}')`;
          variants = htmlName === 'Compose_Execution_Report_HTML' ? executionReport(json, J)
            : label.startsWith('01 ') ? provisioningReport(json, J) : runReport(json, J);
        } else throw new Error(`${htmlName} is not an HTML step this change knows`);
        const names = place(holder, htmlName, variants);
        changes.push(`${sendName}: ${names.length} design${names.length > 1 ? 's' : ''} (${variants.map((v) => v.id).join(', ')})`);
      } catch (e) {
        problems.push(`${sendName}: ${e.message}`);
      }
    }
  }
  return { definition: def, changes, already: false, problems };
}

/* Where the definition read back differs from the one sent, or null. Compared as flows:update compares: key order,
   metadata, an empty runAfter and the authentication the service adds to a connector step are not differences. */
export function storedDiff(stored, sent) {
  return stored ? firstDiff(withoutServiceAdded(stored, sent), sent) : 'the flow could not be read back';
}
