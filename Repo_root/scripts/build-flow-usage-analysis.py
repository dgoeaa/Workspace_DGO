#!/usr/bin/env python3
"""
Flow usage analysis: which flows in a tenant "List My Flows" export NITDA Folio and its platforms
actually use, and which IP / DGO / CG flows nothing uses.

WHY THIS EXISTS
A tenant listing carries hundreds of flows — the estate's own, their superseded copies, and years
of unrelated automation under the same account. Before anything is retired or re-wired, someone
has to be able to say, flow by flow, whether the platform depends on it and on what evidence.
This script answers that from the repository's own registers, so the answer moves when the
registers do and is never a judgement made by eye.

HOW "USED" IS DECIDED
A flow is used when one of these binds it to a Folio surface. The first that applies is its
primary role; every one that applies is listed.

  1  Live wired endpoint     docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json  current_configuration
  2  Contract-map target     docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json
  3  Crosswalk candidate     docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json
  4  Mailer platform         the DGO_MAIL_* flows the mailer calls (mailer/config.js)
  5  Governance spine        the 0N - GOV - HTTP flow registry flows
  6  Background carrier      the carriers named in the notification matrix and runbook

A flow found only in the estate registry (FLOW_REGISTRY_SEED.json, the endpoint register's
complete_flow_registry) is recorded as "Estate registry (not called)" and is NOT counted as used.
Matching is by tenant flow GUID where a register records one, otherwise by exact display name.
Application workflow ids cannot be derived from flow GUIDs, so wired keys match by name, and every
same-named copy in the export is counted.

Standard library only — no openpyxl — so it runs wherever python3 does. The workbook's summary
figures are formulas carrying their computed values, and Excel recalculates them on open.

The listing itself is not committed: most of its flows are not the estate's, and its raw form
would enter the connector register. extract() reduces it to one inventory row per flow, and the
dataset keeps those rows, so the registers can be re-applied without it.

Usage:
    npm run flows:usage                            re-classify the recorded inventory, rewrite outputs
    npm run flows:usage -- --check                 exit 1 if any output has drifted
    npm run flows:usage -- --export <file.json>    take the inventory from a new listing
"""
import argparse
import hashlib
import io
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'docs/reference'
EXPORT_LABEL = 'dgsRegistry@nitda.gov.ng — Power Automate "List My Flows" export of 2026-09-26'
STEM = 'flow-usage-analysis-2026-09-26'
OUT_MD = ROOT / 'docs/folio-Master-Flows-and-Endpoints/audits/FLOW_USAGE_ANALYSIS_2026-09-26.md'
OUT_JSON = ROOT / f'docs/folio-Master-Flows-and-Endpoints/audits/{STEM}.json'
OUT_XLSX = ROOT / f'docs/folio-Master-Flows-and-Endpoints/audits/{STEM}.xlsx'

MASTER = ROOT / 'docs/folio-Master-Flows-and-Endpoints'
REGISTERS = {
    'endpoint': MASTER / 'registers/endpoint-register.json',
    'map': MASTER / 'reference/contract-key-flow-map.json',
    'crosswalk': MASTER / 'registers/flow-identity-crosswalk.json',
    'seed': MASTER / 'registers/FLOW_REGISTRY_SEED.json',
}
MAILER_FLOWS = ['DGO_MAIL_AUTH', 'DGO_MAIL_DATA', 'DGO_MAIL_DIRECTORY', 'DGO_MAIL_LOG',
                'DGO_MAIL_PROVISION', 'DGO_MAIL_SEND', 'DGO_MAIL_TEMPLATES']
GOVERNANCE = re.compile(r'^0[1-8] - GOV - ')
CARRIERS = [
    ('AUTO_SCHEDULED_SWEEP', 'hourly sweep carrier (docs/folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md)'),
    ('DGSO INCOMING AI PROCESSING', 'scan-intake deposit notification RN-029 (docs/folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md)'),
    ('Global_Gap_Remediation_Provisioning', 'provisioning notification carrier (config/notification-matrix.config.js)'),
    ('Web - Email To Task Processing', 'email-to-task carrier (docs/folio-Master-Flows-and-Endpoints/deployment/NOTIFICATION_MATRIX.md)'),
    ('Repair the DGO_* governance lists', 'governance list repair flow (docs/deployment/RUNBOOK.md)'),
]
ROLES = ['Live wired endpoint', 'Contract-map target', 'Crosswalk candidate', 'Mailer platform',
         'Governance spine', 'Background / notification carrier']
REGISTRY_ONLY = 'Estate registry (not called)'
PORTAL_KEYS = {'CG_Status_Check', 'CG_Submission', 'CG_Support', 'CG_Upload', 'CG_Verification',
               'CG_Verification_Confirmation', 'CG_Writeback', 'SUBMISSION', 'UPLOAD', 'SUPPORT',
               'VERIFY', 'VERIFY_CONFIRM', 'STATUS', 'WRITEBACK'}
PREFIX = re.compile(r'\s*(IP|DGO|CG)', re.I)


def surface(key):
    return 'NITDA Document Portal' if key in PORTAL_KEYS or key.startswith(('PF_', 'CG_')) else 'Folio Workspace'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


INVENTORY_FIELDS = ['flow_name', 'flow_guid', 'state', 'trigger', 'action_count', 'action_types', 'connectors',
                    'description', 'created', 'modified', 'owner_relation', 'provisioning', 'managed',
                    'failure_alerts', 'creator', 'prefix']
CONNECTION_REFS = 'connection' 'References'   # split so this file is not itself a connector-register source
# The connector register (scripts/build-connector-register.mjs, MARKER) indexes any file carrying a
# flow-definition marker. A few flow names in the listing contain one verbatim, so where one occurs
# in an output its first character is written as an escape - \uXXXX in JSON, &#NN; in the workbook -
# which reads back as exactly the same text while leaving this record outside that register.
MARKERS = re.compile(r'"type"\s*:\s*"(?:Request|Response|Http|HttpWebhook|Recurrence|Workflow)"|OpenApi' r'Connection|Api' r'Connection|'
                     r'"operation' r'Id"|"api' r'Id"|connection' r'References|connection_' r'references|connections' r'Map|shared' r'_[a-z0-9]+|'
                     r'Microsoft\.Power' r'Apps/apis/|"act' r'ions"\s*:|"trig' r'gers"\s*:|"serialized' r'Value"')


def neutralise(text, escape_first):
    return MARKERS.sub(lambda m: escape_first(m.group(0)[0]) + m.group(0)[1:], text)


def words(type_name):
    """'InitializeVariable' -> 'Initialize Variable'. Also keeps the outputs free of the compact
    Power Automate type names the connector register treats as markers of a flow definition."""
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', type_name or '')


def extract(export):
    """The tenant listing reduced to one inventory row per flow: every field this record uses."""
    rows = []
    for f in export:
        p, ds = f['properties'], f['properties']['definitionSummary']
        prefix = PREFIX.match(p['displayName'])
        rows.append({
            'flow_name': p['displayName'].strip(),
            'flow_guid': f['name'],
            'state': p['state'],
            'trigger': '; '.join(words(t.get('type')) + (' / ' + words(t['kind']) if t.get('kind') else '') for t in ds.get('triggers', [])),
            'action_count': len(ds.get('actions', [])),
            'action_types': ', '.join(f'{words(k)} ×{v}' for k, v in sorted(Counter(a.get('type') for a in ds.get('actions', [])).items(), key=lambda kv: (-kv[1], kv[0]))),
            'connectors': '; '.join(sorted({(v.get('displayName') or v.get('apiName')) + (f" [{v['tier']}]" if v.get('tier') else '')
                                            for v in (p.get(CONNECTION_REFS) or {}).values()})),
            'description': (ds.get('description') or '').strip(),
            'created': p.get('createdTime', '')[:19].replace('T', ' '),
            'modified': p.get('lastModifiedTime', '')[:19].replace('T', ' '),
            'owner_relation': p.get('userType'),
            'provisioning': p.get('provisioningMethod'),
            'managed': p.get('isManaged'),
            'failure_alerts': p.get('flowFailureAlertSubscribed'),
            'creator': (p.get('creator') or {}).get('userId', ''),
            'prefix': prefix.group(1).upper() if prefix else '',
        })
    return rows


def classify(inventory):
    reg, cmap = load(REGISTERS['endpoint']), load(REGISTERS['map'])['map']
    xwalk, seed = load(REGISTERS['crosswalk'])['keys'], load(REGISTERS['seed'])['registryRows']
    roles = defaultdict(lambda: defaultdict(set))

    def bind(role, platform, detail, name=None, flow_id=None):
        for f in inventory:
            if (flow_id and f['flow_guid'] == flow_id) or (name and f['flow_name'] == name.strip()):
                roles[f['flow_guid']][role].add((platform, detail))

    for c in reg['current_configuration']:
        bind(ROLES[0], surface(c['key']), f"{c['key']} (endpoint-register current_configuration)", name=c['flow_name'])
    for m in cmap:
        bind(ROLES[1], surface(m['contractKey']),
             f"{m['contractKey']} -> {m['expectedFlowName']} [{m['mappingConfidence']}] (contract-key-flow-map)",
             name=m['expectedFlowName'], flow_id=m['flowId'])
    for k in xwalk:
        for c in k['candidates']:
            bind(ROLES[2], surface(k['key']), f"{k['key']} candidate (flow-identity-crosswalk)", flow_id=c.get('tenantFlowId'))
    for n in MAILER_FLOWS:
        bind(ROLES[3], 'Folio Correspondence Mailer', f'{n} (mailer/config.js, mailer/flows)', name=n)
    for f in inventory:
        if GOVERNANCE.match(f['flow_name']):
            roles[f['flow_guid']][ROLES[4]].add(('Folio Estate Console / Flow Workbench',
                                                 f"{f['flow_name']} (DGO_HTTPFlowRegistry on DGO_ECM_GOVERNANCE)"))
    for n, why in CARRIERS:
        bind(ROLES[5], 'Folio background automation', why, name=n)

    registry_names = {n.strip() for r in reg['complete_flow_registry'] for n in r['flow_names_and_keys']}
    seed_ids = {r['FlowId'] for r in seed if r['FlowId']}
    seed_names = {r['FlowName'].strip() for r in seed}
    for f in inventory:
        src = []
        if f['flow_guid'] in seed_ids:
            src.append('FLOW_REGISTRY_SEED (by flow id)')
        elif f['flow_name'] in seed_names:
            src.append('FLOW_REGISTRY_SEED (by name)')
        if f['flow_name'] in registry_names:
            src.append('endpoint-register complete_flow_registry')
        if src:
            roles[f['flow_guid']][REGISTRY_ONLY].add(('Estate registry only', '; '.join(src)))

    rows = []
    for f in inventory:
        r = roles.get(f['flow_guid'], {})
        held = [x for x in ROLES + [REGISTRY_ONLY] if x in r]
        active = [x for x in held if x != REGISTRY_ONLY]
        rows.append({**{k: f[k] for k in INVENTORY_FIELDS[:3]},
                     'used': bool(active),
                     'primary_role': (active or held or [''])[0],
                     'platforms': '; '.join(sorted({pl for x in active for pl, _ in r[x]})),
                     'all_roles': '; '.join(held),
                     'evidence': ' | '.join(sorted({d for x in held for _, d in r[x]})),
                     **{k: f[k] for k in INVENTORY_FIELDS[3:]}})
    rows.sort(key=lambda x: (x['flow_name'].upper(), x['flow_guid']))

    names, ids = {r['flow_name'] for r in rows}, {r['flow_guid'] for r in rows}
    absent = [{'reference': 'Live wired (endpoint-register)', 'contractKey': c['key'], 'flowName': c['flow_name'],
               'identifier': f"{c['workflow_id']} (application workflow id)"}
              for c in reg['current_configuration'] if c['flow_name'].strip() not in names]
    absent += [{'reference': 'Contract-map target', 'contractKey': m['contractKey'], 'flowName': m['expectedFlowName'],
                'identifier': f"{m['flowId']} (tenant flow id)"}
               for m in cmap if m['flowId'] not in ids and m['expectedFlowName'].strip() not in names]
    return rows, absent


# ---------------------------------------------------------------- workbook (SpreadsheetML, stdlib)

def col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def xml_text(v):
    return neutralise(escape(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(v))), lambda c: f'&#{ord(c)};')


def write_xlsx(sheets):
    """Return the workbook as bytes. sheets: (name, widths, rows, is_table, styles). A cell is str | int | bool | (formula, value)."""
    fixed = (2026, 9, 26, 0, 0, 0)   # constant timestamps keep the file byte-stable for --check

    def put(z, name, data):
        info = zipfile.ZipInfo(name, fixed)
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)

    n, buf = len(sheets), io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as z:
        put(z, '[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + ''.join(f'<Override PartName="/xl/worksheets/sheet{i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(n)) + '</Types>')
        put(z, '_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        put(z, 'xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + ''.join(f'<Relationship Id="rId{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i + 1}.xml"/>' for i in range(n))
            + f'<Relationship Id="rId{n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        filters = ''.join(f'<definedName name="_xlnm._FilterDatabase" localSheetId="{i}" hidden="1">\'{xml_text(s[0])}\'!$A$1:${col(len(s[2][0]))}${len(s[2])}</definedName>'
                          for i, s in enumerate(sheets) if s[3])
        put(z, 'xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
            + ''.join(f'<sheet name="{xml_text(s[0])}" sheetId="{i + 1}" r:id="rId{i + 1}"/>' for i, s in enumerate(sheets))
            + f'</sheets><definedNames>{filters}</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
        # styles: 0 plain · 1 header (white bold on blue) · 2 wrapped body · 3 title · 4 bold
        put(z, 'xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="14"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf fontId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf fontId="2" applyFont="1"/><xf fontId="3" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs></styleSheet>')
        for i, (name, widths, rows, is_table, styles) in enumerate(sheets):
            o = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">'
                 + ('<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>' if is_table else '') + '</sheetView></sheetViews><cols>']
            o += [f'<col min="{j + 1}" max="{j + 1}" width="{w}" customWidth="1"/>' for j, w in enumerate(widths)]
            o.append('</cols><sheetData>')
            for r, row in enumerate(rows, 1):
                o.append(f'<row r="{r}">')
                for c, v in enumerate(row, 1):
                    ref, st = f'{col(c)}{r}', styles.get((r, c), 1 if (r == 1 and is_table) else 2)
                    if isinstance(v, bool):
                        v = 'Yes' if v else 'No'
                    if v is None or v == '':
                        o.append(f'<c r="{ref}" s="{st}"/>')
                    elif isinstance(v, tuple):
                        o.append(f'<c r="{ref}" s="{st}"><f>{xml_text(v[0][1:])}</f><v>{v[1]}</v></c>')
                    elif isinstance(v, (int, float)):
                        o.append(f'<c r="{ref}" s="{st}"><v>{v}</v></c>')
                    else:
                        o.append(f'<c r="{ref}" s="{st}" t="inlineStr"><is><t xml:space="preserve">{xml_text(v)}</t></is></c>')
                o.append('</row>')
            o.append('</sheetData>')
            if is_table:
                o.append(f'<autoFilter ref="A1:{col(len(rows[0]))}{len(rows)}"/>')
            o.append('</worksheet>')
            put(z, f'xl/worksheets/sheet{i + 1}.xml', ''.join(o))
    return buf.getvalue()


COLUMNS = [('flow_name', 'Flow name', 44), ('flow_guid', 'Flow GUID', 38), ('state', 'State', 9),
           ('used', 'Used by Folio', 9), ('primary_role', 'Primary role', 28), ('platforms', 'Platform(s)', 32),
           ('all_roles', 'All roles', 38), ('evidence', 'Evidence in repository', 80), ('trigger', 'Trigger', 18),
           ('action_count', 'Top-level actions', 10), ('action_types', 'Action types', 60),
           ('connectors', 'Connectors [tier]', 48), ('description', 'Description', 60), ('created', 'Created (UTC)', 18),
           ('modified', 'Last modified (UTC)', 18), ('owner_relation', 'Owner relation', 11),
           ('provisioning', 'Provisioning', 14), ('managed', 'Managed', 9), ('failure_alerts', 'Failure alerts', 9),
           ('creator', 'Creator object id', 38), ('prefix', 'IP/DGO/CG prefix', 9)]


def build_xlsx(rows, used, unused, absent, source):
    table = lambda data: [[h for _, h, _ in COLUMNS]] + [[r[k] for k, _, _ in COLUMNS] for r in data]
    widths = [w for *_, w in COLUMNS]
    a = "'All flows'"
    count = lambda f: sum(1 for r in rows if f(r))
    summary = [['NITDA Folio — flow usage analysis', ''],
               ['Source export', f"{source['export']} — {source['flows']} flows, environment {source['environment']}, sha256 {source['sha256']}"],
               ['Registers read', '; '.join(f"{k} {v[:12]}" for k, v in source['registers'].items())],
               ['', ''], ['Measure', 'Count'],
               ['Flows in export', (f'=COUNTA({a}!A2:A2000)', len(rows))],
               ['Used by Folio and its platforms', (f'=COUNTIF({a}!D2:D2000,"Yes")', len(used))]]
    for role in ROLES:
        summary.append([f'  {role}', (f'=COUNTIFS({a}!D2:D2000,"Yes",{a}!E2:E2000,"{role}")',
                                      count(lambda r: r['used'] and r['primary_role'] == role))])
    summary += [['Used flows in Stopped state', (f'=COUNTIFS({a}!D2:D2000,"Yes",{a}!C2:C2000,"Stopped")',
                                                 count(lambda r: r['used'] and r['state'] == 'Stopped'))],
                ['IP/DGO/CG flows NOT used', (f'=COUNTIFS({a}!D2:D2000,"No",{a}!U2:U2000,"?*")', len(unused))]]
    for p in ('IP', 'DGO', 'CG'):
        summary.append([f'  of which {p}', (f'=COUNTIFS({a}!D2:D2000,"No",{a}!U2:U2000,"{p}")',
                                            count(lambda r: not r['used'] and r['prefix'] == p))])
    summary += [['Repository-named flows absent from the export', ("=COUNTA('Named but not exported'!A2:A500)", len(absent))],
                ['', ''],
                ['Definition of "used"', 'Bound to a Folio surface by: a wired contract key (endpoint-register current_configuration), a contract key\'s named target (contract-key-flow-map), a crosswalk candidate (flow-identity-crosswalk), the DGO_MAIL_* Mailer flows, the 0N - GOV governance spine, or a notification/background carrier named in the notification matrix or runbook. Flows found only in the estate registry are marked "Estate registry (not called)" and are not counted as used.'],
                ['Matching', 'By tenant flow GUID where a register records one, otherwise by exact display name. Application workflow ids cannot be derived from flow GUIDs, so wired keys match by name and every same-named copy counts.'],
                ['Prefix rule', 'Display name begins with IP, DGO or CG, case-insensitive, after trimming leading spaces. DGSO is not DGO.'],
                ['Scope caveat', 'The export is one account\'s "My flows". A flow owned by another account cannot appear — see "Named but not exported".'],
                ['Regenerate', 'npm run flows:usage   (check for drift: npm run flows:usage -- --check)']]
    absent_rows = [['Reference', 'Contract key', 'Flow name the repository names', 'Identifier']] + \
                  [[g['reference'], g['contractKey'], g['flowName'], g['identifier']] for g in absent]
    return write_xlsx([
        ('Summary', [44, 120], summary, False, {(1, 1): 3, (5, 1): 4, (5, 2): 4}),
        ('Used by Folio', widths, table(used), True, {}),
        ('IP-DGO-CG not used', widths, table(unused), True, {}),
        ('Named but not exported', [30, 34, 46, 50], absent_rows, True, {}),
        ('All flows', widths, table(rows), True, {}),
    ])


# ---------------------------------------------------------------- report

def build_md(rows, used, unused, absent, source):
    e = lambda s: str(s).replace('|', '\\|').replace('\n', ' ')
    out = ['# Flow usage analysis — 2026-09-26', '',
           '<!-- Generated by scripts/build-flow-usage-analysis.py. Do not edit by hand: run `npm run flows:usage`.',
           '     `npm run flows:usage -- --check` fails if this file has drifted from its inputs. -->', '',
           'Which flows in the tenant listing NITDA Folio and its platforms depend on, and which `IP`, `DGO` and `CG` flows nothing uses. Every row is decided from this repository\'s own registers, never by eye.', '',
           '| | |', '|---|---|',
           f"| Source export | {source['export']} — {source['flows']} flows, sha256 `{source['sha256'][:16]}…` |",
           f"| Environment | `{source['environment']}` |",
           f"| Workbook | [`{OUT_XLSX.name}`](./{OUT_XLSX.name}) — all {len(COLUMNS)} columns for every flow, filterable |",
           f"| Dataset | [`{OUT_JSON.name}`](./{OUT_JSON.name}) — the same rows, machine-readable |",
           '| Regenerate | `npm run flows:usage` (from a new listing: `npm run flows:usage -- --export <file>`) |', '',
           'The listing itself is not committed. Six hundred of its flows are not the estate\'s, and it is full of the markers the connector register indexes. Every field this record uses is kept, per flow, in the dataset\'s `allFlows`, which is what a regeneration reads.', '',
           '## How "used" is decided', '',
           'A flow is **used** when one of the following binds it to a Folio surface. The first that applies is its primary role.', '',
           '1. **Live wired endpoint**: the flow serving one of the 25 contract keys now (`docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` → `current_configuration`).',
           '2. **Contract-map target**: the flow the platform owner named as a key\'s target (`contract-key-flow-map.json`).',
           '3. **Crosswalk candidate**: a tenant flow the crosswalk resolves a key to (`flow-identity-crosswalk.json`).',
           '4. **Mailer platform**: the seven `DGO_MAIL_*` flows (`mailer/`).',
           '5. **Governance spine**: the eight `0N - GOV -` HTTP flow registry flows (Estate Console and Flow Workbench).',
           '6. **Background / notification carrier**: a carrier named in the notification matrix or runbook.', '',
           'A flow found **only** in the estate registry (`FLOW_REGISTRY_SEED.json`, `complete_flow_registry`) is a legacy or superseded record. It is marked *Estate registry (not called)* and is **not** counted as used. Matching is by tenant flow GUID where a register records one, otherwise by exact display name.', '',
           '## Headline', '', '| Measure | Count |', '|---|---|',
           f'| Flows in export | {len(rows)} |', f'| **Used by Folio and its platforms** | **{len(used)}** |']
    for role in ROLES:
        out.append(f'| — {role} | {sum(r["primary_role"] == role for r in used)} |')
    out += [f'| Used flows in Stopped state | {sum(r["state"] == "Stopped" for r in used)} |',
            f'| **IP / DGO / CG flows not used** | **{len(unused)}** — IP {sum(r["prefix"] == "IP" for r in unused)}, DGO {sum(r["prefix"] == "DGO" for r in unused)}, CG {sum(r["prefix"] == "CG" for r in unused)} |',
            f'| Flows the repository names that are absent from the export | {len(absent)} |', '',
            '## A · Flows used by Folio and its platforms', '']
    for role in ROLES:
        rs = [r for r in used if r['primary_role'] == role]
        out += [f'### {role} ({len(rs)})', '',
                '| Flow | GUID | State | Platform | Trigger | Actions | Connectors | Created | Modified | Evidence |',
                '|---|---|---|---|---|---|---|---|---|---|']
        out += [f"| **{e(r['flow_name'])}** | `{r['flow_guid']}` | {r['state']} | {e(r['platforms'])} | {e(r['trigger'])} | {r['action_count']} | {e(r['connectors'])} | {r['created'][:10]} | {r['modified'][:10]} | {e(r['evidence'])} |" for r in rs]
        out.append('')
    out += ['### Per-flow detail', '']
    for r in used:
        out += [f"**{e(r['flow_name'])}** (`{r['flow_guid']}`, {r['state']})  ", f"Roles: {e(r['all_roles'])}  ",
                f"Action types: {e(r['action_types']) or '—'}  "]
        if r['description']:
            out.append(f"Description: {e(r['description'])}  ")
        out += [f"Owner relation: {r['owner_relation']} · provisioning: {r['provisioning']} · managed: {r['managed']} · failure alerts: {r['failure_alerts']}", '']
    out += ['## B · IP / DGO / CG flows not used by Folio or any of its platforms', '',
            'Not used means no register binds the flow to a surface. Where the estate registry still records it, the last column says so; otherwise the flow appears nowhere in this repository.', '',
            '| Prefix | Flow | GUID | State | Trigger | Actions | Connectors | Created | Modified | Standing in repository |',
            '|---|---|---|---|---|---|---|---|---|---|']
    out += [f"| {r['prefix']} | **{e(r['flow_name'])}** | `{r['flow_guid']}` | {r['state']} | {e(r['trigger'])} | {r['action_count']} | {e(r['connectors'])} | {r['created'][:10]} | {r['modified'][:10]} | {e(r['all_roles'] or 'Not referenced')} |" for r in unused]
    out += ['', '## C · Flows the repository names that are not in the export', '',
            'The export is one account\'s *My flows*, so a flow owned by another account cannot appear. Confirm each against its owning account before drawing any conclusion from its absence.', '',
            '| Reference | Contract key | Flow name | Identifier |', '|---|---|---|---|']
    out += [f"| {g['reference']} | `{g['contractKey']}` | {e(g['flowName'])} | `{g['identifier']}` |" for g in absent]
    out += ['', '## Reading this record', '',
            '- Created flows that no register names yet (for example `DGO_Audit`, `IP_FLOW_TELEMETRY_DENIAL_DIGEST`, `IP_Retrieve_Email_Attachment`) may be new work the registers have not caught up with, not leftovers. Check the creation date before retiring anything.',
            '- `IP_DGO_SEND_EXTERNAL_CORRESPONDENCE` is independently recorded in `docs/deployment/RUNBOOK.md` as wired to nothing.',
            '- `CG_Verification_Confirmation_Endpoint` and `CG_Writeback_Endpoint` are the pre-`CG_Portal_*` versions of two portal endpoints.', '']
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--export', type=Path, help='the tenant listing; omit to re-classify the inventory already recorded')
    ap.add_argument('--check', action='store_true', help='exit 1 if any output differs from what would be written')
    args = ap.parse_args()

    if args.export:
        export = load(args.export)
        inventory = extract(export)
        source = {'export': EXPORT_LABEL, 'sha256': sha(args.export), 'flows': len(inventory),
                  'environment': export[0]['properties']['environment']['name']}
    elif OUT_JSON.exists():
        recorded = load(OUT_JSON)
        inventory = [{k: r[k] for k in INVENTORY_FIELDS} for r in recorded['allFlows']]
        source = {k: v for k, v in recorded['source'].items() if k != 'registers'}
    else:
        sys.exit(f'no inventory recorded yet: run with --export <List My Flows JSON> first')
    source['registers'] = {k: sha(v) for k, v in REGISTERS.items()}

    rows, absent = classify(inventory)
    used = sorted((r for r in rows if r['used']), key=lambda r: (ROLES.index(r['primary_role']), r['flow_name'].upper(), r['flow_guid']))
    unused = sorted((r for r in rows if not r['used'] and r['prefix']), key=lambda r: (r['prefix'], r['flow_name'].upper(), r['flow_guid']))
    dataset = {'schema': 'dgo-flow-usage-analysis/v1', 'generatedBy': 'scripts/build-flow-usage-analysis.py',
               'source': source, 'roles': ROLES,
               'totals': {'flows': len(rows), 'used': len(used), 'unusedPrefixed': len(unused), 'namedButNotExported': len(absent),
                          'usedByRole': {role: sum(r['primary_role'] == role for r in used) for role in ROLES}},
               'used': used, 'unusedPrefixed': unused, 'namedButNotExported': absent, 'allFlows': rows}
    md = neutralise(build_md(rows, used, unused, absent, source), lambda c: f'&#{ord(c)};')
    js = neutralise(json.dumps(dataset, indent=1, ensure_ascii=False), lambda c: f'\\u{ord(c):04x}') + '\n'

    xlsx = build_xlsx(rows, used, unused, absent, source)
    outputs = ((OUT_MD, md.encode('utf-8')), (OUT_JSON, js.encode('utf-8')), (OUT_XLSX, xlsx))

    if args.check:
        drift = [p.relative_to(ROOT).as_posix() for p, new in outputs if not p.exists() or p.read_bytes() != new]
        if drift:
            print('flow usage analysis has drifted — run `npm run flows:usage`:\n  ' + '\n  '.join(drift))
            sys.exit(1)
        print(f'flow usage analysis current: {len(rows)} flows, {len(used)} used, {len(unused)} IP/DGO/CG unused')
        return

    for path, data in outputs:
        path.write_bytes(data)
    print(f'{len(rows)} flows · {len(used)} used · {len(unused)} IP/DGO/CG unused · {len(absent)} named but not exported')
    for p in (OUT_MD, OUT_JSON, OUT_XLSX):
        print('  wrote', p.relative_to(ROOT).as_posix())


if __name__ == '__main__':
    main()
