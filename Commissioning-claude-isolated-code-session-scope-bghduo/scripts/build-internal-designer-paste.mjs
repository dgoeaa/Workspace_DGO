import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { compose, setVar, appendErr, cond, ok, assemble, connData, emitVariables, meta, initVars, normalizeItemParams, rateLimit, rateLimitedActions, REPO, T, GDDC } from './lib/designer-paste-builder.mjs';

const OUT = REPO + 'docs/deployment/internal/flows/designer-paste/';
mkdirSync(OUT, { recursive: true });

const ACT = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const GOV = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
const NEDMS = 'https://nitdanigeria.sharepoint.com/sites/NEDMS';

/* Every GUID below is `adopted: true` in docs/reference/sharepoint-list-index.json, and every
   column is either harvested from a deployed definition or read by core/domain.js. */
const L = {
  gtq:        { t: 'ee82725a-c408-45e2-a8e8-facf7a092047', d: ACT },
  ops:        { t: '1f1cb303-3fd2-43c8-8f24-c409b6c2fde3', d: ACT },
  comments:   { t: '1932d687-e77a-4929-9047-a1f544c68a0b', d: ACT },
  categories: { t: 'f64c8b65-c921-46e9-8814-a8cef61f6016', d: ACT },
  departments:{ t: '8aab9c4e-001f-4e32-862c-8a50e750f04e', d: ACT },
  otp:        { t: '9421d473-8906-43b7-a41f-a213046683c1', d: ACT },
  users:      { t: '3d591f5b-3f2f-409c-983a-a77b5c174834', d: GOV },
  roles:      { t: 'f675598b-271d-4200-8d75-2597aad4057f', d: GOV },
  audit:      { t: 'be0c7af1-b21d-4efe-8c30-53fc55598d95', d: GOV },
  roleHistory:{ t: '9fe1872f-3ae0-4b5f-96fc-5d3331c1d07c', d: GOV },
  registry:   { t: 'f553959f-d55b-4591-aa87-d61fb6f9eda9', d: NEDMS },
  /* The reference minter, shared with the portal by design. D6 mints
     NITDA-<yyyy>-<5 digits> from ONE counter; a registry deposit and a portal submission
     drawing from the same row is what makes their references incapable of colliding with
     each other. A second counter for the counter clerk would reintroduce exactly the
     collision D6 exists to remove. */
  seq:        { t: 'd95409a4-2b48-4d34-9f60-da5d27db862d', d: GDDC },
  /* The one list this file addresses outside the internal estate. Portal Outbox Receipts is
     the estate's single mail ledger — DGO_SCHEDULED_SWEEP retries from it and the portal
     packages already write it — so the EMAIL carrier records its sends there rather than in a
     second ledger nothing reads. Same direction as the rate-limit bucket the OTP flow already
     writes on that site; the declared boundary runs the other way (no PORTAL flow may read the
     internal operations estate), and this crosses nothing it forbids. */
  outbox:     { t: T.outbox, d: GDDC },
};

const SP = 'shared_sharepointonline';
const host = (op) => ({ apiId: `/providers/Microsoft.PowerApps/apis/${SP}`, connection: SP, operationId: op });
/* Same normalisation the shared builder applies: unprovisioned columns stripped, Choice values
   addressed at /Value, and every patch given the Title the connector requires. Imported rather
   than restated, because this file having its own copy of the rules is how they drifted. */
function sp(op, l, params, after) {
  const a = { type: 'OpenApiConnection', inputs: { parameters: { dataset: l.d, table: l.t, ...normalizeItemParams(op, l.t, params) }, host: host(op) }, metadata: meta() };
  if (after) a.runAfter = after;
  return a;
}
const get = (l, p, after) => sp('GetItems', l, p, after);
const post = (l, p, after) => sp('PostItem', l, p, after);
const patch = (l, p, after) => sp('PatchItem', l, p, after);
const select = (from, sel, after) => ({ type: 'Select', inputs: { from, select: sel }, runAfter: after, metadata: meta() });


/**
 * Read a field the client sent.
 *
 * core/data-client.js builds the request body as
 *   { action: contract.action, payload: {...}, userEmail, requestId, timestamp }
 * — the caller's fields are NESTED under `payload`. The one exception is
 * modules/single-assignment.js, which passes `flatPayload:true` and gets
 *   { action, ...payload, userEmail, correlationId }
 * So every field is read payload-first with a top-level fallback, and only the four envelope
 * keys — action, userEmail, requestId/correlationId, timestamp — are genuinely top-level.
 *
 * Reading a caller field at the top level alone returns nothing on every endpoint but that one.
 */
const body = (...keys) => keys.flatMap((k) => [`triggerBody()?['payload']?['${k}']`, `triggerBody()?['${k}']`]).join(',');
const bodyStr = (...keys) => `trim(string(coalesce(${body(...keys)},'')))`;

const CALLER = `@toLower(${bodyStr('userEmail')})`;

/* ---------- identity gate: resolve the caller from DGO_UserDirectory, never from the body ----------
   `after` is not decoration. An action with no `runAfter` is a ROOT of its scope, so where the
   gate is spread AFTER a chain of Composes — DGO_DYNAMIC_GLOBAL_ACTIONS reads the operation, the
   reference and the flag before it resolves the caller — the gate started as a second parallel
   branch and everything it wraps referenced Composes the runtime could not promise had finished.
   Where the gate IS the scope body it is the only root and no `after` is needed. */
function identityGate(tag, permission, after, callerExpr = CALLER) {
  return {
    /* `callerExpr` defaults to the body's userEmail because that is what every JSON-contract
       flow has. SCAN_INTAKE cannot use it — its body is raw file bytes — and must not: the
       client contract says the depositing officer comes from the server, not the page. It
       passes the tenant-authenticated principal header instead. */
    [`Compose_${tag}_Caller`]: compose(callerExpr, after),
    [`Get_${tag}_Directory_User`]: get(L.users, {
      $filter: `@concat('Email eq ''',replace(outputs('Compose_${tag}_Caller'),'''',''''''),''' and Status eq ''active''')`,
      $top: 1,
    }, ok(`Compose_${tag}_Caller`)),
    [`Compose_${tag}_Role`]: compose(`@toLower(trim(string(coalesce(first(outputs('Get_${tag}_Directory_User')?['body/value'])?['Role'],''))))`, ok(`Get_${tag}_Directory_User`)),
    [`Get_${tag}_Role_Permissions`]: get(L.roles, {
      $filter: `@concat('RoleId eq ''',replace(outputs('Compose_${tag}_Role'),'''',''''''),''' and Active eq 1')`,
      $top: 1,
    }, ok(`Compose_${tag}_Role`)),
    [`Compose_${tag}_Permitted`]: compose(
      `@and(greater(length(coalesce(outputs('Get_${tag}_Directory_User')?['body/value'],json('[]'))),0),or(contains(string(coalesce(first(outputs('Get_${tag}_Role_Permissions')?['body/value'])?['AllowedRoutesJson'],'')),'"*"'),contains(string(coalesce(first(outputs('Get_${tag}_Role_Permissions')?['body/value'])?['PermissionsJson'],'')),'${permission}')))`,
      ok(`Get_${tag}_Role_Permissions`)),
  };
}
const denied = (tag, code, msg) => ({
  [`Set_variable_varStatusCode_${tag}_${code}`]: setVar('varStatusCode', code),
  /* The status code belongs in the name. denied() runs twice per flow \u2014 once for 403 and once
     for 401 \u2014 and without it both branches emit identically named actions. The designer keys
     every action by name across the whole workflow, so a duplicate pair either blocks the paste
     or is silently renamed, and the runAfter below then points at the other branch's action. */
  [`Append_to_array_variable_varErrors_${tag}_Denied_${code}`]: appendErr({ scope: tag, stage: 'authorisation', status: 'failed', message: msg, trackedAtUtc: '@utcNow()' }, ok(`Set_variable_varStatusCode_${tag}_${code}`)),
  [`Set_variable_varData_${tag}_Denied_${code}`]: setVar('varData', { code: code === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', message: msg }, ok(`Append_to_array_variable_varErrors_${tag}_Denied_${code}`)),
});
/* Unknown caller is 401, known-but-unpermitted is 403 — the client distinguishes them, so the
   flow must too. */
/* `callerExpr` is forwarded, not dropped. It was added to identityGate and NOT to this wrapper,
   so SCAN_INTAKE's principal-header caller was passed into a fifth parameter that did not exist
   and silently ignored — the built package read userEmail out of the request body like every
   other internal flow, which for a flow whose body is raw file bytes means it resolves to
   nothing and refuses every caller. It failed closed, so nothing was exposed, but the flow was
   inert and the claim that it takes identity from the server was false as built. */
const gate = (tag, permission, allowed, after, callerExpr = CALLER) => ({
  ...identityGate(tag, permission, after, callerExpr),
  [`Condition_${tag}_Authorised`]: cond(
    { equals: [`@outputs('Compose_${tag}_Permitted')`, true] },
    allowed,
    {
      [`Condition_${tag}_Known_Caller`]: cond(
        { greater: [`@length(coalesce(outputs('Get_${tag}_Directory_User')?['body/value'],json('[]')))`, 0] },
        denied(tag, 403, `The caller's role does not carry ${permission}.`),
        denied(tag, 401, 'The caller is not in DGO_UserDirectory, or is not active.')),
    },
    ok(`Compose_${tag}_Permitted`)),
});

/* ---------- audit rows ----------
 *
 * DGO_AuditLog declares fourteen columns and FOUR of them are required — AuditId, Event,
 * Severity, CreatedAt (docs/reference/sharepoint-provisioning-spec.json). A row carrying only
 * `Title` is rejected by SharePoint, and because the audit write sat on the success path with
 * `runAfter: Succeeded`, that rejection dropped the run into the catch scope and answered 500
 * AFTER the item had already been patched: the assignment happened and the caller was told it
 * had not. The seed row in that same spec is the shape this builds.
 *
 * `severity` is one of the list's four choices — info, warning, error, security — and a value
 * outside them is rejected the same way a missing required column is. */
const AUDIT_SEVERITY = new Set(['info', 'warning', 'error', 'security']);
function auditRow({ tag, event, module: mod, action, severity = 'info', entityType, entityId, ref, title, meta: metaExpr }) {
  if (!AUDIT_SEVERITY.has(severity)) throw new Error(`${event}: severity '${severity}' is not one of ${[...AUDIT_SEVERITY].join(', ')}`);
  const dir = `first(outputs('Get_${tag}_Directory_User')?['body/value'])`;
  return {
    'item/Title': title,
    /* Unique per row, not merely per request: DYNAMIC_GLOBAL_ACTIONS audits from four
       branches and AuditId is this list's indexed key. */
    'item/AuditId': `@concat('${mod}:${event.split(':').pop()}:',variables('varRequestId'))`,
    'item/RequestId': "@variables('varRequestId')",
    'item/Event': event,
    'item/Module': mod,
    'item/Action': action,
    /* The actor is the directory row the gate resolved, never the email the body claimed. */
    'item/ActorEmail': `@outputs('Compose_${tag}_Caller')`,
    'item/ActorRole': `@outputs('Compose_${tag}_Role')`,
    'item/ActorPersona': `@string(coalesce(${dir}?['Persona'],''))`,
    'item/EntityType': entityType,
    'item/EntityId': entityId,
    'item/Ref': ref,
    'item/MetaJson': metaExpr,
    'item/Severity': severity,
    'item/CreatedAt': '@utcNow()',
  };
}

/* An audit write must not be able to un-say a write that already committed. The status is set
 * whichever way the audit row lands, and a rejection is appended to varErrors so it reaches the
 * response and the telemetry row instead of vanishing. */
/* `slug` distinguishes the generated action names when one flow audits from several
 * branches — DYNAMIC_GLOBAL_ACTIONS audits four — because the designer keys every action by
 * name across the whole workflow, not per branch. */
const auditFailureBranch = (tag, auditAction, what, slug = tag) => ({
  [`Append_to_array_variable_varErrors_${slug}_AuditFailed`]: appendErr({
    scope: tag, stage: 'audit', status: 'failed',
    message: `${what} committed but the DGO_AuditLog row was rejected.`,
    /* result() takes a SCOPE — the tenant's own definitions only ever apply it to Scope and
       Switch — so a single action's outcome is read with actions(), as their Response probes do. */
    details: `@actions('${auditAction}')?['outputs']`, trackedAtUtc: '@utcNow()',
  }, { [auditAction]: ['Failed', 'TimedOut', 'Skipped'] }),
});
const afterAudit = (tag, auditAction, slug = tag) => ({
  [auditAction]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'],
  [`Append_to_array_variable_varErrors_${slug}_AuditFailed`]: ['Succeeded', 'Skipped'],
});

/* A governed write that leaves no governance row is the gap the audit fix exists to close, and
 * three of DYNAMIC_GLOBAL_ACTIONS' four write branches left none: the flag, the task update and
 * the status transition each changed an operational list and recorded nothing, while the one
 * branch that WAS audited — logauditevent — performed no write of its own. Exactly inverted.
 * This emits the row, its non-fatal failure branch, and the runAfter that ties them together. */
function dynamicAudit(slug, { event, action, entityType, entityId, ref, title, meta: metaFields }) {
  const metaAction = `Compose_Dynamic_${slug}_Audit_Meta`;
  const auditAction = `Create_Dynamic_${slug}_Audit`;
  return {
    actions: {
      [metaAction]: compose({
        operation: "@outputs('Compose_Dynamic_Operation')",
        action: "@outputs('Compose_Dynamic_Action')",
        ref: "@outputs('Compose_Dynamic_Reference')",
        ...metaFields,
      }, ok(`Update_Dynamic_${slug}`)),
      [auditAction]: post(L.audit, auditRow({
        tag: 'Dynamic', event, module: 'dynamic-global-actions', action,
        severity: 'info', entityType, entityId, ref, title,
        meta: `@string(outputs('${metaAction}'))`,
      }), ok(metaAction)),
      ...auditFailureBranch('Dynamic', auditAction, 'The write was', `Dynamic_${slug}`),
    },
    after: afterAudit('Dynamic', auditAction, `Dynamic_${slug}`),
  };
}

/* ---------- projections ---------- */
const USER_SEL = { UserId: "@item()?['UserId']", FullName: "@item()?['FullName']", Email: "@item()?['Email']", Directorate: "@item()?['Directorate']", Department: "@item()?['Department']", Role: "@item()?['Role']", Persona: "@item()?['Persona']", Status: "@item()?['Status']", AccessScope: "@item()?['AccessScope']", PilotCohort: "@item()?['PilotCohort']" };
const DOC_SEL = { ID: "@item()?['ID']", Title: "@item()?['Title']", RefIDD: "@item()?['RefIDD']", Category: "@item()?['Category0']", Status: "@item()?['Status']?['Value']", AssignedTo: "@item()?['AssignedTo']", Assigned: "@item()?['Assigned']", RoutedToDSU: "@item()?['RoutedToDSU']", CC_x0027_dTo: "@item()?['CC_x0027_dTo']", OverallStatus: "@item()?['OverallStatus']?['Value']", StartDate: "@item()?['StartDate']", BodyExtract: "@item()?['BodyExtract']" };
const TASK_SEL = { ID: "@item()?['ID']", Title: "@item()?['Title']", RefIDD: "@item()?['RefIDD']", Reference_ID: "@item()?['Reference_ID']", AssignedTo: "@item()?['AssignedTo']", Assigned: "@item()?['Assigned']", AssignedBy: "@item()?['AssignedBy']", RoutedToDSU: "@item()?['RoutedToDSU']", Classification: "@item()?['Classification']", Description: "@item()?['Description']", DueDate: "@item()?['DueDate']", StartDate: "@item()?['StartDate']", Priority: "@item()?['Priority']?['Value']", Progress: "@item()?['Progress']?['Value']", TaskType: "@item()?['TaskType']?['Value']", AttachmentLink: "@item()?['AttachmentLink']", ActivityTrackingID: "@item()?['ActivityTrackingID']" };
const CAT_SEL = { ID: "@item()?['ID']", Title: "@item()?['Title']", Category: "@item()?['Category']", Subcategory: "@item()?['Subcategory']", DSU_KEY: "@item()?['DSU_KEY']", Priority: "@item()?['Priority']", Timeline: "@item()?['Timeline']" };
const DEPT_SEL = { ID: "@item()?['ID']", Title: "@item()?['Title']", DSU_KEY: "@item()?['DSU_KEY']", DSU_Email: "@item()?['DSU_Email']", DSU_HeadEmail: "@item()?['DSU_HeadEmail']", DSU_HeadTitle: "@item()?['DSU_HeadTitle']" };
const COMMENT_SEL = { ID: "@item()?['ID']", Title: "@item()?['Title']", RefIDD: "@item()?['RefIDD']", Description: "@item()?['Description']", Created: "@item()?['Created']" };

/* ============================ FETCH_ALL ============================ */
const fetchAllBody = gate('FetchAll', 'user:view', {
  Get_All_Docs: get(L.ops, { $top: 500, $orderby: 'Modified desc' }),
  Get_All_Tasks: get(L.gtq, { $top: 500, $orderby: 'Modified desc' }, ok('Get_All_Docs')),
  Get_All_Users: get(L.users, { $top: 500 }, ok('Get_All_Tasks')),
  Get_All_Categories: get(L.categories, { $top: 500 }, ok('Get_All_Users')),
  Get_All_Departments: get(L.departments, { $top: 200 }, ok('Get_All_Categories')),
  Get_All_Comments: get(L.comments, { $top: 500, $orderby: 'Created desc' }, ok('Get_All_Departments')),
  Select_Docs: select("@coalesce(outputs('Get_All_Docs')?['body/value'],json('[]'))", DOC_SEL, ok('Get_All_Comments')),
  Select_Tasks: select("@coalesce(outputs('Get_All_Tasks')?['body/value'],json('[]'))", TASK_SEL, ok('Select_Docs')),
  Select_Users: select("@coalesce(outputs('Get_All_Users')?['body/value'],json('[]'))", USER_SEL, ok('Select_Tasks')),
  Select_Categories: select("@coalesce(outputs('Get_All_Categories')?['body/value'],json('[]'))", CAT_SEL, ok('Select_Users')),
  Select_Departments: select("@coalesce(outputs('Get_All_Departments')?['body/value'],json('[]'))", DEPT_SEL, ok('Select_Categories')),
  Select_Comments: select("@coalesce(outputs('Get_All_Comments')?['body/value'],json('[]'))", COMMENT_SEL, ok('Select_Departments')),
  Set_variable_varStatusCode_FetchAll_200: setVar('varStatusCode', 200, ok('Select_Comments')),
  Set_variable_varData_FetchAll_Success: setVar('varData', {
    docs: "@body('Select_Docs')", tasks: "@body('Select_Tasks')", users: "@body('Select_Users')",
    categories: "@body('Select_Categories')", departments: "@body('Select_Departments')",
    comments: "@body('Select_Comments')", emails: [], approvals: [],
  }, ok('Set_variable_varStatusCode_FetchAll_200')),
});

/* ============================ REFERENCE_DATA ============================ */
const referenceDataBody = gate('Lookups', 'user:view', {
  Get_Lookup_Users: get(L.users, { $top: 500 }),
  Get_Lookup_Categories: get(L.categories, { $top: 500 }, ok('Get_Lookup_Users')),
  Get_Lookup_Departments: get(L.departments, { $top: 200 }, ok('Get_Lookup_Categories')),
  Select_Lookup_Users: select("@coalesce(outputs('Get_Lookup_Users')?['body/value'],json('[]'))", USER_SEL, ok('Get_Lookup_Departments')),
  Select_Lookup_Categories: select("@coalesce(outputs('Get_Lookup_Categories')?['body/value'],json('[]'))", CAT_SEL, ok('Select_Lookup_Users')),
  Select_Lookup_Departments: select("@coalesce(outputs('Get_Lookup_Departments')?['body/value'],json('[]'))", DEPT_SEL, ok('Select_Lookup_Categories')),
  Set_variable_varStatusCode_Lookups_200: setVar('varStatusCode', 200, ok('Select_Lookup_Departments')),
  Set_variable_varData_Lookups_Success: setVar('varData', {
    users: "@body('Select_Lookup_Users')", categories: "@body('Select_Lookup_Categories')", departments: "@body('Select_Lookup_Departments')",
  }, ok('Set_variable_varStatusCode_Lookups_200')),
});

/* ============================ GET_DOCS ============================ */
const getDocsBody = gate('GetDocs', 'user:view', {
  Compose_GetDocs_Reference: compose(`@${bodyStr('reference')}`),
  Get_Docs_Filtered: get(L.ops, {
    $filter: "@if(empty(outputs('Compose_GetDocs_Reference')),'',concat('RefIDD eq ''',replace(outputs('Compose_GetDocs_Reference'),'''',''''''),''''))",
    $top: 500, $orderby: 'Modified desc',
  }, ok('Compose_GetDocs_Reference')),
  Select_GetDocs: select("@coalesce(outputs('Get_Docs_Filtered')?['body/value'],json('[]'))", DOC_SEL, ok('Get_Docs_Filtered')),
  Set_variable_varStatusCode_GetDocs_200: setVar('varStatusCode', 200, ok('Select_GetDocs')),
  Set_variable_varData_GetDocs_Success: setVar('varData', { docs: "@body('Select_GetDocs')" }, ok('Set_variable_varStatusCode_GetDocs_200')),
});

/* ============================ SINGLE_ASSIGNMENT ============================ */
const singleAssignmentBody = gate('Assign', 'bulk:assign', {
  Compose_Assign_Reference: compose(`@${bodyStr('ref')}`),
  Compose_Assign_Assignee: compose(`@toLower(${bodyStr('assignee')})`, ok('Compose_Assign_Reference')),
  Compose_Assign_Operation: compose(`@toLower(trim(string(coalesce(${body('operation')},'assign-one'))))`, ok('Compose_Assign_Assignee')),
  /* NOTHING VALIDATED THE ASSIGNEE.
     An empty `assignee` is not a no-op here. It fails the idempotency comparison against a row
     that currently has one, falls into the update branch, and patches AssignedTo and Assigned to
     the empty string — then answers 200 with `assigned: true, changed: true`. A destructive
     unassignment, reported as a successful assignment, from a request that simply omitted a
     field. `ref` is checked in the same place: on its own it reached SharePoint as
     `RefIDD eq ''` and came back 404, which is a truthful-looking answer to a malformed request.
     Both are the caller's error, so both are 400 and neither reaches a write. */
  Condition_Assign_Input_Valid: cond(
    { and: [
      { greater: ["@length(outputs('Compose_Assign_Reference'))", 0] },
      { greater: ["@length(outputs('Compose_Assign_Assignee'))", 0] },
    ] },
    {
  Get_Assign_Target: get(L.gtq, {
    $filter: `@concat('RefIDD eq ''',replace(outputs('Compose_Assign_Reference'),'''',''''''),'''')`,
    $top: 1,
  }),   // first action inside the branch — cannot name an outer sibling
  Condition_Assign_Target_Found: cond(
    { greater: ["@length(coalesce(outputs('Get_Assign_Target')?['body/value'],json('[]')))", 0] },
    {
      Condition_Assign_Idempotent: cond(
        { equals: ["@toLower(trim(string(coalesce(first(outputs('Get_Assign_Target')?['body/value'])?['AssignedTo'],''))))", "@outputs('Compose_Assign_Assignee')"] },
        {
          Set_variable_varStatusCode_Assign_200_NoOp: setVar('varStatusCode', 200),
          Set_variable_varData_Assign_NoOp: setVar('varData', { assigned: true, changed: false, ref: "@outputs('Compose_Assign_Reference')", assignee: "@outputs('Compose_Assign_Assignee')" }, ok('Set_variable_varStatusCode_Assign_200_NoOp')),
        },
        {
          Update_Assign_Target: patch(L.gtq, {
            id: "@first(outputs('Get_Assign_Target')?['body/value'])?['ID']",
            'item/AssignedTo': "@outputs('Compose_Assign_Assignee')",
            'item/Assigned': "@outputs('Compose_Assign_Assignee')",
            'item/AssignedBy': "@outputs('Compose_Assign_Caller')",
            'item/StartDate': '@utcNow()',
          }),
          /* Before/after, captured from the pre-patch read, so the row says what changed and
             not merely that something did. */
          Compose_Assign_Audit_Meta: compose({
            operation: "@outputs('Compose_Assign_Operation')",
            assignedToBefore: "@string(coalesce(first(outputs('Get_Assign_Target')?['body/value'])?['AssignedTo'],''))",
            assignedToAfter: "@outputs('Compose_Assign_Assignee')",
            assignedBy: "@outputs('Compose_Assign_Caller')",
            itemId: "@string(coalesce(first(outputs('Get_Assign_Target')?['body/value'])?['ID'],''))",
          }, ok('Update_Assign_Target')),
          Create_Assign_Audit: post(L.audit, auditRow({
            tag: 'Assign',
            event: 'assignment:item-assigned',
            module: 'single-assignment',
            action: "@outputs('Compose_Assign_Operation')",
            severity: 'info',
            entityType: 'global-tracking-queue-item',
            entityId: "@string(coalesce(first(outputs('Get_Assign_Target')?['body/value'])?['ID'],''))",
            ref: "@outputs('Compose_Assign_Reference')",
            title: "@concat('assign:',outputs('Compose_Assign_Reference'))",
            meta: "@string(outputs('Compose_Assign_Audit_Meta'))",
          }), ok('Compose_Assign_Audit_Meta')),
          ...auditFailureBranch('Assign', 'Create_Assign_Audit', 'The assignment was'),
          Set_variable_varStatusCode_Assign_200: setVar('varStatusCode', 200, afterAudit('Assign', 'Create_Assign_Audit')),
          Set_variable_varData_Assign_Success: setVar('varData', { assigned: true, changed: true, ref: "@outputs('Compose_Assign_Reference')", assignee: "@outputs('Compose_Assign_Assignee')", operation: "@outputs('Compose_Assign_Operation')" }, ok('Set_variable_varStatusCode_Assign_200')),
        }),
    },
    {
      Set_variable_varStatusCode_Assign_404: setVar('varStatusCode', 404),
      Set_variable_varData_Assign_NotFound: setVar('varData', { assigned: false, code: 'REFERENCE_NOT_FOUND' }, ok('Set_variable_varStatusCode_Assign_404')),
    },
    ok('Get_Assign_Target')),
    },
    {
      Set_variable_varStatusCode_Assign_400: setVar('varStatusCode', 400),
      Append_to_array_variable_varErrors_Assign_Invalid: appendErr({
        scope: 'Assign', stage: 'validation', status: 'failed',
        message: 'ref and assignee are both required and neither may be empty.',
        refSupplied: "@greater(length(outputs('Compose_Assign_Reference')),0)",
        assigneeSupplied: "@greater(length(outputs('Compose_Assign_Assignee')),0)",
        trackedAtUtc: '@utcNow()',
      }, ok('Set_variable_varStatusCode_Assign_400')),
      Set_variable_varData_Assign_Invalid: setVar('varData', {
        assigned: false,
        code: 'INVALID_REQUEST',
        message: 'ref and assignee are both required and neither may be empty.',
      }, ok('Append_to_array_variable_varErrors_Assign_Invalid')),
    },
    ok('Compose_Assign_Operation')),
});

/* ============================ BULK_ASSIGNMENT ============================ */
const bulkAssignmentBody = gate('Bulk', 'bulk:assign', {
  Compose_Bulk_Items: compose(`@take(coalesce(${body('items')},json('[]')),50)`),
  Compose_Bulk_Assignee: compose(`@toLower(${bodyStr('assignee')})`, ok('Compose_Bulk_Items')),
  /* The single-assignment defect, fifty times over. An empty `assignee` failed nothing here
     either: it reached Update_Bulk_Target and blanked AssignedTo and Assigned on every item in
     the batch, each one reported back as `assigned: true`. Same guard, same 400, before the
     Foreach opens — and an empty `items` is refused too rather than answering 200 for a batch
     that assigned nobody. */
  Condition_Bulk_Input_Valid: cond(
    { and: [
      { greater: ["@length(outputs('Compose_Bulk_Assignee'))", 0] },
      { greater: ["@length(outputs('Compose_Bulk_Items'))", 0] },
    ] },
    {
  Apply_to_each_Bulk_Item: {
    type: 'Foreach',
    foreach: "@outputs('Compose_Bulk_Items')",
    actions: {
      Get_Bulk_Target: get(L.gtq, { $filter: `@concat('RefIDD eq ''',replace(string(coalesce(item()?['ref'],item())),'''',''''''),'''')`, $top: 1 }),
      Condition_Bulk_Target_Found: cond(
        { greater: ["@length(coalesce(outputs('Get_Bulk_Target')?['body/value'],json('[]')))", 0] },
        {
          /* Idempotency, to match single assignment. Without it a re-run of the same batch
             rewrites AssignedBy and resets StartDate on every item that was already correct. */
          Condition_Bulk_Idempotent: cond(
            { equals: ["@toLower(trim(string(coalesce(first(outputs('Get_Bulk_Target')?['body/value'])?['AssignedTo'],''))))", "@outputs('Compose_Bulk_Assignee')"] },
            {
              Append_Bulk_Result_NoOp: { type: 'AppendToArrayVariable', inputs: { name: 'varBulkResults', value: { ref: "@string(coalesce(item()?['ref'],item()))", assigned: true, changed: false } }, metadata: meta() },
            },
            {
              Update_Bulk_Target: patch(L.gtq, {
                id: "@first(outputs('Get_Bulk_Target')?['body/value'])?['ID']",
                'item/AssignedTo': "@outputs('Compose_Bulk_Assignee')",
                'item/Assigned': "@outputs('Compose_Bulk_Assignee')",
                'item/AssignedBy': "@outputs('Compose_Bulk_Caller')",
                'item/StartDate': '@utcNow()',
              }),
              Append_Bulk_Result_Ok: { type: 'AppendToArrayVariable', inputs: { name: 'varBulkResults', value: { ref: "@string(coalesce(item()?['ref'],item()))", assigned: true, changed: true } }, runAfter: ok('Update_Bulk_Target'), metadata: meta() },
              /* A failed patch used to append NOTHING: the Ok row needed Succeeded and the
                 NotFound row lives in the other branch, so the item vanished from the results
                 and `requested` no longer equalled assigned + failed. The caller saw a short
                 array and no error. */
              Append_Bulk_Result_Failed: { type: 'AppendToArrayVariable', inputs: { name: 'varBulkResults', value: { ref: "@string(coalesce(item()?['ref'],item()))", assigned: false, reason: 'WRITE_FAILED', details: "@actions('Update_Bulk_Target')?['outputs']" } }, runAfter: { Update_Bulk_Target: ['Failed', 'TimedOut', 'Skipped'] }, metadata: meta() },
            },
            {}),
        },
        {
          Append_Bulk_Result_NotFound: { type: 'AppendToArrayVariable', inputs: { name: 'varBulkResults', value: { ref: "@string(coalesce(item()?['ref'],item()))", assigned: false, reason: 'REFERENCE_NOT_FOUND' } }, metadata: meta() },
        },
        ok('Get_Bulk_Target')),
    },
    /* varBulkResults is appended to inside this loop, and a Foreach runs its repetitions in
       PARALLEL by default (20 at a time). Concurrent appends to one variable race and drop
       rows, so the batch would under-report its own results at random. The tenant's own
       carefully built flows — Portal_Datta_Architecture_Provisioning, Repair the DGO__
       governance lists, Global_Gap_Remediation_Provisioning — all pin repetitions to 1 for
       exactly this reason. */
    runtimeConfiguration: { concurrency: { repetitions: 1 } },
    runAfter: {},   // first action inside the branch — cannot name an outer sibling
    metadata: meta(),
  },
  Compose_Bulk_Audit_Meta: compose({
    assignee: "@outputs('Compose_Bulk_Assignee')",
    assignedBy: "@outputs('Compose_Bulk_Caller')",
    requested: "@length(outputs('Compose_Bulk_Items'))",
    results: "@variables('varBulkResults')",
    /* A batch where some items failed is a reportable outcome, not a dead end: the per-item
       reasons are already in varBulkResults, so the audit and the response must still run. */
  }, { Apply_to_each_Bulk_Item: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }),
  /* Single assignment writes a governance row for one item; this touches up to fifty and wrote
     nothing at all. One row per batch, with the per-item outcome in MetaJson. */
  Create_Bulk_Audit: post(L.audit, auditRow({
    tag: 'Bulk',
    event: 'assignment:batch-assigned',
    module: 'bulk-assignment',
    action: 'assign-many',
    severity: 'info',
    entityType: 'global-tracking-queue-batch',
    entityId: "@string(length(outputs('Compose_Bulk_Items')))",
    /* The batch's references are objects OR bare strings depending on the caller, so joining
       them here would throw on the object form. The full per-item list is in MetaJson; Ref
       carries the batch's own identity. */
    ref: "@concat('batch:',variables('varRequestId'))",
    title: "@concat('assign-batch:',string(length(outputs('Compose_Bulk_Items'))))",
    meta: "@string(outputs('Compose_Bulk_Audit_Meta'))",
  }), ok('Compose_Bulk_Audit_Meta')),
  ...auditFailureBranch('Bulk', 'Create_Bulk_Audit', 'The batch was'),
  Set_variable_varStatusCode_Bulk_200: setVar('varStatusCode', 200, afterAudit('Bulk', 'Create_Bulk_Audit')),
  Set_variable_varData_Bulk_Success: setVar('varData', {
    requested: "@length(outputs('Compose_Bulk_Items'))",
    assigned: "@length(filter(variables('varBulkResults'),equals(item()?['assigned'],true)))",
    failed: "@length(filter(variables('varBulkResults'),equals(item()?['assigned'],false)))",
    results: "@variables('varBulkResults')",
  }, ok('Set_variable_varStatusCode_Bulk_200')),
    },
    {
      Set_variable_varStatusCode_Bulk_400: setVar('varStatusCode', 400),
      Append_to_array_variable_varErrors_Bulk_Invalid: appendErr({
        scope: 'Bulk', stage: 'validation', status: 'failed',
        message: 'assignee is required and items must contain at least one reference.',
        assigneeSupplied: "@greater(length(outputs('Compose_Bulk_Assignee')),0)",
        itemCount: "@length(outputs('Compose_Bulk_Items'))",
        trackedAtUtc: '@utcNow()',
      }, ok('Set_variable_varStatusCode_Bulk_400')),
      Set_variable_varData_Bulk_Invalid: setVar('varData', {
        requested: "@length(outputs('Compose_Bulk_Items'))",
        assigned: 0,
        code: 'INVALID_REQUEST',
        message: 'assignee is required and items must contain at least one reference.',
      }, ok('Append_to_array_variable_varErrors_Bulk_Invalid')),
    },
    ok('Compose_Bulk_Assignee')),
});

/* ============================ DYNAMIC_GLOBAL_ACTIONS ============================ */
/* The recognised discriminators are DERIVED from the client, not written by hand — see
   scripts/derive-dynamic-operations.mjs. The earlier hand-written list carried names from
   action-ownership.config.js, which is a different vocabulary from what reaches the wire:
   WriteManager.backend() sends `operation: action`, then spreads the payload over it, so a
   payload carrying its own `operation` wins. flagPayload() does exactly that, which is why the
   flag write arrives as `update` and not as `flag-document`. `npm run test:dynamicops` fails if
   the file and the client drift apart. */
const DYNAMIC_OPS = JSON.parse(readFileSync(REPO + 'docs/deployment/internal/dynamic-operations.json', 'utf8'))
  .operations.map((o) => o.operation);

/* Which of them this flow actually performs a write for. An operation absent from this map is
   recognised and answered 501 — never 200 with `applied: true`. A false `applied` is worse than
   a refusal: PendingQueue stops retrying and the client records a write that never happened. */
const WRITES = {
  update: 'DGO DIGITAL OPS.Marked_Item — the document flag',
  'update-task': 'Global Tracking Queue — Progress, Comments, DueDate, Priority',
  transitionstatus: 'DGO DIGITAL OPS.Status',
  logauditevent: 'DGO_AuditLog — a full governance row',
};

const dynamicBody = {
  Compose_Dynamic_Operation: compose(`@toLower(${bodyStr('operation')})`),
  Compose_Dynamic_Reference: compose(`@${bodyStr('ref','referenceId')}`, ok('Compose_Dynamic_Operation')),
  Compose_Dynamic_Known_Operations: compose(JSON.stringify(DYNAMIC_OPS), ok('Compose_Dynamic_Reference')),
  Compose_Dynamic_Implemented_Operations: compose(JSON.stringify(Object.keys(WRITES)), ok('Compose_Dynamic_Known_Operations')),
  /* `update` covers both flagDocument and unflagDocument; the body's `action` says which. */
  Compose_Dynamic_Action: compose(`@toLower(${bodyStr('action')})`, ok('Compose_Dynamic_Implemented_Operations')),
  Compose_Dynamic_Flag_Value: compose(`@if(equals(outputs('Compose_Dynamic_Action'),'unflagdocument'),'',${bodyStr('flag')})`, ok('Compose_Dynamic_Action')),
  ...identityGate('Dynamic', 'user:view', ok('Compose_Dynamic_Flag_Value')),
  Condition_Dynamic_Operation_Known: cond(
    { equals: ["@contains(json(outputs('Compose_Dynamic_Known_Operations')),outputs('Compose_Dynamic_Operation'))", true] },
    {
      Condition_Dynamic_Authorised: cond(
        { equals: ["@outputs('Compose_Dynamic_Permitted')", true] },
        {
          Compose_Dynamic_Requires_Role_Assign: compose("@startsWith(outputs('Compose_Dynamic_Operation'),'user-admin:')"),
          Compose_Dynamic_Has_Role_Assign: compose("@or(contains(string(coalesce(first(outputs('Get_Dynamic_Role_Permissions')?['body/value'])?['AllowedRoutesJson'],'')),'\"*\"'),contains(string(coalesce(first(outputs('Get_Dynamic_Role_Permissions')?['body/value'])?['PermissionsJson'],'')),'role:assign'))", ok('Compose_Dynamic_Requires_Role_Assign')),
          Condition_Dynamic_User_Admin_Permitted: cond(
            { or: [
              { equals: ["@outputs('Compose_Dynamic_Requires_Role_Assign')", false] },
              { equals: ["@outputs('Compose_Dynamic_Has_Role_Assign')", true] },
            ] },
            {
              Get_Dynamic_Target: get(L.gtq, { $filter: `@concat('RefIDD eq ''',replace(outputs('Compose_Dynamic_Reference'),'''',''''''),'''')`, $top: 1 }),
              Get_Dynamic_Ops_Target: get(L.ops, { $filter: `@concat('RefIDD eq ''',replace(outputs('Compose_Dynamic_Reference'),'''',''''''),'''')`, $top: 1 }, ok('Get_Dynamic_Target')),
              Compose_Dynamic_Implemented: compose("@contains(json(outputs('Compose_Dynamic_Implemented_Operations')),outputs('Compose_Dynamic_Operation'))", ok('Get_Dynamic_Ops_Target')),
              Condition_Dynamic_Implemented: cond(
                { equals: ["@outputs('Compose_Dynamic_Implemented')", true] },
                {
                  Switch_Dynamic_Operation: {
                    type: 'Switch',
                    expression: "@outputs('Compose_Dynamic_Operation')",
                    cases: {
                      /* The flag write. flagPayload() sends operation 'update' with the flag code
                         in `flag` and flagDocument/unflagDocument in `action`; unflagging clears
                         the column rather than writing a second marker. */
                      Case_Dynamic_Update_Flag: {
                        case: 'update',
                        actions: {
                          Update_Dynamic_Flag: patch(L.ops, {
                            id: "@first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['ID']",
                            'item/Marked_Item': "@outputs('Compose_Dynamic_Flag_Value')",
                          }),
                          ...dynamicAudit('Flag', {
                            event: 'document:flag-changed',
                            action: "@outputs('Compose_Dynamic_Action')",
                            entityType: 'digital-ops-item',
                            entityId: "@string(coalesce(first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['ID'],''))",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            title: "@concat('flag:',outputs('Compose_Dynamic_Reference'))",
                            meta: {
                              flagBefore: "@string(coalesce(first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['Marked_Item'],''))",
                              flagAfter: "@outputs('Compose_Dynamic_Flag_Value')",
                            },
                          }).actions,
                          Set_variable_varData_Dynamic_Flag: setVar('varData', {
                            operation: "@outputs('Compose_Dynamic_Operation')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            applied: true,
                            wrote: 'DGO DIGITAL OPS.Marked_Item',
                            flag: "@outputs('Compose_Dynamic_Flag_Value')",
                            actor: "@outputs('Compose_Dynamic_Caller')",
                          }, dynamicAudit('Flag', { event: 'document:flag-changed' }).after),
                        },
                      },
                      Case_Dynamic_Update_Task: {
                        case: 'update-task',
                        actions: {
                          /* Global Tracking Queue has no Status column. core/domain.js line 41
                             resolves a task's `status` from `Progress`, so that is the column a
                             status change on a task writes. */
                          Update_Dynamic_Task: patch(L.gtq, {
                            id: "@first(outputs('Get_Dynamic_Target')?['body/value'])?['ID']",
                            'item/Progress': `@coalesce(${body('progress','status')},first(outputs('Get_Dynamic_Target')?['body/value'])?['Progress'])`,
                            'item/Comments': `@coalesce(${body('comments')},first(outputs('Get_Dynamic_Target')?['body/value'])?['Comments'])`,
                            'item/DueDate': `@coalesce(${body('dueDate')},first(outputs('Get_Dynamic_Target')?['body/value'])?['DueDate'])`,
                            'item/Priority': `@coalesce(${body('priority')},first(outputs('Get_Dynamic_Target')?['body/value'])?['Priority'])`,
                          }),
                          ...dynamicAudit('Task', {
                            event: 'task:updated',
                            action: "@outputs('Compose_Dynamic_Action')",
                            entityType: 'global-tracking-queue-item',
                            entityId: "@string(coalesce(first(outputs('Get_Dynamic_Target')?['body/value'])?['ID'],''))",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            title: "@concat('task:',outputs('Compose_Dynamic_Reference'))",
                            meta: {
                              progressBefore: "@string(coalesce(first(outputs('Get_Dynamic_Target')?['body/value'])?['Progress'],''))",
                              progressAfter: `@coalesce(${body('progress','status')},first(outputs('Get_Dynamic_Target')?['body/value'])?['Progress'])`,
                            },
                          }).actions,
                          Set_variable_varData_Dynamic_Task: setVar('varData', {
                            operation: "@outputs('Compose_Dynamic_Operation')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            applied: true,
                            wrote: 'Global Tracking Queue',
                            actor: "@outputs('Compose_Dynamic_Caller')",
                          }, dynamicAudit('Task', { event: 'task:updated' }).after),
                        },
                      },
                      Case_Dynamic_Transition: {
                        case: 'transitionstatus',
                        actions: {
                          /* A reference's status is DGO DIGITAL OPS.Status — the Global Tracking
                             Queue carries no Status column at all. OverallStatus is left alone:
                             nothing in the client reads it and guessing at it would be a write
                             nobody asked for. */
                          /* This wrote `@trim(string(coalesce(<body>,'')))` straight into the
                             column, so a request that omitted `status` BLANKED the reference's
                             Status on a 21,249-item list and answered 200 applied:true. The two
                             sibling cases already coalesce to the item's current value; this one
                             did not. It does now, so an absent field is a no-op rather than an
                             erasure — and Condition_Dynamic_Status_Supplied refuses it outright,
                             because silently doing nothing is its own kind of lie. */
                          Update_Dynamic_Status: patch(L.ops, {
                            id: "@first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['ID']",
                            'item/Status': `@coalesce(${body('status')},first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['Status'])`,
                          }),
                          ...dynamicAudit('Status', {
                            event: 'reference:status-transitioned',
                            action: "@outputs('Compose_Dynamic_Action')",
                            entityType: 'digital-ops-item',
                            entityId: "@string(coalesce(first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['ID'],''))",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            title: `@concat('status:',outputs('Compose_Dynamic_Reference'))`,
                            meta: {
                              statusBefore: "@string(coalesce(first(outputs('Get_Dynamic_Ops_Target')?['body/value'])?['Status'],''))",
                              statusAfter: `@${bodyStr('status')}`,
                            },
                          }).actions,
                          Set_variable_varData_Dynamic_Transition: setVar('varData', {
                            operation: "@outputs('Compose_Dynamic_Operation')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            applied: true,
                            wrote: 'DGO DIGITAL OPS.Status',
                            status: `@${bodyStr('status')}`,
                            actor: "@outputs('Compose_Dynamic_Caller')",
                          }, dynamicAudit('Status', { event: 'reference:status-transitioned' }).after),
                        },
                      },
                      Case_Dynamic_Audit: {
                        case: 'logauditevent',
                        actions: {
                          /* This branch used to set `applied: true, wrote: DGO_AuditLog.Title`
                             and write nothing at all — L.audit appeared exactly once in this
                             file, in the assignment flow. The comment above WRITES says a false
                             `applied` is worse than a refusal; this is the write that makes it
                             true. */
                          Compose_Dynamic_Audit_Meta: compose({
                            operation: "@outputs('Compose_Dynamic_Operation')",
                            action: "@outputs('Compose_Dynamic_Action')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            source: "@coalesce(triggerBody()?['payload']?['source'],triggerBody()?['source'],'portal')",
                          }),
                          Create_Dynamic_Audit: post(L.audit, auditRow({
                            tag: 'Dynamic',
                            event: 'governance:audit-event-logged',
                            module: 'dynamic-global-actions',
                            action: "@outputs('Compose_Dynamic_Action')",
                            severity: 'info',
                            entityType: 'client-reported-event',
                            entityId: "@outputs('Compose_Dynamic_Reference')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            title: "@concat('audit:',outputs('Compose_Dynamic_Operation'))",
                            meta: "@string(outputs('Compose_Dynamic_Audit_Meta'))",
                          }), ok('Compose_Dynamic_Audit_Meta')),
                          ...auditFailureBranch('Dynamic', 'Create_Dynamic_Audit', 'The event was'),
                          Set_variable_varData_Dynamic_Audit: setVar('varData', {
                            operation: "@outputs('Compose_Dynamic_Operation')",
                            ref: "@outputs('Compose_Dynamic_Reference')",
                            /* Only true if the row landed. */
                            applied: "@equals(actions('Create_Dynamic_Audit')?['status'],'Succeeded')",
                            wrote: 'DGO_AuditLog',
                            actor: "@outputs('Compose_Dynamic_Caller')",
                          }, afterAudit('Dynamic', 'Create_Dynamic_Audit')),
                        },
                      },
                    },
                    default: { actions: {} },
                    runAfter: {},   // first action inside the branch — cannot name an outer sibling
                    metadata: meta(),
                  },
                  Set_variable_varStatusCode_Dynamic_200: setVar('varStatusCode', 200, ok('Switch_Dynamic_Operation')),
                },
                {
                  /* Recognised, authorised, audited — and this flow has no write body for it.
                     Say so. A 200 with `applied: true` here would tell the client the registry
                     changed when it did not, and PendingQueue would stop retrying. */
                  Set_variable_varStatusCode_Dynamic_501: setVar('varStatusCode', 501),
                  Append_to_array_variable_varErrors_Dynamic_501: appendErr({
                    scope: 'DYNAMIC_ACTIONS', stage: 'execute', status: 'failed',
                    message: 'The operation is recognised but this flow has no write body for it.',
                    trackedAtUtc: '@utcNow()',
                  }, ok('Set_variable_varStatusCode_Dynamic_501')),
                  Set_variable_varData_Dynamic_501: setVar('varData', {
                    code: 'NOT_IMPLEMENTED',
                    message: 'This operation is recognised and authorised, but no write is provisioned for it yet. Nothing was changed.',
                    operation: "@outputs('Compose_Dynamic_Operation')",
                    ref: "@outputs('Compose_Dynamic_Reference')",
                    applied: false,
                  }, ok('Append_to_array_variable_varErrors_Dynamic_501')),
                },
                ok('Compose_Dynamic_Implemented')),
            },
            denied('Dynamic', 403, 'user-admin operations require role:assign, resolved server-side.'),
            ok('Compose_Dynamic_Has_Role_Assign')),
        },
        denied('Dynamic', 401, 'The caller is not in DGO_UserDirectory, or is not active.')),
    },
    {
      Set_variable_varStatusCode_Dynamic_400: setVar('varStatusCode', 400),
      Append_to_array_variable_varErrors_Dynamic_Unknown: appendErr({ scope: 'DYNAMIC_ACTIONS', stage: 'routing', status: 'failed', message: 'Unrecognised operation discriminator.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Dynamic_400')),
      Set_variable_varData_Dynamic_Unknown: setVar('varData', { code: 'UNKNOWN_OPERATION', message: 'The operation is not recognised by this endpoint.', operation: "@outputs('Compose_Dynamic_Operation')" }, ok('Append_to_array_variable_varErrors_Dynamic_Unknown')),
    },
    ok('Compose_Dynamic_Permitted')),
};

/* ============================ OTP_GENERATE / OTP_VERIFY ============================ */
const otpBody = {
  /* Four spellings reach this flow for two behaviours: payload.operation is 'requestOtp',
     'verifyOtp' or 'verifyOtpAndExecute' (core/api.js aliases), and the envelope's top-level
     action is 'generate' or 'verify' (contract.action, reconciled 2026-09-04 — ITEM-44; it was
     'otpGenerate'/'otpVerify' and matched no case in either tenant OTP flow). Normalise to two,
     so a spelling nobody anticipated cannot fall through the Switch and answer nothing. That
     tolerance is why THIS package needed no change: 'generate' does not start with 'verify' so
     it normalises to requestotp, and 'verify' does. */
  Compose_Otp_Raw_Action: compose(`@toLower(trim(string(coalesce(${body('operation', 'action')},'requestOtp'))))`),
  Compose_Otp_Action: compose("@if(or(startsWith(outputs('Compose_Otp_Raw_Action'),'verify'),equals(outputs('Compose_Otp_Raw_Action'),'otpverify')),'verifyotp','requestotp')", ok('Compose_Otp_Raw_Action')),
  Compose_Otp_Email: compose(`@toLower(${bodyStr('email')})`, ok('Compose_Otp_Action')),
  Compose_Otp_Code: compose(`@${bodyStr('code','otp')}`, ok('Compose_Otp_Email')),
  Compose_Otp_Random: compose('@rand(100000,1000000)', ok('Compose_Otp_Code')),
  Get_Otp_Directory_User: get(L.users, {
    $filter: `@concat('Email eq ''',replace(outputs('Compose_Otp_Email'),'''',''''''),''' and Status eq ''active''')`,
    $top: 1,
  }, ok('Compose_Otp_Random')),
  Compose_Otp_Known_User: compose("@greater(length(coalesce(outputs('Get_Otp_Directory_User')?['body/value'],json('[]'))),0)", ok('Get_Otp_Directory_User')),
  Switch_Otp_Action: {
    type: 'Switch',
    expression: "@outputs('Compose_Otp_Action')",
    cases: {
      Case_RequestOtp: {
        case: 'requestotp',
        actions: {
          /* NOTHING LIMITED THIS FLOW.
             The seven portal endpoints all carry the rate-limit triad; the one endpoint that
             mints credentials carried none. Bucketed on the email rather than the source IP,
             because the account is what is being protected and the internal flows are called
             server-side, where X-Forwarded-For is not the caller. `Portal Rate Limits` is
             already provisioned — the 2026-08-19 run created all three of its columns — so this
             needed no tenant change and should not have been deferred. */
          ...rateLimit('Otp_Request', "@concat('OTP_REQUEST:',outputs('Compose_Otp_Email'))", 5),
          Condition_Otp_Request_Gate: cond(
            { equals: ["@outputs('Compose_Rate_Limited_Otp_Request')", true] },
            rateLimitedActions('Otp_Request'),
            {
          Condition_Otp_Known_User: cond(
            { equals: ["@outputs('Compose_Otp_Known_User')", true] },
            {
              Create_Otp_Challenge: post(L.otp, {
                'item/Title': "@outputs('Compose_Otp_Email')",
                'item/OTP_Code': "@string(outputs('Compose_Otp_Random'))",
                'item/Expires_At': '@addMinutes(utcNow(),5)',
                'item/Is_Verified': false,
              }),
              Send_Otp_Mail: {
                type: 'OpenApiConnection',
                inputs: {
                  parameters: {
                    'emailMessage/To': "@outputs('Compose_Otp_Email')",
                    'emailMessage/Subject': 'Your NITDA sign-in code',
                    'emailMessage/Body': "<div style=\"font-family:Arial,sans-serif;padding:20px\"><h2 style=\"color:#008751\">NITDA Sign-in</h2><div style=\"font-size:24px;font-weight:bold;letter-spacing:5px;margin:20px 0\">@{outputs('Compose_Otp_Random')}</div><p style=\"color:#666;font-size:12px\">This code expires in 5 minutes.</p></div>",
                    'emailMessage/Importance': 'Normal',
                  },
                  host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
                },
                runAfter: ok('Create_Otp_Challenge'),
                metadata: meta(),
              },
              Set_variable_varStatusCode_Otp_200: setVar('varStatusCode', 200, { Send_Otp_Mail: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] }),
              Set_variable_varData_Otp_Sent: setVar('varData', {
                sent: "@equals(actions('Send_Otp_Mail')?['status'],'Succeeded')",
                expiresAt: '@addMinutes(utcNow(),5)',
              }, ok('Set_variable_varStatusCode_Otp_200')),
            },
            {
              Delay_Otp_Unknown_User: { type: 'Wait', inputs: { interval: { count: 1, unit: 'Second' } }, metadata: meta() },
              Set_variable_varStatusCode_Otp_200_Unknown: setVar('varStatusCode', 200, ok('Delay_Otp_Unknown_User')),
              Set_variable_varData_Otp_Unknown: setVar('varData', { sent: false, expiresAt: '@addMinutes(utcNow(),5)' }, ok('Set_variable_varStatusCode_Otp_200_Unknown')),
            }),
            },
            ok('Compose_Rate_Limited_Otp_Request')),
        },
      },
      Case_VerifyOtp: {
        case: 'verifyotp',
        actions: {
          /* THE BRUTE-FORCE GAP.
             Six digits is a keyspace of 10^6, the challenge stays valid for five minutes, and
             Get_Otp_Challenge re-read the same unconsumed row on every attempt with nothing
             counting failures — so the code could simply be enumerated inside its own validity
             window. This is the attempt counter, and it needs no new column: the rate-limit
             triad already keeps a per-bucket count with an hourly window, so bucketing on
             OTP_VERIFY:<email> IS the attempt limit. It increments on every attempt, right or
             wrong, before the code is compared. Ten per hour against 10^6 is a one-in-a-hundred-
             thousand chance of a lucky guess. */
          ...rateLimit('Otp_Verify', "@concat('OTP_VERIFY:',outputs('Compose_Otp_Email'))", 10),
          Condition_Otp_Verify_Gate: cond(
            { equals: ["@outputs('Compose_Rate_Limited_Otp_Verify')", true] },
            rateLimitedActions('Otp_Verify'),
            {
          Get_Otp_Challenge: get(L.otp, {
            $filter: `@concat('Title eq ''',replace(outputs('Compose_Otp_Email'),'''',''''''),''' and Is_Verified eq 0')`,
            $orderby: 'Created desc', $top: 1,
          }),
          Condition_Otp_Challenge_Valid: cond(
            { and: [
              { greater: ["@length(coalesce(outputs('Get_Otp_Challenge')?['body/value'],json('[]')))", 0] },
              { greater: ["@ticks(coalesce(first(outputs('Get_Otp_Challenge')?['body/value'])?['Expires_At'],'1900-01-01T00:00:00Z'))", '@ticks(utcNow())'] },
              { equals: ["@trim(string(coalesce(first(outputs('Get_Otp_Challenge')?['body/value'])?['OTP_Code'],'')))", "@outputs('Compose_Otp_Code')"] },
              { equals: ["@outputs('Compose_Otp_Known_User')", true] },
            ] },
            {
              Consume_Otp_Challenge: patch(L.otp, {
                id: "@first(outputs('Get_Otp_Challenge')?['body/value'])?['ID']",
                'item/Is_Verified': true,
              }),
              /* Get_Otp_Role_Permissions used to sit here: a SharePoint round-trip whose result
                 NOTHING read — the claims below are built entirely from Get_Otp_Directory_User —
                 chained runAfter Succeeded to a patch that had just set Is_Verified. An OTP is
                 single-use, so a blip on that discarded query burned the caller's code and then
                 answered 500: they are told verification failed and must request a new code, for
                 a query whose answer was thrown away. Removed rather than re-chained; there is
                 no reason to make the call at all. */
              Set_variable_varStatusCode_Otp_Verified_200: setVar('varStatusCode', 200, ok('Consume_Otp_Challenge')),
              Set_variable_varData_Otp_Verified: setVar('varData', {
                ok: true,
                expiresAt: '@addHours(utcNow(),8)',
                claims: {
                  preferred_username: "@first(outputs('Get_Otp_Directory_User')?['body/value'])?['Email']",
                  name: "@first(outputs('Get_Otp_Directory_User')?['body/value'])?['FullName']",
                  roles: "@array(coalesce(first(outputs('Get_Otp_Directory_User')?['body/value'])?['Role'],'viewer'))",
                  persona: "@first(outputs('Get_Otp_Directory_User')?['body/value'])?['Persona']",
                  accessScope: "@first(outputs('Get_Otp_Directory_User')?['body/value'])?['AccessScope']",
                },
              }, ok('Set_variable_varStatusCode_Otp_Verified_200')),
            },
            {
              Set_variable_varStatusCode_Otp_401: setVar('varStatusCode', 401),
              Set_variable_varData_Otp_Refused: setVar('varData', { ok: false, reason: 'invalid_or_expired' }, ok('Set_variable_varStatusCode_Otp_401')),
            },
            ok('Get_Otp_Challenge')),
            },
            ok('Compose_Rate_Limited_Otp_Verify')),
        },
      },
    },
    default: {
      actions: {
        Set_variable_varStatusCode_Otp_400: setVar('varStatusCode', 400),
        Set_variable_varData_Otp_BadAction: setVar('varData', { code: 'INVALID_ACTION', message: 'action must be requestOtp or verifyOtp.' }, ok('Set_variable_varStatusCode_Otp_400')),
      },
    },
    runAfter: ok('Compose_Otp_Known_User'),
    metadata: meta(),
  },
};


/* ============================ SCAN INTAKE (channel C) ============================
 *
 * The one contract in this estate that is not JSON. core/scan-intake-service.js PUTs the raw
 * bytes of a scanned document with the metadata in headers, because base64-in-JSON is what
 * produced the 4 MB ceiling this replaced. TARGET_ARCHITECTURE §3.2 channel C: scan → document
 * library → correspondence record carrying `channel: 'Registry'` and the link.
 *
 * THREE THINGS THIS FLOW OWNS, AND ONE IT DOES NOT.
 *
 * It owns the reference. modules/scan-intake.js takes `res.referenceId` as the record's id and
 * says why in its own comment: the client's own derivation collides under concurrency and is
 * chosen by the caller, and "a registry reference must be neither". So it is minted here, from
 * the same sequence counter D6 gives the portal, under the same lock-token claim.
 *
 * It owns the identity. The client returns `depositedBy` from the server and the workspace
 * writes it into the custody record. Every other internal flow reads `userEmail` out of the
 * request body — the fail-open the estate documents — and this one cannot even if it wanted to,
 * because the body is bytes. It reads the tenant-authenticated principal header instead, which
 * is the posture the other flows should have.
 *
 * It owns filing the bytes, and reports filing separately from accepting them: `stored:false`
 * with an ok status is a real state the client does not flatten — the deposit was accepted and
 * audited, the document is not yet in the library.
 *
 * IT DOES NOT VERIFY THE DIGEST, AND MUST NOT BE SAID TO. Power Automate cannot compute a
 * SHA-256 over a request body. The client's declared digest is stored beside the file and
 * echoed back so a later reader can check the library against the record by hand. That is a
 * custody aid, not an integrity check, and EXECUTION_GUIDE Appendix B forbids describing it as
 * one — tests/standing-claims.test.mjs enforces the wording.
 *
 * AUTHORISATION IS MEMBERSHIP, NOT A PERMISSION, DELIBERATELY. The role catalogue carries no
 * `registry:deposit`, and minting one here would deny every role until the tenant's role rows
 * are updated — a new flow that is an outage on the day it is pasted. The gate is therefore:
 * the trigger is tenant-authenticated, and the principal must be an active row in
 * DGO_UserDirectory. Tightening it to a named permission is a one-line change here once the
 * role rows carry it, and is the recommended next step rather than a defect. */
const SCAN_CALLER = "@toLower(trim(string(coalesce(triggerOutputs()?['headers']?['x-ms-client-principal-name'],triggerOutputs()?['headers']?['X-MS-CLIENT-PRINCIPAL-NAME'],''))))";
const SCAN_HDR = (name) => `trim(string(coalesce(triggerOutputs()?['headers']?['${name}'],triggerOutputs()?['headers']?['${name.toLowerCase()}'],'')))`;
const SCAN_SEQ_FILTER = "@concat('Year eq ''',outputs('Compose_Scan_Year'),''' and Prefix eq ''NITDA''')";
/* 25 MB, the same ceiling SCAN_LIMITS.maxFileBytes enforces in the browser. Enforced again here
   because the client check is a courtesy to the officer, not a control: the endpoint answers
   whoever calls it. */
const SCAN_MAX_BYTES = 25 * 1024 * 1024;

const scanIntakeBody = {
  Compose_Scan_Filename: compose(`@${SCAN_HDR('X-DGO-Filename')}`),
  /* The client URI-encodes the name so a comma or a non-ASCII character survives the header.
     Decoded once here; a name that was not encoded decodes to itself. */
  Compose_Scan_Filename_Decoded: compose("@decodeUriComponent(outputs('Compose_Scan_Filename'))", ok('Compose_Scan_Filename')),
  Compose_Scan_Sha256: compose(`@toLower(${SCAN_HDR('X-DGO-Sha256')})`, ok('Compose_Scan_Filename_Decoded')),
  Compose_Scan_Declared_Bytes: compose(`@int(coalesce(if(equals(${SCAN_HDR('X-DGO-Size')},''),'0',${SCAN_HDR('X-DGO-Size')}),0))`, ok('Compose_Scan_Sha256')),
  Compose_Scan_Year: compose("@formatDateTime(utcNow(),'yyyy')", ok('Compose_Scan_Declared_Bytes')),
  Compose_Scan_LockToken: compose("@concat(workflow()?['run']?['name'],'-',string(rand(100000,999999)))", ok('Compose_Scan_Year')),
  ...gate('Scan', 'membership', {
    /* Rate-limited by the AUTHENTICATED principal, not by source IP: a counter clerk and an
       attacker do not share an address here — the trigger is tenant-authenticated, so there
       is a real identity to count against, which is the better key when one exists. Inside
       the authorised branch, so an unknown caller is refused before any list is written. */
    ...rateLimit('Scan', "@concat('SCAN_DEPOSIT:',outputs('Compose_Scan_Caller'))", 120),
    Condition_Scan_Rate_Limited: cond(
      { equals: ["@outputs('Compose_Rate_Limited_Scan')", true] },
      rateLimitedActions('Scan'),
      {
        Condition_Scan_Metadata_Valid: cond(
          { or: [
            { equals: ["@empty(outputs('Compose_Scan_Filename_Decoded'))", true] },
            { equals: ["@empty(outputs('Compose_Scan_Sha256'))", true] },
            { lessOrEquals: ["@outputs('Compose_Scan_Declared_Bytes')", 0] },
          ] },
          {
            Set_variable_varStatusCode_Scan_400: setVar('varStatusCode', 400),
            Append_to_array_variable_varErrors_Scan_Metadata: appendErr({ scope: 'Scan', stage: 'validation', status: 'failed', message: 'X-DGO-Filename, X-DGO-Sha256 and a non-zero X-DGO-Size are required.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Scan_400')),
            Set_variable_varData_Scan_BadRequest: setVar('varData', { stored: false, reason: 'metadata_required' }, ok('Append_to_array_variable_varErrors_Scan_Metadata')),
          },
          {
            Condition_Scan_Within_Limit: cond(
              { greater: ["@outputs('Compose_Scan_Declared_Bytes')", SCAN_MAX_BYTES] },
              {
                Set_variable_varStatusCode_Scan_413: setVar('varStatusCode', 413),
                Append_to_array_variable_varErrors_Scan_Oversize: appendErr({ scope: 'Scan', stage: 'validation', status: 'failed', message: 'The declared size exceeds the 25 MB deposit limit.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Scan_413')),
                Set_variable_varData_Scan_Oversize: setVar('varData', { stored: false, reason: 'too_large' }, ok('Append_to_array_variable_varErrors_Scan_Oversize')),
              },
              {
                /* Reference minting, D6, under the same optimistic lock the portal uses: claim
                   the row with a token, read it back, and proceed only if the token still holds.
                   Two clerks scanning at the same counter in the same second is the case this
                   exists for. */
                Get_Scan_Sequence_Counter: get(L.seq, { $filter: SCAN_SEQ_FILTER, $top: 1 }),
                Condition_Scan_Sequence_Exists: cond(
                  { greater: ["@length(coalesce(outputs('Get_Scan_Sequence_Counter')?['body/value'],json('[]')))", 0] },
                  {
                    Claim_Scan_Sequence_Counter: patch(L.seq, {
                      id: "@first(outputs('Get_Scan_Sequence_Counter')?['body/value'])?['ID']",
                      'item/LockToken': "@outputs('Compose_Scan_LockToken')",
                      'item/ModifiedByFlowRun': "@workflow()?['run']?['name']",
                    }),
                  },
                  {
                    Create_Scan_Sequence_Counter: post(L.seq, {
                      'item/Title': "@concat('NITDA-',outputs('Compose_Scan_Year'))",
                      'item/Year': "@outputs('Compose_Scan_Year')",
                      'item/Prefix': 'NITDA',
                      'item/CurrentSequence': 0,
                      'item/LockToken': "@outputs('Compose_Scan_LockToken')",
                      'item/ModifiedByFlowRun': "@workflow()?['run']?['name']",
                    }),
                  },
                  ok('Get_Scan_Sequence_Counter')),
                Get_Scan_Sequence_Confirm: get(L.seq, { $filter: SCAN_SEQ_FILTER, $top: 1 }, ok('Condition_Scan_Sequence_Exists')),
                Condition_Scan_Lock_Held: cond(
                  { equals: ["@string(first(outputs('Get_Scan_Sequence_Confirm')?['body/value'])?['LockToken'])", "@outputs('Compose_Scan_LockToken')"] },
                  {
                    Compose_Scan_Next_Sequence: compose("@add(int(coalesce(first(outputs('Get_Scan_Sequence_Confirm')?['body/value'])?['CurrentSequence'],0)),1)"),
                    Compose_Scan_Reference: compose("@concat('NITDA-',outputs('Compose_Scan_Year'),'-',padLeft(string(outputs('Compose_Scan_Next_Sequence')),5,'0'))", ok('Compose_Scan_Next_Sequence')),
                    Update_Scan_Sequence_Counter: patch(L.seq, {
                      id: "@first(outputs('Get_Scan_Sequence_Confirm')?['body/value'])?['ID']",
                      'item/CurrentSequence': "@outputs('Compose_Scan_Next_Sequence')",
                      'item/ModifiedByFlowRun': "@workflow()?['run']?['name']",
                    }, ok('Compose_Scan_Reference')),
                    /* The reference leads the stored name so the library sorts by it and a file
                       can be found from the record without a lookup. The officer's declared name
                       is kept whole after it — renaming a deposit silently is how a registry
                       loses the thread between what was handed in and what it holds. */
                    Compose_Scan_Stored_Name: compose("@concat(outputs('Compose_Scan_Reference'),'-',outputs('Compose_Scan_Filename_Decoded'))", ok('Update_Scan_Sequence_Counter')),
                    Create_Scan_File: {
                      type: 'OpenApiConnection',
                      inputs: {
                        parameters: {
                          dataset: NEDMS,
                          folderPath: '/NITDA_Central_Registry',
                          name: "@outputs('Compose_Scan_Stored_Name')",
                          /* The whole request body, unencoded. This is the point of the contract. */
                          body: '@triggerBody()',
                        },
                        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: 'shared_sharepointonline', operationId: 'CreateFile' },
                      },
                      runAfter: ok('Compose_Scan_Stored_Name'),
                      metadata: meta(),
                    },
                    Compose_Scan_Link: compose("@string(coalesce(outputs('Create_Scan_File')?['body/Path'],outputs('Create_Scan_File')?['body/Id'],''))", ok('Create_Scan_File')),
                    /* Accepted and filed are different facts and the client depends on the
                       difference: it creates no correspondence record unless BOTH ok and stored
                       are true, because a record pointing at a document that was never filed is
                       a broken custody record. */
                    Compose_Scan_Stored: compose("@not(empty(outputs('Compose_Scan_Link')))", ok('Compose_Scan_Link')),
                    Set_variable_varStatusCode_Scan_200: setVar('varStatusCode', 200, ok('Compose_Scan_Stored')),
                    Set_variable_varData_Scan_Deposited: setVar('varData', {
                      referenceId: "@outputs('Compose_Scan_Reference')",
                      attachmentLink: "@outputs('Compose_Scan_Link')",
                      stored: "@outputs('Compose_Scan_Stored')",
                      depositedBy: "@outputs('Compose_Scan_Caller')",
                      depositedAt: '@utcNow()',
                      /* Echoed, not verified. See the header comment. */
                      sha256: "@outputs('Compose_Scan_Sha256')",
                      bytes: "@outputs('Compose_Scan_Declared_Bytes')",
                    }, ok('Set_variable_varStatusCode_Scan_200')),
                    Compose_Scan_Audit_Meta: compose({
                      reference: "@outputs('Compose_Scan_Reference')",
                      storedName: "@outputs('Compose_Scan_Stored_Name')",
                      declaredBytes: "@outputs('Compose_Scan_Declared_Bytes')",
                      sha256Declared: "@outputs('Compose_Scan_Sha256')",
                      stored: "@outputs('Compose_Scan_Stored')",
                    }, ok('Set_variable_varData_Scan_Deposited')),
                    Create_Scan_Audit: post(L.audit, auditRow({
                      tag: 'Scan', event: 'audit:scan-deposited', module: 'scan-intake', action: 'scan-deposit',
                      severity: 'info', entityType: 'correspondence',
                      entityId: "@outputs('Compose_Scan_Reference')",
                      ref: "@outputs('Compose_Scan_Reference')",
                      title: "@concat('Counter scan deposited ',outputs('Compose_Scan_Reference'))",
                      meta: "@string(outputs('Compose_Scan_Audit_Meta'))",
                    }), ok('Compose_Scan_Audit_Meta')),
                    ...auditFailureBranch('Scan', 'Create_Scan_Audit', 'The deposit was', 'Scan'),
                  },
                  {
                    /* Another run took the counter between the claim and the read-back. Nothing
                       has been filed and no reference has been issued, so this is a retry, not a
                       failure of the deposit. */
                    Set_variable_varStatusCode_Scan_409: setVar('varStatusCode', 409),
                    Append_to_array_variable_varErrors_Scan_Lock: appendErr({ scope: 'Scan', stage: 'reference', status: 'failed', message: 'The reference counter was claimed by another run. Retry.', trackedAtUtc: '@utcNow()' }, ok('Set_variable_varStatusCode_Scan_409')),
                    Set_variable_varData_Scan_Lock: setVar('varData', { stored: false, reason: 'reference_contended' }, ok('Append_to_array_variable_varErrors_Scan_Lock')),
                  },
                  ok('Get_Scan_Sequence_Confirm')),
              },
              ),
          },
          ),
      },
      ok('Compose_Rate_Limited_Scan')),
  }, ok('Compose_Scan_LockToken'), SCAN_CALLER),
};

/* ============================ SEND_EMAIL ============================
 *
 * THE CARRIER BEHIND THE `EMAIL` ENDPOINT, BUILT RATHER THAN PATCHED.
 *
 * `EMAIL` (config/endpoints.config.js, action `dispatchEmail`) is deployed today as
 * `Web - Send Email`. Three desks call it:
 *
 *   core/correspondence-email-service.js  outward official correspondence
 *   modules/reports.js                    a report to the officer's own mailbox
 *   modules/statistics.js                 a report to the recipients the officer typed
 *
 * All three send a recipient. The deployed flow's three SendEmailV2 actions hard-code
 * `emailMessage/To` to dgsRegistry@nitda.gov.ng and read none of them, so an outward
 * correspondence is mailed to the registry and `markSent` then records the row as sent — the
 * Sent Register shows the intended recipient beside a message that never went to them. That is
 * RN-021 and RN-024, and it is why a visible failure would be better than what happens now.
 *
 * WHERE THE RECIPIENT ACTUALLY IS, AND WHY THE EARLIER EXPRESSION MISSED IT.
 *
 * core/data-client.js posts `{action, payload:{…}, userEmail, requestId, timestamp}` — the
 * caller's own fields are NESTED under `payload`, and the correspondence desk nests its own
 * under `payload.email`. So the recipient is at `payload.email.to` (correspondence),
 * `payload.to` (statistics, an ARRAY), or nowhere at all (reports, which shows the officer
 * "Sent to: <their address>" and relies on the envelope's `userEmail`). Reading
 * `triggerBody()?['to']` finds it on none of the three, which is what
 * scripts/patch-send-email-recipient.mjs did: correct in shape, one level too shallow. Every
 * field here is read payload-first, exactly as the other six internal packages read theirs.
 *
 * `join(array(x),';')` serves the array and the string without asking which arrived: array() on
 * an array returns it unchanged and on a string wraps it, so the join yields a string either way.
 * There is no type test because Logic Apps has no reliable one.
 *
 * FAIL-CLOSED, AND NOT ONCE MORE THAN NECESSARY.
 *
 *   No recipient, subject or body    → 400 with an error the desk can show. Never a send.
 *   Caller not in DGO_UserDirectory  → 401. This endpoint sends mail as the registry mailbox;
 *                                      an ungated one is an open relay wearing NITDA's address.
 *   The same request seen twice      → 200, no second send. core/data-client.js retries a write
 *                                      on a network fault with the SAME requestId, so a timed-out
 *                                      send that in fact delivered would otherwise be delivered
 *                                      again. The outbox receipt is the ledger that says so.
 *   The send itself fails            → 502, the error appended to varErrors, and a `failed`
 *                                      outbox receipt. DGO_SCHEDULED_SWEEP's Scope_Outbox reads
 *                                      exactly that row and retries it; at the ceiling it raises
 *                                      outbox-failure-alert. Nothing else needs to be built for
 *                                      the retry path, because the retry path already exists.
 *
 * NO PERMISSION CHECK, DELIBERATELY. The other internal packages gate on a permission because
 * their operations map to one (`user:view`, `bulk:assign`). Mail does not: reports and
 * statistics are sent by operators and viewers today, and gating this on `dispatch:approve` —
 * the only permission that fits outward correspondence — would silently stop both desks for
 * every role but director and systemAdmin. That is a policy change, not a build decision, so it
 * is not made here. To make it, wrap the Condition_SendEmail_Addressed branch in the same
 * `gate('SendEmail','dispatch:approve', …)` the assignment flows use.
 *
 * ATTACHMENTS ARE TWO DIFFERENT THINGS AND ARE KEPT APART.
 *   `payload.email.attachments`  strings — what correspondence sends: `split(attachmentSummary)`,
 *                                a list of names or links with no file content anywhere in the
 *                                request. They are rendered as a listed section under the message,
 *                                which is what they are. Nothing is fabricated into ContentBytes.
 *   `payload.attachments`        objects — `[{Name, ContentBytes}]`, the connector's own shape,
 *                                passed to emailMessage/Attachments. No desk sends this today;
 *                                the branch exists because SendEmailV2 cannot take an absent
 *                                parameter conditionally, so a file-bearing send needs its own
 *                                action, and the deployed flow branches the same way.
 */

/* Payload-first, three places, in the order the clients actually use. */
const mailField = (...keys) => keys.flatMap((k) => [
  `triggerBody()?['payload']?['email']?['${k}']`,
  `triggerBody()?['payload']?['${k}']`,
  `triggerBody()?['${k}']`,
]).join(',');
const mailStr = (...keys) => `trim(string(coalesce(${mailField(...keys)},'')))`;

const sendAll = (n) => ({ [n]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] });

/* One send, its receipt, its error branch and its outcome. Two of these exist — with and
   without file attachments — because the connector takes emailMessage/Attachments or does not,
   and a parameter cannot be conditionally absent from a single action. */
function sendBranch(slug, withFiles) {
  const send = `Send_Email${withFiles ? '_With_Attachments' : ''}`;
  const receipt = `Create_SendEmail_Receipt_${slug}`;
  const failed = `Append_to_array_variable_varErrors_SendEmail_${slug}_Failed`;
  const code = `Set_variable_varStatusCode_SendEmail_${slug}`;
  const data = `Set_variable_varData_SendEmail_${slug}`;
  const sent = `equals(actions('${send}')?['status'],'Succeeded')`;
  return {
    [send]: {
      type: 'OpenApiConnection',
      inputs: {
        parameters: {
          'emailMessage/To': "@outputs('Compose_SendEmail_Recipients')",
          'emailMessage/Subject': "@outputs('Compose_SendEmail_Subject')",
          'emailMessage/Body': "@outputs('Compose_SendEmail_Body_Html')",
          /* Empty is the connector's own no-op for both of these; the desks leave them empty far
             more often than they fill them, so neither is worth a branch.
             ONE PARAMETER HERE IS NOT EVIDENCED BY THIS ESTATE. emailMessage/Cc appears in three
             accepted definitions in docs/reference/flow-contracts/deployed and Importance in
             forty; emailMessage/Bcc appears in NONE, because no flow in this estate has ever sent
             a blind copy. It is carried anyway — the correspondence desk collects `bcc` on every
             draft (core/correspondence-email-service.js), and dropping the parameter would
             discard a field the officer filled in without telling them, which is the same class
             of defect this package exists to close. It is a documented parameter of the
             connector's Send an email (V2) operation, so the risk is that the estate has not
             exercised it, not that it does not exist. Confirm it on the first send with a Bcc. */
          'emailMessage/Cc': "@outputs('Compose_SendEmail_Cc')",
          'emailMessage/Bcc': "@outputs('Compose_SendEmail_Bcc')",
          'emailMessage/Importance': "@outputs('Compose_SendEmail_Importance')",
          ...(withFiles ? { 'emailMessage/Attachments': "@outputs('Compose_SendEmail_File_Attachments')" } : {}),
        },
        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_office365', connection: 'shared_office365', operationId: 'SendEmailV2' },
      },
      metadata: meta(),
    },
    /* Written whichever way the send went. A `failed` row is not bookkeeping: it is the input
       DGO_SCHEDULED_SWEEP's Scope_Outbox retries from. */
    [receipt]: post(L.outbox, {
      'item/Title': "@outputs('Compose_SendEmail_Receipt_Title')",
      'item/MessageType': "@outputs('Compose_SendEmail_Message_Type')",
      'item/RecipientEmail': "@outputs('Compose_SendEmail_Recipients')",
      'item/Reference': "@outputs('Compose_SendEmail_Reference')",
      'item/SentAtUtc': '@utcNow()',
      'item/Status': `@if(${sent},'sent','failed')`,
      'item/Attempts': 1,
      'item/LastError': `@if(${sent},'',string(actions('${send}')?['error']))`,
    }, sendAll(send)),
    [failed]: appendErr({
      scope: 'SendEmail', stage: 'dispatch', status: 'failed',
      message: 'The message could not be sent. A failed outbox receipt was written and the hourly sweep retries it.',
      details: `@actions('${send}')?['error']`, trackedAtUtc: '@utcNow()',
    }, { [send]: ['Failed', 'TimedOut', 'Skipped'] }),
    /* 502, not 500: the failure is the mail service refusing, and the desks queue a 5xx and
       resend. A receipt that cannot be written must not turn a delivered message into an
       error, so the status is read from the SEND and the receipt is chained on every status. */
    [code]: setVar('varStatusCode', `@if(${sent},200,502)`, {
      [receipt]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'],
      [failed]: ['Succeeded', 'Skipped'],
    }),
    [data]: setVar('varData', {
      sent: `@${sent}`,
      duplicate: false,
      messageType: "@outputs('Compose_SendEmail_Message_Type')",
      reference: "@outputs('Compose_SendEmail_Reference')",
      recipients: "@outputs('Compose_SendEmail_Recipients')",
      cc: "@outputs('Compose_SendEmail_Cc')",
      bcc: "@outputs('Compose_SendEmail_Bcc')",
      subject: "@outputs('Compose_SendEmail_Subject')",
      attachmentCount: "@length(outputs('Compose_SendEmail_File_Attachments'))",
      receipt: "@outputs('Compose_SendEmail_Receipt_Title')",
      sentAtUtc: '@utcNow()',
      requestId: "@variables('varRequestId')",
    }, ok(code)),
  };
}

const sendEmailBody = {
  Compose_SendEmail_Caller: compose(CALLER),
  Get_SendEmail_Directory_User: get(L.users, {
    $filter: "@concat('Email eq ''',replace(outputs('Compose_SendEmail_Caller'),'''',''''''),''' and Status eq ''active''')",
    $top: 1,
  }, ok('Compose_SendEmail_Caller')),
  Condition_SendEmail_Known_Caller: cond(
    { greater: ["@length(coalesce(outputs('Get_SendEmail_Directory_User')?['body/value'],json('[]')))", 0] },
    {
      /* The whole preparation is ONE chain. An action without runAfter is a root of its branch,
         so composing these in parallel would let the condition below read outputs the runtime
         has not promised to have produced. */
      Compose_SendEmail_Recipients: compose(`@trim(join(array(coalesce(${mailField('to', 'recipientEmail')},triggerBody()?['userEmail'],'')),';'))`),
      Compose_SendEmail_Cc: compose(`@trim(join(array(coalesce(${mailField('cc')},'')),';'))`, ok('Compose_SendEmail_Recipients')),
      Compose_SendEmail_Bcc: compose(`@trim(join(array(coalesce(${mailField('bcc')},'')),';'))`, ok('Compose_SendEmail_Cc')),
      Compose_SendEmail_Subject: compose(`@${mailStr('subject', 'subjectLine')}`, ok('Compose_SendEmail_Bcc')),
      Compose_SendEmail_Priority: compose(`@toLower(${mailStr('priority', 'importance')})`, ok('Compose_SendEmail_Subject')),
      /* SendEmailV2 takes Low | Normal | High and rejects anything else, so the desks' own
         vocabulary ('normal', 'urgent', '') is mapped rather than passed through. */
      Compose_SendEmail_Importance: compose(
        "@if(or(equals(outputs('Compose_SendEmail_Priority'),'high'),equals(outputs('Compose_SendEmail_Priority'),'urgent')),'High',if(equals(outputs('Compose_SendEmail_Priority'),'low'),'Low','Normal'))",
        ok('Compose_SendEmail_Priority')),
      /* string(item()) rather than item()?['Name']: property selection on a string is a runtime
         error in Logic Apps, and this list is strings today. A projection that cannot throw
         costs one action. */
      Select_SendEmail_Attachment_Links: select(
        "@coalesce(triggerBody()?['payload']?['email']?['attachments'],json('[]'))",
        '@string(item())', ok('Compose_SendEmail_Importance')),
      Compose_SendEmail_Attachment_Section: compose(
        "@if(empty(body('Select_SendEmail_Attachment_Links')),'',concat('<div style=\"margin-top:18px;padding-top:12px;border-top:1px solid #D8E0DA;font-family:Arial,Segoe UI,sans-serif;font-size:13px\"><b>Attachments</b><ul><li>',join(body('Select_SendEmail_Attachment_Links'),'</li><li>'),'</li></ul></div>'))",
        ok('Select_SendEmail_Attachment_Links')),
      Compose_SendEmail_Message_Body: compose(`@${mailStr('html', 'text', 'body')}`, ok('Compose_SendEmail_Attachment_Section')),
      Compose_SendEmail_Body_Html: compose(
        "@concat(outputs('Compose_SendEmail_Message_Body'),outputs('Compose_SendEmail_Attachment_Section'))",
        ok('Compose_SendEmail_Message_Body')),
      Compose_SendEmail_File_Attachments: compose(
        "@coalesce(triggerBody()?['payload']?['attachments'],triggerBody()?['attachments'],json('[]'))",
        ok('Compose_SendEmail_Body_Html')),
      /* Which of the two required notifications this is. The correspondence desk names its
         operation; the report desks send none. */
      Compose_SendEmail_Message_Type: compose(
        `@if(equals(toLower(${mailStr('operation')}),'sendcorrespondenceemail'),'outward-correspondence','report-delivery')`,
        ok('Compose_SendEmail_File_Attachments')),
      Compose_SendEmail_Reference: compose(`@${mailStr('referenceId', 'reference', 'ref')}`, ok('Compose_SendEmail_Message_Type')),
      /* THE IDEMPOTENCY KEY IS THE REQUEST, NOT THE MESSAGE.
         core/data-client.js mints one requestId per user action and reuses it across its retry
         loop, so keying on it collapses transport retries into one send while leaving a
         deliberate re-send of the same draft — a new action, a new requestId — free to go. */
      Compose_SendEmail_Receipt_Title: compose(
        "@concat(outputs('Compose_SendEmail_Message_Type'),':',variables('varRequestId'))",
        ok('Compose_SendEmail_Reference')),
      Get_SendEmail_Receipt: get(L.outbox, {
        $filter: "@concat('Title eq ''',replace(outputs('Compose_SendEmail_Receipt_Title'),'''',''''''),'''')",
        $top: 1,
      }, ok('Compose_SendEmail_Receipt_Title')),
      /* Only a receipt that says `sent` suppresses a send. A `failed` one is the opposite
         signal: the message never arrived and this request may deliver it. */
      Compose_SendEmail_Already_Sent: compose(
        "@and(greater(length(coalesce(outputs('Get_SendEmail_Receipt')?['body/value'],json('[]'))),0),equals(toLower(string(coalesce(first(outputs('Get_SendEmail_Receipt')?['body/value'])?['Status'],''))),'sent'))",
        ok('Get_SendEmail_Receipt')),
      Condition_SendEmail_Addressed: cond(
        { and: [
          { not: { equals: ["@outputs('Compose_SendEmail_Recipients')", ''] } },
          { not: { equals: ["@outputs('Compose_SendEmail_Subject')", ''] } },
          { not: { equals: ["@outputs('Compose_SendEmail_Message_Body')", ''] } },
        ] },
        {
          Condition_SendEmail_Not_Already_Sent: cond(
            { equals: ["@outputs('Compose_SendEmail_Already_Sent')", false] },
            {
              Condition_SendEmail_Has_Attachments: cond(
                { greater: ["@length(outputs('Compose_SendEmail_File_Attachments'))", 0] },
                sendBranch('Attached', true),
                sendBranch('Plain', false)),
            },
            {
              Set_variable_varStatusCode_SendEmail_Duplicate: setVar('varStatusCode', 200),
              Set_variable_varData_SendEmail_Duplicate: setVar('varData', {
                sent: true,
                duplicate: true,
                messageType: "@outputs('Compose_SendEmail_Message_Type')",
                reference: "@outputs('Compose_SendEmail_Reference')",
                recipients: "@outputs('Compose_SendEmail_Recipients')",
                receipt: "@outputs('Compose_SendEmail_Receipt_Title')",
                sentAtUtc: "@string(coalesce(first(outputs('Get_SendEmail_Receipt')?['body/value'])?['SentAtUtc'],''))",
                requestId: "@variables('varRequestId')",
              }, ok('Set_variable_varStatusCode_SendEmail_Duplicate')),
            }),
        },
        {
          Set_variable_varStatusCode_SendEmail_400: setVar('varStatusCode', 400),
          Append_to_array_variable_varErrors_SendEmail_Invalid: appendErr({
            scope: 'SendEmail', stage: 'validation', status: 'failed',
            message: 'The request carried no recipient, no subject or no message body.',
            trackedAtUtc: '@utcNow()',
          }, ok('Set_variable_varStatusCode_SendEmail_400')),
          Set_variable_varData_SendEmail_Invalid: setVar('varData', {
            code: 'INVALID_REQUEST',
            message: 'A recipient, a subject and a message body are required.',
          }, ok('Append_to_array_variable_varErrors_SendEmail_Invalid')),
        },
        ok('Compose_SendEmail_Already_Sent')),
    },
    denied('SendEmail', 401, 'The caller is not in DGO_UserDirectory, or is not active.'),
    ok('Get_SendEmail_Directory_User')),
};

/* ============================ emit ============================ */

const FLOWS = [
  ['DGO_FETCH_ALL.designer-paste.json', 'Scope_FetchAll_Flow', 'FetchAll', fetchAllBody, { caller: "@outputs('Compose_FetchAll_Caller')" }, 'fetchAll', 'read'],
  ['DGO_REFERENCE_DATA.designer-paste.json', 'Scope_Lookups_Flow', 'Lookups', referenceDataBody, { caller: "@outputs('Compose_Lookups_Caller')" }, 'lookups', 'read'],
  ['DGO_GET_DOCS.designer-paste.json', 'Scope_GetDocs_Flow', 'GetDocs', getDocsBody, { caller: "@outputs('Compose_GetDocs_Caller')", reference: "@outputs('Compose_GetDocs_Reference')" }, 'getDocs', 'read'],
  ['DGO_SINGLE_ASSIGNMENT.designer-paste.json', 'Scope_Assign_Flow', 'Assign', singleAssignmentBody, { caller: "@outputs('Compose_Assign_Caller')", ref: "@outputs('Compose_Assign_Reference')" }, 'singleassignment', 'assign'],
  ['DGO_BULK_ASSIGNMENT.designer-paste.json', 'Scope_Bulk_Flow', 'Bulk', bulkAssignmentBody, { caller: "@outputs('Compose_Bulk_Caller')", requested: "@length(outputs('Compose_Bulk_Items'))" }, 'bulkassignment', 'assign'],
  ['DGO_DYNAMIC_GLOBAL_ACTIONS.designer-paste.json', 'Scope_Dynamic_Flow', 'Dynamic', dynamicBody, { caller: "@outputs('Compose_Dynamic_Caller')", operation: "@outputs('Compose_Dynamic_Operation')", ref: "@outputs('Compose_Dynamic_Reference')" }, 'dynamicGlobalAction', 'dispatch'],
  ['DGO_OTP.designer-paste.json', 'Scope_Otp_Flow', 'Otp', otpBody, { action: "@outputs('Compose_Otp_Action')", knownUser: "@outputs('Compose_Otp_Known_User')" }, 'generate', 'identity'],
  /* audience 'portal' selects the FLAT response body, and that is correct here even though the
     flow is internal. SCAN_INTAKE has no EndpointContracts entry by design and does not go
     through DataClient or assertEnvelope: core/scan-intake-service.js does its own fetch and
     reads referenceId, attachmentLink, stored, depositedBy, sha256 and bytes off the TOP level
     of the JSON. Wrapping them in the standard envelope would put every one of them a level
     deeper than the only client that calls it. */
  ['DGO_SCAN_INTAKE.designer-paste.json', 'Scope_Scan_Flow', 'Scan', scanIntakeBody, { filename: "@outputs('Compose_Scan_Filename_Decoded')", declaredBytes: "@outputs('Compose_Scan_Declared_Bytes')", caller: "@outputs('Compose_Scan_Caller')" }, 'scanDeposit', 'deposit', 'portal'],
  /* The run record carries WHO and WHICH MESSAGE, never the recipients, the subject or the
     body: those are the correspondence itself, and the outbox row already records where it
     went. A telemetry list is not the place for a second copy of an official letter. */
  ['DGO_SEND_EMAIL.designer-paste.json', 'Scope_Send_Email_Flow', 'SendEmail', sendEmailBody, { caller: "@outputs('Compose_SendEmail_Caller')", messageType: "@outputs('Compose_SendEmail_Message_Type')", reference: "@outputs('Compose_SendEmail_Reference')" }, 'dispatchEmail', 'sendEmail'],
];

for (const [file, nodeId, tag, body, redacted, action, operation, audience] of FLOWS) {
  const sv = assemble(tag, body, redacted, action, operation, audience || 'internal');
  writeFileSync(OUT + file, JSON.stringify({ nodeId, serializedValue: sv, allConnectionData: connData(sv), staticResults: {}, isScopeNode: true, mslaNode: true }));
  /* varBulkResults is specific to the bulk flow and, like the eight shared ones, cannot be
     initialised inside the pasted scope. It travels in that flow's prerequisite list instead. */
  emitVariables(file, tag === 'Bulk' ? [{ name: 'varBulkResults', type: 'array', value: [] }] : [], OUT, JSON.stringify(sv).includes(L.audit.t));
}
/* ============================ the variable carrier, retired ============================
 *
 * This emitted ONE package carrying the union of all nine declarations, pasted once per flow.
 * It is superseded by scripts/build-flow-variables.mjs, which writes a dedicated
 * <FLOW>.variables.designer-paste.json per flow carrying exactly the variables THAT flow uses,
 * derived from the flow's own package rather than from a list kept here.
 *
 * The union was defensible — an unread declaration costs nothing, and six flows never read
 * varBulkResults — but it could not be checked against the flow it served: nothing could say
 * whether a flow's needs were met, only that the union was present. The per-flow files can be,
 * and scripts/forensic-validate-packages.mjs does: every variable a flow reads or writes must be
 * declared in its own package, and every declaration must carry a name, a type and a value.
 *
 * The technique is unchanged and still governs the paste order: the designer ACCEPTS a nested
 * Initialize variable and refuses to SAVE one, so the declarations are dragged to the top level
 * and the empty scope deleted before the flow's own package is pasted. */

for (const f of readdirSync(OUT).sort()) console.log(String(statSync(OUT + f).size).padStart(7), f);
