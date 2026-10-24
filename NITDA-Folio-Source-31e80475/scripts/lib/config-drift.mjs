/**
 * The endpoint addresses inside the three deployed config files, read live and compared with the last build.
 *
 * Folio's three front ends each carry a config file of signed trigger URLs:
 *   workspace  config/config.local.js      (DGO_CONFIG; scripts/lib/endpoint-surface.mjs, surface runtime)
 *   portal     CG/config.local.js          (PF_CONFIG;  surface portal)
 *   mailer     the seven DGO_MAIL_* flows   (DGO_MAILER_CONFIG_LOCAL; baked into mailer.html)
 * A URL changes when its flow's trigger is renamed, its key regenerated, or the flow recreated. A deployed file then
 * calls an address that answers 401 or 404. registers/config-build-ledger.json records, for the build last delivered,
 * each key's flow, workflow id and a SHA-256 digest of its URL (the digest of a URL with a 256-bit signature reveals
 * nothing about it). compare() tells which keys no longer match, so a rebuild is suggested exactly when one is needed.
 *
 * `api(method, path)` is the Flow service call of scripts/flows-update.mjs: it answers { ok, status, body }.
 */
import crypto from 'node:crypto';
import { SURFACES } from './endpoint-surface.mjs';

export const MAILER_KEYS = Object.freeze(['MAIL_SEND', 'MAIL_LOG', 'MAIL_DIRECTORY', 'MAIL_TEMPLATES', 'MAIL_PROVISION', 'MAIL_AUTH', 'MAIL_DATA']);
/* Keys left empty by decision, not by fault. SCAN_INTAKE, empty under ITEM-85 while its trigger was tenant-authenticated,
   is served since the owner opened the trigger to anyone (2026-10-08). */
export const EMPTY_BY_DECISION = Object.freeze({
  /* ITEM-88 (owner decision 2026-10-08, "accept all recommended"): AI_Document_Processing has never reached the model, so the
     go-live Workspace carries no AI address and its AI actions answer "unavailable" (D2). Wired again once the flow is rebuilt. */
  'workspace:AI_CHAT': 'ITEM-88: AI flow not working; left out of the go-live build by decision',
  'workspace:AI_DOC_ANALYSIS': 'ITEM-88: AI flow not working; left out of the go-live build by decision',
  'workspace:AI_EMAIL_ANALYSIS': 'ITEM-88: AI flow not working; left out of the go-live build by decision',
});
export const VARIANTS = Object.freeze({
  workspace: { surface: 'runtime', label: 'Folio Workspace', deployedAs: 'config/config.local.js' },
  portal: { surface: 'portal', label: 'Document Portal', deployedAs: 'CG/config.local.js' },
  mailer: { surface: null, label: 'Correspondence Mailer', deployedAs: 'mailer.html (built by the Mailer package from these seven addresses)' },
});

export const digest = (url) => crypto.createHash('sha256').update(String(url)).digest('hex').slice(0, 32);
const workflowOf = (url) => (/\/workflows\/([0-9a-f]{32})\//.exec(url || '') || [])[1] || null;

/** Which adopted flow serves each key of each variant. */
export function keyPlan(adoption) {
  const adopted = adoption.adopted || [];
  const plan = [];
  for (const [variant, v] of Object.entries(VARIANTS)) {
    const keys = v.surface ? SURFACES[v.surface].endpoints.map((e) => e.key) : MAILER_KEYS;
    for (const key of keys) {
      const a = v.surface ? adopted.find((x) => (x.contractKeys || []).includes(key)) : adopted.find((x) => x.name === `DGO_${key}`);
      plan.push({ variant, key, flow: a?.name || null, flowId: a?.flowId || null, emptyByDecision: EMPTY_BY_DECISION[`${variant}:${key}`] || null });
    }
  }
  return plan;
}

/** Read every key's live trigger URL. URLs stay in the returned rows, in memory only: never write them to the repository. */
export async function readLive(api, plan) {
  const flows = new Map();
  const rows = [];
  for (const p of plan) {
    const row = { variant: p.variant, key: p.key, flow: p.flow, flowId: p.flowId };
    if (!p.flowId) { rows.push({ ...row, status: 'NO_ADOPTED_FLOW' }); continue; }
    if (p.emptyByDecision) { rows.push({ ...row, status: 'EMPTY_BY_DECISION', why: p.emptyByDecision }); continue; }
    if (!flows.has(p.flowId)) {
      const f = await api('GET', `/flows/${p.flowId}`);
      const triggers = f.body?.properties?.definition?.triggers || {};
      const name = Object.keys(triggers)[0];
      let url = '';
      if (f.ok && name) {
        const c = await api('POST', `/flows/${p.flowId}/triggers/${encodeURIComponent(name)}/listCallbackUrl`, {});
        url = c.body?.response?.value || c.body?.value || '';
      }
      flows.set(p.flowId, { status: f.status, state: f.body?.properties?.state || null, trigger: name || null, url });
    }
    const f = flows.get(p.flowId);
    const signed = /[?&]sig=[A-Za-z0-9_-]{43}(&|$)/.test(f.url);
    rows.push({ ...row, state: f.state, trigger: f.trigger, workflowId: workflowOf(f.url), url: f.url, digest: f.url ? digest(f.url) : null,
      status: f.status !== 200 ? `READ_${f.status}` : !f.url ? 'NO_URL' : !signed ? 'UNSIGNED' : 'READ' });
  }
  return rows;
}

/** Compare a live read with the ledger. A rebuild is suggested when any deliverable key differs from what was delivered. */
export function compare(live, ledger) {
  const built = new Map(Object.entries(ledger?.variants || {}).flatMap(([variant, keys]) => Object.entries(keys).map(([key, v]) => [`${variant}:${key}`, v])));
  const changes = [];
  for (const r of live) {
    if (r.status === 'EMPTY_BY_DECISION') continue;
    const was = built.get(`${r.variant}:${r.key}`);
    if (r.status !== 'READ') { changes.push({ variant: r.variant, key: r.key, flow: r.flow, change: `cannot be served: ${r.status}` }); continue; }
    if (!was) { changes.push({ variant: r.variant, key: r.key, flow: r.flow, change: 'not in the last build' }); continue; }
    if (was.digest !== r.digest) changes.push({ variant: r.variant, key: r.key, flow: r.flow,
      change: was.workflowId !== r.workflowId ? `now a different workflow (${String(was.workflowId).slice(0, 8)} → ${String(r.workflowId).slice(0, 8)})` : 'address changed (trigger key regenerated or renamed)' });
  }
  const variants = [...new Set(changes.map((c) => c.variant))];
  return { rebuild: changes.length > 0, variants, changes, lastBuild: ledger?.builtUtc || null };
}

/** The ledger entry for a delivered build: digests and workflow ids, never a URL. */
export function ledgerOf(live, { builtUtc, commit, version = '', builds = {} }) {
  const variants = {};
  for (const r of live) {
    if (r.status !== 'READ') continue;
    (variants[r.variant] ||= {})[r.key] = { flow: r.flow, flowId: r.flowId, workflowId: r.workflowId, digest: r.digest };
  }
  return { schema: 'folio-config-build-ledger/v1', builtUtc, commit, ...(version ? { version } : {}), builds,
    note: 'What the last delivered config files hold, per key: flow, workflow id and a SHA-256 digest of the URL. No URL is recorded. npm run config:drift compares the live flows with this; npm run config:rebuild writes new files and this record.',
    emptyByDecision: EMPTY_BY_DECISION, variants };
}

/** One readable verdict. */
export function verdict(result) {
  if (!result.rebuild) return `Config files current: every endpoint address matches the build of ${result.lastBuild || '(no build recorded)'}.`;
  const lines = [`REBUILD SUGGESTED: ${result.changes.length} address(es) differ from the build of ${result.lastBuild || '(no build recorded)'} (${result.variants.map((v) => VARIANTS[v].label).join(', ')}).`];
  for (const c of result.changes) lines.push(`  ${VARIANTS[c.variant].label.padEnd(22)} ${c.key.padEnd(24)} ${c.change}`);
  lines.push('  Rebuild: npm run config:rebuild   (writes new private config files and zips; then redeploy the variants named)');
  return lines.join('\n');
}
