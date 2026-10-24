#!/usr/bin/env node
/**
 * Build the endpoint-inventory flow — the one flow that reads the tenant instead of describing it.
 *
 * WHAT THIS FLOW IS FOR
 *
 * Every other artefact in this repository states what the estate *should* be. The register says
 * which workflow each contract key addresses; `endpoint-atlas.data.js` renders it; the Endpoint
 * Console judges a configured URL against it. All of that is a comparison between two things this
 * repository holds. None of it asks the tenant.
 *
 * This flow asks the tenant. For each Power Automate flow GUID we believe corresponds to an
 * application workflow, it calls the Flow Management connector — GetFlow, ListFlowOwners,
 * ListCallbackUrl — and records what came back: the display name, the state, when it was last
 * modified, who owns it, whether the manual trigger exists and what method it answers. That
 * closes the last gap the console names but cannot settle: a workflow id can be right in the
 * register and the flow behind it deleted, turned off, renamed, or owned by someone who left.
 *
 * WHERE THE REGISTRY COMES FROM, AND WHY IT IS NOT TYPED OUT HERE
 *
 * The scope's first action is a Compose holding one record per (application workflow, candidate
 * flow GUID) pair. Hand-maintained, that array is twenty-six records of contract keys, workflow
 * ids, categories and methods restated from the register — which is precisely the shape of thing
 * this programme has watched drift four times. So it is not hand-maintained:
 *
 *   docs/reference/endpoint-workflow-ids.json   the authority. Contract keys, application
 *                                               workflow ids, categories, methods, canonical
 *                                               flow names. Itself derived from the tenant
 *                                               register by `npm run reconcile`.
 *   docs/reference/inventory-flow-candidates.json   the only facts the authority does not carry:
 *                                               the tenant flow GUIDs, their exported names, and
 *                                               what each pairing rests on.
 *
 * The two are joined here. `--check` fails if the committed package has drifted from that join,
 * so the registry inside the flow cannot disagree with the register that governs the estate.
 *
 * WHAT THIS FLOW MUST NOT DO
 *
 * `ListCallbackUrl` returns a SIGNED trigger URL. That is a bearer credential: possession alone
 * authorizes invoking the flow. This repository's whole secret posture — `tests/check-secrets.mjs`,
 * `tests/secret-exposure.test.mjs`, `EndpointRegistry.redact()`, a register that ships with `sig`
 * removed — exists because twenty-five of them were once published in a committed archive.
 *
 * So the flow has two outputs and they are not the same document:
 *
 *   Compose_Restricted_Extraction_Result   complete and unredacted, exactly as specified. It stays
 *                                          in the run history and goes nowhere else.
 *   Compose_Redacted_Governance_Result     what may leave: every field above except the signature.
 *                                          Callback URLs appear with `sig=<CREDENTIAL_REMOVED>`,
 *                                          the marker the register itself uses, plus the
 *                                          signature's LENGTH — which is the whole diagnostic
 *                                          value of a signature (43 characters, or a truncated
 *                                          paste) without being one.
 *
 * The email carries the second. `tests/inventory-flow.test.mjs` asserts that it cannot carry the
 * first, on the serialised package rather than on the fields, because "no credential leaves this
 * flow" is a property of the whole string.
 *
 *   npm run build:inventoryflow            # regenerate
 *   npm run test:inventoryflow             # fail if the committed package has drifted
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const read = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));
const IDS = 'docs/reference/endpoint-workflow-ids.json';
const CANDIDATES = 'docs/reference/inventory-flow-candidates.json';
const OUT_DIR = 'docs/deployment/internal/flows/inventory';
const PACKAGE = `${OUT_DIR}/DGO_ENDPOINT_INVENTORY.designer-paste.json`;
const VARIABLES = `${OUT_DIR}/DGO_ENDPOINT_INVENTORY.variables.designer-paste.json`;
const VARIABLES_MD = `${OUT_DIR}/DGO_ENDPOINT_INVENTORY.variables.md`;

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

/* Deterministic metadata ids. The designer mints a GUID per action; regenerating with fresh ones
   would make every rebuild a whole-file diff and hide the change that mattered. `c0000000-` keeps
   this package's ids clear of the `a0000000-`/`b0000000-` ranges the SharePoint builder uses. */
let metaSeq = 0;
const meta = () => ({ operationMetadataId: `c0000000-0000-4000-8000-${String(++metaSeq).padStart(12, '0')}` });

/* ------------------------------------------------------------------ *
 * The registry: the authority joined to the tenant evidence
 * ------------------------------------------------------------------ */

/**
 * One record per (application workflow, candidate flow GUID). A workflow with two candidates
 * produces two records and the flow looks up both, because which of the two the tenant actually
 * has is the question — picking one here would be answering it by assumption.
 *
 * A workflow with no candidate still produces a record. An absence that is recorded is a finding;
 * an absence that is omitted is indistinguishable from a workflow nobody thought about.
 */
function buildRegistry() {
  const ids = read(IDS);
  const evidence = read(CANDIDATES);

  /* Every contract key that resolves to a workflow, in the register's own order. Two keys sharing
     a workflow — FETCH_ACTIVITIES and GET_DOCS do — collapse to one registry record carrying both,
     because the flow is looked up once and the keys it serves are an attribute of it. */
  const byWorkflow = new Map();
  for (const surface of ['internal', 'portal']) {
    for (const [key, v] of Object.entries(ids[surface] || {})) {
      if (!byWorkflow.has(v.workflowId)) {
        byWorkflow.set(v.workflowId, {
          applicationWorkflowId: v.workflowId,
          canonicalFlowName: v.flow,
          category: v.category,
          httpMethod: v.method,
          contractKeys: [],
        });
      }
      byWorkflow.get(v.workflowId).contractKeys.push(key);
    }
  }
  if (!byWorkflow.size) fail(`${IDS} resolves no workflows — nothing to inventory.`);

  const records = [];
  let recordId = 0;
  let sequence = 0;
  for (const wf of byWorkflow.values()) {
    sequence += 1;
    const candidates = evidence.candidates?.[wf.applicationWorkflowId];
    if (candidates === undefined) {
      fail(`${CANDIDATES} has no entry for workflow ${wf.applicationWorkflowId} (${wf.canonicalFlowName}). `
        + 'Every workflow the register resolves must appear, with an empty array where there is no evidence.');
    }
    /* No candidate is a record too, and it says why in its own status rather than in a comment
       somewhere else. The flow skips the lookup and files it under "not evidenced". */
    const rows = candidates.length ? candidates : [{
      powerAutomateFlowId: null,
      exportedFlowName: null,
      mappingType: 'NOT_EVIDENCED',
      sourceFiles: ['Repository platform register'],
    }];
    rows.forEach((c, i) => {
      records.push({
        registrySequence: sequence,
        applicationWorkflowId: wf.applicationWorkflowId,
        powerAutomateFlowId: c.powerAutomateFlowId,
        category: wf.category,
        contractKeys: wf.contractKeys,
        canonicalFlowName: wf.canonicalFlowName,
        exportedFlowName: c.exportedFlowName,
        mappingType: c.mappingType,
        httpMethod: wf.httpMethod,
        endpointStatus: c.powerAutomateFlowId ? 'TENANT_CONFIRMATION_REQUIRED' : 'POWER_AUTOMATE_FLOW_ID_NOT_EVIDENCED',
        triggerName: 'manual',
        sourceFiles: c.sourceFiles,
        registryRecordId: `REG-${String(++recordId).padStart(4, '0')}`,
        candidateSequence: i + 1,
        candidateCount: rows.length,
      });
    });
  }
  return records;
}

/* ------------------------------------------------------------------ *
 * Expression helpers
 * ------------------------------------------------------------------ */

const CONN_AUTH = { type: 'Raw', value: "@json(decodeBase64(triggerOutputs().headers['X-MS-APIM-Tokens']))['$ConnectionKey']" };
const FM = '/providers/Microsoft.PowerApps/apis/shared_flowmanagement';

const fmAction = (operationId, parameters, runAfter) => ({
  type: 'OpenApiConnection',
  inputs: { host: { connectionName: 'shared_flowmanagement', operationId, apiId: FM }, parameters, authentication: CONN_AUTH },
  runAfter,
  metadata: meta(),
});

const item = (field) => `items('Apply_to_each_Flow')?['${field}']`;

/* GetFlow's response body IS the flow object. `body('Get_Flow_Definition')?['name']` reads its
   name; `body(...)?['body']?['name']` reads a property the connector does not return and
   evaluates to null. Both spellings were present in the definition this package replaces, and
   the six fields that used the second one came back null on every record. Written once here so
   the two cannot diverge again. */
const flow = (...segments) => `@body('Get_Flow_Definition')?[${segments.map((s) => `'${s}'`).join(']?[')}]`;
const flowOut = (...segments) => `outputs('Get_Flow_Definition')?['body']?[${segments.map((s) => `'${s}'`).join(']?[')}]`;

const CALLBACK = "outputs('Compose_Normalized_Callback_URL')";
/* The trigger this registry record expects, addressed inside the retrieved definition. */
const TRIGGER = `${flowOut('properties', 'definition', 'triggers')}?[${item('triggerName')}]`;

/* ------------------------------------------------------------------ *
 * The scope
 * ------------------------------------------------------------------ */

function buildScope(registry) {
  const scope = {
    type: 'Scope',
    actions: {
      Compose_Expanded_Flow_Registry: { type: 'Compose', inputs: registry, runAfter: {}, metadata: meta() },

      /* The distinct application workflows behind those records. Computed, because it was
         previously the literal 20 — correct on the day it was typed and a claim the flow would
         keep making after the register stopped agreeing with it. `union` of an array with the
         empty array is the distinct of that array. */
      Select_Application_Workflow_Ids: {
        type: 'Select',
        inputs: { from: "@outputs('Compose_Expanded_Flow_Registry')", select: `@${item('applicationWorkflowId').replace("items('Apply_to_each_Flow')", 'item()')}` },
        runAfter: { Compose_Expanded_Flow_Registry: ['Succeeded'] },
        metadata: meta(),
      },

      Condition_EnvironmentName_Available: {
        type: 'If',
        expression: { and: [{ not: { equals: ["@trim(string(variables('EnvironmentName')))", ''] } }] },
        actions: {
          Apply_to_each_Flow: {
            type: 'Foreach',
            foreach: "@outputs('Compose_Expanded_Flow_Registry')",
            actions: {
              Condition_Has_Valid_Power_Automate_Flow_ID: {
                type: 'If',
                expression: {
                  and: [
                    { not: { equals: [`@trim(string(${item('powerAutomateFlowId')}))`, ''] } },
                    { equals: [`@length(trim(string(${item('powerAutomateFlowId')})))`, 36] },
                  ],
                },
                actions: {
                  Scope_Get_One_Flow: {
                    type: 'Scope',
                    actions: {
                      Get_Flow_Definition: fmAction('GetFlow', {
                        environmentName: "@variables('EnvironmentName')",
                        flowName: `@${item('powerAutomateFlowId')}`,
                      }, {}),

                      List_Flow_Owners: fmAction('ListFlowOwners', {
                        environmentName: "@variables('EnvironmentName')",
                        flowName: `@${flowOut('name')}`,
                      }, { Get_Flow_Definition: ['Succeeded'] }),

                      List_Callback_URL: fmAction('ListCallbackUrl', {
                        environmentName: "@variables('EnvironmentName')",
                        flowName: `@${flowOut('name')}`,
                      }, { Get_Flow_Definition: ['Succeeded'] }),

                      /* THE RUN-AFTER THAT STOPS ONE RECORD BEING COUNTED TWICE.
                         The owner and callback lookups are allowed to fail — a flow whose
                         definition we read but whose owners we cannot list is a partial success
                         worth recording, so this composes on any outcome of those two.
                         `Get_Flow_Definition: [Succeeded]` is the addition. Without it, a failed
                         definition read skips both lookups, this still runs, and the record is
                         appended as FOUND with a null identity — while the enclosing scope,
                         carrying an unhandled failure, also fires Scope_Handle_Retrieval_Failure
                         and appends the same record as NOT FOUND. Both counters increment and
                         foundCount + notFoundCount exceeds inputRecordCount. With it, the found
                         branch is skipped and only the failure handler files the record. */
                      Compose_Normalized_Callback_URL: {
                        type: 'Compose',
                        inputs: `@coalesce(outputs('List_Callback_URL')?['body']?['response']?['value'], outputs('List_Callback_URL')?['body']?['value'], ${flowOut('properties', 'flowTriggerUri')}, '')`,
                        runAfter: {
                          Get_Flow_Definition: ['Succeeded'],
                          List_Flow_Owners: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'],
                          List_Callback_URL: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'],
                        },
                        metadata: meta(),
                      },

                      /* The same URL with the credential removed, marked the way the register
                         marks it. Everything diagnostic about an endpoint — the host, the routing
                         segment, the workflow id it actually addresses, the api-version — is in
                         front of `sig=`. The 43 characters after it are the only part that
                         authorizes anything, and nothing outside the run history needs them. */
                      Compose_Redacted_Callback_URL: {
                        type: 'Compose',
                        inputs: `@if(contains(${CALLBACK},'sig='),concat(first(split(${CALLBACK},'sig=')),'sig=<CREDENTIAL_REMOVED>'),${CALLBACK})`,
                        runAfter: { Compose_Normalized_Callback_URL: ['Succeeded'] },
                        metadata: meta(),
                      },

                      /* Length, never value. A Power Automate signature is base64url of an
                         HMAC-SHA256: 32 bytes, 43 characters unpadded. There is no legitimate
                         variation, which is what makes the length a verdict rather than a hint —
                         anything else is a truncated copy or something pasted onto the end.
                         config/../core/endpoint-atlas.js reasons the same way about the same fact. */
                      Compose_Signature_Length: {
                        type: 'Compose',
                        inputs: `@if(contains(${CALLBACK},'sig='),length(first(split(last(split(${CALLBACK},'sig=')),'&'))),0)`,
                        runAfter: { Compose_Redacted_Callback_URL: ['Succeeded'] },
                        metadata: meta(),
                      },

                      Append_Found_Flow: {
                        type: 'AppendToArrayVariable',
                        inputs: {
                          name: 'FlowsFoundDetails',
                          value: {
                            inventoryMetadata: {
                              inventorySchemaVersion: '6.3.0',
                              retrievedAtUtc: '@utcNow()',
                              retrievalMethod: 'Power Automate Management connector',
                              retrievalStatus: "@if(and(equals(actions('List_Flow_Owners')?['status'],'Succeeded'),equals(actions('List_Callback_URL')?['status'],'Succeeded')),'SUCCEEDED','PARTIAL_SUCCESS')",
                              definitionRetrievalStatus: "@actions('Get_Flow_Definition')?['status']",
                              ownerRetrievalStatus: "@actions('List_Flow_Owners')?['status']",
                              callbackRetrievalStatus: "@actions('List_Callback_URL')?['status']",
                              containsSignedCallbackUrl: `@greater(outputs('Compose_Signature_Length'),0)`,
                            },
                            registry: {
                              registryRecordId: `@${item('registryRecordId')}`,
                              registrySequence: `@${item('registrySequence')}`,
                              candidateSequence: `@${item('candidateSequence')}`,
                              candidateCount: `@${item('candidateCount')}`,
                              applicationWorkflowId: `@${item('applicationWorkflowId')}`,
                              powerAutomateFlowIdRequested: `@${item('powerAutomateFlowId')}`,
                              canonicalFlowName: `@${item('canonicalFlowName')}`,
                              exportedFlowName: `@${item('exportedFlowName')}`,
                              contractKeys: `@${item('contractKeys')}`,
                              category: `@${item('category')}`,
                              mappingType: `@${item('mappingType')}`,
                              httpMethod: `@${item('httpMethod')}`,
                              endpointStatus: `@${item('endpointStatus')}`,
                              triggerName: `@${item('triggerName')}`,
                              sourceFiles: `@${item('sourceFiles')}`,
                            },
                            flowIdentity: {
                              id: flow('name'),
                              displayName: flow('properties', 'displayName'),
                              resourceId: flow('id'),
                            },
                            flowLifecycle: {
                              state: flow('properties', 'state'),
                              createdTime: flow('properties', 'createdTime'),
                              lastModifiedTime: flow('properties', 'lastModifiedTime'),
                            },
                            owners: {
                              ownerCount: "@length(coalesce(outputs('List_Flow_Owners')?['body']?['value'],json('[]')))",
                              ownerRecords: "@coalesce(outputs('List_Flow_Owners')?['body']?['value'],json('[]'))",
                              completeOwnerActionResult: {
                                status: "@actions('List_Flow_Owners')?['status']",
                                outputs: "@actions('List_Flow_Owners')?['outputs']",
                              },
                            },
                            endpoint: {
                              callbackUrl: `@${CALLBACK}`,
                              redactedCallbackUrl: "@outputs('Compose_Redacted_Callback_URL')",
                              signatureLength: "@outputs('Compose_Signature_Length')",
                              endpointAvailable: `@not(empty(${CALLBACK}))`,
                              endpointSource: `@if(not(empty(outputs('List_Callback_URL')?['body']?['response']?['value'])),'ListCallbackUrl.response.value',if(not(empty(outputs('List_Callback_URL')?['body']?['value'])),'ListCallbackUrl.value',if(not(empty(${flowOut('properties', 'flowTriggerUri')})),'GetFlow.flowTriggerUri','Unavailable')))`,
                              expectedHttpMethod: `@${item('httpMethod')}`,
                              observedHttpMethod: `@${TRIGGER}?['inputs']?['method']`,
                              effectiveHttpMethod: `@coalesce(${TRIGGER}?['inputs']?['method'],${item('httpMethod')},'POST')`,
                              expectedTriggerName: `@${item('triggerName')}`,
                              triggerFound: `@not(empty(${TRIGGER}))`,
                              completeCallbackActionResult: {
                                status: "@actions('List_Callback_URL')?['status']",
                                outputs: "@actions('List_Callback_URL')?['outputs']",
                              },
                            },
                            completeDefinition: `@coalesce(${flowOut('properties', 'definition')},json('{}'))`,
                            connectionReferences: `@coalesce(${flowOut('properties', 'connectionReferences')},json('{}'))`,
                            completeFlowDefinitionActionResult: {
                              status: "@actions('Get_Flow_Definition')?['status']",
                              outputs: "@actions('Get_Flow_Definition')?['outputs']",
                            },
                          },
                        },
                        runAfter: { Compose_Signature_Length: ['Succeeded'] },
                        metadata: meta(),
                      },

                      Increment_Found_Count: {
                        type: 'IncrementVariable',
                        inputs: { name: 'FlowsFoundCount', value: 1 },
                        runAfter: { Append_Found_Flow: ['Succeeded'] },
                        metadata: meta(),
                      },
                    },
                    runAfter: {},
                    metadata: meta(),
                  },

                  Scope_Handle_Retrieval_Failure: {
                    type: 'Scope',
                    actions: {
                      Append_Not_Found_Flow: {
                        type: 'AppendToArrayVariable',
                        inputs: {
                          name: 'FlowsNotFoundDetails',
                          value: {
                            registryRecord: "@items('Apply_to_each_Flow')",
                            status: 'FLOW_DEFINITION_RETRIEVAL_FAILED',
                            capturedAtUtc: '@utcNow()',
                            completeScopeResult: "@result('Scope_Get_One_Flow')",
                          },
                        },
                        runAfter: {},
                        metadata: meta(),
                      },
                      Increment_Not_Found_Count: {
                        type: 'IncrementVariable',
                        inputs: { name: 'FlowsNotFoundCount', value: 1 },
                        runAfter: { Append_Not_Found_Flow: ['Succeeded'] },
                        metadata: meta(),
                      },
                    },
                    runAfter: { Scope_Get_One_Flow: ['Failed', 'TimedOut'] },
                    metadata: meta(),
                  },
                },
                else: {
                  actions: {
                    Append_Missing_ID_Record: {
                      type: 'AppendToArrayVariable',
                      inputs: {
                        name: 'FlowsNotFoundDetails',
                        value: {
                          registryRecord: "@items('Apply_to_each_Flow')",
                          status: 'POWER_AUTOMATE_FLOW_ID_NOT_EVIDENCED_OR_INVALID',
                          capturedAtUtc: '@utcNow()',
                        },
                      },
                      runAfter: {},
                      metadata: meta(),
                    },
                    Increment_Missing_ID_Count: {
                      type: 'IncrementVariable',
                      inputs: { name: 'FlowsNotFoundCount', value: 1 },
                      runAfter: { Append_Missing_ID_Record: ['Succeeded'] },
                      metadata: meta(),
                    },
                  },
                },
                runAfter: {},
                metadata: meta(),
              },
            },
            /* Sequential is not a performance choice. Every branch below appends to a shared
               array variable, and concurrent iterations appending to one variable lose writes. */
            runAfter: {},
            operationOptions: 'Sequential',
            metadata: meta(),
          },
        },
        else: {
          actions: {
            Append_Environment_Error: {
              type: 'AppendToArrayVariable',
              inputs: {
                name: 'RetrievalErrors',
                value: {
                  code: 'ENVIRONMENT_NAME_REQUIRED',
                  message: 'Provide environmentName in the trigger body or configure the EnvironmentName variable.',
                  capturedAtUtc: '@utcNow()',
                  affectedRecordCount: "@length(outputs('Compose_Expanded_Flow_Registry'))",
                },
              },
              runAfter: {},
              metadata: meta(),
            },
            Set_All_Records_Not_Processed: {
              type: 'SetVariable',
              inputs: { name: 'FlowsNotFoundCount', value: "@length(outputs('Compose_Expanded_Flow_Registry'))" },
              runAfter: { Append_Environment_Error: ['Succeeded'] },
              metadata: meta(),
            },
          },
        },
        runAfter: { Select_Application_Workflow_Ids: ['Succeeded'] },
        metadata: meta(),
      },

      /* TIER ONE — RESTRICTED. Complete and unredacted, exactly as specified: every retrieved URL,
         definition, connection reference, owner record and raw action result. It is the run's
         source of truth and it never leaves the run history. Anyone who can open a run of this
         flow can read twenty-three signed trigger URLs, which is a fact about who should be able
         to open a run of this flow. */
      Compose_Restricted_Extraction_Result: {
        type: 'Compose',
        inputs: {
          schemaVersion: '6.3.0',
          generatedAtUtc: '@utcNow()',
          environmentName: "@variables('EnvironmentName')",
          inputRecordCount: "@length(outputs('Compose_Expanded_Flow_Registry'))",
          uniqueApplicationWorkflowCount: "@length(union(body('Select_Application_Workflow_Ids'),json('[]')))",
          foundCount: "@variables('FlowsFoundCount')",
          notFoundOrNotProcessedCount: "@variables('FlowsNotFoundCount')",
          notProcessedCount: "@if(empty(trim(string(variables('EnvironmentName')))),length(outputs('Compose_Expanded_Flow_Registry')),0)",
          flowsFound: "@variables('FlowsFoundDetails')",
          flowsNotFoundOrNotProcessed: "@variables('FlowsNotFoundDetails')",
          retrievalErrors: "@variables('RetrievalErrors')",
          completeRegistry: "@outputs('Compose_Expanded_Flow_Registry')",
          lookupStrategy: 'one_record_per_evidenced_power_automate_flow_id',
          endpointStrategy: 'ListCallbackUrl_then_flowTriggerUri',
          processingMode: 'Sequential',
          recordPurpose: 'Single authoritative source of truth and complete reference record',
          informationPolicy: 'No filtering, reduction, redaction, masking, validation, or omission of retrieved URL or flow information.',
          securityClassification: 'Restricted - complete inventory including signed callback URLs, definitions, connections, owners, and raw action results. Run-history only: not emailed, not written to a list, not returned to a caller.',
        },
        runAfter: { Condition_EnvironmentName_Available: ['Succeeded', 'Failed', 'TimedOut'] },
        metadata: meta(),
      },

      /* TIER TWO — REDACTABLE. Named "redacted" in the definition this replaces and selecting
         `@item()` — the whole record, verbatim. A Select that reproduces its input is not a
         redaction, and the tier it fed was the one addressed to a mailbox. These are the fields
         that answer every governance question the inventory exists to answer: is the flow there,
         is it on, when did it change, does anyone own it, does its trigger match the contract,
         and is an endpoint signed. None of them is a credential. */
      Select_Redacted_Governance_Results: {
        type: 'Select',
        inputs: {
          from: "@variables('FlowsFoundDetails')",
          select: {
            registryRecordId: "@item()?['registry']?['registryRecordId']",
            registrySequence: "@item()?['registry']?['registrySequence']",
            candidateSequence: "@item()?['registry']?['candidateSequence']",
            candidateCount: "@item()?['registry']?['candidateCount']",
            applicationWorkflowId: "@item()?['registry']?['applicationWorkflowId']",
            powerAutomateFlowId: "@item()?['registry']?['powerAutomateFlowIdRequested']",
            contractKeys: "@item()?['registry']?['contractKeys']",
            category: "@item()?['registry']?['category']",
            canonicalFlowName: "@item()?['registry']?['canonicalFlowName']",
            exportedFlowName: "@item()?['registry']?['exportedFlowName']",
            mappingType: "@item()?['registry']?['mappingType']",
            observedDisplayName: "@item()?['flowIdentity']?['displayName']",
            observedFlowId: "@item()?['flowIdentity']?['id']",
            state: "@item()?['flowLifecycle']?['state']",
            createdTime: "@item()?['flowLifecycle']?['createdTime']",
            lastModifiedTime: "@item()?['flowLifecycle']?['lastModifiedTime']",
            ownerCount: "@item()?['owners']?['ownerCount']",
            endpointAvailable: "@item()?['endpoint']?['endpointAvailable']",
            endpointSource: "@item()?['endpoint']?['endpointSource']",
            redactedCallbackUrl: "@item()?['endpoint']?['redactedCallbackUrl']",
            signatureLength: "@item()?['endpoint']?['signatureLength']",
            expectedHttpMethod: "@item()?['endpoint']?['expectedHttpMethod']",
            observedHttpMethod: "@item()?['endpoint']?['observedHttpMethod']",
            expectedTriggerName: "@item()?['endpoint']?['expectedTriggerName']",
            triggerFound: "@item()?['endpoint']?['triggerFound']",
            retrievalStatus: "@item()?['inventoryMetadata']?['retrievalStatus']",
            retrievedAtUtc: "@item()?['inventoryMetadata']?['retrievedAtUtc']",
          },
        },
        runAfter: { Compose_Restricted_Extraction_Result: ['Succeeded'] },
        metadata: meta(),
      },

      Compose_Redacted_Governance_Result: {
        type: 'Compose',
        inputs: {
          schemaVersion: '6.3.0',
          generatedAtUtc: '@utcNow()',
          environmentName: "@variables('EnvironmentName')",
          inputRecordCount: "@length(outputs('Compose_Expanded_Flow_Registry'))",
          uniqueApplicationWorkflowCount: "@length(union(body('Select_Application_Workflow_Ids'),json('[]')))",
          foundCount: "@variables('FlowsFoundCount')",
          notFoundOrNotProcessedCount: "@variables('FlowsNotFoundCount')",
          flows: "@body('Select_Redacted_Governance_Results')",
          completeRegistry: "@outputs('Compose_Expanded_Flow_Registry')",
          flowsNotFoundOrNotProcessed: "@variables('FlowsNotFoundDetails')",
          retrievalErrors: "@variables('RetrievalErrors')",
          informationPolicy: 'Every retrieved field except the signature. Callback URLs appear with sig=<CREDENTIAL_REMOVED> and the signature length beside them. Flow definitions, connection references, owner records and raw action results are omitted, not masked.',
          securityClassification: 'Internal - no credential. Safe to attach to mail, file, or hand to a reviewer.',
          restrictedTierLocation: 'Compose_Restricted_Extraction_Result, in this run history only.',
        },
        runAfter: { Select_Redacted_Governance_Results: ['Succeeded'] },
        metadata: meta(),
      },

      /* The attachment. `ContentBytes` takes base64 — the definition this replaces passed the raw
         output of an action that did not exist. The name follows the agency filename policy
         (`config/filename-policy.config.js`): lowercase, underscore-separated, terminal ISO date. */
      Compose_Governance_Attachment: {
        type: 'Compose',
        inputs: [{
          Name: "@{concat('endpoint_inventory_governance_', formatDateTime(utcNow(), 'yyyy-MM-dd'), '.json')}",
          ContentBytes: "@base64(string(outputs('Compose_Redacted_Governance_Result')))",
        }],
        runAfter: { Compose_Redacted_Governance_Result: ['Succeeded'] },
        metadata: meta(),
      },

      Send_Governance_Report_Email: {
        type: 'OpenApiConnection',
        inputs: {
          host: { connectionName: 'shared_office365_1', operationId: 'SendEmailV2', apiId: '/providers/Microsoft.PowerApps/apis/shared_office365' },
          parameters: {
            'emailMessage/To': 'dgsRegistry@nitda.gov.ng',
            'emailMessage/Subject': "@{concat('Endpoint inventory — ', variables('EnvironmentName'), ' — ', string(variables('FlowsFoundCount')), ' of ', string(length(outputs('Compose_Expanded_Flow_Registry'))), ' records retrieved')}",
            'emailMessage/Body': [
              '<p>Endpoint inventory for environment <strong>@{variables(\'EnvironmentName\')}</strong>, run at @{utcNow()}.</p>',
              '<ul>',
              '<li>Registry records: @{length(outputs(\'Compose_Expanded_Flow_Registry\'))}, across @{length(union(body(\'Select_Application_Workflow_Ids\'),json(\'[]\')))} application workflows</li>',
              '<li>Retrieved from the tenant: @{variables(\'FlowsFoundCount\')}</li>',
              '<li>Not retrieved or not processed: @{variables(\'FlowsNotFoundCount\')}</li>',
              '</ul>',
              '<p>The attachment carries every retrieved field except the signature: callback URLs appear',
              'with <code>sig=&lt;CREDENTIAL_REMOVED&gt;</code> and the signature length beside them.',
              'The complete unredacted record stays in this run history and is not attached.</p>',
            ].join('\n'),
            'emailMessage/Attachments': "@outputs('Compose_Governance_Attachment')",
          },
          authentication: CONN_AUTH,
        },
        runAfter: { Compose_Governance_Attachment: ['Succeeded'] },
        metadata: meta(),
      },
    },
    runAfter: {},
    metadata: { operationMetadataId: 'c0000000-0000-4000-8000-ffffffffffff' },
  };
  return scope;
}

/* ------------------------------------------------------------------ *
 * Emit
 * ------------------------------------------------------------------ */

function buildPackage(registry) {
  return {
    id: '2d66c266-81d0-44b1-87fe-6a6254a0d904',
    brandColor: '#8C3900',
    connectionReferences: {
      shared_flowmanagement: { connection: { id: '/providers/Microsoft.PowerApps/apis/shared_flowmanagement/connections/shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2' } },
      /* Declared by the source package and left in place. No action in this scope binds to it;
         the mail action binds to shared_office365_1. Removing an entry from a package that is
         pasted into a flow this repository cannot see is a change with a blast radius and no
         benefit, so it stays, named here so nobody has to wonder why. */
      shared_office365: { connection: { id: '/providers/Microsoft.PowerApps/apis/shared_office365/connections/c0b9e7a5b0854c39a435fd8ce92f48ad' } },
      shared_office365_1: { connection: { id: '/providers/Microsoft.PowerApps/apis/shared_office365/connections/shared-office365-1fb94487-c973-4c56-a1f4-1ac16768a7a7' } },
    },
    connectorDisplayName: 'Control',
    icon: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZlcnNpb249IjEuMSIgdmlld0JveD0iMCAwIDMyIDMyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPg0KIDxwYXRoIGQ9Im0wIDBoMzJ2MzJoLTMyeiIgZmlsbD0iIzhDMzkwMCIvPg0KIDxwYXRoIGQ9Im04IDEwaDE2djEyaC0xNnptMTUgMTF2LTEwaC0xNHYxMHptLTItOHY2aC0xMHYtNnptLTEgNXYtNGgtOHY0eiIgZmlsbD0iI2ZmZiIvPg0KPC9zdmc+DQo=',
    isTrigger: false,
    operationName: 'Scope_Complete_Provisioned_Endpoint_Inventory',
    operationDefinition: buildScope(registry),
  };
}

/* The six variables the scope reads and writes. Power Automate accepts Initialize variable only
   at the top level of a workflow, so they cannot travel inside the scope package — the same
   constraint the internal endpoint packages document. */
const VARIABLE_SPEC = [
  { name: 'EnvironmentName', type: 'string', value: "@{coalesce(triggerBody()?['environmentName'], workflow()?['tags']?['environmentName'], '')}", why: 'The environment the Flow Management connector reads. Empty is handled: the scope files every record as not processed and records ENVIRONMENT_NAME_REQUIRED rather than calling the connector with nothing.' },
  { name: 'FlowsFoundDetails', type: 'array', value: [], why: 'One complete record per registry record retrieved from the tenant.' },
  { name: 'FlowsNotFoundDetails', type: 'array', value: [], why: 'One record per registry record that could not be retrieved, or that carries no evidenced flow GUID.' },
  { name: 'FlowsFoundCount', type: 'integer', value: 0, why: 'Incremented once per found record. With the run-after correction in Compose_Normalized_Callback_URL, found + not-found equals the registry record count exactly.' },
  { name: 'FlowsNotFoundCount', type: 'integer', value: 0, why: 'Incremented once per not-found record, and set outright to the registry record count when no environment name is supplied.' },
  { name: 'RetrievalErrors', type: 'array', value: [], why: 'Run-level errors that belong to no single record.' },
];

function buildVariables() {
  let previous = null;
  const actions = {};
  for (const v of VARIABLE_SPEC) {
    const name = `Initialize_variable_${v.name}`;
    actions[name] = {
      type: 'InitializeVariable',
      inputs: { variables: [{ name: v.name, type: v.type, value: v.value }] },
      metadata: meta(),
      ...(previous ? { runAfter: { [previous]: ['Succeeded'] } } : {}),
    };
    previous = name;
  }
  return { nodeId: 'Scope_Variables_DGO_ENDPOINT_INVENTORY', serializedValue: { type: 'Scope', actions } };
}

function buildVariablesDoc() {
  const rows = VARIABLE_SPEC.map((v) => {
    const shown = typeof v.value === 'string' ? `\`${v.value}\`` : `\`${JSON.stringify(v.value)}\``;
    return `| \`${v.name}\` | ${v.type} | ${shown} | ${v.why} |`;
  });
  return [
    '# DGO_ENDPOINT_INVENTORY — top-level variables (create these first)',
    '',
    '> Generated by `scripts/build-inventory-flow.mjs`. Do not edit.',
    '',
    'Power Automate accepts **Initialize variable** only at the top level of a workflow. A clipboard',
    'package is a scope, so these cannot travel inside `DGO_ENDPOINT_INVENTORY.designer-paste.json` —',
    'pasting them there produces a definition the designer will not save.',
    '',
    'Add these actions at the top of the flow, in this order, **before** pasting the scope.',
    '',
    '| Variable | Type | Initial value | Why |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    'The pasted scope reads and writes every one of them. If any is missing the flow fails at run',
    "time with `The variable 'name' is not defined`.",
    '',
    '`DGO_ENDPOINT_INVENTORY.variables.designer-paste.json` carries the same six as a clipboard',
    'package, for pasting rather than typing.',
    '',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const registry = buildRegistry();
const emit = [
  [PACKAGE, `${JSON.stringify(buildPackage(registry), null, 2)}\n`],
  [VARIABLES, `${JSON.stringify(buildVariables(), null, 2)}\n`],
  [VARIABLES_MD, buildVariablesDoc()],
];

/* A signature must not reach a generated artefact any more than a committed one. The registry is
   built from files this repository already guarantees are credential-free, but "already
   guaranteed" is how the last one got in. */
const SIG = /sig=[A-Za-z0-9_-]{20,}/;
for (const [rel, body] of emit) {
  if (SIG.test(body)) fail(`${rel} would carry a signature. Refusing to write it.`);
}

if (CHECK) {
  let drifted = 0;
  for (const [rel, body] of emit) {
    let actual = null;
    try { actual = readFileSync(path.join(ROOT, rel), 'utf8'); } catch { /* missing */ }
    if (actual !== body) { console.error(`  ✖  ${rel} has drifted from its sources.`); drifted += 1; }
  }
  if (drifted) fail(`${drifted} generated artefact(s) differ from a rebuild. Run \`npm run build:inventoryflow\`.`);
  console.log(`  ✅  Inventory flow package matches its sources — ${registry.length} registry records.`);
  process.exit(0);
}

mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
for (const [rel, body] of emit) writeFileSync(path.join(ROOT, rel), body);

const evidenced = registry.filter((r) => r.powerAutomateFlowId).length;
const workflows = new Set(registry.map((r) => r.applicationWorkflowId)).size;
console.log(`\n  Wrote ${emit.length} artefact(s) to ${OUT_DIR}/`);
console.log(`    ${registry.length} registry records across ${workflows} application workflows`);
console.log(`    ${evidenced} carry an evidenced Power Automate flow GUID; ${registry.length - evidenced} do not and are recorded as such\n`);
