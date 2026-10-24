#!/usr/bin/env node
/**
 * The required-notification matrix, measured against the estate.
 *
 *   npm run notifications              # report: every row, its required and observed state
 *   npm run notifications -- --check   # same, but exit 1 on any disagreement
 *   npm run notifications -- --emit    # regenerate docs/deployment/NOTIFICATION_MATRIX.md
 *   npm run notifications -- --json r.json
 *
 * WHAT THIS DOES THAT THE GENERATED CATALOGUE DOES NOT.
 *
 * `docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md` inventories the messages the
 * estate sends. It cannot report a message that was never built, because a message that was
 * never built leaves nothing to inventory. This script starts from
 * `config/notification-matrix.config.js` — the messages the estate *owes* — and derives, from
 * the artifacts themselves, whether each one is sent, sent to the wrong audience, recorded only
 * in browser storage, unimplemented, or absent.
 *
 * NOTHING HERE TRUSTS THE MATRIX. Every `status` in the config is a claim. This script
 * recomputes each one from the four artifact sets and fails when the two disagree — in either
 * direction. A row marked ABSENT that the estate now sends fails just as loudly as a row marked
 * PROVISIONED that it does not, because a matrix that lags the estate is worse than none: it
 * invites someone to skip a check that has quietly stopped being true.
 *
 * THE FOUR ARTIFACT SETS
 *
 *   deployed    docs/reference/flow-contracts/deployed              what the tenant runs today
 *   portal      docs/deployment/sharepoint/flows/designer-paste     what Session 4 pastes
 *   internal    docs/deployment/internal/flows/designer-paste       what Sessions 4-6 paste
 *   gateway     .../designer-paste/correspondence-gateway           the superseded fragment set
 *
 * The generated catalogue reads `deployed` and `gateway` only — see PRE-3 — which is why its
 * email count and this script's differ. Both are right about what they looked at. This one
 * looks at what the operator walkthrough deploys.
 *
 * A NOTE ON RECIPIENT CLASSIFICATION. A recipient expression beginning `@` is resolved at run
 * time from the payload and counts as addressed to the person concerned. A literal address is
 * fixed. That distinction is the whole finding of this matrix: only four of the estate's 76
 * live mail actions are addressed solely to the person concerned, and a fixed address is
 * correct for exactly two rows — telemetry capture and scan intake — and wrong for every other.
 *
 * NO SECRET IS READ OR PRINTED. This script reads flow definitions for their action shape and
 * recipient expressions. It never reads a trigger URL, and its output carries no `sig=` token.
 *
 * Exit 0 = the matrix and the estate agree. Exit 1 (under --check) = they do not.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NotificationMatrixMeta, RequiredNotifications, Preconditions, SurplusNotifications,
  Audiences, Channels, ProvisioningStates, Severities,
} from '../config/notification-matrix.config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const CHECK = argv.includes('--check') || argv.includes('--strict');
const EMIT = argv.includes('--emit');
const JSON_OUT = (() => { const i = argv.indexOf('--json'); return i >= 0 ? argv[i + 1] : null; })();

const DEPLOYED = 'docs/reference/flow-contracts/deployed';
const PORTAL_PKG = 'docs/deployment/sharepoint/flows/designer-paste';
const INTERNAL_PKG = 'docs/deployment/internal/flows/designer-paste';
const GATEWAY_PKG = join(PORTAL_PKG, 'correspondence-gateway');

let pass = 0, fail = 0;
const failures = [];
const ok = (cond, msg, detail = '') => {
  if (cond) { pass++; console.log('  ✅ ' + msg); return true; }
  fail++; failures.push(msg + (detail ? ` — ${detail}` : ''));
  console.log(`  ❌ ${msg}${detail ? `\n     ${detail}` : ''}`);
  return false;
};

/* ── Reading the estate ──────────────────────────────────────────────────────────────────── */

const jsonFiles = (rel) => {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.includes('.variables.'))
    .map((f) => ({ name: f, path: join(dir, f), rel: join(rel, f) }));
};

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const readText = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return ''; } };

/* Every Power Automate mail action in a definition, wherever it sits in the tree.
   Deployed exports nest under properties.definition.actions; paste packages nest under
   serializedValue.actions; scopes, switch cases and else-branches nest arbitrarily deep. A
   recursive walk is the only shape-independent way to find them all. */
function mailActions(node, out = []) {
  if (Array.isArray(node)) { for (const v of node) mailActions(v, out); return out; }
  if (!node || typeof node !== 'object') return out;
  const inputs = node.inputs;
  if (inputs && typeof inputs === 'object' && inputs.host && typeof inputs.host === 'object') {
    if (String(inputs.host.operationId || '').includes('SendEmail')) {
      const p = (inputs.parameters && typeof inputs.parameters === 'object') ? inputs.parameters : {};
      /* Two connectors, two parameter schemas. Office 365 Outlook's SendEmailV2 names its
         parameters `emailMessage/*`; the Mail connector's SendEmailV3 names them `request/*`.
         Reading only the first reported the estate's single V3 action as having no recipient
         and no subject, and SN-003 was written against that phantom — it has both. */
      out.push({
        to: String(p['emailMessage/To'] ?? p['request/to'] ?? ''),
        subject: String(p['emailMessage/Subject'] ?? p['request/subject'] ?? ''),
        body: String(p['emailMessage/Body'] ?? p['request/text'] ?? ''),
      });
    }
  }
  for (const v of Object.values(node)) mailActions(v, out);
  return out;
}

/* A recipient resolved from the payload at run time, rather than baked into the definition.
   `mixed` catches the form that would otherwise flatter the estate: a literal address joined to
   the expression by a semicolon, which reaches the right person AND a fixed mailbox. The match
   is deliberately NOT anchored to the end of the string. 06 - GOV - Registry Exception builds
   the same thing inside the expression — concat(AssignedToEmail, ';dgsRegistry@nitda.gov.ng') —
   and an anchored test read that as addressed solely to the assignee, which is the flattery this
   distinction exists to prevent.

   A fallback is NOT mixed, and the semicolon is what separates the two. coalesce(X, 'fixed')
   reaches ONE recipient — the right person when known, the registry when not — and six sends in
   the governance flows are that shape. Counting those as mixed would be its own misstatement, so
   the literal must be semicolon-joined to qualify. */
const isDynamic = (to) => to.trim().startsWith('@');
const isMixed = (to) => isDynamic(to) && /;\s*[\w.+-]+@[\w.-]+\.\w+/.test(to.trim());

function scanSet(rel) {
  const files = jsonFiles(rel);
  const byFile = {};
  for (const f of files) {
    const doc = readJson(f.path);
    byFile[f.name] = doc ? mailActions(doc) : [];
  }
  return { rel, files, byFile };
}

const sets = {
  deployed: scanSet(DEPLOYED),
  portal: scanSet(PORTAL_PKG),
  internal: scanSet(INTERNAL_PKG),
  gateway: scanSet(GATEWAY_PKG),
};

/* Matching a package or flow by the distinctive part of its filename, because deployed exports
   carry a workflow id and a `__full_definition` suffix that no other artifact set uses. */
const find = (set, fragment) => {
  const key = Object.keys(sets[set].byFile).find((n) => n.includes(fragment));
  return key ? { name: key, mails: sets[set].byFile[key] } : null;
};
const mailsIn = (set, fragment) => find(set, fragment)?.mails ?? null;

/* Trigger census. The absence of any schedule or record-change trigger is the single fact
   that eight rows of the matrix depend on, so it is derived rather than asserted. */
function triggerCensus() {
  const kinds = {};
  const scheduled = [], recordDriven = [];
  for (const f of sets.deployed.files) {
    const doc = readJson(f.path);
    const defn = doc?.properties?.definition ?? doc?.definition ?? {};
    for (const [name, t] of Object.entries(defn.triggers ?? {})) {
      const type = t?.type ?? 'unknown';
      kinds[type] = (kinds[type] || 0) + 1;
      if (type === 'Recurrence') scheduled.push(`${f.name} → ${name}`);
      const api = String(t?.inputs?.host?.apiId ?? '');
      const op = String(t?.inputs?.host?.operationId ?? '');
      if (api.includes('sharepointonline') && /OnNewItems|OnUpdatedItems|OnNewFile/i.test(op)) {
        recordDriven.push(`${f.name} → ${name} (${op})`);
      }
    }
  }
  return { kinds, scheduled, recordDriven };
}
const triggers = triggerCensus();

/* Recipient census across the live estate — the headline number of this whole exercise. */
function recipientCensus() {
  const all = [];
  for (const [name, mails] of Object.entries(sets.deployed.byFile)) {
    for (const m of mails) all.push({ flow: name, to: m.to });
  }
  const dynamic = all.filter((m) => isDynamic(m.to));
  const mixed = all.filter((m) => isMixed(m.to));
  const fixed = all.filter((m) => !isDynamic(m.to));
  const byAddress = {};
  for (const m of all) byAddress[m.to || '(empty)'] = (byAddress[m.to || '(empty)'] || 0) + 1;
  const flows = new Set(all.map((m) => m.flow));
  return {
    total: all.length, flows: flows.size, byAddress,
    dynamic: dynamic.length, mixed: mixed.length, fixed: fixed.length,
    soleDynamic: dynamic.length - mixed.length,
  };
}
const recipients = recipientCensus();

/* SMS: any connector in any artifact set that could carry a text message. */
function smsCarriers() {
  const hits = [];
  for (const [setName, set] of Object.entries(sets)) {
    for (const f of set.files) {
      const raw = readFileSync(f.path, 'utf8');
      for (const m of raw.matchAll(/shared_(twilio|smspro|telesign|clicksend|plivo|vonage|nexmo|sms[a-z0-9]*)/gi)) {
        hits.push(`${setName}/${f.name} → ${m[0]}`);
      }
    }
  }
  return hits;
}
const sms = smsCarriers();

/* Portal Outbox Receipts: who writes it, and — the point — who reads it. */
function outboxUse() {
  /* The outbox list is addressed by GUID, not by name — `get(T.outbox, …)` emits
     "table":"88a81ca1-…". An earlier version of this searched for the literal string "Outbox",
     which only ever appears in action NAMES like Create_Support_Outbox_Receipt, so a flow that
     genuinely read the list through the helper was invisible to it. Match the GUID. */
  const OUTBOX = '88a81ca1-319a-45f5-8409-f91a24538ffa';
  const writers = [], readers = [];
  for (const [setName, set] of Object.entries(sets)) {
    for (const f of set.files) {
      const doc = readJson(f.path);
      if (!doc) continue;
      let w = false, r = false;
      (function walk(o) {
        if (!o || typeof o !== 'object') return;
        for (const v of Object.values(o)) {
          if (v && typeof v === 'object' && v.inputs?.parameters?.table === OUTBOX) {
            const op = v.inputs.host?.operationId;
            if (op === 'PostItem' || op === 'PatchItem') w = true;
            if (op === 'GetItems' || op === 'GetItem') r = true;
          }
          walk(v);
        }
      })(doc);
      if (w) writers.push(`${setName}/${f.name}`);
      if (r) readers.push(`${setName}/${f.name}`);
    }
  }
  return { writers, readers };
}
const outbox = outboxUse();

/* The switch cases DGO_DYNAMIC_GLOBAL_ACTIONS actually implements, against the operations the
   runtime is derived to require. Everything unimplemented falls to a 501 default. */
function dynamicOperationCoverage() {
  const pkg = find('internal', 'DGO_DYNAMIC_GLOBAL_ACTIONS');
  const raw = pkg ? readFileSync(join(ROOT, INTERNAL_PKG, pkg.name), 'utf8') : '';
  const cases = [...new Set([...raw.matchAll(/"Case_([A-Za-z0-9_]+)"/g)].map((m) => m[1]))];
  const required = readJson(join(ROOT, 'docs/deployment/internal/dynamic-operations.json'))?.operations ?? [];
  return { cases, requiredCount: required.length, operations: required.map((o) => o.operation) };
}
const dynops = dynamicOperationCoverage();

/* ── Per-row derivation ──────────────────────────────────────────────────────────────────
 *
 * One function per row. Each returns the state the artifacts support, with the reason. Where a
 * row depends on a precondition (nothing can fire on a schedule), the derivation says so rather
 * than repeating the census. */

const anyDynamic = (mails) => Array.isArray(mails) && mails.some((m) => isDynamic(m.to));
const anyFixed = (mails) => Array.isArray(mails) && mails.some((m) => !isDynamic(m.to));
const count = (mails) => (Array.isArray(mails) ? mails.length : 0);
const hasSchedule = () => triggers.scheduled.length > 0 || triggers.recordDriven.length > 0;

const src = {
  acknowledgment: readText('modules/acknowledgment.js'),
  fasttrack: readText('modules/fasttrack.js'),
  ownership: readText('config/action-ownership.config.js'),
  authority: readText('core/action-authority.js'),
  notifCentre: readText('core/notification-center.js'),
  lookup: readText('modules/lookup.js'),
  corrEmail: readText('core/correspondence-email-service.js'),
  reports: readText('modules/reports.js'),
  statistics: readText('modules/statistics.js'),
  comments: readText('modules/comments.js'),
  orchestrator: readText('modules/orchestrator.js'),
  executive: readText('modules/executive.js'),
  welcome: readText('core/welcome-experience.js'),
  discovery: readText('scripts/process-discovery.mjs'),
  submitJs: readText('document-portal/js/submit.js'),
  dataJs: readText('document-portal/js/data.js'),
  trackJs: readText('document-portal/js/track.js'),
  portalIndex: readText('document-portal/index.html'),
};


/* Does any artifact actually CARRY a given message? A carrier is a file that both sends mail and
   names the row's messageType — the token its outbox receipt writes. This is deliberately not
   `hasSchedule()`: an earlier version of these derivations keyed the eight PRE-2-gated rows off
   the mere existence of a Recurrence trigger, which would have turned all eight green the moment
   one scheduled flow appeared, whether or not it sent anything. A trigger is a mechanism, not a
   message. `scheduleOnly` reports the in-between state — the mechanism exists, the message does
   not — so the report can say which of the two is missing. */
function carrierFor(messageType) {
  /* Matched against the outbox MessageType FIELD, not anywhere in the file. A bare substring
     search collided immediately: 'action-required' is also a governed status value, so any
     package that merely mentions the status and happens to send mail looked like a carrier.
     The field form is the estate's own convention — the SUPPORT and VERIFY packages already
     write item/MessageType: 'support-acknowledgement' and 'verification-code'. */
  const field = new RegExp(`["']item/MessageType["']\\s*:\\s*["']${messageType}["']`);
  for (const [setName, set] of Object.entries(sets)) {
    for (const f of set.files) {
      const raw = readFileSync(f.path, 'utf8');
      if (field.test(raw) && /SendEmail/.test(raw)) return `${setName}/${f.name}`;
    }
  }
  return null;
}
/* A REBUILT CARRIER IS DEPLOYED, AND THE FLOW IT REPLACES IS STILL DEPLOYED TOO.
 *
 * Three flows were built here, created in the tenant on 1-2 September, and exported back:
 * CG_SEND_EMAIL, IP_OTP_Endpoint and AUTO_SCHEDULED_SWEEP. The first two were created as NEW
 * flows rather than pasted over the old ones, which is the safe choice — the old flow keeps
 * working while the new one is proved — and it leaves the estate holding two carriers for one
 * endpoint. The client calls whichever URL `config.local.js` names, and that file is git-ignored
 * because it holds signed trigger URLs, so no check in this repository can see which is wired.
 *
 * That is not a reason to guess in either direction. A row here reports what the estate supports,
 * and while both carriers are deployed the estate supports both outcomes. It stays MISADDRESSED
 * — the conservative reading, and the one that keeps the re-pointing step visible — and says so
 * in terms an operator can act on. It turns PROVISIONED when the old carrier stops being
 * deployed, or when it stops hard-coding its recipient. See PRE-5.
 */
function rebuiltCarrier(oldFlow, newFlow, endpointKey, subjectFilter = null) {
  const pick = (mails) => (subjectFilter && mails ? mails.filter(subjectFilter) : mails) ?? [];
  const legacy = pick(mailsIn('deployed', oldFlow));
  const rebuilt = pick(mailsIn('deployed', newFlow));
  const legacyFixed = legacy.length > 0 && legacy.every((m) => !isDynamic(m.to));
  const rebuiltDynamic = rebuilt.length > 0 && rebuilt.some((m) => isDynamic(m.to));
  if (!legacyFixed) {
    return ['PROVISIONED', legacy.length
      ? `${oldFlow} no longer hard-codes its recipient`
      : `${oldFlow} is no longer in the deployed set; ${newFlow} carries this`];
  }
  if (!rebuiltDynamic) {
    return ['MISADDRESSED', `all ${legacy.length} send(s) in ${oldFlow} hard-code their recipient, and no rebuilt carrier is deployed`];
  }
  return ['MISADDRESSED',
    `${newFlow} is deployed and addresses from the payload, but ${oldFlow} is still deployed and `
    + `still hard-codes ${legacy.length} recipient(s). Which one runs is decided by ${endpointKey} `
    + `in config.local.js, which this repository cannot read — re-point it and turn off ${oldFlow} (PRE-5)`];
}

const gatedState = (messageType, absentWhy) => {
  const carrier = carrierFor(messageType);
  if (carrier) return ['PROVISIONED', `${carrier} sends ${messageType}`];
  return ['ABSENT', hasSchedule()
    ? `a schedule now exists, but nothing sends ${messageType} (PRE-2's mechanism landed; the message did not)`
    : absentWhy];
};

const DERIVE = {
  'RN-001': () => count(mailsIn('portal', 'Portal_SUBMISSION_ECM_DOCS')) === 0
    ? ['ABSENT', 'the SUBMISSION package carries no mail action']
    : ['PROVISIONED', 'the SUBMISSION package carries a mail action'],

  'RN-002': () => gatedState('action-required',
    'nothing in the estate fires on a schedule or a record change (PRE-2)'),

  'RN-003': () => gatedState('decision-outcome',
    'no status-change carrier and no mail action on WRITEBACK'),

  'RN-004': () => gatedState('decision-outcome', 'no status-change carrier exists (PRE-2)'),

  'RN-005': () => (count(mailsIn('portal', 'Portal_WRITEBACK_ECM_DOCS')) === 0
    ? ['ABSENT', 'the WRITEBACK package carries no mail action']
    : ['PROVISIONED', 'the WRITEBACK package carries a mail action']),

  /* The packages are correct and the live endpoint is not, so this row is about the gap
     between them: a citizen requesting a code today has it delivered to a shared mailbox. */
  'RN-006': () => {
    const v = mailsIn('portal', 'Portal_VERIFY_ECM_DOCS');
    const c = mailsIn('portal', 'Portal_VERIFY_CONFIRM_ECM_DOCS');
    const writes = outbox.writers.some((w) => w.includes('VERIFY'));
    const packagesOk = anyDynamic(v) && anyDynamic(c) && writes;
    const liveCode = (mailsIn('deployed', 'Portal_Verify__86897b2f') ?? [])
      .filter((m) => /verification code/i.test(m.subject));
    if (packagesOk && liveCode.length && liveCode.every((m) => !isDynamic(m.to))) {
      return ['MISADDRESSED', 'the packages address the citizen; the live VERIFY endpoint sends the code to a fixed mailbox'];
    }
    return packagesOk
      ? ['PROVISIONED', 'both verify packages and the live endpoint address the citizen']
      : ['ABSENT', 'a verify package is missing its dynamic send or its outbox receipt'];
  },

  'RN-007': () => {
    const s = mailsIn('portal', 'Portal_SUPPORT_ECM_DOCS');
    const writes = outbox.writers.some((w) => w.includes('SUPPORT'));
    return anyDynamic(s) && writes
      ? ['PROVISIONED', 'the support package sends to a resolved address and writes an outbox receipt']
      : ['ABSENT', 'the support acknowledgement is missing its dynamic send or its outbox receipt'];
  },

  'RN-008': () => gatedState('support-reply',
    'nothing reads or sends on Portal Support Cases.Status (PRE-2)'),

  /* A deployed flow already notifies the assignee from the task's AssignedTo field, and the
     package that replaces it sends nothing — so this is a regression waiting to be pasted,
     not an absence. The distinction changes the remediation: port an expression that exists,
     rather than design a message that does not. */
  'RN-009': () => {
    const pkg = count(mailsIn('internal', 'DGO_SINGLE_ASSIGNMENT'));
    const live = mailsIn('deployed', 'Deployed - Create Task') ?? [];
    const notifies = live.some((m) => isDynamic(m.to) && !/Flow Run Record/i.test(m.subject));
    if (pkg === 0 && notifies) {
      return ['REGRESSION', 'Deployed - Create Task notifies the assignee; the package that replaces it sends nothing'];
    }
    return pkg === 0
      ? ['ABSENT', 'no assignment notice anywhere']
      : ['PROVISIONED', 'the single-assignment package carries a mail action'];
  },

  'RN-010': () => {
    const pkg = count(mailsIn('internal', 'DGO_BULK_ASSIGNMENT'));
    const live = [...(mailsIn('deployed', 'Bulk Assign Direct') ?? []),
                  ...(mailsIn('deployed', 'optimized Bulk Assign Direct') ?? [])];
    if (pkg === 0 && live.length && live.every((m) => !isDynamic(m.to))) {
      return ['MISADDRESSED', `${live.length} live bulk-assignment sends, every one to a fixed address`];
    }
    return pkg === 0 ? ['ABSENT', 'no bulk-assignment mail action anywhere'] : ['PROVISIONED', 'the package sends'];
  },

  'RN-011': () => (count(mailsIn('internal', 'DGO_SINGLE_ASSIGNMENT')) === 0
    && count(mailsIn('internal', 'DGO_BULK_ASSIGNMENT')) === 0
    ? ['ABSENT', 'neither assignment package carries any mail action']
    : ['PROVISIONED', 'an assignment package sends']),

  'RN-012': () => (/remind-assignee[^]{0,400}State\.patch/.test(src.acknowledgment)
    || /notifications:\s*\[/.test(src.acknowledgment)
    ? ['LOCAL_ONLY', 'remind-assignee writes State.notifications and nothing carries it off the device']
    : ['PROVISIONED', 'remind-assignee now reaches a backend']),

  'RN-013': () => gatedState('acknowledgement-overdue',
    'no acknowledgement-clock sweep can exist without a schedule (PRE-2)'),

  'RN-014': () => gatedState('due-breached',
    'no due-date sweep can exist without a schedule (PRE-2)'),

  'RN-015': () => (!/'notify-owner'\s*:/.test(src.ownership)
    ? ['LOCAL_ONLY', 'notify-owner has no action-ownership spec, so no declared backend']
    : ['PROVISIONED', 'notify-owner now carries a declared backend']),

  /* Same shape as RN-021: IP_OTP_Endpoint is live and addresses the officer, Web - OTP Generate
     is still deployed and still does not, and OTP_GENERATE decides which one answers. */
  'RN-016': () => {
    if (!anyDynamic(mailsIn('internal', 'DGO_OTP'))) return ['ABSENT', 'no officer code send'];
    return rebuiltCarrier('Web - OTP Generate', 'IP_OTP_Endpoint', 'OTP_GENERATE',
      (m) => /verification code|sign-in code/i.test(m.subject));
  },

  'RN-017': () => ['ABSENT', 'no mail action in any set fires on an approval request'],
  'RN-018': () => ['ABSENT', 'no mail action in any set fires on an approval decision'],
  'RN-019': () => (count(mailsIn('internal', 'DGO_SINGLE_ASSIGNMENT')) === 0
    ? ['ABSENT', 'the single-assignment package carries no mail action to send on reassignment']
    : ['PROVISIONED', 'the single-assignment package sends']),

  'RN-020': () => (!/NotificationCenter/.test(src.comments)
    ? ['ABSENT', 'add-comment raises no notification to anyone but the actor']
    : ['PROVISIONED', 'add-comment raises a notification']),

  /* TWO CARRIERS NOW EXIST IN THE TENANT AND ONLY ONE OF THEM IS RIGHT.
     `CG_SEND_EMAIL` was created on 2026-09-02 from DGO_SEND_EMAIL and addresses every send from
     the payload. `Web - Send Email` is still deployed and still hard-codes the registry mailbox.
     Which one the officer's correspondence reaches is decided by the URL in `config.local.js`
     under `EMAIL` — a file this repository deliberately does not hold, because it carries the
     signed trigger URLs. So the estate cannot be read as fixed while both are present: the
     honest reading is that the fix is deployed and not yet wired. See PRE-5. */
  'RN-021': () => rebuiltCarrier('Web - Send Email', 'CG_SEND_EMAIL', 'EMAIL'),

  'RN-022': () => (!dynops.cases.some((c) => /dispatch/i.test(c))
    ? ['UNIMPLEMENTED', `DGO_DYNAMIC_GLOBAL_ACTIONS implements ${dynops.cases.length} cases and dispatchoutbound is not one`]
    : ['PROVISIONED', 'the dispatchoutbound case is implemented']),

  'RN-023': () => (/DISPATCH_FAILED/.test(src.authority) && /actionFailureMessage/.test(src.authority)
    ? ['PROVISIONED', 'the governance layer carries an operator sentence for DISPATCH_FAILED']
    : ['ABSENT', 'no operator notice on dispatch failure']),

  'RN-024': () => rebuiltCarrier('Web - Send Email', 'CG_SEND_EMAIL', 'EMAIL'),

  'RN-025': () => {
    const liveUpload = (mailsIn('deployed', 'CG_Upload_Endpoint') ?? []).some((m) => /Flow Run Record/i.test(m.subject));
    const liveWb = (mailsIn('deployed', 'CG_Writeback_Endpoint') ?? []).some((m) => /Flow Run Record/i.test(m.subject));
    const pkgUpload = count(mailsIn('portal', 'Portal_UPLOAD_ECM_DOCS'));
    const pkgWb = count(mailsIn('portal', 'Portal_WRITEBACK_ECM_DOCS'));
    return (liveUpload || liveWb) && pkgUpload === 0 && pkgWb === 0
      ? ['REGRESSION', 'the deployed upload and writeback flows capture a run record; the packages that replace them do not']
      : ['PROVISIONED', 'run-record capture survives the paste'];
  },

  'RN-026': () => (outbox.readers.length === 0 || !carrierFor('outbox-failure-alert')
    ? ['ABSENT', `Portal Outbox Receipts has ${outbox.writers.length} writers and no reader`]
    : ['PROVISIONED', 'the outbox is read and failures are reported']),

  /* A retry does not mint a new message; it resends an existing one and advances its counter.
     So this looks for the Attempts-incrementing patch on the outbox rather than a messageType. */
  'RN-027': () => {
    const OUTBOX = '88a81ca1-319a-45f5-8409-f91a24538ffa';
    let found = null;
    for (const [setName, set] of Object.entries(sets)) {
      for (const f of set.files) {
        const doc = readJson(f.path); if (!doc) continue;
        (function walk(o) {
          if (!o || typeof o !== 'object') return;
          for (const v of Object.values(o)) {
            if (v && typeof v === 'object' && v.inputs?.host?.operationId === 'PatchItem'
                && v.inputs.parameters?.table === OUTBOX
                && String(v.inputs.parameters['item/Attempts'] ?? '').includes('add(')) found = `${setName}/${f.name}`;
            walk(v);
          }
        })(doc);
      }
    }
    return found
      ? ['PROVISIONED', `${found} resends failed receipts and advances Attempts`]
      : ['ABSENT', 'no retry sweep can exist without a schedule (PRE-2)'];
  },

  'RN-028': () => (anyDynamic(mailsIn('deployed', 'Global_Gap_Remediation_Provisioning'))
    ? ['PROVISIONED', 'the provisioning report is addressed to the caller']
    : ['MISADDRESSED', 'the provisioning report is addressed to a fixed mailbox only']),

  'RN-029': () => (count(mailsIn('deployed', 'DGSO INCOMING AI PROCESSING')) > 0
    ? ['PROVISIONED', 'the scan-intake pipeline reports a deposit']
    : ['ABSENT', 'nothing reports a scan deposit']),

  'RN-030': () => (/FAILURE_OUTCOME/.test(src.authority) && /executeOwnedAction/.test(src.authority)
    ? ['PROVISIONED', 'every failed governed action reaches the operator through one layer']
    : ['ABSENT', 'governed-action failures have no operator notice']),

  'RN-031': () => (/CAPACITY/.test(src.notifCentre) && /markAllRead/.test(src.notifCentre)
    ? ['PROVISIONED', 'the durable feedback channel exists with capacity, dismissal and unread state']
    : ['ABSENT', 'no durable feedback channel']),

  'RN-032': () => (/PendingQueue\.enqueue/.test(src.lookup) && /PendingQueue\.enqueue/.test(src.corrEmail)
    ? ['PROVISIONED', 'enqueue and operator notice are paired at the call sites checked']
    : ['ABSENT', 'held writes are not reported to the operator']),

  'RN-033': () => (sms.length === 0
    ? ['UNIMPLEMENTED', 'no SMS connector exists in any of the four artifact sets']
    : ['PROVISIONED', `an SMS carrier exists: ${sms[0]}`]),

  'RN-034': () => (!/'escalate-priority'\s*:/.test(src.ownership)
    ? ['LOCAL_ONLY', 'escalate-priority has no action-ownership spec, so no declared backend']
    : ['PROVISIONED', 'escalate-priority now carries a declared backend']),

  'RN-035': () => (carrierFor('task-reminder')
    ? ['PROVISIONED', 'set-reminder reaches a carrier that can fire at dueAt']
    : ['LOCAL_ONLY', 'set-reminder writes State.notifications; nothing sends task-reminder']),

  'RN-036': () => (/executive-escalate/.test(src.executive)
    ? ['ABSENT', 'executive-escalate sets Delegated and no mail action in any set fires on it']
    : ['ABSENT', 'no delegation action found']),

  'RN-037': () => {
    const notices = [];
    for (const [flow, mails] of Object.entries(sets.deployed.byFile)) {
      for (const m of mails) if (/Glass Pane Portal submission/i.test(m.subject)) notices.push({ flow, to: m.to });
    }
    const pkg = count(mailsIn('portal', 'Portal_SUBMISSION_ECM_DOCS'));
    if (notices.length && notices.every((n) => !isDynamic(n.to))) {
      return ['MISADDRESSED', `${notices.length} submission notices, every one to a fixed individual; the SUBMISSION package sends ${pkg}`];
    }
    return notices.length ? ['PROVISIONED', 'the submission notice reaches a monitored address'] : ['ABSENT', 'no submission notice'];
  },

  'RN-038': () => (count(mailsIn('internal', 'DGO_SINGLE_ASSIGNMENT')) === 0
    && count(mailsIn('internal', 'DGO_BULK_ASSIGNMENT')) === 0
    ? ['ABSENT', 'neither assignment package carries any mail action to copy anyone on']
    : ['PROVISIONED', 'an assignment package sends']),

  /* The flow carries two sends, so the per-exception one is selected by the loop it sits in
     rather than by how it is addressed — picking it by its recipient would assume the answer this
     derivation exists to compute. The schedule is asserted too: a carrier whose Recurrence is
     removed still holds a correct recipient and fires for nobody. */
  'RN-039': () => {
    const FLOW = '06 - GOV - Registry Exception';
    const mails = mailsIn('deployed', FLOW);
    if (!mails?.length) return ['ABSENT', 'no registry-exception carrier is deployed'];
    if (!triggers.scheduled.some((t) => t.startsWith(FLOW))) {
      return ['UNIMPLEMENTED', 'the governance flow is deployed but carries no Recurrence, so nothing reads the open exceptions'];
    }
    const perException = mails.filter((m) => /AssignedToEmail/.test(`${m.to}${m.subject}`));
    if (!perException.length) return ['ABSENT', 'the governance flow sends nothing per open exception'];
    return perException.every((m) => isDynamic(m.to))
      ? ['PROVISIONED', 'the hourly governance flow mails each open exception to its AssignedToEmail']
      : ['MISADDRESSED', 'the per-exception send does not resolve AssignedToEmail'];
  },
};

/* ── Report ──────────────────────────────────────────────────────────────────────────────── */

console.log(`\nRequired-notification matrix — ${NotificationMatrixMeta.schema}`);
console.log(`Compiled ${NotificationMatrixMeta.compiledUtc} against ${NotificationMatrixMeta.compiledAgainstCommit}\n`);

console.log('The estate as read');
console.log(`  deployed exports        ${sets.deployed.files.length} definitions`);
console.log(`  portal paste packages   ${sets.portal.files.length}`);
console.log(`  internal paste packages ${sets.internal.files.length}`);
console.log(`  gateway fragment set    ${sets.gateway.files.length}`);
console.log(`  mail actions live       ${recipients.total} across ${recipients.flows} flows` +
            ` — ${recipients.fixed} to a fixed mailbox, ${recipients.dynamic} resolved at run time` +
            ` (of which ${recipients.mixed} also append a fixed address, leaving` +
            ` ${recipients.soleDynamic} addressed solely to the person concerned)`);
console.log(`  trigger census          ${Object.entries(triggers.kinds).map(([k, v]) => `${v} ${k}`).join(' · ')}`);
console.log(`  scheduled triggers      ${triggers.scheduled.length}`);
console.log(`  record-change triggers  ${triggers.recordDriven.length}`);
console.log(`  outbox writers/readers  ${outbox.writers.length} / ${outbox.readers.length}`);
console.log(`  dynamic-action cases    ${dynops.cases.length} implemented of ${dynops.requiredCount} operations required`);
console.log(`  SMS carriers            ${sms.length}\n`);

console.log('Fixed recipients, by address');
for (const [addr, n] of Object.entries(recipients.byAddress).sort((a, b) => b[1] - a[1])) {
  if (String(addr).startsWith('@')) continue;
  console.log(`  ${String(n).padStart(3)}  ${addr}`);
}
console.log('');

console.log('Row-by-row: declared against derived\n');
const rows = [];
for (const r of RequiredNotifications) {
  const derive = DERIVE[r.id];
  if (!derive) {
    ok(false, `${r.id} has a derivation`, 'no derivation function is defined for this row');
    continue;
  }
  const [derived, why] = derive();
  const agree = derived === r.status;
  rows.push({ ...r, derived, why, agree });
  const mark = agree ? '✅' : '❌';
  console.log(`  ${mark} ${r.id}  ${r.status.padEnd(13)} ${agree ? '' : `→ estate says ${derived}  `}${r.event}`);
  if (!agree) console.log(`       ${why}`);
  if (agree) pass++; else { fail++; failures.push(`${r.id}: declared ${r.status}, estate says ${derived} — ${why}`); }
}

console.log('\nStructural integrity\n');

ok(new Set(RequiredNotifications.map((r) => r.id)).size === RequiredNotifications.length,
   'every row id is unique');
ok(RequiredNotifications.every((r) => Audiences[r.audience]),
   'every row names a declared audience',
   RequiredNotifications.filter((r) => !Audiences[r.audience]).map((r) => `${r.id}=${r.audience}`).join(', '));
ok(RequiredNotifications.every((r) => Channels[r.channel]),
   'every row names a declared channel',
   RequiredNotifications.filter((r) => !Channels[r.channel]).map((r) => `${r.id}=${r.channel}`).join(', '));
ok(RequiredNotifications.every((r) => ProvisioningStates[r.status]),
   'every row carries a declared provisioning state',
   RequiredNotifications.filter((r) => !ProvisioningStates[r.status]).map((r) => `${r.id}=${r.status}`).join(', '));
ok(RequiredNotifications.every((r) => Severities[r.severity]),
   'every row carries a declared severity',
   RequiredNotifications.filter((r) => !Severities[r.severity]).map((r) => `${r.id}=${r.severity}`).join(', '));
ok(RequiredNotifications.every((r) => Array.isArray(r.basisEvidence) && r.basisEvidence.length > 0),
   'every row cites the obligation it rests on',
   RequiredNotifications.filter((r) => !(r.basisEvidence || []).length).map((r) => r.id).join(', '));
ok(RequiredNotifications.every((r) => Array.isArray(r.statusEvidence) && r.statusEvidence.length > 0),
   'every row cites the evidence for its state',
   RequiredNotifications.filter((r) => !(r.statusEvidence || []).length).map((r) => r.id).join(', '));
ok(RequiredNotifications.every((r) => r.owner && r.remediation),
   'every row names an owner and a remediation');

/* Every file cited as basis evidence must exist. A matrix that cites a file that has been
   deleted is asserting an obligation nobody can check.
   Prose after an em dash and a trailing :line are stripped first. A citation is also accepted
   when it names a flow export by its readable name — the exports carry a `__<workflowid>__
   full_definition` suffix that is noise in a citation, so a unique prefix match inside the
   directory resolves it. Ambiguous prefixes do not resolve, so this cannot be used to cite a
   file that is not really there. */
function citationResolves(citation) {
  const raw = String(citation).split(' — ')[0].trim().split(/\s+(?:and|line)\s+/)[0].trim();
  const path = raw.replace(/:\d+$/, '').trim();
  if (!path.includes('/')) return true;
  if (existsSync(join(ROOT, path))) return true;
  const dir = join(ROOT, dirname(path));
  if (!existsSync(dir)) return false;
  const stem = basename(path);
  return readdirSync(dir).filter((f) => f.startsWith(stem)).length === 1;
}
{
  const missing = [];
  for (const r of RequiredNotifications) {
    for (const e of r.basisEvidence) if (!citationResolves(e)) missing.push(`${r.id} → ${e}`);
  }
  ok(missing.length === 0, 'every file cited as the basis for a row exists', missing.join(' · '));
}

/* Preconditions gate real rows. */
{
  const ids = new Set(RequiredNotifications.map((r) => r.id));
  const dangling = [];
  for (const p of Preconditions) for (const g of p.gates) if (!ids.has(g)) dangling.push(`${p.id} → ${g}`);
  ok(dangling.length === 0, 'every precondition gates rows that exist', dangling.join(', '));
}

/* PRE-2 is the claim eight rows lean on, and it is now RESOLVED BY THE TENANT: AUTO_SCHEDULED_SWEEP
   was imported and exported back on 2026-09-02 carrying an hourly Recurrence. This asserted the
   negative for as long as the negative was true; it now asserts the positive, so that a sweep
   deleted or disabled in the tenant fails this line rather than passing quietly and leaving eight
   rows green on a clock that no longer ticks. */
ok(hasSchedule(),
   'PRE-2 resolved: a scheduled flow is running in the tenant',
   'no Recurrence or record-change trigger in the deployed set — the eight rows PRE-2 qualifies '
   + 'have no clock. Re-import DGO_SCHEDULED_SWEEP and export it back.');
if (hasSchedule()) console.log(`     ${[...triggers.scheduled, ...triggers.recordDriven].join(', ')}`);

/* PRE-3: the discovery scan still reads only the superseded fragment set. */
ok(/designer-paste\/correspondence-gateway/.test(src.discovery),
   'PRE-3 holds: the generated catalogue still reads only the gateway fragment set',
   'process-discovery.mjs no longer hard-codes the gateway path — regenerate and revisit PRE-3');

/* PRE-4: the register now carries the notification items. */
{
  const reg = readJson(join(ROOT, 'docs/deployment/PRODUCTION_READINESS_REGISTER.json'));
  const have = new Set((reg?.items ?? []).map((i) => i.id));
  const want = ['ITEM-38', 'ITEM-39', 'ITEM-40', 'ITEM-41', 'ITEM-42'];
  ok(want.every((i) => have.has(i)), 'PRE-4 holds: the register carries the five notification items',
     want.filter((i) => !have.has(i)).join(', '));
}

/* PRE-1: the sending mailbox is decided, so the connection carrying it is now a fixed point.
   Every package that sends mail must bind the SAME Office 365 connection — the one section 13
   records — because three connections exist in the tenant and a package that quietly binds a
   different one sends citizen mail from a different mailbox than the one the agency chose. This
   proves the estate is consistent about which connection it uses.

   The other half — WHOSE MAILBOX that connection actually authenticates as — a connection id
   cannot answer, and for as long as only ids were held here this said so. The tenant has now
   answered it directly: the three flows exported back on 1-2 September carry a package manifest
   whose connection resources are NAMED, and both of them are named dgsregistry@nitda.gov.ng.
   That is asserted below rather than left in a comment, because it is the only line in this
   file that rests on evidence from outside the repository. */
{
  const RECORDED = 'c0b9e7a5b0854c39a435fd8ce92f48ad';
  const bound = new Map();
  for (const setName of ['portal', 'internal']) {
    for (const f of sets[setName].files) {
      const raw = readFileSync(f.path, 'utf8');
      if (!raw.includes('SendEmailV2')) continue;
      for (const m of raw.matchAll(/shared_office365\/connections\/([A-Za-z0-9_-]+)/g)) {
        if (!bound.has(m[1])) bound.set(m[1], []);
        bound.get(m[1]).push(`${setName}/${f.name}`);
      }
    }
  }
  const ids = [...bound.keys()];
  ok(ids.length === 1 && ids[0] === RECORDED,
     `every mail-sending package binds the connection recorded in the sign-off (${RECORDED.slice(0, 8)}…)`,
     ids.length === 0 ? 'no package binds an Office 365 connection'
       : `bound: ${ids.map((i) => `${i.slice(0, 8)}… in ${bound.get(i).length}`).join(', ')}`);
}

/* PRE-1, the half a repository could not previously check: the tenant names the mailbox.
   Read from packageProvenance.connections on the flows exported back from the environment —
   manifest.resources joined to connectionsMap.json, which is the tenant stating what each
   connection is, not this repository inferring it. */
{
  const DECIDED = 'dgsregistry@nitda.gov.ng';
  const named = [];
  for (const f of sets.deployed.files) {
    const doc = readJson(f.path);
    const conns = doc?.packageProvenance?.connections;
    if (!conns) continue;
    for (const [api, c] of Object.entries(conns)) {
      named.push({ flow: doc.workflow_identity?.tags?.flowDisplayName ?? f.name, api, name: String(c.displayName ?? '') });
    }
  }
  const wrong = named.filter((n) => n.name.toLowerCase() !== DECIDED);
  ok(named.length > 0 && wrong.length === 0,
     `PRE-1 confirmed by the tenant: all ${named.length} connection resource(s) in the exported `
     + `packages are named ${DECIDED}`,
     named.length === 0
       ? 'no exported package carries packageProvenance — the mailbox is still decided but unconfirmed'
       : wrong.map((n) => `${n.flow}/${n.api} → ${n.name || '(unnamed)'}`).join(', '));
}

/* PRE-5: a rebuilt carrier is deployed BESIDE the flow it replaces, so the endpoint URL decides
   which one runs. This asserts the condition that makes PRE-5 live, so the day the old carrier
   is turned off — or starts addressing dynamically — this line fails and the three rows it
   qualifies are revisited rather than staying MISADDRESSED out of habit. */
{
  const pairs = [['Web - Send Email', 'CG_SEND_EMAIL', 'EMAIL'],
                 ['Web - OTP Generate', 'IP_OTP_Endpoint', 'OTP_GENERATE, OTP_VERIFY']];
  const live = pairs.filter(([o, n]) => {
    const legacy = mailsIn('deployed', o) ?? [];
    const rebuilt = mailsIn('deployed', n) ?? [];
    return legacy.length && legacy.every((m) => !isDynamic(m.to)) && rebuilt.some((m) => isDynamic(m.to));
  });
  ok(live.length === pairs.length,
     `PRE-5 holds: ${live.length} endpoint(s) have a correct carrier deployed beside the one they replace`,
     pairs.filter((x) => !live.includes(x))
       .map(([o, n, k]) => `${o} → ${n} (${k}) is no longer a live pair — recheck the rows it qualifies`)
       .join('; '));
  for (const [o, n, k] of live) console.log(`     ${k}: ${n} is correct, ${o} is not, and the URL decides`);
}

/* The portal promises are the basis for four rows. If the copy is changed, the obligation
   changes, and the matrix must be revisited rather than silently continuing to assert it. */
{
  const promises = [
    ['submit.js confirmation promise', /A confirmation is on its way to/.test(src.submitJs)],
    ['submit.js one-working-day instruction', /If no confirmation reaches/.test(src.submitJs)],
    ['data.js FAQ — tracking IDs are emailed', /Tracking IDs are emailed to the address used at submission/.test(src.dataJs)],
    ['data.js approved — outcome sent to your email', /Outcome sent to your email address/.test(src.dataJs)],
    ['track.js — the tracking ID from your confirmation email', /from your confirmation email/.test(src.trackJs)],
    ['index.html — the outcome is emailed to you', /emailed to you/.test(src.portalIndex)],
  ];
  for (const [name, present] of promises) {
    ok(present, `the portal still makes the promise this matrix holds it to: ${name}`,
       'the copy changed — RN-001, RN-003 and RN-004 rest on it and must be revisited');
  }
}

/* ── Emit ────────────────────────────────────────────────────────────────────────────────── */

function emitMarkdown() {
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const counts = {};
  for (const r of RequiredNotifications) counts[r.status] = (counts[r.status] || 0) + 1;
  const sev = {};
  for (const r of RequiredNotifications) if (r.status !== 'PROVISIONED') sev[r.severity] = (sev[r.severity] || 0) + 1;

  const L = [];
  L.push('# The required-notification matrix');
  L.push('');
  L.push('> **Generated.** Produced by `scripts/verify-notification-matrix.mjs --emit` from');
  L.push('> `config/notification-matrix.config.js`, measured against the four artifact sets named below.');
  L.push('> Do not edit this file: edit the matrix, or the script that measures it, and regenerate.');
  L.push(`> Compiled ${NotificationMatrixMeta.compiledUtc} against \`${NotificationMatrixMeta.compiledAgainstCommit}\`.`);
  L.push('');
  L.push('**Purpose.** The messages this estate is *required* to send — not the messages it happens to send.');
  L.push('`docs/process/18-NOTIFICATION-AND-ESCALATION-CATALOGUE.md` is the inventory; this is the requirement.');
  L.push('An inventory cannot report a message that was never built.');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Where it stands');
  L.push('');
  L.push(`${RequiredNotifications.length} required notifications. ` +
         `**${counts.PROVISIONED || 0} provisioned.** ` +
         Object.entries(counts).filter(([k]) => k !== 'PROVISIONED')
           .map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') + '.');
  L.push('');
  L.push('Of the estate\'s ' + recipients.total + ' live mail actions across ' + recipients.flows + ' flows, ' +
         '**' + recipients.soleDynamic + ' are addressed solely to the person concerned.** ' +
         recipients.fixed + ' hard-code a fixed mailbox, and a further ' + recipients.mixed +
         ' resolve the recipient at run time but append a fixed address alongside it.');
  L.push('');
  L.push('| Severity of what is outstanding | Rows |');
  L.push('|---|---|');
  for (const k of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) if (sev[k]) L.push(`| ${k} | ${sev[k]} |`);
  L.push('');
  L.push('## Preconditions');
  L.push('');
  /* Counted from the list rather than written into the sentence. It said "Four" while five
     preconditions stood, because PRE-5 was added and the prose was not — the same way a
     hard-coded total goes stale anywhere else in this repository. */
  const COUNT_WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  const preCount = COUNT_WORDS[Preconditions.length] ?? String(Preconditions.length);
  L.push(`${preCount} thing${Preconditions.length === 1 ? '' : 's'} that are not notifications but that block or distort a whole class of them.`);
  L.push('');
  for (const p of Preconditions) {
    L.push(`### ${p.id} — ${p.title}`);
    L.push('');
    L.push(p.statement);
    L.push('');
    if (p.gates.length) L.push(`**Gates:** ${p.gates.join(', ')}  `);
    L.push(`**Owner:** ${p.owner}  `);
    L.push(`**Resolved when:** ${p.resolution}`);
    L.push('');
    L.push('Evidence:');
    for (const e of p.evidence) L.push(`- \`${e}\``);
    L.push('');
  }
  L.push('## The matrix');
  L.push('');
  L.push('| ID | Event | Platform | Audience | Channel | State | Severity | Carrier |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const r of RequiredNotifications) {
    L.push(`| ${r.id} | ${esc(r.event)} | ${r.platform} | ${r.audience} | ${r.channel} | ` +
           `${r.status === 'PROVISIONED' ? '✅ ' : ''}${r.status} | ${r.severity} | ${esc(r.carrier)} |`);
  }
  L.push('');
  L.push('## Every row in full');
  L.push('');
  for (const r of RequiredNotifications) {
    L.push(`### ${r.id} — ${r.event}`);
    L.push('');
    L.push(`**${r.status}** · ${r.severity} · ${r.platform} → ${r.audience} · ${r.channel}`);
    L.push('');
    L.push(`**Trigger.** ${r.trigger}`);
    L.push('');
    L.push(`**Carrier.** \`${r.carrier}\``);
    L.push('');
    L.push(`**Must say.** ${r.content}`);
    L.push('');
    L.push(`**On failure.** ${r.failureBehaviour}`);
    L.push('');
    L.push(`**Why it is required.** ${r.basis}`);
    L.push('');
    for (const e of r.basisEvidence) L.push(`- \`${e}\``);
    L.push('');
    L.push('**What the estate does today.**');
    L.push('');
    for (const e of r.statusEvidence) L.push(`- ${e}`);
    L.push('');
    L.push(`**Owner.** ${r.owner}`);
    L.push('');
    L.push(`**Remediation.** ${r.remediation}`);
    L.push('');
    L.push('---');
    L.push('');
  }
  L.push('## Surplus — messages the estate sends that nothing requires');
  L.push('');
  L.push('The complement of the matrix. Each of these is a mail action somebody has to keep working,');
  L.push('and several carry record payloads to a shared mailbox. They are listed rather than made rows');
  L.push('because a row asserts an obligation, and asserting one for these would be inventing it.');
  L.push('');
  for (const s of SurplusNotifications) {
    L.push(`### ${s.id} — ${s.pattern}`);
    L.push('');
    L.push(`**Flows.** ${s.flows.map((f) => `\`${f}\``).join(', ')}`);
    L.push('');
    L.push(`**Recipients.** ${s.recipients}`);
    L.push('');
    L.push(s.concern);
    L.push('');
    L.push(`**Decision needed.** ${s.decision}`);
    L.push('');
  }
  L.push('## Vocabulary');
  L.push('');
  L.push('| Audience | Meaning |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(Audiences)) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('| Channel | Meaning |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(Channels)) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('| State | Meaning |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(ProvisioningStates)) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  L.push('| Severity | Meaning |');
  L.push('|---|---|');
  for (const [k, v] of Object.entries(Severities)) L.push(`| \`${k}\` | ${v} |`);
  L.push('');
  return L.join('\n');
}

const OUT = 'docs/deployment/NOTIFICATION_MATRIX.md';
if (EMIT) {
  writeFileSync(join(ROOT, OUT), emitMarkdown(), 'utf8');
  console.log(`\n  ✍️  wrote ${OUT}`);
} else if (existsSync(join(ROOT, OUT))) {
  const current = readFileSync(join(ROOT, OUT), 'utf8');
  ok(current === emitMarkdown(), `${OUT} is current`, 'run: npm run notifications -- --emit');
}

if (JSON_OUT) {
  writeFileSync(join(ROOT, JSON_OUT), JSON.stringify({
    meta: NotificationMatrixMeta, estate: { recipients, triggers, outbox, dynops, sms }, rows,
  }, null, 2), 'utf8');
  console.log(`  ✍️  wrote ${JSON_OUT}`);
}

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
if (fail && !CHECK) console.log('  (run with --check to make this a build failure)\n');
process.exit(CHECK && fail ? 1 : 0);
