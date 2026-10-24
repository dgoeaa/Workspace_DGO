#!/usr/bin/env node
/**
 * DGO_SCHEDULED_SWEEP — the estate's first scheduled flow.
 *
 *   npm run sweep            # build both artifacts
 *   npm run sweep -- --check # fail if the committed artifacts are stale
 *
 * WHY THIS FLOW EXISTS.
 *
 * Every one of the 60 exported flows waits to be called: 59 carry a Request trigger and the 60th
 * a OneDrive file trigger. Nothing in the estate fires on a clock or a record change. Eight rows
 * of `config/notification-matrix.config.js` are notifications about something changing or a clock
 * expiring, and none of them can exist until one scheduled flow does. This is that flow, and it
 * carries all eight.
 *
 * TWO ARTIFACTS, BECAUSE A TRIGGER CANNOT BE PASTED.
 *
 * A designer clipboard package is a Scope node — actions only. All fourteen packages in this
 * repository are trigger-free, and the operator walkthrough's paste procedure says to keep the
 * existing trigger and replace only what is below it. So a Recurrence trigger cannot arrive by
 * paste, and this script emits two things:
 *
 *   import-package/DGO_SCHEDULED_SWEEP.zip        a legacy Import Package — carries the trigger,
 *                                                 creates the flow outright
 *   designer-paste/DGO_SCHEDULED_SWEEP...json     the same body as a clipboard scope, for pasting
 *                                                 into a Recurrence flow created by hand
 *
 * The zip is the supported route and the one to use. The paste package exists because the rest of
 * the estate is deployed that way and an operator mid-session should not have to switch tools.
 *
 * IDEMPOTENCY WITHOUT A SINGLE NEW COLUMN.
 *
 * A sweep that runs hourly must not re-send hourly. The obvious design is a "last notified"
 * column on each swept list — which means provisioning new columns on adopted lists before the
 * flow can run at all. This uses `Portal Outbox Receipts` instead: every send already writes a
 * receipt whose Title is `<messageType>:<key>`, so the ledger that records what was sent is also
 * the record of what must not be sent again. Each branch queries it before sending.
 *
 * That removes the provisioning dependency entirely, and makes the outbox the single answer to
 * "was this person told?" — which is what the list is for.
 *
 * EVERY COLUMN NAMED HERE IS DEPLOYED. `Acknowledgement_x0020_Due_x0020_`, `Acknowledge_x0020_Task`,
 * `DueDate`, `Progress`, `AssignedTo`, `Assigned` and `Reference_ID` are all recorded as deployed
 * on Global Tracking Queue in `docs/deployment/internal/internal-field-evidence.json`. Nothing is
 * invented and nothing is pending.
 *
 * NO SECRET IS WRITTEN. Connection ids name environment resources; the credential lives in the
 * connection. No trigger URL is read or emitted — a Recurrence trigger has none.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  T, SITE, ACT, NEDMS, get, post, patch, compose, cond, ok, meta,
  CONNECTIONS, normalizeItemParams,
} from './lib/designer-paste-builder.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
/* Repo rule: never slice a path root off with string replacement — it breaks on Windows and on
   any checkout whose path differs. */
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const PASTE_DIR = join(ROOT, 'docs/deployment/internal/flows/designer-paste/');
const PKG_DIR = join(ROOT, 'docs/deployment/internal/flows/import-package/');

/* Global Tracking Queue — the task list the assignment cascade writes its clocks onto. */
const GTQ = { t: 'ee82725a-c408-45e2-a8e8-facf7a092047', d: ACT };
const O365 = 'shared_office365';

const nowFilter = "@{formatDateTime(utcNow(),'yyyy-MM-ddTHH:mm:ssZ')}";

/* THE LIST VIEW THRESHOLD, AND WHY BOTH HALVES OF THIS ARE NEEDED.
 *
 * The first live run of this sweep returned, twice:
 *
 *   {"status":400,"message":"The attempted operation is prohibited because it exceeds the
 *    list view threshold."}
 *
 * — once for Get_Ack_Overdue and once for Get_Due_Breached. Global Tracking Queue held 15,804
 * items at capture, three times SharePoint's 5,000 threshold, and on a list over that threshold
 * SharePoint refuses any query it cannot resolve through an index. Both queries filtered AND
 * sorted on a date column that is not indexed, so neither could be resolved at all.
 *
 * Indexing the two columns is necessary and is NOT sufficient. The threshold applies twice: the
 * query must be resolvable through an index, AND the clause it resolves must return fewer than
 * 5,000 rows. `DueDate lt now` on a task list is every task ever due — on a list of this size
 * that is far over the limit even with a perfect index. An unbounded "everything overdue" query
 * cannot be made to work; it has to stop being unbounded.
 *
 * So the window is closed at both ends. An hourly sweep only has to notice what has breached
 * RECENTLY: anything older either already has an outbox receipt or is past the point where a
 * fresh notice helps. Thirty days is wide enough to cover an outage of any plausible length and
 * narrow enough to keep the indexed range small.
 *
 * DESCENDING, NOT ASCENDING — a second defect the same change fixes. Ascending order put the
 * OLDEST breaches first, and those are precisely the ones already notified: they would occupy
 * the whole $top window until they aged out, so on any list with more in-window breaches than
 * the page size, a freshly breached task would never be reached. Newest-first means a new
 * breach is always on the first page. The cost is the mirror case — a breach older than the
 * window that was never notified is never picked up — which is why the window is generous and
 * why Portal Outbox Receipts remains the record of what was actually sent.
 *
 * The page size is raised from 100 to 500 for the same reason: headroom over the already-sent
 * items that necessarily share the page.
 */
const SWEEP_WINDOW_DAYS = 30;
const windowStart = `@{formatDateTime(addDays(utcNow(),-${SWEEP_WINDOW_DAYS}),'yyyy-MM-ddTHH:mm:ssZ')}`;
const SWEEP_PAGE = 500;
/* The lower bound is written FIRST. SharePoint resolves a large-list query on the leading
   clause, and `ge <30 days ago>` is the selective half — `lt now` on its own is the whole
   history of the list, which is the query that failed. */
const breachedWindow = (col) => `${col} ge '${windowStart}' and ${col} lt '${nowFilter}'`;

/* A SharePoint action against a list this builder does not carry in T. Same shape as the shared
   `sp()` helper, which keys its site lookup off T. */
function spOn(op, list, params, after) {
  const a = {
    type: 'OpenApiConnection',
    inputs: { parameters: { dataset: list.d, table: list.t, ...params }, host: { apiId: `/providers/Microsoft.PowerApps/apis/shared_sharepointonline`, connection: 'shared_sharepointonline', operationId: op } },
    metadata: meta(),
  };
  if (after) a.runAfter = after;
  return a;
}

const mail = (to, subject, body, after) => ({
  type: 'OpenApiConnection',
  inputs: {
    parameters: {
      'emailMessage/To': to,
      'emailMessage/Subject': subject,
      'emailMessage/Body': body,
      'emailMessage/Importance': 'Normal',
    },
    host: { apiId: `/providers/Microsoft.PowerApps/apis/${O365}`, connection: O365, operationId: 'SendEmailV2' },
  },
  runAfter: after,
  metadata: meta(),
});

const foreach = (expr, actions, after) => {
  const a = { type: 'Foreach', foreach: expr, actions, metadata: meta() };
  if (after) a.runAfter = after;
  /* One at a time. A sweep writes receipts keyed on a reference and reads them back to decide
     whether to send; running the iterations concurrently races that read against its own write
     and double-sends. Correctness over throughput on an hourly job. */
  a.runtimeConfiguration = { concurrency: { repetitions: 1 } };
  return a;
};

const scopeAfterAny = (name) => ({ [name]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] });

/* The dedupe read. `Title eq '<messageType>:<key>'` is the convention every existing outbox
   writer already follows, so this reads the receipts the estate is already producing. */
const alreadySent = (tag, titleExpr, after) => ({
  [`Get_Sent_${tag}`]: get(T.outbox, { $filter: titleExpr, $top: 1 }, after),
  [`Compose_Already_${tag}`]: compose(
    `@greater(length(coalesce(outputs('Get_Sent_${tag}')?['body/value'],json('[]'))),0)`,
    ok(`Get_Sent_${tag}`)),
});

const receipt = (tag, messageType, titleExpr, recipientExpr, referenceExpr, sendAction) =>
  post(T.outbox, {
    'item/Title': titleExpr,
    'item/MessageType': messageType,
    'item/RecipientEmail': recipientExpr,
    'item/Reference': referenceExpr,
    'item/SentAtUtc': '@utcNow()',
    'item/Status': `@if(equals(actions('${sendAction}')?['status'],'Succeeded'),'sent','failed')`,
    'item/Attempts': 1,
    'item/LastError': `@if(equals(actions('${sendAction}')?['status'],'Succeeded'),'',string(actions('${sendAction}')?['error']))`,
  }, { [sendAction]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] });

const html = (heading, lines) =>
  `<div style="font-family:Arial,sans-serif;padding:20px"><h2 style="color:#008751">${heading}</h2>${lines}</div>`;

/* ── Scope 1 — RN-013, an acknowledgement clock expired unacknowledged ───────────────────── */
const ackScope = {
  type: 'Scope',
  metadata: meta(),
  actions: {
    Get_Ack_Overdue: spOn('GetItems', GTQ, {
      $filter: breachedWindow('Acknowledgement_x0020_Due_x0020_'),
      $top: SWEEP_PAGE,
      $orderby: 'Acknowledgement_x0020_Due_x0020_ desc',
    }),
    /* Server-side filtering stops at the date. Whether the task was acknowledged is evaluated
       here rather than in the $filter because Acknowledge_x0020_Task is a Yes/No column whose
       OData spelling differs between a boolean and a choice-backed list, and a filter that is
       wrong about that returns everything or nothing without saying so. */
    Filter_Ack_Unacknowledged: {
      type: 'Query',
      inputs: {
        from: "@coalesce(outputs('Get_Ack_Overdue')?['body/value'],json('[]'))",
        where: "@and(not(equals(coalesce(item()?['Acknowledge_x0020_Task'],false),true)),not(empty(coalesce(item()?['AssignedTo'],item()?['Assigned'],''))))",
      },
      runAfter: ok('Get_Ack_Overdue'),
      metadata: meta(),
    },
    Foreach_Ack: foreach("@body('Filter_Ack_Unacknowledged')", {
      Compose_Ack_Ref: compose("@string(coalesce(item()?['Reference_ID'],item()?['RefIDD'],item()?['ID']))"),
      Compose_Ack_To: compose("@toLower(trim(string(coalesce(item()?['AssignedTo'],item()?['Assigned'],''))))", ok('Compose_Ack_Ref')),
      ...alreadySent('Ack',
        "@concat('Title eq ''acknowledgement-overdue:',replace(outputs('Compose_Ack_Ref'),'''',''''''),'''')",
        ok('Compose_Ack_To')),
      Condition_Ack_Send: cond(
        { equals: ["@outputs('Compose_Already_Ack')", false] },
        {
          Send_Ack_Overdue: mail(
            "@outputs('Compose_Ack_To')",
            "@concat('Acknowledgement overdue — ',outputs('Compose_Ack_Ref'))",
            html('Acknowledgement overdue',
              "<p>This task has not been acknowledged and its acknowledgement date has passed.</p>" +
              "<p><b>Reference:</b> @{outputs('Compose_Ack_Ref')}</p>" +
              "<p><b>Task:</b> @{item()?['Title']}</p>" +
              "<p><b>Acknowledgement was due:</b> @{item()?['Acknowledgement_x0020_Due_x0020_']}</p>" +
              "<p>Open the task in DGO Digital Ops and acknowledge it.</p>"),
            null),
          Create_Ack_Receipt: receipt('Ack', 'acknowledgement-overdue',
            "@concat('acknowledgement-overdue:',outputs('Compose_Ack_Ref'))",
            "@outputs('Compose_Ack_To')", "@outputs('Compose_Ack_Ref')", 'Send_Ack_Overdue'),
        },
        null,
        ok('Compose_Already_Ack')),
    }, ok('Filter_Ack_Unacknowledged')),
  },
};

/* ── Scope 2 — RN-014, a due date breached ──────────────────────────────────────────────── */
const dueScope = {
  type: 'Scope',
  metadata: meta(),
  runAfter: scopeAfterAny('Scope_Ack_Overdue'),
  actions: {
    Get_Due_Breached: spOn('GetItems', GTQ, {
      $filter: breachedWindow('DueDate'),
      $top: SWEEP_PAGE,
      $orderby: 'DueDate desc',
    }),
    Filter_Due_Open: {
      type: 'Query',
      inputs: {
        from: "@coalesce(outputs('Get_Due_Breached')?['body/value'],json('[]'))",
        where: "@and(not(equals(toLower(string(coalesce(item()?['Progress']?['Value'],item()?['Progress'],''))),'completed')),not(empty(coalesce(item()?['AssignedTo'],item()?['Assigned'],''))))",
      },
      runAfter: ok('Get_Due_Breached'),
      metadata: meta(),
    },
    Foreach_Due: foreach("@body('Filter_Due_Open')", {
      Compose_Due_Ref: compose("@string(coalesce(item()?['Reference_ID'],item()?['RefIDD'],item()?['ID']))"),
      Compose_Due_To: compose("@toLower(trim(string(coalesce(item()?['AssignedTo'],item()?['Assigned'],''))))", ok('Compose_Due_Ref')),
      ...alreadySent('Due',
        "@concat('Title eq ''due-breached:',replace(outputs('Compose_Due_Ref'),'''',''''''),'''')",
        ok('Compose_Due_To')),
      Condition_Due_Send: cond(
        { equals: ["@outputs('Compose_Already_Due')", false] },
        {
          Send_Due_Breached: mail(
            "@outputs('Compose_Due_To')",
            "@concat('Overdue — ',outputs('Compose_Due_Ref'))",
            html('Task overdue',
              "<p>This task has passed its due date and is not recorded as complete.</p>" +
              "<p><b>Reference:</b> @{outputs('Compose_Due_Ref')}</p>" +
              "<p><b>Task:</b> @{item()?['Title']}</p>" +
              "<p><b>Due:</b> @{item()?['DueDate']}</p>"),
            null),
          Create_Due_Receipt: receipt('Due', 'due-breached',
            "@concat('due-breached:',outputs('Compose_Due_Ref'))",
            "@outputs('Compose_Due_To')", "@outputs('Compose_Due_Ref')", 'Send_Due_Breached'),
        },
        null,
        ok('Compose_Already_Due')),
    }, ok('Filter_Due_Open')),
  },
};

/* ── Scope 3 — RN-027 retry, RN-026 alert ───────────────────────────────────────────────── */
const outboxScope = {
  type: 'Scope',
  metadata: meta(),
  runAfter: scopeAfterAny('Scope_Due_Breached'),
  actions: {
    Get_Failed_Receipts: get(T.outbox, {
      $filter: "Status eq 'failed' and Attempts lt 3",
      $top: 100,
      $orderby: 'SentAtUtc asc',
    }),
    Foreach_Failed: foreach("@coalesce(outputs('Get_Failed_Receipts')?['body/value'],json('[]'))", {
      Compose_Retry_To: compose("@toLower(trim(string(coalesce(item()?['RecipientEmail'],''))))"),
      Condition_Retry_Addressable: cond(
        { and: [{ not: { equals: ["@outputs('Compose_Retry_To')", ''] } }] },
        {
          Send_Retry: mail(
            "@outputs('Compose_Retry_To')",
            "@concat('NITDA — ',coalesce(item()?['MessageType'],'notification'),' — ',coalesce(item()?['Reference'],''))",
            html('NITDA notification',
              "<p>This message could not be delivered when it was first sent, and is being resent.</p>" +
              "<p><b>Reference:</b> @{coalesce(item()?['Reference'],'')}</p>" +
              "<p><b>Type:</b> @{coalesce(item()?['MessageType'],'')}</p>"),
            null),
          /* The counter advances whether or not the resend worked, so three failures retire the
             row rather than retrying it forever. */
          Patch_Retry_Attempt: patch(T.outbox, {
            id: "@item()?['ID']",
            'item/Title': "@item()?['Title']",
            'item/Attempts': "@add(int(coalesce(item()?['Attempts'],1)),1)",
            'item/Status': "@if(equals(actions('Send_Retry')?['status'],'Succeeded'),'sent','failed')",
            'item/LastError': "@if(equals(actions('Send_Retry')?['status'],'Succeeded'),'',string(actions('Send_Retry')?['error']))",
          }, { Send_Retry: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }),
        },
        null,
        ok('Compose_Retry_To')),
    }, ok('Get_Failed_Receipts')),

    /* RN-026 — anything that has exhausted its retries is reported once to the administrator. */
    Get_Exhausted_Receipts: get(T.outbox, {
      $filter: "Status eq 'failed' and Attempts ge 3",
      $top: 100,
    }, scopeAfterAny('Foreach_Failed')),
    Compose_Exhausted_Count: compose(
      "@length(coalesce(outputs('Get_Exhausted_Receipts')?['body/value'],json('[]')))",
      ok('Get_Exhausted_Receipts')),
    Condition_Exhausted_Any: cond(
      { greater: ["@outputs('Compose_Exhausted_Count')", 0] },
      {
        ...alreadySent('Exhausted',
          "@concat('Title eq ''outbox-failure-alert:',formatDateTime(utcNow(),'yyyy-MM-dd'),'''')",
          null),
        Condition_Exhausted_Send: cond(
          { equals: ["@outputs('Compose_Already_Exhausted')", false] },
          {
            Send_Outbox_Alert: mail(
              'dgsRegistry@nitda.gov.ng',
              "@concat('[ACTION REQUIRED] ',string(outputs('Compose_Exhausted_Count')),' undelivered notification(s)')",
              html('Undelivered notifications',
                "<p>@{outputs('Compose_Exhausted_Count')} message(s) in Portal Outbox Receipts have failed three times and will not be retried.</p>" +
                "<p>Open the list and review rows where Status is failed and Attempts is 3 or more.</p>"),
              null),
            Create_Outbox_Alert_Receipt: receipt('Exhausted', 'outbox-failure-alert',
              "@concat('outbox-failure-alert:',formatDateTime(utcNow(),'yyyy-MM-dd'))",
              'dgsRegistry@nitda.gov.ng', "@string(outputs('Compose_Exhausted_Count'))", 'Send_Outbox_Alert'),
          },
          null,
          ok('Compose_Already_Exhausted')),
      },
      null,
      ok('Compose_Exhausted_Count')),
  },
};

/* ── Scope 4 — RN-002, RN-003, RN-004 citizen status notices ────────────────────────────── */
const REGISTRY = { t: T.registry, d: SITE[T.registry] };
const statusBranch = (tag, statusValue, messageType, heading, bodyHtml) => ({
  [`Get_Status_${tag}`]: spOn('GetItems', REGISTRY, {
    $filter: `Status eq '${statusValue}'`,
    $top: 100,
    $orderby: 'Modified desc',
  }),
  [`Foreach_Status_${tag}`]: foreach(`@coalesce(outputs('Get_Status_${tag}')?['body/value'],json('[]'))`, {
    [`Compose_${tag}_Ref`]: compose("@string(coalesce(item()?['ReferenceId'],item()?['Title'],item()?['ID']))"),
    [`Compose_${tag}_To`]: compose("@toLower(trim(string(coalesce(item()?['SenderEmail'],''))))", ok(`Compose_${tag}_Ref`)),
    ...alreadySent(tag,
      `@concat('Title eq ''${messageType}:',replace(outputs('Compose_${tag}_Ref'),'''',''''''),'''')`,
      ok(`Compose_${tag}_To`)),
    [`Condition_${tag}_Send`]: cond(
      { and: [
        { equals: [`@outputs('Compose_Already_${tag}')`, false] },
        { not: { equals: [`@outputs('Compose_${tag}_To')`, ''] } },
      ] },
      {
        [`Send_${tag}`]: mail(
          `@outputs('Compose_${tag}_To')`,
          `@concat('${heading} — ',outputs('Compose_${tag}_Ref'))`,
          html(heading, bodyHtml.replace(/__REF__/g, `@{outputs('Compose_${tag}_Ref')}`)),
          null),
        [`Create_${tag}_Receipt`]: receipt(tag, messageType,
          `@concat('${messageType}:',outputs('Compose_${tag}_Ref'))`,
          `@outputs('Compose_${tag}_To')`, `@outputs('Compose_${tag}_Ref')`, `Send_${tag}`),
      },
      null,
      ok(`Compose_Already_${tag}`)),
  }, ok(`Get_Status_${tag}`)),
});

const statusScope = {
  type: 'Scope',
  metadata: meta(),
  runAfter: scopeAfterAny('Scope_Outbox'),
  actions: {
    ...statusBranch('Approved', 'approved', 'decision-outcome', 'Decision issued',
      "<p>A decision has been issued on your submission.</p><p><b>Tracking ID:</b> __REF__</p>" +
      "<p><b>Outcome:</b> Approved.</p><p>Open the tracking page with this ID and the email address you used to see the full record.</p>"),
    ...statusBranch('Declined', 'declined', 'decision-outcome', 'Decision issued',
      "<p>A decision has been issued on your submission.</p><p><b>Tracking ID:</b> __REF__</p>" +
      "<p><b>Outcome:</b> Not approved on this submission.</p><p>The reasons are recorded on your tracking page.</p>"),
    ...statusBranch('ActionRequired', 'action-required', 'action-required', 'Action required',
      "<p>Something is needed from you before your submission can continue.</p>" +
      "<p><b>Tracking ID:</b> __REF__</p><p>Open the tracking page with this ID and the email address you used, and respond there.</p>"),
  },
};

/* ── Scope 5 — RN-008 support replies ───────────────────────────────────────────────────── */
const SUPPORT = { t: T.support, d: SITE[T.support] };
const supportScope = {
  type: 'Scope',
  metadata: meta(),
  runAfter: scopeAfterAny('Scope_Status'),
  actions: {
    Get_Support_Closed: spOn('GetItems', SUPPORT, {
      $filter: "Status eq 'closed'",
      $top: 100,
      $orderby: 'Modified desc',
    }),
    Foreach_Support: foreach("@coalesce(outputs('Get_Support_Closed')?['body/value'],json('[]'))", {
      Compose_Support_Ref: compose("@string(coalesce(item()?['Title'],item()?['ID']))"),
      Compose_Support_To: compose("@toLower(trim(string(coalesce(item()?['Email'],''))))", ok('Compose_Support_Ref')),
      ...alreadySent('Support',
        "@concat('Title eq ''support-reply:',replace(outputs('Compose_Support_Ref'),'''',''''''),'''')",
        ok('Compose_Support_To')),
      Condition_Support_Send: cond(
        { and: [
          { equals: ["@outputs('Compose_Already_Support')", false] },
          { not: { equals: ["@outputs('Compose_Support_To')", ''] } },
        ] },
        {
          Send_Support_Reply: mail(
            "@outputs('Compose_Support_To')",
            "@concat('NITDA support case ',outputs('Compose_Support_Ref'),' — closed')",
            html('Support case closed',
              "<p>Your support case has been closed.</p><p><b>Case:</b> @{outputs('Compose_Support_Ref')}</p>" +
              "<p>@{coalesce(item()?['Message'],'')}</p><p>Reply to this address if the matter is not resolved.</p>"),
            null),
          Create_Support_Reply_Receipt: receipt('Support', 'support-reply',
            "@concat('support-reply:',outputs('Compose_Support_Ref'))",
            "@outputs('Compose_Support_To')", "@outputs('Compose_Support_Ref')", 'Send_Support_Reply'),
        },
        null,
        ok('Compose_Already_Support')),
    }, ok('Get_Support_Closed')),
  },
};

/* ── Telemetry ──────────────────────────────────────────────────────────────────────────
   Named in the estate's own vocabulary rather than a private one. The build standard requires
   `Scope_Flow_Data_Capture` and `Compose_Flow_Run_Record` of every package, and that half of the
   standard applies to a scheduled flow exactly as it does to a request one: a run that nobody
   called still has to leave a record of what it did. What does NOT carry over is the request and
   response half — there is no caller and no inbound URL — and the validator records that as a
   category, not as a pass.

   RunRecordJson is deliberately not written. The column is still PENDING in
   portal-field-spec.json, and a write naming a column the list does not have rejects the whole
   item, which would stop the sweep saving at all. The record is composed and available; it lands
   in the column the day the column exists. */
const telemetryScope = {
  type: 'Scope',
  metadata: meta(),
  runAfter: scopeAfterAny('Scope_Support'),
  actions: {
    Compose_Flow_Run_Record: compose({
      flow: "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
      run: "@workflow()?['run']?['name']",
      startedAtUtc: "@variables('varReceivedAtUtc')",
      completedAtUtc: '@utcNow()',
      scopes: {
        ackOverdue: "@result('Scope_Ack_Overdue')[0]?['status']",
        dueBreached: "@result('Scope_Due_Breached')[0]?['status']",
        outbox: "@result('Scope_Outbox')[0]?['status']",
        status: "@result('Scope_Status')[0]?['status']",
        support: "@result('Scope_Support')[0]?['status']",
      },
      errors: "@variables('varErrors')",
    }),
    Create_Sweep_Telemetry: post(T.telemetry, {
      'item/Title': "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
      'item/Flow': "@coalesce(workflow()?['tags']?['flowDisplayName'],workflow()?['name'])",
      'item/RunId': "@workflow()?['run']?['name']",
      'item/StartedAtUtc': "@variables('varReceivedAtUtc')",
      'item/CompletedAtUtc': '@utcNow()',
      'item/Outcome': "@if(equals(length(variables('varErrors')),0),'Succeeded','Failed')",
      /* Every accepted PostItem to this list in the estate carries DurationMs; the connector
         refuses the save without it. Derived from varReceivedAtUtc rather than a second tick
         variable — 10,000 ticks to the millisecond. */
      'item/DurationMs': "@div(sub(ticks(utcNow()),ticks(variables('varReceivedAtUtc'))),10000)",
      'item/ErrorMessage': "@string(variables('varErrors'))",
    }, ok('Compose_Flow_Run_Record')),
  },
};

const SWEEP_ACTIONS = {
  Scope_Ack_Overdue: ackScope,
  Scope_Due_Breached: dueScope,
  Scope_Outbox: outboxScope,
  Scope_Status: statusScope,
  Scope_Support: supportScope,
  Scope_Flow_Data_Capture: telemetryScope,
};

/* The two variables the body reads. In the import package they are declared at the workflow top
   level, where Logic Apps requires them; the clipboard package cannot carry them, so they are
   written beside it as a prerequisite. */
/* Both are already in the estate's governed variable catalogue
   (scripts/build-flow-variables.mjs). varReceivedAtUtc means exactly what a sweep needs — "run
   start as an ISO timestamp, for the telemetry row" — so this reuses it rather than minting a
   synonym that would have to be added to a governed list to say the same thing. */
const VARIABLES = [
  { name: 'varReceivedAtUtc', type: 'string', value: '@utcNow()' },
  { name: 'varErrors', type: 'array', value: [] },
];

const initAtTopLevel = () => ({
  Initialize_variable_varReceivedAtUtc: {
    type: 'InitializeVariable',
    inputs: { variables: [VARIABLES[0]] },
    metadata: meta(),
  },
  Initialize_variable_varErrors: {
    type: 'InitializeVariable',
    inputs: { variables: [VARIABLES[1]] },
    runAfter: ok('Initialize_variable_varReceivedAtUtc'),
    metadata: meta(),
  },
});

/* ── Emit 1 — the clipboard package ─────────────────────────────────────────────────────── */
function connectionData(node) {
  const out = {};
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && v.type === 'OpenApiConnection') {
        const api = v.inputs.host.connection;
        const id = CONNECTIONS[api];
        if (!id) throw new Error(`${k} uses ${api}, which has no entry in CONNECTIONS`);
        out[k] = {
          connectionReference: {
            api: { id: `/providers/Microsoft.PowerApps/apis/${api}` },
            connection: { id: `/providers/Microsoft.PowerApps/apis/${api}/connections/${id}` },
            connectionName: id,
          },
          referenceKey: api,
        };
      }
      walk(v);
    }
  })(node);
  return out;
}

const serializedValue = { type: 'Scope', actions: SWEEP_ACTIONS, runAfter: {}, metadata: meta() };
const pastePkg = {
  nodeId: 'Scope_Scheduled_Sweep',
  serializedValue,
  allConnectionData: connectionData(serializedValue),
  staticResults: {},
  isScopeNode: true,
  mslaNode: true,
};

/* ── Emit 2 — the legacy import package ─────────────────────────────────────────────────── */
const FLOW_GUID = '7c2f5a91-4d38-4b6e-9a02-51d7c8e6b430';
const definition = {
  name: FLOW_GUID,
  id: `/providers/Microsoft.Flow/flows/${FLOW_GUID}`,
  type: 'Microsoft.Flow/flows',
  properties: {
    apiId: '/providers/Microsoft.PowerApps/apis/shared_logicflows',
    displayName: 'DGO_SCHEDULED_SWEEP',
    definition: {
      $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
      contentVersion: '1.0.0.0',
      parameters: {
        $connections: { defaultValue: {}, type: 'Object' },
        $authentication: { defaultValue: {}, type: 'SecureObject' },
      },
      triggers: {
        Recurrence: {
          type: 'Recurrence',
          recurrence: { frequency: 'Hour', interval: 1, timeZone: 'W. Central Africa Standard Time' },
          metadata: meta(),
        },
      },
      actions: { ...initAtTopLevel(), ...withTriggerAnchor(SWEEP_ACTIONS) },
    },
    connectionReferences: Object.fromEntries(
      Object.entries(CONNECTIONS).map(([api, id]) => [api, {
        connectionName: id,
        id: `/providers/Microsoft.PowerApps/apis/${api}`,
      }])),
    flowFailureAlertSubscribed: false,
    isManaged: false,
  },
};

/* In the full workflow the first scope must run after the variables, not after nothing. */
function withTriggerAnchor(actions) {
  const copy = JSON.parse(JSON.stringify(actions));
  copy.Scope_Ack_Overdue.runAfter = ok('Initialize_variable_varErrors');
  return copy;
}

/* apisMap and connectionsMap do NOT hold connector names or connection names. Each value is a
   KEY INTO manifest.resources, and the importer looks it up there — a value that is not a
   resource key produces `KeyNotFoundException: The given key was not present in the dictionary`
   with nothing to say which key it meant. That is exactly what an earlier build of this package
   did: it mapped shared_office365 to the connector name in apisMap and to the connection name
   c0b9e7a5… in connectionsMap, and neither was a resource key.

   The api GUIDs are the platform's own and are stable — every one of the ten reference packages
   exported from this environment carries the same two. The connection GUIDs are package-local
   (the reference packages each mint their own, all resolving to the same mailbox), so these are
   this package's, fixed here so the archive stays byte-reproducible. */
const API_GUID = {
  shared_office365: '278a7ed0-132e-458c-8cc6-c1e45f684cd1',
  shared_sharepointonline: 'a7f62b31-e5ce-475a-aa41-8b963c880569',
};
const CONN_GUID = {
  shared_office365: '9f3c1b74-6e25-4a80-b3d9-2c7e10f45a86',
  shared_sharepointonline: '5d81e0a2-33bc-4f17-9e64-8ab2d95c701f',
};
const apisMap = Object.fromEntries(Object.keys(CONNECTIONS).map((api) => [api, API_GUID[api]]));
const connectionsMap = Object.fromEntries(Object.keys(CONNECTIONS).map((api) => [api, CONN_GUID[api]]));
const flowsManifest = { packageSchemaVersion: '1.0', flowAssets: { assetPaths: [FLOW_GUID] } };
const API_LABEL = { shared_office365: 'Office 365 Outlook', shared_sharepointonline: 'SharePoint' };
/* The mailbox the agency decided, and the account four reference packages confirm sits behind
   connection c0b9e7a5b0854c39a435fd8ce92f48ad. Shown to the importer so the right connection is
   obvious in the picker. */
const SENDER_MAILBOX = 'dgsRegistry@nitda.gov.ng';

const rootManifest = {
  schema: '1.0',
  details: {
    displayName: 'DGO_SCHEDULED_SWEEP',
    description: 'Hourly sweep: acknowledgement and due clocks, outbox retry and alert, citizen status notices, support replies.',
    createdTime: '2026-09-02T00:00:00.0000000Z',
    packageTelemetryId: '00000000-0000-0000-0000-000000000000',
    creator: 'N/A',
    sourceEnvironment: '',
  },
  resources: {
    [FLOW_GUID]: {
      type: 'Microsoft.Flow/flows',
      suggestedCreationType: 'New',
      creationType: 'Existing, New',
      details: { displayName: 'DGO_SCHEDULED_SWEEP' },
      configurableBy: 'User',
      hierarchy: 'Root',
      dependsOn: Object.keys(CONNECTIONS).flatMap((api) => [API_GUID[api], CONN_GUID[api]]),
    },
    ...Object.fromEntries(Object.keys(CONNECTIONS).map((api) => [API_GUID[api], {
      id: `/providers/Microsoft.PowerApps/apis/${api}`,
      name: api,
      type: 'Microsoft.PowerApps/apis',
      suggestedCreationType: 'Existing',
      details: { displayName: API_LABEL[api] },
      configurableBy: 'System',
      hierarchy: 'Child',
      dependsOn: [],
    }])),
    /* A connection resource per connector, so the import wizard shows a picker and binds the
       flow to a connection the importer chooses. Without these the apis resolve but the wizard
       has nothing to offer, and the imported flow lands with unbound actions.
       `suggestedCreationType: Existing` points it at a connection that already exists rather
       than prompting to create one — the tenant's Office 365 Outlook connections belong to
       dgsRegistry@nitda.gov.ng and dgs@nitda.gov.ng, and this flow should use the former. */
    ...Object.fromEntries(Object.keys(CONNECTIONS).map((api) => [CONN_GUID[api], {
      type: 'Microsoft.PowerApps/apis/connections',
      suggestedCreationType: 'Existing',
      creationType: 'Existing',
      details: { displayName: SENDER_MAILBOX },
      configurableBy: 'User',
      hierarchy: 'Child',
      dependsOn: [API_GUID[api]],
    }])),
  },
};


/* ── A deterministic ZIP, written here rather than shelled out ───────────────────────────────
   The deliverable an operator needs is one file they can hand to Import Package (Legacy), not a
   directory and an instruction to compress it themselves. Node ships DEFLATE in zlib, so the
   archive needs no dependency — only the container format, which is 30 bytes of local header per
   entry, a central directory, and an end-of-central-directory record.

   Deterministic on purpose: entries in sorted order and a fixed DOS timestamp, so rebuilding an
   unchanged package produces a byte-identical file and `--check` can compare it. A zip stamped
   with the current time would report itself stale on every run. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function buildZip(entries) {
  const DOS_TIME = 0x0000;              /* 00:00:00 */
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;   /* 2026-01-01 */
  const locals = [], central = [];
  let offset = 0;

  for (const [name, content] of [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(content, 'utf8');
    const deflated = deflateRawSync(raw, { level: 9 });
    /* Store when DEFLATE does not help — a tiny JSON can compress larger than it starts. */
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);            /* version needed */
    lh.writeUInt16LE(0, 6);             /* flags */
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);            /* extra */
    locals.push(lh, nameBuf, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);            /* version made by */
    cd.writeUInt16LE(20, 6);            /* version needed */
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);            /* extra */
    cd.writeUInt16LE(0, 32);            /* comment */
    cd.writeUInt16LE(0, 34);            /* disk */
    cd.writeUInt16LE(0, 36);            /* internal attrs */
    cd.writeUInt32LE(0, 38);            /* external attrs */
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);

    offset += lh.length + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

/* ── Write ──────────────────────────────────────────────────────────────────────────────── */
const PKG_FILES = {
  'manifest.json': rootManifest,
  'Microsoft.Flow/flows/manifest.json': flowsManifest,
  [`Microsoft.Flow/flows/${FLOW_GUID}/definition.json`]: definition,
  [`Microsoft.Flow/flows/${FLOW_GUID}/apisMap.json`]: apisMap,
  [`Microsoft.Flow/flows/${FLOW_GUID}/connectionsMap.json`]: connectionsMap,
};

const variablesMd = [
  '# DGO_SCHEDULED_SWEEP — top-level variables (paste route only)',
  '',
  '> Generated by `scripts/build-scheduled-sweep.mjs`. Do not edit.',
  '',
  '**The import package does not need this file.** `DGO_SCHEDULED_SWEEP.zip` declares these at the',
  'workflow top level itself, which is where Logic Apps requires them.',
  '',
  'They matter only on the paste route. Power Automate accepts *Initialize variable* only at the',
  'top level of a workflow, and a clipboard package is a scope — so these cannot travel inside the',
  'package. Create the Recurrence flow, add these two actions at the top, then paste the scope.',
  '',
  '| Variable | Type | Initial value | Action name to use |',
  '| --- | --- | --- | --- |',
  ...VARIABLES.map((v, i) => `| \`${v.name}\` | ${v.type} | \`${typeof v.value === 'string' ? v.value : JSON.stringify(v.value)}\` | \`Initialize_variable_${v.name}\` |`),
  '',
  '## Trigger',
  '',
  'Recurrence — frequency `Hour`, interval `1`, time zone `W. Central Africa Standard Time`.',
  'A trigger cannot be pasted; create it with the flow.',
  '',
  '## List columns this package reads and writes',
  '',
  'Every one is already deployed. Nothing here needs provisioning before the flow runs.',
  '',
  '| List | Columns | Use |',
  '| --- | --- | --- |',
  '| `Global Tracking Queue` | `Acknowledgement_x0020_Due_x0020_`, `Acknowledge_x0020_Task`, `DueDate`, `Progress`, `AssignedTo`, `Assigned`, `Reference_ID`, `RefIDD`, `Title` | read — the two clocks |',
  '| `Portal Outbox Receipts` | `Title`, `MessageType`, `RecipientEmail`, `Reference`, `SentAtUtc`, `Status`, `Attempts`, `LastError` | read and write — the send ledger, and the idempotency key |',
  '| `Portal Registry` | `Status`, `ReferenceId`, `SenderEmail` | read — citizen status notices |',
  '| `Portal Support Cases` | `Status`, `Title`, `Email`, `Message` | read — support replies |',
  '| `Portal Flow Telemetry` | `Title`, `Flow`, `RunId`, `StartedAtUtc`, `CompletedAtUtc`, `Outcome`, `ErrorMessage` | write — the run record |',
  '',
  '## Idempotency',
  '',
  'Every branch reads `Portal Outbox Receipts` for `Title eq \'<messageType>:<key>\'` before sending',
  'and writes that row after. A record already notified is skipped, so an hourly schedule does not',
  'produce an hourly message. No watermark column is needed on any swept list.',
  '',
].join('\n');

const ZIP = join(PKG_DIR, 'DGO_SCHEDULED_SWEEP.zip');
const zipEntries = () => Object.entries(PKG_FILES).map(([rel, c]) => [rel, JSON.stringify(c, null, 1)]);

function writeAll() {
  mkdirSync(PASTE_DIR, { recursive: true });
  mkdirSync(PKG_DIR, { recursive: true });
  /* The directory stays because a binary in git is unreviewable — a diff on the exploded JSON is
     how a change to this package gets read. The zip is what an operator downloads. */
  writeFileSync(ZIP, buildZip(zipEntries()));
  writeFileSync(join(PASTE_DIR, 'DGO_SCHEDULED_SWEEP.designer-paste.json'), JSON.stringify(pastePkg));
  writeFileSync(join(PASTE_DIR, 'DGO_SCHEDULED_SWEEP.variables.md'), variablesMd);
  for (const [rel, content] of Object.entries(PKG_FILES)) {
    const p = join(PKG_DIR, 'DGO_SCHEDULED_SWEEP', rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(content, null, 1));
  }
}

function currentMatches() {
  const paste = join(PASTE_DIR, 'DGO_SCHEDULED_SWEEP.designer-paste.json');
  if (!existsSync(paste)) return false;
  if (readFileSync(paste, 'utf8') !== JSON.stringify(pastePkg)) return false;
  for (const [rel, content] of Object.entries(PKG_FILES)) {
    const p = join(PKG_DIR, 'DGO_SCHEDULED_SWEEP', rel);
    if (!existsSync(p) || readFileSync(p, 'utf8') !== JSON.stringify(content, null, 1)) return false;
  }
  if (!existsSync(ZIP) || !readFileSync(ZIP).equals(buildZip(zipEntries()))) return false;
  return true;
}

if (CHECK) {
  const okNow = currentMatches();
  console.log(okNow
    ? '✅ DGO_SCHEDULED_SWEEP artifacts match the generator'
    : '❌ DGO_SCHEDULED_SWEEP artifacts are stale — run: npm run sweep');
  process.exit(okNow ? 0 : 1);
}

writeAll();
const count = (o) => { let n = 0; (function w(x) { if (!x || typeof x !== 'object') return; for (const [k, v] of Object.entries(x)) { if (v && typeof v === 'object' && v.type) n++; w(v); } })(o); return n; };
console.log(`DGO_SCHEDULED_SWEEP — ${count(SWEEP_ACTIONS)} actions in ${Object.keys(SWEEP_ACTIONS).length} scopes`);
console.log(`  paste  ${rel(PASTE_DIR)}/DGO_SCHEDULED_SWEEP.designer-paste.json`);
console.log(`  import ${rel(ZIP)}  (${(readFileSync(ZIP).length / 1024).toFixed(1)} KB — Import Package (Legacy))`);
console.log(`  source ${rel(PKG_DIR)}/DGO_SCHEDULED_SWEEP/  (exploded, for review)`);
