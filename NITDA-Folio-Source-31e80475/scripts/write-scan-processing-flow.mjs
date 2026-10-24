#!/usr/bin/env node
/**
 * Write the rebuilt library intake (ITEM-80) into Folio_Incoming_Correspondence_Scan_Processing_Flow, whole.
 *
 * npm run flows:update replaces a top-level scope the flow already has; this flow holds only a placeholder, so its first
 * write is the whole definition: the flow's own OneDrive trigger, the six variable declarations of the legacy flow and the
 * package's Scope_Scan_Processing (scripts/build-identification-phase4.mjs, SCAN_PROCESSING). After it, flows:update keeps
 * the scope current.
 *
 *   node scripts/write-scan-processing-flow.mjs [--folder <OneDrive folder id>] [--folder-path <label>]
 *                                               [--onedrive-connection <connection name>] [--out DIR] [--yes]
 *
 * --folder sets the trigger's folder and turns the flow on. Since 2026-10-16 (owner) it is /E-DOCUMENT STATION, where the
 * scanner saves; the registry OneDrive's /Scans/Incoming cannot take scans, because its library has reached SharePoint's
 * limit on shared items and every scan needs an edit link (evidence/2026-10-16-first-scan-run.json). --folder-path is the
 * folder's name as the designer shows it (default /Scans/Incoming). --onedrive-connection binds the flow's OneDrive steps,
 * trigger included, to the connection that reaches that folder (the one DGSO INCOMING AI PROCESSING's trigger uses).
 * Without it the trigger keeps its current folder and the flow is left Stopped, so it cannot process files that land
 * anywhere else. Backup before the write, read-back after it; the read-back must give the package's fingerprint.
 * Needs FOLIO_MS_SESSION (the shared Microsoft sign-in) and, behind a proxy, NODE_USE_ENV_PROXY=1.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installPackage, validateWiring } from './lib/flow-install.mjs';
import { packageScope, scopeFingerprint, packageFingerprint } from './lib/package-fingerprint.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FLOW = '197527c8-e76c-4f7d-81b8-3cb5c88b1c6c';
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const TENANT = 'ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const API = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}`;
const OUT = resolve(arg('--out') || 'flows-update-output');
const FOLDER = arg('--folder');
const FOLDER_PATH = arg('--folder-path') || '/Scans/Incoming';
const ONEDRIVE = arg('--onedrive-connection');
const PKG_DIR = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4');
const CAPS = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/captures');

const pkg = JSON.parse(readFileSync(join(PKG_DIR, readdirSync(PKG_DIR).find((f) => f.startsWith('NOKEY__Folio_Incoming_Correspondence_Scan_Processing_Flow__'))), 'utf8'));
pkg.serializedValue = packageScope(pkg);
/* The six declarations, in the legacy flow's order, from its capture. */
const legacy = JSON.parse(readFileSync(join(CAPS, readdirSync(CAPS).find((f) => f.startsWith('_DGSO_INCOMING_AI_PROCESSING__'))), 'utf8').replace(/^﻿/, '')).Definition.actions;
const decl = Object.entries(legacy).filter(([, a]) => a.type === 'InitializeVariable');
const ordered = []; let prev = null;
while (ordered.length < decl.length) {
  const next = decl.find(([n, a]) => !ordered.some(([m]) => m === n) && (prev ? a.runAfter?.[prev] : !Object.keys(a.runAfter || {}).length));
  if (!next) throw new Error('the legacy declarations do not form one chain');
  ordered.push(next); prev = next[0];
}
const declarations = Object.fromEntries(ordered.map(([n, a], i) => [n, { ...a, runAfter: i ? { [ordered[i - 1][0]]: ['Succeeded'] } : {} }]));

const s = JSON.parse(readFileSync(process.env.FOLIO_MS_SESSION, 'utf8'));
const tok = await (await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: 'https://service.flow.microsoft.com//.default offline_access openid profile' }) })).json();
if (!tok.access_token) throw new Error(`sign-in: ${tok.error}`);
if (tok.refresh_token) { s.refreshToken = tok.refresh_token; writeFileSync(process.env.FOLIO_MS_SESSION, JSON.stringify(s, null, 2), { mode: 0o600 }); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const api = async (method, path, body) => { const r = await fetch(`${API}${path}?api-version=2016-11-01`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null }; };

const live = await api('GET', `/flows/${FLOW}`);
if (live.status !== 200) throw new Error(`read ${live.status}`);
const props = live.json.properties;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT, { recursive: true });
const backup = join(OUT, `scan-processing-backup-${stamp}.json`);
writeFileSync(backup, JSON.stringify({ flowId: FLOW, displayName: props.displayName, state: props.state, definition: props.definition, connectionReferences: props.connectionReferences }, null, 2), { mode: 0o600 });

const trig = structuredClone(props.definition.triggers);
const tn = Object.keys(trig)[0];
if (trig[tn]?.inputs?.host?.operationId !== 'OnNewFilesV2') throw new Error(`the flow's trigger is not the OneDrive OnNewFilesV2 trigger (${tn})`);
if (FOLDER) { trig[tn].inputs.parameters.folderId = FOLDER; trig[tn].metadata = { ...(trig[tn].metadata || {}), [FOLDER]: FOLDER_PATH }; }
const out = installPackage({ definition: props.definition, connectionReferences: props.connectionReferences, pkg, declarations, mode: 'body', triggers: trig });
if (ONEDRIVE) {
  const ref = out.connectionReferences.shared_onedriveforbusiness;
  if (!ref) throw new Error('the flow has no shared_onedriveforbusiness connection reference');
  out.connectionReferences.shared_onedriveforbusiness = { ...ref, connectionName: ONEDRIVE };
}
const problems = [...out.problems, ...validateWiring(out.definition)];
if (problems.length) { console.log('REFUSED before writing:', problems.join('; ')); process.exit(1); }
const want = packageFingerprint(pkg);
const report = { flowId: FLOW, flow: props.displayName, readUtc: new Date().toISOString(), backup: backup.split('/').pop(), before: { state: props.state, actions: Object.keys(props.definition.actions), folderId: props.definition.triggers[tn].inputs.parameters.folderId },
  package: { file: readdirSync(PKG_DIR).find((f) => f.startsWith('NOKEY__Folio_Incoming')), fingerprint: want }, declarations: Object.keys(declarations), folderSet: !!FOLDER, folderPath: FOLDER ? FOLDER_PATH : null,
  onedrive: { before: String(props.connectionReferences.shared_onedriveforbusiness?.connectionName).slice(0, 32), after: String(out.connectionReferences.shared_onedriveforbusiness?.connectionName).slice(0, 32) } };
if (!process.argv.includes('--yes')) { console.log(JSON.stringify(report, null, 1)); console.log('Dry run. Add --yes to write.'); process.exit(0); }

const w = await api('PATCH', `/flows/${FLOW}`, { properties: { definition: out.definition, connectionReferences: out.connectionReferences } });
report.write = w.status;
if (w.status >= 300) { report.error = JSON.stringify(w.json).slice(0, 800); writeFileSync(join(OUT, `scan-processing-write-${stamp}.json`), JSON.stringify(report, null, 2)); console.log('REFUSED', w.status, report.error); process.exit(1); }
const target = FOLDER ? 'start' : 'stop';
report.state = { op: target, status: (await api('POST', `/flows/${FLOW}/${target}`, {})).status };
const back = await api('GET', `/flows/${FLOW}`);
const bp = back.json.properties;
report.readBack = { state: bp.state, modified: bp.lastModifiedTime, fingerprint: scopeFingerprint(bp.definition.actions.Scope_Scan_Processing), declarations: Object.keys(bp.definition.actions).filter((n) => bp.definition.actions[n].type === 'InitializeVariable'),
  folderId: bp.definition.triggers[tn].inputs.parameters.folderId, connections: Object.fromEntries(Object.entries(bp.connectionReferences).map(([k, v]) => [k, String(v.connectionName).slice(0, 12)])) };
report.readBack.matches = report.readBack.fingerprint === want;
writeFileSync(join(OUT, `scan-processing-write-${stamp}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
process.exit(report.readBack.matches ? 0 : 1);
