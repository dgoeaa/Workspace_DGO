#!/usr/bin/env python3
"""Verify a Folio Central Administration Centre installation. Read-only unless --provision.

  python3 scripts/verify.py               check files, settings, permissions, counts and the audit chain
  python3 scripts/verify.py --provision   provision the database first if it does not exist yet
  python3 scripts/verify.py --json        machine-readable result

Exit 0 and PASS when every check holds; exit 1 and FAIL otherwise; exit 2 when not provisioned.
It opens the database read-only, so it is safe beside a running server, but the Developer Guide's
rule stands: do not change SQLite data with ad hoc tools while the server runs.
"""
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG))
os.environ.setdefault('FOLIO_ADMIN_MONITOR', '0')

import server  # noqa: E402  (the package's own definitions: settings, chain algorithm, estate reader)

REQUIRED_FILES = ('server.py', 'config/settings.json', 'static/index.html', 'static/app.js', 'static/app.css',
                  'static/brand/brand.css', 'static/brand/brand.js', 'scripts/start.sh', 'scripts/verify.py')
REQUIRED_SETTINGS = ('systemName', 'version', 'bindHost', 'port', 'database', 'adminTokenFile', 'environmentId',
                     'sharePointConnectionId', 'healthIntervalSeconds', 'staleAfterSeconds', 'retentionDays',
                     'timezone', 'auditHashAlgorithm')


def main(argv):
    checks = []

    def check(name, ok, detail=''):
        checks.append({'check': name, 'pass': bool(ok), 'detail': detail})

    for f in REQUIRED_FILES:
        check(f'file {f}', (PKG / f).is_file())

    cfg = server.Config()
    s = cfg.file_settings
    missing = [k for k in REQUIRED_SETTINGS if k not in s]
    check('settings carry every documented key', not missing, ', '.join(missing))
    check('bindHost is loopback', server.is_loopback(s.get('bindHost', '')), s.get('bindHost'))
    check('auditHashAlgorithm is sha256', s.get('auditHashAlgorithm') == 'sha256')
    check('retentionDays meets the seven-year policy', int(s.get('retentionDays', 0)) >= 2555, str(s.get('retentionDays')))
    secretish = [k for k, v in s.items() if isinstance(v, str) and server.CREDENTIAL.search(v)]
    check('settings hold no credential', not secretish, ', '.join(secretish))

    if not cfg.db_path.exists():
        if '--provision' in argv:
            server.App(cfg)
        else:
            print(f'NOT PROVISIONED: {cfg.db_path} does not exist. Start the server once, or run with --provision.')
            return 2

    def mode(p):
        try:
            return p.stat().st_mode & 0o777
        except OSError:
            return None
    check('token file exists with mode 0600', mode(cfg.token_path) == 0o600, oct(mode(cfg.token_path) or 0))
    tok = cfg.token_path.read_text(encoding='utf-8').strip() if cfg.token_path.exists() else ''
    check('token is a 43-character URL-safe value', re.fullmatch(r'[A-Za-z0-9_\-]{43}', tok) is not None)
    check('database has mode 0600', mode(cfg.db_path) == 0o600, oct(mode(cfg.db_path) or 0))

    con = sqlite3.connect(f'file:{cfg.db_path}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    try:
        check('SQLite integrity_check', con.execute('PRAGMA integrity_check').fetchone()[0] == 'ok')
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        need = {'platforms', 'endpoints', 'configurations', 'health', 'audit', 'alerts', 'incidents', 'changes',
                'record_notes', 'operators', 'configuration_history', 'meta', 'tenant_flows', 'flow_runs', 'folio_flows'}
        check('every governed table exists', need <= tables, ', '.join(sorted(need - tables)))
        count = lambda t, w='': con.execute(f'SELECT COUNT(*) FROM {t} {w}').fetchone()[0]
        check('6 platforms', count('platforms') == 6, str(count('platforms')))
        try:
            expected = len(server.read_estate(cfg.repo)[0])
            active = count('endpoints', "WHERE state != 'Retired'")
            check('active endpoints equal the registers', active == expected, f'{active} in the database, {expected} in the registers')
        except RuntimeError as e:
            check('endpoint registers readable', False, str(e))
        try:
            expected = len(server.read_catalogue(cfg.repo)[0])
            watched = count('folio_flows', "WHERE state != 'Retired'")
            check('Folio flows equal the flow catalogue', watched == expected, f'{watched} in the database, {expected} in the catalogue')
        except RuntimeError as e:
            check('flow catalogue readable', False, str(e))
        check('every settings key is persisted', count('configurations') >= len(s), f"{count('configurations')} records")
        check('at least one audit event', count('audit') >= 1)
        blanks = con.execute("SELECT COUNT(*) FROM endpoints WHERE endpoint_key='' OR flow_name='' OR method='' OR state=''").fetchone()[0]
        check('endpoint records are complete', blanks == 0, f'{blanks} incomplete')

        prev, n, broken = 'GENESIS', 0, None
        for r in con.execute('SELECT * FROM audit ORDER BY id'):
            n += 1
            if r['previous_hash'] != prev or server.Store.event_hash(r) != r['event_hash']:
                broken = r['id']
                break
            prev = r['event_hash']
        check('audit chain recomputes from GENESIS', broken is None, f'{n} events' + (f', broken at #{broken}' if broken else ''))

        leaks = []
        for t, cols in (('audit', ('reason', 'target')), ('alerts', ('asset', 'message')), ('incidents', ('title', 'description')),
                        ('changes', ('target', 'reason', 'rollback_plan')), ('record_notes', ('note',)), ('flow_runs', ('error_message',)), ('configurations', ('value',))):
            for r in con.execute(f'SELECT rowid AS id, {", ".join(cols)} FROM {t}' if t != 'configurations' else 'SELECT key AS id, value FROM configurations'):
                for c in cols:
                    v = r[c] if c in r.keys() else None
                    if isinstance(v, str) and (server.CREDENTIAL.search(v) or (tok and tok in v)):
                        leaks.append(f'{t}#{r["id"]}.{c}')
        check('no credential in any record', not leaks, ', '.join(leaks[:10]))
    finally:
        con.close()

    ok = all(c['pass'] for c in checks)
    if '--json' in argv:
        print(json.dumps({'result': 'PASS' if ok else 'FAIL', 'checks': checks}, indent=2))
    else:
        for c in checks:
            print(f"  {'✓' if c['pass'] else '✗'} {c['check']}" + (f"  — {c['detail']}" if c['detail'] and not c['pass'] else ''))
        print('PASS' if ok else 'FAIL')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
