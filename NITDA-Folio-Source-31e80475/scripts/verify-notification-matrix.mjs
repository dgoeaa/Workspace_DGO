#!/usr/bin/env node
/**
 * The required-notification matrix, measured against the estate.
 *
 *   npm run notifications              # report: every row, its required and observed state
 *   npm run notifications -- --check   # same, but exit 1 on any disagreement
 *   npm run notifications -- --emit    # regenerate docs/folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md
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
 *   deployed    docs/folio-Master-Flows-and-Endpoints/contracts/deployed              what the tenant runs today
 *   portal      docs/folio-Master-Flows-and-Endpoints/surfaces/portal/designer-paste     what Session 4 pastes
 *   internal    docs/folio-Master-Flows-and-Endpoints/surfaces/internal/designer-paste       what Sessions 4-6 paste
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

const DEPLOYED = 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed';
/* The identification packages: the adopted flows' root scopes with the identification changes, what is pasted into the
   live flows. The DGO_* and Portal_*_ECM_DOCS replacement packages and the gateway fragment set this read before
   2026-10-06 are retired (registers/flow-retirement.json). */
const PORTAL_PKG = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3';
const INTERNAL_PKG = 'docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4';

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
        cc: String(p['emailMessage/Cc'] ?? p['request/cc'] ?? ''),
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
  const pkg = find('internal', 'DYNAMIC_ACTIONS__IP_Dynamic_Global_Actions_Endpoint');
  const raw = pkg ? readFileSync(join(ROOT, INTERNAL_PKG, pkg.name), 'utf8') : '';
  const cases = [...new Set([...raw.matchAll(/"Case_([A-Za-z0-9_]+)"/g)].map((m) => m[1]))];
  const required = readJson(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/deployment/internal/dynamic-operations.json'))?.operations ?? [];
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
  dispatch: readText('modules/dispatch.js'),
  orchestrator: readText('modules/orchestrator.js'),
  executive: readText('modules/executive.js'),
  approvals: readText('modules/approvals.js'),
  singleAssignment: readText('modules/single-assignment.js'),
  staffNotice: readText('core/staff-notice-service.js'),
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

/* ONE CARRIER PER ENDPOINT. Since 2026-10-05 every endpoint runs on one adopted flow (registers/flow-adoption.json)
   and the flow it replaced is retired, so the endpoint register's current configuration and the deployed set name the
   same flow. The row reports how that one flow addresses its mail. */
function adoptedCarrier(flow, endpointKey, subjectFilter = null) {
  const all = mailsIn('deployed', flow);
  const name = flow.replace(/__$/, '');
  if (!all) return ['ABSENT', `${name} (${endpointKey}) is not in the deployed set`];
  const mails = subjectFilter ? all.filter(subjectFilter) : all.filter((m) => !/Flow Run Record/i.test(m.subject));
  if (!mails.length) return ['ABSENT', `${name} (${endpointKey}) carries no such send`];
  return mails.every((m) => isDynamic(m.to))
    ? ['PROVISIONED', `${name}, the one flow ${endpointKey} runs on, addresses ${mails.length} send(s) from the request`]
    : ['MISADDRESSED', `${name} (${endpointKey}) hard-codes the recipient of ${mails.filter((m) => !isDynamic(m.to)).length} of ${mails.length} send(s)`];
}

/* The live status notifier (CG_Registry_Status_Notifier, item-change trigger) tells the submitter when the registry row
   changes status. A row it covers is PROVISIONED by a send of that subject addressed from the row. */
const notifierSend = (subject) => (mailsIn('deployed', 'CG_Registry_Status_Notifier__') ?? []).filter((m) => subject.test(m.subject) && isDynamic(m.to));
const both = (fragDeployed, setName, fragPkg) => [...(mailsIn('deployed', fragDeployed) ?? []), ...(mailsIn(setName, fragPkg) ?? [])];

/* STAFF NOTICES THE WORKSPACE SENDS ITSELF (ITEM-51). Seven actions e-mail the officer concerned through the EMAIL
   endpoint via core/staff-notice-service.js. A row is PROVISIONED only when all four hold, and the reason names the
   first that does not:
     1. the module calls the row's builder (StaffNotices.<builder>) — the action sends, it does not just record;
     2. every action the row names declares EMAIL as its backend in config/action-ownership.config.js — mandatory,
        not 'none' and not '.optional';
     3. the service sends through endpoint 'EMAIL', carries the row's template, and holds a failed send on PendingQueue;
     4. the flow EMAIL runs on (IP_SEND_EMAIL) addresses its send from the request.
   `notYet` is the state the row returns when the module does not send at all. */
function staffNotice(rowId, builder, srcKey, actions, notYet, notYetWhy) {
  if (!new RegExp(`StaffNotices\\.${builder}\\(`).test(src[srcKey] || '')) return [notYet, notYetWhy];
  const backendOf = (a) => (src.ownership.match(new RegExp(`(?<![\\w-])'?${a}'?\\s*:\\s*\\{[^}]*backend:\\s*'([^']+)'`)) || [])[1] || '(no spec)';
  const wrong = actions.filter((a) => backendOf(a) !== 'EMAIL');
  if (wrong.length) return [notYet, `${wrong.map((a) => `${a} declares backend ${backendOf(a)}`).join('; ')}: the send is not a mandatory EMAIL contract`];
  const svc = src.staffNotice;
  if (!(/WriteManager\.backend\(\{[^}]*endpoint:\s*'EMAIL'/.test(svc) && /PendingQueue\.enqueue/.test(svc) && svc.includes(`'${rowId}'`)))
    return ['UNIMPLEMENTED', `core/staff-notice-service.js does not send ${rowId} through EMAIL with a PendingQueue fallback`];
  const [carrier, why] = adoptedCarrier('IP_SEND_EMAIL__', 'EMAIL');
  if (carrier !== 'PROVISIONED') return [carrier, why];
  return ['PROVISIONED', `${actions.join(' and ')} e-mail${actions.length === 1 ? 's' : ''} the recipient through EMAIL (core/staff-notice-service.js · StaffNotices.${builder}); ${why}`];
}

const gatedState = (messageType, absentWhy) => {
  const carrier = carrierFor(messageType);
  if (carrier) return ['PROVISIONED', `${carrier} sends ${messageType}`];
  return ['ABSENT', hasSchedule()
    ? `a schedule now exists, but nothing sends ${messageType} (PRE-2's mechanism landed; the message did not)`
    : absentWhy];
};

const DERIVE = {
  'RN-001': () => {
    const ack = both('CG_Submission_Endpoint__', 'portal', 'SUBMISSION__CG_Submission_Endpoint').filter((m) => /received|reference/i.test(m.subject) && isDynamic(m.to) && !/registryTo|opsTo/.test(m.to));
    return ack.length
      ? ['PROVISIONED', 'the SUBMISSION identification package acknowledges the submission to the sender with its reference']
      : ['ABSENT', 'neither CG_Submission_Endpoint nor its identification package acknowledges a submission to the sender'];
  },

  'RN-002': () => notifierSend(/Action required on your submission/i).length
    ? ['PROVISIONED', 'CG_Registry_Status_Notifier tells the submitter when the row moves to action-required']
    : gatedState('action-required',
    'nothing in the estate fires on a schedule or a record change (PRE-2)'),

  'RN-003': () => notifierSend(/^@concat\('Decision: your submission/i).length
    ? ['PROVISIONED', 'CG_Registry_Status_Notifier tells the submitter when the row moves to approved']
    : gatedState('decision-outcome',
    'no status-change carrier and no mail action on WRITEBACK'),

  'RN-004': () => (notifierSend(/^@concat\('Decision on your submission/i).length
    ? ['PROVISIONED', 'CG_Registry_Status_Notifier tells the submitter when the row moves to declined']
    : gatedState('decision-outcome', 'no status-change carrier exists (PRE-2)')),

  /* The live WRITEBACK flow, CG_Portal_Writeback_Endpoint, is read first: it is the flow the endpoint runs on. */
  'RN-005': () => {
    const live = (mailsIn('deployed', 'CG_Portal_Writeback_Endpoint__') ?? []).filter((m) => /withdrawn/i.test(m.subject));
    if (live.length && live.every((m) => isDynamic(m.to))) {
      return ['PROVISIONED', `CG_Portal_Writeback_Endpoint, the one flow WRITEBACK runs on, sends the withdrawal notice to the submitter (${live.length} send)`];
    }
    return count(mailsIn('portal', 'WRITEBACK__CG_Portal_Writeback_Endpoint')) === 0
      ? ['ABSENT', 'neither the WRITEBACK flow nor its package carries a withdrawal notice']
      : ['PROVISIONED', 'the WRITEBACK package carries a mail action'];
  },

  /* The packages are correct and the live endpoint is not, so this row is about the gap
     between them: a citizen requesting a code today has it delivered to a shared mailbox. */
  /* The live VERIFY endpoint runs on one adopted flow, CG_Portal_Verification_Endpoint (registers/flow-adoption.json). */
  'RN-006': () => {
    const liveCode = (mailsIn('deployed', 'CG_Portal_Verification_Endpoint__') ?? []).filter((m) => /verification code/i.test(m.subject));
    if (!liveCode.length) return ['ABSENT', 'CG_Portal_Verification_Endpoint sends no verification code'];
    return liveCode.every((m) => isDynamic(m.to))
      ? ['PROVISIONED', 'CG_Portal_Verification_Endpoint, the one flow VERIFY runs on, addresses the code to the citizen']
      : ['MISADDRESSED', 'CG_Portal_Verification_Endpoint sends the code to a fixed mailbox'];
  },

  'RN-007': () => {
    const ack = (mailsIn('deployed', 'CG_Portal_Support_Endpoint__') ?? []).filter((m) => /Support request received/i.test(m.subject));
    return ack.length && ack.every((m) => isDynamic(m.to))
      ? ['PROVISIONED', 'CG_Portal_Support_Endpoint, the one flow SUPPORT runs on, acknowledges the case to the requester']
      : ['ABSENT', 'CG_Portal_Support_Endpoint sends no acknowledgement to the requester'];
  },

  'RN-008': () => gatedState('support-reply',
    'nothing reads or sends on Portal Support Cases.Status (PRE-2)'),

  /* A deployed flow already notifies the assignee from the task's AssignedTo field, and the
     package that replaces it sends nothing — so this is a regression waiting to be pasted,
     not an absence. The distinction changes the remediation: port an expression that exists,
     rather than design a message that does not. */
  'RN-009': () => {
    const notifies = (mails) => (mails ?? []).some((m) => isDynamic(m.to) && !/Flow Run Record/i.test(m.subject));
    const live = notifies(mailsIn('deployed', 'Single_Task_Assignment__'));
    const pkg = notifies(mailsIn('internal', 'SINGLE_ASSIGNMENT__Single_Task_Assignment'));
    if (live && !pkg) return ['REGRESSION', 'Single_Task_Assignment notifies the assignee; its identification package does not'];
    return live || pkg
      ? ['PROVISIONED', 'Single_Task_Assignment, the one flow SINGLE_ASSIGNMENT runs on, notifies the assignee, and its identification package keeps the send']
      : ['ABSENT', 'no assignment notice anywhere'];
  },

  'RN-010': () => {
    const sends = (mails) => (mails ?? []).filter((m) => !/Flow Run Record/i.test(m.subject));
    const live = sends(mailsIn('deployed', 'BULK OPS DATA RETRIEVAL HTTP__'));
    const pkg = sends(mailsIn('internal', 'BULK_ASSIGNMENT__BULK_OPS_DATA_RETRIEVAL_HTTP'));
    if ([...live, ...pkg].some((m) => isDynamic(m.to))) return ['PROVISIONED', `the BULK_ASSIGNMENT identification package sends each assignee an e-mail (${pkg.filter((m) => isDynamic(m.to)).length} send(s)); the live flow, as captured, sends only its run record`];
    return live.length ? ['MISADDRESSED', 'the bulk-assignment sends go to a fixed address'] : ['ABSENT', 'BULK OPS DATA RETRIEVAL HTTP (BULK_ASSIGNMENT) sends only its run record, and its package sends nothing'];
  },

  /* Copy-to and supporting parties are a Cc (or a second To) resolved from the request. */
  'RN-011': () => {
    const m = [...both('Single_Task_Assignment__', 'internal', 'SINGLE_ASSIGNMENT__Single_Task_Assignment'), ...both('BULK OPS DATA RETRIEVAL HTTP__', 'internal', 'BULK_ASSIGNMENT__BULK_OPS_DATA_RETRIEVAL_HTTP')];
    return m.some((x) => isDynamic(x.cc))
      ? ['PROVISIONED', 'an assignment send copies the supporting parties']
      : ['ABSENT', 'no assignment send (Single_Task_Assignment, BULK OPS DATA RETRIEVAL HTTP, or their packages) copies a supporting or copy-to party'];
  },

  'RN-012': () => staffNotice('RN-012', 'ackReminder', 'acknowledgment', ['remind-assignee'],
    'LOCAL_ONLY', 'remind-assignee sends nothing; nothing carries the reminder off the device'),

  'RN-013': () => gatedState('acknowledgement-overdue',
    'no acknowledgement-clock sweep can exist without a schedule (PRE-2)'),

  'RN-014': () => gatedState('due-breached',
    'no due-date sweep can exist without a schedule (PRE-2)'),

  /* A spec is not a carrier. notify-owner is PROVISIONED only once its declared backend is a
     mandatory contract key — not 'none', not '.optional' — so adding the spec (GAP-001) cannot
     by itself mark a notice as delivered. */
  'RN-015': () => staffNotice('RN-015', 'ownerNotice', 'fasttrack', ['notify-owner'],
    'LOCAL_ONLY', 'notify-owner sends nothing; nothing carries the notice off the device'),

  /* OTP_GENERATE and OTP_VERIFY run on IP_OTP_VERIFY (4dbe6dde); Web - OTP Generate and IP_OTP_Endpoint are retired. */
  'RN-016': () => adoptedCarrier('IP_OTP_VERIFY__', 'OTP_GENERATE', (m) => /verification code|sign-in code/i.test(m.subject)),

  'RN-017': () => staffNotice('RN-017', 'approvalRequest', 'approvals', ['create-approval'],
    'ABSENT', 'no mail action in any set fires on an approval request'),
  'RN-018': () => staffNotice('RN-018', 'approvalDecision', 'approvals', ['approve', 'reject'],
    'ABSENT', 'no mail action in any set fires on an approval decision'),
  'RN-019': () => {
    const own = staffNotice('RN-019', 'reassignment', 'singleAssignment', ['reassign'], 'ABSENT', '');
    if (own[0] === 'PROVISIONED') return own;
    const m = [...both('Single_Task_Assignment__', 'internal', 'SINGLE_ASSIGNMENT__Single_Task_Assignment'), ...both('IP_Dynamic_Global_Actions_Endpoint__', 'internal', 'DYNAMIC_ACTIONS__IP_Dynamic_Global_Actions_Endpoint')];
    return m.some((x) => /reassign/i.test(`${x.subject}${x.body}`) && isDynamic(x.to))
      ? ['PROVISIONED', 'a reassignment notice is sent to the new assignee']
      : ['ABSENT', 'no send in the assignment or dynamic-actions flows, or their packages, is a reassignment notice'];
  },

  /* Built 2026-10-18 (owner): the comment is e-mailed to the record's assignee as a staff notice. */
  'RN-020': () => staffNotice('RN-020', 'comment', 'comments', ['add-comment'], 'ABSENT', 'add-comment raises no notification to anyone but the actor'),

  /* TWO CARRIERS NOW EXIST IN THE TENANT AND ONLY ONE OF THEM IS RIGHT.
     `CG_SEND_EMAIL` was created on 2026-09-02 from DGO_SEND_EMAIL and addresses every send from
     the payload. `Web - Send Email` is still deployed and still hard-codes the registry mailbox.
     Which one the officer's correspondence reaches is decided by the URL in `config.local.js`
     under `EMAIL` — a file this repository deliberately does not hold, because it carries the
     signed trigger URLs. So the estate cannot be read as fixed while both are present: the
     honest reading is that the fix is deployed and not yet wired. See PRE-5. */
  'RN-021': () => adoptedCarrier('IP_SEND_EMAIL__', 'EMAIL'),

  /* Built 2026-10-18 (owner): an Email dispatch sends the approved response through the Correspondence Email Desk
     (EMAIL, IP_SEND_EMAIL) and only then marks the document Treated through DYNAMIC_ACTIONS dispatchoutbound. */
  'RN-022': () => {
    if (!(/CorrespondenceEmailService\.sendDraft\(/.test(src.dispatch) && /byEmail/.test(src.dispatch))) return ['UNIMPLEMENTED', 'the Dispatch screen records an Email dispatch and sends nothing'];
    return adoptedCarrier('IP_SEND_EMAIL__', 'EMAIL');
  },

  'RN-023': () => (/DISPATCH_FAILED/.test(src.authority) && /actionFailureMessage/.test(src.authority)
    ? ['PROVISIONED', 'the governance layer carries an operator sentence for DISPATCH_FAILED']
    : ['ABSENT', 'no operator notice on dispatch failure']),

  'RN-024': () => adoptedCarrier('IP_SEND_EMAIL__', 'EMAIL'),

  'RN-025': () => {
    const liveUpload = (mailsIn('deployed', 'CG_Upload_Endpoint__') ?? []).some((m) => /Flow Run Record/i.test(m.subject));
    const liveWb = (mailsIn('deployed', 'CG_Portal_Writeback_Endpoint__') ?? []).some((m) => /Flow Run Record/i.test(m.subject));
    const pkgUpload = (mailsIn('portal', 'UPLOAD__CG_Upload_Endpoint') ?? []).filter((m) => /Flow Run Record/i.test(m.subject)).length;
    const pkgWb = (mailsIn('portal', 'WRITEBACK__CG_Portal_Writeback_Endpoint') ?? []).filter((m) => /Flow Run Record/i.test(m.subject)).length;
    if ((liveUpload || liveWb) && pkgUpload === 0 && pkgWb === 0) {
      return ['REGRESSION', 'the deployed upload and writeback flows capture a run record; the packages that replace them do not'];
    }
    return liveUpload || liveWb || pkgUpload || pkgWb
      ? ['PROVISIONED', 'a run record is captured on upload or writeback']
      : ['ABSENT', 'neither CG_Upload_Endpoint nor CG_Portal_Writeback_Endpoint, nor their packages, captures a run record'];
  },

  /* AUTO_SCHEDULED_SWEEP reads the failed receipts (Get_Undeliverable_Receipts) and alerts the operator. */
  'RN-026': () => {
    const alert = (mailsIn('deployed', 'AUTO_SCHEDULED_SWEEP__') ?? []).some((m) => /Undeliverable/.test(m.subject) || /Get_Undeliverable_Receipts/.test(m.subject));
    return outbox.readers.length && (alert || carrierFor('outbox-failure-alert'))
      ? ['PROVISIONED', 'AUTO_SCHEDULED_SWEEP reads the failed outbox receipts and alerts the operator']
      : ['ABSENT', `Portal Outbox Receipts has ${outbox.writers.length} writers and no reader that reports failures`];
  },

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

  /* Global_Gap_Remediation_Provisioning was a one-off and is retired (2026-10-05). The provisioning run the estate
     keeps is 01 - GOV - Provision HTTP Flow Registry. */
  'RN-028': () => {
    const mails = mailsIn('deployed', '01 - GOV - Provision HTTP Flow Registry');
    if (!mails?.length) return ['ABSENT', 'no provisioning run sends a report'];
    return anyDynamic(mails)
      ? ['PROVISIONED', 'the provisioning report is addressed to the caller']
      : ['MISADDRESSED', `01 - GOV - Provision HTTP Flow Registry sends its report to the fixed registry mailbox only (${mails.map((m) => m.to).join(', ')})`];
  },

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

  /* Withdrawn by owner decision (2026-10-03): SMS is not to be provisioned. The row holds only
     while nothing offers it — the sign-in screen offering SMS again, or an SMS carrier appearing,
     each breaks the decision and reads as a failure rather than as progress. */
  'RN-033': () => {
    if (/data-channel="sms"|Phone \(SMS\)|via SMS/i.test(src.welcome)) {
      return ['UNIMPLEMENTED', 'the sign-in screen offers SMS again, against the 2026-10-03 decision'];
    }
    return sms.length === 0
      ? ['WITHDRAWN', 'nothing offers SMS and no SMS carrier exists, as decided on 2026-10-03']
      : ['UNIMPLEMENTED', `an SMS carrier exists (${sms[0]}) though SMS was withdrawn on 2026-10-03`];
  },

  /* escalate-non-ack was removed from the acknowledgment charter (2026-10-16): it never had a handler, and the
     scheduled sweep escalates an unacknowledged assignment (RN-013). A charter that names it again needs a handler here. */
  'RN-034': () => (/'escalate-non-ack'/.test(readText('config/module-boundaries.config.js'))
    ? ['LOCAL_ONLY', 'the acknowledgment charter names escalate-non-ack, which has no handler and sends nothing']
    : staffNotice('RN-034', 'escalation', 'fasttrack', ['escalate-priority'],
      'LOCAL_ONLY', 'escalate-priority writes an escalation record to browser state and tells no one')),

  'RN-035': () => (carrierFor('task-reminder')
    ? ['PROVISIONED', 'set-reminder reaches a carrier that can fire at dueAt']
    : ['LOCAL_ONLY', 'set-reminder writes State.notifications; nothing sends task-reminder']),

  'RN-036': () => (/executive-escalate/.test(src.executive)
    ? staffNotice('RN-036', 'delegation', 'executive', ['executive-escalate'],
      'ABSENT', 'executive-escalate sets Delegated and no mail action in any set fires on it')
    : ['ABSENT', 'no delegation action found']),

  'RN-037': () => {
    const notices = [];
    for (const [flow, mails] of Object.entries(sets.deployed.byFile)) {
      for (const m of mails) if (/Glass Pane Portal submission/i.test(m.subject)) notices.push({ flow, to: m.to });
    }
    const pkg = (mailsIn('portal', 'SUBMISSION__CG_Submission_Endpoint') ?? []).filter((m) => /New submission/i.test(m.subject));
    if (pkg.length && pkg.every((m) => isDynamic(m.to))) return ['PROVISIONED', 'the SUBMISSION identification package notifies the registry address in Flow Configuration (registryTo) of each new submission'];
    if (notices.length && notices.every((n) => !isDynamic(n.to))) return ['MISADDRESSED', `${notices.length} submission notices, every one to a fixed individual`];
    return notices.length ? ['PROVISIONED', 'the submission notice reaches a monitored address'] : ['ABSENT', 'no submission notice'];
  },

  'RN-038': () => {
    const m = [...both('Single_Task_Assignment__', 'internal', 'SINGLE_ASSIGNMENT__Single_Task_Assignment'), ...both('BULK OPS DATA RETRIEVAL HTTP__', 'internal', 'BULK_ASSIGNMENT__BULK_OPS_DATA_RETRIEVAL_HTTP')];
    return m.some((x) => isDynamic(x.cc))
      ? ['PROVISIONED', 'an assignment send copies the copy-to and inform list']
      : ['ABSENT', 'no assignment send copies the cascade\'s copy-to or inform list'];
  },

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
console.log(`  portal packages         ${sets.portal.files.length} (identification Phase 3)`);
console.log(`  internal packages       ${sets.internal.files.length} (identification Phase 4)`);
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
   + 'have no clock. Re-enable AUTO_SCHEDULED_SWEEP (8c19b45c) and export it back.');
if (hasSchedule()) console.log(`     ${[...triggers.scheduled, ...triggers.recordDriven].join(', ')}`);

/* PRE-3, resolved 2026-10-06: the gateway fragment set is retired and the discovery scan reads the adopted definitions. */
ok(!/correspondence-gateway/.test(src.discovery),
   'PRE-3 resolved: the generated catalogue reads the adopted definitions, not the retired gateway fragment set',
   'process-discovery.mjs reads the retired gateway fragment set again');

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
  /* Every Office 365 step signs in as the registry mailbox (owner decision, 2026-10-06, register ITEM-77): no exceptions. */
  const strays = [...bound.entries()].filter(([id]) => id !== RECORDED).flatMap(([id, files]) => files.map((f) => `${f} → ${id.slice(0, 24)}…`));
  ok(bound.has(RECORDED) && strays.length === 0,
     `every mail-sending package binds the connection recorded in the sign-off (${RECORDED.slice(0, 8)}…)`,
     bound.size === 0 ? 'no package binds an Office 365 connection' : strays.join('; '));
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
  /* The exports that carried packageProvenance are retired (2026-10-05); the tenant's naming they carried is kept in
     registers/tenant-function-proof.json, read from the commit the retirement record names. */
  if (!named.length) {
    const proof = readJson(join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/tenant-function-proof.json'));
    for (const c of proof?.packageConnections ?? []) named.push({ flow: c.flow, api: c.api, name: c.displayName });
  }
  const wrong = named.filter((n) => n.name.toLowerCase() !== DECIDED);
  ok(named.length > 0 && wrong.length === 0,
     `PRE-1 confirmed by the tenant: all ${named.length} connection resource(s) in the exported `
     + `packages are named ${DECIDED}`,
     named.length === 0
       ? 'no exported package carries packageProvenance — the mailbox is still decided but unconfirmed'
       : wrong.map((n) => `${n.flow}/${n.api} → ${n.name || '(unnamed)'}`).join(', '));
}

/* PRE-5, resolved 2026-10-05: the rebuilt carriers were deployed BESIDE the flows they replaced, so the endpoint URL
   decided which ran. Every endpoint now runs on one adopted flow and the old carriers are retired
   (registers/flow-adoption.json). This asserts that it stays so: no retired carrier is back in the deployed set, and the
   flow each endpoint runs on addresses its mail from the request. */
{
  const pairs = [['Web - Send Email', 'IP_SEND_EMAIL__', 'EMAIL'],
                 ['Web - OTP Generate', 'IP_OTP_VERIFY__', 'OTP_GENERATE, OTP_VERIFY'],
                 ['CG_SEND_EMAIL', 'IP_SEND_EMAIL__', 'EMAIL'],
                 ['IP_OTP_Endpoint', 'IP_OTP_VERIFY__', 'OTP_GENERATE, OTP_VERIFY']];
  const back = pairs.filter(([o]) => mailsIn('deployed', `${o}__`));
  const wrongCarrier = [...new Set(pairs.map(([, n, k]) => `${n}|${k}`))]
    .map((x) => x.split('|')).filter(([n]) => !anyDynamic(mailsIn('deployed', n)));
  ok(back.length === 0 && wrongCarrier.length === 0,
     'PRE-5 resolved: each endpoint has one carrier, and it addresses from the request',
     [...back.map(([o, n, k]) => `${o} is deployed again beside ${n} (${k})`),
      ...wrongCarrier.map(([n, k]) => `${n} (${k}) does not address from the request`)].join('; '));
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

const OUT = 'docs/folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md';
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
