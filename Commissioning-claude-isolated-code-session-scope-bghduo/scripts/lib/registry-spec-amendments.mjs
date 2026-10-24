/**
 * Columns the estate adds to the HTTP flow registry beyond what the workbook declares.
 *
 * WHY AN AMENDMENT LAYER AND NOT AN EDIT
 *
 * `docs/reference/http-flow-registry-spec.json` is extracted from
 * `http-flow-registry-workbook.xlsx` and guarded by `--check`. A hand-edit to the JSON therefore
 * fails the build on the next run — correctly. It is also invisible to anyone reading the file
 * later, and it cannot survive a re-extraction when the workbook is revised.
 *
 * That was tried first, on 2026-09-10, and the chain caught it in two places: the global
 * `fieldNumber` sequence broke, and then the extractor's own `--check` reported the spec stale.
 * Both failures were the repository saying the same thing — this file is derived, so derive it.
 *
 * So an addition is declared here and applied by the extractor after extraction. The committed
 * JSON stays fully derived — workbook plus this list — `--check` still holds, and the reason for
 * every added column sits beside the column.
 *
 * WHAT AN AMENDMENT IS NOT
 *
 * It is not a place to correct the workbook. If the workbook is wrong, the workbook is what
 * changes. This is for columns the estate has decided to add since the workbook was written, each
 * traceable to a recorded finding.
 */

/**
 * @typedef {object} Amendment
 * @property {string} finding    the recorded finding that requires it
 * @property {string} listTitle  the list it is added to
 * @property {string} after      the internal name it is inserted after, so ordering is declared
 * @property {object} field      the field row, matching the workbook's own column shape
 */

/** @type {Amendment[]} */
export const FIELD_AMENDMENTS = [
  {
    finding: 'GOV-06',
    listTitle: 'DGO_HTTPFlowRegistry',
    after: 'RecordVersion',
    field: {
      listTitle: 'DGO_HTTPFlowRegistry',
      internalName: 'WorkflowId',
      displayName: 'WorkflowId',
      expectedTypeAsString: 'Text',
      required: 'No',
      indexed: 'Yes',
      unique: 'No',
      typeParameters: 'MaxLength=32',
      purpose:
        'The Logic Apps workflow id: 32 hexadecimal characters, no dashes, recorded alongside '
        + 'FlowId so the exported definitions and the tenant register can be joined. GOV-06 '
        + 'measured the gap: 77 exported definitions keyed by a 36-character dashed Power Automate '
        + 'flow GUID, a register of 51 workflows keyed by a 32-hex workflow id, and ZERO exported '
        + 'definitions carrying an id the register knows. Joining on normalised display name '
        + 'matches 13. This column is where the two identifiers sit in one row. Optional, because '
        + '21 of the 77 carry no HTTP trigger and so have no trigger URL to read an id from.',
      fieldGroup: 'DGO HTTP Flow Governance',
      schemaXml:
        "<Field Type='Text' DisplayName='WorkflowId' Name='WorkflowId' StaticName='WorkflowId' "
        + "Required='FALSE' MaxLength='32' Indexed='TRUE' Group='DGO HTTP Flow Governance' />",
      executionEvidence:
        'Added 2026-09-10 to close GOV-06 blocker 1. Not in the workbook, and not yet provisioned '
        + 'to any tenant.',
    },
  },
];

/**
 * Apply the amendments to an extracted spec, in place.
 *
 * `fieldNumber` is a single sequence across every list, not one per list — the workbook numbers
 * its field sheet straight through, and `tests/http-flow-registry.test.mjs` asserts 1..n with no
 * gaps or repeats. So every field after an insertion is renumbered rather than the new one being
 * given the next free number at the end.
 *
 * @param {object} spec the extracted specification, mutated
 * @returns {string[]} one line per amendment applied, for the build log
 */
export function applyFieldAmendments(spec) {
  const applied = [];
  for (const a of FIELD_AMENDMENTS) {
    if (spec.fields.some((f) => f.listTitle === a.listTitle && f.internalName === a.field.internalName)) {
      throw new Error(
        `${a.listTitle}.${a.field.internalName} is already in the workbook — the amendment is now a `
        + 'duplicate and should be deleted from scripts/lib/registry-spec-amendments.mjs',
      );
    }
    const at = spec.fields.findIndex((f) => f.listTitle === a.listTitle && f.internalName === a.after);
    if (at < 0) throw new Error(`${a.listTitle}.${a.after} is not in the workbook; ${a.field.internalName} has no declared position`);

    spec.fields.splice(at + 1, 0, { fieldNumber: 0, ...a.field });

    const list = spec.lists.find((l) => l.listTitle === a.listTitle);
    if (!list) throw new Error(`${a.listTitle} is not a declared list`);
    list.customFieldCount += 1;

    applied.push(`${a.finding}: ${a.listTitle}.${a.field.internalName} (${a.field.expectedTypeAsString}${a.field.indexed === 'Yes' ? ', indexed' : ''})`);
  }

  if (applied.length) {
    spec.fields.forEach((f, i) => { f.fieldNumber = i + 1; });
    spec.totals.fields = spec.fields.length;

    /* The count is stated in FOUR places and this changes only one of them. The workbook's own
       overview, `Compose_Final_Report_JSON.validation.expectedFields`, and the configuration seed
       `ProvisioningSchemaExpectedFieldCount` all still say what the workbook said — and the last
       two are RUNTIME values the deployed flow 01 reads and reports against. Provision 102 columns
       while the flow expects 101 and it reports a variance against itself.
       Recording the divergence here is what stops it being discovered by a flow reporting failure
       on a correct provisioning run. */
    spec.amendments = {
      note:
        'Columns added by scripts/lib/registry-spec-amendments.mjs after extraction. `totals` '
        + 'counts them; the workbook overview, the final-report contract and the configuration '
        + 'seeds do not, because those are statements the workbook and the deployed flow make and '
        + 'neither has been revised.',
      fieldsAdded: applied.length,
      workbookFieldCount: spec.fields.length - applied.length,
      applied,
      runtimeDivergence:
        'flow 01 Compose_Final_Report_JSON.validation.expectedFields and the configuration seed '
        + 'ProvisioningSchemaExpectedFieldCount both still state the workbook count. Update both '
        + 'when the amended columns are provisioned, or flow 01 reports a variance against a '
        + 'correct run.',
    };
  }
  return applied;
}
