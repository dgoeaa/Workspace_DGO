#!/usr/bin/env python3
"""
The connector register as a styled Excel workbook.

Reads docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json - the register of record, built by
scripts/build-connector-register.mjs - and writes CONNECTOR_REGISTER.xlsx beside it. Nothing is
read from anywhere else, so the workbook cannot say something the register does not.

Every row of every register section is carried: no sheet is sampled, capped or truncated. The
largest single value in the register is under Excel's 32,767-character cell limit; the build
refuses to run if that ever stops being true, rather than cutting a value short.

Counts on the Summary and the two matrices are live COUNTIFS formulas over the Actions sheet, so
filtering or correcting a row there moves every total that depends on it.

The Cover sheet records the SHA-256 of the JSON it was built from.
`node scripts/build-connector-register.mjs --check` compares that fingerprint with the register,
so a workbook left behind by a register change fails the build.

Usage:
    python3 scripts/build-connector-register-xlsx.py      (needs openpyxl)
    python3 <xlsx skill>/scripts/recalc.py docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_REGISTER.xlsx
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import ColorScaleRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json'
OUT = ROOT / 'docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_REGISTER.xlsx'
CELL_LIMIT = 32767

raw = SRC.read_bytes()
SRC_SHA = hashlib.sha256(raw).hexdigest()
R = json.loads(raw)

# ── style ────────────────────────────────────────────────────────────────────────────────
FONT = 'Arial'
NAVY, INK, MUTED, RULE, TINT = '1F2A44', '1F1F1F', '5B6475', 'C9CFDA', 'EEF2F8'
F_BODY = Font(name=FONT, size=10, color=INK)
F_HEAD = Font(name=FONT, size=10, bold=True, color='FFFFFF')
F_TITLE = Font(name=FONT, size=20, bold=True, color=NAVY)
F_SUB = Font(name=FONT, size=11, color=MUTED)
F_H2 = Font(name=FONT, size=12, bold=True, color=NAVY)
F_LINK = Font(name=FONT, size=10, color='1F4FB4', underline='single')
F_NOTE = Font(name=FONT, size=9, italic=True, color=MUTED)
F_KPI = Font(name=FONT, size=14, bold=True, color=NAVY)
FILL_HEAD = PatternFill('solid', fgColor=NAVY)
FILL_TINT = PatternFill('solid', fgColor=TINT)
FILL_TOTAL = PatternFill('solid', fgColor='DDE3EE')
THIN = Side(style='thin', color=RULE)
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP_TOP = Alignment(wrap_text=True, vertical='top')
TOP = Alignment(vertical='top')
CENTER = Alignment(horizontal='center', vertical='center')
ROTATED = Alignment(text_rotation=90, horizontal='center', vertical='bottom', wrap_text=True)

ILLEGAL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')


def J(v):
    """JSON for a cell - compact, key order as the source carries it."""
    if v is None:
        return None
    return json.dumps(v, ensure_ascii=False, separators=(', ', ': '))


def cellval(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return 'yes' if v else 'no'
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, (list, dict)):
        v = J(v)
    s = ILLEGAL.sub(lambda m: '\\u%04x' % ord(m.group(0)), str(v))
    if len(s) > CELL_LIMIT:
        sys.exit(f'✖ a value of {len(s)} characters exceeds the Excel cell limit - refusing to truncate it')
    return s


class Formula(str):
    """A formula this workbook computes. Every other string is register data."""


def put(ws, row, col, v, font=F_BODY, align=None, fill=None, fmt=None):
    c = ws.cell(row=row, column=col)
    if isinstance(v, Formula):
        c.value = str(v)
    else:
        val = cellval(v)
        c.value = val
        # A register value that begins "=" is data, not a formula.
        if isinstance(val, str) and val.startswith('='):
            c.data_type = 's'
    c.font = font
    if align:
        c.alignment = align
    if fill:
        c.fill = fill
    if fmt:
        c.number_format = fmt
    return c


wb = Workbook()
wb.remove(wb.active)
TABLES = set()


def table_sheet(title, headers, rows, widths, note, wrap=(), table_name=None, tab=None):
    """A sheet holding one Excel Table: filterable, banded, header frozen."""
    ws = wb.create_sheet(title)
    if tab:
        ws.sheet_properties.tabColor = tab
    put(ws, 1, 1, title, F_H2)
    put(ws, 2, 1, note, F_NOTE)
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(4, len(headers)))
    ws.row_dimensions[2].height = 30
    ws.cell(row=2, column=1).alignment = Alignment(wrap_text=True, vertical='top')
    hr = 4
    for i, h in enumerate(headers, 1):
        c = put(ws, hr, i, h, F_HEAD, Alignment(wrap_text=True, vertical='center'), FILL_HEAD)
        c.border = BOX
    wrapset = set(wrap)
    for r, row in enumerate(rows, hr + 1):
        for i, v in enumerate(row, 1):
            put(ws, r, i, v, F_BODY, WRAP_TOP if headers[i - 1] in wrapset else TOP)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[hr].height = 32
    ws.freeze_panes = ws.cell(row=hr + 1, column=2)
    last = hr + max(1, len(rows))
    if not rows:
        for i in range(1, len(headers) + 1):
            ws.cell(row=hr + 1, column=i).value = None
    name = table_name or re.sub(r'[^A-Za-z0-9]', '', title)
    assert name not in TABLES
    TABLES.add(name)
    t = Table(displayName=name, ref=f'A{hr}:{get_column_letter(len(headers))}{last}')
    t.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=True)
    ws.add_table(t)
    ws.sheet_view.zoomScale = 90
    return ws


S = R['summary']
A = R['actions']
art = {a['artefactId']: a for a in R['artefacts']}

# ── Actions (the base every formula counts) ───────────────────────────────────────────────
ACT_HEAD = ['Row', 'Artefact', 'Flow', 'Family', 'Derived', 'Source', 'Role', 'Path', 'Action name', 'Type', 'Kind',
            'Connector class', 'Connector', 'Connector · Operation', 'API id', 'Connector provenance', 'Connection reference',
            'Reference form', 'Connection', 'Connection provenance', 'Connection account', 'Operation', 'Method', 'Target',
            'SharePoint site', 'SharePoint list / table', 'SharePoint list title', 'List resolution', 'Parameters (JSON)',
            'Run after (JSON)', 'Retry policy (JSON)', 'Runtime configuration (JSON)', 'Authentication (JSON)',
            'Operation options', 'Limit (JSON)', 'Description', 'Tracked properties (JSON)', 'Secure data (JSON)',
            'Operation metadata id', 'Full inputs (JSON)']
act_rows = []
for a in A:
    ar = art[a['artefactId']]
    sp = a.get('sharePoint') or {}
    act_rows.append([
        a['rowId'], a['artefactId'], a['flow'], ar['family'], ar['derived'], a['source'], a['role'], a['path'], a['name'],
        a['type'], a['kind'], a['connectorClass'], a['apiName'], f"{a['apiName']} · {a['operationId']}", a['apiId'],
        a['apiNameProvenance'], a['connectionReference'], a.get('connectionReferenceForm'), a['connectionResource'],
        a.get('connectionResourceProvenance'), a.get('connectionAccount'), a['operationId'], a['method'], a['target'],
        sp.get('site'), sp.get('table'), sp.get('listTitle'), sp.get('listResolution'), a['parameters'],
        a['runAfter'], a['retryPolicy'], a['runtimeConfiguration'], a['authentication'], a['operationOptions'],
        a['limit'], a['description'], a['trackedProperties'], a['secureData'], a['operationMetadataId'], a['inputs'],
    ])
N = len(act_rows)
FIRST, LAST = 5, 4 + N
COL = {h: get_column_letter(i) for i, h in enumerate(ACT_HEAD, 1)}


def rng(h):
    return f"Actions!${COL[h]}${FIRST}:${COL[h]}${LAST}"


# ── Cover ────────────────────────────────────────────────────────────────────────────────
cov = wb.create_sheet('Cover')
cov.sheet_properties.tabColor = NAVY
cov.sheet_view.showGridLines = False
cov.column_dimensions['A'].width = 3
cov.column_dimensions['B'].width = 34
cov.column_dimensions['C'].width = 110
put(cov, 2, 2, 'Connector & Connection Register', F_TITLE)
put(cov, 3, 2, 'Every connector, connection reference and connection bound by every flow action and trigger in the repository', F_SUB)
meta = [
    ('Register of record', 'docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json'),
    ('Built by', 'scripts/build-connector-register.mjs (npm run connectors) → this workbook: scripts/build-connector-register-xlsx.py'),
    ('Source fingerprint (SHA-256)', SRC_SHA),
    ('Scope', S['sourcesScanned']),
    ('Artefacts', S['artefacts']),
    ('Connector-bound actions and triggers', S['connectorRows']),
    ('Credentials', 'Masked as [MASKED:<kind>#<sha256 first 8 hex>] - see the Maskings sheet. No other value is altered.'),
    ('Completeness', 'No sheet is sampled, capped or truncated. Every register row is present; every value is whole.'),
]
r = 5
for k, v in meta:
    put(cov, r, 2, k, Font(name=FONT, size=10, bold=True, color=MUTED), TOP)
    put(cov, r, 3, v, F_BODY, Alignment(wrap_text=True, vertical='top', horizontal='left'), fmt='#,##0' if isinstance(v, int) else None)
    r += 1
cov.cell(row=7, column=3).font = Font(name='Consolas', size=10, color=INK)
r += 1
put(cov, r, 2, 'Sheets', F_H2)
r += 1
GUIDE = [
    ('Summary', 'Headline measures - live counts over the Actions sheet.'),
    ('Connector Matrix', 'Every flow × every connector: how many actions bind each connector.'),
    ('Operation Matrix', 'Every flow × every connector operation.'),
    ('Connectors', 'Connector catalogue - display names, API ids, keys, connections, accounts, operations.'),
    ('Operations', 'Each operation with every parameter key it is called with.'),
    ('Reference Keys', 'Each connection reference key actions name, and the connection behind it.'),
    ('Connections', 'Tenant connection resources, their accounts and the flows bound to them.'),
    ('Packages', 'Solution-package connection maps (connectionsMap / apisMap / manifest).'),
    ('SharePoint Targets', 'Every site and list the SharePoint connector addresses.'),
    ('HTTP Endpoints', 'Every external endpoint the built-in HTTP action calls.'),
    ('Flows', 'Each flow label, its artefacts and the connectors it uses.'),
    ('Artefacts', 'Each definition, package, scope or fragment read, with identity and inventory.'),
    ('Actions', 'THE REGISTER: one row per connector-bound action or trigger, every parameter and setting.'),
    ('Parameters', 'The same parameters one per row - filter by key or value.'),
    ('Connection Declarations', 'Every connection reference each artefact declares.'),
    ('Sources', 'Every candidate source file or archive member, and what it yielded.'),
    ('Token Index', 'Every connector token anywhere in the repository and how it is classified.'),
    ('Mentions', 'Every file mentioning a connector token, token by token.'),
    ('Reconciliation', 'The generated provisioning pages checked against the register.'),
    ('Cross-Check', 'Connector entries outside every artefact, each matched to a register row.'),
    ('Maskings', 'Every credential masked, where it stood, and its fingerprint.'),
]
for name, what in GUIDE:
    # A HYPERLINK formula, not a cell hyperlink: recalculation rewrites a cell hyperlink's sheet
    # name with %20 for spaces, which Excel does not follow.
    put(cov, r, 2, Formula(f'=HYPERLINK("#\'{name}\'!A1","{name}")'), F_LINK)
    put(cov, r, 3, what, F_BODY)
    r += 1
r += 1
put(cov, r, 2, 'Reading the tables', F_H2)
r += 1
for line in [
    'Every table has filter buttons on its header row. The header row and the first column stay in view while you scroll.',
    'Family says what kind of artefact a row comes from (deployed export, solution package, designer-paste scope, run capture …). Derived = yes marks artefacts generated from another artefact in the repository.',
    '"Connection" is the tenant connection resource. Its provenance column says whether the artefact declares it, a package maps it, or it was inferred (only when an artefact declares exactly one connection for that connector).',
    'JSON columns hold the value exactly as the source carries it. Select a cell and read it in the formula bar, or widen the column.',
]:
    put(cov, r, 2, '•', F_BODY, TOP)
    put(cov, r, 3, line, F_BODY, WRAP_TOP)
    cov.row_dimensions[r].height = 28
    r += 1

# ── Summary (formulas over Actions) ──────────────────────────────────────────────────────
sm = wb.create_sheet('Summary')
sm.sheet_properties.tabColor = '2E6FD8'
sm.sheet_view.showGridLines = False
sm.column_dimensions['A'].width = 3
sm.column_dimensions['B'].width = 46
sm.column_dimensions['C'].width = 16
sm.column_dimensions['D'].width = 16
sm.column_dimensions['E'].width = 60
put(sm, 2, 2, 'Summary', F_TITLE)
put(sm, 3, 2, 'Counts in blue-bordered cells are live formulas over the Actions sheet; the rest are the register\'s own totals.', F_NOTE)
r = 5
put(sm, r, 2, 'Headline', F_H2)
r += 1
heads = [
    ('Connector-bound actions and triggers', Formula(f'=COUNTA({rng("Row")})'), 'formula'),
    ('… in primary (non-derived) artefacts', Formula(f'=COUNTIFS({rng("Derived")},"no")'), 'formula'),
    ('Managed-connector calls', Formula(f'=COUNTIFS({rng("Connector class")},"managed connector")'), 'formula'),
    ('Built-in HTTP calls', Formula(f'=COUNTIFS({rng("Connector class")},"built-in HTTP")'), 'formula'),
    ('Built-in triggers', Formula(f'=COUNTIFS({rng("Connector class")},"built-in trigger")'), 'formula'),
    ('Built-in responses', Formula(f'=COUNTIFS({rng("Connector class")},"built-in response")'), 'formula'),
    ('Calls with a declared or mapped connection', Formula(f'=COUNTIFS({rng("Connector class")},"managed connector",{rng("Connection")},"<>")'), 'formula'),
    ('Inert actions (held as data, never executed)', Formula(f'=COUNTIFS({rng("Role")},"inert*")'), 'formula'),
    ('Artefacts read', S['artefacts'], 'register'),
    ('Distinct flow labels', S['distinctFlowLabels'], 'register'),
    ('Actions and triggers walked (all types)', S['totalActionsAndTriggersWalked'], 'register'),
    ('Candidate source files and members', S['candidateSources'], 'register'),
    ('Connectors', S['connectors'], 'register'),
    ('Operations', S['operations'], 'register'),
    ('Connection reference keys', S['connectionReferenceKeys'], 'register'),
    ('Tenant connections', S['connectionResources'], 'register'),
    ('Solution packages', S['solutionPackages'], 'register'),
    ('SharePoint targets', S['sharePointTargets'], 'register'),
    ('External HTTP endpoints', S['httpTargets'], 'register'),
    ('Connector entries outside artefacts', S['entriesOutsideArtefacts'], 'register'),
    ('… matched to a register row', S['entriesOutsideArtefactsMatchedToARow'], 'register'),
    ('Provisioning pages reconciled', S['provisioningPagesReconciled'], 'register'),
    ('… agreeing with the register', S['provisioningPagesAgreeing'], 'register'),
    ('Credentials masked', S['maskedCredentials'], 'register'),
]
put(sm, r, 2, 'Measure', F_HEAD, fill=FILL_HEAD)
put(sm, r, 3, 'Value', F_HEAD, CENTER, FILL_HEAD)
put(sm, r, 4, 'Basis', F_HEAD, CENTER, FILL_HEAD)
r += 1
for label, val, basis in heads:
    put(sm, r, 2, label, F_BODY)
    c = put(sm, r, 3, val, F_KPI if basis == 'formula' else Font(name=FONT, size=12, bold=True, color=INK), CENTER, fmt='#,##0')
    c.border = Border(left=Side(style='medium', color='2E6FD8'), right=THIN, top=THIN, bottom=THIN) if basis == 'formula' else BOX
    put(sm, r, 4, 'live formula' if basis == 'formula' else 'register total', F_NOTE, CENTER)
    if r % 2 == 0:
        for cc in (2, 4):
            sm.cell(row=r, column=cc).fill = FILL_TINT
    r += 1
r += 1
put(sm, r, 2, 'By connector', F_H2)
r += 1
for i, h in enumerate(['Connector', 'Calls', 'Share', 'Display names (evidenced)'], 2):
    put(sm, r, i, h, F_HEAD, CENTER if i in (3, 4) else None, FILL_HEAD)
r += 1
first_c = r
for c in R['connectors']:
    put(sm, r, 2, c['apiName'], Font(name='Consolas', size=10, color=INK))
    put(sm, r, 3, Formula(f'=COUNTIFS({rng("Connector")},B{r})'), F_BODY, CENTER, fmt='#,##0')
    put(sm, r, 4, Formula(f'=IF($C${first_c + len(R["connectors"])}=0,0,C{r}/$C${first_c + len(R["connectors"])})'), F_BODY, CENTER, fmt='0.00%')
    put(sm, r, 5, ', '.join(c['displayNamesEvidenced']) or '—', F_BODY)
    r += 1
put(sm, r, 2, 'Total', Font(name=FONT, size=10, bold=True), fill=FILL_TOTAL)
put(sm, r, 3, Formula(f'=SUM(C{first_c}:C{r - 1})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')
put(sm, r, 4, Formula(f'=SUM(D{first_c}:D{r - 1})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '0.00%')
put(sm, r, 5, None, fill=FILL_TOTAL)
sm.conditional_formatting.add(f'C{first_c}:C{r - 1}', ColorScaleRule(start_type='min', start_color='FFFFFF', end_type='max', end_color='7FA7E8'))
r += 2
put(sm, r, 2, 'By artefact family', F_H2)
r += 1
for i, h in enumerate(['Family', 'Calls', 'Artefacts'], 2):
    put(sm, r, i, h, F_HEAD, CENTER if i > 2 else None, FILL_HEAD)
r += 1
ff = r
for fam, n in S['artefactsByFamily'].items():
    put(sm, r, 2, fam, F_BODY)
    put(sm, r, 3, Formula(f'=COUNTIFS({rng("Family")},B{r})'), F_BODY, CENTER, fmt='#,##0')
    put(sm, r, 4, n, F_BODY, CENTER, fmt='#,##0')
    r += 1
put(sm, r, 2, 'Total', Font(name=FONT, size=10, bold=True), fill=FILL_TOTAL)
put(sm, r, 3, Formula(f'=SUM(C{ff}:C{r - 1})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')
put(sm, r, 4, Formula(f'=SUM(D{ff}:D{r - 1})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')


# ── Matrices ─────────────────────────────────────────────────────────────────────────────
def matrix(title, col_keys, col_labels, crit_col, note, tab):
    ws = wb.create_sheet(title)
    ws.sheet_properties.tabColor = tab
    ws.sheet_view.showGridLines = False
    put(ws, 1, 1, title, F_H2)
    put(ws, 2, 1, note, F_NOTE)
    hr = 4
    fixed = ['Flow', 'Families', 'Artefacts']
    for i, h in enumerate(fixed, 1):
        put(ws, hr, i, h, F_HEAD, Alignment(vertical='bottom', wrap_text=True), FILL_HEAD).border = BOX
    for j, lab in enumerate(col_labels):
        c = put(ws, hr, len(fixed) + 1 + j, lab, F_HEAD, ROTATED, FILL_HEAD)
        c.border = BOX
    tcol = len(fixed) + len(col_keys) + 1
    put(ws, hr, tcol, 'Total', F_HEAD, ROTATED, PatternFill('solid', fgColor='3A4A6B')).border = BOX
    ws.row_dimensions[hr].height = 190
    flows = R['flows']
    for i, f in enumerate(flows):
        rr = hr + 1 + i
        put(ws, rr, 1, f['flow'], F_BODY)
        put(ws, rr, 2, ', '.join(sorted({a['family'] for a in f['artefacts']})), Font(name=FONT, size=9, color=MUTED))
        put(ws, rr, 3, len(f['artefacts']), F_BODY, CENTER)
        for j, key in enumerate(col_keys):
            cc = len(fixed) + 1 + j
            L = get_column_letter(cc)
            ws.cell(row=hr, column=cc)
            # EXACT, not COUNTIFS and not "=": a flow is named "Repair the DGO_* governance lists"
            # (COUNTIFS reads * as a wildcard), and operations such as GetItems / getitems differ
            # only by case ("=" ignores case). Both would count rows that are not this cell's.
            put(ws, rr, cc, Formula(f'=SUMPRODUCT(EXACT({rng("Flow")},$A{rr})*EXACT({rng(crit_col)},{L}${hr + len(flows) + 3}))'), F_BODY, CENTER, fmt='#,##0;-#,##0;""')
            ws.cell(row=rr, column=cc).border = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
        put(ws, rr, tcol, Formula(f'=SUM({get_column_letter(len(fixed) + 1)}{rr}:{get_column_letter(tcol - 1)}{rr})'),
            Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')
    last = hr + len(flows)
    tr = last + 1
    put(ws, tr, 1, 'Total', Font(name=FONT, size=10, bold=True), fill=FILL_TOTAL)
    put(ws, tr, 2, None, fill=FILL_TOTAL)
    put(ws, tr, 3, Formula(f'=SUM(C{hr + 1}:C{last})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')
    for cc in range(len(fixed) + 1, tcol + 1):
        L = get_column_letter(cc)
        put(ws, tr, cc, Formula(f'=SUM({L}{hr + 1}:{L}{last})'), Font(name=FONT, size=10, bold=True), CENTER, FILL_TOTAL, '#,##0')
    # The exact criterion each column counts, kept visible under the table.
    kr = tr + 2
    put(ws, kr, 1, 'Column key (exact value counted)', F_NOTE)
    for j, key in enumerate(col_keys):
        put(ws, kr, len(fixed) + 1 + j, key, Font(name=FONT, size=8, color=MUTED), Alignment(text_rotation=90, vertical='top'))
    ws.row_dimensions[kr].height = 190
    ws.conditional_formatting.add(
        f'{get_column_letter(len(fixed) + 1)}{hr + 1}:{get_column_letter(tcol - 1)}{last}',
        ColorScaleRule(start_type='num', start_value=0, start_color='FFFFFF', mid_type='percentile', mid_value=60,
                       mid_color='C9D9F6', end_type='max', end_color='6E9BEA'))
    ws.column_dimensions['A'].width = 58
    ws.column_dimensions['B'].width = 30
    ws.column_dimensions['C'].width = 9
    for cc in range(len(fixed) + 1, tcol + 1):
        ws.column_dimensions[get_column_letter(cc)].width = 5.2
    ws.column_dimensions[get_column_letter(tcol)].width = 7
    ws.freeze_panes = ws.cell(row=hr + 1, column=len(fixed) + 1)
    ws.auto_filter.ref = f'A{hr}:{get_column_letter(tcol)}{last}'
    ws.sheet_view.zoomScale = 90


conn_keys = [c['apiName'] for c in R['connectors']]
matrix('Connector Matrix', conn_keys, conn_keys, 'Connector',
       'Rows: every flow label in the register. Columns: every connector. Each cell counts the Actions rows for that flow and connector '
       '(live exact-match formula). Blank = not used. Filter the Families column to one artefact family to see, e.g., only the live tenant.', 'C0392B')
op_keys = [f"{o['apiName']} · {o['operationId']}" for o in R['operations']]
matrix('Operation Matrix', op_keys, op_keys, 'Connector · Operation',
       'Rows: every flow label. Columns: every connector operation (connector · operation). Each cell counts the calls (live exact-match formula).', 'E67E22')

# ── Catalogues ───────────────────────────────────────────────────────────────────────────
L = lambda xs: '\n'.join(str(x) for x in xs) if xs else None  # noqa: E731
table_sheet('Connectors',
            ['Connector', 'Class', 'Display names (evidenced)', 'API ids', 'Reference keys', 'Connections', 'Accounts', 'Uses',
             'Uses in primary artefacts', 'Artefacts', 'Flows (count)', 'Families', 'Operations (calls)', 'Flows'],
            [[c['apiName'], ', '.join(c['connectorClass']), L(c['displayNamesEvidenced']), L(c['apiIds']), L(c['connectionReferenceKeys']),
              L(c['connectionResources']), L(c['connectionAccounts']), c['uses'], c['usesInPrimaryArtefacts'], c['artefacts'],
              len(c['flows']), L(c['families']), L([f'{k} × {v}' for k, v in c['operations'].items()]), L(c['flows'])]
             for c in R['connectors']],
            [28, 18, 24, 46, 28, 44, 30, 9, 11, 10, 9, 44, 46, 60],
            'Connector catalogue. Display names are only those the repository itself states (connection references, package manifests).',
            wrap=['Display names (evidenced)', 'API ids', 'Reference keys', 'Connections', 'Accounts', 'Families', 'Operations (calls)', 'Flows'],
            tab='2E6FD8')
table_sheet('Operations',
            ['Connector', 'Operation', 'Uses', 'Parameter keys (calls carrying it)', 'Reference keys', 'Flows (count)', 'Flows', 'Register rows'],
            [[o['apiName'], o['operationId'], o['uses'], L([f'{k} ({v})' for k, v in o['parameterKeys'].items()]),
              L(o['connectionReferenceKeys']), len(o['flows']), L(o['flows']), ', '.join(o['rows'])] for o in R['operations']],
            [26, 40, 8, 46, 30, 9, 60, 60], 'Every operation with every parameter key it is called with, and every row that calls it.',
            wrap=['Parameter keys (calls carrying it)', 'Reference keys', 'Flows', 'Register rows'], tab='2E6FD8')
table_sheet('Reference Keys',
            ['Connector', 'Reference key', 'Uses', 'Bound connections', 'Accounts', 'Operations', 'Flows (count)', 'Flows'],
            [[k['apiName'], k['key'], k['uses'], L(k['connectionResources']) or 'not declared in the artefact', L(k['accounts']),
              L(k['operations']), len(k['flows']), L(k['flows'])] for k in R['connectionReferenceKeys']],
            [26, 30, 8, 48, 30, 40, 9, 60], 'Each key an action names, and the tenant connection(s) behind it where an artefact declares one.',
            wrap=['Bound connections', 'Accounts', 'Operations', 'Flows'], tab='2E6FD8')
table_sheet('Connections',
            ['Connection', 'Connectors', 'Reference keys', 'Accounts', 'Display names', 'Bound to an action', 'Artefacts', 'Flows (count)', 'Flows'],
            [[c['connectionResource'], L(c['apiNames']), L(c['referenceKeys']), L(c['accounts']), L(c['displayNames']), c['boundToAnAction'],
              c['artefacts'], len(c['flows']), L(c['flows'])] for c in R['connections']],
            [50, 26, 28, 30, 24, 10, 10, 9, 60], 'Tenant connection resources named anywhere in the artefacts.',
            wrap=['Connectors', 'Reference keys', 'Accounts', 'Display names', 'Flows'], tab='2E6FD8')
pk_rows = []
for p in R['solutionPackages']:
    for c in p['connections']:
        pk_rows.append([p['packageName'], p['archive'], p['createdTime'], c.get('key'), c.get('apiDisplayName'), c.get('apiId'),
                        c.get('apiResourceId'), c.get('connectionResourceId'), c.get('connectionDisplayName'), c.get('connectionCreationType')])
table_sheet('Packages',
            ['Package', 'Archive', 'Created (UTC)', 'Key', 'API', 'API id', 'API resource', 'Connection resource', 'Connection account', 'Creation type'],
            pk_rows, [30, 70, 24, 30, 22, 50, 40, 40, 30, 20],
            'One row per connection each solution package maps (connectionsMap.json + apisMap.json + manifest.json).', tab='2E6FD8')
table_sheet('SharePoint Targets',
            ['Site', 'List / table', 'List title', 'Resolution', 'Uses', 'Operations', 'Flows (count)', 'Flows'],
            [[s['site'], s['list'], s['listTitle'], s['listResolution'], s['uses'], L(s['operations']), len(s['flows']), L(s['flows'])]
             for s in R['sharePointTargets']],
            [58, 40, 34, 32, 8, 26, 9, 60], 'Every SharePoint site and list the connector addresses. Titles resolved through sharepoint-list-index.json where possible.',
            wrap=['Operations', 'Flows'], tab='2E6FD8')
table_sheet('HTTP Endpoints',
            ['Method', 'URI', 'Header names', 'Uses', 'Flows', 'Register rows'],
            [[h['method'], h['target'], L(h['headerNames']), h['uses'], L(h['flows']), ', '.join(h['rows'])] for h in R['httpTargets']],
            [9, 80, 24, 8, 50, 40], 'Every external endpoint called by the built-in HTTP action. Header values are in Actions; credentials masked.',
            wrap=['Header names', 'Flows', 'Register rows'], tab='2E6FD8')
table_sheet('Flows',
            ['Flow', 'Artefacts (count)', 'Connector-bound rows', 'Connectors', 'Artefact ids', 'Families', 'Sources'],
            [[f['flow'], len(f['artefacts']), f['connectorRows'], L(f['connectors']), ', '.join(a['artefactId'] for a in f['artefacts']),
              L(sorted({a['family'] for a in f['artefacts']})), L([a['source'] for a in f['artefacts']])] for f in R['flows']],
            [56, 10, 11, 30, 30, 40, 90], 'Each flow label in the register and every artefact that carries it.',
            wrap=['Connectors', 'Families', 'Sources'], tab='16A085')
table_sheet('Artefacts',
            ['Artefact', 'Flow', 'Family', 'Derived', 'Shape', 'Source', 'Key path', 'Object index', 'Display name', 'Internal name',
             'Workflow id', 'Environment', 'Exported / captured (UTC)', 'Flow API id', 'Node id', 'Actions + triggers walked',
             'Connector-bound rows', 'Type inventory', 'Connection references declared', 'Definition SHA-256/16', 'Capture copies check'],
            [[a['artefactId'], a['flow'], a['family'], a['derived'], a['shape'], a['source'], a.get('keyPathInObject'), a['objectIndexInSource'],
              a['displayName'], a['internalName'], a['workflowId'], a['environment'], a['exportedAtUtc'], a['flowApiId'], a['nodeId'],
              a['totalEntries'], a['connectorRows'], L([f'{k} {v}' for k, v in sorted(a['typeInventory'].items())]),
              len(a['connectionReferences']), a['definitionSha256'], J(a.get('duplicateCopiesInSource'))] for a in R['artefacts']],
            [10, 44, 30, 8, 26, 80, 22, 8, 36, 38, 34, 40, 22, 40, 26, 10, 10, 28, 10, 18, 50],
            'Every definition, package, scope or fragment read. Type inventory lists every action type walked, not only connector-bound ones.',
            wrap=['Type inventory'], tab='16A085')

# ── Actions ──────────────────────────────────────────────────────────────────────────────
widths = {'Row': 11, 'Artefact': 9, 'Flow': 40, 'Family': 26, 'Derived': 8, 'Source': 60, 'Role': 12, 'Path': 60, 'Action name': 34,
          'Type': 18, 'Kind': 9, 'Connector class': 16, 'Connector': 26, 'Connector · Operation': 38, 'API id': 50,
          'Connector provenance': 24, 'Connection reference': 26, 'Reference form': 22, 'Connection': 40, 'Connection provenance': 34,
          'Connection account': 26, 'Operation': 26, 'Method': 8, 'Target': 60, 'SharePoint site': 50, 'SharePoint list / table': 38,
          'SharePoint list title': 30, 'List resolution': 26, 'Parameters (JSON)': 80}
table_sheet('Actions', ACT_HEAD, act_rows, [widths.get(h, 40) for h in ACT_HEAD],
            'THE REGISTER - one row per connector-bound action or trigger. JSON columns hold values exactly as the source carries them '
            '(credentials masked). Every count in this workbook is taken from this sheet.', tab='C0392B')


# ── Parameters, one per row ──────────────────────────────────────────────────────────────
def flat(v, p=''):
    if isinstance(v, dict) and v:
        for k, x in v.items():
            yield from flat(x, f'{p}.{k}' if p else k)
    else:
        yield p, v


par_rows = []
for a in A:
    for k, v in flat(a['parameters'] or {}):
        par_rows.append([a['rowId'], a['flow'], a['apiName'], a['operationId'], a['path'], k or '(whole value)',
                         v if isinstance(v, str) else J(v), type(v).__name__ if v is not None else 'null'])
table_sheet('Parameters', ['Row', 'Flow', 'Connector', 'Operation', 'Action path', 'Parameter', 'Value', 'Value type'], par_rows,
            [11, 40, 26, 30, 60, 38, 90, 10],
            'Every configured parameter of every connector-bound action, one per row (nested objects flattened to dotted keys; arrays kept whole as JSON).',
            tab='C0392B')

# ── Declarations, coverage, integrity ────────────────────────────────────────────────────
dec_rows = []
for a in R['artefacts']:
    for c in a['connectionReferences']:
        dec_rows.append([a['artefactId'], a['flow'], a['family'], c.get('key'), c.get('apiName'), c.get('apiId'), c.get('connectionName'),
                         c.get('displayName'), c.get('connectionAccount'), c.get('source'), c.get('tier'), c.get('runtimeSource'), c.get('declaredIn')])
table_sheet('Connection Declarations',
            ['Artefact', 'Flow', 'Family', 'Key', 'Connector', 'API id', 'Connection', 'Display name', 'Account', 'Source', 'Tier',
             'Runtime source', 'Declared at'], dec_rows, [9, 40, 28, 28, 26, 50, 44, 22, 26, 10, 12, 12, 60],
            'Every connection reference every artefact declares (connectionReferences, connection_references, $connections).', tab='7F8C8D')
table_sheet('Sources', ['Source', 'Parsed as', 'Artefacts', 'Family', 'Note'],
            [[s['source'], s['parsed'], s['artefacts'], s.get('family'), s.get('note')] for s in R['sources']],
            [110, 26, 9, 34, 70], 'Every tracked file or archive member carrying a connector marker or an action map, and what it yielded.', tab='7F8C8D')
table_sheet('Token Index', ['Token', 'Occurrences', 'Files', 'Classification'],
            [[t['token'], t['occurrences'], t['files'], t['classification']] for t in R['mentionTokens']],
            [40, 12, 8, 90], 'Every connector token found anywhere in the repository and what it is.', tab='7F8C8D')
table_sheet('Mentions', ['Source', 'Token', 'Occurrences', 'Holds a parsed artefact'],
            [[m['source'], k, n, m['holdsArtefact']] for m in R['mentions'] for k, n in sorted(m['tokens'].items())],
            [110, 40, 12, 12], 'Every file (and archive member) mentioning a connector token, one token per row.', tab='7F8C8D')
table_sheet('Reconciliation', ['Page', 'Source package', 'Package in register', 'Bindings compared', 'Agrees', 'Differences (binding: page / register)'],
            [[x['page'], x['sourcePackage'], x['sourceInRegister'], x['bindingsCompared'], x['agrees'],
              L([f"{d['binding']}: {d['page']} / {d['register']}" for d in x['differences']])] for x in R['reconciliation']],
            [70, 90, 10, 10, 8, 70], 'Each generated provisioning page compared with the register, binding by binding.',
            wrap=['Differences (binding: page / register)'], tab='7F8C8D')
table_sheet('Cross-Check', ['Source', 'Entries', 'Matched to a row', 'Unmatched (key path · name · type · operation)'],
            [[b['source'], b['entries'], b['matched'], L([f"{u['keyPath']} · {u['name']} · {u['type']} · {u['operationId']}" for u in b['unmatched']])]
             for b in R['entriesOutsideArtefacts']],
            [100, 9, 10, 80], 'Connector entries outside every artefact (derived catalogues, capture copies), each matched to a register row.',
            wrap=['Unmatched (key path · name · type · operation)'], table_name='CrossCheck', tab='7F8C8D')
table_sheet('Maskings', ['Location', 'Kind', 'Fingerprint'], [[m['where'], m['kind'], m['fingerprint']] for m in R['maskings']],
            [70, 28, 14], 'Every credential masked. Fingerprint = first 8 hex of SHA-256 of the credential; the credential itself is not reproduced.',
            tab='7F8C8D')

wb.active = 0
for ws in wb.worksheets:
    ws.sheet_view.tabSelected = ws.title == 'Cover'
wb.properties.title = 'Connector & Connection Register'
wb.properties.subject = f'Built from connector-register.json sha256 {SRC_SHA}'
wb.save(OUT)
print(f'wrote {OUT.relative_to(ROOT)} - {len(wb.sheetnames)} sheets, {N} action rows, {len(par_rows)} parameter rows')
