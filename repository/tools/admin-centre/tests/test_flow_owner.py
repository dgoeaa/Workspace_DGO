"""The flow-owner connector against a stand-in for the Microsoft identity platform and the flow service.

The stand-in answers exactly the user-scoped paths the Centre is allowed to call and fails the
test on anything else — in particular any /scopes/admin/ path. Run:

    python3 -m unittest discover -s tools/admin-centre/tests
"""
import base64
import http.client
import json
import os
import re
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
from urllib.parse import parse_qs, urlsplit

PKG = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PKG))
sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ['FOLIO_ADMIN_MONITOR'] = '0'
os.environ['FOLIO_ADMIN_ACCESS_LOG'] = '0'
import server  # noqa: E402

from fake_microsoft import ENV, SECRET_SIG, Tenant, fake_jwt, free_port, handler_for  # noqa: E402,F401


class FlowOwnerTest(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.mkdtemp(prefix='folio-flow-owner-')
        rows, _ = server.read_estate(PKG.parent.parent)
        self.tenant = Tenant(rows)
        fport = free_port()
        self.fake = ThreadingHTTPServer(('127.0.0.1', fport), handler_for(self.tenant))
        threading.Thread(target=self.fake.serve_forever, daemon=True).start()
        os.environ.update({'FOLIO_ADMIN_HOME': self.home, 'FOLIO_ADMIN_PORT': str(free_port()),
                           'FOLIO_ADMIN_FLOW_API': f'http://127.0.0.1:{fport}', 'FOLIO_ADMIN_LOGIN': f'http://127.0.0.1:{fport}'})
        self.srv = server.build_server()
        self.app = self.srv.app
        self.app.owner.poll_seconds = 0.05
        self.port = self.srv.server_address[1]
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.token = (Path(self.home) / 'config' / 'admin.token').read_text().strip()

    def tearDown(self):
        self.app.owner.sign_out()
        self.srv.shutdown()
        self.srv.server_close()
        self.fake.shutdown()
        self.fake.server_close()
        for k in ('FOLIO_ADMIN_FLOW_API', 'FOLIO_ADMIN_LOGIN'):
            os.environ.pop(k, None)
        shutil.rmtree(self.home, ignore_errors=True)

    def call(self, method, path, body=None, token=None):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=30)
        h = {'Host': f'127.0.0.1:{self.port}', 'Authorization': 'Bearer ' + (token or self.token)}
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            h['Content-Type'] = 'application/json'
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        out = json.loads(r.read() or b'{}')
        c.close()
        return r.status, out

    def ok(self, method, path, body=None, token=None):
        st, b = self.call(method, path, body, token)
        self.assertIn(st, (200, 201), b)
        return b

    def sign_in(self):
        st = self.ok('POST', '/api/tenant/sign-in', {'actor': 'platform-admin', 'reason': 'Connect as the owner of the estate flows'})
        self.assertEqual(st['device']['userCode'], 'ABCD-EFGH')
        for _ in range(100):
            if self.ok('GET', '/api/tenant')['state'] == 'signed-in':
                break
            time.sleep(0.05)
        self.assertEqual(self.ok('GET', '/api/tenant')['user']['email'], 'dgsregistry@nitda.gov.ng')
        for _ in range(100):   # the first sync runs by itself after sign-in
            if self.ok('GET', '/api/tenant').get('lastSync'):
                break
            time.sleep(0.05)

    # ── before sign-in ─────────────────────────────────────────────────────────────────
    def test_estate_carries_tenant_identity_and_mailer_deployment(self):
        eps = self.ok('GET', '/api/endpoints?scope=mailer')['items']
        self.assertEqual(len(eps), 7)
        for e in eps:
            self.assertRegex(e['flow_id'], r'^[0-9a-f-]{36}$', e['endpoint_key'])
            self.assertEqual(e['tenant_state'], 'Started', 'the tenant export lists every mailer flow as Started')
        send = [e for e in eps if e['endpoint_key'] == 'MAIL_SEND'][0]
        self.assertEqual(send['flow_id'], '0fb53e16-fa57-41a9-9880-752c3a4d4749')
        unresolved = self.ok('GET', '/api/flows')['unresolved']
        self.assertTrue(all(len(u['candidates']) > 1 for u in unresolved))

    def test_needs_sign_in_before_acting(self):
        fid = '0fb53e16-fa57-41a9-9880-752c3a4d4749'
        st, b = self.call('POST', f'/api/flows/{fid}/turn-off', {'actor': 'pa', 'reason': 'Maintenance window'})
        self.assertEqual((st, b['error']), (409, 'flow owner not signed in'))

    # ── sign-in, sync, identity ────────────────────────────────────────────────────────
    def test_sign_in_sync_resolves_identities_and_reads_runs(self):
        self.sign_in()
        res = self.app.owner.last_sync_result
        self.assertTrue(res['ok'], res)
        flows = self.ok('GET', '/api/flows')
        self.assertEqual(flows['unresolved'], [], 'every ambiguous key is settled by its live trigger workflow')
        eps = {f"{e['scope']}:{e['endpoint_key']}": e for e in self.ok('GET', '/api/endpoints')['items']}
        status = eps['portal:STATUS']
        self.assertEqual((status['flow_id_source'], status['identity_verified']), ('adoption', 1),
                         'the adoption register settles the tie offline, and the live trigger workflow confirms it')
        self.assertEqual(self.tenant.flows[status['flow_id']]['wf'], status['workflow_id'])
        mail = eps['mailer:MAIL_SEND']
        self.assertRegex(mail['workflow_id'], r'^[0-9a-f]{32}$', 'the mailer trigger workflow is read live')
        self.assertTrue(mail['route'].endswith('/triggers/manual/paths/invoke'))
        self.assertEqual(mail['identity_verified'], 1)
        # health comes from the runs, and nothing secret was kept
        a = [x for x in self.ok('GET', '/api/health/status')['assets'] if x['assetId'] == 'mailer:MAIL_SEND'][0]
        self.assertEqual((a['state'], a['source']), ('Healthy', 'flow-runs'))
        blob = b''.join(p.read_bytes() for p in (Path(self.home) / 'data').glob('*'))
        self.assertNotIn(SECRET_SIG.encode(), blob, 'a trigger signature reached the database')
        self.assertNotIn(b'rt-1', blob, 'a refresh token reached the database')
        self.assertNotIn(fake_jwt('dgsregistry@nitda.gov.ng').encode(), blob)
        self.assertTrue(self.ok('GET', '/api/audit/verify')['valid'])
        self.assertEqual(self.ok('GET', '/api/audit?action=tenant.signed-in')['total'], 1)
        self.assertTrue(any(p.endswith('/flows') for _, p in self.tenant.calls))

    def test_identity_drift_is_reported(self):
        self.sign_in()
        fid = [e for e in self.ok('GET', '/api/endpoints?scope=portal')['items'] if e['endpoint_key'] == 'UPLOAD'][0]['flow_id']
        self.tenant.flows[fid]['wf'] = 'f' * 32
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE tenant_flows SET trigger_workflow_id=NULL WHERE flow_id=?", (fid,))
        con.commit()
        con.close()
        res = self.ok('POST', '/api/tenant/sync', {'actor': 'pa', 'reason': 'Check identities'})
        self.assertIn('portal:UPLOAD', res['identityDrift'])
        e = [e for e in self.ok('GET', '/api/endpoints?scope=portal')['items'] if e['endpoint_key'] == 'UPLOAD'][0]
        self.assertEqual(e['identity_verified'], 0)

    def test_a_tie_the_registers_leave_open_is_settled_live(self):
        con = sqlite3.connect(os.path.join(self.home, 'data', 'folio_admin.db'))
        con.execute("UPDATE endpoints SET flow_id=NULL, flow_id_source='ambiguous' WHERE scope='portal' AND endpoint_key='STATUS'")
        con.commit()
        con.close()
        self.sign_in()
        e = [e for e in self.ok('GET', '/api/endpoints?scope=portal')['items'] if e['endpoint_key'] == 'STATUS'][0]
        self.assertEqual((e['flow_id_source'], e['flow_id'], e['identity_verified']), ('resolved-live', '60042a2e-dadb-4ad8-a672-38b4132d299f', 1))

    def test_a_flow_missing_from_the_owners_list_is_read_by_its_id(self):
        fid = [e for e in self.ok('GET', '/api/endpoints?scope=portal')['items'] if e['endpoint_key'] == 'UPLOAD'][0]['flow_id']
        self.tenant.hidden.add(fid)
        self.sign_in()
        res = self.ok('POST', '/api/tenant/sync', {'actor': 'pa', 'reason': 'Shared flow'})
        self.assertEqual((res['governedMissing'], res['flowsReadDirectly']), ([], 1))
        e = [e for e in self.ok('GET', '/api/endpoints?scope=portal')['items'] if e['endpoint_key'] == 'UPLOAD'][0]
        self.assertEqual((e['tenant_state'], e['identity_verified']), ('Started', 1))
        self.assertIn(('GET', f'/providers/Microsoft.ProcessSimple/environments/{ENV}/flows/{fid}'), self.tenant.calls)

    def test_failed_run_raises_alert_and_success_resolves_it(self):
        self.sign_in()
        fid = '0fb53e16-fa57-41a9-9880-752c3a4d4749'
        self.tenant.runs[fid].insert(0, self.tenant.run(fid, 'Failed', 0, 'BadRequest', 'Mailbox unavailable; see ?sig=' + SECRET_SIG))
        self.ok('POST', '/api/tenant/sync', {'actor': 'ops', 'reason': 'Read the latest runs'})
        alerts = self.ok('GET', '/api/alerts?source=flow-runs')['items']
        self.assertEqual(len(alerts), 1)
        self.assertNotIn(SECRET_SIG, alerts[0]['message'])
        a = [x for x in self.ok('GET', '/api/health/status')['assets'] if x['assetId'] == 'mailer:MAIL_SEND'][0]
        self.assertEqual(a['state'], 'Unavailable')
        cl = {i['check']: i['pass'] for i in self.ok('GET', '/api/checklist')['items']}
        self.assertFalse(cl['No governed flow failed its newest run'])
        self.tenant.runs[fid].insert(0, self.tenant.run(fid, 'Succeeded', 0))
        self.ok('POST', '/api/tenant/sync', {'actor': 'ops', 'reason': 'Read the latest runs'})
        self.assertEqual(self.ok('GET', f"/api/alerts/{alerts[0]['id']}")['state'], 'Resolved')

    # ── owner actions ──────────────────────────────────────────────────────────────────
    def test_owner_actions_are_governed_and_audited(self):
        self.sign_in()
        fid = '0fb53e16-fa57-41a9-9880-752c3a4d4749'
        self.ok('POST', f'/api/flows/{fid}/turn-off', {'actor': 'pa', 'reason': 'Planned list migration'})
        self.assertEqual(self.tenant.flows[fid]['state'], 'Stopped')
        self.ok('POST', f'/api/flows/{fid}/turn-on', {'actor': 'pa', 'reason': 'Migration done'})
        self.assertEqual(self.tenant.flows[fid]['state'], 'Started')
        runs = self.ok('GET', f'/api/flows/{fid}/runs')['items']
        rid = runs[0]['run_id']
        detail = self.ok('GET', f'/api/flows/{fid}/runs/{rid}')
        self.assertEqual([a['name'] for a in detail['actions']], ['Compose_Config', 'Send_an_email'])
        self.assertNotIn(SECRET_SIG, json.dumps(detail), 'signed content links must not be passed on')
        st, b = self.call('POST', f'/api/flows/{fid}/runs/{rid}/resubmit', {'actor': 'pa', 'reason': 'Replay the failed send'})
        self.assertEqual((st, b['error']), (400, 'confirmation required'))
        before = len(self.tenant.runs[fid])
        self.ok('POST', f'/api/flows/{fid}/runs/{rid}/resubmit', {'actor': 'pa', 'reason': 'Replay the failed send', 'confirm': 'RESUBMIT'})
        self.assertEqual(len(self.tenant.runs[fid]), before + 1)
        self.ok('POST', f'/api/flows/{fid}/runs/{rid}/cancel', {'actor': 'pa', 'reason': 'Stop a stuck run'})
        actions = {a['action'] for a in self.ok('GET', '/api/audit?limit=100')['items']}
        self.assertTrue({'flow.turn-off', 'flow.turn-on', 'flow.run-resubmit', 'flow.run-cancel'} <= actions)
        # nothing outside the governed estate
        st, b = self.call('POST', '/api/flows/00000000-0000-0000-0000-000000000000/turn-off', {'actor': 'pa', 'reason': 'Not ours'})
        self.assertEqual((st, b['error']), (404, 'not a governed flow'))

    def test_roles_limit_flow_operations(self):
        self.sign_in()
        viewer = self.ok('POST', '/api/operators', {'actor': 'root', 'reason': 'Viewer for tests', 'name': 'exec-view', 'role': 'viewer'})['token']
        ops = self.ok('POST', '/api/operators', {'actor': 'root', 'reason': 'Ops for tests', 'name': 'ops-ctl', 'role': 'operations'})['token']
        fid = '0fb53e16-fa57-41a9-9880-752c3a4d4749'
        self.assertEqual(self.call('POST', f'/api/flows/{fid}/turn-off', {'reason': 'Not allowed'}, token=viewer)[0], 403)
        self.assertEqual(self.call('POST', '/api/tenant/sign-in', {'reason': 'Not allowed'}, token=ops)[0], 403)
        self.ok('POST', '/api/tenant/sync', {'reason': 'Operations may sync'}, token=ops)
        self.ok('GET', '/api/flows', token=viewer)

    def test_refused_public_app_falls_through_to_the_next(self):
        self.tenant.refused_clients.add(server.FLOW_CLIENTS[0][0])
        self.sign_in()
        self.assertEqual(self.ok('GET', '/api/tenant')['client'], server.FLOW_CLIENTS[1][1])

    def test_sign_out_forgets_the_session(self):
        self.sign_in()
        self.ok('POST', '/api/tenant/sign-out', {'actor': 'pa', 'reason': 'End of session'})
        st = self.ok('GET', '/api/tenant')
        self.assertEqual((st['state'], st['user']), ('signed-out', None))
        self.assertIsNone(self.app.owner._access)

    def test_flow_service_must_be_microsoft(self):
        os.environ.pop('FOLIO_ADMIN_FLOW_API')
        cfg_path = Path(self.home) / 'settings.json'
        s = json.loads((PKG / 'config' / 'settings.json').read_text())
        s['flowApiBase'] = 'https://evil.example.com'
        cfg_path.write_text(json.dumps(s))
        os.environ['FOLIO_ADMIN_SETTINGS'] = str(cfg_path)
        try:
            with self.assertRaises(SystemExit):
                server.Config()
        finally:
            os.environ.pop('FOLIO_ADMIN_SETTINGS')



class PersistedSessionTest(unittest.TestCase):
    """FOLIO_MS_SESSION: the device-code sign-in survives a restart, and only the refresh token is kept."""
    call = FlowOwnerTest.call
    ok = FlowOwnerTest.ok
    sign_in = FlowOwnerTest.sign_in

    def setUp(self):
        self.session = Path(tempfile.mkdtemp(prefix='folio-ms-')) / 'microsoft' / 'session.json'
        os.environ['FOLIO_MS_SESSION'] = str(self.session)
        FlowOwnerTest.setUp(self)

    def tearDown(self):
        FlowOwnerTest.tearDown(self)
        os.environ.pop('FOLIO_MS_SESSION', None)
        shutil.rmtree(self.session.parent.parent, ignore_errors=True)

    def test_sign_in_is_kept_across_a_restart_and_dropped_on_sign_out(self):
        self.sign_in()
        self.assertTrue(self.session.is_file(), 'the session file is written on sign-in')
        self.assertEqual(self.session.stat().st_mode & 0o777, 0o600)
        saved = json.loads(self.session.read_text())
        self.assertIn(saved['refreshToken'], ('rt-1', 'rt-2'))
        self.assertEqual(saved['user']['email'], 'dgsregistry@nitda.gov.ng')
        self.assertNotIn(self.app.owner._access, self.session.read_text(), 'the access token is never written')

        restarted = server.FlowOwner(self.app.cfg)          # a new process: nothing in memory
        self.assertEqual(restarted.status()['state'], 'signed-in')
        self.assertTrue(restarted._token(), 'the stored refresh token is redeemed without a new code')
        self.assertEqual(json.loads(self.session.read_text())['refreshToken'], 'rt-2', 'the rotated token is saved back')

        restarted.sign_out()
        self.assertFalse(self.session.exists(), 'sign-out deletes the stored session')

    def test_without_the_variable_nothing_is_written(self):
        os.environ.pop('FOLIO_MS_SESSION', None)
        owner = server.FlowOwner(self.app.cfg)
        self.assertIsNone(owner.session_path)
        self.assertEqual(owner.status()['state'], 'signed-out')


if __name__ == '__main__':
    unittest.main()
