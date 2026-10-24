/**
 * Flow artefact file names (identifier catalogue, namingConventions.flowArtifactFile; spec §17).
 *
 *   <CONTRACT_KEY>__<FlowName>__<flow-id8>[__<Part>].<kind>
 *   SUBMISSION__CG_Submission_Endpoint__de9ef13b.paste.json
 *   NOKEY__DGSO_INCOMING_AI_PROCESSING__b6d92bae__Scope_References.paste.json
 *
 * A file about a flow says which endpoint, which flow and which tenant flow it is, so a package is never mistaken for a
 * flow of its own, and two files about the same flow sort together. The parts are joined by a double underscore, the
 * estate's existing join of a flow name and its id (captures/<FlowName>__<flow-id>.json).
 *   CONTRACT_KEY  the contract key the flow serves (catalogue contractKeyProcess), or NOKEY for a flow no client calls
 *                 (a list, library or schedule trigger).
 *   FlowName      the flow's tenant display name, kept as it is (flow names are not renamed: PLATFORM_NAMING.md), with
 *                 every character outside A-Z a-z 0-9 _ - replaced by _ and runs of _ collapsed, as the captures do.
 *   flow-id8      the first 8 hex digits of the tenant flow GUID, lower case (the full GUID is in FLOW_IDENTITIES and the
 *                 package READMEs; tests/flow-artifact-names.test.mjs holds the prefix unique across the estate). The
 *                 full GUID would put paths past the 170-character portability budget (tests/package-portability).
 *                 NOT_CAPTURED only while the repository holds no capture or export of the flow.
 *   Part          only when a folder holds more than one file of the same kind for the flow: the root scope a paste
 *                 file replaces, or the part of the flow a file holds.
 *   kind          what the file is: paste.json, capture.json, definition.json, md.
 */
export const FLOW_ARTIFACT_RE = /^(?<key>[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)__(?<flow>[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*)__(?<id>[0-9a-f]{8}|NOT_CAPTURED)(?:__(?<part>[A-Za-z0-9]+(?:_[A-Za-z0-9]+)*))?\.(?<kind>[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)*)$/;
export const NOKEY = 'NOKEY';
export const NOT_CAPTURED = 'NOT_CAPTURED';

/** The id part of a name: the first 8 hex digits of a flow GUID, or NOT_CAPTURED. */
export const flowIdPart = (guid) => (guid === NOT_CAPTURED ? NOT_CAPTURED : String(guid).toLowerCase().replace(/-/g, '').slice(0, 8));

export const flowNameSegment = (displayName) => String(displayName).trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');

/**
 * The tenant flows the identification packages are pasted into: contract key and flow GUID by tenant display name.
 * tests/flow-artifact-names.test.mjs checks each GUID against the flow's capture and each key against the catalogue.
 */
export const FLOW_IDENTITIES = Object.freeze({
  CG_Submission_Endpoint: { key: 'SUBMISSION', id: 'de9ef13b-ae4c-42b0-9afa-20e71a180759' },
  CG_Upload_Endpoint: { key: 'UPLOAD', id: 'df82e331-b800-4a8d-996e-d2b2ca846c77' },
  CG_Portal_Status_Check_Endpoint: { key: 'STATUS', id: '60042a2e-dadb-4ad8-a672-38b4132d299f' },
  CG_Portal_Writeback_Endpoint: { key: 'WRITEBACK', id: 'bde13d27-73b3-4e1a-9687-eb289b039c7a' },
  CG_Portal_Support_Endpoint: { key: 'SUPPORT', id: '4873c936-a2be-4726-8e69-426edb8f70e6' },
  CG_Portal_Verification_Endpoint: { key: 'VERIFY', id: 'ba47f79b-a831-49e8-b00b-3f8937c331df' },
  CG_Portal_Verification_Confirmation_Endpoint: { key: 'VERIFY_CONFIRM', id: 'f96e3448-3c79-4d42-b224-825258a552ba' },
  /* Item-change and schedule triggers: no client calls them. Ids from the tenant exports of 5 October 2026
     (exports/NOKEY__<flow>__<id>__Export_<stamp>.zip, definition.json name), not the package resource folder ids. */
  CG_Registry_Status_Notifier: { key: NOKEY, id: '8ebf6001-89cd-49c9-a9b6-4dedb9a5768b' },
  CG_Portal_Daily_Sweep: { key: NOKEY, id: 'f12aec6d-1554-483d-a525-a96ddb60d06f' },
  AUTO_SCHEDULED_SWEEP: { key: NOKEY, id: '8c19b45c-4174-4d2f-9429-ffd08dd1a5ae' },
  IP_SCAN_INTAKE: { key: 'SCAN_INTAKE', id: '5504d7f9-cc96-470c-be79-217582faf415' },
  IP_Dynamic_Global_Actions_Endpoint: { key: 'DYNAMIC_ACTIONS', id: '31c0aaf0-ddbb-478c-9a98-bc013265c4c7' },
  Single_Task_Assignment: { key: 'SINGLE_ASSIGNMENT', id: '3caf9458-8d95-4740-a01b-6803dad97d34' },
  /* Folio's BULK_ASSIGNMENT URL is this flow's trigger (identification-phase4 README, "One bulk assignment endpoint"). */
  BULK_OPS_DATA_RETRIEVAL_HTTP: { key: 'BULK_ASSIGNMENT', id: '5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06' },
  IP_FETCH_ALL_BOOTSTRAP: { key: 'FETCH_ALL', id: 'b79e6707-df4d-4ae7-8a65-738aa45e9a73' },
  /* Serves OTP_GENERATE and OTP_VERIFY (registers/flow-adoption.json); named by the key that mints the proof. */
  IP_OTP_VERIFY: { key: 'OTP_VERIFY', id: '4dbe6dde-37d5-47b4-ba32-d4ae5c9f8b61' },
  IP_OTP_GENERATE: { key: 'OTP_GENERATE', id: 'e5632336-641f-4b9b-bd93-99185b5eb975' },
  /* Folio's User Administration (ITEM-25): created from IP_Dynamic_Global_Actions_Endpoint with only user-admin (owner approval 2026-10-08). */
  IP_User_Admin_Endpoint: { key: 'USER_ADMIN', id: 'e3e5c825-55ba-447e-88c1-96b7e89fd013' },
  /* Folio's Activities lifecycle (ITEM-25): created from IP_Dynamic_Global_Actions_Endpoint with only the lifecycle (owner decision 2026-10-10). */
  IP_Activity_Lifecycle_Endpoint: { key: 'ACTIVITY_LIFECYCLE', id: 'b4db02d8-02a0-4bc9-b9d3-06e2aae2448c' },
  /* The adopted email-to-task flow (registers/flow-adoption.json): the owner supplied it and asked for its paste
     (2026-10-05). The two copies with the same definition, 3f2f649b and 2fbb5485, are retired. */
  IP_Create_Task_for_received_Email_Endpoint: { key: 'EMAIL_RELATED_TASK', id: 'ab1a3555-7fce-4bfe-a193-b8b84654b0a4' },
  DGSO_INCOMING_AI_PROCESSING: { key: NOKEY, id: 'b6d92bae-591e-fa1e-52eb-b350cad988a7' },
  /* ITEM-80: the legacy library intake rebuilt (owner direction, 2026-10-06). */
  Folio_Incoming_Correspondence_Scan_Processing_Flow: { key: NOKEY, id: '197527c8-e76c-4f7d-81b8-3cb5c88b1c6c' },
  /* Serves GET_DOCS and FETCH_ACTIVITIES (registers/flow-adoption.json); named by its first key. */
  IP_Get_Docs_Endpoint: { key: 'GET_DOCS', id: '28f6e62a-fea8-437c-a61a-47aec706c4e2' },
  IP_Reference_Data_Endpoint: { key: 'REFERENCE_DATA', id: '9a4dea8e-15f2-42b6-904d-3655056fa3c2' },
  IP_Retrieve_Email_Attachment_Endpoint: { key: 'FETCH_EMAIL_ATTACHMENTS', id: '5bc87cf3-7a99-4259-b6a2-315fbc794d9b' },
  IP_SEND_EMAIL: { key: 'EMAIL', id: 'df59a69f-92ca-4554-ae68-6b464aa73ef7' },
  /* Serves AI_EMAIL_ANALYSIS, AI_DOC_ANALYSIS and AI_CHAT (registers/flow-adoption.json); named by the document key. */
  AI_Document_Processing: { key: 'AI_DOC_ANALYSIS', id: 'fefa43c6-fb9d-4337-8b65-7fd19fa09b6d' },
  /* Identification Phase 5 migration flows (packages/identification-phase5): new instant flows, not created yet, so
     their id is NOT_CAPTURED until the owner sends it. */
  ID_Phase5_Survey: { key: NOKEY, id: NOT_CAPTURED },
  ID_Phase5_Keys: { key: NOKEY, id: NOT_CAPTURED },
  /* The failure watch (owner decision 2026-10-18): a schedule flow created for it; created 2026-10-18 (scripts/write-failure-watch-flow.mjs). */
  Folio_Failure_Watch: { key: NOKEY, id: 'c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6' },
});

/** The file name for an artefact of a flow: identity from FLOW_IDENTITIES unless given. */
export function flowArtifactName({ flowName, part, kind, key, id }) {
  const flow = flowNameSegment(flowName);
  const known = FLOW_IDENTITIES[flow];
  const k = key ?? known?.key, i = id ?? known?.id;
  if (!k || !i) throw new Error(`flow artefact name: no contract key and flow id recorded for ${flow} (scripts/lib/flow-artifact-name.mjs FLOW_IDENTITIES)`);
  const name = `${k}__${flow}__${flowIdPart(i)}${part ? `__${flowNameSegment(part)}` : ''}.${kind}`;
  if (!FLOW_ARTIFACT_RE.test(name)) throw new Error(`flow artefact name does not meet the convention: ${name}`);
  return name;
}

export function parseFlowArtifactName(file) {
  const m = FLOW_ARTIFACT_RE.exec(String(file).split('/').pop());
  return m ? { ...m.groups, part: m.groups.part ?? null } : null;
}

/** The one file in `dir` that is an artefact of `flowName` of the given kind, found by its parsed name. */
export async function findFlowArtifact(dir, flowName, kind) {
  const { readdirSync } = await import('node:fs');
  const flow = flowNameSegment(flowName);
  const hits = readdirSync(dir).filter((f) => { const p = parseFlowArtifactName(f); return p && p.flow === flow && p.kind === kind; });
  if (hits.length !== 1) throw new Error(`${dir}: expected one ${kind} for ${flow}, found ${hits.length}${hits.length ? `: ${hits.join(', ')}` : ''}`);
  return `${dir}/${hits[0]}`;
}
