#!/usr/bin/env python3
"""Render the endpoint workbook model into a formatted .xlsx.

This is the second half of the workbook build. `scripts/build-endpoint-workbook-model.mjs`
reads the flow packages and emits a JSON model of sheet-shaped rows; this turns that model
into the delivered spreadsheet. Extraction stays with the readers that understand a Power
Automate export; presentation stays where the spreadsheet library is.

WHAT THIS GUARANTEES ABOUT THE DATA
  * Nothing is truncated. Excel caps a cell at 32,767 characters and one configured value in
    this estate exceeds that, so any over-length value is SPLIT across continuation columns
    named "<column> — part 2", "part 3" and so on. The split is lossless and the sheet says
    where it happened. Cutting the value would have been silent, which is the failure this
    avoids.
  * Nothing is reformatted. Values arrive from the model as strings and are written as
    strings, so a JSON body, an expression, or a leading-zero identifier reaches the cell
    exactly as the package holds it. Excel is never allowed to coerce one into a number or
    a date.
  * Absence is written, not left blank. "(not declared)" means the package declares nothing;
    an empty cell would be indistinguishable from a value that happens to be empty.

NOT IN `npm test`, DELIBERATELY. This needs openpyxl, and verifying the result needs
LibreOffice; neither is a dependency of this repository, and a suite that fails because a
Python package is missing teaches people to ignore it. Build with `npm run workbook`, prove
it with `npm run workbook:verify`. The workbook itself is build output and is git-ignored —
the two generators are the tracked artefact, so the spreadsheet can always be rebuilt from
the packages rather than going stale in the tree as a binary nobody can diff.

Usage: python3 scripts/render_endpoint_workbook.py <model.json> <out.xlsx>
"""

import json
import sys
from datetime import datetime, timezone

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

CELL_LIMIT = 32767

# ── palette ───────────────────────────────────────────────────────────────────────────────
# Deep teal carries the header band; the semantic three are reserved for authentication
# posture, which is the one axis in this data where a value means better or worse.
INK        = "0E1319"
TEAL       = "0E5A5E"
TEAL_LIGHT = "DCEAEA"
RULE       = "B6BEC9"
BAND       = "F5F7F9"
MUTED      = "5C6675"
GOOD_BG,  GOOD_FG  = "DDEDE4", "1B6448"   # Tenant — restricted
WARN_BG,  WARN_FG  = "F6E9D2", "85560A"   # All — no tenant restriction
RISK_BG,  RISK_FG  = "F4DCE0", "94293A"   # absent — no posture recorded
NEUT_BG,  NEUT_FG  = "E4E7EC", "5C6675"

FONT = "Arial"
thin = Side(style="thin", color=RULE)
BORDER = Border(bottom=thin)

H_FONT   = Font(name=FONT, size=10, bold=True, color="FFFFFF")
H_FILL   = PatternFill("solid", fgColor=TEAL)
H_ALIGN  = Alignment(horizontal="left", vertical="center", wrap_text=True)
BODY     = Font(name=FONT, size=9.5, color=INK)
MONO     = Font(name="Consolas", size=9, color=INK)
B_ALIGN  = Alignment(horizontal="left", vertical="top", wrap_text=True)
T_ALIGN  = Alignment(horizontal="left", vertical="top", wrap_text=False)

TITLE    = Font(name=FONT, size=20, bold=True, color=TEAL)
SUB      = Font(name=FONT, size=11, color=MUTED)
SEC      = Font(name=FONT, size=12, bold=True, color=INK)
LBL      = Font(name=FONT, size=9.5, bold=True, color=MUTED)

# Columns whose content is code, JSON or an expression get the mono face and a wide track.
CODE_HINTS = ("verbatim", "schema", "headers", "body", "uri", "expression", "foreach",
              "metadata", "trackedproperties", "runtimeconfiguration", "parameters",
              "value", "default", "pattern", "sha-256", "maker url", "trigger url")
WIDE_HINTS = ("note", "description", "purpose", "reason", "detail", "basis", "operations",
              "route keys", "runs after", "on statuses", "shared with", "source package",
              "action path", "display name", "capture id")


def is_code(col: str) -> bool:
    c = col.lower()
    return any(h in c for h in CODE_HINTS)


def width_for(col: str, sample_len: int) -> float:
    c = col.lower()
    if is_code(col):
        return 58
    if any(h in c for h in WIDE_HINTS):
        return 42
    return max(12, min(34, sample_len + 3))


def split_long(value):
    """Return the value as a list of parts, none longer than a cell can hold."""
    if not isinstance(value, str) or len(value) <= CELL_LIMIT:
        return [value]
    return [value[i:i + CELL_LIMIT] for i in range(0, len(value), CELL_LIMIT)]


def write_cell(ws, row, col, value, code=False):
    """Write a value without letting Excel reinterpret it.

    Every string is written with an explicit text format. Without this, a value like
    "0012" becomes the number 12 and "2026-08-19" becomes a date serial — both of which
    would make the workbook disagree with the package it was read from."""
    c = ws.cell(row=row, column=col)
    c.value = value
    c.font = MONO if code else BODY
    c.alignment = B_ALIGN if code else T_ALIGN
    c.border = BORDER
    if isinstance(value, str):
        c.number_format = "@"
    return c


def render_sheet(wb, sheet, idx):
    ws = wb.create_sheet(sheet["name"][:31])
    cols = list(sheet["columns"])
    rows = sheet["rows"]

    # ── lossless handling of values that exceed a cell ──
    extra = {}
    for r in rows:
        for i, v in enumerate(r):
            if isinstance(v, str) and len(v) > CELL_LIMIT:
                extra[i] = max(extra.get(i, 1), -(-len(v) // CELL_LIMIT))
    split_note = ""
    if extra:
        added = []
        for i in sorted(extra, reverse=True):
            for part in range(extra[i], 1, -1):
                cols.insert(i + 1, f"{sheet['columns'][i]} — part {part}")
                added.append(f"{sheet['columns'][i]} (into {extra[i]} parts)")
        split_note = (" One or more values exceed Excel's 32,767-character cell limit and are "
                      "SPLIT across continuation columns, in order, with nothing removed: "
                      + "; ".join(sorted(set(added))) + ".")

    def expand(r):
        out = []
        for i, v in enumerate(r):
            parts = split_long(v)
            need = extra.get(i, 1)
            out.extend(parts + [""] * (need - len(parts)))
        return out

    # ── title block ──
    ws["A1"] = sheet["title"]
    ws["A1"].font = Font(name=FONT, size=13, bold=True, color=TEAL)
    ws["A2"] = sheet["note"] + split_note
    ws["A2"].font = SUB
    ws["A2"].alignment = Alignment(vertical="top", wrap_text=True)
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(4, len(cols)))
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(4, len(cols)))
    ws.row_dimensions[1].height = 22
    ws.row_dimensions[2].height = 42

    HEADER_ROW = 4
    for i, name in enumerate(cols, start=1):
        c = ws.cell(row=HEADER_ROW, column=i, value=name)
        c.font, c.fill, c.alignment = H_FONT, H_FILL, H_ALIGN
    ws.row_dimensions[HEADER_ROW].height = 34

    posture_col = cols.index("Authentication posture") + 1 if "Authentication posture" in cols else None
    if posture_col is None and "triggerAuthenticationType" in cols:
        posture_col = cols.index("triggerAuthenticationType") + 1

    for ri, r in enumerate(rows, start=HEADER_ROW + 1):
        for ci, v in enumerate(expand(r), start=1):
            code = is_code(cols[ci - 1]) if ci - 1 < len(cols) else False
            cell = write_cell(ws, ri, ci, v, code=code)
            if ri % 2 == 0:
                cell.fill = PatternFill("solid", fgColor=BAND)
            if posture_col and ci == posture_col and isinstance(v, str):
                if v == "Tenant":
                    cell.fill = PatternFill("solid", fgColor=GOOD_BG); cell.font = Font(name=FONT, size=9.5, bold=True, color=GOOD_FG)
                elif v == "All":
                    cell.fill = PatternFill("solid", fgColor=WARN_BG); cell.font = Font(name=FONT, size=9.5, bold=True, color=WARN_FG)
                elif v.startswith("(absent"):
                    cell.fill = PatternFill("solid", fgColor=RISK_BG); cell.font = Font(name=FONT, size=9.5, bold=True, color=RISK_FG)
                else:
                    cell.fill = PatternFill("solid", fgColor=NEUT_BG); cell.font = Font(name=FONT, size=9.5, color=NEUT_FG)

    for i, name in enumerate(cols, start=1):
        sample = max((len(str(r[i - 1])) for r in rows[:200] if i - 1 < len(r)), default=12)
        ws.column_dimensions[get_column_letter(i)].width = width_for(name, sample)

    last = HEADER_ROW + len(rows)
    if rows:
        ws.auto_filter.ref = f"A{HEADER_ROW}:{get_column_letter(len(cols))}{last}"
    ws.freeze_panes = ws.cell(row=HEADER_ROW + 1, column=3)
    ws.sheet_view.showGridLines = False
    return ws, len(rows), len(cols)


def main(model_path, out_path):
    model = json.load(open(model_path, encoding="utf-8"))
    wb = Workbook()
    wb.remove(wb.active)

    cover = wb.create_sheet("01 Cover")
    glossary_rows = []

    rendered = []
    for idx, sheet in enumerate(model["sheets"], start=1):
        rendered.append((sheet, *render_sheet(wb, sheet, idx)[1:]))

    # ── cover ─────────────────────────────────────────────────────────────────────────────
    crlf_count = sum(1 for sh in model["sheets"] for rr in sh["rows"]
                     for v in rr if isinstance(v, str) and "\r" in v)
    cap = model["dataset"]["capture"]
    tot = model["dataset"]["totals"]
    cover.sheet_view.showGridLines = False
    cover.column_dimensions["A"].width = 34
    cover.column_dimensions["B"].width = 96
    cover.column_dimensions["C"].width = 16
    cover.column_dimensions["D"].width = 12

    r = 1
    cover.cell(row=r, column=1, value="DGO Endpoint Estate — Master Reference").font = TITLE
    r += 1
    cover.cell(row=r, column=1,
               value="Every endpoint and every flow captured from the Power Platform environment, "
                     "with all configured detail, read from the packages in dgoeaa/ECM_DOCS_DEV.").font = SUB
    cover.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    r += 2

    def section(title):
        nonlocal r
        cover.cell(row=r, column=1, value=title).font = SEC
        cover.cell(row=r, column=1).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        cover.cell(row=r, column=2).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        cover.cell(row=r, column=3).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        cover.cell(row=r, column=4).fill = PatternFill("solid", fgColor=TEAL_LIGHT)
        r += 1

    def kv(label, value, code=False):
        nonlocal r
        cover.cell(row=r, column=1, value=label).font = LBL
        c = cover.cell(row=r, column=2, value=value)
        c.font = MONO if code else BODY
        c.alignment = Alignment(vertical="top", wrap_text=True)
        c.number_format = "@"
        r += 1

    section("Provenance")
    kv("Built from commit", model.get("commit") or "(not recorded)", code=True)
    kv("Repository", "dgoeaa/ECM_DOCS_DEV — branch claude/platform-flows-endpoints-docs-plxjlw", code=True)
    kv("Source of every value", "docs/folio-Master-Flows-and-Endpoints/contracts/deployed/ — flow definitions exported from the environment", code=True)
    kv("Exported by", cap.get("exportedBy") or "(not recorded)", code=True)
    kv("Environment captured on", ", ".join(cap.get("capturedOn") or []) or "(not recorded)", code=True)
    kv("Workbook generated (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"), code=True)
    r += 1

    section("What this workbook is, and the one thing it is not")
    kv("Complete", "Every captured flow, every action, every configured input, every response, every "
                   "variable and every connection is present. Nothing is filtered, summarised or shortened. "
                   "A value longer than a cell can hold is split across continuation columns, in order, "
                   "with nothing removed.")
    kv("Self-contained", "No sheet depends on another file. Every identifier, schema and value needed to "
                         "administer an endpoint is in this workbook.")
    kv("The one normalisation", f"{crlf_count} value(s) in this workbook carry a CRLF line break in the source "
                                "package and are stored with LF, because that is how the spreadsheet format "
                                "stores a line break. No character is dropped and no value is shortened. "
                                "Every other value is character-for-character identical to its package, "
                                "which scripts/verify_endpoint_workbook.py proves by reading this file back "
                                "and comparing it cell by cell.")
    kv("NOT a tenant inventory", cap.get("limit") or "")
    cover.cell(row=r - 1, column=2).fill = PatternFill("solid", fgColor=RISK_BG)
    cover.cell(row=r - 1, column=2).font = Font(name=FONT, size=9.5, bold=True, color=RISK_FG)
    kv("Credentials", "No signed trigger URL appears anywhere in this workbook. A signed URL is a bearer "
                      "credential; the workflow id it addresses is not, and is what is recorded. Signatures "
                      "published from this repository remain valid until each trigger is regenerated in "
                      "Power Automate — removing a file revokes nothing.")
    r += 1

    section("Counts — computed live from the sheets in this workbook, not typed in")
    hdr = ["Measure", "Formula reads", "Live formula", "At build"]
    for i, h in enumerate(hdr, start=1):
        c = cover.cell(row=r, column=i, value=h)
        c.font, c.fill, c.alignment = H_FONT, H_FILL, H_ALIGN
    r += 1
    def rows_of(nm):
        for sh in model["sheets"]:
            if sh["name"] == nm:
                return sh["rows"]
        return []

    def count_where(nm, col, want):
        for sh in model["sheets"]:
            if sh["name"] == nm:
                i = sh["columns"].index(col)
                return sum(1 for rr in sh["rows"] if rr[i] == want)
        return 0

    build_counts = {
        "Endpoint keys declared (rows incl. multi-flow resolutions)": len(rows_of("02 Endpoint Register")),
        "Flows captured from the environment": len(rows_of("03 Flows")),
        "…of those, HTTP endpoints": count_where("03 Flows", "Is endpoint", "TRUE"),
        "…of those, not an endpoint (connector-event trigger)": count_where("03 Flows", "Is endpoint", "FALSE"),
        "Authentication posture: Tenant": count_where("03 Flows", "Authentication posture", "Tenant"),
        "Authentication posture: All": count_where("03 Flows", "Authentication posture", "All"),
        "Authentication posture: NOT RECORDED by the export": count_where("03 Flows", "Authentication posture", "(absent from the export)"),
        "Flows declaring no request schema": count_where("03 Flows", "Request schema declared", "FALSE"),
        "Request properties declared, across all flows": len(rows_of("05 Request Properties")),
        "Responses configured": len(rows_of("07 Responses")),
        "Actions configured, across all flows": len(rows_of("15 Action Register")),
        "Catch edges (error-handling wiring)": len(rows_of("09 Error Handling")),
        "SharePoint operations": len(rows_of("12 SharePoint Operations")),
        "Variables declared and written": len(rows_of("14 Variables")),
        "Flows claimed by no endpoint key": len(rows_of("17 Unclaimed Flows")),
    }

    # Every data sheet places a title in row 1, a note in row 2, a blank row 3 and the header
    # in row 4, so COUNTA over column A counts three cells that are not data. Verified against
    # '03 Flows', which holds 60 captures: COUNTA = 63.
    counts = [
        ("Endpoint keys declared (rows incl. multi-flow resolutions)", "'02 Endpoint Register'", "=COUNTA('02 Endpoint Register'!A:A)-3"),
        ("Flows captured from the environment", "'03 Flows'", "=COUNTA('03 Flows'!A:A)-3"),
        ("…of those, HTTP endpoints", "'03 Flows' column G", "=COUNTIF('03 Flows'!G:G,\"TRUE\")"),
        ("…of those, not an endpoint (connector-event trigger)", "'03 Flows' column G", "=COUNTIF('03 Flows'!G:G,\"FALSE\")"),
        ("Authentication posture: Tenant", "'03 Flows' column Y", "=COUNTIF('03 Flows'!Y:Y,\"Tenant\")"),
        ("Authentication posture: All", "'03 Flows' column Y", "=COUNTIF('03 Flows'!Y:Y,\"All\")"),
        ("Authentication posture: NOT RECORDED by the export", "'03 Flows' column Y", "=COUNTIF('03 Flows'!Y:Y,\"(absent from the export)\")"),
        ("Flows declaring no request schema", "'03 Flows' column AA", "=COUNTIF('03 Flows'!AA:AA,\"FALSE\")"),
        ("Request properties declared, across all flows", "'05 Request Properties'", "=COUNTA('05 Request Properties'!A:A)-3"),
        ("Responses configured", "'07 Responses'", "=COUNTA('07 Responses'!A:A)-3"),
        ("Actions configured, across all flows", "'15 Action Register'", "=COUNTA('15 Action Register'!A:A)-3"),
        ("Catch edges (error-handling wiring)", "'09 Error Handling'", "=COUNTA('09 Error Handling'!A:A)-3"),
        ("SharePoint operations", "'12 SharePoint Operations'", "=COUNTA('12 SharePoint Operations'!A:A)-3"),
        ("Variables declared and written", "'14 Variables'", "=COUNTA('14 Variables'!A:A)-3"),
        ("Flows claimed by no endpoint key", "'17 Unclaimed Flows'", "=COUNTA('17 Unclaimed Flows'!A:A)-3"),
    ]
    for label, reads, formula in counts:
        cover.cell(row=r, column=1, value=label).font = BODY
        cover.cell(row=r, column=1).alignment = Alignment(vertical="top", wrap_text=True)
        cover.cell(row=r, column=2, value=reads).font = MONO
        c = cover.cell(row=r, column=3, value=formula)
        c.font = Font(name=FONT, size=10, bold=True, color=INK)
        c.alignment = Alignment(horizontal="right", vertical="center")
        # The same figure counted in Python from the model at build time. It is here because
        # openpyxl writes a formula with no cached result: until Excel opens the file and
        # recalculates, column C reads as blank. This column always shows a number, and the
        # two must agree — a disagreement means a sheet was edited after the build.
        b = cover.cell(row=r, column=4, value=build_counts.get(label))
        b.font = Font(name=FONT, size=10, color=MUTED)
        b.alignment = Alignment(horizontal="right", vertical="center")
        for col in range(1, 5):
            cover.cell(row=r, column=col).border = BORDER
        r += 1
    cover.cell(row=r, column=1,
               value="\"Live formula\" recalculates whenever a sheet changes; \"At build\" was counted "
                     "from the source packages when this workbook was written. They must agree. Column C "
                     "appears blank until Excel opens the file and recalculates — openpyxl writes formulas "
                     "without cached results.").font = Font(name=FONT, size=9, italic=True, color=MUTED)
    cover.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    cover.row_dimensions[r].height = 28
    r += 2

    section("Sheets in this workbook")
    for i, h in enumerate(["Sheet", "What it holds", "Rows", "Columns"], start=1):
        c = cover.cell(row=r, column=i, value=h)
        c.font, c.fill, c.alignment = H_FONT, H_FILL, H_ALIGN
    r += 1
    for sheet, nrows, ncols in rendered:
        cover.cell(row=r, column=1, value=sheet["name"]).font = Font(name=FONT, size=9.5, bold=True, color=TEAL)
        cover.cell(row=r, column=2, value=sheet["title"]).font = BODY
        cover.cell(row=r, column=2).alignment = Alignment(vertical="top", wrap_text=True)
        cover.cell(row=r, column=3, value=nrows).font = BODY
        cover.cell(row=r, column=4, value=ncols).font = BODY
        for col in range(1, 5):
            cover.cell(row=r, column=col).border = BORDER
        r += 1

    # ── glossary ──────────────────────────────────────────────────────────────────────────
    gl = wb.create_sheet("19 Glossary")
    gl.sheet_view.showGridLines = False
    gl.column_dimensions["A"].width = 40
    gl.column_dimensions["B"].width = 118
    gl.cell(row=1, column=1, value="Glossary — every term and value convention used in this workbook").font = Font(name=FONT, size=13, bold=True, color=TEAL)
    gl.cell(row=2, column=1, value="Each is derived mechanically from the flow packages. Nothing here is a judgement.").font = SUB
    for i, h in enumerate(["Term", "Meaning"], start=1):
        c = gl.cell(row=4, column=i, value=h)
        c.font, c.fill, c.alignment = H_FONT, H_FILL, H_ALIGN
    terms = [
        ("Capture ID", "This workbook's row key for a flow: the export filename. It is NEITHER identifier below. It exists because one Flow ID in this estate is carried by two different captures, and a shared key would silently merge them."),
        ("Flow ID (maker portal)", "The dashed GUID Power Automate names the flow by, recorded by every export as workflow_identity.internal_name. It is what the maker portal URL carries. Present for every flow."),
        ("Workflow ID (trigger URL)", "The 32-hex id a SIGNED TRIGGER URL addresses. NO PACKAGE IN THIS ESTATE CARRIES IT — every export records full_resource_id as null. It is joined from the endpoint registers where one names the flow, and left '(not declared)' otherwise. Never treat it as interchangeable with the Flow ID."),
        ("Maker URL (constructed)", "CONSTRUCTED by the generator from Environment + Flow ID, both verbatim from the package. It is not a value read from anything."),
        ("Is endpoint", "TRUE when the trigger is an HTTP Request — something a caller can invoke at a URL. The one flow with a connector-event trigger is retained with FALSE rather than removed."),
        ("Estate", "Which platform the flow serves: internal (the operations platform) or portal (the public document portal). Cited from the flow standard and the portal endpoint register, never guessed from a name."),
        ("Endpoint key / Contract key", "The name an application uses for an endpoint (FETCH_ALL, SUBMISSION). The internal platform sends it in the request body as the 'action' field. Several keys can resolve to one flow."),
        ("Route keys", "Where one endpoint multiplexes many operations over a single trigger, these are the operation names it accepts. SUBSIDIARY_ACTIONS carries 18."),
        ("Authentication posture", "The triggerAuthenticationType the definition carries. 'Tenant' restricts callers to the tenant. 'All' places no tenant restriction. '(absent from the export)' means the export carries NO value — the posture is unknown either way and is NOT the same as 'All'."),
        ("Request schema", "The JSON Schema the trigger declares. 'Request schema declared = FALSE' means any JSON body is accepted and nothing is validated at the boundary."),
        ("Required (request property)", "Resolved against the PARENT object's required list, which is where JSON Schema puts it — not against the property itself."),
        ("Status code (response)", "The statusCode configured on a Response action, verbatim. A value beginning with @ is an expression evaluated at run time, so the endpoint has no fixed code."),
        ("Catch edge", "An action wired to run after Failed, Skipped or TimedOut rather than Succeeded. These are the flow's error handling, whatever they are named. A flow absent from sheet 09 has no catch path at all."),
        ("Runs after / On statuses", "The dependency that starts an action, and the statuses the dependency must end in. Together they are the action graph."),
        ("Action path", "The address of an action within the definition, including its nesting through scopes, conditions, switch cases and loops."),
        ("Connection", "A connector binding read from an action's inputs.host. Two connections to the same connector (shared_office365 and shared_office365-2) count separately: they are separate bindings."),
        ("Unclaimed flow", "Captured, HTTP-triggered, and named by no endpoint key in either register. It exists in the environment; nothing in the repository claims to need it. A statement about the registers, not a verdict on the flow."),
        ("(not declared)", "The package declares nothing for this property. Written out rather than left blank, because a blank cell and an absent property are indistinguishable in a spreadsheet and mean different things."),
        ("(none)", "The property is declared and is empty — an empty list, or no matching rows."),
        ("(empty string)", "The value is a string of zero length, which is a configured value and not an absence."),
        ("— part 2, part 3", "A continuation column. Excel caps a cell at 32,767 characters; a longer value is split across these columns in order, losslessly. Concatenate the parts to recover the original."),
    ]
    gr = 5
    for t, m in terms:
        gl.cell(row=gr, column=1, value=t).font = Font(name="Consolas", size=9, bold=True, color=INK)
        gl.cell(row=gr, column=1).alignment = Alignment(vertical="top", wrap_text=True)
        gl.cell(row=gr, column=2, value=m).font = BODY
        gl.cell(row=gr, column=2).alignment = Alignment(vertical="top", wrap_text=True)
        for col in (1, 2):
            gl.cell(row=gr, column=col).border = BORDER
        gr += 1
    gl.freeze_panes = "A5"

    # cover first, glossary last
    wb.move_sheet("01 Cover", offset=-len(wb.sheetnames) + 1)
    wb.active = 0
    wb.save(out_path)
    print(f"wrote {out_path}: {len(wb.sheetnames)} sheets")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
