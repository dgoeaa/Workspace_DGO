#!/usr/bin/env python3
"""Build the collector workbook a Power Automate flow writes the tenant's flows into.

WHAT THIS IS, AND WHAT IT IS NOT
docs/folio-Master-Flows-and-Endpoints/reference/endpoints.json and the endpoint master workbook are built from packages already
in this repository — a snapshot of what one export found. This is the other direction: an EMPTY
workbook, structured so a flow can pour a live harvest into it. The flow lists every flow in the
environment, gets each one's full detail, and appends rows. Nothing here is data; everything
here is the shape the data has to arrive in.

WHY IT HAS TO BE BUILT RATHER THAN TYPED
Power Automate's Excel Online (Business) connector writes into a NAMED EXCEL TABLE — a
ListObject — and nothing else. A formatted range with an AutoFilter looks identical in Excel and
is invisible to the connector. Every sheet here therefore carries a real table, with the exact
column names the flow references by name in "Add a row into a table". Rename a column in Excel
and the flow's mapping breaks silently, which is why the columns are generated from one spec and
verified back out of the delivered file.

THE LOSSLESS RULE
A cell holds 32,767 characters. Flow definitions in this estate already exceed that — the
largest is over 91,000. So a definition is not stored in a cell: it is split into ordered parts,
one row each, in tblDefinitionPart, and concatenating the parts of a flow in PartNo order
returns the original byte for byte. The same holds for the raw `properties` object, which is
captured whole precisely so that nothing the API returned depends on a column existing for it.

THE PLACEHOLDER ROW
Excel treats a table whose range is a header row alone as damaged and repairs the file on open.
Every table here therefore spans its header plus ONE EMPTY ROW. That row is a structural
requirement, not data. Delete it after the first collection, or exclude blank RunId downstream.

Usage: python3 scripts/build_flow_harvest_collector.py [out.xlsx]
"""

import sys
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

VERSION = "1.0.0"
HEADER_ROW = 4          # title, note, blank, header
PLACEHOLDER_ROW = 5

# ── palette ───────────────────────────────────────────────────────────────────────────────
# The same system as the endpoint master reference, so the two read as one estate.
INK, TEAL, TEAL_LIGHT = "0E1319", "0E5A5E", "DCEAEA"
RULE, BAND, MUTED = "B6BEC9", "F5F7F9", "5C6675"
AMBER_BG, AMBER_FG = "F6E9D2", "85560A"
FONT = "Arial"

thin = Side(style="thin", color=RULE)
BORDER = Border(bottom=thin)
H_FONT = Font(name=FONT, size=10, bold=True, color="FFFFFF")
H_FILL = PatternFill("solid", fgColor=TEAL)
H_ALIGN = Alignment(horizontal="left", vertical="center", wrap_text=True)
BODY = Font(name=FONT, size=9.5, color=INK)
MONO = Font(name="Consolas", size=9, color=INK)
TITLE = Font(name=FONT, size=18, bold=True, color=TEAL)
SUB = Font(name=FONT, size=10, color=MUTED)
SEC = Font(name=FONT, size=12, bold=True, color=INK)
LBL = Font(name=FONT, size=9.5, bold=True, color=MUTED)
WRAP = Alignment(horizontal="left", vertical="top", wrap_text=True)
TOP = Alignment(horizontal="left", vertical="top", wrap_text=False)

# ── the spec ──────────────────────────────────────────────────────────────────────────────
# One tuple per column: (name, type, filled_by, source, meaning).
#   type      text | int | utc | json     — decides number format and column width
#   filled_by which step of the harvest writes it
#   source    where the value comes from, named so a mapping can be checked against it
C = lambda n, t, f, s, m: {"name": n, "type": t, "filled_by": f, "source": s, "meaning": m}

LIST_V2 = 'List Flows as Admin (V2)'
GET_ADMIN = 'Get Flow as Admin'
OWNERS = 'List Flow Owners as Admin'
COLLECTOR = 'the collector flow itself'
LATER = 'post-processing — the collector leaves it empty'
# Power Automate's expression language has no way to enumerate an object's keys. triggers,
# actions and connectionReferences are all keyed objects, so nothing that requires walking them
# can be done in the flow — it is done by a script reading the definition parts back out.
SHRED = 'post-processing — expressions cannot enumerate an object\'s keys'

SPEC = [
    {
        "sheet": "01 Collection Run",
        "table": "tblCollectionRun",
        "title": "Collection run",
        "note": "One row per harvest. Write it LAST, when the counts are known, so a row's "
                "presence means the run finished; a run that died leaves rows in the other "
                "tables and none here, which is how a partial harvest is recognised.",
        "columns": [
            C("RunId", "text", COLLECTOR, "workflow()?['run']?['name']",
              "The flow run that produced these rows. Every row in every table carries it, so "
              "one harvest can be isolated, compared or deleted whole."),
            C("StartedUtc", "utc", COLLECTOR, "utcNow() captured in the first action",
              "When the harvest began, ISO 8601 UTC."),
            C("FinishedUtc", "utc", COLLECTOR, "utcNow() in the final action",
              "When it finished. Absent means the run did not reach the end."),
            C("EnvironmentName", "text", COLLECTOR, "the environment input to the list action",
              "The environment harvested, as its GUID-shaped name."),
            C("EnvironmentDisplayName", "text", COLLECTOR, "typed in, or from an environment action",
              "The environment's human name, for a reader who does not recognise the GUID."),
            C("Scope", "text", COLLECTOR, "'admin' or 'user'",
              "Which listing was used. 'user' returns only flows the connection's account owns "
              "or co-owns and is NOT a tenant inventory; 'admin' is."),
            C("ListAction", "text", COLLECTOR, "the connector action name used to list",
              "Named rather than assumed, because the scope claim above depends on it."),
            C("DetailAction", "text", COLLECTOR, "the connector action name used per flow",
              "The action that returned the definition."),
            C("FlowsListed", "int", COLLECTOR, "length() of the list action's value array",
              "How many flows the listing returned."),
            C("FlowsDetailed", "int", COLLECTOR, "a counter incremented on each successful detail call",
              "How many were successfully read in full. Below FlowsListed means some failed — "
              "tblError says which."),
            C("DefinitionRows", "int", COLLECTOR, "a counter", "Rows written to tblDefinitionPart."),
            C("PropertiesRows", "int", COLLECTOR, "a counter", "Rows written to tblPropertiesPart."),
            C("ConnectionRows", "int", SHRED, "a counter in the shredding step",
              "Rows written to tblConnection. Not the collector's to count — it does not write "
              "that table."),
            C("OwnerRows", "int", OWNERS, "a counter, when the owners step is switched on",
              "Rows written to tblOwner. Empty when the optional owners step is not built."),
            C("ErrorRows", "int", COLLECTOR, "a counter", "Rows written to tblError."),
            C("CollectorWorkbookVersion", "text", COLLECTOR, f"the constant '{VERSION}'",
              "The workbook contract this run was written against. A mapping built for one "
              "version and run against another is the failure this column exposes."),
            C("HarvestFlowRunUrl", "text", COLLECTOR, "constructed from the environment and run id",
              "A link back to the run, so a row can be traced to the execution that wrote it."),
            C("Notes", "text", COLLECTOR, "free text",
              "Anything the operator wants recorded about this run."),
        ],
    },
    {
        "sheet": "02 Flows",
        "table": "tblFlow",
        "title": "Flows",
        "note": "One row per flow. The scalar metadata, flattened for reading and filtering. "
                "Nothing here replaces tblPropertiesPart — that holds the whole object the API "
                "returned, so a field with no column of its own is still captured. The Trigger* "
                "columns and the two counts are left empty by the collector and filled by the "
                "shredding step, because reaching them means walking a keyed object.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest wrote this row."),
            C("CollectedUtc", "utc", COLLECTOR, "utcNow() at the time of the detail call",
              "When this flow was read. Flows are read one at a time, so this differs across rows."),
            C("EnvironmentName", "text", COLLECTOR, "the environment being harvested",
              "Environment the flow lives in."),
            C("FlowName", "text", LIST_V2, "item()?['name']",
              "The flow's GUID-shaped name — the id in the maker portal URL. This is the key "
              "every other table joins on. It is NOT the 32-hex id inside a signed trigger URL."),
            C("FlowResourceId", "text", LIST_V2, "item()?['id']",
              "The full /providers/Microsoft.ProcessSimple/... resource path."),
            C("DisplayName", "text", LIST_V2, "item()?['properties']?['displayName']",
              "The flow's name as a person sees it. Not unique and not a key."),
            C("State", "text", LIST_V2, "…?['properties']?['state']",
              "Started, Stopped or Suspended."),
            C("CreatedTime", "utc", GET_ADMIN, "…?['properties']?['createdTime']", "When the flow was created."),
            C("LastModifiedTime", "utc", GET_ADMIN, "…?['properties']?['lastModifiedTime']",
              "Last edit. Read with CreatedTime it says whether a flow is live or abandoned."),
            C("CreatorObjectId", "text", GET_ADMIN, "…?['properties']?['creator']?['objectId']",
              "Azure AD object id of the creator — the join to a person."),
            C("CreatorTenantId", "text", GET_ADMIN, "…?['properties']?['creator']?['tenantId']", "Creator's tenant."),
            C("CreatorUserId", "text", GET_ADMIN, "…?['properties']?['creator']?['userId']", "Creator's user id."),
            C("CreatorUserType", "text", GET_ADMIN, "…?['properties']?['creator']?['userType']", "Member, Guest, or similar."),
            C("TemplateName", "text", GET_ADMIN, "…?['properties']?['templateName']",
              "The template the flow was created from, empty if built from blank."),
            C("ProvisioningMethod", "text", GET_ADMIN, "…?['properties']?['provisioningMethod']",
              "How the flow came to exist — created, imported, from a solution."),
            C("FlowFailureAlertSubscribed", "text", GET_ADMIN, "…?['properties']?['flowFailureAlertSubscribed']",
              "Whether anyone is told when this flow fails. A false here on a production "
              "endpoint is a finding."),
            C("FlowSuspensionReason", "text", GET_ADMIN, "…?['properties']?['flowSuspensionReason']",
              "Why the platform suspended it, when State is Suspended."),
            C("FlowSuspensionTime", "utc", GET_ADMIN, "…?['properties']?['flowSuspensionTime']", "When it was suspended."),
            C("ApiId", "text", GET_ADMIN, "…?['properties']?['apiId']", "The API the flow is registered under."),
            C("Type", "text", LIST_V2, "item()?['type']", "The ARM resource type."),
            C("TriggerName", "text", SHRED, "first key of definition.triggers",
              "The trigger's name inside the definition."),
            C("TriggerType", "text", SHRED, "definition.triggers[name].type",
              "Request, Recurrence, OpenApiConnection and so on. Request means an HTTP endpoint."),
            C("TriggerKind", "text", SHRED, "…['kind']", "Http for a callable endpoint."),
            C("TriggerMethod", "text", SHRED, "…['inputs']['method']",
              "Empty means the definition does not declare one — which is not the same as GET."),
            C("TriggerRelativePath", "text", SHRED, "…['inputs']['relativePath']", "Declared path segment, if any."),
            C("TriggerAuthenticationType", "text", SHRED, "…['inputs']['triggerAuthenticationType']",
              "Tenant restricts callers to the tenant; All does not. EMPTY MEANS THE DEFINITION "
              "DOES NOT DECLARE IT, which is a third state and must not be read as All."),
            C("TriggerOperationOptions", "text", SHRED, "…['operationOptions']", "Trigger-level options, if declared."),
            C("ActionCount", "int", SHRED, "length(coalesce(definition.actions, {})) at the top level",
              "Top-level actions only — nested actions inside scopes are not counted here. The "
              "full tree is in the definition parts."),
            C("ConnectionReferenceCount", "int", SHRED, "count of properties.connectionReferences",
              "How many connections the flow binds."),
            C("DefinitionSchema", "text", GET_ADMIN, "definition['$schema']", "The definition language version."),
            C("DefinitionContentVersion", "text", GET_ADMIN, "definition['contentVersion']", "The definition's own version stamp."),
            C("DefinitionChars", "int", COLLECTOR, "length(string(definition))",
              "Character count of the serialised definition. The check that the parts reassemble: "
              "their PartChars must sum to this."),
            C("DefinitionParts", "int", COLLECTOR, "length(chunk(...))", "How many rows tblDefinitionPart holds for this flow."),
            C("PropertiesChars", "int", COLLECTOR, "length(string(properties))", "Character count of the raw properties object."),
            C("PropertiesParts", "int", COLLECTOR, "length(chunk(...))", "How many rows tblPropertiesPart holds for this flow."),
            C("MakerUrl", "text", COLLECTOR, "constructed from EnvironmentName and FlowName",
              "Maker portal link. CONSTRUCTED, not returned by the API."),
            C("DetailStatus", "text", COLLECTOR, "'ok', or the failure's status code",
              "Whether the detail call succeeded. Anything but ok means this row's GET_ADMIN "
              "columns are empty and tblError carries the reason."),
        ],
    },
    {
        "sheet": "03 Definition Parts",
        "table": "tblDefinitionPart",
        "title": "Definition parts",
        "note": "The flow definition, whole. A cell holds 32,767 characters and definitions in "
                "this estate exceed that, so each definition is split into ordered parts of "
                "32,000. Concatenating a flow's parts in PartNo order returns the original "
                "exactly — that is what makes this lossless rather than merely stored.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest wrote this row."),
            C("FlowName", "text", COLLECTOR, "the flow's GUID-shaped name", "Joins to tblFlow.FlowName."),
            C("PartNo", "int", COLLECTOR, "1-based position in the chunk array",
              "Order matters. Reassembly is by PartNo ascending, not by row order in the sheet."),
            C("PartCount", "int", COLLECTOR, "length of the chunk array",
              "Total parts for this flow. A flow whose rows do not reach PartCount was cut short."),
            C("PartChars", "int", COLLECTOR, "length() of this part",
              "Summing these per flow must equal tblFlow.DefinitionChars."),
            C("DefinitionPart", "json", COLLECTOR, "chunk(string(definition), 32000)[n]",
              "A raw slice of the serialised definition. Not valid JSON on its own — only the "
              "concatenation is."),
        ],
    },
    {
        "sheet": "04 Properties Parts",
        "table": "tblPropertiesPart",
        "title": "Properties parts",
        "note": "The entire `properties` object the API returned, split the same way. This "
                "exists so the harvest does not depend on the column list in tblFlow being "
                "complete: a field Microsoft adds, or one nobody anticipated, is still here.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest wrote this row."),
            C("FlowName", "text", COLLECTOR, "the flow's GUID-shaped name", "Joins to tblFlow.FlowName."),
            C("PartNo", "int", COLLECTOR, "1-based position", "Reassembly order."),
            C("PartCount", "int", COLLECTOR, "length of the chunk array", "Total parts for this flow."),
            C("PartChars", "int", COLLECTOR, "length() of this part", "Must sum to tblFlow.PropertiesChars."),
            C("PropertiesPart", "json", COLLECTOR, "chunk(string(properties), 32000)[n]",
              "A raw slice of the serialised properties object, definition included."),
        ],
    },
    {
        "sheet": "05 Connections",
        "table": "tblConnection",
        "title": "Connections",
        "note": "One row per connection reference a flow binds — the dependency map: which flows "
                "break when a connection is deleted, and which accounts they run as. FILLED "
                "AFTERWARDS, not by the collector: connectionReferences is an object keyed by "
                "reference name, and Power Automate expressions cannot enumerate an object's keys. "
                "The references are already captured whole in tblPropertiesPart.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest wrote this row."),
            C("FlowName", "text", COLLECTOR, "the flow's GUID-shaped name", "Joins to tblFlow.FlowName."),
            C("ReferenceKey", "text", SHRED, "the key in properties.connectionReferences",
              "The name the definition's actions refer to, e.g. shared_sharepointonline-1."),
            C("ConnectionName", "text", SHRED, "…['connectionName']", "The connection instance's name."),
            C("ApiName", "text", SHRED, "…['api']?['name']", "The connector, e.g. shared_sharepointonline."),
            C("ApiId", "text", SHRED, "…['api']?['id']", "The connector's full resource id."),
            C("ApiDisplayName", "text", SHRED, "…['api']?['displayName']", "The connector's readable name."),
            C("ConnectionId", "text", SHRED, "…['connection']?['id']", "The connection instance's resource id."),
            C("DisplayName", "text", SHRED, "…['displayName']", "The connection as the maker sees it."),
            C("Tier", "text", SHRED, "…['tier']", "Standard or Premium. Premium bindings carry a licensing cost."),
            C("Source", "text", SHRED, "…['source']", "How the connection is supplied — embedded, invoker, or a reference."),
            C("ConnectionRaw", "json", SHRED, "string(the whole reference object)",
              "The reference verbatim, so a field without a column here is not lost."),
        ],
    },
    {
        "sheet": "06 Owners",
        "table": "tblOwner",
        "title": "Owners",
        "note": "One row per principal holding a role on a flow. Filled by the owners action, "
                "which is a SEPARATE call per flow — the single most expensive part of the "
                "harvest. Leave the step switched off and this table stays empty; nothing else "
                "depends on it.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest wrote this row."),
            C("FlowName", "text", COLLECTOR, "the flow's GUID-shaped name", "Joins to tblFlow.FlowName."),
            C("PrincipalObjectId", "text", OWNERS, "…?['properties']?['principal']?['id']", "Azure AD object id."),
            C("PrincipalType", "text", OWNERS, "…?['properties']?['principal']?['type']", "User, Group or ServicePrincipal."),
            C("PrincipalDisplayName", "text", OWNERS, "…?['properties']?['principal']?['displayName']", "Readable name."),
            C("PrincipalEmail", "text", OWNERS, "…?['properties']?['principal']?['email']", "Where one is returned."),
            C("RoleType", "text", OWNERS, "…?['properties']?['roleName']", "Owner or CanEdit / CanView."),
            C("OwnerRaw", "json", COLLECTOR, "string(the whole owner object)", "The record verbatim."),
        ],
    },
    {
        "sheet": "07 Actions",
        "table": "tblAction",
        "title": "Actions",
        "note": "EMPTY BY DESIGN. Shredding a definition into one row per action means walking a "
                "tree of arbitrary depth, which Power Automate expressions do badly and a script "
                "reading tblDefinitionPart does well. The collector writes the definition whole; "
                "this table is where the afterwards step puts the actions it finds.",
        "columns": [
            C("RunId", "text", LATER, "carried from the definition row", "Which harvest the action came from."),
            C("FlowName", "text", LATER, "carried from the definition row", "Joins to tblFlow.FlowName."),
            C("ActionPath", "text", LATER, "slash-joined path through nested actions",
              "Scope_A/Scope_B/Action — the only stable identity an action has, since names "
              "repeat across scopes."),
            C("ActionName", "text", LATER, "the action's key", "Its name at its own level."),
            C("ActionType", "text", LATER, "action.type", "Compose, Scope, OpenApiConnection, Response, Terminate…"),
            C("RunAfterActions", "text", LATER, "keys of action.runAfter",
              "What must finish first. With RunAfterStatuses this is the dependency graph."),
            C("RunAfterStatuses", "text", LATER, "values of action.runAfter",
              "Which outcomes it runs after. Anything other than Succeeded alone is a catch edge."),
            C("Description", "text", LATER, "action.description", "The maker's own note, where one exists."),
            C("TrackedProperties", "json", LATER, "action.trackedProperties", "What the action emits to run history."),
            C("RuntimeConfiguration", "json", LATER, "action.runtimeConfiguration",
              "Retry policy, secure inputs and outputs, pagination."),
            C("InputsChars", "int", LATER, "length(string(action.inputs))", "Size of the inputs blob."),
            C("PartNo", "int", LATER, "1-based position", "Inputs are split like definitions when they exceed a cell."),
            C("PartCount", "int", LATER, "total parts", "Total parts for this action's inputs."),
            C("InputsPart", "json", LATER, "a slice of string(action.inputs)", "The action's configuration, verbatim."),
        ],
    },
    {
        "sheet": "08 Errors",
        "table": "tblError",
        "title": "Errors",
        "note": "Every failure, named. A harvest that skips a flow silently is worse than one "
                "that fails: the output looks complete. Configure the detail scope to run after "
                "'has failed' as well as 'is successful', and write a row here.",
        "columns": [
            C("RunId", "text", COLLECTOR, "the run's id", "Which harvest hit this."),
            C("OccurredUtc", "utc", COLLECTOR, "utcNow()", "When."),
            C("Stage", "text", COLLECTOR, "'list', 'detail', 'owners', 'write'", "Which step failed."),
            C("FlowName", "text", COLLECTOR, "the flow being processed, where known", "Empty for a failure in the listing itself."),
            C("StatusCode", "text", COLLECTOR, "outputs('…')?['statusCode']", "HTTP status of the failed call."),
            C("Message", "text", COLLECTOR, "the error's message", "A one-line reason."),
            C("RawError", "json", COLLECTOR, "string(the whole error body)", "The failure verbatim, for diagnosis."),
        ],
    },
]

DICT_COLUMNS = ["Table", "Sheet", "Column", "Type", "Filled by", "Source expression or field", "What it means"]


# ── rendering ─────────────────────────────────────────────────────────────────────────────
def width_for(col, kind):
    if kind == "json":
        return 62
    if kind == "int":
        return 14
    if kind == "utc":
        return 22
    return max(16, min(38, len(col) + 8))


def number_format(kind):
    # Text for everything the connector sends as a string. Without it Excel reads "0012" as 12
    # and an ISO timestamp as a date serial, and the harvest stops being verbatim.
    return "General" if kind == "int" else "@"


def band(ws, title, note, ncols):
    ws.cell(row=1, column=1, value=title).font = TITLE
    n = ws.cell(row=2, column=1, value=note)
    n.font = SUB
    n.alignment = WRAP
    last = get_column_letter(max(ncols, 1))
    ws.merge_cells(f"A2:{last}2")
    ws.row_dimensions[1].height = 26
    ws.row_dimensions[2].height = 46
    ws.sheet_view.showGridLines = False


def add_table(ws, name, columns, kinds):
    for i, col in enumerate(columns, start=1):
        c = ws.cell(row=HEADER_ROW, column=i, value=col)
        c.font, c.fill, c.alignment, c.border = H_FONT, H_FILL, H_ALIGN, BORDER
        letter = get_column_letter(i)
        ws.column_dimensions[letter].width = width_for(col, kinds[i - 1])
    ws.row_dimensions[HEADER_ROW].height = 30
    # The placeholder row Excel requires. Formatted, deliberately empty.
    for i, kind in enumerate(kinds, start=1):
        c = ws.cell(row=PLACEHOLDER_ROW, column=i)
        c.font = MONO if kind == "json" else BODY
        c.alignment = WRAP if kind == "json" else TOP
        c.number_format = number_format(kind)
    ref = f"A{HEADER_ROW}:{get_column_letter(len(columns))}{PLACEHOLDER_ROW}"
    t = Table(displayName=name, ref=ref)
    t.tableStyleInfo = TableStyleInfo(name="TableStyleLight8", showRowStripes=True,
                                      showFirstColumn=False, showLastColumn=False, showColumnStripes=False)
    ws.add_table(t)
    ws.freeze_panes = ws.cell(row=PLACEHOLDER_ROW, column=3)


def readme(wb, built):
    ws = wb.create_sheet("00 README", 0)
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 30
    ws.column_dimensions["B"].width = 118
    r = 1

    def head(text):
        nonlocal r
        c = ws.cell(row=r, column=1, value=text)
        c.font = SEC
        r += 2

    def kv(label, text):
        nonlocal r
        a = ws.cell(row=r, column=1, value=label)
        a.font, a.alignment = LBL, WRAP
        b = ws.cell(row=r, column=2, value=text)
        b.font, b.alignment = BODY, WRAP
        ws.row_dimensions[r].height = max(15, 13 * (1 + len(text) // 110))
        r += 1

    def gap():
        nonlocal r
        r += 1

    t = ws.cell(row=r, column=1, value="Flow harvest collector")
    t.font = TITLE
    ws.row_dimensions[r].height = 26
    r += 1
    s = ws.cell(row=r, column=1,
                value="An empty workbook a Power Automate flow writes a live inventory of every flow into.")
    s.font = SUB
    r += 3

    head("What this is")
    kv("Purpose", "A structured sink. A collector flow lists every flow in the environment, reads "
                  "each one in full, and appends rows here. Nothing in this file is data until "
                  "that flow runs.")
    kv("Direction", "The opposite of the endpoint master reference, which is BUILT from packages "
                    "already exported into the repository. This is filled from the live tenant, "
                    "so it can see flows no export reached.")
    kv("Why it matters", "Every count in the existing documentation comes from an export made with "
                         "the maker cmdlet Get-Flow, which returns only flows the exporting account "
                         "owns or co-owns. Run this with the admin listing and the result is the "
                         "tenant inventory that limitation has been blocking.")
    gap()

    head("The rules that make it work")
    kv("Real tables", "Every sheet carries a named Excel table — a ListObject. The Excel Online "
                      "(Business) connector writes into tables and nothing else; a formatted range "
                      "with an AutoFilter looks identical and is invisible to it.")
    kv("Column names are the contract", "'Add a row into a table' maps by column NAME. Rename or "
                                        "reorder a column in Excel and the flow's mapping breaks "
                                        "with no error. Regenerate this workbook instead of "
                                        "editing its headers.")
    kv("Nothing is truncated", "A cell holds 32,767 characters; definitions in this estate exceed "
                               "91,000. A definition is therefore split into ordered 32,000-character "
                               "parts, one row each. Concatenating a flow's parts in PartNo order "
                               "returns the original exactly.")
    kv("Nothing is filtered", "tblPropertiesPart holds the whole properties object the API returned, "
                              "not a selection from it. A field with no column in tblFlow is still "
                              "captured there.")
    kv("Failures are rows", "tblError takes one row per failed call. A harvest that skips a flow "
                            "silently is worse than one that fails, because the output looks complete.")
    kv("The placeholder row", "Each table spans its header plus ONE EMPTY ROW. Excel treats a "
                              "header-only table as damaged and repairs the file. That row is "
                              "structure, not data — delete it after the first collection, or "
                              "exclude blank RunId downstream.")
    gap()

    head("Two phases, and why")
    kv("The flow captures", "tblCollectionRun, tblFlow's directly addressable fields, "
                            "tblDefinitionPart, tblPropertiesPart, tblOwner and tblError. Every "
                            "one of those is reached by a fixed key path or comes back as an "
                            "array the flow can loop over.")
    kv("A script shreds", "tblConnection, tblAction, and tblFlow's Trigger* columns and its two "
                          "counts. Reaching those means walking triggers, actions and "
                          "connectionReferences — all objects keyed by name — and Power "
                          "Automate's expression language has no way to enumerate an object's "
                          "keys. Nothing is lost by deferring it: the definition and the whole "
                          "properties object are already captured verbatim, so the shredding "
                          "step reads them back out of this workbook and needs no second harvest.")
    kv("Why not force it", "The usual workaround converts the object to XML and reads element "
                           "names. It mangles them — a trigger called 'When a HTTP request is "
                           "received' comes back as When_x0020_a_x0020_HTTP_x0020_… — so the "
                           "harvest would stop being verbatim to save a step.")
    gap()

    head("Before the first run")
    kv("1", "Upload this workbook to a SharePoint document library or OneDrive for Business. The "
             "Excel connector cannot reach a local file or a repository.")
    kv("2", "Give the collector flow's Excel connection write access to that library, and no more.")
    kv("3", "Use the ADMIN listing if you want the tenant inventory. It needs a Power Platform or "
             "environment administrator account, and the Power Automate Management connector is "
             "premium. The non-admin listing runs on a standard licence and returns only what that "
             "account owns.")
    kv("4", "Set the 'Apply to each' over flows to run SEQUENTIALLY — concurrency off. Parallel "
             "writes to one workbook conflict, and the connector throttles at roughly 100 calls "
             "per 60 seconds.")
    gap()

    head("What it costs")
    kv("Row count", "About one row per flow, plus two to four definition and properties parts each, "
                    "plus one per connection. Sixty flows land near 400 rows.")
    kv("Time", "Each row is one connector call and the connector throttles near 100 calls a minute, "
               "so budget minutes, not seconds. There is no bulk insert in this connector.")
    kv("Scale", "A tenant with hundreds of flows will take a long time and may throttle. Harvest one "
                "environment at a time, or write raw JSON to the library and shred it afterwards.")
    gap()

    head("This build")
    kv("Workbook version", VERSION)
    kv("Built", built)
    kv("Generator", "scripts/build_flow_harvest_collector.py")
    kv("Verifier", "scripts/verify_flow_harvest_collector.py — reads the delivered file back and "
                   "asserts every table is a real ListObject with exactly these columns, in order.")
    kv("Flow build guide", "docs/folio-Master-Flows-and-Endpoints/reference/FLOW_HARVEST_COLLECTOR.md")


def main(out_path):
    built = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    wb = Workbook()
    wb.remove(wb.active)

    for spec in SPEC:
        ws = wb.create_sheet(spec["sheet"][:31])
        cols = [c["name"] for c in spec["columns"]]
        kinds = [c["type"] for c in spec["columns"]]
        band(ws, spec["title"], spec["note"], len(cols))
        add_table(ws, spec["table"], cols, kinds)

    # The dictionary is itself a table, so a flow or a script can read the contract it must meet.
    ws = wb.create_sheet("09 Data Dictionary")
    band(ws, "Data dictionary",
         "Every column of every table, what fills it, and where the value comes from. Generated "
         "from the same spec as the tables themselves, so it cannot describe a column that does "
         "not exist or miss one that does.", len(DICT_COLUMNS))
    add_table(ws, "tblDictionary", DICT_COLUMNS, ["text"] * len(DICT_COLUMNS))
    row = PLACEHOLDER_ROW
    for spec in SPEC:
        for col in spec["columns"]:
            row += 1
            for i, v in enumerate([spec["table"], spec["sheet"], col["name"], col["type"],
                                   col["filled_by"], col["source"], col["meaning"]], start=1):
                c = ws.cell(row=row, column=i, value=v)
                c.font = MONO if i == 6 else BODY
                c.alignment = WRAP
                c.number_format = "@"
                c.border = BORDER
    ws.tables["tblDictionary"].ref = f"A{HEADER_ROW}:{get_column_letter(len(DICT_COLUMNS))}{row}"
    for letter, width in zip("ABCDEFG", (20, 22, 30, 10, 26, 46, 78)):
        ws.column_dimensions[letter].width = width

    readme(wb, built)
    wb.save(out_path)

    tables = sum(len(w.tables) for w in wb.worksheets)
    cols = sum(len(s["columns"]) for s in SPEC) + len(DICT_COLUMNS)
    print(f"\n  wrote {out_path}")
    print(f"  {len(wb.sheetnames)} sheets, {tables} named tables, {cols} defined columns, "
          f"{row - PLACEHOLDER_ROW} dictionary entries\n")
    for spec in SPEC:
        print(f"   {spec['table']:<22} {len(spec['columns']):>3} cols   {spec['sheet']}")
    print()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "dist/DGO_Flow_Harvest_Collector.xlsx")
