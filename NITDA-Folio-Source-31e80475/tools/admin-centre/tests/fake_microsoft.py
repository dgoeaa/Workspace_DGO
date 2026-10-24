"""A stand-in for the Microsoft identity platform and the Power Automate flow service.

It answers only the user-scoped paths the Centre may call, and asserts on anything under
/scopes/admin/. Used by test_flow_owner.py and, run as a script, by tests/admin-centre.spec.js:

    python3 fake_microsoft.py <port>        prints READY once listening
"""
import base64
import json
import re
import socket
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1'
SECRET_SIG = 'SeCrEtSiGnAtUrE0123456789abcdef'


def free_port():  # noqa: D103
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


def fake_jwt(upn):
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
    return f"{enc({'alg': 'none'})}.{enc({'upn': upn, 'name': 'Registry Owner', 'oid': 'o-1'})}.sig"


class Tenant:
    """State of the stand-in tenant: flows, their trigger workflows and their runs."""

    def __init__(self, rows):
        self.calls = []
        self.flows = {}          # flow_id -> {'name', 'state', 'wf'}
        self.runs = {}           # flow_id -> [run dicts], newest first
        self.pending_polls = 1
        self.refused_clients = set()
        self.hidden = set()
        n = 0
        for r in rows:
            cands = [c for c in r['flow_candidates'].split(',') if c]
            # The true candidate is the one the registers settle on (the adoption register, for a tie); with none, the
            # last, so live resolution cannot pass by picking the first.
            true = r['flow_id'] if r.get('flow_id') in cands else cands[-1] if cands else None
            for c in cands:
                if c in self.flows:
                    continue
                n += 1
                wf = r['workflow_id'] if (r['workflow_id'] and c == true) else f'{n:032x}'
                self.flows[c] = {'name': r['flow_name'] if c == true else f'{r["flow_name"]} (old)', 'state': 'Started', 'wf': wf}
                self.runs[c] = [self.run(c, 'Succeeded', 0)]

    def run(self, fid, status, minutes_ago, code=None, message=None):
        t = time.gmtime(time.time() - minutes_ago * 60)
        start = time.strftime('%Y-%m-%dT%H:%M:%S', t) + '.1234567Z'
        end = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(time.time() - minutes_ago * 60 + 2)) + '.7654321Z'
        self.seq = getattr(self, 'seq', 0) + 1
        rid = f'0858{int(time.time() * 1000) % 10**12:012d}{self.seq:06d}CU01'
        props = {'status': status, 'startTime': start, 'endTime': end,
                 'trigger': {'name': 'manual', 'originHistoryName': rid}, 'code': code}
        if message:
            props['error'] = {'code': code, 'message': message}
        return {'name': rid, 'properties': props}


def handler_for(tenant):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def reply(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def body(self):
            n = int(self.headers.get('Content-Length') or 0)
            return self.rfile.read(n).decode() if n else ''

        def do_POST(self):
            self.route('POST')

        def do_GET(self):
            self.route('GET')

        def route(self, method):
            path = urlsplit(self.path).path
            q = parse_qs(urlsplit(self.path).query)
            tenant.calls.append((method, path))
            assert '/scopes/admin/' not in path, 'the Centre must never call an admin path'
            if path.endswith('/oauth2/v2.0/devicecode'):
                f = parse_qs(self.body())
                if f['client_id'][0] in tenant.refused_clients:
                    return self.reply(400, {'error': 'unauthorized_client', 'error_description': 'AADSTS700016: app not found'})
                return self.reply(200, {'device_code': 'dc-1', 'user_code': 'ABCD-EFGH', 'verification_uri': 'https://microsoft.com/devicelogin',
                                        'expires_in': 900, 'interval': 5})
            if path.endswith('/oauth2/v2.0/token'):
                f = parse_qs(self.body())
                if f['grant_type'][0] == 'refresh_token':
                    return self.reply(200, {'access_token': fake_jwt('dgsregistry@nitda.gov.ng'), 'refresh_token': 'rt-2', 'expires_in': 3600})
                if tenant.pending_polls > 0:
                    tenant.pending_polls -= 1
                    return self.reply(400, {'error': 'authorization_pending'})
                return self.reply(200, {'access_token': fake_jwt('dgsregistry@nitda.gov.ng'), 'refresh_token': 'rt-1', 'expires_in': 3600})
            if self.headers.get('Authorization', '').count('.') != 2:
                return self.reply(401, {'error': {'code': 'Unauthorized'}})
            assert q.get('api-version') == ['2016-11-01'] or 'page' in q, self.path
            base = f'/providers/Microsoft.ProcessSimple/environments/{ENV}'
            if not path.startswith(base):
                return self.reply(404, {'error': {'message': 'unknown path ' + path}})
            rest = path[len(base):]
            if rest == '/flows' and method == 'GET':
                items = [{'name': fid, 'properties': {'displayName': f['name'], 'state': f['state'], 'createdTime': '2026-09-01T00:00:00Z',
                                                      'lastModifiedTime': '2026-09-26T00:00:00Z'}}
                         for fid, f in tenant.flows.items() if fid not in tenant.hidden]
                half = len(items) // 2
                if 'page' in q:
                    return self.reply(200, {'value': items[half:]})
                host = self.headers['Host']
                return self.reply(200, {'value': items[:half], 'nextLink': f'http://{host}{base}/flows?api-version=2016-11-01&page=2'})
            m = re.fullmatch(r'/flows/([0-9a-f-]{36})(/.*)?', rest)
            if not m or m[1] not in tenant.flows:
                return self.reply(404, {'error': {'message': 'flow not found'}})
            fid, sub = m[1], m[2] or ''
            f = tenant.flows[fid]
            if sub == '' and method == 'GET':   # read by id: answers for a hidden (shared) flow too, as the service does
                return self.reply(200, {'name': fid, 'properties': {'displayName': f['name'], 'state': f['state'],
                                                                    'createdTime': '2026-01-01T00:00:00Z', 'lastModifiedTime': '2026-10-01T00:00:00Z'}})
            if sub == '/triggers/manual/listCallbackUrl' and method == 'POST':
                return self.reply(200, {'response': {'value': f'https://x.environment.api.powerplatform.com:443/powerautomate/automations/direct/'
                                                               f'workflows/{f["wf"]}/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers&sv=1.0&sig={SECRET_SIG}'}})
            if sub == '/runs' and method == 'GET':
                return self.reply(200, {'value': tenant.runs.get(fid, [])})
            mr = re.fullmatch(r'/runs/([0-9A-Za-z]+)(/actions|/cancel)?', sub)
            if mr:
                run = next((r for r in tenant.runs.get(fid, []) if r['name'] == mr[1]), None)
                if not run:
                    return self.reply(404, {'error': {'message': 'run not found'}})
                if mr[2] == '/actions':
                    return self.reply(200, {'value': [
                        {'name': 'Compose_Config', 'properties': {'status': 'Succeeded', 'startTime': '2026-09-29T10:00:00Z',
                                                                  'inputsLink': {'uri': 'https://prod.blob/x?sig=' + SECRET_SIG}}},
                        {'name': 'Send_an_email', 'properties': {'status': 'Failed', 'code': 'BadRequest', 'startTime': '2026-09-29T10:00:01Z',
                                                                 'error': {'code': 'BadRequest', 'message': 'Mailbox unavailable'},
                                                                 'outputsLink': {'uri': 'https://prod.blob/y?sig=' + SECRET_SIG}}}]})
                if mr[2] == '/cancel':
                    run['properties']['status'] = 'Cancelled'
                    return self.reply(200, {})
                return self.reply(200, run)
            if re.fullmatch(r'/triggers/manual/histories/[0-9A-Za-z]+/resubmit', sub) and method == 'POST':
                tenant.runs[fid].insert(0, tenant.run(fid, 'Succeeded', 0))
                return self.reply(202, {})
            if sub in ('/start', '/stop') and method == 'POST':
                f['state'] = 'Started' if sub == '/start' else 'Stopped'
                return self.reply(200, {})
            return self.reply(404, {'error': {'message': 'unknown ' + sub}})
    return H




if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import os
    os.environ.setdefault('FOLIO_ADMIN_MONITOR', '0')
    import server
    rows, _ = server.read_estate(Path(__file__).resolve().parents[3])
    t = Tenant(rows)
    fid = '0fb53e16-fa57-41a9-9880-752c3a4d4749'
    # The newest run of DGO_MAIL_SEND failed; the one before it succeeded.
    t.runs[fid] = [t.run(fid, 'Failed', 0, 'BadRequest', 'Mailbox unavailable'), t.run(fid, 'Succeeded', 5)]
    srv = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), handler_for(t))
    print('READY', flush=True)
    srv.serve_forever()
