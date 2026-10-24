#!/usr/bin/env node
/**
 * Build the designer-paste scope that turns the tenant exporter into a values-file producer.
 *
 * WHY THIS EXISTS
 *   Two browser harvesters were written before this one, and both were refused by the tenant in
 *   the same way: every call answered 401 while the maker UI beside them kept working. A session
 *   can be authorised for the portal and refused at the management API, and no amount of
 *   re-observing a token changes that.
 *
 *   A flow is not subject to that. It calls the management API as a CONNECTION IDENTITY, and
 *   this estate already proves the identity works: `IP_FETCH_ALL_ENDPOINT`,
 *   `IP_Retrieve_Email_Attachment_Endpoint` and `Single_Task_Assignment` all call
 *   shared_flowmanagement in production, on connection
 *   shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2.
 *
 * WHAT THE EXPORTER ALREADY DOES, AND WHAT IT DOES NOT
 *   `Complete Power Automate Flow Definition Exporter v7` already calls ListCallbackUrl on that
 *   same connection, already normalises the answer, and explicitly does NOT redact it — its own
 *   record says "No filtering, reduction, redaction, masking, validation, or omission of
 *   retrieved URL or flow information." So the URLs have been reachable all along.
 *
 *   What it does not do is DELIVER them, and its delivery scope cannot run:
 *     · the scope's runAfter reads ["SUCCEEDED"], and Logic Apps status values are
 *       case-sensitive `Succeeded` — so the scope is never scheduled at all;
 *     · its attachment Compose is malformed JSON (`"Name";@{string('')}`, an unterminated
 *       string, a stray brace);
 *     · one Compose has an entire action DEFINITION as its inputs, referencing @item() and
 *       actions('Get_Flow_Definition') from outside the loop those resolve in.
 *   None of that is recoverable by re-running it. This file replaces the delivery instead.
 *
 * AND ONE THING IT SHOULD NOT DO
 *   The exporter bundles the signed callback URLs into the governance record it emails. That is
 *   twenty live bearer credentials landing in a shared mailbox, indexed and retained. This scope
 *   keeps them out of every record: they exist only in the HTTP response, and the rejection log
 *   it prints carries workflow ids and statuses but never a URL.
 *
 * THE INVARIANT, WHICH IS THE SAME ONE THE BROWSER HARVESTERS HOLD
 *   A URL is written under a contract key only when the invoke URL names that key's application
 *   workflow id. Seven keys have two candidate flows; the wrong one is rejected by this check
 *   rather than chosen by ordering. Unverified, a candidate match is how one endpoint's
 *   signature ends up under another endpoint's key — the worst failure available here, because
 *   the values file would look complete.
 *
 * Regenerate:  npm run harvester
 * Verify:      npm run harvester -- --check
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readWorkbook } from './lib/xlsx-reader.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CROSSWALK = 'docs/reference/flow-identity-crosswalk.json';
const OUT = 'docs/deployment/power-automate-flows/harvester/Scope_Endpoint_Values_Delivery.designer-paste.json';

/* Observed in the tenant, not chosen here: every flowmanagement action in this estate runs on
   this one connection, and the exporter's own ListCallbackUrl action names it. */
const FLOW_API = '/providers/Microsoft.PowerApps/apis/shared_flowmanagement';
const CONNECTION = 'shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2';
const REFERENCE_KEY = 'shared_flowmanagement';

const LOOP = 'Apply_to_each_Endpoint_Values_Record';
const item = (f) => `@items('${LOOP}')?['${f}']`;
/* A Logic Apps string literal cannot carry a newline; '\n' inside one is a backslash and an n. */
const NL = "decodeUriComponent('%0A')";

const crosswalk = JSON.parse(readFileSync(path.join(ROOT, CROSSWALK), 'utf8'));

/**
 * tenant flow id -> triggerAuthenticationType, read from the catalogue's Triggers sheet.
 *
 * Twenty of the twenty-one HTTP triggers catalogued are `All` — anonymous, the signature alone.
 * IP_SCAN_INTAKE (5504d7f9-…) is `Tenant`, and a tenant-authenticated trigger's callback URL
 * CARRIES NO SIGNATURE: the caller presents an Entra token instead. The first live run refused
 * it for exactly that, having matched its workflow id perfectly — a correct refusal with an
 * incomprehensible reason.
 *
 * So the authentication type is baked in per record and the 409 explains itself. The signature
 * requirement stays: an unsigned URL is not a browser-callable endpoint in an architecture with
 * no proxy, and emitting one would produce a values file that looks complete and 401s. What
 * changes is that the run now says WHICH setting makes it work.
 */
const triggerAuth = (() => {
  const out = {};
  /* The catalogue first: a derived extraction, covering 21 flows. */
  try {
    const wb = readWorkbook(path.join(ROOT, 'docs/reference/dgo-endpoint-catalog.xlsx'));
    const sh = wb.sheets.Triggers;
    const head = sh.rows[0].map(String);
    const iF = head.indexOf('Tenant flow ID'), iA = head.indexOf('Authentication');
    for (const r of sh.rows.slice(1)) if (r[iF]) out[String(r[iF])] = String(r[iA]);
  } catch { /* the catalogue is evidence, not a dependency */ }
  /* Then the export packages, which overwrite it: `triggerAuthenticationType` is read straight
     out of the flow's own definition, so a package is the authority and an extraction is a
     report of one. */
  for (const e of crosswalk.exports || []) {
    if (e.tenantFlowId && e.requestTriggerAuthentication) out[e.tenantFlowId] = e.requestTriggerAuthentication;
  }
  return out;
})();

/**
 * Two of the five export packages carry a flow whose display name matches no register flow
 * name, so the crosswalk files them as unplaced rather than guessing which key they serve.
 * That is correct for the crosswalk, which is an evidence record and must not infer.
 *
 * It is needlessly strict HERE, because this scope verifies every URL against the register's
 * application workflow id before it writes one. So they are offered as EXTRA candidates for
 * the key their name suggests, tried last, after every evidenced candidate. If one is the live
 * flow the run resolves instead of returning 409. If it is not, its callback URL names some
 * other workflow, the candidate is rejected, and the rejection says which workflow it actually
 * serves — which is the evidence that settles the question either way.
 *
 * That asymmetry is the point: a wrong probe here cannot produce a wrong credential, only a
 * fact. The same guess in the crosswalk would be an unverified claim.
 *
 * The flow ids and display names are read from the crosswalk. The only judgment hardcoded is
 * which key each NAME suggests, and it is a reading of the name, not of the tenant:
 *
 *   IP_FETCH_ALL__EXTENDED_ENDPOINT → FETCH_ALL. The register already holds two candidates
 *     under that key (IP_FETCH_ALL_ENDPOINT and IP_Fetch_All_Endpoint); this would be a third.
 *   IP_Create_Email_Assignment → EMAIL_RELATED_TASK. The register's flow for that key is
 *     IP_Create_Email_Assignment_Endpoint — the same name without the suffix — and the
 *     catalogue could not retrieve it at all (NOT_FOUND_OR_UNAUTHORIZED).
 */
const PROBE_FOR = {
  IP_FETCH_ALL__EXTENDED_ENDPOINT: 'DGO_ENDPOINT_FETCH_ALL',
  IP_Create_Email_Assignment: 'DGO_ENDPOINT_EMAIL_RELATED_TASK',
};

const probesByKey = new Map();
for (const e of crosswalk.exports || []) {
  if ((e.matchedContractKeys || []).length) continue;   /* already placed on evidence */
  const key = PROBE_FOR[e.displayName];
  if (!key || !e.tenantFlowId) continue;
  if (!probesByKey.has(key)) probesByKey.set(key, []);
  probesByKey.get(key).push({ tenantFlowId: e.tenantFlowId, tenantDisplayName: e.displayName });
}

/**
 * One record per (contract key, candidate flow) — deliberately NOT one per flow.
 *
 * A flow serving two keys is then called twice, which costs one extra API call and removes a
 * nested loop, a nested AppendToArrayVariable, and the ordering question of which key a shared
 * flow's URL belongs to. Twenty-five calls where twenty would do is the right trade.
 */
const records = [];
for (const k of crosswalk.keys) {
  /* Evidenced first, always. A probe that ran before an evidenced candidate could resolve the
     key off a guess while the evidence sat untried, and the run would look identical. */
  const candidates = [
    ...(k.candidates || []).map((c) => ({ ...c, evidence: 'crosswalk' })),
    ...(probesByKey.get(k.contractKey) || []).map((c) => ({ ...c, evidence: 'probe' })),
  ];
  if (!candidates.length) {
    records.push({
      contractKey: k.contractKey,
      applicationWorkflowId: k.applicationWorkflowId,
      flowName: k.canonicalFlow || '',
      tenantFlowId: null,
      evidence: 'none',
      triggerAuthentication: 'Unknown',
      candidateOf: 1,
      candidates: 0,
    });
    continue;
  }
  candidates.forEach((c, i) => records.push({
    contractKey: k.contractKey,
    applicationWorkflowId: k.applicationWorkflowId,
    flowName: c.tenantDisplayName || k.canonicalFlow || '',
    tenantFlowId: c.tenantFlowId,
    evidence: c.evidence,
    triggerAuthentication: triggerAuth[c.tenantFlowId] || 'Unknown',
    candidateOf: i + 1,
    candidates: candidates.length,
  }));
}

const expectedKeys = crosswalk.keys.map((k) => k.contractKey);
const addressable = records.filter((r) => r.tenantFlowId).length;
const unaddressable = crosswalk.keys.filter((k) => !(k.candidates || []).length);

const callbackUrl = "outputs('Compose_Values_Callback_URL')";
const observedId = "outputs('Compose_Values_Observed_Workflow_Id')";

const scope = {
  type: 'Scope',
  actions: {
    Compose_Endpoint_Values_Registry: {
      type: 'Compose',
      inputs: records,
      metadata: { operationMetadataId: 'dgo-values-registry' },
    },
    Compose_Expected_Contract_Keys: {
      type: 'Compose',
      inputs: expectedKeys,
      runAfter: { Compose_Endpoint_Values_Registry: ['Succeeded'] },
    },
    [LOOP]: {
      type: 'Foreach',
      foreach: "@outputs('Compose_Endpoint_Values_Registry')",
      /* Sequential because every branch below appends to a variable, and a parallel foreach
         that writes variables loses appends without reporting it. */
      operationOptions: 'Sequential',
      runtimeConfiguration: { concurrency: { repetitions: 1 } },
      runAfter: { Compose_Expected_Contract_Keys: ['Succeeded'] },
      actions: {
        Scope_One_Endpoint_Values_Record: {
          type: 'Scope',
          actions: {
            List_Callback_URL_For_Values: {
              type: 'OpenApiConnection',
              inputs: {
                parameters: {
                  environmentName: "@variables('EnvironmentName')",
                  flowName: item('tenantFlowId'),
                },
                host: { apiId: FLOW_API, connection: REFERENCE_KEY, operationId: 'ListCallbackUrl' },
              },
            },
            Compose_Values_Callback_URL: {
              type: 'Compose',
              /* The same coalesce the exporter already uses, and for the same reason: the
                 connector has answered in both shapes, and GetFlow's flowTriggerUri is the
                 fallback when it answers in neither. */
              inputs: "@coalesce(outputs('List_Callback_URL_For_Values')?['body']?['response']?['value'],"
                + " outputs('List_Callback_URL_For_Values')?['body']?['value'], '')",
              runAfter: { List_Callback_URL_For_Values: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
            },
            Compose_Values_Observed_Workflow_Id: {
              type: 'Compose',
              inputs: `@if(and(not(empty(${callbackUrl})),contains(${callbackUrl},'/workflows/')),`
                + `first(split(last(split(${callbackUrl},'/workflows/')),'/')),'')`,
              runAfter: { Compose_Values_Callback_URL: ['Succeeded'] },
            },
            Condition_Values_URL_Verifies: {
              type: 'If',
              expression: {
                and: [
                  { equals: [`@not(empty(${callbackUrl}))`, true] },
                  /* The signature IS the credential. A URL without one is not usable, and
                     writing it would produce a values file that looks complete and 401s on
                     first use. */
                  { equals: [`@contains(${callbackUrl},'sig=')`, true] },
                  /* The whole point. Addressed by tenant flow id, verified against the
                     application workflow id the register holds for this key. */
                  { equals: [`@equals(${observedId},${item('applicationWorkflowId').slice(1)})`, true] },
                  /* A key resolved by its first candidate must not be appended again by its
                     second. */
                  { equals: [`@not(contains(variables('ValuesResolvedKeys'),${item('contractKey').slice(1)}))`, true] },
                ],
              },
              actions: {
                Append_Endpoint_Values_Line: {
                  type: 'AppendToArrayVariable',
                  inputs: {
                    name: 'ValuesLines',
                    value: `@concat(${item('contractKey').slice(1)},'=',${callbackUrl})`,
                  },
                },
                Append_Endpoint_Values_Resolved_Key: {
                  type: 'AppendToArrayVariable',
                  inputs: { name: 'ValuesResolvedKeys', value: item('contractKey') },
                  runAfter: { Append_Endpoint_Values_Line: ['Succeeded'] },
                },
              },
              else: {
                actions: {
                  /* Carries ids and statuses and never a URL, so the incomplete response is
                     safe to read on a screen and safe to paste into a ticket. */
                  Append_Endpoint_Values_Rejection: {
                    type: 'AppendToArrayVariable',
                    inputs: {
                      name: 'ValuesRejections',
                      value: {
                        contractKey: item('contractKey'),
                        flowName: item('flowName'),
                        tenantFlowId: item('tenantFlowId'),
                        candidate: `@concat(string(${item('candidateOf').slice(1)}),' of ',string(${item('candidates').slice(1)}))`,
                        evidence: item('evidence'),
                        triggerAuthentication: item('triggerAuthentication'),
                        /* Computed in the flow, so the 409 needs no cross-referencing. The
                           first live run produced four refusals and every one of them took a
                           round trip to explain. */
                        diagnosis: `@if(equals(actions('List_Callback_URL_For_Values')?['status'],'Failed'),`
                          + `'THE_CALLBACK_CALL_ITSELF_FAILED - the flow id may be dead, or not owned by this connection',`
                          + `if(equals(${observedId},${item('applicationWorkflowId').slice(1)}),`
                          + `if(contains(${callbackUrl},'sig='),`
                          + `'RESOLVED_BY_ANOTHER_CANDIDATE_OR_ALREADY_HELD',`
                          + `concat('RIGHT_FLOW_BUT_ITS_URL_CARRIES_NO_SIGNATURE - this trigger is ',`
                          + `${item('triggerAuthentication').slice(1)},`
                          + `'-authenticated. A browser with no proxy cannot call it. Set "Who can trigger the flow" to Anyone, or accept that this endpoint needs an Entra token.')),`
                          + `'SERVES_A_DIFFERENT_WORKFLOW - this flow is not the one the register names for this key'))`,
                        expectedApplicationWorkflowId: item('applicationWorkflowId'),
                        observedApplicationWorkflowId: `@${observedId}`,
                        signaturePresent: `@contains(${callbackUrl},'sig=')`,
                        callbackActionStatus: "@actions('List_Callback_URL_For_Values')?['status']",
                        alreadyResolvedByAnotherCandidate:
                          `@contains(variables('ValuesResolvedKeys'),${item('contractKey').slice(1)})`,
                      },
                    },
                  },
                },
              },
              runAfter: { Compose_Values_Observed_Workflow_Id: ['Succeeded'] },
            },
          },
        },
        /* A record that throws fails THIS record and no other. The value of the run is the list
           of what resolved and what did not, and a run that dies at flow nine produces neither. */
        Scope_Endpoint_Values_Record_Failed: {
          type: 'Scope',
          runAfter: { Scope_One_Endpoint_Values_Record: ['Failed', 'TimedOut'] },
          actions: {
            Append_Endpoint_Values_Record_Failure: {
              type: 'AppendToArrayVariable',
              inputs: {
                name: 'ValuesRejections',
                value: {
                  contractKey: item('contractKey'),
                  flowName: item('flowName'),
                  tenantFlowId: item('tenantFlowId'),
                  expectedApplicationWorkflowId: item('applicationWorkflowId'),
                  reason: 'RECORD_SCOPE_FAILED',
                  scopeResult: "@result('Scope_One_Endpoint_Values_Record')",
                },
              },
            },
          },
        },
      },
    },
    Filter_Missing_Contract_Keys: {
      type: 'Query',
      inputs: {
        from: "@outputs('Compose_Expected_Contract_Keys')",
        where: "@not(contains(variables('ValuesResolvedKeys'), item()))",
      },
      runAfter: { [LOOP]: ['Succeeded', 'Failed', 'TimedOut'] },
    },
    Compose_Endpoint_Values_File: {
      type: 'Compose',
      inputs: '@join(createArray('
        + "'# DGO endpoint values - harvested in the tenant by the flow exporter.',"
        + `concat('# Environment: ',variables('EnvironmentName')),`
        + `concat('# Generated:   ',utcNow()),`
        + `concat('# Keys:        ',string(length(variables('ValuesResolvedKeys')))),`
        + "'#',"
        + "'# Every key below was verified in-flow: the invoke URL it carries names the',"
        + "'# application workflow id the endpoint register holds for that key.',"
        + "'#',"
        + "'# EVERY LINE BELOW ENDS IN A SIGNATURE AND IS A BEARER CREDENTIAL.',"
        + "'# Save as ~/dgo-values.txt. Never commit it, paste it into a chat, or attach it',"
        + "'# to an issue. Deleting the file revokes nothing: only regenerating the trigger does.',"
        + "'',"
        + `join(variables('ValuesLines'),${NL})`
        + `),${NL})`,
      runAfter: { Filter_Missing_Contract_Keys: ['Succeeded'] },
    },
    Condition_Endpoint_Values_Complete: {
      type: 'If',
      expression: { and: [{ equals: ["@length(body('Filter_Missing_Contract_Keys'))", 0] }] },
      actions: {
        Response_Endpoint_Values_Complete: {
          type: 'Response',
          kind: 'Http',
          inputs: {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            body: "@outputs('Compose_Endpoint_Values_File')",
          },
        },
      },
      else: {
        actions: {
          /* Nothing partial is returned. A half-complete values file installs, and then one
             endpoint answers 401 later under a key nobody suspects. */
          Response_Endpoint_Values_Incomplete: {
            type: 'Response',
            kind: 'Http',
            inputs: {
              statusCode: 409,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
              body: {
                status: 'INCOMPLETE_NOTHING_RETURNED',
                expectedKeys: '@length(outputs(\'Compose_Expected_Contract_Keys\'))',
                resolvedKeys: "@length(variables('ValuesResolvedKeys'))",
                missingKeys: "@body('Filter_Missing_Contract_Keys')",
                rejections: "@variables('ValuesRejections')",
                note: 'No URL appears in this response. A half-complete values file is worse than none.',
              },
            },
          },
        },
      },
      runAfter: { Compose_Endpoint_Values_File: ['Succeeded'] },
    },
  },
  metadata: { operationMetadataId: 'dgo-endpoint-values-delivery' },
};

/**
 * A short digest of the scope, stamped into both responses.
 *
 * WHY. `git pull` updates the file on disk. It does not touch the tenant, and a flow keeps
 * running whatever scope was pasted into it — so a run can come back byte-identical to the
 * previous one and look like the change did nothing. That happened twice: once with the
 * exporter's own registry, once here, and both times it cost a round trip to diagnose from the
 * shape of the output.
 *
 * With the build stamped in, `npm run fetch:values` compares what answered against what is on
 * disk and says "the flow is running an older scope" in one line. Computed over the scope
 * BEFORE the stamp is inserted, so it does not cover itself.
 */
const scopeBuild = createHash('sha256').update(JSON.stringify(scope)).digest('hex').slice(0, 12);
scope.actions.Condition_Endpoint_Values_Complete.else.actions
  .Response_Endpoint_Values_Incomplete.inputs.body.scopeBuild = scopeBuild;
scope.actions.Compose_Endpoint_Values_File.inputs = scope.actions.Compose_Endpoint_Values_File.inputs
  .replace("'#',", `concat('# Scope build: ', '${scopeBuild}'),'#',`);

const paste = {
  nodeId: 'Scope_DGO_Endpoint_Values_Delivery',
  serializedValue: scope,
  allConnectionData: {
    List_Callback_URL_For_Values: {
      connectionReference: {
        api: { id: FLOW_API },
        connection: { id: `${FLOW_API}/connections/${CONNECTION}` },
        connectionName: CONNECTION,
      },
      referenceKey: REFERENCE_KEY,
    },
  },
  staticResults: {},
  isScopeNode: true,
  mslaNode: true,
};

const rendered = JSON.stringify(paste, null, 2) + '\n';

/* Nothing generated here may carry a credential: the scope is a set of instructions for
   fetching them, and is itself safe to commit. This asserts that rather than assuming it. */
const CARRIES_SECRET = /sig=[A-Za-z0-9_%-]{8,}|SharedAccessSignature|eyJ[A-Za-z0-9_-]{20}/;
if (CARRIES_SECRET.test(rendered)) {
  console.error('✖ the generated scope carries something shaped like a credential — refusing to write it');
  process.exit(1);
}

const target = path.join(ROOT, OUT);
if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== rendered) {
    console.error(`✖ ${OUT} is out of step with ${CROSSWALK}. Run: npm run harvester`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${expectedKeys.length} contract keys, `
    + `${records.length} records, ${addressable} addressable, build ${scopeBuild}`);
  process.exit(0);
}

writeFileSync(target, rendered);
console.log(`Wrote ${OUT}  (build ${scopeBuild})`);
console.log('  Re-paste it into the flow. A pull does not reach the tenant, and a flow running an');
console.log('  older scope answers exactly as it did before — which reads as the change doing nothing.');
console.log(`  ${expectedKeys.length} contract keys across ${records.length} (key, candidate) records`);
console.log(`  ${addressable} records carry a tenant flow id and will be called`);
const probeCount = records.filter((r) => r.evidence === 'probe').length;
if (probeCount) {
  console.log(`  ${probeCount} probe candidate(s) from unplaced export packages, tried last and verified like any other:`);
  for (const r of records.filter((x) => x.evidence === 'probe')) {
    console.log(`    ${r.flowName} -> ${r.contractKey}`);
  }
}
for (const k of unaddressable) {
  console.log(`  ⚠ ${k.contractKey} has no evidenced flow id — it will be reported missing until one is supplied`);
}
