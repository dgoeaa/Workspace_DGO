/* Discovery, part 2 — the automated estate.
 *
 * A Power Automate definition is a directed graph: every action names the actions it runs
 * after and the status each must have reached. That graph is the process. This module walks
 * it and emits one STEP per action, one DEC per branch, one EXC per catch path and one
 * NOTIF per outbound message, each carrying the file it was read from.
 *
 * What this module will NOT do: describe what a step means to the business. An action named
 * Compose_Submission_Subject is CONFIRMED to compose a value from the trigger body; whether
 * the agency calls that "capturing the subject" is a business reading no export states. The
 * step records what the definition says and stops there.
 */
import { EV, AUTOMATION, DOCSTATUS, VALIDATION, compact } from './lib.mjs';

const CONNECTOR_NAMES = {
  sharepointonline: 'Microsoft SharePoint Online',
  office365: 'Microsoft Office 365 Outlook',
  office365users: 'Microsoft Office 365 Users',
  onedriveforbusiness: 'Microsoft OneDrive for Business',
  flowmanagement: 'Microsoft Power Automate Management',
  sendmail: 'Microsoft Mail (send-only)',
  excelonlinebusiness: 'Microsoft Excel Online (Business)',
  teams: 'Microsoft Teams',
};

const OPERATION_MEANING = {
  GetItems: 'Reads a filtered set of list items from the system of record.',
  GetItem: 'Reads one list item by identifier from the system of record.',
  PostItem: 'Creates a list item in the system of record.',
  PatchItem: 'Updates a list item in the system of record.',
  PatchFileItem: 'Updates the list metadata attached to a stored file.',
  CreateFile: 'Writes a file into a document library.',
  SendEmailV2: 'Sends an outbound message.',
  SendEmailV3: 'Sends an outbound message.',
  SendEmail: 'Sends an outbound message.',
  SearchUserV2: 'Resolves a person against the directory.',
  GetFlow: 'Reads a workflow definition through the management connector.',
  HttpRequest: 'Calls an external HTTP endpoint.',
  GetEmailV2: 'Reads one mailbox message.',
  GetEmailsV3: 'Reads a set of mailbox messages.',
  GetAttachment_V2: 'Reads an attachment from a mailbox message.',
};

const TYPE_ACTION = {
  Compose: 'Evaluates an expression and holds the result for later steps.',
  InitializeVariable: 'Declares a run-scoped variable and sets its first value.',
  SetVariable: 'Replaces the value held in a run-scoped variable.',
  IncrementVariable: 'Adds to a numeric run-scoped variable.',
  AppendToArrayVariable: 'Appends an element to a run-scoped array.',
  AppendToStringVariable: 'Appends text to a run-scoped string.',
  ParseJson: 'Parses a JSON payload against a declared schema, failing the run when it does not match.',
  Select: 'Projects each element of a collection into a new shape.',
  Query: 'Filters a collection by a condition.',
  Join: 'Concatenates a collection into a single delimited string.',
  Table: 'Renders a collection as an HTML or CSV table.',
  Response: 'Returns the HTTP response to the caller and ends the request.',
  Terminate: 'Ends the run immediately with a declared status.',
  Scope: 'Groups the steps beneath it so one run-after condition governs the whole group.',
  If: 'Evaluates a condition and runs one of two branches.',
  Switch: 'Evaluates an expression and runs the matching case.',
  Foreach: 'Repeats the steps beneath it once per element of a collection.',
  Until: 'Repeats the steps beneath it until a condition holds.',
  Workflow: 'Calls another workflow and waits for its response.',
  Http: 'Calls an external HTTP endpoint directly, without a connector.',
};

const NOISE = /^(Compose_(Flow_Run_Record|Telemetry|Redacted)|Get_Flow_Definition)/;

function connectorOf(v) {
  const h = v?.inputs?.host;
  if (!h) return null;
  const raw = String(h.apiId || h.connection?.referenceName || h.connection?.name || h.connection?.connectionId || '');
  const key = Object.keys(CONNECTOR_NAMES).find(k => raw.includes(k));
  return key ? CONNECTOR_NAMES[key] : (raw || null);
}

/* Which run-scoped values, trigger fields and upstream outputs an action reads. These are
   the step's required inputs, taken from the expressions themselves rather than guessed. */
function inputsOf(v) {
  const t = JSON.stringify(v.inputs ?? '') + JSON.stringify(v.expression ?? '');
  const vars = [...new Set([...t.matchAll(/variables\('([^']+)'\)/g)].map(m => m[1]))];
  const trig = [...new Set([...t.matchAll(/triggerBody\(\)\?\['([^']+)'\]/g)].map(m => m[1]))];
  const outs = [...new Set([...t.matchAll(/(?:outputs|body)\('([^']+)'\)/g)].map(m => m[1]))];
  return { vars, trig, outs };
}

function statusOf(name, v) {
  if (v.type === 'Response') {
    const c = v.inputs?.statusCode;
    return c === undefined ? 'HTTP response returned; status code is set from an expression.' : `HTTP ${c} returned to the caller.`;
  }
  if (v.type === 'Terminate') return `Run terminated with runStatus '${v.inputs?.runStatus || 'unstated'}'.`;
  if (v.type === 'SetVariable' && /status|code|ok|outcome|error/i.test(String(v.inputs?.name || ''))) {
    return `Run-scoped outcome variable '${v.inputs.name}' set.`;
  }
  return null;
}

const RA_SUCCESS = ra => Object.values(ra || {}).every(s => (s || []).every(x => x === 'Succeeded'));

export function discoverFlowSteps(X, ID, opts) {
  const { name, definition, srcIds, ownerProc, packageKind } = opts;
  const { out } = X;
  const triggers = Object.entries(definition.triggers || {});
  const flat = [];              // every action, in declared order, with its container path
  const byName = {};

  (function walk(actions, path, depth) {
    for (const [k, v] of Object.entries(actions || {})) {
      const rec = { key: k, v, path, depth };
      flat.push(rec); byName[k] = rec;
      walk(v.actions, [...path, k], depth + 1);
      if (v.else?.actions) walk(v.else.actions, [...path, `${k} · else`], depth + 1);
      if (v.cases) for (const [cn, c] of Object.entries(v.cases)) walk(c.actions, [...path, `${k} · case ${cn}`], depth + 1);
      if (v.default?.actions) walk(v.default.actions, [...path, `${k} · default`], depth + 1);
    }
  })(definition.actions, [], 0);

  /* Successors: the actions that name this one in their run-after map, split by whether they
     wait for success or for a failure. The second set is the process's recovery path. */
  const succ = {}, altSucc = {};
  for (const r of flat) {
    for (const [prev, sts] of Object.entries(r.v.runAfter || {})) {
      const onlyOk = (sts || []).every(s => s === 'Succeeded');
      (onlyOk ? (succ[prev] ||= []) : (altSucc[prev] ||= [])).push(r.key);
    }
  }

  const stepIds = {};
  let seq = 0;
  for (const r of flat) {
    const { key: k, v, path, depth } = r;
    const conn = connectorOf(v);
    const op = v.inputs?.host?.operationId;
    const { vars, trig, outs } = inputsOf(v);
    const ra = Object.entries(v.runAfter || {});
    const isRecovery = ra.some(([, s]) => (s || []).some(x => x !== 'Succeeded'));
    const readable = k.replace(/_/g, ' ');
    seq += 1;
    const id = ID('STEP');
    stepIds[k] = id;

    const actionPerformed = op
      ? (OPERATION_MEANING[op] || `Calls the connector operation '${op}'.`)
      : (TYPE_ACTION[v.type] || `Runs an action of type '${v.type}'.`);

    out.steps.push(compact({
      id, name: readable, rawName: k,
      process: ownerProc, sequence: seq, nesting: depth,
      container: path.length ? path[path.length - 1].replace(/_/g, ' ') : 'flow root',
      containerPath: path.length ? path.map(x => x.replace(/_/g, ' ')) : undefined,
      description: `${v.type} action '${k}'${conn ? ` on ${conn}` : ''}${path.length ? `, inside ${path[path.length - 1].replace(/_/g, ' ')}` : ''}.`,
      responsible: conn ? `${conn}, called by the flow` : `Power Automate — ${name}`,
      responsibleKind: conn ? 'Integration' : 'Automated',
      trigger: ra.length
        ? ra.map(([p, s]) => `${p.replace(/_/g, ' ')} reaches ${(s || []).join(' or ')}`).join('; ')
        : (path.length ? `Entry of ${path[path.length - 1].replace(/_/g, ' ')}` : 'Flow trigger fires'),
      preconditions: ra.length
        ? ra.map(([p, s]) => `${p.replace(/_/g, ' ')} = ${(s || []).join('|')}`)
        : ['None declared beyond entry into its container.'],
      requiredInputs: [
        ...trig.map(f => `trigger field '${f}'`),
        ...vars.map(f => `variable '${f}'`),
        ...outs.map(f => `output of ${f.replace(/_/g, ' ')}`),
      ],
      actionPerformed,
      rules: v.type === 'If' ? [`Condition: ${JSON.stringify(v.expression)}`.slice(0, 400)]
        : v.type === 'Switch' ? [`Discriminator: ${String(v.expression).slice(0, 200)}`]
          : (v.inputs?.name ? [`Writes '${v.inputs.name}'.`] : undefined),
      systemResponse: conn ? `${conn} returns its result to the run; a non-success reply fails this step.` : 'The value is held in the run and made available to later steps.',
      output: v.type === 'Response' ? 'HTTP response body and headers.'
        : ['SetVariable', 'InitializeVariable', 'IncrementVariable', 'AppendToArrayVariable', 'AppendToStringVariable'].includes(v.type)
          ? `Run-scoped variable '${v.inputs?.name || 'unnamed'}'.`
          : v.type === 'Compose' ? 'A composed value addressable by later steps.'
            : conn ? 'The connector response body.' : 'Control passes to the next step.',
      resultingStatus: statusOf(k, v),
      nextStep: (succ[k] || []).map(x => x.replace(/_/g, ' ')),
      alternativeNextSteps: (altSucc[k] || []).map(x => `${x.replace(/_/g, ' ')} (runs when this does not succeed)`),
      dependencies: conn ? [conn] : undefined,
      controls: v.type === 'ParseJson' ? ['Schema validation: a payload that does not match the declared schema fails the run here.'] : undefined,
      exceptions: isRecovery ? ['This step is itself a recovery path: it runs only when its predecessor did not succeed.'] : undefined,
      auditEvent: op && /PostItem|PatchItem/.test(op) ? 'Writes a list item; the write itself is the audit record.'
        : op && /SendEmail/.test(op) ? 'Sends a message; delivery is the record.' : undefined,
      evidence: EV.CONFIRMED,
      evidenceNote: 'Read directly from the workflow definition: type, run-after conditions, referenced inputs and container are stated by the export.',
      businessMeaning: 'Not evidenced. The definition states the mechanism; no supplied artifact states what this step means to the business.',
      validationStatus: VALIDATION.NONE,
      source: srcIds,
    }));

    /* Decisions — every branch point, with its outcomes and the branch each leads to. */
    if (v.type === 'If') {
      const yes = Object.keys(v.actions || {}), no = Object.keys(v.else?.actions || {});
      out.decisions.push(compact({
        id: ID('DEC'), name: readable, process: ownerProc, step: id,
        description: `Two-way branch evaluated inside ${name}.`,
        owner: `Power Automate — ${name}`,
        evaluationCondition: JSON.stringify(v.expression || {}).slice(0, 600),
        informationEvaluated: [...trig.map(f => `trigger field '${f}'`), ...vars.map(f => `variable '${f}'`), ...outs.map(f => `output of ${f.replace(/_/g, ' ')}`)],
        outcomes: ['true', 'false'],
        branches: [
          `true → ${yes.length ? yes.map(x => x.replace(/_/g, ' ')).join(', ') : 'no action; the branch is empty'}`,
          `false → ${no.length ? no.map(x => x.replace(/_/g, ' ')).join(', ') : 'no action; the branch is empty'}`,
        ],
        defaultBehaviour: no.length ? 'The false branch is declared and carries actions.' : 'No false branch is declared: when the condition does not hold, the run continues past the decision.',
        exceptionBehaviour: 'Not declared on the decision itself; a failure inside a branch is governed by the run-after conditions of whatever follows.',
        evidence: EV.CONFIRMED,
        evidenceNote: 'Condition expression and both branches read from the definition.',
        source: srcIds,
      }));
    }
    if (v.type === 'Switch') {
      const cases = Object.entries(v.cases || {});
      out.decisions.push(compact({
        id: ID('DEC'), name: readable, process: ownerProc, step: id,
        description: `Multi-way branch evaluated inside ${name}.`,
        owner: `Power Automate — ${name}`,
        evaluationCondition: String(v.expression).slice(0, 400),
        informationEvaluated: [...trig.map(f => `trigger field '${f}'`), ...vars.map(f => `variable '${f}'`)],
        outcomes: cases.map(([, c]) => String(c.case)),
        branches: cases.map(([cn, c]) => `${JSON.stringify(c.case)} → ${Object.keys(c.actions || {}).map(x => x.replace(/_/g, ' ')).join(', ') || 'no action'}`),
        defaultBehaviour: v.default?.actions
          ? `Default branch runs: ${Object.keys(v.default.actions).map(x => x.replace(/_/g, ' ')).join(', ')}.`
          : 'No default branch is declared: an unmatched value falls through with no action.',
        exceptionBehaviour: 'Not declared on the decision itself.',
        evidence: EV.CONFIRMED,
        evidenceNote: 'Discriminator expression and every case read from the definition.',
        source: srcIds,
      }));
    }

    /* Notifications and escalations — outbound messages the process actually sends. */
    if (op && /SendEmail/i.test(op)) {
      const i = v.inputs?.parameters || {};
      out.notifications.push(compact({
        id: ID('NOTIF'), name: readable, process: ownerProc, step: id,
        channel: 'Email — Microsoft Office 365 Outlook',
        kind: /escalat|overdue|breach|reminder/i.test(k) ? 'Escalation' : 'Notification',
        trigger: ra.length ? ra.map(([p, s]) => `${p.replace(/_/g, ' ')} = ${(s || []).join('|')}`).join('; ') : 'Runs on entry to its container.',
        recipientExpression: String(i['emailMessage/To'] ?? i.To ?? '').slice(0, 200) || undefined,
        subjectExpression: String(i['emailMessage/Subject'] ?? i.Subject ?? '').slice(0, 200) || undefined,
        carriesAttachments: JSON.stringify(i).includes('Attachments') || undefined,
        failureBehaviour: (altSucc[k] || []).length
          ? `A send failure is caught: ${(altSucc[k] || []).map(x => x.replace(/_/g, ' ')).join(', ')} runs.`
          : 'No catch path follows this send. A delivery failure fails the step and, unless a container run-after absorbs it, the run.',
        evidence: EV.CONFIRMED,
        evidenceNote: 'Connector operation, recipient and subject expressions read from the definition.',
        source: srcIds,
      }));
    }

    /* Exception paths — the run-after conditions that admit a non-success predecessor. */
    if (isRecovery) {
      out.exceptions.push(compact({
        id: ID('EXC'), name: `Recovery after ${ra.map(([p]) => p.replace(/_/g, ' ')).join(', ')}`,
        process: ownerProc, step: id,
        triggeringCondition: ra.map(([p, s]) => `${p.replace(/_/g, ' ')} reaches ${(s || []).filter(x => x !== 'Succeeded').join(' or ')}`).join('; '),
        systemResponse: actionPerformed,
        userVisibleResponse: v.type === 'Response'
          ? `The caller receives ${v.inputs?.statusCode !== undefined ? `HTTP ${v.inputs.statusCode}` : 'the composed status code'}.`
          : 'Not directly visible to a caller; this step is internal to the recovery path.',
        retryOrRollback: 'No rollback is declared. Power Automate does not undo completed steps; whatever earlier steps wrote stays written.',
        recoveryProcedure: `Handled inside the run by ${readable}.`,
        responsibleParty: `Power Automate — ${name}`,
        escalationRequired: 'Not declared in the definition.',
        resolutionCriteria: 'The recovery step completes and the run continues past it.',
        evidence: EV.CONFIRMED,
        evidenceNote: 'The run-after condition admitting Failed, TimedOut or Skipped is stated by the definition.',
        source: srcIds,
      }));
    }
  }

  /* Scopes that carry a catch path are the flow's declared exception structure. */
  const catches = flat.filter(r => r.v.type === 'Scope' && /catch|error|fail/i.test(r.key));
  const responses = flat.filter(r => r.v.type === 'Response');
  return {
    stepIds, actionCount: flat.length,
    catchScopes: catches.map(r => r.key.replace(/_/g, ' ')),
    responseCount: responses.length,
    statusCodes: [...new Set(responses.map(r => r.v.inputs?.statusCode).filter(x => x !== undefined).map(String))].sort(),
    connectors: [...new Set(flat.map(r => connectorOf(r.v)).filter(Boolean))].sort(),
    triggers,
    hasTelemetry: flat.some(r => NOISE.test(r.key)),
  };
}
