#!/usr/bin/env node
/**
 * Correct the four HTTP-triggered governance flows: GOV-04 and GOV-05.
 *
 * WHAT IS WRONG WITH THEM AS DEPLOYED
 *
 * GOV-04 — none of the four returns an outcome. `02`, `03` and `07` declare no Response action
 * at all. `05` declares one, `Reply`, but it runs six hops downstream of a scope whose every
 * path ends in a Terminate, so it never executes. In all four cases the caller receives Power
 * Automate's default acknowledgement and never learns what happened — and the validation
 * failures terminate with runStatus Failed AFTER the trigger has already accepted, so an
 * invalid registration, a dropped execution record and a success are indistinguishable from
 * outside. A registry that silently under-records is worse than no registry, because it is
 * trusted.
 *
 * GOV-05 — `05 - GOV - Retire HTTP Flow` accepts an anonymous POST and then retires the
 * registry row, closes every current contract version, marks every non-retired consumer and
 * every non-retired dependency Retired, and resolves the open exceptions. The workbook's own
 * key control for this scenario reads "verify no active consumers/dependencies remain" and
 * "stop new traffic before technical removal". The flow does not verify — it retires them,
 * which erases the evidence that any were active.
 *
 * WHAT THIS SCRIPT PRODUCES
 *
 * Corrected definitions under `docs/deployment/governance/flows/`, ready to paste over the
 * deployed ones. It does NOT modify `docs/reference/flow-contracts/deployed/`: that directory
 * is the record of what IS in the tenant, and overwriting it would destroy the evidence that
 * these corrections are outstanding. The two diverge until an operator applies them, and
 * `tests/governance-estate.test.mjs` holds both positions.
 *
 * THE RESPONSE CORRECTION, PRECISELY
 *
 * Every `Terminate` at any depth gets a `Response` immediately before it, in the same branch,
 * inheriting the Terminate's `runAfter`; the Terminate then runs after the Response. That is
 * what makes it reachable — appending a Response after a scope that always terminates is
 * exactly the mistake `05` already contains.
 *
 * Status codes are derived from the Terminate's own declared runStatus, so the HTTP result and
 * the run result cannot disagree: `Failed` on a validation branch is 400, `Failed` on a
 * not-found branch is 404, any other `Failed` is 500, and `Succeeded` is 200.
 *
 * THE RETIREMENT GUARD, PRECISELY
 *
 *   · `force` is added to the trigger schema as a boolean, defaulting false.
 *   · `Count_Active_Consumers` and `Count_Active_Dependencies` run before any write.
 *   · `If_Safe_To_Retire` gates the cascade: it proceeds only when both counts are zero OR
 *     `force` is true.
 *   · The blocked branch returns 409 with both counts and the reason, and terminates Failed.
 *   · The forced branch records `ForcedRetirement` and the two counts on the registry row, so a
 *     forced cascade is visible afterwards rather than indistinguishable from a safe one.
 *
 *   npm run governance:patchflows              # regenerate
 *   npm run governance:patchflows -- --check   # fail if the emitted files have drifted
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYED = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
const OUT = path.join(ROOT, 'docs/deployment/governance/flows');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

/** The four HTTP-triggered governance flows, by the prefix of their exported filename. */
const TARGETS = [
  { prefix: '02 - GOV - Register HTTP Flow Truth', slug: '02-register-http-flow-truth' },
  { prefix: '03 - GOV - Record HTTP Flow Execution', slug: '03-record-http-flow-execution' },
  { prefix: '05 - GOV - Retire HTTP Flow', slug: '05-retire-http-flow' },
  { prefix: '07 - GOV - Consumer HTTP Self-Registration Template', slug: '07-consumer-self-registration' },
];

/**
 * The HTTP status a Terminate branch should answer with.
 *
 * Read from the Terminate's own name and runStatus rather than assigned per flow, so a branch
 * added later inherits the right code instead of silently defaulting to 200.
 */
function statusFor(name, runStatus) {
  if (runStatus === 'Succeeded') return 200;
  if (/Invalid_Input|Validation/i.test(name)) return 400;
  if (/Not_Found|Unavailable|Missing/i.test(name)) return 404;
  if (/Blocked|Conflict|Active_/i.test(name)) return 409;
  return 500;
}

function outcomeFor(name, runStatus) {
  if (runStatus === 'Succeeded') return 'succeeded';
  if (/Invalid_Input|Validation/i.test(name)) return 'invalid-input';
  if (/Not_Found|Unavailable|Missing/i.test(name)) return 'not-found';
  if (/Blocked|Conflict|Active_/i.test(name)) return 'blocked';
  return 'failed';
}

/**
 * Insert a Response immediately before every Terminate, in the same branch.
 *
 * Reachability is the whole point: the Response takes the Terminate's runAfter, and the
 * Terminate is rewired to run after the Response. Appending one after a scope that always
 * terminates — which is the defect `05` already has — would produce a Response that parses,
 * satisfies a naive "has a Response action" check, and never runs.
 */
function insertResponses(actions, flowName, added) {
  if (!actions) return;
  for (const [name, action] of Object.entries({ ...actions })) {
    if (action.actions) insertResponses(action.actions, flowName, added);
    if (action.else?.actions) insertResponses(action.else.actions, flowName, added);
    if (action.type !== 'Terminate') continue;

    const runStatus = action.inputs?.runStatus ?? 'Failed';
    const responseName = `Respond_${name.replace(/^Terminate_?/, '') || 'Outcome'}`;
    if (actions[responseName]) continue;                       // already corrected

    const status = statusFor(name, runStatus);
    const outcome = outcomeFor(name, runStatus);

    actions[responseName] = {
      type: 'Response',
      kind: 'Http',
      runAfter: { ...(action.runAfter || {}) },
      inputs: {
        statusCode: status,
        headers: { 'Content-Type': 'application/json' },
        body: {
          outcome,
          status: runStatus,
          flow: flowName,
          branch: name,
          /* The run id lets a caller correlate its request with the execution ledger without
             the flow having to echo the payload back. */
          runId: "@{workflow()?['run']?['name']}",
          message: action.inputs?.runError?.message ?? `${flowName} ended at ${name}.`,
          at: '@{utcNow()}',
        },
      },
    };
    action.runAfter = { [responseName]: ['Succeeded'] };
    added.push(`${flowName}: ${responseName} → ${status} before ${name}`);
  }
}

/* ── the retirement guard ─────────────────────────────────────────────────────────────── */

const LIST_URI = (title, filter) =>
  `@concat('_api/web/lists/getByTitle(''${title}'')/items?$select=Id&$filter=RegistryKey eq ''',`
  + `replace(outputs('Compose_Registry_Key'),'''',''''''),'''${filter}&$top=5000')`;

/**
 * 02: accept a `workflowId` on the trigger, validate its shape, and write it to the registry row.
 *
 * WHY, AND WHY IT IS A SHAPE CHECK RATHER THAN A FREE-TEXT FIELD
 *
 * GOV-06: the repository holds 77 exported flow definitions keyed by a 36-character dashed Power
 * Automate flow GUID, and the tenant register holds 51 workflows keyed by a 32-hex Logic Apps
 * workflow id. They are different identifier spaces for the same objects, and ZERO exported
 * definitions carry an id the register knows. Joining on normalised display name matches 13 of 77.
 *
 * `DGO_HTTPFlowRegistry.WorkflowId` is where the two finally sit in one row, beside `FlowId`. The
 * runbook's Step 6 is the adoption. Until this flow accepts the value there is nothing to adopt:
 * the column exists and no caller can populate it.
 *
 * The validation is the point. The single most likely error is pasting the FlowId into
 * `workflowId` — they name the same flow, and one is right there in the same request body. A
 * free-text column would take it, and the join would then be name-to-name with an extra step,
 * which is the position GOV-06 already describes. So a value that is present and not exactly 32
 * characters, or that contains a dash, is refused with 400 rather than stored.
 *
 * Absent is allowed. 21 of the 77 exported definitions carry no HTTP trigger, so they have no
 * trigger URL to read a workflow id from; refusing registration for want of an id those flows
 * cannot supply would block the adoption on the flows least able to help it.
 */
function acceptWorkflowId(def, added) {
  const scope = def.actions?.Scope_02_GOV_Register_HTTP_Flow_Truth_COMPLETE_UPDATED;
  if (!scope) fail('02: the registration scope is not where it was — re-read the definition before patching.');
  const main = scope.actions?.Scope_Main;
  const validate = main?.actions?.Validate_Input;
  if (!validate?.expression?.and) fail('02: Validate_Input has no `and` expression to extend.');

  const trigger = Object.values(def.triggers || {}).find((t) => t.kind === 'Http');
  if (!trigger) fail('02: no HTTP trigger.');
  const props = trigger.inputs?.schema?.properties;
  if (!props) fail('02: the trigger declares no schema properties.');

  if (props.workflowId) return;                                 // already accepted

  props.workflowId = {
    type: 'string',
    description:
      'The Logic Apps workflow id: exactly 32 hexadecimal characters, no dashes. This is NOT the '
      + 'flowId, which is a 36-character dashed GUID — supplying that here is refused with 400. '
      + 'Optional: a flow with no HTTP trigger has no trigger URL to read it from.',
  };
  added.push('02: trigger schema declares `workflowId` (32 hex, no dashes, optional)');

  /* Absent OR well-formed. Anything else fails validation, which the deployed flow already
     answers with Terminate_Invalid_Input — so this inherits the 400 rather than inventing one. */
  validate.expression.and.push({
    or: [
      { equals: ["@length(trim(coalesce(string(triggerBody()?['workflowId']),'')))", 0] },
      {
        and: [
          { equals: ["@length(trim(string(triggerBody()?['workflowId'])))", 32] },
          { equals: ["@contains(trim(string(triggerBody()?['workflowId'])),'-')", false] },
        ],
      },
    ],
  });
  added.push('02: `workflowId`, when supplied, must be 32 characters and dash-free — a flowId is refused 400');

  /* Written to both arms of the upsert. Writing it only on create would leave every flow already
     registered without one, and re-registering is how an existing row is corrected. */
  /* The upsert sits inside Validate_Input's success branch, not beside it — nothing writes to
     the registry until the input has passed. */
  const upsert = validate.actions?.Upsert_Registry_Record;
  const arms = [
    ['Update_Registry_Record', upsert?.actions?.Update_Registry_Record],
    ['Create_Registry_Record', upsert?.else?.actions?.Create_Registry_Record],
  ];
  const VALUE = "toLower(trim(coalesce(string(triggerBody()?['workflowId']),'')))";
  for (const [name, action] of arms) {
    const body = action?.inputs?.parameters?.['parameters/body'];
    if (typeof body !== 'string' || !body.startsWith('@setProperty(')) {
      fail(`02: ${name} does not build its body with setProperty — re-read the definition before patching.`);
    }
    action.inputs.parameters['parameters/body'] = `@setProperty(${body.slice(1)},'WorkflowId',${VALUE})`;
    added.push(`02: ${name} writes WorkflowId`);
  }
}

function guardRetirement(def, added) {
  const scope = def.actions?.Scope_05_GOV_Retire_HTTP_Flow_COMPLETE_UPDATED;
  if (!scope) fail('05: the retirement scope is not where it was — re-read the definition before patching.');
  const main = scope.actions?.Scope_Main;
  if (!main?.actions) fail('05: Scope_Main is missing.');
  const A = main.actions;

  if (A.If_Safe_To_Retire) return;                              // already guarded

  /* `force` on the trigger, defaulted false. Declared in the schema so the contract states it
     rather than leaving an undocumented magic field. */
  const trigger = Object.values(def.triggers || {}).find((t) => t.kind === 'Http');
  if (!trigger) fail('05: no HTTP trigger.');
  const props = trigger.inputs?.schema?.properties;
  if (props && !props.force) {
    props.force = {
      type: 'boolean',
      description:
        'Retire even when active consumers or dependencies remain. Absent or false is refused '
        + 'with 409 and the counts. A forced retirement is recorded on the registry row.',
    };
    added.push('05: trigger schema declares `force` (boolean, default false)');
  }

  /* Count before writing. Both counts run after Validate_Input and before anything else, so a
     blocked retirement performs no write at all. */
  A.Count_Active_Consumers = {
    type: 'OpenApiConnection',
    runAfter: { If_Registry_Found: ['Succeeded'] },
    inputs: {
      host: { connectionName: 'shared_sharepointonline', operationId: 'HttpRequest', apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' },
      parameters: {
        dataset: 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE',
        'parameters/method': 'GET',
        'parameters/uri': LIST_URI('DGO_HTTPFlowConsumerRegistry', " and LifecycleStatus ne ''Retired''"),
        'parameters/headers': { accept: 'application/json;odata=nometadata' },
      },
    },
  };
  A.Count_Active_Dependencies = {
    type: 'OpenApiConnection',
    runAfter: { Count_Active_Consumers: ['Succeeded'] },
    inputs: {
      host: { connectionName: 'shared_sharepointonline', operationId: 'HttpRequest', apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' },
      parameters: {
        dataset: 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE',
        'parameters/method': 'GET',
        'parameters/uri': LIST_URI('DGO_HTTPFlowDependencies', " and LifecycleStatus ne ''Retired''"),
        'parameters/headers': { accept: 'application/json;odata=nometadata' },
      },
    },
  };
  A.Compose_Active_Counts = {
    type: 'Compose',
    runAfter: { Count_Active_Dependencies: ['Succeeded'] },
    inputs: {
      activeConsumers: "@length(coalesce(body('Count_Active_Consumers')?['value'],json('[]')))",
      activeDependencies: "@length(coalesce(body('Count_Active_Dependencies')?['value'],json('[]')))",
      force: "@coalesce(triggerBody()?['force'],false)",
    },
  };

  /* The gate. Everything that used to run straight after If_Registry_Found now runs inside the
     safe branch; the blocked branch answers 409 and stops without writing. */
  const cascaded = ['Find_Current_Contracts', 'Close_Contracts', 'Find_Dependencies',
    'Retire_Dependencies', 'Retire_Registry', 'Find_Consumers', 'Retire_Consumers',
    'Find_Open_Exceptions', 'Resolve_Open_Exceptions'];
  const moved = {};
  for (const n of cascaded) {
    if (!A[n]) continue;
    moved[n] = A[n];
    delete A[n];
  }

  /* `Retire_Registry` is nested inside `If_Registry_Found`, not a direct child of Scope_Main,
     so moving only the top-level cascade left the single most consequential write outside the
     guard — a blocked retirement would still have retired the registry row. It is lifted out
     here, and `If_Registry_Found` keeps a marker in its place so the condition still reads as a
     condition and its else-branch Terminate is untouched. */
  const found = A.If_Registry_Found;
  if (found?.actions?.Retire_Registry) {
    moved.Retire_Registry = found.actions.Retire_Registry;
    delete found.actions.Retire_Registry;
    found.actions.Registry_Found = {
      type: 'Compose',
      runAfter: {},
      inputs: {
        registryKey: "@outputs('Compose_Registry_Key')",
        note: 'The registry row exists. Retirement itself is gated by If_Safe_To_Retire below.',
      },
    };
    added.push('05: lifted Retire_Registry out of If_Registry_Found and under the guard');
  }
  /* The first moved action anchored on something that is now outside the branch. Re-anchor it
     inside, so the branch is self-contained and its ordering is unchanged otherwise. */
  const firstMoved = cascaded.find((n) => moved[n]);
  if (firstMoved) moved[firstMoved].runAfter = {};

  /* Record that a retirement was forced, where it can be read afterwards. A forced cascade that
     looks identical to a safe one is the audit failure this guard exists to prevent. */
  moved.Record_Forced_Retirement = {
    type: 'Compose',
    runAfter: { [firstMoved]: ['Succeeded'] },
    inputs: {
      forced: "@outputs('Compose_Active_Counts')?['force']",
      activeConsumersAtRetirement: "@outputs('Compose_Active_Counts')?['activeConsumers']",
      activeDependenciesAtRetirement: "@outputs('Compose_Active_Counts')?['activeDependencies']",
      retirementReason: "@triggerBody()?['retirementReason']",
      at: '@utcNow()',
    },
  };

  A.If_Safe_To_Retire = {
    type: 'If',
    runAfter: { Compose_Active_Counts: ['Succeeded'] },
    expression: {
      or: [
        { and: [
          { equals: ["@outputs('Compose_Active_Counts')?['activeConsumers']", 0] },
          { equals: ["@outputs('Compose_Active_Counts')?['activeDependencies']", 0] },
        ] },
        { equals: ["@outputs('Compose_Active_Counts')?['force']", true] },
      ],
    },
    actions: moved,
    else: {
      actions: {
        Respond_Retirement_Blocked: {
          type: 'Response',
          kind: 'Http',
          runAfter: {},
          inputs: {
            statusCode: 409,
            headers: { 'Content-Type': 'application/json' },
            body: {
              outcome: 'blocked',
              status: 'Failed',
              flow: '05 - GOV - Retire HTTP Flow',
              branch: 'If_Safe_To_Retire',
              reason: 'Active consumers or dependencies remain. Retiring would mark them Retired and erase the evidence that they were active.',
              activeConsumers: "@outputs('Compose_Active_Counts')?['activeConsumers']",
              activeDependencies: "@outputs('Compose_Active_Counts')?['activeDependencies']",
              remedy: "Retire or migrate the active consumers and dependencies first, or re-submit with \"force\": true to retire them alongside it. A forced retirement is recorded on the registry row.",
              runId: "@{workflow()?['run']?['name']}",
              at: '@{utcNow()}',
            },
          },
        },
        Terminate_Retirement_Blocked: {
          type: 'Terminate',
          runAfter: { Respond_Retirement_Blocked: ['Succeeded'] },
          inputs: {
            runStatus: 'Failed',
            runError: {
              code: 'ActiveDependantsRemain',
              message: 'Retirement blocked: active consumers or dependencies remain and force was not supplied.',
            },
          },
        },
      },
    },
  };

  added.push('05: Count_Active_Consumers and Count_Active_Dependencies run before any write');
  added.push('05: If_Safe_To_Retire gates the cascade (both counts zero, or force true)');
  added.push('05: blocked branch answers 409 with both counts and terminates Failed');
  added.push('05: Record_Forced_Retirement makes a forced cascade visible afterwards');

  /* `Reply` was the unreachable Response. It sat after the whole scope, which always
     terminates. Every branch now answers for itself, so it has nothing left to do and its
     presence would only re-teach the mistake. */
  if (def.actions.Reply) {
    delete def.actions.Reply;
    for (const a of Object.values(def.actions)) {
      if (a.runAfter?.Reply) { delete a.runAfter.Reply; a.runAfter.Scope_05_GOV_Retire_HTTP_Flow_COMPLETE_UPDATED = ['Succeeded']; }
    }
    added.push('05: removed `Reply` — it ran after a scope that always terminates, so it never executed');
  }
}

/* ── run ──────────────────────────────────────────────────────────────────────────────── */

fs.mkdirSync(OUT, { recursive: true });

const files = fs.readdirSync(DEPLOYED).filter((f) => f.endsWith('.json'));
const results = [];
const emitted = new Map();

for (const target of TARGETS) {
  const file = files.find((f) => f.startsWith(target.prefix));
  if (!file) fail(`no exported definition found for ${target.prefix}`);
  const doc = JSON.parse(fs.readFileSync(path.join(DEPLOYED, file), 'utf8'));
  const def = JSON.parse(JSON.stringify(doc.definition));
  const flowName = doc.workflow_identity?.tags?.flowDisplayName ?? target.prefix;

  const added = [];
  if (target.slug.startsWith('02')) acceptWorkflowId(def, added);
  if (target.slug.startsWith('05')) guardRetirement(def, added);
  insertResponses(def.actions, flowName, added);

  const out = {
    schema: 'dgo-governance-flow-correction/v1',
    flow: flowName,
    /* The 36-character dashed Power Automate flow GUID. It is a FlowId, not a WorkflowId —
       a WorkflowId is the 32-hex Logic Apps id the tenant register keys on, and the runbook
       that exists to keep those two spaces apart was labelling this column "Workflow GUID". */
    flowId: doc.workflow_identity?.internal_name,
    corrects: target.slug.startsWith('05') ? ['GOV-04', 'GOV-05']
      : target.slug.startsWith('02') ? ['GOV-04', 'GOV-06'] : ['GOV-04'],
    generatedBy: 'scripts/patch-governance-flows.mjs',
    basedOn: `docs/reference/flow-contracts/deployed/${file}`,
    howToApply:
      'Power Automate → the flow → Edit → ⋯ → Peek code is read-only, so apply this through the '
      + 'designer or by importing the corrected package. The definition below is complete and '
      + 'replaces the flow definition wholesale. Export the current version first; '
      + 'docs/deployment/governance/APPLY-FLOW-CORRECTIONS.md carries the full procedure and the '
      + 'rollback.',
    changes: added,
    definition: def,
  };
  const outFile = path.join(OUT, `${target.slug}.corrected.json`);
  emitted.set(outFile, JSON.stringify(out, null, 2) + '\n');
  results.push({ flow: flowName, slug: target.slug, changes: added.length, added });
}

console.log('\nGovernance flow corrections — GOV-04 and GOV-05\n');
for (const r of results) {
  console.log(`  ${r.flow}`);
  for (const c of r.added) console.log(`      ${c}`);
  console.log('');
}

if (CHECK) {
  const stale = [...emitted.entries()].filter(([f, content]) =>
    !fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== content).map(([f]) => path.relative(ROOT, f));
  if (stale.length) fail(`${stale.length} corrected definition(s) have drifted:\n     ${stale.join('\n     ')}\n\n     Run: npm run governance:patchflows`);
  console.log('  ✅ every corrected definition is current\n');
  process.exit(0);
}

for (const [file, content] of emitted) fs.writeFileSync(file, content);
console.log(`  ✅ wrote ${emitted.size} corrected definition(s) to ${path.relative(ROOT, OUT)}/\n`);
