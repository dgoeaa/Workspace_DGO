"""Folio Central Administration Centre — server behaviour.

Each test runs against a real server on an ephemeral loopback port with its own state directory,
so nothing here touches tools/admin-centre/data/. Run:

    python3 -m unittest discover -s tools/admin-centre/tests
"""
import http.client
import json
import os
import shutil
import socket
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PKG = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG))
os.environ['FOLIO_ADMIN_MONITOR'] = '0'
os.environ['FOLIO_ADMIN_ACCESS_LOG'] = '0'
import server  # noqa: E402


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Fake(BaseHTTPRequestHandler):
    """A stand-in platform (and Vault) whose answers the test controls."""
    routes = {}

    def log_message(self, *a):
        pass

    seen = []

    def _answer(self):
        n = int(self.headers.get('Content-Length') or 0)
        self.seen.append((self.command, self.path, {k.lower(): v for k, v in self.headers.items()}, self.rfile.read(n) if n else b''))
        status, body, headers = self.routes.get((self.command, self.path.split('?')[0]), (404, {'message': 'no'}, {}))
        data = json.dumps(body).encode()
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = _answer
    do_POST = _answer


class FakeOwner:
    """The flow owner's service as a sync reads it: the flows the owner sees, their state and their runs."""
    def __init__(self, flows, runs):
        self.flows, self.runs = flows, runs          # {flow id: state}, {flow id: [(status, start)]}
        self.lock = threading.RLock()
        self.state, self.last_sync, self.last_sync_result = 'signed-in', None, None

    def all(self, path):
        assert path == '/flows', path
        return [{'name': fid, 'properties': {'displayName': f'Flow {fid[:8]}', 'state': st}} for fid, st in self.flows.items()]

    def call(self, method, path):
        fid = path.split('/')[2].split('?')[0]
        if fid not in self.flows:
            raise server.ApiError(404, 'flow not found')
        if path == f'/flows/{fid}':
            return {'name': fid, 'properties': {'displayName': f'Flow {fid[:8]}', 'state': self.flows[fid]}}
        return {'value': [{'name': f'R{i}{fid[:8]}AAAAAAAA', 'properties': {'status': st, 'startTime': t, 'endTime': t, 'trigger': {'name': 'Recurrence'}}}
                          for i, (st, t) in enumerate(self.runs.get(fid, []))]}

    def trigger_identity(self, fid):
        return (None, None)

    def status(self):
        return {'state': self.state, 'lastSync': self.last_sync, 'lastSyncResult': self.last_sync_result}


class CentreTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix='folio-admin-test-')
        os.environ['FOLIO_ADMIN_HOME'] = self.home
        os.environ['FOLIO_ADMIN_PORT'] = str(free_port())
        os.environ.pop('FOLIO_VAULT_ADMIN_TOKEN', None)
        self.srv = server.build_server()
        self.app = self.srv.app
        self.port = self.srv.server_address[1]
        self.t = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.t.start()
        self.token = (Path(self.home) / 'config' / 'admin.token').read_text().strip()
        self.fakes = []

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        for f in self.fakes:
            f.shutdown()
            f.server_close()
        shutil.rmtree(self.home, ignore_errors=True)

    # ── helpers ────────────────────────────────────────────────────────────────────────
    def call(self, method, path, body=None, token='__admin__', headers=None, raw=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        h = {'Host': f'127.0.0.1:{self.port}'}
        if token == '__admin__':
            token = self.token
        if token:
            h['Authorization'] = 'Bearer ' + token
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            h['Content-Type'] = 'application/json'
        h.update(headers or {})
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        text = r.read().decode()
        c.close()
        try:
            payload = json.loads(text)
        except ValueError:
            payload = text
        return r.status, payload, dict(r.getheaders())

    def ok(self, method, path, body=None, token='__admin__', expect=(200, 201)):
        st, b, _ = self.call(method, path, body, token)
        self.assertIn(st, expect if isinstance(expect, tuple) else (expect,), b)
        return b

    def audit_count(self):
        return self.ok('GET', '/api/summary')['audit']

    def fake(self, routes):
        port = free_port()
        cls = type('F', (Fake,), {'routes': routes})
        srv = ThreadingHTTPServer(('127.0.0.1', port), cls)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.fakes.append(srv)
        return port, srv

    def set_platform_port(self, pid, port):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute('UPDATE platforms SET port=? WHERE id=?', (port, pid))
        con.commit()
        con.close()

    def operator(self, name, role):
        return self.ok('POST', '/api/operators', {'actor': 'root-admin', 'reason': 'Issue an operator token', 'name': name, 'role': role})['token']

    # ── the launcher's one-time sign-in ────────────────────────────────────────────────
    def write_launch(self, code, minutes=10, actor='Ada Operator'):
        exp = (server.utcnow() + server.timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%SZ')
        (Path(self.home) / 'config' / 'launch.json').write_text(json.dumps({'codeSha256': server.sha256_hex(code), 'expiresAt': exp, 'actor': actor}))

    def test_a_launch_code_unlocks_once_and_is_audited(self):
        code = 'c' * 43
        self.write_launch(code)
        st, b, _ = self.call('POST', '/api/launch', {'code': code}, token=None)
        self.assertEqual(st, 200, b)
        self.assertEqual(b, {'token': self.token, 'actor': 'Ada Operator'})
        self.assertFalse((Path(self.home) / 'config' / 'launch.json').exists(), 'a used code must be gone')
        st, b, _ = self.call('POST', '/api/launch', {'code': code}, token=None)
        self.assertEqual(st, 401, b)
        rows = self.ok('GET', '/api/audit?action=session.launch')['items']
        self.assertIn(('Ada Operator', 'session.launch'), [(r['actor'], r['action']) for r in rows])

    def test_a_launch_code_is_refused_when_wrong_expired_or_too_long_lived(self):
        self.write_launch('right' * 9)
        self.assertEqual(self.call('POST', '/api/launch', {'code': 'wrong' * 9}, token=None)[0], 401)
        self.assertTrue((Path(self.home) / 'config' / 'launch.json').exists(), 'a wrong guess must not spend the real code')
        self.write_launch('late' * 11, minutes=-1)
        self.assertEqual(self.call('POST', '/api/launch', {'code': 'late' * 11}, token=None)[0], 401)
        self.write_launch('long' * 11, minutes=server.LAUNCH_MAX_MINUTES + 5)
        self.assertEqual(self.call('POST', '/api/launch', {'code': 'long' * 11}, token=None)[0], 401)
        (Path(self.home) / 'config' / 'launch.json').unlink()
        self.assertEqual(self.call('POST', '/api/launch', {'code': 'none' * 11}, token=None)[0], 401)
        self.assertEqual(self.call('POST', '/api/launch', {'code': 'x' * 43}, token=None, headers={'Origin': 'http://evil.example'})[0], 403)

    # ── provisioning ───────────────────────────────────────────────────────────────────
    def test_provisions_six_platforms_and_the_register_estate(self):
        s = self.ok('GET', '/api/summary')
        self.assertEqual(s['platforms'], 6)
        rows, _ = server.read_estate(self.app.cfg.repo)
        self.assertEqual(s['endpoints'], len(rows))
        self.assertEqual(s['endpointsByScope'], {'internal': 19, 'portal': 7, 'mailer': 7})  # USER_ADMIN and ACTIVITY_LIFECYCLE in the register, 2026-10-10
        self.assertEqual(s['configurations'], len(self.app.cfg.file_settings))
        self.assertEqual(s['audit'], 1)
        self.assertEqual(s['health'], 0, 'no observation may exist before one is taken')
        ev = json.loads((Path(self.home) / 'evidence' / 'provisioning.json').read_text())
        self.assertEqual(ev['endpoints'], len(rows))
        self.assertEqual(oct(os.stat(Path(self.home) / 'config' / 'admin.token').st_mode & 0o777), '0o600')
        self.assertEqual(oct(os.stat(Path(self.home) / 'data' / 'folio_admin.db').st_mode & 0o777), '0o600')

    def test_no_signed_url_is_stored(self):
        eps = self.ok('GET', '/api/endpoints')['items']
        for e in eps:
            self.assertNotIn('sig=', json.dumps(e))
            if e['route']:
                self.assertTrue(e['route'].endswith('/triggers/manual/paths/invoke'), e['route'])

    def test_restart_preserves_records_and_does_not_reprovision(self):
        self.ok('POST', '/api/alerts', {'actor': 'ops', 'reason': 'Persistence check', 'severity': 'Low', 'asset': 'x', 'message': 'y', 'owner': 'z'})
        self.srv.shutdown()
        self.srv.server_close()
        self.srv = server.build_server()
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        s = self.ok('GET', '/api/summary')
        self.assertEqual((s['alerts'], s['endpoints'], s['audit']), (1, 33, 2))

    def test_migrates_a_1_0_database_forward(self):
        self.srv.shutdown()
        self.srv.server_close()
        db = Path(self.home) / 'data' / 'folio_admin.db'
        db.unlink()
        con = sqlite3.connect(db)
        con.executescript("""
          CREATE TABLE platforms(id TEXT PRIMARY KEY, name TEXT, type TEXT, entry_point TEXT, port INTEGER, status TEXT, updated_at TEXT);
          CREATE TABLE alerts(id INTEGER PRIMARY KEY, severity TEXT, asset TEXT, message TEXT, state TEXT, owner TEXT, created_at TEXT, updated_at TEXT);
          INSERT INTO alerts VALUES(1,'High','legacy','from 1.0','Open','ops','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');""")
        con.commit()
        con.close()
        self.srv = server.build_server()
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        a = self.ok('GET', '/api/alerts/1')
        self.assertEqual(a['source'], 'manual')
        self.assertEqual(a['message'], 'from 1.0')

    # ── the boundary ───────────────────────────────────────────────────────────────────
    def test_every_api_route_requires_the_token(self):
        st, b, _ = self.call('GET', '/api/summary', token=None)
        self.assertEqual(b['error'], 'unauthorized')
        for path in ('/api/summary', '/api/platforms', '/api/endpoints', '/api/configurations', '/api/health',
                     '/api/audit', '/api/alerts', '/api/incidents', '/api/changes', '/api/export'):
            self.assertEqual(self.call('GET', path, token=None)[0], 401, path)
            self.assertIn(self.call('GET', path, token='wrong-token')[0], (401, 429), path)

    def test_liveness_answers_without_data(self):
        st, b, _ = self.call('GET', '/healthz', token=None)
        self.assertEqual(st, 200)
        self.assertEqual(set(b), {'status', 'system', 'version'})

    def test_foreign_host_header_is_refused(self):
        st, b, _ = self.call('GET', '/api/summary', headers={'Host': 'attacker.example'})
        self.assertEqual(st, 403)

    def test_cross_origin_mutation_is_refused(self):
        st, b, _ = self.call('POST', '/api/alerts', {'actor': 'a1', 'reason': 'x' * 6}, headers={'Origin': 'http://evil.example'})
        self.assertEqual(st, 403)

    def test_security_headers_on_page_and_api(self):
        for path in ('/', '/api/summary'):
            _, _, h = self.call('GET', path)
            self.assertIn("script-src 'self'", h['Content-Security-Policy'])
            self.assertIn("frame-ancestors 'none'", h['Content-Security-Policy'])
            self.assertEqual(h['X-Content-Type-Options'], 'nosniff')
            self.assertEqual(h['Cache-Control'], 'no-store')

    def test_static_files_cannot_escape_their_directory(self):
        for p in ('/../server.py', '/%2e%2e/config/settings.json', '/brand/../../server.py'):
            st, _, _ = self.call('GET', p, token=None)
            self.assertIn(st, (403, 404), p)

    def test_repeated_bad_tokens_are_rate_limited(self):
        codes = [self.call('GET', '/api/summary', token=f'bad-{i}')[0] for i in range(21)]
        self.assertEqual(codes[:20], [401] * 20)
        self.assertEqual(codes[20], 429)

    def test_early_refusal_does_not_desynchronise_keep_alive(self):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        body = json.dumps({'actor': 'x1', 'reason': 'y' * 10}).encode()
        c.request('POST', '/api/alerts', body=body, headers={'Host': f'127.0.0.1:{self.port}', 'Content-Type': 'application/json', 'Authorization': 'Bearer nope'})
        r = c.getresponse()
        r.read()
        self.assertEqual(r.status, 401)
        c.close()
        self.assertEqual(self.call('GET', '/healthz', token=None)[0], 200)

    # ── validation ─────────────────────────────────────────────────────────────────────
    def test_mutations_require_reason_actor_and_valid_json(self):
        base = {'actor': 'ops', 'severity': 'High', 'asset': 'a', 'message': 'm', 'owner': 'o'}
        st, b, _ = self.call('POST', '/api/alerts', base)
        self.assertEqual((st, b['error']), (400, 'reason required'))
        st, b, _ = self.call('POST', '/api/alerts', {**base, 'actor': '', 'reason': 'Valid reason'})
        self.assertEqual((st, b['error']), (400, 'actor required'))
        st, b, _ = self.call('POST', '/api/alerts', raw=b'{not json', headers={'Content-Type': 'application/json'})
        self.assertEqual((st, b['error']), (400, 'invalid json'))
        st, b, _ = self.call('POST', '/api/alerts', {**base, 'reason': 'Valid reason', 'severity': 'Apocalyptic'})
        self.assertEqual(st, 400)

    def test_credentials_are_refused_in_free_text(self):
        leak = 'https://x.api.powerplatform.com/powerautomate/automations/direct/workflows/abc/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers&sv=1.0&sig=AbCdEf1234567890'
        base = {'actor': 'ops', 'severity': 'High', 'asset': 'a', 'owner': 'o', 'reason': 'A valid reason'}
        before = self.audit_count()
        for text in (leak, 'password: hunter22', 'Bearer ' + 'x' * 40, 'the token is ' + self.token):
            st, b, _ = self.call('POST', '/api/alerts', {**base, 'message': text})
            self.assertEqual((st, b['error']), (400, 'credential-like content refused'), text[:30])
        self.assertEqual(self.audit_count(), before, 'a refused credential must not reach the audit chain either')

    # ── records and lifecycles ─────────────────────────────────────────────────────────
    def test_alert_lifecycle_escalation_and_timeline(self):
        a = self.ok('POST', '/api/alerts', {'actor': 'operations-controller', 'reason': 'Endpoint health observation exceeded the stale threshold',
                                            'severity': 'High', 'asset': 'Folio Workspace endpoint estate', 'message': 'No current observation', 'owner': 'platform-administrator'})
        self.assertEqual(a['state'], 'Open')
        self.ok('POST', f"/api/alerts/{a['id']}/transition", {'actor': 'ops', 'reason': 'Taking ownership', 'to': 'Acknowledged'})
        st, b, _ = self.call('POST', f"/api/alerts/{a['id']}/transition", {'actor': 'ops', 'reason': 'Done here', 'to': 'Resolved'})
        self.assertEqual((st, b['error']), (400, 'note required'), 'resolving needs a resolution note')
        i = self.ok('POST', '/api/incidents', {'actor': 'incident-manager', 'reason': 'Coordinated investigation', 'severity': 'High',
                                               'title': 'Visibility unavailable', 'description': 'No observation inside 900 s', 'owner': 'workspace-owner', 'alertId': a['id']})
        inc = self.ok('GET', f"/api/incidents/{i['id']}")
        self.assertEqual(inc['alert']['id'], a['id'])
        alert = self.ok('GET', f"/api/alerts/{a['id']}")
        self.assertEqual([n['kind'] for n in alert['notes']], ['created', 'transition', 'escalated'])
        self.assertEqual([x['action'] for x in alert['audit']], ['alert.create', 'alert.acknowledged'])
        self.assertEqual(alert['incidents'][0]['id'], i['id'])
        st, b, _ = self.call('POST', f"/api/incidents/{i['id']}/transition", {'actor': 'im', 'reason': 'Skipping ahead', 'to': 'Closed', 'note': 'Premature'})
        self.assertEqual((st, b['error']), (409, 'transition not allowed'))
        self.ok('POST', f"/api/incidents/{i['id']}/transition", {'actor': 'im', 'reason': 'Found it', 'to': 'Investigating'})
        self.ok('POST', f"/api/incidents/{i['id']}/transition", {'actor': 'im', 'reason': 'Fixed', 'to': 'Resolved', 'note': 'Monitor re-enabled'})
        self.ok('POST', f"/api/incidents/{i['id']}/assign", {'actor': 'im', 'reason': 'Handover', 'owner': 'next-owner'})
        self.ok('POST', f"/api/incidents/{i['id']}/notes", {'actor': 'im', 'note': 'Post-incident review booked'})
        self.assertEqual(self.ok('GET', f"/api/incidents/{i['id']}")['owner'], 'next-owner')

    def test_change_maker_checker(self):
        body = {'actor': 'portfolio-administrator', 'reason': 'Register the approved transition into local operational use',
                'changeType': 'Operational activation', 'target': 'Folio Central Administration Centre', 'checker': 'Portfolio-Administrator'}
        before = self.audit_count()
        st, b, _ = self.call('POST', '/api/changes', body)
        self.assertEqual((st, b['error']), (400, 'maker and checker must differ'))
        self.assertEqual(self.audit_count(), before + 1, 'a maker-checker violation is evidence and is audited')
        c = self.ok('POST', '/api/changes', {**body, 'checker': 'change-manager', 'risk': 'Low', 'rollbackPlan': 'Stop the service'})
        cid = c['id']
        st, b, _ = self.call('POST', f'/api/changes/{cid}/transition', {'actor': 'portfolio-administrator', 'reason': 'Self approval', 'to': 'Approved'})
        self.assertEqual((st, b['error']), (403, 'maker cannot decide'))
        st, b, _ = self.call('POST', f'/api/changes/{cid}/transition', {'actor': 'someone-else', 'reason': 'Not the checker', 'to': 'Approved'})
        self.assertEqual((st, b['error']), (403, 'only the named checker may decide'))
        self.ok('POST', f'/api/changes/{cid}/transition', {'actor': 'change-manager', 'reason': 'Reviewed and approved', 'to': 'Approved'})
        self.ok('POST', f'/api/changes/{cid}/transition', {'actor': 'portfolio-administrator', 'reason': 'Executed', 'to': 'Implemented'})
        st, b, _ = self.call('POST', f'/api/changes/{cid}/transition', {'actor': 'portfolio-administrator', 'reason': 'Checked', 'to': 'Verified'})
        self.assertEqual(st, 400, 'verification needs its evidence')
        self.ok('POST', f'/api/changes/{cid}/transition', {'actor': 'portfolio-administrator', 'reason': 'Checked', 'to': 'Verified', 'note': 'Smoke checks passed'})
        rec = self.ok('GET', f'/api/changes/{cid}')
        self.assertEqual((rec['state'], rec['decided_by'], rec['transitions']), ('Verified', 'change-manager', []))
        results = [a['result'] for a in self.ok('GET', '/api/audit?target=change:%d' % cid)['items']]
        self.assertEqual(results.count('Failed'), 2)

    # ── operators and roles ────────────────────────────────────────────────────────────
    def test_operator_roles_are_enforced_and_attributed(self):
        viewer = self.operator('exec-viewer', 'viewer')
        cm = self.operator('change-manager', 'change_manager')
        maker = self.operator('platform-admin', 'platform_admin')
        self.assertTrue(viewer.startswith('fac_'))
        self.assertEqual(self.ok('GET', '/api/session', token=viewer)['role'], 'viewer')
        self.ok('GET', '/api/summary', token=viewer)
        st, b, _ = self.call('POST', '/api/alerts', {'reason': 'Viewer tries', 'severity': 'Low', 'asset': 'a', 'message': 'm', 'owner': 'o'}, token=viewer)
        self.assertEqual((st, b['error']), (403, 'forbidden'))
        denied = self.ok('GET', '/api/audit?result=Denied')['items']
        self.assertEqual(denied[0]['actor'], 'exec-viewer')
        self.assertEqual(self.call('GET', '/api/operators', token=viewer)[0], 403)
        # the body cannot impersonate: operator tokens carry their own name
        c = self.ok('POST', '/api/changes', {'actor': 'spoofed', 'reason': 'Rotate the portal trigger', 'changeType': 'Rotation', 'target': 'portal:SUBMISSION', 'checker': 'change-manager'}, token=maker)
        self.assertEqual(c['actor'], 'platform-admin')
        self.ok('POST', f"/api/changes/{c['id']}/transition", {'reason': 'Approved at CAB', 'to': 'Approved'}, token=cm)
        # disable and rotate
        ops = self.ok('GET', '/api/operators')['items']
        vid = [o for o in ops if o['name'] == 'exec-viewer'][0]['id']
        self.assertNotIn('token_digest', ops[0])
        self.ok('POST', f'/api/operators/{vid}/disable', {'actor': 'root-admin', 'reason': 'Left the programme'})
        self.assertEqual(self.call('GET', '/api/summary', token=viewer)[0], 401)
        self.ok('POST', f'/api/operators/{vid}/enable', {'actor': 'root-admin', 'reason': 'Returned'})
        new = self.ok('POST', f'/api/operators/{vid}/rotate', {'actor': 'root-admin', 'reason': 'Scheduled rotation'})['token']
        self.assertEqual(self.call('GET', '/api/summary', token=viewer)[0], 401)
        self.assertEqual(self.call('GET', '/api/summary', token=new)[0], 200)
        st, b, _ = self.call('POST', '/api/operators', {'actor': 'root-admin', 'reason': 'Try escalation', 'name': 'x9', 'role': 'super_admin'})
        self.assertEqual(st, 400, 'super_admin is the bootstrap token alone')

    def test_bootstrap_rotation_retires_the_old_token(self):
        old = self.token
        new = self.ok('POST', '/api/access/rotate-bootstrap', {'actor': 'root-admin', 'reason': 'Scheduled token rotation'})['token']
        self.assertEqual(self.call('GET', '/api/summary', token=old)[0], 401)
        self.assertEqual(self.call('GET', '/api/summary', token=new)[0], 200)
        self.assertEqual((Path(self.home) / 'config' / 'admin.token').read_text().strip(), new)
        self.assertEqual(oct(os.stat(Path(self.home) / 'config' / 'admin.token').st_mode & 0o777), '0o600')

    # ── configuration ──────────────────────────────────────────────────────────────────
    def test_configuration_changes_are_versioned_and_bounded(self):
        r = self.ok('PUT', '/api/configurations/staleAfterSeconds', {'actor': 'root-admin', 'reason': 'Tighter freshness', 'value': 600})
        self.assertEqual((r['from'], r['value'], r['version']), (900, 600, 2))
        self.assertEqual(self.ok('GET', '/api/health/status')['staleAfterSeconds'], 600)
        self.assertEqual(self.ok('GET', '/api/configurations/staleAfterSeconds/history')['items'][0]['reason'], 'Tighter freshness')
        self.assertEqual(self.call('PUT', '/api/configurations/port', {'actor': 'a1', 'reason': 'Move it', 'value': 9000})[0], 409)
        self.assertEqual(self.call('PUT', '/api/configurations/retentionDays', {'actor': 'a1', 'reason': 'Shorten it', 'value': 30})[0], 400)
        self.assertEqual(self.call('PUT', '/api/configurations/vaultUrl', {'actor': 'a1', 'reason': 'Point away', 'value': 'https://example.com'})[0], 400)
        self.assertEqual(self.call('PUT', '/api/configurations/autoAlert', {'actor': 'a1', 'reason': 'Type check', 'value': 'maybe'})[0], 400)
        self.assertEqual(self.call('PUT', '/api/configurations/nope', {'actor': 'a1', 'reason': 'Unknown', 'value': 1})[0], 404)

    # ── health and monitoring ──────────────────────────────────────────────────────────
    def test_unknown_is_never_healthy(self):
        st = self.ok('GET', '/api/health/status')
        self.assertEqual({a['state'] for a in st['assets']}, {'Unknown'})

    def test_probe_records_health_and_monitor_raises_then_resolves(self):
        port, fake = self.fake({('GET', '/'): (200, {'ok': True}, {'X-DGO-Platform': 'portal'})})
        self.set_platform_port('portal', port)
        r = self.ok('POST', '/api/probe/portal', {'actor': 'ops', 'reason': 'Initial reading'})
        self.assertEqual(r['results'][0]['state'], 'Healthy')
        fake.shutdown()
        fake.server_close()
        self.fakes.remove(fake)
        r = self.ok('POST', '/api/probe/portal', {'actor': 'ops', 'reason': 'After outage'})
        self.assertEqual(r['results'][0]['state'], 'Unavailable')
        alerts = self.ok('GET', '/api/alerts?source=monitor')['items']
        self.assertEqual(len(alerts), 1)
        self.assertEqual((alerts[0]['asset'], alerts[0]['severity'], alerts[0]['state']), ('platform:portal', 'High', 'Open'))
        self.ok('POST', '/api/probe/portal', {'actor': 'ops', 'reason': 'Still out'})
        self.assertEqual(len(self.ok('GET', '/api/alerts?source=monitor')['items']), 1, 'one alert per outage, not one per probe')
        port2, _ = self.fake({('GET', '/'): (200, {}, {'X-DGO-Platform': 'portal'})})
        self.set_platform_port('portal', port2)
        self.ok('POST', '/api/probe/portal', {'actor': 'ops', 'reason': 'Recovered'})
        a = self.ok('GET', f"/api/alerts/{alerts[0]['id']}")
        self.assertEqual(a['state'], 'Resolved')
        self.assertTrue(self.ok('GET', '/api/audit/verify')['valid'])

    def test_wrong_platform_on_a_port_is_degraded(self):
        port, _ = self.fake({('GET', '/'): (200, {}, {'X-DGO-Platform': 'mailer'})})
        self.set_platform_port('portal', port)
        r = self.ok('POST', '/api/probe/portal', {'actor': 'ops', 'reason': 'Identity check'})
        self.assertEqual(r['results'][0]['state'], 'Degraded')

    def test_maintenance_suppresses_monitor_alerts(self):
        self.ok('POST', '/api/platforms/workbench/status', {'actor': 'pa', 'reason': 'Planned upgrade', 'status': 'Maintenance'})
        self.set_platform_port('workbench', free_port())
        self.ok('POST', '/api/probe/workbench', {'actor': 'ops', 'reason': 'During maintenance'})
        self.assertEqual(self.ok('GET', '/api/alerts?source=monitor')['total'], 0)

    def test_old_observation_reads_stale(self):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES('platform','mailer','Healthy',5,'old','2020-01-01T00:00:00Z','probe')")
        con.commit()
        con.close()
        a = [x for x in self.ok('GET', '/api/health/status')['assets'] if x['assetId'] == 'mailer'][0]
        self.assertEqual((a['state'], a['lastState']), ('Stale', 'Healthy'))

    def test_ingest_validates_the_asset(self):
        self.ok('POST', '/api/health', {'actor': 'ops', 'reason': 'Flow run history', 'assetType': 'endpoint', 'assetId': 'portal:SUBMISSION', 'state': 'Healthy', 'latencyMs': 812, 'message': 'Run succeeded'})
        self.assertEqual(self.call('POST', '/api/health', {'actor': 'ops', 'reason': 'Bad asset', 'assetType': 'endpoint', 'assetId': 'portal:NOPE', 'state': 'Healthy', 'message': 'x'})[0], 404)
        a = [x for x in self.ok('GET', '/api/health/status')['assets'] if x['assetId'] == 'portal:SUBMISSION'][0]
        self.assertEqual(a['state'], 'Healthy')

    def test_retention_prunes_only_observations(self):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES('platform','mailer','Healthy',5,'ancient','1990-01-01T00:00:00Z','probe')")
        con.commit()
        con.close()
        r = self.ok('POST', '/api/retention/run', {'actor': 'root-admin', 'reason': 'Quarterly retention'})
        self.assertEqual(r['removed'], 1)
        self.assertEqual(self.ok('GET', '/api/audit?action=retention.prune')['total'], 1)

    # ── Vault ──────────────────────────────────────────────────────────────────────────
    def test_vault_verification_records_endpoint_health(self):
        port, _ = self.fake({
            ('GET', '/health'): (200, {'status': 'healthy', 'version': '1.0.0'}, {}),
            ('GET', '/admin/flows'): (200, {'flows': [{'alias': 'portal.submission', 'enabled': 1, 'verified_at': '2026-09-29T00:00:00Z'}, {'alias': 'orphan.alias', 'enabled': 1}]}, {}),
            ('POST', '/admin/flows/portal.submission/verify'): (200, {'alias': 'portal.submission', 'version': 3, 'verified': True}, {}),
        })
        self.ok('PUT', '/api/configurations/vaultUrl', {'actor': 'root-admin', 'reason': 'Test Vault', 'value': f'http://127.0.0.1:{port}'})
        st, b, _ = self.call('POST', '/api/vault/verify', {'actor': 'pa', 'reason': 'Verify alias', 'alias': 'portal.submission'})
        self.assertEqual((st, b['error']), (409, 'vault not configured'))
        os.environ['FOLIO_VAULT_ADMIN_TOKEN'] = 'fc_test'
        try:
            v = self.ok('GET', '/api/vault')
            self.assertTrue(v['reachable'])
            self.assertEqual(v['unmapped'], ['orphan.alias'])
            self.assertTrue([e for e in v['reconciliation'] if e['vault_alias'] == 'portal.submission'][0]['inVault'])
            r = self.ok('POST', '/api/vault/verify', {'actor': 'pa', 'reason': 'Verify alias', 'alias': 'portal.submission'})
            self.assertTrue(r['verified'])
            a = [x for x in self.ok('GET', '/api/health/status')['assets'] if x['assetId'] == 'portal:SUBMISSION'][0]
            self.assertEqual((a['state'], a['source']), ('Healthy', 'vault'))
        finally:
            os.environ.pop('FOLIO_VAULT_ADMIN_TOKEN', None)

    # ── estate ─────────────────────────────────────────────────────────────────────────
    def test_reconcile_restores_register_truth_and_retires_strays(self):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE endpoints SET workflow_id='tampered' WHERE endpoint_key='FETCH_ALL'")
        con.execute("INSERT INTO endpoints(scope,endpoint_key,flow_name,method,platform_id,state,updated_at) VALUES('internal','GONE','Gone','POST','workspace','Registered','2026-01-01T00:00:00Z')")
        con.commit()
        con.close()
        r = self.ok('POST', '/api/estate/reconcile', {'actor': 'pa', 'reason': 'Register changed'})
        self.assertEqual(r['retired'], ['internal:GONE'])
        self.assertEqual(r['updated'][0]['endpoint'], 'internal:FETCH_ALL')
        fa = self.ok('GET', '/api/endpoints?q=FETCH_ALL')['items']
        self.assertEqual([e['workflow_id'] for e in fa if e['endpoint_key'] == 'FETCH_ALL'], ['aa662769f13a4666bfadf3039cd8d247'])

    def test_vault_aliases_follow_the_naming_rule_and_old_defaults_move(self):
        """IDENTIFICATION_SYSTEM.md §17: <system code>.<key>; the Workspace is runtime, not internal."""
        fa = [e for e in self.ok('GET', '/api/endpoints?q=FETCH_ALL')['items'] if e['endpoint_key'] == 'FETCH_ALL'][0]
        self.assertEqual(fa['vault_alias'], 'runtime.fetch-all')
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE endpoints SET vault_alias='internal.fetch-all' WHERE endpoint_key='FETCH_ALL'")
        con.execute("UPDATE endpoints SET vault_alias='operator.chosen' WHERE endpoint_key='GET_DOCS'")
        con.commit()
        con.close()
        self.ok('POST', '/api/estate/reconcile', {'actor': 'pa', 'reason': 'Move old aliases'})
        items = {e['endpoint_key']: e['vault_alias'] for e in self.ok('GET', '/api/endpoints?scope=internal')['items']}
        self.assertEqual(items['FETCH_ALL'], 'runtime.fetch-all')
        self.assertEqual(items['GET_DOCS'], 'operator.chosen')

    def test_endpoint_state_change(self):
        eid = self.ok('GET', '/api/endpoints?scope=portal&q=UPLOAD')['items'][0]['id']
        self.ok('POST', f'/api/endpoints/{eid}/state', {'actor': 'pa', 'reason': 'Commissioned at go-live', 'state': 'Commissioned'})
        self.assertEqual(self.call('POST', f'/api/endpoints/{eid}/state', {'actor': 'pa', 'reason': 'Bad alias', 'state': 'Registered', 'vaultAlias': 'Bad Alias'})[0], 400)

    # ── every Folio flow, from the flow catalogue ──────────────────────────────────────
    SWEEP, WATCH, INTAKE = '8c19b45c-4174-4d2f-9429-ffd08dd1a5ae', 'c38bfeaa-4c88-47a5-a9e2-f5d0e610efb6', 'b6d92bae-591e-fa1e-52eb-b350cad988a7'

    def flow_alerts(self, fid):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        rows = con.execute("SELECT source, severity, state FROM alerts WHERE asset=? ORDER BY id", (f'flow:{fid}',)).fetchall()
        con.close()
        return rows

    def test_every_folio_flow_is_provisioned_from_the_catalogue(self):
        flows, _ = server.read_catalogue(self.app.cfg.repo)
        d = self.ok('GET', '/api/flows')
        self.assertEqual(d['catalogue']['flows'], len(flows))
        self.assertEqual(len(d['flows']), len(flows), 'every Folio flow is listed, and no other')
        self.assertEqual(d['unresolved'], [], 'the adoption register settles every endpoint with several candidates')
        by = {f['flowId']: f for f in d['flows']}
        self.assertEqual((by[self.SWEEP]['endpoints'], by[self.SWEEP]['group']), ([], 'Scheduled and event-driven'))
        self.assertEqual(by[self.INTAKE]['expectedState'], 'Stopped')
        fetch_all = [f for f in d['flows'] if 'internal:FETCH_ALL' in f['endpoints']][0]
        self.assertEqual((fetch_all['flowId'], fetch_all['identity']), ('b79e6707-df4d-4ae7-8a65-738aa45e9a73', 'adoption'))
        self.assertEqual(d['catalogue']['withoutEndpoint'], sum(1 for f in d['flows'] if not f['endpoints']))

    def test_sync_watches_the_flows_no_endpoint_names(self):
        """A scheduled flow's failed run and a flow out of its expected state each raise one alert, and recover."""
        owner = FakeOwner({self.SWEEP: 'Started', self.WATCH: 'Stopped', self.INTAKE: 'Stopped'},
                          {self.SWEEP: [('Failed', '2026-10-20T07:45:00Z'), ('Succeeded', '2026-10-17T07:45:00Z')],
                           self.WATCH: [('Succeeded', '2026-10-17T17:00:00Z')]})
        self.app.owner = owner
        r = self.app.flow_sync('test-suite', 'Test sync')
        self.assertEqual(r['folioFlowsVisible'], 3)
        self.assertEqual(self.flow_alerts(self.SWEEP), [('flow-runs', 'High', 'Open')])
        self.assertEqual(self.flow_alerts(self.WATCH), [('flow-state', 'High', 'Open')])
        self.assertEqual(self.flow_alerts(self.INTAKE), [], 'off by design is not an alert')
        by = {f['flowId']: f for f in self.ok('GET', '/api/flows')['flows']}
        self.assertEqual((by[self.SWEEP]['lastRun']['status'], by[self.WATCH]['stateMismatch'], by[self.INTAKE]['stateMismatch']), ('Failed', True, False))
        self.assertEqual(len(self.ok('GET', f'/api/flows/{self.SWEEP}/runs')['items']), 2, 'a catalogue flow is governed: its runs can be read')
        self.app.flow_sync('test-suite', 'Test sync again')
        self.assertEqual(len(self.flow_alerts(self.SWEEP)), 1, 'one alert per failure, not one per sync')
        owner.flows[self.WATCH] = 'Started'
        owner.runs[self.SWEEP].insert(0, ('Succeeded', '2026-10-21T07:45:00Z'))
        self.app.flow_sync('test-suite', 'Recovered')
        self.assertEqual(self.flow_alerts(self.SWEEP), [('flow-runs', 'High', 'Resolved')])
        self.assertEqual(self.flow_alerts(self.WATCH), [('flow-state', 'High', 'Resolved')])

    def test_reconcile_and_start_follow_the_catalogue(self):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE folio_flows SET expected_state='Stopped' WHERE flow_id=?", (self.SWEEP,))
        con.execute("INSERT INTO folio_flows VALUES('00000000-0000-0000-0000-000000000000','Gone','g','t','p','Started','Registered','2026-01-01T00:00:00Z')")
        con.commit()
        con.close()
        r = self.ok('POST', '/api/estate/reconcile', {'actor': 'pa', 'reason': 'Catalogue changed'})
        self.assertEqual(r['folioFlows']['retired'], ['Gone'])
        self.assertEqual(r['folioFlows']['updated'], [{'flow': 'AUTO_SCHEDULED_SWEEP', 'fields': ['expected_state']}])
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        registered = con.execute("SELECT COUNT(*) FROM folio_flows WHERE state='Registered'").fetchone()[0]
        con.close()
        self.assertEqual(registered, len(server.read_catalogue(self.app.cfg.repo)[0]))

    def test_only_the_platforms_on_this_computer_are_probed(self):
        self.app.cfg.local_platforms = {'console'}
        try:
            st, b, _ = self.call('POST', '/api/probe/workspace', {'actor': 'ops', 'reason': 'Probe'})
            self.assertEqual((st, b['error']), (409, 'not on this computer'))
            r = self.ok('POST', '/api/probe', {'actor': 'ops', 'reason': 'Probe all'})
            self.assertEqual([x['platform'] for x in r['results']], ['console'])
            plats = {a['assetId']: a for a in self.ok('GET', '/api/health/status')['assets'] if a['assetType'] == 'platform'}
            self.assertEqual((plats['workspace']['state'], plats['workspace']['local']), ('Not on this computer', False))
            self.assertTrue(plats['console']['local'])
            con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
            raised = [a[0] for a in con.execute("SELECT asset FROM alerts WHERE source='monitor'")]
            con.close()
            self.assertNotIn('platform:workspace', raised, 'a published site is never reported down')
        finally:
            self.app.cfg.local_platforms = None
        os.environ['FOLIO_ADMIN_LOCAL_PLATFORMS'] = 'console,nonesuch'
        try:
            with self.assertRaises(SystemExit):
                server.Config()
        finally:
            os.environ.pop('FOLIO_ADMIN_LOCAL_PLATFORMS')

    # ── sections the Centre hosts ──────────────────────────────────────────────────────
    def raw_get(self, path):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.request('GET', path, headers={'Host': f'127.0.0.1:{self.port}'})
        r = c.getresponse()
        body = r.read()
        c.close()
        return r.status, body, {k.lower(): v for k, v in r.getheaders()}

    def test_sections_are_served_sandboxed_from_the_repository(self):
        st, body, h = self.raw_get('/sections/estate-console')
        self.assertEqual(st, 200)
        self.assertIn(b'Folio Estate Console', body)
        self.assertTrue(h['content-security-policy'].startswith('sandbox allow-scripts'), 'a section runs in an opaque origin')
        self.assertIn("frame-ancestors 'self'", h['content-security-policy'])
        self.assertEqual((h['x-frame-options'], h['x-dgo-platform']), ('SAMEORIGIN', 'console'))
        st, _, h = self.raw_get('/sections/provisioning')
        self.assertEqual((st, h['location']), (301, '/sections/provisioning/'))
        st, body, _ = self.raw_get('/sections/provisioning/')
        self.assertEqual(st, 200)
        self.assertIn(b'console.js', body)
        self.assertEqual(self.raw_get('/sections/provisioning/console.js')[0], 200)
        for bad in ('/sections/provisioning/../../../registers/flow-catalogue.json', '/sections/provisioning/%2e%2e/%2e%2e/README.md',
                    '/sections/nonesuch/', '/sections/estate-console/extra'):
            self.assertIn(self.raw_get(bad)[0], (403, 404), bad)
        st, _, h = self.raw_get('/')
        self.assertIn("frame-ancestors 'none'", h['content-security-policy'], 'the Centre itself is never framed')

    def test_only_the_analysis_modules_are_served(self):
        st, body, h = self.raw_get('/modules/core/endpoint-atlas.js')
        self.assertEqual(st, 200)
        self.assertTrue(h['content-type'].startswith('application/javascript'))
        self.assertIn(b'export function describeKey', body)
        self.assertIn("frame-ancestors 'none'", h['content-security-policy'], 'a module runs under the Centre\'s own policy')
        for bad in ('/modules/config/config.local.js', '/modules/server.py', '/modules/../server.py', '/modules/core/auth.js', '/modules/'):
            self.assertEqual(self.raw_get(bad)[0], 404, bad)

    def test_the_hosted_console_is_probed_at_the_centre(self):
        self.app.cfg.local_platforms = {'vault'}
        try:
            r = self.ok('POST', '/api/probe', {'actor': 'ops', 'reason': 'Probe all'})
            got = {x['platform']: x for x in r['results']}
            self.assertEqual(sorted(got), ['console', 'vault'])
            self.assertEqual(got['console']['state'], 'Healthy')
            self.assertTrue(got['console']['message'].startswith('Hosted by the Centre'))
            plats = {a['assetId']: a for a in self.ok('GET', '/api/health/status')['assets'] if a['assetType'] == 'platform'}
            self.assertEqual((plats['console']['hosted'], plats['workspace']['published']), ('/sections/estate-console', 'https://folio-platform.page.gd/'))
        finally:
            self.app.cfg.local_platforms = None

    # ── test a flow ────────────────────────────────────────────────────────────────────
    def test_a_read_only_flow_is_called_through_the_vault_under_a_folio_sign_in(self):
        port, srv = self.fake({
            ('POST', '/invoke/runtime.otp-generate'): (200, {'sent': True}, {}),
            ('POST', '/invoke/runtime.otp-verify'): (200, {'data': {'token': 'proof-abc', 'expiresAt': '2099-01-01T00:00:00Z', 'verified': True}}, {}),
            ('POST', '/invoke/runtime.reference-data'): (200, {'ok': True, 'data': {'departments': ['DGO'], 'link': 'https://x.test/a?sig=' + 'q' * 43}}, {}),
        })
        cls = srv.RequestHandlerClass
        cls.seen = []
        self.ok('PUT', '/api/configurations/vaultUrl', {'actor': 'root-admin', 'reason': 'Test Vault', 'value': f'http://127.0.0.1:{port}'})
        st, b, _ = self.call('POST', '/api/test/sign-in', {'actor': 'pa', 'reason': 'Sign in', 'email': 'officer@nitda.gov.ng'})
        self.assertEqual((st, b['error']), (409, 'vault not configured'))
        os.environ['FOLIO_VAULT_INVOKE_TOKEN'] = 'fc_invoke'
        try:
            st, b, _ = self.call('POST', '/api/test/run', {'actor': 'pa', 'reason': 'Before sign-in', 'key': 'REFERENCE_DATA', 'payload': {}})
            self.assertEqual((st, b['error']), (409, 'not signed in to Folio'))
            self.assertTrue(self.ok('POST', '/api/test/sign-in', {'actor': 'pa', 'reason': 'Sign in', 'email': 'Officer@NITDA.gov.ng'})['sent'])
            d = self.ok('POST', '/api/test/verify', {'actor': 'pa', 'reason': 'Sign in', 'email': 'officer@nitda.gov.ng', 'code': '123456'})
            self.assertEqual((d['signedIn'], d['email']), (True, 'officer@nitda.gov.ng'))
            gen = json.loads(cls.seen[0][3])
            self.assertEqual((gen['action'], gen['operation'], gen['identifier']), ('generate', 'requestOtp', 'officer@nitda.gov.ng'))
            self.assertEqual(cls.seen[0][2].get('authorization'), 'Bearer fc_invoke')
            for key in ('DYNAMIC_ACTIONS', 'EMAIL', 'SINGLE_ASSIGNMENT', 'OTP_GENERATE'):
                st, b, _ = self.call('POST', '/api/test/run', {'actor': 'pa', 'reason': 'Write', 'key': key, 'payload': {}})
                self.assertEqual((st, b['error']), (400, 'not testable'), key)
            r = self.ok('POST', '/api/test/run', {'actor': 'pa', 'reason': 'Read the lists', 'key': 'REFERENCE_DATA', 'payload': {'list': 'departments'}})
            self.assertEqual((r['status'], r['reply']['data']['departments']), (200, ['DGO']))
            self.assertNotIn('q' * 43, json.dumps(r), 'a signature in a reply is redacted')
            call = cls.seen[-1]
            self.assertEqual((call[1], call[2].get('x-dgo-proof')), ('/invoke/runtime.reference-data', 'Bearer proof-abc'))
            sent = json.loads(call[3])
            self.assertEqual((sent['action'], sent['payload']), ('lookups', {'list': 'departments'}))
            st, b, _ = self.call('POST', '/api/test/run', {'actor': 'pa', 'reason': 'Again', 'key': 'REFERENCE_DATA', 'payload': {}})
            self.assertEqual((st, b['error']), (429, 'too soon'))
            self.assertEqual(self.ok('GET', '/api/audit?action=flow.test')['total'], 1)
            blob = b''.join(p.read_bytes() for p in (Path(self.home) / 'data').glob('*'))
            self.assertNotIn(b'proof-abc', blob, 'the Folio proof is never stored')
            self.assertFalse(self.ok('POST', '/api/test/sign-out', {'actor': 'pa', 'reason': 'Done'})['signedIn'])
        finally:
            os.environ.pop('FOLIO_VAULT_INVOKE_TOKEN', None)

    # ── evidence ───────────────────────────────────────────────────────────────────────
    def test_audit_chain_detects_tampering(self):
        self.ok('POST', '/api/alerts', {'actor': 'ops', 'reason': 'Chain content', 'severity': 'Low', 'asset': 'a', 'message': 'm', 'owner': 'o'})
        self.assertTrue(self.ok('GET', '/api/audit/verify')['valid'])
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE audit SET reason='rewritten' WHERE id=2")
        con.commit()
        con.close()
        v = self.ok('GET', '/api/audit/verify')
        self.assertEqual((v['valid'], v['mismatchAt']), (False, 2))

    def test_backup_export_and_csv(self):
        b = self.ok('POST', '/api/backups', {'actor': 'root-admin', 'reason': 'Weekly backup'})
        f = Path(self.home) / 'backups' / b['file']
        self.assertEqual(oct(f.stat().st_mode & 0o777), '0o600')
        con = sqlite3.connect(f)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM endpoints').fetchone()[0], 33)  # USER_ADMIN and ACTIVITY_LIFECYCLE in the register, 2026-10-10
        con.close()
        self.assertEqual(self.ok('GET', '/api/backups')['items'][0]['file'], b['file'])
        st, bundle, h = self.call('GET', '/api/export?actor=auditor-one')
        self.assertEqual(st, 200)
        self.assertIn('attachment', h['Content-Disposition'])
        self.assertTrue(bundle['auditChain']['valid'])
        self.assertEqual(len(bundle['records']['endpoints']), 33)
        self.ok('POST', '/api/alerts', {'actor': 'ops', 'reason': 'CSV injection check', 'severity': 'Low', 'asset': '=HYPERLINK("x")', 'message': 'm', 'owner': 'o'})
        st, text, _ = self.call('GET', '/api/export/alerts.csv')
        self.assertIn("'=HYPERLINK", text)
        self.assertEqual(self.ok('GET', '/api/audit?action=evidence.export')['total'], 1)

    def test_checklist_and_metrics(self):
        cl = self.ok('GET', '/api/checklist')['items']
        by = {i['check']: i['pass'] for i in cl}
        self.assertTrue(by['Portfolio count is 6'])
        self.assertTrue(by['Endpoint estate matches the registers'])
        self.assertTrue(by['Token file is 0600'])
        self.assertFalse(by['Every platform has a current healthy observation'], 'Unknown is not healthy')
        m = self.ok('GET', '/api/metrics')
        self.assertGreater(m['requests'], 0)
        self.assertEqual(m['schemaVersion'], server.SCHEMA_VERSION)

    def test_search_and_filters(self):
        self.assertTrue(any(r['kind'] == 'endpoint' for r in self.ok('GET', '/api/search?q=OTP')['results']))
        self.assertEqual(self.ok('GET', '/api/endpoints?scope=mailer')['total'], 7)
        self.assertEqual(self.ok('GET', '/api/endpoints?scope=internal,portal')['total'], 26)
        self.assertEqual(self.call('GET', '/api/nothing-here')[0], 404)
        self.assertEqual(self.call('DELETE', '/api/alerts')[0], 405)

    def test_refuses_to_bind_beyond_loopback(self):
        os.environ['FOLIO_ADMIN_HOST'] = '0.0.0.0'
        try:
            with self.assertRaises(SystemExit):
                server.Config()
        finally:
            os.environ.pop('FOLIO_ADMIN_HOST')



class ToolkitBuildTest(unittest.TestCase):
    """The Centre names the Administrator Toolkit it came in (BUILD-ID.json beside server.py); a repository copy says so."""

    def test_repository_copy_and_toolkit_copy(self):
        saved = server.PKG
        try:
            with tempfile.TemporaryDirectory() as d:
                server.PKG = __import__('pathlib').Path(d)
                self.assertEqual(server.toolkit_build()['label'], 'repository copy')
                (server.PKG / 'BUILD-ID.json').write_text(json.dumps({'label': 'NITDA-Folio-Administrator-Toolkit-v2026.10.20-1-abc', 'version': '2026.10.20-1', 'commit': 'abcdef1234'}))
                self.assertEqual(server.toolkit_build(), {'label': 'NITDA-Folio-Administrator-Toolkit-v2026.10.20-1-abc', 'version': '2026.10.20-1', 'commit': 'abcdef12'})
        finally:
            server.PKG = saved

if __name__ == '__main__':
    unittest.main()
