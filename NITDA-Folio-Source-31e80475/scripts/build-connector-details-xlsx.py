#!/usr/bin/env python3
"""
Connector details: every fact the register holds about each connector, one value per cell.

The master workbook (CONNECTOR_REGISTER.xlsx) carries one Connectors row per connector, with keys,
connections, accounts and operations stacked inside single cells. This workbook takes the same
facts apart into normalised tables - one row per connector, per reference key, per connection,
per account, per operation, per operation parameter, per connector-flow pairing and per
connector-bound call - and adds matrices over them. Everything is read from
docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json; nothing is read from anywhere else.

Counts that can be recomputed from the Bindings sheet are live formulas, so a filtered or
corrected row moves every total. Distinct counts the register computed (artefacts, flows) are
carried as the register's own figures and labelled so.

Usage:
    python3 scripts/build-connector-details-xlsx.py      (needs openpyxl)
    python3 <xlsx skill>/scripts/recalc.py docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_DETAILS.xlsx
"""
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from openpyxl import Workbook
from openpyxl.formatting.rule import ColorScaleRule, DataBarRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json'
OUT = ROOT / 'docs/folio-Master-Flows-and-Endpoints/reference/connector/CONNECTOR_DETAILS.xlsx'
CELL_LIMIT = 32767

raw = SRC.read_bytes()
SRC_SHA = hashlib.sha256(raw).hexdigest()
R = json.loads(raw)
A = R['actions']
ART = {a['artefactId']: a for a in R['artefacts']}

# ── style ────────────────────────────────────────────────────────────────────────────────
FONT = 'Arial'
NAVY, INK, MUTED, RULE, TINT = '1F2A44', '1F1F1F', '5B6475', 'C9CFDA', 'EEF2F8'
F_BODY = Font(name=FONT, size=10, color=INK)
F_BOLD = Font(name=FONT, size=10, bold=True, color=INK)
F_MONO = Font(name='Consolas', size=10, color=INK)
F_HEAD = Font(name=FONT, size=10, bold=True, color='FFFFFF')
F_TITLE = Font(name=FONT, size=20, bold=True, color=NAVY)
F_SUB = Font(name=FONT, size=11, color=MUTED)
F_H2 = Font(name=FONT, size=13, bold=True, color=NAVY)
F_LINK = Font(name=FONT, size=10, color='1F4FB4', underline='single')
F_NOTE = Font(name=FONT, size=9, italic=True, color=MUTED)
FILL_HEAD = PatternFill('solid', fgColor=NAVY)
FILL_SUBHEAD = PatternFill('solid', fgColor='3A4A6B')
FILL_TINT = PatternFill('solid', fgColor=TINT)
FILL_TOTAL = PatternFill('solid', fgColor='DDE3EE')
CLASS_FILL = {
    'managed connector': PatternFill('solid', fgColor='E3ECFB'),
    'built-in response': PatternFill('solid', fgColor='EAF5EC'),
    'built-in trigger': PatternFill('solid', fgColor='FFF4E0'),
    'built-in HTTP': PatternFill('solid', fgColor='FBE9E7'),
}
THIN = Side(style='thin', color=RULE)
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOP = Alignment(vertical='top')
WRAP_TOP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center')
RIGHT = Alignment(horizontal='right', vertical='top')
ROTATED = Alignment(text_rotation=90, horizontal='center', vertical='bottom', wrap_text=True)
ILLEGAL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')

DISPLAY = {c['apiName']: (', '.join(c['displayNamesEvidenced']) or None) for c in R['connectors']}
BUILTIN_NAME = {
    'builtin:response': 'HTTP Response (built-in)',
    'builtin:request': 'Request trigger (built-in)',
    'builtin:http': 'HTTP action (built-in)',
    'builtin:recurrence': 'Recurrence schedule (built-in)',
    '(connector not declared)': 'No connector declared',
}
PURPOSE = {
    'shared_sharepointonline': 'Reads and writes SharePoint list items, files and attachments; raw REST calls via HttpRequest.',
    'shared_office365': 'Sends, reads and fetches mail and attachments through Outlook; raw Graph calls via HttpRequest.',
    'shared_flowmanagement': 'Reads flow definitions, owners and trigger callback URLs (flow telemetry and endpoint harvesting).',
    'shared_onedriveforbusiness': 'Watches a folder for new files, copies, moves/renames and shares them.',
    'shared_office365users': 'Looks up directory users (SearchUserV2).',
    'shared_adobepdftools': 'Extracts JSON, images and tables from PDF documents.',
    'shared_sendmail': 'Sends mail through the Mail connector (SendEmailV3).',
    'builtin:response': 'Returns the HTTP reply of a request-triggered flow.',
    'builtin:request': 'Starts a flow from an HTTP call, a button or Power Apps.',
    'builtin:http': 'Calls an external HTTP endpoint (AI model APIs).',
    'builtin:recurrence': 'Starts a flow on a schedule.',
    '(connector not declared)': 'Two actions whose connector the file does not declare (SharePoint-shaped paths).',
}
# The purpose line is a plain-language gloss of the operations each connector is SEEN calling in
# the register (see Operations); it is labelled as such on the sheet.


def name_of(api):
    return DISPLAY.get(api) or BUILTIN_NAME.get(api) or 'Not stated in the repository'


def J(v):
    return None if v is None else json.dumps(v, ensure_ascii=False, separators=(', ', ': '))


class Formula(str):
    """A formula this workbook computes. Every other string is register data."""


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


def put(ws, row, col, v, font=F_BODY, align=None, fill=None, fmt=None, border=None):
    c = ws.cell(row=row, column=col)
    if isinstance(v, Formula):
        c.value = str(v)
    else:
        val = cellval(v)
        c.value = val
        if isinstance(val, str) and val.startswith('='):
            c.data_type = 's'
    c.font = font
    if align:
        c.alignment = align
    if fill:
        c.fill = fill
    if fmt:
        c.number_format = fmt
    if border:
        c.border = border
    return c


wb = Workbook()
wb.remove(wb.active)
TABLES = {}


def header_block(ws, title, note, width_cols):
    put(ws, 1, 1, title, F_H2)
    put(ws, 2, 1, note, F_NOTE, Alignment(wrap_text=True, vertical='top'))
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(4, width_cols))
    ws.row_dimensions[2].height = 34


def table_sheet(title, headers, rows, widths, note, wrap=(), mono=(), num=(), tab=None, class_col=None, databar=None):
    """One Excel Table per sheet: filterable, banded, header and first column frozen."""
    ws = wb.create_sheet(title)
    if tab:
        ws.sheet_properties.tabColor = tab
    header_block(ws, title, note, len(headers))
    hr = 4
    for i, h in enumerate(headers, 1):
        put(ws, hr, i, h, F_HEAD, Alignment(wrap_text=True, vertical='center'), FILL_HEAD, border=BOX)
    wrap, mono, num = set(wrap), set(mono), set(num)
    for r, row in enumerate(rows, hr + 1):
        for i, v in enumerate(row, 1):
            h = headers[i - 1]
            put(ws, r, i, v, F_MONO if h in mono else F_BODY,
                WRAP_TOP if h in wrap else (RIGHT if h in num else TOP),
                fmt='#,##0' if h in num else None)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[hr].height = 34
    ws.freeze_panes = ws.cell(row=hr + 1, column=2)
    last = hr + max(1, len(rows))
    name = re.sub(r'[^A-Za-z0-9]', '', title)
    t = Table(displayName=name, ref=f'A{hr}:{get_column_letter(len(headers))}{last}')
    t.tableStyleInfo = TableStyleInfo(name='TableStyleMedium2', showRowStripes=True)
    ws.add_table(t)
    if databar and rows:
        L = get_column_letter(headers.index(databar) + 1)
        ws.conditional_formatting.add(f'{L}{hr + 1}:{L}{last}', DataBarRule(start_type='num', start_value=0, end_type='max', color='7FA7E8'))
    TABLES[title] = {'hr': hr, 'last': last, 'col': {h: get_column_letter(i) for i, h in enumerate(headers, 1)}}
    ws.sheet_view.zoomScale = 90
    return ws


def ref(sheet, header):
    t = TABLES[sheet]
    return f"'{sheet}'!${t['col'][header]}${t['hr'] + 1}:${t['col'][header]}${t['last']}"


CONNECTORS = R['connectors']
ORDER = sorted(CONNECTORS, key=lambda c: (-c['uses'], c['apiName']))
APIS = [c['apiName'] for c in ORDER]
FAMILIES = list(R['summary']['artefactsByFamily'].keys())

# ── Bindings (the base every formula counts) ─────────────────────────────────────────────
bind_head = ['Row', 'Connector', 'Connector name', 'Class', 'Operation', 'Reference key', 'Connection', 'Connection provenance',
             'Account', 'Flow', 'Artefact', 'Family', 'Derived', 'Role', 'Type', 'Action path', 'Method', 'Target',
             'SharePoint site', 'SharePoint list', 'Parameters (JSON)', 'Source']
bind_rows = [[a['rowId'], a['apiName'], name_of(a['apiName']), a['connectorClass'], a['operationId'], a['connectionReference'],
              a['connectionResource'], a.get('connectionResourceProvenance'), a.get('connectionAccount'), a['flow'], a['artefactId'],
              ART[a['artefactId']]['family'], ART[a['artefactId']]['derived'], a['role'], a['type'], a['path'], a['method'],
              a['target'], (a.get('sharePoint') or {}).get('site'), (a.get('sharePoint') or {}).get('listTitle') or (a.get('sharePoint') or {}).get('table'),
              a['parameters'], a['source']] for a in sorted(A, key=lambda a: (APIS.index(a['apiName']), a['rowId']))]

# ── derived normalised facts, all from the register ──────────────────────────────────────
by_api = defaultdict(list)
for a in A:
    by_api[a['apiName']].append(a)

key_rows = []
for k in R['connectionReferenceKeys']:
    rows = [a for a in by_api[k['apiName']] if a['connectionReference'] == k['key']]
    key_rows.append([k['apiName'], name_of(k['apiName']), k['key'] or '(none named)', k['uses'], len(k['connectionResources']),
                     '; '.join(k['connectionResources']) or 'Not declared in any artefact', '; '.join(k['accounts']) or None,
                     len(k['operations']), '; '.join(k['operations']), len(k['flows']), len({a['artefactId'] for a in rows})])
key_rows.sort(key=lambda r: (APIS.index(r[0]), r[2]))

conn_rows = []
for c in R['connections']:
    for api in c['apiNames']:
        calls = sum(1 for a in by_api[api] if a['connectionResource'] == c['connectionResource'])
        conn_rows.append([api, name_of(api), c['connectionResource'], '; '.join(c['referenceKeys']) or None,
                          '; '.join(c['accounts']) or None, '; '.join(c['displayNames']) or None,
                          'Bound to actions' if c['boundToAnAction'] else 'Declared only', calls, c['artefacts'], len(c['flows'])])
conn_rows.sort(key=lambda r: (APIS.index(r[0]), r[2]))

LABELS = re.compile(r'^(SharePoint connection|Office 365 Outlook connection|Adobe PDF Services)')
acc = defaultdict(lambda: {'conns': set(), 'calls': 0})
for c in R['connections']:
    for api in c['apiNames']:
        for ac in c['accounts']:
            acc[(api, ac)]['conns'].add(c['connectionResource'])
for a in A:
    if a.get('connectionAccount'):
        acc[(a['apiName'], a['connectionAccount'])]['calls'] += 1
        if a['connectionResource']:
            acc[(a['apiName'], a['connectionAccount'])]['conns'].add(a['connectionResource'])
acct_rows = sorted([[api, name_of(api), ac,
                     'Package / placeholder label' if LABELS.match(ac) else 'Signed-in account or service identity',
                     len(v['conns']), '; '.join(sorted(v['conns'])), v['calls']] for (api, ac), v in acc.items()],
                   key=lambda r: (APIS.index(r[0]), r[2]))

op_rows, opp_rows = [], []
for o in R['operations']:
    rows = [a for a in by_api[o['apiName']] if a['operationId'] == o['operationId']]
    op_rows.append([o['apiName'], name_of(o['apiName']), o['operationId'], o['uses'],
                    sum(1 for a in rows if not ART[a['artefactId']]['derived']), len(o['flows']),
                    len(o['connectionReferenceKeys']), '; '.join(o['connectionReferenceKeys']) or None, len(o['parameterKeys'])])
    for pk, n in o['parameterKeys'].items():
        opp_rows.append([o['apiName'], name_of(o['apiName']), o['operationId'], pk, n, o['uses'], n / o['uses'] if o['uses'] else 0])
op_rows.sort(key=lambda r: (APIS.index(r[0]), -r[3], r[2]))
opp_rows.sort(key=lambda r: (APIS.index(r[0]), r[2], -r[4], r[3]))

cf = defaultdict(list)
for a in A:
    cf[(a['apiName'], a['flow'])].append(a)
cflow_rows = []
for (api, flow), rows in cf.items():
    cflow_rows.append([api, name_of(api), flow, len(rows), len({a['operationId'] for a in rows}),
                       '; '.join(sorted({str(a['operationId']) for a in rows})), '; '.join(sorted({a['connectionReference'] for a in rows if a['connectionReference']})) or None,
                       '; '.join(sorted({a['connectionResource'] for a in rows if a['connectionResource']})) or None,
                       len({a['artefactId'] for a in rows}), '; '.join(sorted({ART[a['artefactId']]['family'] for a in rows}))])
cflow_rows.sort(key=lambda r: (APIS.index(r[0]), -r[3], r[2].lower()))

status = Counter(a['operationId'] for a in by_api['builtin:response'])
status_rows = []
MEAN = {'200': 'OK', '400': 'Bad request', '401': 'Unauthorised', '403': 'Forbidden', '404': 'Not found', '409': 'Conflict',
        '410': 'Gone', '413': 'Payload too large', '422': 'Unprocessable entity', '429': 'Too many requests', '500': 'Server error',
        '502': 'Bad gateway', '503': 'Service unavailable'}
for op, n in status.items():
    code = op.replace('Response', '', 1).strip()
    fixed = code in MEAN
    status_rows.append([op, code if fixed else None, MEAN.get(code, 'Set at run time by an expression'),
                        'Fixed' if fixed else 'Run time', None if fixed else code, n,
                        len({a['flow'] for a in by_api['builtin:response'] if a['operationId'] == op}),
                        'Possible misspelling of varStatusCode - verify the flow returns the intended status' if 'varStatusCorde' in op else None])
status_rows.sort(key=lambda r: (r[3] != 'Fixed', r[1] or '', -r[5]))

http_rows = [[h['method'], h['target'], (re.match(r'https?://([^/]+)', h['target'] or '') or [None, '(built at run time)'])[1],
              h['uses'], '; '.join(h['headerNames']), len(h['flows']), '; '.join(h['flows']), ', '.join(h['rows'])] for h in R['httpTargets']]

# ── Cover ────────────────────────────────────────────────────────────────────────────────
cov = wb.create_sheet('Cover')
cov.sheet_properties.tabColor = NAVY
cov.sheet_view.showGridLines = False
for col, w in (('A', 3), ('B', 36), ('C', 112)):
    cov.column_dimensions[col].width = w
put(cov, 2, 2, 'Connector Details', F_TITLE)
put(cov, 3, 2, 'Every connector in the connector register, taken apart into one value per cell', F_SUB)
S = R['summary']
meta = [
    ('Built from', 'docs/folio-Master-Flows-and-Endpoints/reference/connector/connector-register.json (the register of record)'),
    ('Source fingerprint (SHA-256)', SRC_SHA),
    ('Built by', 'scripts/build-connector-details-xlsx.py (npm run connectors:details)'),
    ('Connectors', len(CONNECTORS)),
    ('Connector-bound calls', len(A)),
    ('Companion files', 'CONNECTOR_REGISTER.xlsx (master workbook) · CONNECTOR_DETAILS_MATRIX.html (interactive matrix) · CONNECTOR_REGISTER.md'),
    ('Credentials', 'Masked in the register as [MASKED:<kind>#<fingerprint>]; nothing else is altered.'),
    ('Completeness', 'Every connector, key, connection, account, operation, parameter key, flow pairing and call in the register is present. Nothing is sampled or truncated.'),
]
r = 5
for k, v in meta:
    put(cov, r, 2, k, Font(name=FONT, size=10, bold=True, color=MUTED), TOP)
    put(cov, r, 3, v, F_MONO if k.startswith('Source') else F_BODY, Alignment(wrap_text=True, vertical='top', horizontal='left'),
        fmt='#,##0' if isinstance(v, int) else None)
    r += 1
r += 1
put(cov, r, 2, 'Sheets', F_H2)
r += 1
GUIDE = [
    ('Connector Profiles', 'One row per connector: identity, class, purpose and every headline count.'),
    ('Connector x Family', 'Matrix: calls per connector in each artefact family.'),
    ('Flow x Connector', 'Matrix: calls per connector in every flow.'),
    ('Reference Keys', 'One row per connection reference key, with the connections it is bound to.'),
    ('Connections', 'One row per tenant connection, with its keys, accounts and usage.'),
    ('Accounts', 'One row per account or package label each connector signs in with.'),
    ('Operations', 'One row per connector operation.'),
    ('Operation Parameters', 'One row per parameter key each operation is called with, and how often.'),
    ('Connector Flows', 'One row per connector-flow pairing: calls, operations, keys, connections.'),
    ('Response Status Codes', 'HTTP Response connector: every status code returned.'),
    ('HTTP Endpoints', 'HTTP action connector: every external endpoint called.'),
    ('Bindings', 'Every connector-bound call (the base the formulas count), with its full parameters.'),
]
for n, what in GUIDE:
    put(cov, r, 2, Formula(f'=HYPERLINK("#\'{n}\'!A1","{n}")'), F_LINK)
    put(cov, r, 3, what, F_BODY)
    r += 1
r += 1
put(cov, r, 2, 'Legend', F_H2)
r += 1
for cls, fill in CLASS_FILL.items():
    put(cov, r, 2, cls, F_BODY, fill=fill, border=BOX)
    put(cov, r, 3, {'managed connector': 'A connector that needs a connection (a signed-in account).',
                    'built-in response': 'Replies to the caller of a request-triggered flow. No connection.',
                    'built-in trigger': 'Starts the flow (HTTP request, button, Power Apps, schedule). No connection.',
                    'built-in HTTP': 'Calls an external URL directly. No connection; credentials travel in headers.'}[cls], F_BODY)
    r += 1
put(cov, r, 2, 'Blue-edged figures', F_BODY, border=Border(left=Side(style='medium', color='2E6FD8'), right=THIN, top=THIN, bottom=THIN))
put(cov, r, 3, 'Live formulas over the Bindings sheet. Other figures are the register\'s own totals.', F_BODY)

# ── Connector Profiles ───────────────────────────────────────────────────────────────────
prof = wb.create_sheet('Connector Profiles')
prof.sheet_properties.tabColor = '2E6FD8'
prof_head = ['No.', 'Connector', 'Display name', 'Class', 'API id', 'Purpose (from the operations it is seen calling)',
             'Calls', 'Calls in primary artefacts', 'Share of all calls', 'Artefacts', 'Flows', 'Reference keys', 'Connections',
             'Accounts / labels', 'Operations', 'Artefact families']
header_block(prof, 'Connector Profiles',
             'One row per connector in the register. Calls, share, keys, connections, accounts and operations are live formulas '
             '(blue edge); artefacts and flows are the register\'s distinct counts. Rows are ordered by calls.', len(prof_head))
# Bindings is written later; its ranges are fixed now so formulas can reference it.
B_HR, B_LAST = 4, 4 + len(bind_rows)
BCOL = {h: get_column_letter(i) for i, h in enumerate(bind_head, 1)}
brng = lambda h: f"Bindings!${BCOL[h]}${B_HR + 1}:${BCOL[h]}${B_LAST}"  # noqa: E731
hr = 4
for i, h in enumerate(prof_head, 1):
    put(prof, hr, i, h, F_HEAD, Alignment(wrap_text=True, vertical='center', horizontal='center' if i > 6 else None), FILL_HEAD, border=BOX)
prof.row_dimensions[hr].height = 46
LIVE = Border(left=Side(style='medium', color='2E6FD8'), right=THIN, top=THIN, bottom=THIN)
first = hr + 1
lastp = hr + len(ORDER)
fams = {c['apiName']: len(c['families']) for c in CONNECTORS}
for i, c in enumerate(ORDER):
    rr = first + i
    fill = CLASS_FILL.get(c['connectorClass'][0])
    put(prof, rr, 1, i + 1, F_BODY, CENTER, border=BOX)
    put(prof, rr, 2, c['apiName'], Font(name='Consolas', size=10, bold=True, color=INK), TOP, fill, border=BOX)
    put(prof, rr, 3, name_of(c['apiName']), F_BOLD, WRAP_TOP, border=BOX)
    put(prof, rr, 4, ', '.join(c['connectorClass']), F_BODY, WRAP_TOP, fill, border=BOX)
    put(prof, rr, 5, '; '.join(c['apiIds']) or 'None (built-in or undeclared)', F_MONO if c['apiIds'] else F_NOTE, WRAP_TOP, border=BOX)
    put(prof, rr, 6, PURPOSE.get(c['apiName']), F_BODY, WRAP_TOP, border=BOX)
    put(prof, rr, 7, Formula(f'=COUNTIFS({brng("Connector")},$B{rr})'), Font(name=FONT, size=11, bold=True, color=NAVY), CENTER, fmt='#,##0', border=LIVE)
    put(prof, rr, 8, Formula(f'=COUNTIFS({brng("Connector")},$B{rr},{brng("Derived")},"no")'), F_BODY, CENTER, fmt='#,##0', border=LIVE)
    put(prof, rr, 9, Formula(f'=IF(SUM($G${first}:$G${lastp})=0,0,G{rr}/SUM($G${first}:$G${lastp}))'), F_BODY, CENTER, fmt='0.00%', border=LIVE)
    put(prof, rr, 10, c['artefacts'], F_BODY, CENTER, fmt='#,##0', border=BOX)
    put(prof, rr, 11, len(c['flows']), F_BODY, CENTER, fmt='#,##0', border=BOX)
    put(prof, rr, 12, Formula(f"=COUNTIFS('Reference Keys'!$A:$A,$B{rr})"), F_BODY, CENTER, border=LIVE)
    put(prof, rr, 13, Formula(f"=COUNTIFS(Connections!$A:$A,$B{rr})"), F_BODY, CENTER, border=LIVE)
    put(prof, rr, 14, Formula(f"=COUNTIFS(Accounts!$A:$A,$B{rr})"), F_BODY, CENTER, border=LIVE)
    put(prof, rr, 15, Formula(f"=COUNTIFS(Operations!$A:$A,$B{rr})"), F_BODY, CENTER, border=LIVE)
    put(prof, rr, 16, fams[c['apiName']], F_BODY, CENTER, border=BOX)
    prof.row_dimensions[rr].height = 44
tr = lastp + 1
put(prof, tr, 2, 'Total', F_BOLD, fill=FILL_TOTAL)
for cc in range(1, 17):
    prof.cell(row=tr, column=cc).fill = FILL_TOTAL
    prof.cell(row=tr, column=cc).border = BOX
for cc, fmt in ((7, '#,##0'), (8, '#,##0'), (9, '0.00%'), (12, '#,##0'), (13, '#,##0'), (14, '#,##0'), (15, '#,##0')):
    L = get_column_letter(cc)
    put(prof, tr, cc, Formula(f'=SUM({L}{first}:{L}{lastp})'), F_BOLD, CENTER, FILL_TOTAL, fmt, BOX)
put(prof, tr + 2, 2, 'Artefacts, flows and families are distinct counts taken from the register; a flow using several connectors is counted under each, so those columns are not summed.', F_NOTE)
prof.conditional_formatting.add(f'G{first}:G{lastp}', DataBarRule(start_type='num', start_value=0, end_type='max', color='7FA7E8'))
for i, w in enumerate([6, 28, 26, 18, 50, 52, 10, 11, 10, 10, 8, 10, 12, 11, 11, 10], 1):
    prof.column_dimensions[get_column_letter(i)].width = w
prof.freeze_panes = 'C5'
prof.sheet_view.zoomScale = 90


# ── Matrices ─────────────────────────────────────────────────────────────────────────────
def matrix(title, row_keys, row_col, col_keys, col_labels, col_col, note, tab, row_label, row_width=46, exact=False):
    ws = wb.create_sheet(title)
    ws.sheet_properties.tabColor = tab
    ws.sheet_view.showGridLines = False
    header_block(ws, title, note, 8)
    hr = 4
    put(ws, hr, 1, row_label, F_HEAD, Alignment(vertical='bottom', wrap_text=True), FILL_HEAD, border=BOX)
    for j, lab in enumerate(col_labels):
        put(ws, hr, 2 + j, lab, F_HEAD, ROTATED, FILL_HEAD, border=BOX)
    tcol = 2 + len(col_keys)
    put(ws, hr, tcol, 'Total', F_HEAD, ROTATED, FILL_SUBHEAD, border=BOX)
    ws.row_dimensions[hr].height = 200
    keyrow = hr + len(row_keys) + 3
    for i, rk in enumerate(row_keys):
        rr = hr + 1 + i
        put(ws, rr, 1, rk, F_MONO if row_col == 'Connector' else F_BODY, TOP, border=BOX)
        for j in range(len(col_keys)):
            cc = 2 + j
            L = get_column_letter(cc)
            f = (f'=SUMPRODUCT(EXACT({brng(row_col)},$A{rr})*EXACT({brng(col_col)},{L}${keyrow}))' if exact
                 else f'=COUNTIFS({brng(row_col)},$A{rr},{brng(col_col)},{L}${keyrow})')
            put(ws, rr, cc, Formula(f), F_BODY, CENTER, fmt='#,##0;-#,##0;""', border=BOX)
        put(ws, rr, tcol, Formula(f'=SUM(B{rr}:{get_column_letter(tcol - 1)}{rr})'), F_BOLD, CENTER, FILL_TOTAL, '#,##0', BOX)
    last = hr + len(row_keys)
    put(ws, last + 1, 1, 'Total', F_BOLD, fill=FILL_TOTAL, border=BOX)
    for cc in range(2, tcol + 1):
        L = get_column_letter(cc)
        put(ws, last + 1, cc, Formula(f'=SUM({L}{hr + 1}:{L}{last})'), F_BOLD, CENTER, FILL_TOTAL, '#,##0', BOX)
    put(ws, keyrow, 1, 'Column key (exact value counted)', F_NOTE)
    for j, k in enumerate(col_keys):
        put(ws, keyrow, 2 + j, k, Font(name=FONT, size=8, color=MUTED), Alignment(text_rotation=90, vertical='top'))
    ws.row_dimensions[keyrow].height = 200
    ws.conditional_formatting.add(f'B{hr + 1}:{get_column_letter(tcol - 1)}{last}',
                                  ColorScaleRule(start_type='num', start_value=0, start_color='FFFFFF', mid_type='percentile', mid_value=60,
                                                 mid_color='C9D9F6', end_type='max', end_color='6E9BEA'))
    ws.column_dimensions['A'].width = row_width
    for cc in range(2, tcol + 1):
        ws.column_dimensions[get_column_letter(cc)].width = 6.5
    ws.column_dimensions[get_column_letter(tcol)].width = 8
    ws.freeze_panes = 'B5'
    ws.sheet_view.zoomScale = 90


matrix('Connector x Family', APIS, 'Connector', FAMILIES, FAMILIES, 'Family',
       'Rows: every connector. Columns: every artefact family in the register. Each cell counts the calls in Bindings (live formula). '
       'Blank = not used in that family.', 'C0392B', 'Connector', 30)
flow_names = sorted({a['flow'] for a in A}, key=str.lower)
matrix('Flow x Connector', flow_names, 'Flow', APIS, [f'{a}  ·  {name_of(a)}' for a in APIS], 'Connector',
       'Rows: every flow with a connector-bound call. Columns: every connector. Each cell counts that flow\'s calls to that connector '
       '(live exact-match formula - one flow name contains "*", which COUNTIFS would treat as a wildcard).', 'E67E22', 'Flow', 58, exact=True)

# ── Normalised tables ────────────────────────────────────────────────────────────────────
table_sheet('Reference Keys', ['Connector', 'Connector name', 'Reference key', 'Calls', 'Connections bound', 'Connection(s)', 'Account(s)',
                               'Operations', 'Operation list', 'Flows', 'Artefacts'], key_rows,
            [28, 26, 32, 9, 11, 58, 32, 11, 50, 8, 10],
            'One row per connection reference key an action names. "Not declared" means no artefact states which tenant connection the key is bound to.',
            wrap=['Connection(s)', 'Operation list', 'Account(s)'], mono=['Connector', 'Reference key', 'Connection(s)'],
            num=['Calls', 'Connections bound', 'Operations', 'Flows', 'Artefacts'], tab='2E6FD8', databar='Calls')
table_sheet('Connections', ['Connector', 'Connector name', 'Connection', 'Reference keys', 'Account(s)', 'Display name(s)', 'Status',
                            'Calls bound', 'Artefacts', 'Flows'], conn_rows,
            [28, 26, 60, 34, 30, 22, 16, 10, 10, 8],
            'One row per tenant connection resource named anywhere in the artefacts. "Declared only" = listed by an artefact but no action in the register is bound to it.',
            wrap=['Reference keys', 'Account(s)'], mono=['Connector', 'Connection', 'Reference keys'], num=['Calls bound', 'Artefacts', 'Flows'],
            tab='2E6FD8', databar='Calls bound')
table_sheet('Accounts', ['Connector', 'Connector name', 'Account / label', 'Kind', 'Connections', 'Connection list', 'Calls attributed'], acct_rows,
            [28, 26, 44, 34, 11, 70, 11],
            'One row per account or label shown for a connector\'s connections (package manifests and connection references). Office 365 Users, OneDrive for Business and shared_sendmail carry none.',
            wrap=['Connection list'], mono=['Connector', 'Connection list'], num=['Connections', 'Calls attributed'], tab='2E6FD8')
table_sheet('Operations', ['Connector', 'Connector name', 'Operation', 'Calls', 'Calls in primary artefacts', 'Flows', 'Reference keys',
                           'Reference key list', 'Parameter keys'], op_rows,
            [28, 26, 58, 9, 11, 8, 10, 50, 10],
            'One row per operation. Operations written as METHOD /path come from an older export format that stores the call as a path instead of an operation name.',
            wrap=['Reference key list'], mono=['Connector', 'Operation'], num=['Calls', 'Calls in primary artefacts', 'Flows', 'Reference keys', 'Parameter keys'],
            tab='16A085', databar='Calls')
ws = table_sheet('Operation Parameters', ['Connector', 'Connector name', 'Operation', 'Parameter key', 'Calls carrying it', 'Calls of the operation', 'Coverage'],
                 opp_rows, [28, 26, 44, 46, 11, 11, 10],
                 'One row per parameter key each operation is called with. Coverage = share of that operation\'s calls that set the key.',
                 mono=['Connector', 'Operation', 'Parameter key'], num=['Calls carrying it', 'Calls of the operation'], tab='16A085')
t = TABLES['Operation Parameters']
for rr in range(t['hr'] + 1, t['last'] + 1):
    ws.cell(row=rr, column=7).number_format = '0%'
table_sheet('Connector Flows', ['Connector', 'Connector name', 'Flow', 'Calls', 'Operations', 'Operation list', 'Reference keys',
                                'Connections', 'Artefacts', 'Artefact families'], cflow_rows,
            [28, 26, 52, 8, 11, 50, 40, 58, 10, 60],
            'One row per connector-flow pairing - which flows use each connector, how often, through which keys and connections.',
            wrap=['Operation list', 'Reference keys', 'Connections', 'Artefact families'], mono=['Connector'],
            num=['Calls', 'Operations', 'Artefacts'], tab='16A085', databar='Calls')
table_sheet('Response Status Codes', ['Operation as recorded', 'Status code', 'Meaning', 'Set', 'Run-time expression', 'Calls', 'Flows', 'Observation'],
            status_rows, [52, 10, 30, 10, 58, 8, 8, 60],
            'builtin:response - every status code the flows return. "Run time" codes are chosen by an expression when the flow runs.',
            wrap=['Run-time expression', 'Observation'], mono=['Operation as recorded', 'Run-time expression'], num=['Calls', 'Flows'],
            tab='7F8C8D', databar='Calls')
table_sheet('HTTP Endpoints', ['Method', 'URI', 'Host', 'Calls', 'Header names', 'Flows', 'Flow list', 'Register rows'], http_rows,
            [9, 80, 30, 8, 30, 8, 50, 40],
            'builtin:http - every external endpoint called. Header values (including API keys) are in Bindings, with credentials masked.',
            wrap=['URI', 'Flow list', 'Register rows'], mono=['URI', 'Host'], num=['Calls', 'Flows'], tab='7F8C8D')
table_sheet('Bindings', bind_head, bind_rows,
            [11, 26, 24, 16, 34, 28, 40, 30, 26, 44, 9, 30, 8, 10, 18, 60, 8, 50, 46, 30, 80, 70],
            'Every connector-bound call in the register, one row each - the base the Profiles and matrix formulas count. Parameters are as the source carries them (credentials masked).',
            mono=['Connector', 'Reference key', 'Connection'], tab='C0392B')
assert TABLES['Bindings']['last'] == B_LAST

# Order the tabs as the Cover lists them.
wb._sheets = [wb[n] for n in ['Cover', 'Connector Profiles', 'Connector x Family', 'Flow x Connector', 'Reference Keys', 'Connections',
                              'Accounts', 'Operations', 'Operation Parameters', 'Connector Flows', 'Response Status Codes',
                              'HTTP Endpoints', 'Bindings']]
wb.active = 0
for w in wb.worksheets:
    w.sheet_view.tabSelected = w.title == 'Cover'
wb.properties.title = 'Connector Details'
wb.properties.subject = f'Built from connector-register.json sha256 {SRC_SHA}'
wb.save(OUT)
print(f'wrote {OUT.relative_to(ROOT)} - {len(wb.sheetnames)} sheets; {len(CONNECTORS)} connectors, {len(key_rows)} keys, '
      f'{len(conn_rows)} connections, {len(acct_rows)} accounts, {len(op_rows)} operations, {len(opp_rows)} parameter keys, '
      f'{len(cflow_rows)} connector-flow pairs, {len(bind_rows)} bindings')
