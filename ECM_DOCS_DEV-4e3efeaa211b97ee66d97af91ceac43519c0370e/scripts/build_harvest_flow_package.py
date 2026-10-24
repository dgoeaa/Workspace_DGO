#!/usr/bin/env python3
"""Build the flow-details extraction flow as an import-ready Power Automate package.

WHAT IT IS
The flow that fills DGO_Flow_Harvest_Collector.xlsx. It lists every flow in the environment,
reads each one in full, splits the definition and the whole properties object into cell-sized
parts, and writes the lot into the workbook's named tables. Rows in, nothing summarised.

WHY IT IS GENERATED RATHER THAN HAND-WRITTEN
The Excel columns the flow writes to and the columns the workbook declares are the same list.
Written twice they drift, and a drifted mapping fails silently: "Add a row into a table" maps by
column NAME, so a renamed column writes nothing and reports success. Both come from one spec —
scripts/build_flow_harvest_collector.py — and the build FAILS if a column is neither mapped to
an expression nor explicitly deferred with the reason the spec itself records.

WHERE THE PARAMETERS COME FROM
The package shape, the $authentication/$connections parameters, the OpenApiConnection host block
and the CORS response convention are taken from the tenant's own flow export. The environment
name is derived from that export's migrationSourceId and independently agrees with the value
every package in docs/folio-Master-Flows-and-Endpoints/contracts/deployed records. The shared_flowmanagement host
block — apiId, connectionName, operationId, and the environmentName/flowName parameter pair — is
copied from a deployed flow in this repository that already calls it.

WHAT IT CANNOT KNOW
The workbook's drive and file id do not exist until the workbook is uploaded. They are the flow's
first three variables, checked before anything else runs, so the flow stops with a message that
names them rather than half-filling the tables.

Usage: python3 scripts/build_harvest_flow_package.py <reference-export.zip> <out-dir>
"""

import json
import shutil
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, "scripts")
from build_flow_harvest_collector import SPEC, VERSION, SHRED, LATER, OWNERS  # noqa: E402

NAME = "DGO Flow Estate Harvest to Excel"
SLUG = "DGO_Flow_Estate_Harvest_to_Excel"
# A fixed namespace, so rebuilding the package produces the same resource ids and a re-import
# updates the same flow rather than creating a second one.
NS = uuid.UUID("6f1c1d38-0e5a-5e00-9a2b-1d0e5a5e0e5a")

FLOWMGMT = "/providers/Microsoft.PowerApps/apis/shared_flowmanagement"
EXCEL = "/providers/Microsoft.PowerApps/apis/shared_excelonlinebusiness"

# Every structural detail below is matched to the tenant's own export, which imports. A package
# that differs from a working one in ANY of them is a package with an unexplained difference,
# and an import failure gives you no way to tell which difference caused it.
#
# connectionName holds a CONNECTION INSTANCE ID, not the reference key. The importer resolves it
# and rebinds to whatever the operator picks, so a placeholder is correct — but it has to be
# shaped like an id. The tenant's export carries 32 hex characters; so does this.
ICON = "https://static.powerapps.com/resource/ppcr/releases/v1.0.1825/1.0.1825.4855/{}/icon.png"

# The listing and detail operations. GetFlow's host block is verbatim from a deployed flow in
# this repository; the admin siblings take the same parameters and are named by the connector's
# own "as Admin" convention. If the designer marks either card unrecognised, re-pick the action
# from the Power Automate Management connector — the parameters are unchanged.
LIST_OP = "ListFlowsInEnvironmentAsAdmin"
DETAIL_OP = "GetFlowAsAdmin"
ENVIRONMENT = "Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1"

FLOW_ITEM = "items('Apply_to_each_Flow')"
PROPS = "outputs('Compose_Properties')"

# ── the column mappings ───────────────────────────────────────────────────────────────────
# A value is the expression written into that Excel column. None means the collector leaves it
# empty on purpose; the build checks that every None matches a column the spec marks as filled
# by something other than the flow, so a column cannot be dropped by accident.
MAPPING = {
    "tblFlow": {
        "RunId": "@{variables('varRunId')}",
        "CollectedUtc": "@{utcNow()}",
        "EnvironmentName": "@{variables('varEnvironment')}",
        "FlowName": f"@{{{FLOW_ITEM}?['name']}}",
        "FlowResourceId": f"@{{{FLOW_ITEM}?['id']}}",
        "DisplayName": f"@{{{PROPS}?['displayName']}}",
        "State": f"@{{{PROPS}?['state']}}",
        "CreatedTime": f"@{{{PROPS}?['createdTime']}}",
        "LastModifiedTime": f"@{{{PROPS}?['lastModifiedTime']}}",
        "CreatorObjectId": f"@{{{PROPS}?['creator']?['objectId']}}",
        "CreatorTenantId": f"@{{{PROPS}?['creator']?['tenantId']}}",
        "CreatorUserId": f"@{{{PROPS}?['creator']?['userId']}}",
        "CreatorUserType": f"@{{{PROPS}?['creator']?['userType']}}",
        "TemplateName": f"@{{{PROPS}?['templateName']}}",
        "ProvisioningMethod": f"@{{{PROPS}?['provisioningMethod']}}",
        "FlowFailureAlertSubscribed": f"@{{string({PROPS}?['flowFailureAlertSubscribed'])}}",
        "FlowSuspensionReason": f"@{{{PROPS}?['flowSuspensionReason']}}",
        "FlowSuspensionTime": f"@{{{PROPS}?['flowSuspensionTime']}}",
        "ApiId": f"@{{{PROPS}?['apiId']}}",
        "Type": f"@{{{FLOW_ITEM}?['type']}}",
        "TriggerName": None, "TriggerType": None, "TriggerKind": None, "TriggerMethod": None,
        "TriggerRelativePath": None, "TriggerAuthenticationType": None,
        "TriggerOperationOptions": None, "ActionCount": None, "ConnectionReferenceCount": None,
        "DefinitionSchema": f"@{{{PROPS}?['definition']?['$schema']}}",
        "DefinitionContentVersion": f"@{{{PROPS}?['definition']?['contentVersion']}}",
        "DefinitionChars": "@length(outputs('Compose_DefinitionText'))",
        "DefinitionParts": "@outputs('Compose_DefinitionPartCount')",
        "PropertiesChars": "@length(outputs('Compose_PropertiesText'))",
        "PropertiesParts": "@outputs('Compose_PropertiesPartCount')",
        "MakerUrl": "@{concat('https://make.powerautomate.com/environments/', "
                    f"variables('varEnvironment'), '/flows/', {FLOW_ITEM}?['name'], '/details')}}",
        "DetailStatus": "ok",
    },
    "tblDefinitionPart": {
        "RunId": "@{variables('varRunId')}",
        "FlowName": f"@{{{FLOW_ITEM}?['name']}}",
        "PartNo": "@variables('varDefinitionPartNo')",
        "PartCount": "@outputs('Compose_DefinitionPartCount')",
        "PartChars": "@length(outputs('Compose_DefinitionPart'))",
        "DefinitionPart": "@{outputs('Compose_DefinitionPart')}",
    },
    "tblPropertiesPart": {
        "RunId": "@{variables('varRunId')}",
        "FlowName": f"@{{{FLOW_ITEM}?['name']}}",
        "PartNo": "@variables('varPropertiesPartNo')",
        "PartCount": "@outputs('Compose_PropertiesPartCount')",
        "PartChars": "@length(outputs('Compose_PropertiesPart'))",
        "PropertiesPart": "@{outputs('Compose_PropertiesPart')}",
    },
    "tblError": {
        "RunId": "@{variables('varRunId')}",
        "OccurredUtc": "@{utcNow()}",
        "Stage": "detail",
        "FlowName": f"@{{{FLOW_ITEM}?['name']}}",
        "StatusCode": "@{string(outputs('Get_Flow_Detail')?['statusCode'])}",
        "Message": "@{string(body('Get_Flow_Detail')?['error']?['message'])}",
        "RawError": "@{string(body('Get_Flow_Detail'))}",
    },
    "tblCollectionRun": {
        "RunId": "@{variables('varRunId')}",
        "StartedUtc": "@{variables('varStarted')}",
        "FinishedUtc": "@{utcNow()}",
        "EnvironmentName": "@{variables('varEnvironment')}",
        "EnvironmentDisplayName": "@{variables('varEnvironmentDisplayName')}",
        "Scope": "admin",
        "ListAction": LIST_OP,
        "DetailAction": DETAIL_OP,
        "FlowsListed": "@length(body('List_Flows_as_Admin')?['value'])",
        "FlowsDetailed": "@variables('varFlowsDetailed')",
        "DefinitionRows": "@variables('varDefinitionRows')",
        "PropertiesRows": "@variables('varPropertiesRows')",
        "ConnectionRows": None,
        "OwnerRows": None,
        "ErrorRows": "@variables('varErrorRows')",
        "CollectorWorkbookVersion": VERSION,
        "HarvestFlowRunUrl": "@{concat('https://make.powerautomate.com/environments/', "
                             "variables('varEnvironment'), '/flows/', workflow()?['name'], "
                             "'/runs/', workflow()?['run']?['name'])}",
        "Notes": "@{concat('Harvested ', string(variables('varFlowsDetailed')), ' of ', "
                 "string(length(body('List_Flows_as_Admin')?['value'])), ' listed flows.')}",
    },
}
# Tables no action writes, and why. Checked against the spec's own filled_by wording.
UNWRITTEN = {
    "tblConnection": "connectionReferences is an object keyed by name and Power Automate cannot "
                     "enumerate an object's keys — the shredding step fills it from the captured "
                     "properties",
    "tblAction": "the same reason, over the action tree",
    "tblOwner": "one extra call per flow; the spec records this table as optional and off by "
                "default",
}


def check_mapping():
    """Every column in the workbook is mapped, or deferred for the reason the spec gives."""
    problems = []
    by_table = {s["table"]: s for s in SPEC}
    for table, cols in MAPPING.items():
        spec_cols = [c["name"] for c in by_table[table]["columns"]]
        if list(cols) != spec_cols:
            problems.append(f"{table}: mapping covers {list(cols)}, workbook declares {spec_cols}")
            continue
        for c in by_table[table]["columns"]:
            written = cols[c["name"]] is not None
            # Anything the workbook attributes to the shredding step, to later processing, or to
            # the optional owners call is deliberately not written here.
            flow_fills = c["filled_by"] not in (SHRED, LATER, OWNERS)
            if written != flow_fills:
                problems.append(
                    f"{table}.{c['name']}: workbook says '{c['filled_by']}', "
                    f"the flow {'writes' if written else 'does not write'} it")
    for table in by_table:
        if table not in MAPPING and table not in UNWRITTEN:
            problems.append(f"{table}: neither mapped nor listed as unwritten")
    return problems


# ── action builders ───────────────────────────────────────────────────────────────────────
def var(name, kind, value, after):
    return {"runAfter": after, "type": "InitializeVariable",
            "inputs": {"variables": [{"name": name, "type": kind, "value": value}]}}


def flow_mgmt(operation_id, parameters, after):
    return {"runAfter": after, "type": "OpenApiConnection",
            "inputs": {"parameters": parameters,
                       "host": {"apiId": FLOWMGMT, "connectionName": "shared_flowmanagement",
                                "operationId": operation_id},
                       "authentication": "@parameters('$authentication')"}}


def add_row(table, after):
    params = {"source": "@{variables('varExcelSource')}",
              "drive": "@{variables('varExcelDrive')}",
              "file": "@{variables('varExcelFile')}",
              "table": table}
    for column, value in MAPPING[table].items():
        if value is not None:
            params[f"item/{column}"] = value
    return {"runAfter": after, "type": "OpenApiConnection",
            "inputs": {"parameters": params,
                       "host": {"apiId": EXCEL, "connectionName": "shared_excelonlinebusiness",
                                "operationId": "AddRowV2"},
                       "authentication": "@parameters('$authentication')"},
            "runtimeConfiguration": {"retryPolicy": {"type": "exponential", "count": 4,
                                                     "interval": "PT10S"}}}


PART = 32000


def part_count(kind, text_action, after):
    """ceil(length / PART), as integer arithmetic. Written before the flow's own row, because
    that row states how many parts to expect and a reader uses it to detect a short harvest."""
    return {f"Compose_{kind}PartCount": {
        "runAfter": after, "type": "Compose",
        "inputs": f"@if(equals(length(outputs('{text_action}')), 0), 0, "
                  f"add(div(sub(length(outputs('{text_action}')), 1), {PART}), 1))"}}


def until_loop(kind, text_action, after):
    """Cut a long string into cell-sized parts, one row each, using only core functions.

    This was written with chunk(), which is exactly right for the job and appears in NONE of the
    sixty deployed definitions in this repository. The importer validates every expression in a
    definition before it will accept the package, so an unavailable function fails the import
    rather than the run — and an import error names the package, not the expression. substring,
    length, greater, if, sub, add, div and empty are all attested in this tenant's own flows,
    hundreds of times over, so this construction cannot fail that way.

    The order inside the loop matters: the part is composed from the remainder BEFORE the
    remainder is shortened, or every row would hold the following part's text.
    """
    lower, rest, no = kind.lower(), f"var{kind}Rest", f"var{kind}PartNo"
    remaining = f"variables('{rest}')"
    return {
        f"Set_{lower}_remaining": {
            "runAfter": after, "type": "SetVariable",
            "inputs": {"name": rest, "value": f"@outputs('{text_action}')"}},
        f"Set_{lower}_part_number": {
            "runAfter": {f"Set_{lower}_remaining": ["Succeeded"]}, "type": "SetVariable",
            "inputs": {"name": no, "value": 0}},
        f"Until_{kind}_Parts": {
            "runAfter": {f"Set_{lower}_part_number": ["Succeeded"]},
            "type": "Until",
            "expression": f"@empty(variables('{rest}'))",
            # 500 parts is 16 million characters — far beyond any definition — and the timeout
            # stops a runaway rather than letting it consume the run.
            "limit": {"count": 500, "timeout": "PT1H"},
            "actions": {
                f"Increment_{lower}_part_number": {
                    "runAfter": {}, "type": "IncrementVariable",
                    "inputs": {"name": no, "value": 1}},
                f"Compose_{kind}Part": {
                    "runAfter": {f"Increment_{lower}_part_number": ["Succeeded"]},
                    "type": "Compose",
                    "inputs": f"@if(greater(length({remaining}), {PART}), "
                              f"substring({remaining}, 0, {PART}), {remaining})"},
                f"Add_{kind}_Part_Row": add_row(
                    "tblDefinitionPart" if kind == "Definition" else "tblPropertiesPart",
                    {f"Compose_{kind}Part": ["Succeeded"]}),
                # Set variable CANNOT reference the variable it is setting — Power Automate
                # rejects the flow at SAVE time with WorkflowRunActionInputsInvalidProperty,
                # "Self reference is not supported". So the remainder is computed in a Compose
                # and the variable is set from that. The Compose may read the variable freely;
                # only the SetVariable may not.
                f"Compose_{kind}Remainder": {
                    "runAfter": {f"Add_{kind}_Part_Row": ["Succeeded"]}, "type": "Compose",
                    "inputs": f"@if(greater(length({remaining}), {PART}), "
                              f"substring({remaining}, {PART}, "
                              f"sub(length({remaining}), {PART})), '')"},
                f"Set_{lower}_remaining_to_the_rest": {
                    "runAfter": {f"Compose_{kind}Remainder": ["Succeeded"]},
                    "type": "SetVariable",
                    "inputs": {"name": rest, "value": f"@outputs('Compose_{kind}Remainder')"}},
                f"Increment_var{kind}Rows": {
                    "runAfter": {f"Set_{lower}_remaining_to_the_rest": ["Succeeded"]},
                    "type": "IncrementVariable",
                    "inputs": {"name": f"var{kind}Rows", "value": 1}},
            }},
    }


def build_definition(reference):
    ref_def = reference["definition"]["properties"]["definition"]

    configure = [
        # ── the three values that cannot exist before the workbook is uploaded ─────────────
        ("varExcelSource", "string", "me"),
        ("varExcelDrive", "string", ""),
        ("varExcelFile", "string", ""),
        ("varEnvironmentDisplayName", "string", ""),
        # ── derived, nothing to set ───────────────────────────────────────────────────────
        ("varEnvironment", "string", ENVIRONMENT),
        ("varRunId", "string", "@workflow()?['run']?['name']"),
        ("varStarted", "string", "@utcNow()"),
        ("varDefinitionRest", "string", ""),
        ("varPropertiesRest", "string", ""),
        ("varDefinitionPartNo", "integer", 0),
        ("varPropertiesPartNo", "integer", 0),
        ("varFlowsDetailed", "integer", 0),
        ("varDefinitionRows", "integer", 0),
        ("varPropertiesRows", "integer", 0),
        ("varErrorRows", "integer", 0),
    ]
    actions, previous = {}, {}
    for name, kind, value in configure:
        actions[f"Initialize_{name}"] = var(name, kind, value, previous)
        previous = {f"Initialize_{name}": ["Succeeded"]}

    actions["Check_workbook_is_configured"] = {
        "runAfter": previous,
        "type": "If",
        "expression": {"or": [{"equals": ["@empty(variables('varExcelDrive'))", True]},
                              {"equals": ["@empty(variables('varExcelFile'))", True]}]},
        "actions": {"Terminate_not_configured": {
            "runAfter": {}, "type": "Terminate",
            "inputs": {"runStatus": "Failed",
                       "runError": {
                           "code": "WorkbookNotConfigured",
                           "message": "Set varExcelDrive and varExcelFile to the document "
                                      "library and file id of DGO_Flow_Harvest_Collector.xlsx "
                                      "before running this flow. Nothing was written."}}}},
        "else": {"actions": {}},
    }

    actions["List_Flows_as_Admin"] = flow_mgmt(
        LIST_OP, {"environmentName": "@{variables('varEnvironment')}"},
        {"Check_workbook_is_configured": ["Succeeded"]})

    detail = {
        "Get_Flow_Detail": flow_mgmt(
            DETAIL_OP,
            {"environmentName": "@{variables('varEnvironment')}",
             "flowName": f"@{{{FLOW_ITEM}?['name']}}"},
            {}),
        "Compose_Properties": {
            "runAfter": {"Get_Flow_Detail": ["Succeeded"]}, "type": "Compose",
            "inputs": "@body('Get_Flow_Detail')?['properties']"},
        # The whole properties object and the definition inside it, as text, so they can be cut
        # into cell-sized pieces without losing a character.
        "Compose_DefinitionText": {
            "runAfter": {"Compose_Properties": ["Succeeded"]}, "type": "Compose",
            "inputs": f"@string({PROPS}?['definition'])"},
        "Compose_PropertiesText": {
            "runAfter": {"Compose_DefinitionText": ["Succeeded"]}, "type": "Compose",
            "inputs": f"@string({PROPS})"},
    }
    detail.update(part_count("Definition", "Compose_DefinitionText",
                             {"Compose_PropertiesText": ["Succeeded"]}))
    detail.update(part_count("Properties", "Compose_PropertiesText",
                             {"Compose_DefinitionPartCount": ["Succeeded"]}))
    detail["Add_Flow_Row"] = add_row("tblFlow", {"Compose_PropertiesPartCount": ["Succeeded"]})
    detail.update(until_loop("Definition", "Compose_DefinitionText",
                             {"Add_Flow_Row": ["Succeeded"]}))
    detail.update(until_loop("Properties", "Compose_PropertiesText",
                             {"Until_Definition_Parts": ["Succeeded"]}))
    detail["Increment_varFlowsDetailed"] = {
        "runAfter": {"Until_Properties_Parts": ["Succeeded"]},
        "type": "IncrementVariable", "inputs": {"name": "varFlowsDetailed", "value": 1}}

    actions["Apply_to_each_Flow"] = {
        "runAfter": {"List_Flows_as_Admin": ["Succeeded"]},
        "type": "Foreach",
        "foreach": "@body('List_Flows_as_Admin')?['value']",
        "runtimeConfiguration": {"concurrency": {"repetitions": 1}},
        "actions": {
            "Scope_Detail": {"runAfter": {}, "type": "Scope", "actions": detail},
            # A flow that cannot be read must not stop the harvest, and must not vanish from it.
            "Scope_Detail_Failed": {
                "runAfter": {"Scope_Detail": ["Failed", "TimedOut", "Skipped"]},
                "type": "Scope",
                "actions": {
                    "Add_Error_Row": add_row("tblError", {}),
                    "Increment_varErrorRows": {
                        "runAfter": {"Add_Error_Row": ["Succeeded"]},
                        "type": "IncrementVariable",
                        "inputs": {"name": "varErrorRows", "value": 1}}}},
        }}

    # Written last, so a row here means the harvest finished. A run that died leaves rows in the
    # other tables and none in this one, which is how a partial harvest is recognised.
    actions["Add_Run_Row"] = add_row("tblCollectionRun", {"Apply_to_each_Flow": ["Succeeded"]})

    return {
        "name": str(uuid.uuid5(NS, SLUG)),
        "id": f"/providers/Microsoft.Flow/flows/{uuid.uuid5(NS, SLUG)}",
        "type": "Microsoft.Flow/flows",
        "properties": {
            "apiId": reference["definition"]["properties"]["apiId"],
            "displayName": NAME,
            "definition": {
                "metadata": {
                    "workflowEntityId": None,
                    "processAdvisorMetadata": None,
                    "flowChargedByPaygo": None,
                    "flowclientsuspensionreason": "None",
                    "flowclientsuspensiontime": None,
                    "flowclientsuspensionreasondetails": None,
                    "provisioningMethod": "FromDefinition",
                    "failureAlertSubscription": True,
                    "creationSource": None,
                },
                "$schema": ref_def["$schema"],
                "contentVersion": ref_def["contentVersion"],
                "parameters": ref_def["parameters"],
                "triggers": {
                    # Recurrence, not an HTTP request: a Request trigger would mint another
                    # signed URL, and this estate already has 55 outstanding. Run it on demand
                    # from the portal whenever the schedule is not soon enough.
                    "Recurrence": {
                        "type": "Recurrence",
                        "recurrence": {"frequency": "Month", "interval": 1},
                        "metadata": {"operationMetadataId": str(uuid.uuid5(NS, "recurrence"))},
                    }},
                "actions": actions,
            },
            "connectionReferences": {
                "shared_flowmanagement": {
                    "connectionName": uuid.uuid5(NS, "conn-flowmanagement").hex,
                    "source": "Embedded", "id": FLOWMGMT,
                    "tier": "NotSpecified", "apiName": "flowmanagement",
                    "isProcessSimpleApiReferenceConversionAlreadyDone": False},
                "shared_excelonlinebusiness": {
                    "connectionName": uuid.uuid5(NS, "conn-excel").hex,
                    "source": "Embedded", "id": EXCEL,
                    "tier": "NotSpecified", "apiName": "excelonlinebusiness",
                    "isProcessSimpleApiReferenceConversionAlreadyDone": False},
            },
            "flowFailureAlertSubscribed": True,
            "isManaged": False,
        },
    }


def build_package(reference, out):
    asset = str(uuid.uuid5(NS, "asset"))
    ids = {k: str(uuid.uuid5(NS, k)) for k in
           ("api-flowmanagement", "api-excel", "conn-flowmanagement", "conn-excel")}

    stage = out / SLUG
    shutil.rmtree(stage, ignore_errors=True)
    flow_dir = stage / "Microsoft.Flow" / "flows" / asset
    flow_dir.mkdir(parents=True)

    def write(path, obj):
        path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")

    write(flow_dir / "definition.json", build_definition(reference))
    write(flow_dir / "apisMap.json",
          {"shared_flowmanagement": ids["api-flowmanagement"],
           "shared_excelonlinebusiness": ids["api-excel"]})
    write(flow_dir / "connectionsMap.json",
          {"shared_flowmanagement": ids["conn-flowmanagement"],
           "shared_excelonlinebusiness": ids["conn-excel"]})
    write(stage / "Microsoft.Flow" / "flows" / "manifest.json",
          {"packageSchemaVersion": "1.0", "flowAssets": {"assetPaths": [asset]}})

    def api(key, name, display):
        return {"id": f"/providers/Microsoft.PowerApps/apis/{name}", "name": name,
                "type": "Microsoft.PowerApps/apis", "suggestedCreationType": "Existing",
                "details": {"displayName": display,
                            "iconUri": ICON.format(name.replace("shared_", ""))},
                "configurableBy": "System", "hierarchy": "Child", "dependsOn": []}

    def conn(display, api_key, name):
        return {"type": "Microsoft.PowerApps/apis/connections",
                "suggestedCreationType": "Existing", "creationType": "Existing",
                "details": {"displayName": display,
                            "iconUri": ICON.format(name.replace("shared_", ""))},
                "configurableBy": "User", "hierarchy": "Child", "dependsOn": [ids[api_key]]}

    write(stage / "manifest.json", {
        "schema": "1.0",
        "details": {
            "displayName": NAME,
            "description": "Lists every flow in the environment, reads each one in full, and "
                           "writes it into DGO_Flow_Harvest_Collector.xlsx — one row per flow, "
                           "the definition and the whole properties object split losslessly "
                           "across part rows, and one row per failure.",
            "createdTime": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "packageTelemetryId": str(uuid.uuid5(NS, "telemetry")),
            "creator": "N/A",
            "sourceEnvironment": "",
        },
        "resources": {
            asset: {"type": "Microsoft.Flow/flows", "suggestedCreationType": "New",
                    "creationType": "Existing, New, Update",
                    "details": {"displayName": NAME}, "configurableBy": "User",
                    "hierarchy": "Root",
                    "dependsOn": [ids["api-flowmanagement"], ids["conn-flowmanagement"],
                                  ids["api-excel"], ids["conn-excel"]]},
            ids["api-flowmanagement"]: api("api-flowmanagement", "shared_flowmanagement",
                                           "Power Automate Management"),
            ids["conn-flowmanagement"]: conn("Power Automate Management", "api-flowmanagement",
                                             "shared_flowmanagement"),
            ids["api-excel"]: api("api-excel", "shared_excelonlinebusiness",
                                  "Excel Online (Business)"),
            ids["conn-excel"]: conn("Excel Online (Business)", "api-excel",
                                    "shared_excelonlinebusiness"),
        },
    })

    zip_path = out / f"{SLUG}.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(stage.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(stage).as_posix())
    return zip_path, stage


def main(reference_zip, out_dir):
    problems = check_mapping()
    if problems:
        print("\n❌ the flow's Excel mapping does not match the workbook it writes to:")
        for p in problems:
            print(f"     {p}")
        return 1

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    work = out / "_reference"
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    with zipfile.ZipFile(reference_zip) as z:
        z.extractall(work)
    definition_file = next(work.rglob("definition.json"))
    reference = {"definition": json.loads(definition_file.read_text(encoding="utf-8"))}

    zip_path, stage = build_package(reference, out)
    shutil.rmtree(work, ignore_errors=True)

    d = json.loads((next(stage.rglob("definition.json"))).read_text(encoding="utf-8"))
    acts = d["properties"]["definition"]["actions"]
    written = sum(1 for t, cols in MAPPING.items() for v in cols.values() if v is not None)
    print(f"\n  wrote {zip_path}  ({zip_path.stat().st_size:,} bytes)\n")
    print(f"  trigger            Recurrence, monthly (no signed URL is minted)")
    print(f"  environment        {ENVIRONMENT}")
    print(f"  connections        shared_flowmanagement, shared_excelonlinebusiness")
    print(f"  top-level actions  {len(acts)}")
    print(f"  Excel tables fed   {', '.join(MAPPING)}")
    print(f"  columns written    {written} of {sum(len(c) for c in MAPPING.values())} declared")
    for t, why in UNWRITTEN.items():
        print(f"  not written        {t} — {why.split(' — ')[0]}")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "dist/flow-package"))
