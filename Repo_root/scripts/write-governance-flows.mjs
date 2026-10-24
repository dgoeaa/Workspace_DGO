#!/usr/bin/env node
/**
 * The eight governance flows (01–08 GOV): outbox receipts on every mail send (ITEM-66, owner decision 2026-10-07), and the
 * corrected definitions of 02, 03, 05 and 07 (GOV-04: every path answers its caller; GOV-05: the retirement cascade is gated).
 *
 *   node scripts/write-governance-flows.mjs            plan: reads every flow, writes nothing
 *   node scripts/write-governance-flows.mjs --yes      back up, write, read back
 *
 * A corrected definition (surfaces/governance/*.corrected.json) replaces its flow wholesale, so it is applied only when the
 * live flow still matches the export it was derived from (its basedOn file, compared by fingerprint); otherwise the live
 * definition is kept and only the receipts are added. Receipts are added by the same helper as the identification packages
 * (scripts/lib/identification-flow-edit.mjs outboxReceipts). Every write is read back; the read-back must hold every receipt.
 * Needs FOLIO_MS_SESSION and, behind a proxy, NODE_USE_ENV_PROXY=1.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outboxReceipts } from './lib/identification-flow-edit.mjs';
import { validateWiring } from './lib/flow-install.mjs';
import { scopeFingerprint } from './lib/package-fingerprint.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const API = `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/${ENV}`;
const OUT = resolve(arg('--out') || 'flows-update-output');
const YES = process.argv.includes('--yes');
const SP = { id: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connectionName: '3f1943c5955a4cb8b301e8f22f2b590d' };
const GOV = JSON.parse(readFileSync(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json'), 'utf8')).adopted.filter((a) => /^0\d - GOV - /.test(a.name));
const CORR_DIR = join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/surfaces/governance');
const corrected = Object.fromEntries(readdirSync(CORR_DIR).filter((f) => f.endsWith('.corrected.json')).map((f) => { const c = JSON.parse(readFileSync(join(CORR_DIR, f), 'utf8')); return [c.flowId, { ...c, file: f }]; }));

const s = JSON.parse(readFileSync(process.env.FOLIO_MS_SESSION, 'utf8'));
const tok = await (await fetch('https://login.microsoftonline.com/ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1/oauth2/v2.0/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'refresh_token', client_id: s.clientId, refresh_token: s.refreshToken, scope: 'https://service.flow.microsoft.com//.default offline_access openid profile' }) })).json();
if (!tok.access_token) throw new Error(`sign-in: ${tok.error}`);
if (tok.refresh_token) { s.refreshToken = tok.refresh_token; writeFileSync(process.env.FOLIO_MS_SESSION, JSON.stringify(s, null, 2), { mode: 0o600 }); }
const H = { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' };
const api = async (method, path, body) => { const r = await fetch(`${API}${path}?api-version=2016-11-01`, { method, headers: H, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); return { status: r.status, json: t ? JSON.parse(t) : null }; };
const fp = (def) => scopeFingerprint({ actions: def.actions || {} });
const receiptsIn = (def) => { let n = 0; const w = (o) => { for (const [k, a] of Object.entries(o || {})) { if (/^Create_.+_Receipt$/.test(k)) n++; w(a.actions); if (a.else) w(a.else.actions); for (const c of Object.values(a.cases || {})) w(c.actions); if (a.default) w(a.default.actions); } }; w(def.actions); return n; };

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync(OUT, { recursive: true });
const backups = {}, report = { readUtc: new Date().toISOString(), mode: YES ? 'apply' : 'plan', flows: [] };
for (const g of GOV) {
  const live = await api('GET', `/flows/${g.flowId}`);
  if (live.status !== 200) { report.flows.push({ flow: g.name, flowId: g.flowId, status: `READ_${live.status}` }); continue; }
  const p = live.json.properties;
  backups[g.flowId] = { displayName: p.displayName, state: p.state, definition: p.definition, connectionReferences: p.connectionReferences };
  const row = { flow: g.name, flowId: g.flowId, state: p.state, modified: p.lastModifiedTime };
  let def = structuredClone(p.definition);
  const c = corrected[g.flowId];
  if (c) {
    const based = JSON.parse(readFileSync(join(ROOT, c.basedOn), 'utf8'));
    const bdef = based.properties?.definition || based.definition || based;
    row.correction = c.file;
    if (fp(bdef) === fp(p.definition)) { def = structuredClone(c.definition); row.correctionApplied = true; }
    else { row.correctionApplied = false; row.correctionWhy = 'the live flow differs from the export the correction was derived from; receipts only'; }
  }
  const covered = outboxReceipts({ serializedValue: { actions: def.actions } });
  /* A definition spells a connector host connectionName, not the clipboard's connection. */
  const fix = (o) => { for (const a of Object.values(o || {})) { const h = a.inputs?.host; if (a.type === 'OpenApiConnection' && h?.connection && !h.connectionName) { h.connectionName = h.connection; delete h.connection; } fix(a.actions); if (a.else) fix(a.else.actions); for (const cc of Object.values(a.cases || {})) fix(cc.actions); if (a.default) fix(a.default.actions); } };
  fix(def.actions);
  const refs = structuredClone(p.connectionReferences || {});
  if (covered.length && !refs.shared_sharepointonline) refs.shared_sharepointonline = { connectionName: SP.connectionName, source: 'Embedded', id: SP.id, tier: 'NotSpecified', apiName: 'sharepointonline' };
  row.receiptsAdded = covered.length; row.sends = covered;
  row.problems = validateWiring(def);
  row.unchanged = fp(def) === fp(p.definition);
  if (row.problems.length) { row.status = 'BLOCKED'; report.flows.push(row); continue; }
  if (!YES || row.unchanged) { row.status = row.unchanged ? 'UP_TO_DATE' : 'WILL_UPDATE'; report.flows.push(row); continue; }
  writeFileSync(join(OUT, `governance-backup-${stamp}.json`), JSON.stringify(backups, null, 2), { mode: 0o600 });
  const w = await api('PATCH', `/flows/${g.flowId}`, { properties: { definition: def, connectionReferences: refs } });
  row.write = w.status;
  if (w.status >= 300) { row.status = 'FAILED'; row.error = JSON.stringify(w.json).slice(0, 600); report.flows.push(row); break; }
  const back = (await api('GET', `/flows/${g.flowId}`)).json.properties;
  row.readBack = { receipts: receiptsIn(back.definition), fingerprintMatches: fp(back.definition) === fp(def), state: back.state, modified: back.lastModifiedTime };
  row.status = row.readBack.fingerprintMatches && row.readBack.receipts >= covered.length ? 'APPLIED' : 'MISMATCH';
  report.flows.push(row);
  if (row.status !== 'APPLIED') break;
}
writeFileSync(join(OUT, `governance-${YES ? 'apply' : 'plan'}-${stamp}.json`), JSON.stringify(report, null, 2));
for (const r of report.flows) console.log(`${String(r.status).padEnd(12)} ${r.flow.padEnd(52)} receipts+${r.receiptsAdded ?? '-'}${r.correction ? ` correction ${r.correctionApplied ? 'applied' : 'kept aside'}` : ''}${r.error ? ` ${r.error}` : ''}${r.problems?.length ? ` ${r.problems.join('; ')}` : ''}`);
process.exit(report.flows.some((r) => ['FAILED', 'MISMATCH', 'BLOCKED'].includes(r.status)) ? 1 : 0);
