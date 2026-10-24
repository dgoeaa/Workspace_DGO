#!/usr/bin/env python3
"""Loopback relay for the Flow Operations Workbench.

Power Automate endpoints send no CORS headers, so a browser can issue a direct
request but can never read the response. This relay serves the workbench and
forwards its requests server-side, where CORS does not apply.

    python3 local_agent.py        # then open http://127.0.0.1:8765

Scope, stated plainly: the relay binds to 127.0.0.1 and accepts browser requests
only from its own origin, but it is not authenticated. Any process already running
on this machine can use it to issue HTTPS requests and read the responses, and it
will forward to any HTTPS host including addresses on the local network. Run it
only while you are using the workbench, and stop it with Ctrl-C when finished.

Requires Python 3.7 or newer.
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse
import json
import os
import time

HOST = '127.0.0.1'
PORT = 8765
ORIGIN = f'http://{HOST}:{PORT}'
ROOT = os.path.dirname(os.path.abspath(__file__))

ALLOWED_METHODS = {'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'}
MAX_BODY_BYTES = 8 * 1024 * 1024
REDACT = ('sig', 'token', 'code', 'key', 'secret', 'password')


def mask(url):
    """Redact credential-bearing query parameters before echoing a URL back.

    The marker carries no brackets: urlencode percent-encodes them, which turned
    masked URLs into 'sig=%5BREDACTED%5D'.
    """
    parts = urlparse(url)
    query = [
        (k, 'REDACTED' if any(s in k.lower() for s in REDACT) else v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
    ]
    return urlunparse(parts._replace(query=urlencode(query)))


class Handler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        # directory= keeps the served root local to this handler rather than
        # relying on a process-wide chdir.
        super().__init__(*args, directory=ROOT, **kwargs)

    # -- CORS ---------------------------------------------------------------
    # Locked to this relay's own origin. The previous build answered "*", which
    # let any site open in the browser drive the relay and read the responses.

    def _origin_allowed(self):
        origin = self.headers.get('Origin')
        return origin is None or origin == ORIGIN

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', ORIGIN)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_POST(self):
        if self.path != '/api/request':
            # SimpleHTTPRequestHandler defines no do_POST, so the previous
            # super().do_POST() raised AttributeError and killed the connection.
            self.send_error(405, 'Method Not Allowed')
            return
        if not self._origin_allowed():
            self.send_error(403, 'Cross-origin request refused')
            return
        self._send_json(200, self._relay())

    def do_GET(self):
        if self.path == '/api/health':
            self._send_json(200, {'ok': True, 'service': 'nitda-flow-workbench-relay'})
            return
        super().do_GET()

    def do_HEAD(self):
        if self.path == '/api/health':
            self._send_json(200, {'ok': True, 'service': 'nitda-flow-workbench-relay'})
            return
        super().do_HEAD()

    # -- relay --------------------------------------------------------------

    def _relay(self):
        started = time.time()
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0:
                raise ValueError('empty request')
            if length > MAX_BODY_BYTES:
                raise ValueError('request body exceeds %d bytes' % MAX_BODY_BYTES)
            spec = json.loads(self.rfile.read(length))

            url = spec['url']
            if urlparse(url).scheme != 'https':
                raise ValueError('HTTPS required')

            method = str(spec.get('method') or 'POST').upper()
            if method not in ALLOWED_METHODS:
                raise ValueError('method %s not allowed' % method)

            headers = spec.get('headers') or {}
            if not isinstance(headers, dict):
                raise ValueError('headers must be an object')
            headers = {str(k): str(v) for k, v in headers.items()}
            headers.setdefault('Content-Type', 'application/json')

            # Only send a body when one was actually supplied; the previous build
            # sent the literal bytes b'null' for a bodyless PUT/PATCH/DELETE.
            payload = spec.get('body')
            if method in ('GET', 'HEAD') or payload is None:
                data = None
            else:
                data = json.dumps(payload).encode('utf-8')

            try:
                timeout = int(spec.get('timeoutSeconds') or 60)
            except (TypeError, ValueError):
                timeout = 60
            timeout = min(max(timeout, 1), 300)

            request = Request(url, data=data, headers=headers, method=method)
            try:
                with urlopen(request, timeout=timeout) as response:
                    raw = response.read()
                    status = response.status
                    resp_headers = self._headers_to_dict(response.headers)
                    ok = 200 <= status < 300
            except HTTPError as e:
                raw = e.read()
                status = e.code
                resp_headers = self._headers_to_dict(e.headers)
                ok = False

            try:
                body = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                body = raw.decode('utf-8', 'replace')

            return {
                'ok': ok,
                'status': status,
                'headers': resp_headers,
                'body': body,
                'durationMs': round((time.time() - started) * 1000),
                'targetMasked': mask(url),
            }
        except URLError as e:
            return {'ok': False, 'error': 'Could not reach target: %s' % (e.reason,),
                    'durationMs': round((time.time() - started) * 1000)}
        except Exception as e:
            return {'ok': False, 'error': '%s: %s' % (type(e).__name__, e),
                    'durationMs': round((time.time() - started) * 1000)}

    @staticmethod
    def _headers_to_dict(headers):
        """Preserve repeated headers such as Set-Cookie instead of collapsing them."""
        out = {}
        for key, value in headers.items():
            if key in out:
                out[key] += ', ' + value
            else:
                out[key] = value
        return out

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    # flush=True so the banner appears at once even when stdout is redirected
    # or piped, which is the usual case on a phone terminal such as Termux.
    print('Flow Operations Workbench relay', flush=True)
    print('  serving  %s' % ROOT, flush=True)
    print('  open     %s' % ORIGIN, flush=True)
    print('  stop     Ctrl-C', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nstopping')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
