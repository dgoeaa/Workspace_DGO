#!/usr/bin/env node
/**
 * Create Folio_Failure_Watch (owner decision 2026-10-18), or rewrite it whole: its Recurrence trigger and its one scope,
 * Scope_Failure_Watch (scripts/build-identification-phase4.mjs, FAILURE_WATCH). After it, npm run flows:update keeps the
 * scope current.
 *
 *   node scripts/write-failure-watch-flow.mjs [--flow <id>] [--start] [--out DIR] [--yes]
 *
 * Without --flow it creates the flow; with it, it rewrites that flow (backup first). The trigger runs every hour, Monday to
 * Friday, 07:00 to 18:00 West Africa Time (config/notification-failure-groups.config.js FailureWatchDefaults.schedule).
 * The flow is left Stopped unless --start is given. Dry run unless --yes. The read-back must give the package's fingerprint.
 * After creating it: record its id in scripts/lib/flow-artifact-name.mjs FLOW_IDENTITIES (Folio_Failure_Watch) and in the
 * FAILURE_WATCH entry of the builder, and capture it.
 * Needs FOLIO_MS_SESSION (the shared Microsoft sign-in) and, behind a proxy, NODE_USE_ENV_PROXY=1.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPackage, validateWiring } from './lib/flow-install.mjs';
import { packageScope, scopeFingerprint, packageFingerprint } from './lib/package-fingerprint.mjs';
import { FailureWatchDefaults } from '../config/notification-failure-groups.config.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FLOW = arg('--flow');
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const API = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}`;
const OUT = resolve(arg('--out') || 'flows-update-output');
const PKG_DIR = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4');
const NAME = 'Folio_Failure_Watch';

const pkg = JSON.parse(readFileSync(join(PKG_DIR, readdirSync(PKG_DIR).find((f) => f.startsWith(`NOKEY__${NAME}__`))), 'utf8'));
pkg.serializedValue = packageScope(pkg);
const S = FailureWatchDefaults.schedule;
const TRIGGERS = { Recurrence: { type: 'Recurrence', recurrence: { frequency: S.frequency, interval: S.interval, timeZone: S.timeZone, schedule: { weekDays: S.weekDays, hours: S.hours.map(String), minutes: [5] } } } };
const skeleton = { $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '1.0.0.0',
  parameters: { $connections: { defaultValue: {}, type: 'Object' }, $authentication: { defaultValue: {}, type: 'SecureObject' } },
  triggers: TRIGGERS, actions: { [pkg.nodeId]: { type: 'Scope', actions: {}, runAfter: {} } } };

const s = JSON.parse(readFileSync(process.env.FOLIO_MS_SESSION, 'utf8'));
const tok = await (await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: 'https://service.flow.microsoft.com//.default offline_access openid profile' }) })).json();
if (!tok.access_token) throw new Error(`sign-in: ${tok.error}`);
if (tok.refresh_token) { s.refreshToken = tok.refresh_token; writeFileSync(process.env.FOLIO_MS_SESSION, JSON.stringify(s, null, 2), { mode: 0o600 }); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const api = async (method, path, body) => { const r = await fetch(`${API}${path}?api-version=2016-11-01`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null }; };

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT, { recursive: true });
let base = { definition: skeleton, connectionReferences: {} };
if (FLOW) {
  const live = await api('GET', `/flows/${FLOW}`);
  if (live.status !== 200) throw new Error(`read ${live.status}`);
  writeFileSync(join(OUT, `failure-watch-backup-${stamp}.json`), JSON.stringify({ flowId: FLOW, ...live.json.properties }, null, 2), { mode: 0o600 });
  base = { definition: { ...live.json.properties.definition, actions: skeleton.actions }, connectionReferences: live.json.properties.connectionReferences };
}
const out = installPackage({ definition: base.definition, connectionReferences: base.connectionReferences, pkg, mode: 'scope', triggers: TRIGGERS });
const problems = [...out.problems, ...validateWiring(out.definition)];
if (problems.length) { console.log('REFUSED before writing:', problems.join('; ')); process.exit(1); }
const want = packageFingerprint(pkg);
const report = { flow: NAME, flowId: FLOW || '(new)', readUtc: new Date().toISOString(), trigger: TRIGGERS.Recurrence, fingerprint: want, connections: Object.keys(out.connectionReferences) };
if (!process.argv.includes('--yes')) { console.log(JSON.stringify(report, null, 1)); console.log('Dry run. Add --yes to write.'); process.exit(0); }

const body = { properties: { displayName: NAME, definition: out.definition, connectionReferences: out.connectionReferences, state: 'Stopped' } };
const w = FLOW ? await api('PATCH', `/flows/${FLOW}`, { properties: { definition: out.definition, connectionReferences: out.connectionReferences } }) : await api('POST', '/flows', body);
report.write = w.status;
if (w.status >= 300) { report.error = JSON.stringify(w.json).slice(0, 800); writeFileSync(join(OUT, `failure-watch-write-${stamp}.json`), JSON.stringify(report, null, 2)); console.log('REFUSED', w.status, report.error); process.exit(1); }
const id = FLOW || w.json.name;
report.flowId = id;
report.state = { op: process.argv.includes('--start') ? 'start' : 'stop', status: (await api('POST', `/flows/${id}/${process.argv.includes('--start') ? 'start' : 'stop'}`, {})).status };
const back = (await api('GET', `/flows/${id}`)).json.properties;
report.readBack = { state: back.state, fingerprint: scopeFingerprint(back.definition.actions[pkg.nodeId]), trigger: back.definition.triggers.Recurrence?.recurrence };
report.readBack.matches = report.readBack.fingerprint === want;
writeFileSync(join(OUT, `failure-watch-write-${stamp}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
process.exit(report.readBack.matches ? 0 : 1);
