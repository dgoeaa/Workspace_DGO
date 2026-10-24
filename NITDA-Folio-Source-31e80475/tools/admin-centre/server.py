#!/usr/bin/env python3
"""Folio Central Administration Centre — the governed control plane over the portfolio.

One Python process, standard library only:

  * serves the administrative client from static/ ;
  * answers a bearer-authenticated JSON API under /api/ ;
  * keeps the governed records in SQLite (WAL, foreign keys on);
  * writes every privileged mutation to a SHA-256 hash chain that begins at GENESIS ;
  * probes each registered platform on its loopback port and turns what it sees into
    health observations, alerts and recoveries ;
  * asks Folio Vault — when it is configured — to verify a flow alias without ever
    receiving the signed URL behind it.

Nothing here impersonates the Microsoft 365 / Power Platform tenant. An endpoint record is
inventory; only an observation (a probe, a Vault verification or an ingested result) is
evidence of health, and "no observation" is reported as Unknown, never as Healthy.

Run:   python3 server.py            (see README.md for the full procedure)
Env:   FOLIO_ADMIN_HOME       state directory (data/, config/admin.token, backups/, evidence/);
                              defaults to this package directory, where those paths are ignored by git
       FOLIO_ADMIN_PORT       override the configured port (tests)
       FOLIO_ADMIN_HOST       override the bind host; anything but loopback is refused unless
                              FOLIO_ADMIN_ALLOW_NONLOOPBACK=1
       FOLIO_ADMIN_MONITOR    0 disables the background health monitor
       FOLIO_ADMIN_REPO       repository root to provision the estate from (auto-detected)
       FOLIO_VAULT_ADMIN_TOKEN / FOLIO_VAULT_TOKEN_FILE   Vault admin credential; never stored
"""

import csv
import hashlib
import hmac
import io
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import signal
import sqlite3
import sys
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlsplit
from urllib.request import Request, urlopen

PKG = Path(__file__).resolve().parent


def toolkit_build():
    """The Administrator Toolkit this copy came in: BUILD-ID.json, written beside this file by scripts/build-handover.mjs.
    A copy run from the repository has none, and says so."""
    try:
        b = json.loads((PKG / 'BUILD-ID.json').read_text(encoding='utf-8'))
        return {'label': str(b.get('label', '')), 'version': str(b.get('version', '')), 'commit': str(b.get('commit', ''))[:8]}
    except (OSError, ValueError):
        return {'label': 'repository copy', 'version': '', 'commit': ''}
SCHEMA_VERSION = 3
MAX_BODY = 64 * 1024
LAUNCH_MAX_MINUTES = 15   # the longest a launcher's one-time sign-in link may live (App.redeem_launch)

SEVERITIES = ('Critical', 'High', 'Medium', 'Low', 'Info')
HEALTH_STATES = ('Healthy', 'Degraded', 'Unavailable', 'Unknown')
PLATFORM_STATES = ('Registered', 'Active', 'Maintenance', 'Retired')
ENDPOINT_STATES = ('Registered', 'Commissioned', 'Suspended', 'Retired')
ROLES = ('super_admin', 'operations', 'incident_manager', 'change_manager',
         'platform_admin', 'auditor', 'viewer')

ROLE_LABELS = {
    'super_admin': 'Super Administrator', 'operations': 'Operations Controller',
    'incident_manager': 'Incident Manager', 'change_manager': 'Change Manager',
    'platform_admin': 'Platform Administrator', 'auditor': 'Auditor', 'viewer': 'Viewer / Executive',
}

# Which role may do what. `read` is every role; the rest are named here and nowhere else.
PERMISSIONS = {
    'read':             set(ROLES),
    'alert.create':     {'super_admin', 'operations', 'incident_manager', 'platform_admin'},
    'alert.update':     {'super_admin', 'operations', 'incident_manager'},
    'incident.create':  {'super_admin', 'operations', 'incident_manager'},
    'incident.update':  {'super_admin', 'incident_manager'},
    'change.create':    {'super_admin', 'change_manager', 'platform_admin', 'operations'},
    'change.decide':    {'super_admin', 'change_manager'},
    'change.progress':  {'super_admin', 'change_manager', 'platform_admin'},
    'note.create':      {'super_admin', 'operations', 'incident_manager', 'change_manager', 'platform_admin'},
    'health.ingest':    {'super_admin', 'operations', 'platform_admin'},
    'probe.run':        {'super_admin', 'operations', 'platform_admin'},
    'inventory.update': {'super_admin', 'platform_admin'},
    'vault.verify':     {'super_admin', 'platform_admin'},
    'config.update':    {'super_admin'},
    'access.manage':    {'super_admin'},
    'backup.create':    {'super_admin'},
    'retention.run':    {'super_admin'},
    'evidence.export':  {'super_admin', 'auditor'},
    'tenant.connect':   {'super_admin', 'platform_admin'},
    'tenant.sync':      {'super_admin', 'platform_admin', 'operations'},
    'flow.operate':     {'super_admin', 'platform_admin'},
    'flow.test':        {'super_admin', 'platform_admin'},
    'audit.verify':     set(ROLES),
}

ALERT_FLOW = {'Open': ('Acknowledged', 'Resolved'), 'Acknowledged': ('Resolved', 'Open'), 'Resolved': ('Open',)}
INCIDENT_FLOW = {'Open': ('Investigating', 'Resolved'), 'Investigating': ('Mitigated', 'Resolved'),
                 'Mitigated': ('Resolved', 'Investigating'), 'Resolved': ('Closed', 'Investigating'), 'Closed': ()}
CHANGE_FLOW = {'Submitted': ('Approved', 'Rejected', 'Cancelled'), 'Approved': ('Implemented', 'Cancelled'),
               'Implemented': ('Verified', 'RolledBack'), 'Rejected': (), 'Cancelled': (), 'Verified': (), 'RolledBack': ()}
FLOWS = {'alerts': ALERT_FLOW, 'incidents': INCIDENT_FLOW, 'changes': CHANGE_FLOW}
OPEN_STATES = {'alerts': ('Open', 'Acknowledged'),
               'incidents': ('Open', 'Investigating', 'Mitigated'),
               'changes': ('Submitted', 'Approved', 'Implemented')}
# A transition into one of these must carry a note: what was done, or why.
NOTE_REQUIRED = {('alerts', 'Resolved'), ('incidents', 'Resolved'), ('incidents', 'Closed'),
                 ('changes', 'Rejected'), ('changes', 'Verified'), ('changes', 'RolledBack')}

# The six governed platforms. `launcher` is the id scripts/platforms.config.mjs gives the same
# platform (`npm run start:<launcher>`); tests/admin-centre.test.mjs holds the two in step.
PLATFORMS = (
    ('workspace', 'Folio Workspace', 'Browser application', 'index.html', 8080, '/', 'runtime'),
    ('portal', 'NITDA Document Portal', 'Public PWA', 'document-portal/index.html', 8081, '/', 'portal'),
    ('console', 'Folio Estate Console', 'Administration console', 'tools/admin-console.html', 8082, '/admin-console.html', 'console'),
    ('mailer', 'DGO Correspondence Mailer', 'Browser application', 'mailer/index.html', 8083, '/', 'mailer'),
    ('workbench', 'Folio Flow Workbench', 'Browser tool and local relay', 'tools/flow-workbench/index.html', 8765, '/api/health', 'workbench'),
    ('vault', 'Folio Vault', 'Local credential-alias API', 'tools/flow-capsule/app/flowcapsule.py', 8787, '/health', 'capsule'),
)
# Where a platform is published (scripts/platforms.config.mjs prodUrl; tests/admin-centre.test.mjs holds the two in step).
PUBLISHED = {'workspace': 'https://folio-platform.page.gd/', 'portal': 'https://folio-portal.page.gd/',
             'mailer': 'https://folio-platform.page.gd/mailer.html'}
# Read-only pages the Centre hosts as sections of itself, from the repository: (path, is a folder, platform it is).
# Each runs in a sandbox with its own policy (SECTION_HEADERS), so it cannot read the Centre's session.
SECTIONS = {
    'estate-console': ('tools/admin-console.html', False, 'console'),
    'provisioning': ('docs/folio-Master-Flows-and-Endpoints/provisioning', True, None),
}
HOSTED = {'console': '/sections/estate-console'}
# A platform whose job a Centre screen now does: where it does not run here, the Portfolio points to that screen.
REPLACED = {'workbench': ('#/test', 'Test a flow')}
# The repository modules the Centre's page imports for the configuration check: the Estate Console's own analysis
# (core/endpoint-atlas.js) and what it imports, so the two can never disagree. tests/admin-centre.test.mjs holds the
# list closed over the imports.
MODULES = ('core/endpoint-atlas.js', 'config/endpoint-atlas.data.js', 'config/endpoints.config.js', 'core/endpoint-registry.js',
           'config/fetch-policy.config.js')

# Test a flow: only the Workspace's read-only contracts (config/endpoints.config.js readOnly; tests/admin-centre.test.mjs
# holds the two in step), each with the action its flow switches on. Nothing that writes or sends mail can be called from
# here: the Vault's rule is that a console never dispatches correspondence (tools/flow-capsule/README.md).
TESTABLE = {'FETCH_ALL': 'fetchAll', 'REFERENCE_DATA': 'lookups', 'GET_DOCS': 'getDocs', 'FETCH_ACTIVITIES': 'LIST-ACTIVITIES',
            'FETCH_EMAIL_ATTACHMENTS': 'fetchEmailAttachments'}
# The Folio sign-in a test runs under: the Workspace's own two calls (core/otp-identity.js).
SIGN_IN = {'OTP_GENERATE': ('generate', 'requestOtp'), 'OTP_VERIFY': ('verify', 'verifyOtp')}
TEST_REPLY_LIMIT = 256 * 1024

ESTATE_SOURCES = ('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json', 'mailer/flows/flows.catalogue.json',
                  'docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json')
# The newest tenant "List My Flows" analysis: deployment state and the tenant flow id of every flow.
TENANT_EXPORT_GLOB = 'docs/folio-Master-Flows-and-Endpoints/audits/flow-usage-analysis-*.json'
# Every Folio flow, with its group and the state it should be in. It adds the flows no endpoint names (the scheduled and
# event-driven flows and the governance registry's) to the ones the Centre watches.
CATALOGUE_SOURCE = 'docs/folio-Master-Flows-and-Endpoints/registers/flow-catalogue.json'
FLOW_STATES = ('Started', 'Stopped')

# Settings the API may change at runtime: key -> (type, validator description, check).
MUTABLE = {
    'healthIntervalSeconds': (int, '30–86400 seconds', lambda v: 30 <= v <= 86400),
    'staleAfterSeconds':     (int, '60–604800 seconds', lambda v: 60 <= v <= 604800),
    'retentionDays':         (int, '2555–36500 days (never below the seven-year policy)', lambda v: 2555 <= v <= 36500),
    'timezone':              (str, 'an IANA zone name', lambda v: _valid_zone(v)),
    'probeTimeoutSeconds':   (int, '1–60 seconds', lambda v: 1 <= v <= 60),
    'degradedLatencyMs':     (int, '100–60000 ms', lambda v: 100 <= v <= 60000),
    'autoAlert':             (bool, 'true or false', lambda v: True),
    'sessionIdleMinutes':    (int, '1–480 minutes', lambda v: 1 <= v <= 480),
    'vaultUrl':              (str, 'an http(s) URL on loopback', lambda v: _loopback_url(v)),
    'runHistoryIntervalSeconds': (int, '300–86400 seconds', lambda v: 300 <= v <= 86400),
    'runHistoryDepth':       (int, '1–50 runs per flow', lambda v: 1 <= v <= 50),
}
DESCRIPTIONS = {
    'systemName': 'Displayed system identity', 'version': 'Build version',
    'bindHost': 'Listener address; loopback only', 'port': 'HTTP listener port',
    'database': 'SQLite file, relative to the state directory', 'adminTokenFile': 'Bootstrap bearer token location',
    'environmentId': 'Power Platform environment identifier (tenant boundary)',
    'sharePointConnectionId': 'SharePoint connection identifier (tenant boundary)',
    'healthIntervalSeconds': 'Interval between platform probes', 'staleAfterSeconds': 'Age after which an observation is Stale',
    'retentionDays': 'Retention of health observations; governed records are never pruned',
    'timezone': 'Presentation timezone (storage is UTC)', 'auditHashAlgorithm': 'Audit-chain hash algorithm',
    'probeTimeoutSeconds': 'Per-probe timeout', 'degradedLatencyMs': 'Latency above which a probe reads Degraded',
    'autoAlert': 'Raise and resolve monitor alerts on health transitions',
    'sessionIdleMinutes': 'Client locks itself after this much inactivity',
    'vaultUrl': 'Folio Vault address used for alias verification',
    'flowApiBase': 'Power Automate service the flow owner signs in to (user-scoped paths only)',
    'loginBase': 'Microsoft identity platform used for the flow owner\'s device-code sign-in',
    'runHistoryIntervalSeconds': 'Interval between flow-run history syncs while a flow owner is signed in',
    'runHistoryDepth': 'Runs read per flow on each sync',
}

# Text that looks like a credential is refused in every free-text field.
CREDENTIAL = re.compile(
    r'(?i)(?:[?&]sig=[A-Za-z0-9%_\-]{8,}|/triggers/manual/paths/invoke\?[^\s]*sig|sharedaccesssignature|'
    r'\bbearer\s+[A-Za-z0-9._~+/\-]{20,}|client[_-]?secret\s*[:=]|password\s*[:=]\s*\S|\bfc_[A-Za-z0-9_\-]{30,}|\bfac_[A-Za-z0-9_\-]{30,})')
ACTOR_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9 ._@\-]{1,79}$')


def _valid_zone(v):
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(v)
        return True
    except Exception:
        return False


def _loopback_url(v):
    try:
        p = urlsplit(v)
        return p.scheme in ('http', 'https') and p.hostname in ('127.0.0.1', 'localhost', '::1') and not p.username
    except Exception:
        return False


MICROSOFT_HOSTS = ('.microsoft.com', '.microsoftonline.com', '.powerplatform.com', '.azure.com', '.azure-apim.net')


def _service_url(v, allow_loopback=False):
    """An https URL on a Microsoft service host (or loopback http when a test says so)."""
    try:
        p = urlsplit(v)
    except Exception:
        return False
    host = (p.hostname or '').lower()
    if allow_loopback and p.scheme == 'http' and host in ('127.0.0.1', 'localhost'):
        return True
    return p.scheme == 'https' and not p.username and any(host.endswith(h) for h in MICROSOFT_HOSTS)


def utcnow():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or utcnow()).strftime('%Y-%m-%dT%H:%M:%SZ')


def parse_iso(s):
    try:
        return datetime.strptime(s, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
    except Exception:
        return None


def sha256_hex(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode('utf-8')).hexdigest()


def is_loopback(host):
    if host == 'localhost':
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


class ApiError(Exception):
    def __init__(self, status, message, detail=None):
        super().__init__(message)
        self.status, self.message, self.detail = status, message, detail


# ─────────────────────────────────────────────────────────────────────────────────────────
# Configuration and state directory
# ─────────────────────────────────────────────────────────────────────────────────────────

class Config:
    def __init__(self):
        path = Path(os.environ.get('FOLIO_ADMIN_SETTINGS', PKG / 'config' / 'settings.json'))
        self.file_settings = json.loads(path.read_text(encoding='utf-8'))
        self.settings_path = path
        self.home = Path(os.environ.get('FOLIO_ADMIN_HOME', PKG)).resolve()
        s = dict(self.file_settings)
        if os.environ.get('FOLIO_ADMIN_PORT'):
            s['port'] = int(os.environ['FOLIO_ADMIN_PORT'])
        if os.environ.get('FOLIO_ADMIN_HOST'):
            s['bindHost'] = os.environ['FOLIO_ADMIN_HOST']
        if not is_loopback(s['bindHost']) and os.environ.get('FOLIO_ADMIN_ALLOW_NONLOOPBACK') != '1':
            raise SystemExit(f"Refusing to bind {s['bindHost']}: the Centre is loopback-only. "
                             'Set FOLIO_ADMIN_ALLOW_NONLOOPBACK=1 only behind an approved reverse proxy.')
        self.values = s
        self.db_path = self.home / s['database']
        self.token_path = self.home / s['adminTokenFile']
        self.backup_dir = self.home / 'backups'
        self.evidence_dir = self.home / 'evidence'
        self.monitor = os.environ.get('FOLIO_ADMIN_MONITOR', '1') != '0'
        # The platforms that run on this computer (FOLIO_ADMIN_LOCAL_PLATFORMS, comma-separated ids; unset: all of them).
        # Only those are probed. The Administrator Toolkit runs the tools alone: the Workspace, Portal and Mailer are
        # published sites, and probing their loopback ports would report them down.
        local = os.environ.get('FOLIO_ADMIN_LOCAL_PLATFORMS')
        self.local_platforms = None
        if local is not None:
            self.local_platforms = {x.strip() for x in local.split(',') if x.strip()}
            unknown = self.local_platforms - {pl[0] for pl in PLATFORMS}
            if unknown:
                raise SystemExit(f"FOLIO_ADMIN_LOCAL_PLATFORMS names no platform {', '.join(sorted(unknown))}; "
                                 f"the platforms are {', '.join(pl[0] for pl in PLATFORMS)}")
        # The flow owner's services. Environment overrides exist for tests, which point them at loopback.
        self.flow_api = (os.environ.get('FOLIO_ADMIN_FLOW_API') or s['flowApiBase']).rstrip('/')
        self.login = (os.environ.get('FOLIO_ADMIN_LOGIN') or s['loginBase']).rstrip('/')
        for name, url, env in (('flowApiBase', self.flow_api, 'FOLIO_ADMIN_FLOW_API'), ('loginBase', self.login, 'FOLIO_ADMIN_LOGIN')):
            if not _service_url(url, allow_loopback=bool(os.environ.get(env))):
                raise SystemExit(f'{name} must be an https URL on a Microsoft service host: {url}')
        env_id = s['environmentId']
        m = re.fullmatch(r'Default-([0-9a-f-]{36})', env_id, re.I)
        # The default environment is named after the tenant; that is where the flow owner signs in.
        self.tenant_id = os.environ.get('FOLIO_ADMIN_TENANT') or (m[1] if m else 'organizations')
        self.repo = self._find_repo()

    def _find_repo(self):
        cand = [Path(os.environ['FOLIO_ADMIN_REPO'])] if os.environ.get('FOLIO_ADMIN_REPO') else []
        cand += [PKG.parent.parent, Path.cwd()]
        for c in cand:
            if all((c / s).is_file() for s in ESTATE_SOURCES):
                return c.resolve()
        return None

    def __getitem__(self, k):
        return self.values[k]

    def get(self, k, default=None):
        return self.values.get(k, default)


def ensure_token(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(secrets.token_urlsafe(32) + '\n', encoding='utf-8')
    os.chmod(path, 0o600)
    return path.read_text(encoding='utf-8').strip()


# ─────────────────────────────────────────────────────────────────────────────────────────
# Persistence and the audit chain
# ─────────────────────────────────────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS platforms(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, entry_point TEXT NOT NULL,
  port INTEGER NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS endpoints(
  id INTEGER PRIMARY KEY, scope TEXT NOT NULL, endpoint_key TEXT NOT NULL, flow_name TEXT NOT NULL,
  workflow_id TEXT, method TEXT NOT NULL, route TEXT, platform_id TEXT NOT NULL REFERENCES platforms(id),
  state TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(scope, endpoint_key));
CREATE TABLE IF NOT EXISTS configurations(
  key TEXT PRIMARY KEY, value TEXT NOT NULL, scope TEXT NOT NULL, version INTEGER NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS configuration_history(
  id INTEGER PRIMARY KEY, key TEXT NOT NULL, version INTEGER NOT NULL, value TEXT NOT NULL,
  actor TEXT NOT NULL, reason TEXT NOT NULL, changed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS health(
  id INTEGER PRIMARY KEY, asset_type TEXT NOT NULL, asset_id TEXT NOT NULL, state TEXT NOT NULL,
  latency_ms INTEGER, message TEXT NOT NULL, checked_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS health_asset ON health(asset_type, asset_id, checked_at);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, actor TEXT NOT NULL, action TEXT NOT NULL,
  target TEXT NOT NULL, reason TEXT NOT NULL, result TEXT NOT NULL, correlation_id TEXT NOT NULL,
  previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY, severity TEXT NOT NULL, asset TEXT NOT NULL, message TEXT NOT NULL,
  state TEXT NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS incidents(
  id INTEGER PRIMARY KEY, severity TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
  state TEXT NOT NULL, owner TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS changes(
  id INTEGER PRIMARY KEY, change_type TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL,
  state TEXT NOT NULL, maker TEXT NOT NULL, checker TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS record_notes(
  id INTEGER PRIMARY KEY, record_type TEXT NOT NULL, record_id INTEGER NOT NULL, actor TEXT NOT NULL,
  kind TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notes_record ON record_notes(record_type, record_id);
CREATE TABLE IF NOT EXISTS tenant_flows(
  flow_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, state TEXT, created TEXT, modified TEXT,
  trigger_workflow_id TEXT, trigger_path TEXT, synced_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS flow_runs(
  flow_id TEXT NOT NULL, run_id TEXT NOT NULL, status TEXT NOT NULL, start_time TEXT, end_time TEXT, duration_ms INTEGER,
  trigger_name TEXT, origin_history TEXT, error_code TEXT, error_message TEXT, synced_at TEXT NOT NULL,
  PRIMARY KEY(flow_id, run_id));
CREATE INDEX IF NOT EXISTS flow_runs_time ON flow_runs(flow_id, start_time);
CREATE TABLE IF NOT EXISTS folio_flows(
  flow_id TEXT PRIMARY KEY, name TEXT NOT NULL, flow_group TEXT NOT NULL, trigger_desc TEXT NOT NULL, purpose TEXT NOT NULL,
  expected_state TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operators(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, role TEXT NOT NULL, token_digest TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, last_seen_at TEXT);
"""

# Columns added after 1.0.0. Forward-only: a 1.0.0 database gains them in place, nothing is dropped.
MIGRATIONS = {
    'platforms': {'launcher_id': 'TEXT', 'probe_path': "TEXT NOT NULL DEFAULT '/'", 'owner': "TEXT NOT NULL DEFAULT 'platform-administrator'"},
    'endpoints': {'flow_id': 'TEXT', 'flow_candidates': "TEXT NOT NULL DEFAULT ''", 'flow_id_source': 'TEXT',
                  'tenant_state': 'TEXT', 'tenant_modified': 'TEXT', 'tenant_observed_at': 'TEXT', 'identity_verified': 'INTEGER',
                  'register_method': 'TEXT', 'routing_segment': 'TEXT', 'shares_flow_with': "TEXT NOT NULL DEFAULT ''",
                  'operations': "TEXT NOT NULL DEFAULT ''", 'vault_alias': 'TEXT'},
    'configurations': {'updated_by': "TEXT NOT NULL DEFAULT 'provisioning'"},
    'health': {'source': "TEXT NOT NULL DEFAULT 'ingest'"},
    'alerts': {'source': "TEXT NOT NULL DEFAULT 'manual'", 'correlation_id': 'TEXT', 'created_by': "TEXT NOT NULL DEFAULT ''",
               'resolved_at': 'TEXT'},
    'incidents': {'alert_id': 'INTEGER REFERENCES alerts(id)', 'correlation_id': 'TEXT', 'created_by': "TEXT NOT NULL DEFAULT ''",
                  'resolved_at': 'TEXT'},
    'changes': {'risk': "TEXT NOT NULL DEFAULT 'Medium'", 'rollback_plan': "TEXT NOT NULL DEFAULT ''", 'scheduled_for': 'TEXT',
                'decided_by': 'TEXT', 'decided_at': 'TEXT', 'implemented_at': 'TEXT', 'correlation_id': 'TEXT'},
}


class Store:
    def __init__(self, cfg):
        self.cfg = cfg
        self.write_lock = threading.RLock()
        cfg.db_path.parent.mkdir(parents=True, exist_ok=True)
        con = self.connect()
        try:
            con.execute('PRAGMA journal_mode=WAL')
            con.executescript(SCHEMA)
            for table, cols in MIGRATIONS.items():
                have = {r['name'] for r in con.execute(f'PRAGMA table_info({table})')}
                for col, ddl in cols.items():
                    if col not in have:
                        con.execute(f'ALTER TABLE {table} ADD COLUMN {col} {ddl}')
            con.execute("INSERT INTO meta(key,value) VALUES('schema_version',?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (str(SCHEMA_VERSION),))
        finally:
            con.close()
        os.chmod(cfg.db_path, 0o600)

    def connect(self):
        con = sqlite3.connect(str(self.cfg.db_path), timeout=30, isolation_level=None, check_same_thread=False)
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('PRAGMA busy_timeout=30000')
        return con

    @contextmanager
    def read(self):
        con = self.connect()
        try:
            yield con
        finally:
            con.close()

    @contextmanager
    def tx(self):
        with self.write_lock:
            con = self.connect()
            con.execute('BEGIN IMMEDIATE')
            try:
                yield con
                con.execute('COMMIT')
            except BaseException:
                con.execute('ROLLBACK')
                raise
            finally:
                con.close()

    # The chain: event_id|actor|action|target|reason|result|correlation_id|previous_hash|created_at
    @staticmethod
    def event_hash(r):
        return sha256_hex('|'.join([r['event_id'], r['actor'], r['action'], r['target'], r['reason'],
                                    r['result'], r['correlation_id'], r['previous_hash'], r['created_at']]))

    def audit(self, con, actor, action, target, reason, result, correlation_id):
        prev = con.execute('SELECT event_hash FROM audit ORDER BY id DESC LIMIT 1').fetchone()
        row = {'event_id': str(uuid.uuid4()), 'actor': actor, 'action': action, 'target': target,
               'reason': reason, 'result': result, 'correlation_id': correlation_id,
               'previous_hash': prev[0] if prev else 'GENESIS', 'created_at': iso()}
        row['event_hash'] = self.event_hash(row)
        con.execute('INSERT INTO audit(event_id,actor,action,target,reason,result,correlation_id,previous_hash,event_hash,created_at) '
                    'VALUES(:event_id,:actor,:action,:target,:reason,:result,:correlation_id,:previous_hash,:event_hash,:created_at)', row)
        return row

    def audit_alone(self, actor, action, target, reason, result, correlation_id):
        with self.tx() as con:
            return self.audit(con, actor, action, target, reason, result, correlation_id)

    def verify_chain(self, con=None):
        own = con is None
        con = con or self.connect()
        try:
            prev, n = 'GENESIS', 0
            for r in con.execute('SELECT * FROM audit ORDER BY id'):
                n += 1
                if r['previous_hash'] != prev:
                    return {'valid': False, 'events': n, 'mismatchAt': r['id'], 'problem': 'previous_hash does not link'}
                if self.event_hash(r) != r['event_hash']:
                    return {'valid': False, 'events': n, 'mismatchAt': r['id'], 'problem': 'event_hash does not recompute'}
                prev = r['event_hash']
            return {'valid': True, 'events': n, 'head': prev}
        finally:
            if own:
                con.close()


# ─────────────────────────────────────────────────────────────────────────────────────────
# The estate: read from the repository's own registers, never restated here
# ─────────────────────────────────────────────────────────────────────────────────────────

# A Vault alias is <system code>.<contract key, lower case, underscores as hyphens>
# (IDENTIFICATION_SYSTEM.md §17). The estate's scopes are the platforms that call the endpoint;
# 'internal' is the Workspace, whose system code is runtime.
ALIAS_SYSTEM = {'internal': 'runtime', 'portal': 'portal', 'mailer': 'mailer'}


def vault_alias_for(scope, key):
    return f"{ALIAS_SYSTEM.get(scope, scope)}.{key.lower().replace('_', '-')}"


def legacy_vault_alias(scope, key):
    """The alias this Centre derived before 1.2, so a stored default can be moved to the rule."""
    return f"{scope}.{key.lower().replace('_', '-')}"


def tenant_export(repo):
    """The newest flow-usage analysis: every flow in the environment as the flow owner listed it."""
    files = sorted(repo.glob(TENANT_EXPORT_GLOB))
    if not files:
        return None, {}, []
    doc = json.loads(files[-1].read_text(encoding='utf-8'))
    m = re.search(r'(\d{4}-\d{2}-\d{2})', files[-1].name)
    by_id = {f['flow_guid']: f for f in doc.get('allFlows', [])}
    return (m[1] if m else None), by_id, [str(files[-1].relative_to(repo))]


def read_estate(repo):
    if repo is None:
        raise RuntimeError('The estate registers were not found. Run the Centre from the repository, '
                           'or set FOLIO_ADMIN_REPO to the repository root.')
    ids = json.loads((repo / ESTATE_SOURCES[0]).read_text(encoding='utf-8'))
    mail = json.loads((repo / ESTATE_SOURCES[1]).read_text(encoding='utf-8'))
    cross = json.loads((repo / ESTATE_SOURCES[2]).read_text(encoding='utf-8'))
    observed, tenant, export_files = tenant_export(repo)
    by_name = defaultdict(list)
    for f in tenant.values():
        by_name[f['flow_name']].append(f)
    cross_keys = {k['key']: k for k in cross.get('keys', [])}
    # The adopted flow per contract key (registers/flow-adoption.json): the record of which flow serves a key. It names the
    # flows created after the crosswalk's catalogue was extracted (IP_OTP_GENERATE 2026-10-07, IP_User_Admin_Endpoint 2026-10-08).
    adoption_path = repo / 'docs/folio-Master-Flows-and-Endpoints/registers/flow-adoption.json'
    adopted = {}
    if adoption_path.exists():
        for a in json.loads(adoption_path.read_text(encoding='utf-8')).get('adopted', []):
            for k in a.get('contractKeys') or []:
                adopted.setdefault(k, a.get('flowId'))

    def identity(key, workflow_id):
        """Tenant flow ids for a key. The application workflow id (in a trigger URL) and the tenant flow
        id (in management paths) are not derivable from each other; the crosswalk records which
        extraction or package tied them together. Several ids means the tie is not yet unique and is
        settled live by comparing each candidate's own trigger workflow (Flows › Sync)."""
        e = cross_keys.get(key)
        cands = []
        for c in (e or {}).get('candidates', []):
            if c.get('applicationWorkflowId') in (workflow_id, None) and c.get('tenantFlowId') and c['tenantFlowId'] not in cands:
                cands.append(c['tenantFlowId'])
        if not cands and adopted.get(key):
            cands.append(adopted[key])
        return cands

    def deployment(flow_id):
        f = tenant.get(flow_id) if flow_id else None
        return (f.get('state'), (f.get('modified') or '')[:10] or None) if f else (None, None)

    rows = []
    for scope, platform in (('internal', 'workspace'), ('portal', 'portal')):
        for key, v in ids[scope].items():
            route = urlsplit(v.get('urlTemplate') or '').path or None
            cands = identity(key, v.get('workflowId'))
            # Several candidates: the adoption register records which flow serves the key, so it settles the tie.
            # A sync still verifies the tie against the flow's live trigger and reports drift.
            settled = adopted.get(key) if len(cands) > 1 and adopted.get(key) in cands else None
            flow_id = cands[0] if len(cands) == 1 else settled
            state, modified = deployment(flow_id)
            rows.append({'scope': scope, 'endpoint_key': key, 'flow_name': v.get('flow') or key,
                         'workflow_id': v.get('workflowId'), 'method': v.get('method') or 'POST', 'route': route,
                         'platform_id': platform, 'register_method': v.get('registerMethod'),
                         'routing_segment': v.get('routingSegment'),
                         'shares_flow_with': ','.join(v.get('sharesFlowWith') or []), 'operations': '',
                         'vault_alias': vault_alias_for(scope, key), 'flow_id': flow_id, 'flow_candidates': ','.join(cands),
                         'flow_id_source': 'adoption' if settled else 'crosswalk' if flow_id else ('ambiguous' if cands else None),
                         'tenant_state': state, 'tenant_modified': modified, 'tenant_observed_at': observed if flow_id else None})
    for f in mail['flows']:
        method = (re.search(r'\((GET|POST|PUT|PATCH|DELETE)\)', f.get('trigger', '')) or [None, 'POST'])[1]
        found = [x for x in by_name.get(f['name'], []) if x.get('flow_guid')]
        cands = [x['flow_guid'] for x in found]
        flow_id = cands[0] if len(cands) == 1 else None
        state, modified = deployment(flow_id)
        rows.append({'scope': 'mailer', 'endpoint_key': f['endpointKey'], 'flow_name': f['name'],
                     'workflow_id': None, 'method': method, 'route': None, 'platform_id': 'mailer',
                     'register_method': None, 'routing_segment': None, 'shares_flow_with': '',
                     'operations': ','.join(f.get('operations') or []),
                     'vault_alias': vault_alias_for('mailer', f['endpointKey']), 'flow_id': flow_id, 'flow_candidates': ','.join(cands),
                     'flow_id_source': 'tenant-export' if flow_id else ('ambiguous' if cands else None),
                     'tenant_state': state, 'tenant_modified': modified, 'tenant_observed_at': observed if flow_id else None})
    sources = [{'path': s, 'sha256': sha256_hex((repo / s).read_bytes())} for s in list(ESTATE_SOURCES) + export_files]
    return rows, sources


ESTATE_FIELDS = ('flow_name', 'method', 'platform_id', 'register_method', 'routing_segment', 'shares_flow_with',
                 'operations', 'flow_candidates', 'tenant_state', 'tenant_modified', 'tenant_observed_at')
# Identity the registers hold, but which a live flow-owner resolution may have filled in where the
# registers are silent (the mailer's trigger workflow ids, an ambiguous tenant flow id). The registers
# win when they say something; a live value is kept when they say nothing.
ESTATE_IDENTITY = ('workflow_id', 'route', 'flow_id', 'flow_id_source')


def reconcile_estate(con, rows):
    """Bring the endpoint table into line with the registers. Returns what moved."""
    ts = iso()
    have = {(r['scope'], r['endpoint_key']): dict(r) for r in con.execute('SELECT * FROM endpoints')}
    want = {(r['scope'], r['endpoint_key']): r for r in rows}
    added, updated, retired = [], [], []
    for k, r in want.items():
        cur = have.get(k)
        if cur is None:
            con.execute('INSERT INTO endpoints(scope,endpoint_key,flow_name,workflow_id,method,route,platform_id,state,updated_at,'
                        'register_method,routing_segment,shares_flow_with,operations,vault_alias,flow_id,flow_candidates,'
                        'flow_id_source,tenant_state,tenant_modified,tenant_observed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                        (r['scope'], r['endpoint_key'], r['flow_name'], r['workflow_id'], r['method'], r['route'],
                         r['platform_id'], 'Registered', ts, r['register_method'], r['routing_segment'],
                         r['shares_flow_with'], r['operations'], r['vault_alias'], r['flow_id'], r['flow_candidates'],
                         r['flow_id_source'], r['tenant_state'], r['tenant_modified'], r['tenant_observed_at']))
            added.append(f'{k[0]}:{k[1]}')
        else:
            diff = [f for f in ESTATE_FIELDS if (cur.get(f) or None) != (r[f] or None)]
            diff += [f for f in ESTATE_IDENTITY if r[f] and (cur.get(f) or None) != r[f]]
            revive = cur['state'] == 'Retired'
            if diff or revive:
                sets = ', '.join(f'{f}=?' for f in diff) + (', ' if diff else '') + 'updated_at=?' + (", state='Registered'" if revive else '')
                con.execute(f'UPDATE endpoints SET {sets} WHERE id=?', [r[f] for f in diff] + [ts, cur['id']])
                updated.append({'endpoint': f'{k[0]}:{k[1]}', 'fields': diff + (['state'] if revive else [])})
            # Fill an empty alias, and move one this Centre derived itself before 1.2 to the rule.
            # An alias an operator chose is left alone.
            stored = cur.get('vault_alias')
            if not stored or (stored == legacy_vault_alias(k[0], k[1]) and stored != r['vault_alias']):
                con.execute('UPDATE endpoints SET vault_alias=? WHERE id=?', (r['vault_alias'], cur['id']))
    for k, cur in have.items():
        if k not in want and cur['state'] != 'Retired':
            con.execute("UPDATE endpoints SET state='Retired', updated_at=? WHERE id=?", (ts, cur['id']))
            retired.append(f'{k[0]}:{k[1]}')
    return {'added': added, 'updated': updated, 'retired': retired, 'total': len(want)}


def read_catalogue(repo):
    """Every Folio flow the flow catalogue names: its group, trigger, purpose and the state it should be in."""
    if repo is None or not (repo / CATALOGUE_SOURCE).is_file():
        return [], []
    raw = (repo / CATALOGUE_SOURCE).read_bytes()
    rows = []
    for f in json.loads(raw.decode('utf-8')).get('flows', []):
        if not re.fullmatch(r'[0-9a-fA-F-]{36}', f.get('flowId') or ''):
            continue
        expected = f.get('expectedState') or 'Started'
        if expected not in FLOW_STATES:
            raise RuntimeError(f"{CATALOGUE_SOURCE}: {f.get('name')} has expectedState {expected}; it must be one of {', '.join(FLOW_STATES)}")
        rows.append({'flow_id': f['flowId'].lower(), 'name': (f.get('name') or '').strip() or f['flowId'], 'flow_group': f.get('group') or '',
                     'trigger_desc': f.get('trigger') or '', 'purpose': f.get('purpose') or '', 'expected_state': expected})
    return rows, [{'path': CATALOGUE_SOURCE, 'sha256': sha256_hex(raw)}]


CATALOGUE_FIELDS = ('name', 'flow_group', 'trigger_desc', 'purpose', 'expected_state')


def reconcile_catalogue(con, rows):
    """Bring the Folio flow table into line with the catalogue. Returns what moved."""
    ts = iso()
    have = {r['flow_id']: dict(r) for r in con.execute('SELECT * FROM folio_flows')}
    want = {r['flow_id']: r for r in rows}
    added, updated, retired = [], [], []
    for fid, r in want.items():
        cur = have.get(fid)
        if cur is None:
            con.execute('INSERT INTO folio_flows(flow_id,name,flow_group,trigger_desc,purpose,expected_state,state,updated_at) VALUES(?,?,?,?,?,?,?,?)',
                        (fid, r['name'], r['flow_group'], r['trigger_desc'], r['purpose'], r['expected_state'], 'Registered', ts))
            added.append(r['name'])
            continue
        diff = [f for f in CATALOGUE_FIELDS if cur.get(f) != r[f]] + (['state'] if cur['state'] == 'Retired' else [])
        if diff:
            con.execute('UPDATE folio_flows SET name=?, flow_group=?, trigger_desc=?, purpose=?, expected_state=?, state=?, updated_at=? WHERE flow_id=?',
                        (r['name'], r['flow_group'], r['trigger_desc'], r['purpose'], r['expected_state'], 'Registered', ts, fid))
            updated.append({'flow': r['name'], 'fields': diff})
    for fid, cur in have.items():
        if fid not in want and cur['state'] != 'Retired':
            con.execute("UPDATE folio_flows SET state='Retired', updated_at=? WHERE flow_id=?", (ts, fid))
            retired.append(cur['name'])
    return {'added': added, 'updated': updated, 'retired': retired, 'total': len(want)}


def config_value_text(v):
    return json.dumps(v, separators=(',', ':'))


def provision(store, cfg):
    """First start: platforms, the endpoint estate, settings and the provisioning event."""
    with store.tx() as con:
        if con.execute("SELECT value FROM meta WHERE key='provisioned_at'").fetchone():
            return None
        ts = iso()
        for pid, name, typ, entry, port, probe, launcher in PLATFORMS:
            con.execute('INSERT OR IGNORE INTO platforms(id,name,type,entry_point,port,status,updated_at,launcher_id,probe_path) '
                        'VALUES(?,?,?,?,?,?,?,?,?)', (pid, name, typ, entry, port, 'Registered', ts, launcher, probe))
        rows, sources = read_estate(cfg.repo)
        moved = reconcile_estate(con, rows)
        flows, flow_sources = read_catalogue(cfg.repo)
        catalogue = reconcile_catalogue(con, flows)
        sources += flow_sources
        for k, v in cfg.file_settings.items():
            scope = 'runtime' if k in MUTABLE else ('tenant-boundary' if k in ('environmentId', 'sharePointConnectionId') else 'restart-bound')
            con.execute('INSERT OR IGNORE INTO configurations(key,value,scope,version,updated_at,updated_by) VALUES(?,?,?,?,?,?)',
                        (k, config_value_text(v), scope, 1, ts, 'provisioning'))
        con.execute("INSERT INTO meta(key,value) VALUES('provisioned_at',?)", (ts,))
        counts = {s: sum(1 for r in rows if r['scope'] == s) for s in ('internal', 'portal', 'mailer')}
        corr = str(uuid.uuid4())
        store.audit(con, 'provisioning', 'system.provision', f'{cfg["systemName"]} {cfg["version"]}',
                    f'Provisioned {len(PLATFORMS)} platforms and {moved["total"]} endpoint records '
                    f'({counts["internal"]} internal, {counts["portal"]} portal, {counts["mailer"]} mailer) and {catalogue["total"]} Folio flows '
                    f'from the repository registers',
                    'Succeeded', corr)
    cfg.evidence_dir.mkdir(parents=True, exist_ok=True)
    evidence = {
        'schema': 'folio-admin-provisioning/v2', 'provisionedAt': ts, 'system': cfg['systemName'], 'version': cfg['version'],
        'sources': sources, 'platforms': len(PLATFORMS), 'endpoints': moved['total'], 'endpointsByScope': counts, 'folioFlows': catalogue['total'],
        'environmentId': cfg['environmentId'], 'sharePointConnectionId': cfg['sharePointConnectionId'],
        'boundary': 'Local, offline provisioning. No tenant session, management credential or signed trigger URL was used or stored.',
    }
    p = cfg.evidence_dir / 'provisioning.json'
    p.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    os.chmod(p, 0o600)
    return evidence


# ─────────────────────────────────────────────────────────────────────────────────────────
# Health: probes, effective state, monitor alerts
# ─────────────────────────────────────────────────────────────────────────────────────────

def effective_state(latest, stale_after, now=None):
    if not latest:
        return 'Unknown'
    t = parse_iso(latest['checked_at'])
    if t is None or ((now or utcnow()) - t).total_seconds() > stale_after:
        return 'Stale'
    return latest['state']


def probe_url(url, timeout, degraded_ms, expect_platform=None):
    start = time.monotonic()
    try:
        req = Request(url, headers={'User-Agent': 'FolioAdminCentre/2.0', 'Accept': '*/*'}, method='GET')
        with urlopen(req, timeout=timeout) as r:
            status, served_by = r.status, r.headers.get('X-DGO-Platform')
            r.read(4096)
    except HTTPError as e:
        status, served_by = e.code, e.headers.get('X-DGO-Platform') if e.headers else None
    except (URLError, TimeoutError, ConnectionError, OSError) as e:
        ms = int((time.monotonic() - start) * 1000)
        reason = getattr(e, 'reason', e)
        return 'Unavailable', ms, f'No answer from {url}: {reason}'
    ms = int((time.monotonic() - start) * 1000)
    if expect_platform and served_by and served_by != expect_platform:
        return 'Degraded', ms, f'Port answered as "{served_by}", not "{expect_platform}" — another platform holds it'
    if status >= 500:
        return 'Unavailable', ms, f'HTTP {status} from {url}'
    if status >= 400:
        return 'Degraded', ms, f'HTTP {status} from {url}: the port answers but not with this platform'
    if ms > degraded_ms:
        return 'Degraded', ms, f'HTTP {status} in {ms} ms, above the {degraded_ms} ms threshold'
    return 'Healthy', ms, f'HTTP {status} in {ms} ms'


class Monitor(threading.Thread):
    def __init__(self, app):
        super().__init__(name='health-monitor', daemon=True)
        self.app = app
        self.wake = threading.Event()
        self.stopped = threading.Event()
        self.last_run = None
        self.next_run = None
        self.last_prune = None
        self.cycles = 0

    def run(self):
        while not self.stopped.is_set():
            try:
                self.app.probe_platforms(actor='health-monitor', source='monitor')
                self.cycles += 1
                o = self.app.owner
                if o.state == 'signed-in' and (not o.last_sync or (utcnow() - parse_iso(o.last_sync)).total_seconds()
                                               >= int(self.app.setting('runHistoryIntervalSeconds'))):
                    self.app.safe_sync('flow-run-monitor', 'Scheduled flow-run sync')
                if not self.last_prune or (utcnow() - self.last_prune).total_seconds() > 86400:
                    self.app.prune(actor='retention-policy', reason='Scheduled daily retention of health observations')
                    self.last_prune = utcnow()
            except Exception as e:  # the monitor must outlive a bad cycle
                print(f'[monitor] cycle failed: {e}', file=sys.stderr)
            self.last_run = utcnow()
            interval = int(self.app.setting('healthIntervalSeconds'))
            self.next_run = self.last_run + timedelta(seconds=interval)
            self.wake.wait(interval)
            self.wake.clear()


# ─────────────────────────────────────────────────────────────────────────────────────────
# The application: every operation the API exposes
# ─────────────────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────────────────
# Flow owner: the Power Automate service as the account that owns the flows
#
# Signs in the way the mailer's setup does (scripts/mailer-package/setup.mjs and
# scripts/lib/device-sign-in.mjs): a device code, Microsoft's own public sign-in apps, the flow
# service scope — no app registration, no admin consent, no secret. Every call is on the
# user-scoped ProcessSimple paths (/environments/{env}/flows/...), never /scopes/admin/, so the
# account can read and act on exactly the flows it owns or co-owns and nothing else.
#
# Tokens live in this process's memory only. They are never written to the database, the audit
# chain or a log. By default a restart needs a new sign-in. When FOLIO_MS_SESSION names a session
# file (the platform suite's `folio` sets ~/.folio/microsoft/session.json), the refresh token is
# kept there, mode 0600, so the sign-in survives restarts and is shared with the mailer's setup:
# loaded at start, rewritten each time Microsoft rotates it, deleted on sign-out or when Microsoft
# refuses it. The access token is never written anywhere. A trigger callback URL, read only to
# learn which workflow a flow's trigger addresses, is parsed in memory and discarded on the spot.
# ─────────────────────────────────────────────────────────────────────────────────────────

FLOW_CLIENTS = (('1950a258-227b-4e31-a9cf-717495945fc2', 'Microsoft Azure PowerShell'),
                ('9cee029c-6210-4654-90bb-17e6e9d36617', 'Power Platform CLI'))
FLOW_SCOPE = 'https://service.flow.microsoft.com//.default offline_access openid profile'
APP_REFUSED = re.compile(r'AADSTS(700016|65002|65001|7000112|50059|500011|650057)\b|unauthorized_client|invalid_client')
FLOW_API_VERSION = 'api-version=2016-11-01'
RUN_HEALTH = {'Succeeded': 'Healthy', 'Failed': 'Unavailable', 'TimedOut': 'Degraded', 'Cancelled': 'Degraded', 'Aborted': 'Degraded'}


def mask_tree(v):
    """A flow's reply with every credential-shaped string redacted, value by value, so it stays valid JSON."""
    if isinstance(v, dict):
        return {k: mask_tree(x) for k, x in v.items()}
    if isinstance(v, list):
        return [mask_tree(x) for x in v]
    return mask_credentials(v, 10 ** 7) if isinstance(v, str) else v


def mask_credentials(text, limit=600):
    text = CREDENTIAL.sub('[redacted]', str(text or ''))
    text = re.sub(r'https://\S+sig=\S+', '[redacted URL]', text)
    return text[:limit]


def flow_time(s):
    """Flow service timestamps carry up to seven fractional digits, which datetime will not parse."""
    m = re.match(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?', s or '')
    if not m:
        return None
    return datetime.strptime(m[1], '%Y-%m-%dT%H:%M:%S').replace(tzinfo=timezone.utc) + timedelta(microseconds=int((m[2] or '0')[:6].ljust(6, '0')))


def jwt_claims(token):
    try:
        import base64
        part = token.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))
    except Exception:
        return {}


class FlowOwner:
    def __init__(self, cfg, pause=time.sleep):
        self.cfg = cfg
        self.lock = threading.RLock()
        self.pause = pause
        self.state = 'signed-out'
        self.user = None
        self.client = None
        self.device = None
        self.error = None
        self.signed_in_at = None
        self.last_sync = None
        self.last_sync_result = None
        self._access = None
        self._refresh = None
        self._expires = 0.0
        self._cancel = threading.Event()
        self.poll_seconds = None   # tests shorten the device-code polling interval
        self.session_path = Path(os.environ['FOLIO_MS_SESSION']) if os.environ.get('FOLIO_MS_SESSION') else None
        self._load_session()

    # ── the persisted session (FOLIO_MS_SESSION) ─────────────────────────────────────────
    def _load_session(self):
        """Adopt a stored refresh token. The first call that needs a token redeems it."""
        p = self.session_path
        if not p or not p.is_file():
            return False
        try:
            j = json.loads(p.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            return False
        cid = j.get('clientId')
        if not j.get('refreshToken') or cid not in {c for c, _ in FLOW_CLIENTS}:
            return False
        with self.lock:
            if self._refresh or self._access:
                return True
            self._refresh, self._cid = j['refreshToken'], cid
            self.client = j.get('clientName') or dict(FLOW_CLIENTS).get(cid)
            self.user = j.get('user') or None
            self.signed_in_at = j.get('signedInAt') or j.get('savedAt')
            self.state, self.error = 'signed-in', None
        return True

    def _save_session(self):
        p = self.session_path
        if not p:
            return
        with self.lock:
            if not self._refresh:
                return
            body = {'schema': 'folio-ms-session/1', 'clientId': getattr(self, '_cid', FLOW_CLIENTS[0][0]), 'clientName': self.client,
                    'tenant': self.cfg.tenant_id, 'refreshToken': self._refresh, 'user': self.user,
                    'signedInAt': self.signed_in_at, 'savedAt': iso(), 'savedBy': 'admin-centre'}
        try:
            p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            tmp = p.with_name(p.name + '.tmp')
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(body, f, indent=2)
            os.chmod(tmp, 0o600)
            os.replace(tmp, p)
        except OSError:
            pass   # the sign-in still works for this process; it just will not survive a restart

    def _drop_session(self):
        if self.session_path:
            try:
                self.session_path.unlink()
            except OSError:
                pass

    # ── identity platform ────────────────────────────────────────────────────────────────
    def _form(self, url, fields):
        data = '&'.join(f'{k}={quote(str(v), safe="")}' for k, v in fields.items()).encode()
        req = Request(url, data=data, method='POST', headers={'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json'})
        try:
            with urlopen(req, timeout=30) as r:
                return r.status, json.loads(r.read() or b'{}')
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read() or b'{}')
            except ValueError:
                return e.code, {}
        except (URLError, TimeoutError, OSError) as e:
            return 0, {'error': 'unreachable', 'error_description': str(getattr(e, 'reason', e))}

    @staticmethod
    def _describe(status, j):
        e = j.get('error')
        d = str(j.get('error_description') or '').split('\r\n')[0]
        return f'HTTP {status}' + (f' — {e}' if e else '') + (f': {d}' if d else '')

    def status(self):
        if self.state in ('signed-out', 'expired'):
            self._load_session()   # picks up a sign-in made elsewhere (folio signin) without a restart
        with self.lock:
            dev = dict(self.device) if self.device else None
            return {'state': self.state, 'user': self.user, 'client': self.client, 'device': dev, 'error': self.error,
                    'signedInAt': self.signed_in_at, 'tokenExpiresAt': iso(datetime.fromtimestamp(self._expires, timezone.utc)) if self._access else None,
                    'lastSync': self.last_sync, 'lastSyncResult': self.last_sync_result,
                    'environment': self.cfg['environmentId'], 'tenant': self.cfg.tenant_id, 'service': self.cfg.flow_api}

    def start_sign_in(self, on_done=None):
        with self.lock:
            if self.state == 'pending' and self.device:
                return self.status()
            self._cancel.clear()
            self.state, self.error, self.device = 'pending', None, None
        ready = threading.Event()
        threading.Thread(target=self._device_flow, args=(ready, on_done), daemon=True, name='flow-owner-sign-in').start()
        ready.wait(35)
        return self.status()

    def _device_flow(self, ready, on_done):
        base = f'{self.cfg.login}/{self.cfg.tenant_id}/oauth2/v2.0'
        refusals = []
        try:
            for cid, cname in FLOW_CLIENTS:
                st, dc = self._form(f'{base}/devicecode', {'client_id': cid, 'scope': FLOW_SCOPE})
                if st != 200 or not dc.get('device_code'):
                    why = self._describe(st, dc)
                    if APP_REFUSED.search(why):
                        refusals.append(f'{cname}: {why}')
                        continue
                    raise RuntimeError(f'Microsoft sign-in is not available: {why}')
                with self.lock:
                    self.client = cname
                    self.device = {'userCode': dc['user_code'], 'verificationUri': dc.get('verification_uri') or 'https://microsoft.com/devicelogin',
                                   'expiresAt': iso(utcnow() + timedelta(seconds=int(dc.get('expires_in') or 900))), 'app': cname}
                ready.set()
                interval = self.poll_seconds or int(dc.get('interval') or 5)
                deadline = time.monotonic() + int(dc.get('expires_in') or 900)
                refused = None
                while True:
                    if self._cancel.wait(interval):
                        raise RuntimeError('Sign-in was cancelled.')
                    st, t = self._form(f'{base}/token', {'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
                                                          'client_id': cid, 'device_code': dc['device_code']})
                    if st == 200 and t.get('access_token'):
                        self._accept(t, cid, fresh=True)
                        if on_done:
                            on_done(self.user)
                        return
                    code = t.get('error')
                    if code == 'authorization_pending':
                        if time.monotonic() > deadline:
                            raise RuntimeError('The sign-in code expired. Start again.')
                        continue
                    if code == 'slow_down':
                        interval += 5
                        continue
                    if code == 'authorization_declined':
                        raise RuntimeError('Sign-in was declined.')
                    if code == 'expired_token':
                        raise RuntimeError('The sign-in code expired. Start again.')
                    why = self._describe(st, t)
                    if APP_REFUSED.search(why):
                        refused = why
                        break
                    raise RuntimeError(f'Sign-in failed: {why}')
                refusals.append(f'{cname}: {refused}')
            raise RuntimeError('Microsoft refused every public sign-in app in this tenant: ' + '; '.join(refusals))
        except Exception as e:
            with self.lock:
                self.state, self.error, self.device = 'error', mask_credentials(e), None
        finally:
            ready.set()

    def _accept(self, t, cid, fresh=False):
        c = jwt_claims(t['access_token'])
        with self.lock:
            self._access = t['access_token']
            self._refresh = t.get('refresh_token') or self._refresh
            self._expires = time.time() + int(t.get('expires_in') or 3600)
            self._cid = cid
            self.user = {'name': c.get('name') or '', 'email': c.get('upn') or c.get('unique_name') or c.get('preferred_username') or '',
                         'objectId': c.get('oid') or ''}
            self.state, self.device, self.error = 'signed-in', None, None
            if fresh or not self.signed_in_at:
                self.signed_in_at = iso()
        self._save_session()

    def cancel(self):
        self._cancel.set()

    def sign_out(self):
        self._cancel.set()
        with self.lock:
            self._access = self._refresh = None
            self._expires = 0.0
            self.state, self.user, self.device, self.error, self.client = 'signed-out', None, None, None, None
        self._drop_session()

    def _token(self):
        if not self._access and not self._refresh:
            self._load_session()   # a session saved since this process started (folio signin)
        with self.lock:
            if not self._access and not self._refresh:
                raise ApiError(409, 'flow owner not signed in', 'Connect as the flow owner under Flows first.')
            if self._access and time.time() < self._expires - 120:
                return self._access
            refresh, cid = self._refresh, getattr(self, '_cid', FLOW_CLIENTS[0][0])
        if refresh:
            st, t = self._form(f'{self.cfg.login}/{self.cfg.tenant_id}/oauth2/v2.0/token',
                               {'grant_type': 'refresh_token', 'client_id': cid, 'refresh_token': refresh, 'scope': FLOW_SCOPE})
            if st == 200 and t.get('access_token'):
                self._accept(t, cid)
                return self._access
        with self.lock:
            self._access = self._refresh = None
            self.state, self.error = 'expired', 'The flow owner session expired. Connect again.'
        self._drop_session()
        raise ApiError(409, 'flow owner session expired', 'Connect as the flow owner again under Flows.')

    # ── flow service ────────────────────────────────────────────────────────────────────
    def env_base(self):
        return f"{self.cfg.flow_api}/providers/Microsoft.ProcessSimple/environments/{quote(self.cfg['environmentId'])}"

    def call(self, method, path, body=None, absolute=None, retried=False):
        url = absolute or (self.env_base() + path + ('&' if '?' in path else '?') + FLOW_API_VERSION)
        if absolute and urlsplit(absolute).netloc != urlsplit(self.cfg.flow_api).netloc:
            raise ApiError(502, 'flow service error', 'A continuation link pointed at another host; refused.')
        data = json.dumps(body).encode() if body is not None else (b'' if method == 'POST' else None)
        req = Request(url, data=data, method=method, headers={'Authorization': 'Bearer ' + self._token(), 'Accept': 'application/json',
                                                              'Content-Type': 'application/json', 'User-Agent': 'FolioAdminCentre/2.1'})
        try:
            with urlopen(req, timeout=45) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except HTTPError as e:
            try:
                j = json.loads(e.read() or b'{}')
            except ValueError:
                j = {}
            if e.code == 401 and not retried:
                with self.lock:
                    self._expires = 0
                return self.call(method, path, body, absolute, retried=True)
            err = (j.get('error') or {}) if isinstance(j.get('error'), dict) else {'message': j.get('error')}
            detail = mask_credentials(err.get('message') or err.get('code') or f'HTTP {e.code}', 300)
            if e.code == 403:
                raise ApiError(403, 'not an owner of this flow', f'The signed-in account may not do this: {detail}')
            if e.code == 404:
                raise ApiError(404, 'flow not found for this account', detail)
            raise ApiError(502, 'flow service error', f'HTTP {e.code}: {detail}')
        except (URLError, TimeoutError, OSError) as e:
            raise ApiError(502, 'flow service unreachable', str(getattr(e, 'reason', e)))

    def all(self, path, pages=50):
        out, j = [], self.call('GET', path)
        for _ in range(pages):
            out += j.get('value', [])
            nxt = j.get('nextLink') or j.get('@odata.nextLink')
            if not nxt:
                break
            j = self.call('GET', None, absolute=nxt)
        return out

    def trigger_identity(self, flow_id, trigger='manual'):
        """Which workflow a flow's HTTP trigger addresses, read from its callback URL. The URL carries
        the signature — a credential — so only the workflow id and the path survive this function."""
        j = self.call('POST', f'/flows/{quote(flow_id)}/triggers/{quote(trigger)}/listCallbackUrl')
        url = (j.get('response') or {}).get('value') or j.get('value') or ''
        path = urlsplit(url).path
        m = re.search(r'/workflows/([0-9a-f]{32})/', path)
        del url, j
        return (m[1], path) if m else (None, None)


class Principal:
    def __init__(self, role, name=None, kind='bootstrap', op_id=None):
        self.role, self.name, self.kind, self.op_id = role, name, kind, op_id

    def can(self, perm):
        return self.role in PERMISSIONS[perm]


class App:
    def __init__(self, cfg):
        self.cfg = cfg
        self.store = Store(cfg)
        self.admin_token = ensure_token(cfg.token_path)
        self.provisioned = provision(self.store, cfg)
        if not self.provisioned:
            self.read_catalogue_at_start()
        self.runtime = {}
        with self.store.read() as con:
            for r in con.execute('SELECT key, value FROM configurations'):
                if r['key'] in MUTABLE:
                    self.runtime[r['key']] = json.loads(r['value'])
        self.started = utcnow()
        self.metrics = {'requests': 0, 'byStatus': defaultdict(int), 'authFailures': 0, 'forbidden': 0,
                        'mutations': 0, 'rateLimited': 0}
        self.failed_auth = defaultdict(deque)
        self.metrics_lock = threading.Lock()
        self.monitor = Monitor(self) if cfg.monitor else None
        self.owner = FlowOwner(cfg)
        self.test_proofs = {}   # operator -> Folio sign-in proof for flow tests: memory only, never stored or logged
        self.test_last = {}

    def setting(self, k):
        return self.runtime.get(k, self.cfg.get(k))

    # ── authentication ──────────────────────────────────────────────────────────────────
    def authenticate(self, header, client):
        q = self.failed_auth[client]
        t = time.monotonic()
        while q and q[0] < t - 300:
            q.popleft()
        if len(q) >= 20:
            with self.metrics_lock:
                self.metrics['rateLimited'] += 1
            raise ApiError(429, 'too many failed attempts', 'Wait five minutes before trying again.')
        token = header[7:].strip() if header.startswith('Bearer ') else ''
        if token and hmac.compare_digest(token.encode(), self.admin_token.encode()):
            return Principal('super_admin')
        if token:
            with self.store.read() as con:
                r = con.execute('SELECT * FROM operators WHERE token_digest=? AND enabled=1', (sha256_hex(token),)).fetchone()
            if r:
                seen = parse_iso(r['last_seen_at'] or '')
                if not seen or (utcnow() - seen).total_seconds() > 60:
                    with self.store.tx() as con:
                        con.execute('UPDATE operators SET last_seen_at=? WHERE id=?', (iso(), r['id']))
                return Principal(r['role'], r['name'], 'operator', r['id'])
        q.append(t)
        with self.metrics_lock:
            self.metrics['authFailures'] += 1
        raise ApiError(401, 'unauthorized', 'The bearer token is missing or incorrect.')

    # ── the launcher's one-time sign-in ─────────────────────────────────────────────────
    # scripts/folio-admin.mjs, which can read config/admin.token itself, writes config/launch.json
    # (0600: the SHA-256 of a random code, an expiry and the operator's accountable name) and opens
    # the browser at /#launch=<code>. The page trades the code here for the token it would otherwise
    # have to paste. The code works once and until its expiry, which may be at most LAUNCH_MAX_MINUTES
    # away; a wrong one counts as a failed sign-in.
    def redeem_launch(self, body, client):
        q = self.failed_auth[client]
        t = time.monotonic()
        while q and q[0] < t - 300:
            q.popleft()
        if len(q) >= 20:
            raise ApiError(429, 'too many failed attempts', 'Wait five minutes before trying again.')
        code = body.get('code') if isinstance(body.get('code'), str) else ''
        path = self.cfg.token_path.parent / 'launch.json'
        try:
            j = json.loads(path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            j = {}
        expires = parse_iso(str(j.get('expiresAt') or ''))
        good = (code and isinstance(j.get('codeSha256'), str) and expires
                and utcnow() < expires <= utcnow() + timedelta(minutes=LAUNCH_MAX_MINUTES)
                and hmac.compare_digest(sha256_hex(code).encode(), j['codeSha256'].encode()))
        if not good:
            if expires and utcnow() >= expires:
                path.unlink(missing_ok=True)
            q.append(t)
            with self.metrics_lock:
                self.metrics['authFailures'] += 1
            raise ApiError(401, 'launch code refused', 'This sign-in link has been used or has expired. Start the Centre again, or paste the token.')
        path.unlink(missing_ok=True)
        actor = str(j.get('actor') or '')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 ._@\-]{1,79}', actor):
            actor = ''
        self.store.audit_alone(actor or 'launcher', 'session.launch', 'access:bootstrap',
                               'Opened from the launcher on this computer with a one-time sign-in link', 'Succeeded', str(uuid.uuid4()))
        return {'token': self.admin_token, 'actor': actor}

    # ── input validation ────────────────────────────────────────────────────────────────
    def guard_text(self, name, value):
        if CREDENTIAL.search(value) or (len(self.admin_token) > 20 and self.admin_token in value):
            raise ApiError(400, 'credential-like content refused',
                           f'"{name}" looks like it contains a signed URL, token or password. Never place credentials in the Centre.')
        return value

    def text(self, body, name, required=True, max_len=2000, min_len=1, default=''):
        v = body.get(name, default)
        if v is None:
            v = ''
        if not isinstance(v, str):
            raise ApiError(400, f'{name} must be text')
        v = v.strip()
        if required and len(v) < min_len:
            raise ApiError(400, f'{name} required' if not v else f'{name} too short', f'Supply {name}' + (f' (at least {min_len} characters).' if min_len > 1 else '.'))
        if len(v) > max_len:
            raise ApiError(400, f'{name} too long', f'{name} is limited to {max_len} characters.')
        return self.guard_text(name, v)

    def choice(self, body, name, options, default=None):
        v = body.get(name, default)
        if v not in options:
            raise ApiError(400, f'{name} invalid', f'{name} must be one of: {", ".join(options)}.')
        return v

    def actor_of(self, p, body):
        if p.kind == 'operator':
            return p.name
        a = body.get('actor')
        if not isinstance(a, str) or not a.strip():
            raise ApiError(400, 'actor required', 'Name the accountable person or role making this change.')
        a = a.strip()
        if not ACTOR_RE.match(a):
            raise ApiError(400, 'actor invalid', 'Use 2–80 letters, digits, spaces, dots, dashes, @ or underscores.')
        return a

    def reason_of(self, body):
        return self.text(body, 'reason', min_len=5, max_len=1000)

    def correlation_of(self, body):
        c = body.get('correlationId')
        if c is None or c == '':
            return str(uuid.uuid4())
        if not isinstance(c, str) or not re.fullmatch(r'[A-Za-z0-9._:\-]{6,80}', c):
            raise ApiError(400, 'correlationId invalid', 'Use 6–80 letters, digits, dots, dashes, colons or underscores.')
        return c

    def require(self, p, perm):
        if not p.can(perm):
            with self.metrics_lock:
                self.metrics['forbidden'] += 1
            raise ApiError(403, 'forbidden', f'The {ROLE_LABELS[p.role]} role may not perform {perm}.')

    def mutate(self, p, body, perm, action, target_fn, work):
        """Validate, run `work` in one transaction with its audit event; audit a failure on its own."""
        actor = self.actor_of(p, body)
        reason = self.reason_of(body)
        corr = self.correlation_of(body)
        target = target_fn() if callable(target_fn) else target_fn
        if not p.can(perm):
            self.store.audit_alone(actor, action, target, reason, 'Denied', corr)
            self.require(p, perm)
        try:
            with self.store.tx() as con:
                result = work(con, actor, reason, corr)
                tgt = result.pop('_target', target) if isinstance(result, dict) else target
                self.store.audit(con, actor, action, tgt, reason, 'Succeeded', corr)
        except ApiError as e:
            if e.status != 404:  # a rule the request broke is evidence; a missing record is not
                self.store.audit_alone(actor, action, target, reason, 'Failed', corr)
            raise
        except sqlite3.Error:
            self.store.audit_alone(actor, action, target, reason, 'Failed', corr)
            raise ApiError(500, 'database error', 'The change was rolled back.')
        with self.metrics_lock:
            self.metrics['mutations'] += 1
        out = {'correlationId': corr, 'actor': actor}
        out.update(result or {})
        return out

    # ── reads ───────────────────────────────────────────────────────────────────────────
    LISTS = {
        'platforms': {'filters': ('status',), 'search': ('id', 'name', 'type', 'entry_point'), 'order': 'port'},
        'endpoints': {'filters': ('scope', 'platform_id', 'state', 'method'), 'search': ('endpoint_key', 'flow_name', 'workflow_id', 'route'), 'order': 'scope, endpoint_key'},
        'configurations': {'filters': ('scope',), 'search': ('key', 'value'), 'order': 'key'},
        'health': {'filters': ('asset_type', 'asset_id', 'state', 'source'), 'search': ('asset_id', 'message'), 'order': 'id DESC'},
        'audit': {'filters': ('actor', 'action', 'result', 'correlation_id', 'target'), 'search': ('actor', 'action', 'target', 'reason', 'correlation_id'), 'order': 'id DESC'},
        'alerts': {'filters': ('state', 'severity', 'owner', 'source'), 'search': ('asset', 'message', 'owner'), 'order': 'id DESC'},
        'incidents': {'filters': ('state', 'severity', 'owner'), 'search': ('title', 'description', 'owner'), 'order': 'id DESC'},
        'changes': {'filters': ('state', 'maker', 'checker', 'risk'), 'search': ('change_type', 'target', 'reason', 'maker', 'checker'), 'order': 'id DESC'},
    }

    def list(self, table, qs):
        spec = self.LISTS[table]
        where, args = [], []
        for f in spec['filters']:
            v = qs.get(f)
            if v:
                vals = v.split(',')
                where.append(f'{f} IN ({",".join("?" * len(vals))})')
                args += vals
        if qs.get('open') == '1' and table in OPEN_STATES:
            where.append(f'state IN ({",".join("?" * len(OPEN_STATES[table]))})')
            args += OPEN_STATES[table]
        if qs.get('q'):
            where.append('(' + ' OR '.join(f'{c} LIKE ?' for c in spec['search']) + ')')
            args += [f'%{qs["q"]}%'] * len(spec['search'])
        try:
            limit = max(1, min(int(qs.get('limit', 500)), 2000))
            offset = max(0, int(qs.get('offset', 0)))
        except ValueError:
            raise ApiError(400, 'limit invalid')
        clause = (' WHERE ' + ' AND '.join(where)) if where else ''
        with self.store.read() as con:
            total = con.execute(f'SELECT COUNT(*) FROM {table}{clause}', args).fetchone()[0]
            rows = [dict(r) for r in con.execute(f'SELECT * FROM {table}{clause} ORDER BY {spec["order"]} LIMIT ? OFFSET ?', args + [limit, offset])]
        if table == 'configurations':
            for r in rows:
                r['value'] = json.loads(r['value'])
                r['mutable'] = r['key'] in MUTABLE
                r['description'] = DESCRIPTIONS.get(r['key'], '')
                r['constraint'] = MUTABLE[r['key']][1] if r['key'] in MUTABLE else 'Changed only by a controlled restart'
        return {'items': rows, 'total': total, 'limit': limit, 'offset': offset}

    def record(self, table, rid):
        kind = table[:-1]
        with self.store.read() as con:
            r = con.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No {kind} #{rid}.')
            out = dict(r)
            out['notes'] = [dict(x) for x in con.execute('SELECT * FROM record_notes WHERE record_type=? AND record_id=? ORDER BY id', (table, rid))]
            out['audit'] = [dict(x) for x in con.execute('SELECT * FROM audit WHERE target=? ORDER BY id', (f'{kind}:{rid}',))]
            out['transitions'] = list(FLOWS[table].get(out['state'], ())) if table in FLOWS else []
            if table == 'incidents' and out.get('alert_id'):
                a = con.execute('SELECT id, severity, asset, state FROM alerts WHERE id=?', (out['alert_id'],)).fetchone()
                out['alert'] = dict(a) if a else None
            if table == 'alerts':
                out['incidents'] = [dict(x) for x in con.execute('SELECT id, title, state FROM incidents WHERE alert_id=?', (rid,))]
        return out

    def health_status(self):
        stale_after = int(self.setting('staleAfterSeconds'))
        since = iso(utcnow() - timedelta(hours=24))
        assets = []
        with self.store.read() as con:
            platforms = [dict(r) for r in con.execute('SELECT * FROM platforms ORDER BY port')]
            endpoints = [dict(r) for r in con.execute("SELECT * FROM endpoints WHERE state != 'Retired' ORDER BY scope, endpoint_key")]
            latest = {}
            for r in con.execute('SELECT h.* FROM health h JOIN (SELECT asset_type, asset_id, MAX(id) m FROM health GROUP BY asset_type, asset_id) x ON h.id = x.m'):
                latest[(r['asset_type'], r['asset_id'])] = dict(r)
            window = defaultdict(list)
            for r in con.execute('SELECT asset_type, asset_id, state, latency_ms, checked_at FROM health WHERE checked_at >= ? ORDER BY id', (since,)):
                window[(r['asset_type'], r['asset_id'])].append(r)
        for kind, items, key, label in (('platform', platforms, lambda x: x['id'], lambda x: x['name']),
                                        ('endpoint', endpoints, lambda x: f"{x['scope']}:{x['endpoint_key']}", lambda x: x['flow_name'])):
            for it in items:
                k = (kind, key(it))
                last = latest.get(k)
                w = window.get(k, [])
                lat = sorted(x['latency_ms'] for x in w if x['latency_ms'] is not None)
                hosted = kind == 'platform' and self.hosted_here(it['id'])
                elsewhere = (kind == 'platform' and self.cfg.local_platforms is not None and it['id'] not in self.cfg.local_platforms
                             and not hosted)
                assets.append({
                    'assetType': kind, 'assetId': k[1], 'name': label(it),
                    'inventory': it.get('status') or it.get('state'),
                    'local': not elsewhere, 'hosted': HOSTED.get(it['id']) if hosted else None,
                    'published': PUBLISHED.get(it['id']) if kind == 'platform' else None,
                    'replacedBy': REPLACED.get(it['id']) if kind == 'platform' and elsewhere else None,
                    'state': 'Not on this computer' if elsewhere else effective_state(last, stale_after),
                    'lastState': last['state'] if last else None, 'checkedAt': last['checked_at'] if last else None,
                    'latencyMs': last['latency_ms'] if last else None,
                    'message': ('Runs at its published address; this computer does not run it, so it is not probed' if elsewhere
                                else last['message'] if last else 'No observation has been recorded'),
                    'source': last['source'] if last else None,
                    'uptime24h': round(100 * sum(1 for x in w if x['state'] == 'Healthy') / len(w), 1) if w else None,
                    'observations24h': len(w),
                    'p50Ms': lat[len(lat) // 2] if lat else None,
                    'p95Ms': lat[min(len(lat) - 1, int(len(lat) * 0.95))] if lat else None,
                    'series': [{'t': x['checked_at'], 's': x['state'], 'ms': x['latency_ms']} for x in w[-48:]],
                })
        roll = defaultdict(int)
        for a in assets:
            roll[a['state']] += 1
        return {'assets': assets, 'rollup': dict(roll), 'staleAfterSeconds': stale_after,
                'monitor': self.monitor_status()}

    def monitor_status(self):
        m = self.monitor
        return {'enabled': bool(m), 'intervalSeconds': int(self.setting('healthIntervalSeconds')),
                'lastRun': iso(m.last_run) if m and m.last_run else None,
                'nextRun': iso(m.next_run) if m and m.next_run else None, 'cycles': m.cycles if m else 0}

    def summary(self):
        with self.store.read() as con:
            c = {t: con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
                 for t in ('platforms', 'endpoints', 'configurations', 'health', 'audit', 'alerts', 'incidents', 'changes')}
            open_ = {t: con.execute(f'SELECT COUNT(*) FROM {t} WHERE state IN ({",".join("?" * len(s))})', s).fetchone()[0]
                     for t, s in OPEN_STATES.items()}
            sev = {r[0]: r[1] for r in con.execute("SELECT severity, COUNT(*) FROM alerts WHERE state IN ('Open','Acknowledged') GROUP BY severity")}
            scopes = {r[0]: r[1] for r in con.execute("SELECT scope, COUNT(*) FROM endpoints WHERE state != 'Retired' GROUP BY scope")}
            awaiting = con.execute("SELECT COUNT(*) FROM changes WHERE state='Submitted'").fetchone()[0]
            latest_health = [dict(r) for r in con.execute('SELECT * FROM health ORDER BY id DESC LIMIT 10')]
            recent = [dict(r) for r in con.execute('SELECT id, actor, action, target, result, created_at FROM audit ORDER BY id DESC LIMIT 12')]
            head = con.execute('SELECT event_hash, created_at FROM audit ORDER BY id DESC LIMIT 1').fetchone()
            flows_failed = con.execute(
                "SELECT COUNT(*) FROM flow_runs r WHERE r.status = 'Failed' AND r.start_time = "
                "(SELECT MAX(start_time) FROM flow_runs x WHERE x.flow_id = r.flow_id AND x.status != 'Running') "
                "AND r.flow_id IN (SELECT flow_id FROM endpoints WHERE state != 'Retired' AND flow_id IS NOT NULL "
                "UNION SELECT flow_id FROM folio_flows WHERE state != 'Retired')").fetchone()[0]
        hs = self.health_status()
        return {**c, 'open': open_, 'openAlertsBySeverity': sev, 'endpointsByScope': scopes, 'changesAwaitingDecision': awaiting, 'flowsFailed': flows_failed,
                'latestHealth': latest_health, 'healthRollup': hs['rollup'],
                'platformHealth': [a for a in hs['assets'] if a['assetType'] == 'platform'],
                'recentAudit': recent, 'auditHead': dict(head) if head else None, 'monitor': hs['monitor'],
                'flowOwner': {k: v for k, v in self.owner.status().items() if k in ('state', 'user', 'lastSync', 'lastSyncResult')},
                'system': {'name': self.cfg['systemName'], 'version': self.cfg['version'], 'build': toolkit_build(), 'startedAt': iso(self.started)}}

    def search(self, q):
        if not q or len(q) < 2:
            return {'results': []}
        like = f'%{q}%'
        out = []
        with self.store.read() as con:
            for sql, kind, fmt in (
                ('SELECT id, name, status FROM platforms WHERE id LIKE ? OR name LIKE ? LIMIT 8', 'platform', lambda r: (r['id'], r['name'], r['status'])),
                ('SELECT id, endpoint_key, flow_name, scope FROM endpoints WHERE endpoint_key LIKE ? OR flow_name LIKE ? LIMIT 8', 'endpoint', lambda r: (r['id'], f"{r['scope']} · {r['endpoint_key']}", r['flow_name'])),
                ('SELECT id, asset, state FROM alerts WHERE asset LIKE ? OR message LIKE ? ORDER BY id DESC LIMIT 8', 'alert', lambda r: (r['id'], f"#{r['id']} {r['asset']}", r['state'])),
                ('SELECT id, title, state FROM incidents WHERE title LIKE ? OR description LIKE ? ORDER BY id DESC LIMIT 8', 'incident', lambda r: (r['id'], f"#{r['id']} {r['title']}", r['state'])),
                ('SELECT id, target, state FROM changes WHERE target LIKE ? OR change_type LIKE ? ORDER BY id DESC LIMIT 8', 'change', lambda r: (r['id'], f"#{r['id']} {r['target']}", r['state'])),
                ('SELECT key, scope FROM configurations WHERE key LIKE ? OR value LIKE ? LIMIT 8', 'configuration', lambda r: (r['key'], r['key'], r['scope'])),
            ):
                for r in con.execute(sql, (like, like)):
                    rid, title, sub = fmt(r)
                    out.append({'kind': kind, 'id': rid, 'title': title, 'detail': sub})
        return {'results': out}

    # ── governed records ────────────────────────────────────────────────────────────────
    def create_alert(self, p, body, source='manual'):
        severity = self.choice(body, 'severity', SEVERITIES)
        asset = self.text(body, 'asset', max_len=200)
        message = self.text(body, 'message', max_len=2000)
        owner = self.text(body, 'owner', max_len=120)

        def work(con, actor, reason, corr):
            ts = iso()
            cur = con.execute('INSERT INTO alerts(severity,asset,message,state,owner,created_at,updated_at,source,correlation_id,created_by) '
                              'VALUES(?,?,?,?,?,?,?,?,?,?)', (severity, asset, message, 'Open', owner, ts, ts, source, corr, actor))
            rid = cur.lastrowid
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, actor, 'created', reason, ts))
            return {'id': rid, 'state': 'Open', '_target': f'alert:{rid}'}
        return self.mutate(p, body, 'alert.create', 'alert.create', 'alert:new', work)

    def create_incident(self, p, body):
        severity = self.choice(body, 'severity', SEVERITIES)
        title = self.text(body, 'title', max_len=200)
        description = self.text(body, 'description', max_len=4000)
        owner = self.text(body, 'owner', max_len=120)
        alert_id = body.get('alertId')
        if alert_id not in (None, ''):
            try:
                alert_id = int(alert_id)
            except (TypeError, ValueError):
                raise ApiError(400, 'alertId invalid')
        else:
            alert_id = None

        def work(con, actor, reason, corr):
            ts = iso()
            if alert_id is not None and not con.execute('SELECT 1 FROM alerts WHERE id=?', (alert_id,)).fetchone():
                raise ApiError(404, 'not found', f'No alert #{alert_id} to escalate.')
            cur = con.execute('INSERT INTO incidents(severity,title,description,state,owner,created_at,updated_at,alert_id,correlation_id,created_by) '
                              'VALUES(?,?,?,?,?,?,?,?,?,?)', (severity, title, description, 'Open', owner, ts, ts, alert_id, corr, actor))
            rid = cur.lastrowid
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('incidents', rid, actor, 'created', reason, ts))
            if alert_id is not None:
                con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                            ('alerts', alert_id, actor, 'escalated', f'Escalated to incident #{rid}: {title}', ts))
            return {'id': rid, 'state': 'Open', '_target': f'incident:{rid}'}
        return self.mutate(p, body, 'incident.create', 'incident.create', 'incident:new', work)

    def create_change(self, p, body):
        change_type = self.text(body, 'changeType', max_len=120)
        target = self.text(body, 'target', max_len=300)
        checker = self.text(body, 'checker', max_len=80)
        risk = self.choice(body, 'risk', ('Low', 'Medium', 'High'), default='Medium')
        rollback = self.text(body, 'rollbackPlan', required=False, max_len=2000)
        scheduled = body.get('scheduledFor') or None
        if scheduled is not None and (not isinstance(scheduled, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z?)?', scheduled)):
            raise ApiError(400, 'scheduledFor invalid', 'Use an ISO date, e.g. 2026-10-01 or 2026-10-01T09:00Z.')

        def work(con, actor, reason, corr):
            if checker.lower() == actor.lower():
                raise ApiError(400, 'maker and checker must differ', 'Name a different accountable identity as checker.')
            ts = iso()
            cur = con.execute('INSERT INTO changes(change_type,target,reason,state,maker,checker,created_at,updated_at,risk,rollback_plan,scheduled_for,correlation_id) '
                              'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', (change_type, target, reason, 'Submitted', actor, checker, ts, ts, risk, rollback, scheduled, corr))
            rid = cur.lastrowid
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('changes', rid, actor, 'created', f'Submitted for decision by {checker}', ts))
            return {'id': rid, 'state': 'Submitted', '_target': f'change:{rid}'}
        return self.mutate(p, body, 'change.create', 'change.create', 'change:new', work)

    def transition(self, p, table, rid, body):
        kind = table[:-1]
        to = body.get('to')
        flow = FLOWS[table]
        if to not in flow:
            raise ApiError(400, 'to invalid', f'State must be one of: {", ".join(flow)}.')
        note = self.text(body, 'note', required=(table, to) in NOTE_REQUIRED, max_len=4000)
        perm = {'alerts': 'alert.update', 'incidents': 'incident.update'}.get(table)
        if table == 'changes':
            perm = 'change.decide' if to in ('Approved', 'Rejected') else ('change.create' if to == 'Cancelled' else 'change.progress')

        def work(con, actor, reason, corr):
            r = con.execute(f'SELECT * FROM {table} WHERE id=?', (rid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No {kind} #{rid}.')
            cur = r['state']
            if to not in flow.get(cur, ()):
                raise ApiError(409, 'transition not allowed', f'A {kind} in state {cur} cannot move to {to}. '
                               f'Allowed: {", ".join(flow.get(cur, ())) or "none (final state)"}.')
            ts = iso()
            sets, args = ['state=?', 'updated_at=?'], [to, ts]
            if table == 'changes':
                if to in ('Approved', 'Rejected'):
                    if actor.lower() == r['maker'].lower():
                        raise ApiError(403, 'maker cannot decide', 'The maker of a change may not approve or reject it.')
                    if actor.lower() != r['checker'].lower():
                        raise ApiError(403, 'only the named checker may decide', f'This change names {r["checker"]} as checker.')
                    sets += ['decided_by=?', 'decided_at=?']
                    args += [actor, ts]
                if to == 'Cancelled' and p.role != 'super_admin' and actor.lower() != r['maker'].lower():
                    raise ApiError(403, 'only the maker may cancel', 'A change is withdrawn by its maker or a super administrator.')
                if to == 'Implemented':
                    sets.append('implemented_at=?')
                    args.append(ts)
            if table in ('alerts', 'incidents'):
                if to == 'Resolved':
                    sets.append('resolved_at=?')
                    args.append(ts)
                elif cur == 'Resolved':
                    sets.append('resolved_at=NULL')
            con.execute(f'UPDATE {table} SET {", ".join(sets)} WHERE id=?', args + [rid])
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        (table, rid, actor, 'transition', f'{cur} → {to}' + (f': {note}' if note else f' — {reason}'), ts))
            return {'id': rid, 'from': cur, 'state': to}
        return self.mutate(p, body, perm, f'{kind}.{to.lower()}', f'{kind}:{rid}', work)

    def assign(self, p, table, rid, body):
        kind = table[:-1]
        owner = self.text(body, 'owner', max_len=120)
        perm = {'alerts': 'alert.update', 'incidents': 'incident.update'}[table]

        def work(con, actor, reason, corr):
            r = con.execute(f'SELECT owner FROM {table} WHERE id=?', (rid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No {kind} #{rid}.')
            ts = iso()
            con.execute(f'UPDATE {table} SET owner=?, updated_at=? WHERE id=?', (owner, ts, rid))
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        (table, rid, actor, 'assigned', f'Owner {r["owner"]} → {owner}: {reason}', ts))
            return {'id': rid, 'owner': owner}
        return self.mutate(p, body, perm, f'{kind}.assign', f'{kind}:{rid}', work)

    def add_note(self, p, table, rid, body):
        kind = table[:-1]
        note = self.text(body, 'note', max_len=4000)
        body = {**body, 'reason': body.get('reason') or 'Record note'}

        def work(con, actor, reason, corr):
            if not con.execute(f'SELECT 1 FROM {table} WHERE id=?', (rid,)).fetchone():
                raise ApiError(404, 'not found', f'No {kind} #{rid}.')
            cur = con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                              (table, rid, actor, 'note', note, iso()))
            con.execute(f'UPDATE {table} SET updated_at=? WHERE id=?', (iso(), rid))
            return {'id': cur.lastrowid}
        return self.mutate(p, body, 'note.create', f'{kind}.note', f'{kind}:{rid}', work)

    # ── inventory ───────────────────────────────────────────────────────────────────────
    def set_platform(self, p, pid, body):
        status = self.choice(body, 'status', PLATFORM_STATES)
        owner = self.text(body, 'owner', required=False, max_len=120)

        def work(con, actor, reason, corr):
            r = con.execute('SELECT * FROM platforms WHERE id=?', (pid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No platform {pid}.')
            con.execute('UPDATE platforms SET status=?, owner=?, updated_at=? WHERE id=?', (status, owner or r['owner'], iso(), pid))
            return {'id': pid, 'from': r['status'], 'status': status}
        return self.mutate(p, body, 'inventory.update', 'platform.update', f'platform:{pid}', work)

    def set_endpoint(self, p, eid, body):
        state = self.choice(body, 'state', ENDPOINT_STATES)
        alias = body.get('vaultAlias')
        if alias not in (None, '') and (not isinstance(alias, str) or not re.fullmatch(r'[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*', alias)):
            raise ApiError(400, 'vaultAlias invalid', 'Aliases are lower-case words joined by dots or dashes.')

        def work(con, actor, reason, corr):
            r = con.execute('SELECT * FROM endpoints WHERE id=?', (eid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No endpoint #{eid}.')
            con.execute('UPDATE endpoints SET state=?, vault_alias=?, updated_at=? WHERE id=?', (state, alias or r['vault_alias'], iso(), eid))
            return {'id': eid, 'from': r['state'], 'state': state, '_target': f"endpoint:{r['scope']}:{r['endpoint_key']}"}
        return self.mutate(p, body, 'inventory.update', 'endpoint.update', f'endpoint:{eid}', work)

    def reconcile(self, p, body):
        def work(con, actor, reason, corr):
            rows, sources = read_estate(self.cfg.repo)
            moved = reconcile_estate(con, rows)
            flows, flow_sources = read_catalogue(self.cfg.repo)
            moved['folioFlows'] = reconcile_catalogue(con, flows)
            moved['sources'] = sources + flow_sources
            return moved
        return self.mutate(p, body, 'inventory.update', 'estate.reconcile', 'estate:endpoints', work)

    def read_catalogue_at_start(self):
        """An installation provisioned before the catalogue, or since it changed, takes it in at start; audited when it moves."""
        flows, _ = read_catalogue(self.cfg.repo)
        if not flows:
            return
        with self.store.tx() as con:
            moved = reconcile_catalogue(con, flows)
            if moved['added'] or moved['updated'] or moved['retired']:
                self.store.audit(con, 'provisioning', 'catalogue.reconcile', 'estate:folio-flows',
                                 f"Flow catalogue read at start: {len(moved['added'])} added, {len(moved['updated'])} updated, "
                                 f"{len(moved['retired'])} retired, {moved['total']} Folio flows", 'Succeeded', str(uuid.uuid4()))

    # ── configuration ───────────────────────────────────────────────────────────────────
    def set_config(self, p, key, body):
        if key not in self.cfg.file_settings:
            raise ApiError(404, 'not found', f'No configuration key {key}.')
        if key not in MUTABLE:
            raise ApiError(409, 'restart-bound setting', f'{key} changes only through a controlled change and a restart; edit config/settings.json.')
        typ, desc, check = MUTABLE[key]
        v = body.get('value')
        if typ is int and isinstance(v, str) and re.fullmatch(r'-?\d+', v.strip()):
            v = int(v)
        if typ is bool and isinstance(v, str) and v.lower() in ('true', 'false'):
            v = v.lower() == 'true'
        if not isinstance(v, typ) or (typ is int and isinstance(v, bool)) or not check(v):
            raise ApiError(400, 'value invalid', f'{key} must be {desc}.')
        if isinstance(v, str):
            self.guard_text('value', v)

        def work(con, actor, reason, corr):
            r = con.execute('SELECT * FROM configurations WHERE key=?', (key,)).fetchone()
            version = r['version'] + 1
            ts = iso()
            con.execute('UPDATE configurations SET value=?, version=?, updated_at=?, updated_by=? WHERE key=?',
                        (config_value_text(v), version, ts, actor, key))
            con.execute('INSERT INTO configuration_history(key,version,value,actor,reason,changed_at) VALUES(?,?,?,?,?,?)',
                        (key, version, config_value_text(v), actor, reason, ts))
            return {'key': key, 'from': json.loads(r['value']), 'value': v, 'version': version}
        out = self.mutate(p, body, 'config.update', 'configuration.update', f'configuration:{key}', work)
        self.runtime[key] = v
        if key == 'healthIntervalSeconds' and self.monitor:
            self.monitor.wake.set()
        return out

    def config_history(self, key):
        with self.store.read() as con:
            return {'items': [dict(r) for r in con.execute('SELECT * FROM configuration_history WHERE key=? ORDER BY id DESC', (key,))]}

    # ── health ──────────────────────────────────────────────────────────────────────────
    def asset_exists(self, con, asset_type, asset_id):
        if asset_type == 'platform':
            return con.execute('SELECT 1 FROM platforms WHERE id=?', (asset_id,)).fetchone() is not None
        if asset_type == 'endpoint' and ':' in asset_id:
            scope, key = asset_id.split(':', 1)
            return con.execute('SELECT 1 FROM endpoints WHERE scope=? AND endpoint_key=?', (scope, key)).fetchone() is not None
        return asset_type == 'service'

    def ingest_health(self, p, body):
        asset_type = self.choice(body, 'assetType', ('platform', 'endpoint', 'service'))
        asset_id = self.text(body, 'assetId', max_len=160)
        state = self.choice(body, 'state', HEALTH_STATES)
        message = self.text(body, 'message', max_len=1000)
        latency = body.get('latencyMs')
        if latency is not None and (not isinstance(latency, int) or isinstance(latency, bool) or not 0 <= latency <= 600000):
            raise ApiError(400, 'latencyMs invalid', 'latencyMs is a whole number of milliseconds, 0–600000.')

        def work(con, actor, reason, corr):
            if not self.asset_exists(con, asset_type, asset_id):
                raise ApiError(404, 'not found', f'No {asset_type} {asset_id} in the inventory.')
            cur = con.execute('INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES(?,?,?,?,?,?,?)',
                              (asset_type, asset_id, state, latency, message, iso(), 'ingest'))
            return {'id': cur.lastrowid, '_target': f'{asset_type}:{asset_id}'}
        return self.mutate(p, body, 'health.ingest', 'health.ingest', f'{asset_type}:{asset_id}', work)

    def probe_platforms(self, actor, source, only=None):
        with self.store.read() as con:
            plats = [dict(r) for r in con.execute('SELECT * FROM platforms ORDER BY port')]
        if only:
            plats = [x for x in plats if x['id'] == only]
            if not plats:
                raise ApiError(404, 'not found', f'No platform {only}.')
        local = self.cfg.local_platforms
        if local is not None:
            if only and only not in local and not self.hosted_here(only):
                raise ApiError(409, 'not on this computer', f'{plats[0]["name"]} runs at its published address, not on this computer, so it is not probed.')
            plats = [x for x in plats if x['id'] in local or self.hosted_here(x['id'])]
        plats = [x for x in plats if x['status'] != 'Retired']
        timeout = int(self.setting('probeTimeoutSeconds'))
        degraded = int(self.setting('degradedLatencyMs'))
        results = []
        threads = []

        def one(pl):
            url = (f"http://127.0.0.1:{self.cfg['port']}{HOSTED[pl['id']]}" if self.hosted_here(pl['id'])
                   else f"http://127.0.0.1:{pl['port']}{pl['probe_path']}")
            state, ms, msg = probe_url(url, timeout, degraded, pl.get('launcher_id') if pl['id'] not in ('workbench', 'vault') else None)
            if self.hosted_here(pl['id']) and state == 'Healthy':
                msg = f'Hosted by the Centre: {msg}'
            results.append((pl, state, ms, msg))
        for pl in plats:
            t = threading.Thread(target=one, args=(pl,))
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
        out = []
        for pl, state, ms, msg in sorted(results, key=lambda x: x[0]['port']):
            with self.store.tx() as con:
                prev = con.execute("SELECT state FROM health WHERE asset_type='platform' AND asset_id=? ORDER BY id DESC LIMIT 1", (pl['id'],)).fetchone()
                con.execute('INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES(?,?,?,?,?,?,?)',
                            ('platform', pl['id'], state, ms, msg, iso(), source))
                self.monitor_alerts(con, pl, prev['state'] if prev else None, state, msg)
            out.append({'platform': pl['id'], 'state': state, 'latencyMs': ms, 'message': msg})
        return out

    def hosted_here(self, pid):
        """Whether the Centre serves this platform itself, as a section: when it does not run on its own port here."""
        local = self.cfg.local_platforms
        if pid not in HOSTED or self.cfg.repo is None or (local is not None and pid in local) or local is None:
            return False
        rel, _, _ = SECTIONS[HOSTED[pid].rsplit('/', 1)[-1]]
        return (self.cfg.repo / rel).is_file()

    def monitor_alerts(self, con, pl, prev, state, msg):
        """Raise one alert when a platform goes bad; resolve it when the platform recovers."""
        if not self.setting('autoAlert') or pl['status'] in ('Maintenance', 'Retired'):
            return
        asset = f"platform:{pl['id']}"
        open_alert = con.execute("SELECT id FROM alerts WHERE asset=? AND source='monitor' AND state IN ('Open','Acknowledged') "
                                 'ORDER BY id DESC LIMIT 1', (asset,)).fetchone()
        ts = iso()
        if state in ('Unavailable', 'Degraded') and not open_alert:
            sev = 'High' if state == 'Unavailable' else 'Medium'
            corr = str(uuid.uuid4())
            cur = con.execute('INSERT INTO alerts(severity,asset,message,state,owner,created_at,updated_at,source,correlation_id,created_by) '
                              'VALUES(?,?,?,?,?,?,?,?,?,?)',
                              (sev, asset, f"{pl['name']} is {state}. {msg}", 'Open', pl['owner'], ts, ts, 'monitor', corr, 'health-monitor'))
            rid = cur.lastrowid
            reason = f"Probe observed {pl['name']} {state}" + (f' after {prev}' if prev else ' on first observation')
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'health-monitor', 'created', reason, ts))
            self.store.audit(con, 'health-monitor', 'alert.create', f'alert:{rid}', reason, 'Succeeded', corr)
        elif state == 'Healthy' and open_alert:
            rid = open_alert['id']
            corr = str(uuid.uuid4())
            con.execute("UPDATE alerts SET state='Resolved', resolved_at=?, updated_at=? WHERE id=?", (ts, ts, rid))
            note = f"Recovered: {pl['name']} answered healthy ({msg})"
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'health-monitor', 'transition', f'→ Resolved: {note}', ts))
            self.store.audit(con, 'health-monitor', 'alert.resolved', f'alert:{rid}', note, 'Succeeded', corr)

    def run_probe(self, p, body, only=None):
        actor = self.actor_of(p, body)
        reason = self.text(body, 'reason', required=False, max_len=1000) or 'On-demand platform probe'
        corr = self.correlation_of(body)
        target = f'platform:{only}' if only else 'platform:*'
        if not p.can('probe.run'):
            self.store.audit_alone(actor, 'health.probe', target, reason, 'Denied', corr)
            self.require(p, 'probe.run')
        results = self.probe_platforms(actor, 'probe', only)
        self.store.audit_alone(actor, 'health.probe', target, reason, 'Succeeded', corr)
        return {'correlationId': corr, 'results': results}

    def prune(self, actor, reason, always_audit=False):
        cutoff = iso(utcnow() - timedelta(days=int(self.setting('retentionDays'))))
        with self.store.tx() as con:
            n = con.execute('DELETE FROM health WHERE checked_at < ?', (cutoff,)).rowcount
            if n or always_audit:
                self.store.audit(con, actor, 'retention.prune', 'health', f'{reason}: removed {n} observations older than {cutoff}',
                                 'Succeeded', str(uuid.uuid4()))
        return {'removed': n, 'cutoff': cutoff}

    # ── Vault ───────────────────────────────────────────────────────────────────────────
    def vault_token(self):
        t = os.environ.get('FOLIO_VAULT_ADMIN_TOKEN')
        f = os.environ.get('FOLIO_VAULT_TOKEN_FILE')
        if not t and f and Path(f).is_file():
            raw = Path(f).read_text(encoding='utf-8').strip()
            try:
                t = json.loads(raw).get('adminToken')
            except (ValueError, AttributeError):
                t = raw
        return t or None

    def vault_call(self, method, path, timeout=10):
        base = str(self.setting('vaultUrl')).rstrip('/')
        headers = {'Accept': 'application/json', 'User-Agent': 'FolioAdminCentre/2.0'}
        tok = self.vault_token()
        if tok and path != '/health':
            headers['Authorization'] = 'Bearer ' + tok
        data = b'' if method == 'POST' else None
        req = Request(base + path, data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=timeout) as r:
                return r.status, json.loads(r.read(1 << 20) or b'{}')
        except HTTPError as e:
            try:
                return e.code, json.loads(e.read(1 << 16) or b'{}')
            except ValueError:
                return e.code, {}
        except (URLError, TimeoutError, OSError, ValueError) as e:
            return None, {'message': str(getattr(e, 'reason', e))}

    # ── test a flow ─────────────────────────────────────────────────────────────────────
    def vault_invoke_token(self):
        t = os.environ.get('FOLIO_VAULT_INVOKE_TOKEN')
        f = os.environ.get('FOLIO_VAULT_TOKEN_FILE')
        if not t and f and Path(f).is_file():
            try:
                t = json.loads(Path(f).read_text(encoding='utf-8')).get('invokeToken')
            except (ValueError, AttributeError):
                t = None
        return t or None

    def vault_invoke(self, alias, payload, proof=None):
        """Call a flow through the Vault by its alias. The signed address stays in the Vault; only the reply comes back."""
        tok = self.vault_invoke_token()
        if not tok:
            raise ApiError(409, 'vault not configured', 'Set FOLIO_VAULT_INVOKE_TOKEN or FOLIO_VAULT_TOKEN_FILE so the Centre can call flows through the Vault.')
        headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'FolioAdminCentre/2.1',
                   'Authorization': 'Bearer ' + tok}
        if proof:
            headers['X-DGO-Proof'] = 'Bearer ' + proof
        req = Request(str(self.setting('vaultUrl')).rstrip('/') + '/invoke/' + quote(alias, safe='.-'), data=json.dumps(payload).encode(),
                      headers=headers, method='POST')
        started = time.monotonic()
        try:
            with urlopen(req, timeout=120) as r:
                status, raw = r.status, r.read(TEST_REPLY_LIMIT + 1)
        except HTTPError as e:
            status, raw = e.code, e.read(TEST_REPLY_LIMIT + 1)
        except (URLError, TimeoutError, OSError) as e:
            raise ApiError(502, 'vault unreachable', f'The Vault did not answer: {getattr(e, "reason", e)}')
        ms = int((time.monotonic() - started) * 1000)
        try:
            body = json.loads(raw[:TEST_REPLY_LIMIT] or b'{}')
        except ValueError:
            body = {'text': raw[:4096].decode('utf-8', 'replace')}
        return status, body, ms, len(raw) > TEST_REPLY_LIMIT

    def alias_of(self, key):
        with self.store.read() as con:
            r = con.execute("SELECT vault_alias FROM endpoints WHERE scope='internal' AND endpoint_key=? AND state != 'Retired'", (key,)).fetchone()
        return (r['vault_alias'] if r else None) or vault_alias_for('internal', key)

    def test_status(self, p):
        proof = self.test_proofs.get(p.name or p.role)
        live = proof and proof['expiresAt'] > time.time()
        return {'signedIn': bool(live), 'email': proof['email'] if live else None,
                'expiresAt': iso(datetime.fromtimestamp(proof['expiresAt'], timezone.utc)) if live else None,
                'vaultConfigured': bool(self.vault_invoke_token()),
                'testable': [{'key': k, 'action': a, 'alias': self.alias_of(k)} for k, a in TESTABLE.items()]}

    def test_sign_in(self, p, body):
        """Step 1 of the Folio sign-in: OTP_GENERATE mails a code to the address, as the Workspace's sign-in does."""
        actor = self.actor_of(p, body)
        self.require(p, 'flow.test')
        email = self.text(body, 'email', max_len=200).strip().lower()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
            raise ApiError(400, 'email invalid')
        action, operation = SIGN_IN['OTP_GENERATE']
        status, reply, _, _ = self.vault_invoke(self.alias_of('OTP_GENERATE'),
                                                {'action': action, 'operation': operation, 'identifier': email, 'correlationId': str(uuid.uuid4())})
        reply = reply.get('data', reply) if isinstance(reply.get('data'), dict) else reply
        sent = 200 <= status < 300 and reply.get('sent') is not False and reply.get('ok') is not False
        self.store.audit_alone(actor, 'flow.test-sign-in', f'folio:{email}', 'Folio sign-in for a flow test: code requested',
                               'Succeeded' if sent else 'Failed', str(uuid.uuid4()))
        return {'sent': sent, 'status': status, 'reason': reply.get('reason') or ('' if sent else 'The code could not be sent.')}

    def test_verify(self, p, body):
        """Step 2: OTP_VERIFY exchanges the code for a proof, held in the Centre's memory for this operator only."""
        actor = self.actor_of(p, body)
        self.require(p, 'flow.test')
        email = self.text(body, 'email', max_len=200).strip().lower()
        code = self.text(body, 'code', max_len=20).strip()
        action, operation = SIGN_IN['OTP_VERIFY']
        status, reply, _, _ = self.vault_invoke(self.alias_of('OTP_VERIFY'),
                                                {'action': action, 'operation': operation, 'identifier': email, 'otp_code': code,
                                                 'correlationId': str(uuid.uuid4())})
        reply = reply.get('data', reply) if isinstance(reply.get('data'), dict) else reply
        token = reply.get('token') or reply.get('verification') or reply.get('proof')
        expires = reply.get('expiresAt')
        try:
            expires = float(expires) / (1000 if float(expires) > 1e11 else 1)
        except (TypeError, ValueError):
            t = parse_iso(str(expires or ''))
            expires = t.timestamp() if t else None
        ok = bool(token) and expires and reply.get('verified') is not False and 200 <= status < 300
        self.store.audit_alone(actor, 'flow.test-sign-in', f'folio:{email}', 'Folio sign-in for a flow test: code verified',
                               'Succeeded' if ok else 'Failed', str(uuid.uuid4()))
        if not ok:
            raise ApiError(401, 'code not accepted', reply.get('reason') or 'That code was not accepted.')
        self.test_proofs[p.name or p.role] = {'token': token, 'expiresAt': expires, 'email': email}
        return self.test_status(p)

    def test_sign_out(self, p, body):
        self.test_proofs.pop(p.name or p.role, None)
        return self.test_status(p)

    def test_run(self, p, body):
        """Call one read-only flow with the operator's Folio sign-in, and return its reply. Audited; the reply is not stored."""
        actor = self.actor_of(p, body)
        reason = self.reason_of(body)
        corr = self.correlation_of(body)
        key = self.text(body, 'key', max_len=60)
        target = f'endpoint:internal:{key}'
        if not p.can('flow.test'):
            self.store.audit_alone(actor, 'flow.test', target, reason, 'Denied', corr)
            self.require(p, 'flow.test')
        if key not in TESTABLE:
            raise ApiError(400, 'not testable', f'{key} is not one of the read-only flows the Centre may call: {", ".join(TESTABLE)}.')
        params = body.get('payload') or {}
        if not isinstance(params, dict):
            raise ApiError(400, 'payload invalid', 'The payload must be a JSON object.')
        if CREDENTIAL.search(json.dumps(params)):
            raise ApiError(400, 'credential in payload', 'The payload may not carry a credential.')
        proof = self.test_proofs.get(p.name or p.role)
        if not proof or proof['expiresAt'] <= time.time():
            raise ApiError(409, 'not signed in to Folio', 'Sign in to Folio with your e-mailed code first; the flows refuse a call without it.')
        last = self.test_last.get(p.name or p.role, 0)
        if time.monotonic() - last < 10:
            raise ApiError(429, 'too soon', 'One test every 10 seconds, so a test never loads the flows.')
        self.test_last[p.name or p.role] = time.monotonic()
        payload = {'action': TESTABLE[key], 'payload': params, 'requestId': corr, 'timestamp': iso()}
        status, reply, ms, cut = self.vault_invoke(self.alias_of(key), payload, proof['token'])
        size = len(json.dumps(reply))
        self.store.audit_alone(actor, 'flow.test', target, f'{reason} (HTTP {status} in {ms} ms, {size} bytes)',
                               'Succeeded' if 200 <= status < 300 else 'Failed', corr)
        return {'correlationId': corr, 'key': key, 'alias': self.alias_of(key), 'status': status, 'durationMs': ms,
                'truncated': cut, 'reply': mask_tree(reply)}

    def vault_status(self):
        status, health = self.vault_call('GET', '/health', timeout=int(self.setting('probeTimeoutSeconds')))
        out = {'url': self.setting('vaultUrl'), 'reachable': status == 200, 'health': health if status == 200 else None,
               'tokenConfigured': bool(self.vault_token()), 'flows': [], 'error': None}
        if status != 200:
            out['error'] = f'Vault did not answer at {out["url"]}: {health.get("message") or status}'
        elif out['tokenConfigured']:
            s, body = self.vault_call('GET', '/admin/flows')
            if s == 200:
                out['flows'] = body.get('flows', [])
            else:
                out['error'] = f'Vault refused the admin listing ({s}): {body.get("message", "")}'
        with self.store.read() as con:
            eps = [dict(r) for r in con.execute("SELECT id, scope, endpoint_key, vault_alias, state FROM endpoints WHERE state != 'Retired' ORDER BY scope, endpoint_key")]
        known = {f['alias']: f for f in out['flows']}
        out['reconciliation'] = [{**e, 'inVault': e['vault_alias'] in known, 'enabled': bool(known.get(e['vault_alias'], {}).get('enabled')),
                                  'verifiedAt': known.get(e['vault_alias'], {}).get('verified_at')} for e in eps]
        mapped = {e['vault_alias'] for e in eps}
        out['unmapped'] = [a for a in known if a not in mapped]
        return out

    def vault_verify(self, p, body):
        alias = self.text(body, 'alias', max_len=120)
        if not re.fullmatch(r'[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*', alias):
            raise ApiError(400, 'alias invalid')
        if not self.vault_token():
            raise ApiError(409, 'vault not configured', 'Set FOLIO_VAULT_ADMIN_TOKEN or FOLIO_VAULT_TOKEN_FILE for the Centre process.')
        if not p.can('vault.verify'):
            self.store.audit_alone(self.actor_of(p, body), 'vault.verify', f'vault:{alias}', self.reason_of(body), 'Denied', self.correlation_of(body))
            self.require(p, 'vault.verify')
        start = time.monotonic()
        status, res = self.vault_call('POST', f'/admin/flows/{quote(alias)}/verify', timeout=30)
        ms = int((time.monotonic() - start) * 1000)
        ok = status == 200 and res.get('verified') is True
        msg = (f'Vault verified alias {alias} (version {res.get("version")})' if ok
               else f'Vault verification of {alias} failed: {res.get("code") or status} {res.get("message", "")}'.strip())

        def work(con, actor, reason, corr):
            for e in con.execute('SELECT scope, endpoint_key FROM endpoints WHERE vault_alias=?', (alias,)).fetchall():
                con.execute('INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES(?,?,?,?,?,?,?)',
                            ('endpoint', f"{e['scope']}:{e['endpoint_key']}", 'Healthy' if ok else 'Unavailable', ms, msg, iso(), 'vault'))
            return {'alias': alias, 'verified': ok, 'message': msg, 'latencyMs': ms}
        return self.mutate(p, body, 'vault.verify', 'vault.verify', f'vault:{alias}', work)

    # ── flow owner ──────────────────────────────────────────────────────────────────────
    def governed_flow_ids(self, con):
        ids = set()
        for r in con.execute("SELECT flow_id, flow_candidates FROM endpoints WHERE state != 'Retired'"):
            if r['flow_id']:
                ids.add(r['flow_id'])
            ids.update(x for x in (r['flow_candidates'] or '').split(',') if x)
        ids.update(r[0] for r in con.execute("SELECT flow_id FROM folio_flows WHERE state != 'Retired'"))
        return ids

    def require_governed(self, flow_id):
        if not re.fullmatch(r'[0-9a-fA-F-]{36}', flow_id or ''):
            raise ApiError(400, 'flow id invalid')
        with self.store.read() as con:
            if flow_id not in self.governed_flow_ids(con):
                raise ApiError(404, 'not a governed flow', 'The Centre acts only on Folio flows: those behind a governed endpoint '
                                                           'and those the flow catalogue names.')

    def tenant_status(self):
        st = self.owner.status()
        with self.store.read() as con:
            st['flowsKnown'] = con.execute('SELECT COUNT(*) FROM tenant_flows').fetchone()[0]
            st['runsKnown'] = con.execute('SELECT COUNT(*) FROM flow_runs').fetchone()[0]
            st['unresolved'] = con.execute("SELECT COUNT(*) FROM endpoints WHERE state != 'Retired' AND flow_id IS NULL").fetchone()[0]
            st['folioFlows'] = con.execute("SELECT COUNT(*) FROM folio_flows WHERE state != 'Retired'").fetchone()[0]
        return st

    def tenant_sign_in(self, p, body):
        actor = self.actor_of(p, body)
        reason = self.reason_of(body)
        corr = self.correlation_of(body)
        target = f"tenant:{self.cfg['environmentId']}"
        if not p.can('tenant.connect'):
            self.store.audit_alone(actor, 'tenant.sign-in', target, reason, 'Denied', corr)
            self.require(p, 'tenant.connect')

        def done(user):
            self.store.audit_alone(actor, 'tenant.signed-in', target,
                                   f"Flow owner {user.get('email') or user.get('name') or 'account'} signed in through {self.owner.client}", 'Succeeded', corr)
            threading.Thread(target=self.safe_sync, args=('flow-run-monitor', 'First sync after sign-in'), daemon=True).start()
        st = self.owner.start_sign_in(on_done=done)
        self.store.audit_alone(actor, 'tenant.sign-in', target, reason, 'Succeeded' if st['state'] != 'error' else 'Failed', corr)
        return {'correlationId': corr, **st}

    def tenant_sign_out(self, p, body):
        def work(con, actor, reason, corr):
            self.owner.sign_out()
            return {'state': 'signed-out'}
        return self.mutate(p, body, 'tenant.connect', 'tenant.sign-out', f"tenant:{self.cfg['environmentId']}", work)

    def safe_sync(self, actor, reason):
        try:
            return self.flow_sync(actor, reason)
        except ApiError as e:
            with self.owner.lock:
                self.owner.last_sync_result = {'ok': False, 'error': e.detail or e.message, 'at': iso()}
        except Exception as e:  # a bad sync must not kill the monitor
            with self.owner.lock:
                self.owner.last_sync_result = {'ok': False, 'error': mask_credentials(e), 'at': iso()}

    def flow_sync(self, actor, reason):
        """List the owner's flows, settle identities, read run history, turn it into health and alerts."""
        o = self.owner
        listed = {f['name']: f for f in o.all('/flows')}
        ts = iso()
        depth = int(self.setting('runHistoryDepth'))
        with self.store.read() as con:
            eps = [dict(r) for r in con.execute("SELECT * FROM endpoints WHERE state != 'Retired'")]
            known = {r['flow_id']: dict(r) for r in con.execute('SELECT * FROM tenant_flows')}
            catalogue = {r['flow_id']: dict(r) for r in con.execute("SELECT * FROM folio_flows WHERE state != 'Retired'")}
        # The owner's list leaves out flows the account reads but does not list as its own (a flow shared with it):
        # each Folio flow the list misses is read by its id.
        read_directly, not_found = [], {}
        for fid in sorted((set(catalogue) | {e['flow_id'] for e in eps if e['flow_id']}) - set(listed)):
            try:
                listed[fid] = o.call('GET', f'/flows/{quote(fid)}')
                read_directly.append(fid)
            except ApiError as e:
                not_found[fid] = e.detail or e.message
        # 1. identities: a live trigger workflow settles ambiguity and verifies every recorded tie
        wanted = set()
        for e in eps:
            for fid in ([e['flow_id']] if e['flow_id'] else []) + [x for x in (e['flow_candidates'] or '').split(',') if x]:
                wanted.add(fid)
        triggers, unreadable = {}, dict(not_found)
        for fid in sorted(wanted):
            if fid not in listed:
                continue
            if known.get(fid, {}).get('trigger_workflow_id') and known[fid].get('synced_at', '') > iso(utcnow() - timedelta(hours=24)):
                triggers[fid] = (known[fid]['trigger_workflow_id'], known[fid]['trigger_path'])
                continue
            try:
                triggers[fid] = o.trigger_identity(fid)
            except ApiError as e:
                unreadable[fid] = e.detail or e.message
        resolved, verified, drift = 0, 0, []
        runs_by_flow = {}
        for fid in sorted(f for f in wanted | set(catalogue) if f in listed):
            try:
                runs_by_flow[fid] = o.call('GET', f'/flows/{quote(fid)}/runs?$top={depth}').get('value', [])
            except ApiError as e:
                unreadable.setdefault(fid, e.detail or e.message)
        with self.store.tx() as con:
            for fid, f in listed.items():
                pr = f.get('properties') or {}
                wf, path = triggers.get(fid, (None, None))
                con.execute('INSERT INTO tenant_flows(flow_id,display_name,state,created,modified,trigger_workflow_id,trigger_path,synced_at) VALUES(?,?,?,?,?,?,?,?) '
                            'ON CONFLICT(flow_id) DO UPDATE SET display_name=excluded.display_name, state=excluded.state, created=excluded.created, '
                            'modified=excluded.modified, trigger_workflow_id=COALESCE(excluded.trigger_workflow_id, tenant_flows.trigger_workflow_id), '
                            'trigger_path=COALESCE(excluded.trigger_path, tenant_flows.trigger_path), synced_at=excluded.synced_at',
                            (fid, pr.get('displayName') or fid, pr.get('state'), pr.get('createdTime'), pr.get('lastModifiedTime'), wf, path, ts))
            for e in eps:
                cands = [x for x in (e['flow_candidates'] or '').split(',') if x]
                fid, src, ok, wf_id, route = e['flow_id'], e['flow_id_source'], e['identity_verified'], e['workflow_id'], e['route']
                if e['workflow_id']:
                    match = [c for c in ([fid] if fid else cands) if triggers.get(c, (None,))[0] == e['workflow_id']]
                    if not fid and len(match) == 1:
                        fid, src, ok = match[0], 'resolved-live', 1
                        resolved += 1
                    elif fid and fid in triggers:
                        ok = 1 if match else 0
                        if not match:
                            drift.append(f"{e['scope']}:{e['endpoint_key']}")
                elif fid and fid in triggers and triggers[fid][0]:
                    wf_id, route, ok, src = triggers[fid][0], triggers[fid][1], 1, src or 'tenant-export'
                    resolved += 1
                verified += 1 if ok == 1 else 0
                f = listed.get(fid) if fid else None
                state = (f.get('properties') or {}).get('state') if f else ('Not visible to this account' if fid else None)
                modified = ((f.get('properties') or {}).get('lastModifiedTime') or '')[:10] if f else e['tenant_modified']
                con.execute('UPDATE endpoints SET flow_id=?, flow_id_source=?, identity_verified=?, workflow_id=?, route=?, tenant_state=?, '
                            'tenant_modified=?, tenant_observed_at=?, updated_at=? WHERE id=?',
                            (fid, src, ok, wf_id, route, state, modified, ts[:10] if f else e['tenant_observed_at'], ts, e['id']))
            n_runs = 0
            for fid, runs in runs_by_flow.items():
                for r in runs:
                    pr = r.get('properties') or {}
                    err = pr.get('error') or {}
                    start, end = pr.get('startTime'), pr.get('endTime')
                    a, b = flow_time(start), flow_time(end)
                    dur = int((b - a).total_seconds() * 1000) if a and b else None
                    trig = pr.get('trigger') or {}
                    con.execute('INSERT INTO flow_runs(flow_id,run_id,status,start_time,end_time,duration_ms,trigger_name,origin_history,error_code,error_message,synced_at) '
                                'VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(flow_id,run_id) DO UPDATE SET status=excluded.status, end_time=excluded.end_time, '
                                'duration_ms=excluded.duration_ms, error_code=excluded.error_code, error_message=excluded.error_message, synced_at=excluded.synced_at',
                                (fid, r.get('name'), pr.get('status') or 'Unknown', start, end, dur, trig.get('name'),
                                 trig.get('originHistoryName') or r.get('name'), err.get('code') or pr.get('code'),
                                 mask_credentials(err.get('message')) if err.get('message') else None, ts))
                    n_runs += 1
            # 2. health and alerts from the newest finished run of each governed flow
            by_flow = defaultdict(list)
            for e in con.execute("SELECT scope, endpoint_key, flow_id FROM endpoints WHERE state != 'Retired' AND flow_id IS NOT NULL"):
                by_flow[e['flow_id']].append(f"{e['scope']}:{e['endpoint_key']}")
            since = (utcnow() - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%S')
            for fid, assets in by_flow.items():
                last = con.execute("SELECT * FROM flow_runs WHERE flow_id=? AND status != 'Running' ORDER BY start_time DESC LIMIT 1", (fid,)).fetchone()
                if not last:
                    continue
                c24 = con.execute('SELECT COUNT(*), SUM(status=\'Succeeded\') FROM flow_runs WHERE flow_id=? AND start_time >= ?', (fid, since)).fetchone()
                state = RUN_HEALTH.get(last['status'], 'Degraded')
                name = (listed.get(fid, {}).get('properties') or {}).get('displayName') or fid
                msg = (f"Last run {last['status']} at {last['start_time']}" + (f" in {last['duration_ms']} ms" if last['duration_ms'] is not None else '') +
                       (f"; {c24[1] or 0}/{c24[0]} succeeded in 24 h" if c24[0] else '') + (f" — {last['error_code']}: {last['error_message']}" if last['error_code'] else ''))
                for a in assets:
                    con.execute('INSERT INTO health(asset_type,asset_id,state,latency_ms,message,checked_at,source) VALUES(?,?,?,?,?,?,?)',
                                ('endpoint', a, state, last['duration_ms'], mask_credentials(msg, 1000), ts, 'flow-runs'))
                self.flow_alert(con, fid, name, last)
            # 3. the Folio flows no endpoint names: alerts from their newest finished run; and every Folio flow's state
            for fid, cf in catalogue.items():
                f = listed.get(fid)
                if not f:
                    continue
                if fid not in by_flow:
                    last = con.execute("SELECT * FROM flow_runs WHERE flow_id=? AND status != 'Running' ORDER BY start_time DESC LIMIT 1", (fid,)).fetchone()
                    if last:
                        self.flow_alert(con, fid, cf['name'], last)
                self.flow_state_alert(con, fid, cf['name'], (f.get('properties') or {}).get('state'), cf['expected_state'])
            result = {'ok': True, 'at': ts, 'flowsListed': len(listed) - len(read_directly), 'flowsReadDirectly': len(read_directly),
                      'governedVisible': len([f for f in wanted if f in listed]),
                      'governedMissing': sorted(f for f in wanted if f not in listed and any(e['flow_id'] == f for e in eps)),
                      'folioFlowsVisible': len([f for f in catalogue if f in listed]),
                      'folioFlowsMissing': sorted(cf['name'] for f, cf in catalogue.items() if f not in listed),
                      'identitiesResolved': resolved, 'identitiesVerified': verified, 'identityDrift': drift, 'runsRead': n_runs,
                      'unreadable': {k: v for k, v in unreadable.items()}}
            if actor != 'flow-run-monitor' or drift:
                self.store.audit(con, actor, 'tenant.sync', f"tenant:{self.cfg['environmentId']}",
                                 f"{reason}: {len(listed)} flows listed, {resolved} identities resolved, {verified} verified, "
                                 f"{len(drift)} drifted, {n_runs} runs read", 'Succeeded', str(uuid.uuid4()))
        with o.lock:
            o.last_sync, o.last_sync_result = ts, result
        return result

    def flow_alert(self, con, fid, name, last):
        if not self.setting('autoAlert'):
            return
        asset = f'flow:{fid}'
        open_alert = con.execute("SELECT id FROM alerts WHERE asset=? AND source='flow-runs' AND state IN ('Open','Acknowledged') ORDER BY id DESC LIMIT 1", (asset,)).fetchone()
        ts = iso()
        if last['status'] == 'Failed' and not open_alert:
            corr = str(uuid.uuid4())
            msg = f"{name}: run {last['run_id']} failed at {last['start_time']}" + (f" — {last['error_code']}: {last['error_message'] or ''}" if last['error_code'] else '')
            cur = con.execute('INSERT INTO alerts(severity,asset,message,state,owner,created_at,updated_at,source,correlation_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
                              ('High', asset, mask_credentials(msg, 1500), 'Open', 'flow-owner', ts, ts, 'flow-runs', corr, 'flow-run-monitor'))
            rid = cur.lastrowid
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'flow-run-monitor', 'created', f'Newest finished run of {name} failed', ts))
            self.store.audit(con, 'flow-run-monitor', 'alert.create', f'alert:{rid}', f'Newest finished run of {name} failed', 'Succeeded', corr)
        elif last['status'] == 'Succeeded' and open_alert:
            rid = open_alert['id']
            note = f"Recovered: run {last['run_id']} of {name} succeeded at {last['start_time']}"
            con.execute("UPDATE alerts SET state='Resolved', resolved_at=?, updated_at=? WHERE id=?", (ts, ts, rid))
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'flow-run-monitor', 'transition', f'→ Resolved: {note}', ts))
            self.store.audit(con, 'flow-run-monitor', 'alert.resolved', f'alert:{rid}', note, 'Succeeded', str(uuid.uuid4()))

    def flow_state_alert(self, con, fid, name, actual, expected):
        """One alert while a Folio flow is not in the state the catalogue expects; resolved when it is again."""
        if not self.setting('autoAlert') or not actual:
            return
        asset = f'flow:{fid}'
        open_alert = con.execute("SELECT id FROM alerts WHERE asset=? AND source='flow-state' AND state IN ('Open','Acknowledged') ORDER BY id DESC LIMIT 1", (asset,)).fetchone()
        ts = iso()
        if actual != expected and not open_alert:
            corr = str(uuid.uuid4())
            msg = f'{name} is {actual}; the flow catalogue expects it {expected}'
            cur = con.execute('INSERT INTO alerts(severity,asset,message,state,owner,created_at,updated_at,source,correlation_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
                              ('High' if expected == 'Started' else 'Medium', asset, msg, 'Open', 'flow-owner', ts, ts, 'flow-state', corr, 'flow-run-monitor'))
            rid = cur.lastrowid
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'flow-run-monitor', 'created', msg, ts))
            self.store.audit(con, 'flow-run-monitor', 'alert.create', f'alert:{rid}', msg, 'Succeeded', corr)
        elif actual == expected and open_alert:
            rid = open_alert['id']
            note = f'Recovered: {name} is {actual}, as the flow catalogue expects'
            con.execute("UPDATE alerts SET state='Resolved', resolved_at=?, updated_at=? WHERE id=?", (ts, ts, rid))
            con.execute('INSERT INTO record_notes(record_type,record_id,actor,kind,note,created_at) VALUES(?,?,?,?,?,?)',
                        ('alerts', rid, 'flow-run-monitor', 'transition', f'→ Resolved: {note}', ts))
            self.store.audit(con, 'flow-run-monitor', 'alert.resolved', f'alert:{rid}', note, 'Succeeded', str(uuid.uuid4()))

    def run_sync(self, p, body):
        actor = self.actor_of(p, body)
        reason = self.text(body, 'reason', required=False, max_len=1000) or 'On-demand flow sync'
        if not p.can('tenant.sync'):
            self.store.audit_alone(actor, 'tenant.sync', f"tenant:{self.cfg['environmentId']}", reason, 'Denied', self.correlation_of(body))
            self.require(p, 'tenant.sync')
        return self.flow_sync(actor, reason)

    def flows_view(self):
        since = (utcnow() - timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%S')
        with self.store.read() as con:
            eps = [dict(r) for r in con.execute("SELECT id, scope, endpoint_key, flow_name, flow_id, flow_candidates, flow_id_source, identity_verified, "
                                                "workflow_id, tenant_state, tenant_modified, tenant_observed_at FROM endpoints WHERE state != 'Retired' ORDER BY scope, endpoint_key")]
            tf = {r['flow_id']: dict(r) for r in con.execute('SELECT * FROM tenant_flows')}
            catalogue = {r['flow_id']: dict(r) for r in con.execute("SELECT * FROM folio_flows WHERE state != 'Retired'")}
            flows = {}
            for e in eps:
                if not e['flow_id']:
                    continue
                f = flows.setdefault(e['flow_id'], {'flowId': e['flow_id'], 'name': (tf.get(e['flow_id']) or {}).get('display_name') or e['flow_name'],
                                                    'state': (tf.get(e['flow_id']) or {}).get('state') or e['tenant_state'],
                                                    'stateObservedAt': (tf.get(e['flow_id']) or {}).get('synced_at') or e['tenant_observed_at'],
                                                    'modified': (tf.get(e['flow_id']) or {}).get('modified') or e['tenant_modified'],
                                                    'triggerWorkflowId': (tf.get(e['flow_id']) or {}).get('trigger_workflow_id'),
                                                    'identity': e['flow_id_source'], 'verified': e['identity_verified'], 'endpoints': [], 'scopes': set()})
                f['endpoints'].append(f"{e['scope']}:{e['endpoint_key']}")
                f['scopes'].add(e['scope'])
                if e['identity_verified'] == 0:
                    f['verified'] = 0
            # The Folio flows no endpoint names, from the flow catalogue
            for fid, cf in catalogue.items():
                if fid in flows:
                    continue
                t = tf.get(fid) or {}
                flows[fid] = {'flowId': fid, 'name': t.get('display_name') or cf['name'], 'state': t.get('state'),
                              'stateObservedAt': t.get('synced_at'), 'modified': t.get('modified'), 'triggerWorkflowId': None,
                              'identity': 'catalogue', 'verified': None, 'endpoints': [], 'scopes': {cf['flow_group']}}
            for f in flows.values():
                cf = catalogue.get(f['flowId'])
                f['group'] = cf['flow_group'] if cf else None
                f['trigger'] = cf['trigger_desc'] if cf else None
                f['expectedState'] = cf['expected_state'] if cf else 'Started'
                f['stateMismatch'] = bool(f['state'] and f['state'] != f['expectedState'])
                f['scopes'] = sorted(f['scopes'])
                last = con.execute('SELECT * FROM flow_runs WHERE flow_id=? ORDER BY start_time DESC LIMIT 1', (f['flowId'],)).fetchone()
                c = con.execute("SELECT COUNT(*), SUM(status='Succeeded'), SUM(status='Failed'), AVG(duration_ms) FROM flow_runs WHERE flow_id=? AND start_time >= ?",
                                (f['flowId'], since)).fetchone()
                f['lastRun'] = dict(last) if last else None
                f['runs24h'], f['succeeded24h'], f['failed24h'] = c[0], c[1] or 0, c[2] or 0
                f['avgMs24h'] = int(c[3]) if c[3] is not None else None
            unresolved = [{'endpoint': f"{e['scope']}:{e['endpoint_key']}", 'flowName': e['flow_name'], 'candidates': [x for x in (e['flow_candidates'] or '').split(',') if x]}
                          for e in eps if not e['flow_id']]
        order = {'internal': 0, 'portal': 1, 'mailer': 2}
        return {'flows': sorted(flows.values(), key=lambda f: (order.get(f['scopes'][0], 3), f['scopes'][0], f['name'].lower())),
                'unresolved': unresolved, 'owner': self.owner.status(),
                'catalogue': {'flows': len(catalogue), 'withoutEndpoint': sum(1 for f in flows.values() if not f['endpoints'])}}

    def flow_runs_view(self, flow_id, qs):
        self.require_governed(flow_id)
        if qs.get('live') == '1' and self.owner.state == 'signed-in':
            self.flow_sync('flow-run-monitor', 'Run history refresh')
        with self.store.read() as con:
            return {'flowId': flow_id, 'items': [dict(r) for r in con.execute('SELECT * FROM flow_runs WHERE flow_id=? ORDER BY start_time DESC LIMIT 200', (flow_id,))]}

    def run_detail(self, flow_id, run_id):
        self.require_governed(flow_id)
        if not re.fullmatch(r'[0-9A-Za-z]{10,80}', run_id):
            raise ApiError(400, 'run id invalid')
        acts = self.owner.all(f'/flows/{quote(flow_id)}/runs/{quote(run_id)}/actions')
        out = []
        for a in acts:
            pr = a.get('properties') or {}
            err = pr.get('error') or {}
            # inputsLink / outputsLink are signed content URLs: never passed on.
            out.append({'name': a.get('name'), 'status': pr.get('status'), 'code': pr.get('code'), 'startTime': pr.get('startTime'),
                        'endTime': pr.get('endTime'), 'error': mask_credentials(err.get('message'), 800) if err.get('message') else None,
                        'errorCode': err.get('code')})
        out.sort(key=lambda x: x.get('startTime') or '')
        return {'flowId': flow_id, 'runId': run_id, 'actions': out}

    def flow_toggle(self, p, flow_id, action, body):
        self.require_governed(flow_id)
        verb = {'turn-on': 'start', 'turn-off': 'stop'}[action]

        def work(con, actor, reason, corr):
            self.owner.call('POST', f'/flows/{quote(flow_id)}/{verb}')
            state = 'Started' if verb == 'start' else 'Stopped'
            con.execute('UPDATE tenant_flows SET state=?, synced_at=? WHERE flow_id=?', (state, iso(), flow_id))
            con.execute('UPDATE endpoints SET tenant_state=?, updated_at=? WHERE flow_id=?', (state, iso(), flow_id))
            return {'flowId': flow_id, 'state': state}
        return self.mutate(p, body, 'flow.operate', f'flow.{action}', f'flow:{flow_id}', work)

    def run_action(self, p, flow_id, run_id, action, body):
        self.require_governed(flow_id)
        if not re.fullmatch(r'[0-9A-Za-z]{10,80}', run_id):
            raise ApiError(400, 'run id invalid')
        if action == 'resubmit' and body.get('confirm') != 'RESUBMIT':
            raise ApiError(400, 'confirmation required', 'Resubmitting replays the original request. Send "confirm": "RESUBMIT".')

        def work(con, actor, reason, corr):
            if action == 'cancel':
                self.owner.call('POST', f'/flows/{quote(flow_id)}/runs/{quote(run_id)}/cancel')
                con.execute("UPDATE flow_runs SET status='Cancelled' WHERE flow_id=? AND run_id=?", (flow_id, run_id))
                return {'flowId': flow_id, 'runId': run_id, 'cancelled': True}
            r = self.owner.call('GET', f'/flows/{quote(flow_id)}/runs/{quote(run_id)}')
            trig = (r.get('properties') or {}).get('trigger') or {}
            name, hist = trig.get('name') or 'manual', trig.get('originHistoryName') or run_id
            self.owner.call('POST', f'/flows/{quote(flow_id)}/triggers/{quote(name)}/histories/{quote(hist)}/resubmit')
            return {'flowId': flow_id, 'runId': run_id, 'resubmitted': True}
        return self.mutate(p, body, 'flow.operate', f'flow.run-{action}', f'flow:{flow_id}:run:{run_id}', work)

    # ── access ──────────────────────────────────────────────────────────────────────────
    def operators(self):
        with self.store.read() as con:
            return {'items': [{k: r[k] for k in r.keys() if k != 'token_digest'} for r in con.execute('SELECT * FROM operators ORDER BY name')],
                    'roles': [{'id': r, 'label': ROLE_LABELS[r], 'permissions': sorted(k for k, v in PERMISSIONS.items() if r in v)} for r in ROLES]}

    def create_operator(self, p, body):
        name = self.text(body, 'name', max_len=80)
        if not ACTOR_RE.match(name):
            raise ApiError(400, 'name invalid', 'Use 2–80 letters, digits, spaces, dots, dashes, @ or underscores.')
        role = self.choice(body, 'role', [r for r in ROLES if r != 'super_admin'])
        token = 'fac_' + secrets.token_urlsafe(32)

        def work(con, actor, reason, corr):
            if con.execute('SELECT 1 FROM operators WHERE lower(name)=lower(?)', (name,)).fetchone():
                raise ApiError(409, 'operator exists', f'An operator named {name} already exists.')
            cur = con.execute('INSERT INTO operators(name,role,token_digest,enabled,created_by,created_at) VALUES(?,?,?,?,?,?)',
                              (name, role, sha256_hex(token), 1, actor, iso()))
            return {'id': cur.lastrowid, 'name': name, 'role': role, 'token': token, '_target': f'operator:{name}'}
        return self.mutate(p, body, 'access.manage', 'operator.create', f'operator:{name}', work)

    def operator_action(self, p, oid, action, body):
        token = 'fac_' + secrets.token_urlsafe(32) if action == 'rotate' else None

        def work(con, actor, reason, corr):
            r = con.execute('SELECT * FROM operators WHERE id=?', (oid,)).fetchone()
            if not r:
                raise ApiError(404, 'not found', f'No operator #{oid}.')
            if action == 'rotate':
                con.execute('UPDATE operators SET token_digest=? WHERE id=?', (sha256_hex(token), oid))
            else:
                con.execute('UPDATE operators SET enabled=? WHERE id=?', (1 if action == 'enable' else 0, oid))
            out = {'id': oid, 'name': r['name'], '_target': f"operator:{r['name']}"}
            if token:
                out['token'] = token
            return out
        return self.mutate(p, body, 'access.manage', f'operator.{action}', f'operator:{oid}', work)

    def rotate_bootstrap(self, p, body):
        new = secrets.token_urlsafe(32)

        def work(con, actor, reason, corr):
            tmp = self.cfg.token_path.with_suffix('.tmp')
            tmp.write_text(new + '\n', encoding='utf-8')
            os.chmod(tmp, 0o600)
            os.replace(tmp, self.cfg.token_path)
            return {'rotated': True}
        out = self.mutate(p, body, 'access.manage', 'access.rotate-bootstrap', 'config/admin.token', work)
        self.admin_token = new
        out['token'] = new
        return out

    # ── operations ──────────────────────────────────────────────────────────────────────
    def backups(self):
        d = self.cfg.backup_dir
        items = []
        if d.is_dir():
            for f in sorted(d.glob('folio_admin_*.db'), reverse=True):
                st = f.stat()
                items.append({'file': f.name, 'bytes': st.st_size, 'sha256': sha256_hex(f.read_bytes()),
                              'createdAt': iso(datetime.fromtimestamp(st.st_mtime, timezone.utc)), 'mode': oct(st.st_mode & 0o777)})
        return {'items': items, 'directory': str(d)}

    def create_backup(self, p, body):
        def work(con, actor, reason, corr):
            self.cfg.backup_dir.mkdir(parents=True, exist_ok=True)
            os.chmod(self.cfg.backup_dir, 0o700)
            name = f"folio_admin_{utcnow().strftime('%Y%m%dT%H%M%SZ')}_{secrets.token_hex(2)}.db"
            dest = self.cfg.backup_dir / name
            # A separate reader: WAL gives it the committed state, without the audit event this
            # transaction is about to write (backing up from `con` itself would wait on its own lock).
            source, target = self.store.connect(), sqlite3.connect(str(dest))
            try:
                source.backup(target)
            finally:
                target.close()
                source.close()
            os.chmod(dest, 0o600)
            return {'file': name, 'bytes': dest.stat().st_size, 'sha256': sha256_hex(dest.read_bytes()), '_target': f'backup:{name}'}
        return self.mutate(p, body, 'backup.create', 'backup.create', 'backup:new', work)

    def run_retention(self, p, body):
        actor = self.actor_of(p, body)
        reason = self.reason_of(body)
        self.require(p, 'retention.run')
        return self.prune(actor, reason, always_audit=True)

    def export(self, p, qs):
        self.require(p, 'evidence.export')
        actor = p.name or qs.get('actor') or 'super-administrator'
        with self.store.read() as con:
            bundle = {t: [dict(r) for r in con.execute(f'SELECT * FROM {t} ORDER BY 1')]
                      for t in ('platforms', 'endpoints', 'configurations', 'configuration_history', 'alerts', 'incidents', 'changes', 'record_notes', 'audit')}
            bundle['health'] = [dict(r) for r in con.execute('SELECT * FROM health ORDER BY id DESC LIMIT 5000')]
            chain = self.store.verify_chain(con)
        doc = {'schema': 'folio-admin-evidence/v2', 'system': self.cfg['systemName'], 'version': self.cfg['version'],
               'exportedAt': iso(), 'exportedBy': actor, 'auditChain': chain, 'records': bundle}
        raw = json.dumps(doc, indent=1, default=str)
        self.store.audit_alone(actor, 'evidence.export', 'evidence:bundle',
                               f'Evidence bundle exported ({len(raw)} bytes, sha256 {sha256_hex(raw)[:16]}…)', 'Succeeded', str(uuid.uuid4()))
        return raw

    def export_csv(self, p, table):
        self.require(p, 'evidence.export')
        if table not in self.LISTS:
            raise ApiError(404, 'not found')
        with self.store.read() as con:
            cur = con.execute(f'SELECT * FROM {table} ORDER BY 1')
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow([d[0] for d in cur.description])
            for r in cur:
                # A leading = + - @ turns a CSV cell into a spreadsheet formula; neutralise it.
                w.writerow([("'" + str(v)) if isinstance(v, str) and v[:1] in '=+-@' else v for v in r])
        return buf.getvalue()

    def checklist(self):
        s = self.summary()
        hs = self.health_status()
        chain = self.store.verify_chain()
        b = self.backups()['items']
        last_backup = parse_iso(b[0]['createdAt']) if b else None

        def mode(pth):
            try:
                return oct(pth.stat().st_mode & 0o777)
            except OSError:
                return None
        bad = [a for a in hs['assets'] if a['assetType'] == 'platform' and a['state'] != 'Healthy']
        with self.store.read() as con:
            failed_flows = [r[0] for r in con.execute(
                "SELECT COALESCE(t.display_name, r.flow_id) FROM flow_runs r LEFT JOIN tenant_flows t ON t.flow_id = r.flow_id "
                "WHERE r.start_time = (SELECT MAX(start_time) FROM flow_runs x WHERE x.flow_id = r.flow_id AND x.status != 'Running') AND r.status = 'Failed'")]
            unresolved_ids = [f"{r[0]}:{r[1]}" for r in con.execute("SELECT scope, endpoint_key FROM endpoints WHERE state != 'Retired' AND flow_id IS NULL")]
        estate_expected = None
        try:
            estate_expected = len(read_estate(self.cfg.repo)[0])
        except Exception:
            pass
        items = [
            ('daily', 'Centre process active', True, f"Answering since {iso(self.started)}"),
            ('daily', 'Portfolio count is 6', s['platforms'] == 6, f"{s['platforms']} platforms registered"),
            ('daily', 'Endpoint estate matches the registers', estate_expected is None or sum(s['endpointsByScope'].values()) == estate_expected,
             f"{sum(s['endpointsByScope'].values())} active endpoint records" + (f', registers list {estate_expected}' if estate_expected is not None else '')),
            ('daily', 'Every platform has a current healthy observation', not bad,
             'All healthy' if not bad else ', '.join(f"{a['name']}: {a['state']}" for a in bad)),
            ('daily', 'No open Critical or High alerts', not (s['openAlertsBySeverity'].get('Critical') or s['openAlertsBySeverity'].get('High')),
             f"{s['open']['alerts']} open alerts"),
            ('daily', 'No incidents in progress', s['open']['incidents'] == 0, f"{s['open']['incidents']} open incidents"),
            ('daily', 'No changes awaiting decision', s['changesAwaitingDecision'] == 0, f"{s['changesAwaitingDecision']} submitted"),
            ('daily', 'Audit chain verifies', chain['valid'], f"{chain['events']} events" + ('' if chain['valid'] else f", mismatch at #{chain.get('mismatchAt')}")),
            ('daily', 'Flow owner connected and runs synced', self.owner.state == 'signed-in' and bool(self.owner.last_sync),
             f"{self.owner.state}" + (f", last sync {self.owner.last_sync}" if self.owner.last_sync else ', never synced')),
            ('daily', 'No governed flow failed its newest run', not failed_flows,
             'None failed' if not failed_flows else ', '.join(failed_flows[:6])),
            ('daily', 'Every endpoint is tied to exactly one tenant flow', not unresolved_ids,
             'All resolved' if not unresolved_ids else f"{len(unresolved_ids)} unresolved: " + ', '.join(unresolved_ids[:6])),
            ('weekly', 'Backup taken in the last 7 days', bool(last_backup and (utcnow() - last_backup).days < 7),
             f"Last backup {b[0]['createdAt']}" if b else 'No backup has been taken'),
            ('weekly', 'Token file is 0600', mode(self.cfg.token_path) == '0o600', f'mode {mode(self.cfg.token_path)}'),
            ('weekly', 'Database file is 0600', mode(self.cfg.db_path) == '0o600', f'mode {mode(self.cfg.db_path)}'),
            ('weekly', 'Retention meets the seven-year policy', int(self.setting('retentionDays')) >= 2555, f"{self.setting('retentionDays')} days"),
            ('weekly', 'Listener is loopback-only', is_loopback(self.cfg['bindHost']), self.cfg['bindHost']),
        ]
        return {'items': [{'cadence': c, 'check': n, 'pass': bool(ok), 'detail': d} for c, n, ok, d in items],
                'generatedAt': iso()}

    def metrics_view(self):
        def size(pth):
            try:
                return pth.stat().st_size
            except OSError:
                return 0
        with self.metrics_lock:
            m = {k: (dict(v) if isinstance(v, defaultdict) else v) for k, v in self.metrics.items()}
        return {**m, 'uptimeSeconds': int((utcnow() - self.started).total_seconds()), 'startedAt': iso(self.started),
                'databaseBytes': size(self.cfg.db_path), 'walBytes': size(Path(str(self.cfg.db_path) + '-wal')),
                'threads': threading.active_count(), 'monitor': self.monitor_status(), 'python': sys.version.split()[0],
                'schemaVersion': SCHEMA_VERSION}

    def session(self, p):
        return {'role': p.role, 'roleLabel': ROLE_LABELS[p.role], 'name': p.name, 'kind': p.kind,
                'permissions': sorted(k for k, v in PERMISSIONS.items() if p.role in v),
                'system': {'name': self.cfg['systemName'], 'version': self.cfg['version'], 'build': toolkit_build(), 'bind': f"{self.cfg['bindHost']}:{self.cfg['port']}",
                           'timezone': self.setting('timezone'), 'sessionIdleMinutes': self.setting('sessionIdleMinutes'),
                           'runHistoryIntervalSeconds': self.setting('runHistoryIntervalSeconds'),
                           'environmentId': self.cfg['environmentId'], 'sharePointConnectionId': self.cfg['sharePointConnectionId'],
                           'repositoryAttached': self.cfg.repo is not None},
                'enums': {'severities': SEVERITIES, 'healthStates': HEALTH_STATES, 'platformStates': PLATFORM_STATES,
                          'endpointStates': ENDPOINT_STATES, 'roles': [{'id': r, 'label': ROLE_LABELS[r]} for r in ROLES],
                          'flows': FLOWS, 'runHealth': RUN_HEALTH, 'noteRequired': sorted(f'{a}:{b}' for a, b in NOTE_REQUIRED)}}


# ─────────────────────────────────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────────────────────────────────

SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Content-Security-Policy': ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                                "connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; "
                                "form-action 'none'; object-src 'none'"),
}


# A hosted section: the pages carry their own inline script and style, so they run sandboxed (an opaque origin, which
# cannot reach the Centre's session or API), may be framed only by the Centre, and may load their own files.
SECTION_HEADERS = {
    **SECURITY_HEADERS,
    'X-Frame-Options': 'SAMEORIGIN',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': ("sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals; "
                                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
                                "img-src 'self' data:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'self'; "
                                "base-uri 'none'; form-action 'none'; object-src 'none'"),
}


def route_table(app):
    R = []

    def add(method, pattern, fn, perm='read', body=False):
        R.append((method, re.compile('^' + pattern + '$'), fn, perm, body))

    for t in ('platforms', 'endpoints', 'configurations', 'health', 'audit', 'alerts', 'incidents', 'changes'):
        add('GET', f'/api/{t}', lambda p, m, qs, b, t=t: app.list(t, qs))
    for t in ('alerts', 'incidents', 'changes'):
        add('GET', rf'/api/{t}/(\d+)', lambda p, m, qs, b, t=t: app.record(t, int(m[1])))
        add('POST', rf'/api/{t}/(\d+)/transition', lambda p, m, qs, b, t=t: app.transition(p, t, int(m[1]), b), None, True)
        add('POST', rf'/api/{t}/(\d+)/notes', lambda p, m, qs, b, t=t: app.add_note(p, t, int(m[1]), b), None, True)
    for t in ('alerts', 'incidents'):
        add('POST', rf'/api/{t}/(\d+)/assign', lambda p, m, qs, b, t=t: app.assign(p, t, int(m[1]), b), None, True)
    add('GET', '/api/session', lambda p, m, qs, b: app.session(p))
    add('GET', '/api/summary', lambda p, m, qs, b: app.summary())
    add('GET', '/api/search', lambda p, m, qs, b: app.search(qs.get('q', '')))
    add('GET', '/api/health/status', lambda p, m, qs, b: app.health_status())
    add('GET', '/api/audit/verify', lambda p, m, qs, b: app.store.verify_chain(), 'audit.verify')
    add('GET', r'/api/configurations/([A-Za-z]+)/history', lambda p, m, qs, b: app.config_history(m[1]))
    add('GET', '/api/checklist', lambda p, m, qs, b: app.checklist())
    add('GET', '/api/metrics', lambda p, m, qs, b: app.metrics_view())
    add('GET', '/api/backups', lambda p, m, qs, b: app.backups())
    add('GET', '/api/vault', lambda p, m, qs, b: app.vault_status())
    add('GET', '/api/operators', lambda p, m, qs, b: app.operators(), 'access.manage')
    add('GET', '/api/tenant', lambda p, m, qs, b: app.tenant_status())
    add('POST', '/api/tenant/sign-in', lambda p, m, qs, b: app.tenant_sign_in(p, b), None, True)
    add('POST', '/api/tenant/sign-out', lambda p, m, qs, b: app.tenant_sign_out(p, b), None, True)
    add('POST', '/api/tenant/sync', lambda p, m, qs, b: app.run_sync(p, b), None, True)
    add('GET', '/api/flows', lambda p, m, qs, b: app.flows_view())
    add('GET', r'/api/flows/([0-9a-fA-F-]{36})/runs', lambda p, m, qs, b: app.flow_runs_view(m[1], qs))
    add('GET', r'/api/flows/([0-9a-fA-F-]{36})/runs/([0-9A-Za-z]+)', lambda p, m, qs, b: app.run_detail(m[1], m[2]))
    add('POST', r'/api/flows/([0-9a-fA-F-]{36})/(turn-on|turn-off)', lambda p, m, qs, b: app.flow_toggle(p, m[1], m[2], b), None, True)
    add('POST', r'/api/flows/([0-9a-fA-F-]{36})/runs/([0-9A-Za-z]+)/(resubmit|cancel)', lambda p, m, qs, b: app.run_action(p, m[1], m[2], m[3], b), None, True)
    add('POST', '/api/alerts', lambda p, m, qs, b: app.create_alert(p, b), None, True)
    add('POST', '/api/incidents', lambda p, m, qs, b: app.create_incident(p, b), None, True)
    add('POST', '/api/changes', lambda p, m, qs, b: app.create_change(p, b), None, True)
    add('POST', '/api/health', lambda p, m, qs, b: app.ingest_health(p, b), None, True)
    add('POST', '/api/probe', lambda p, m, qs, b: app.run_probe(p, b), None, True)
    add('POST', r'/api/probe/([a-z]+)', lambda p, m, qs, b: app.run_probe(p, b, m[1]), None, True)
    add('POST', r'/api/platforms/([a-z]+)/status', lambda p, m, qs, b: app.set_platform(p, m[1], b), None, True)
    add('POST', r'/api/endpoints/(\d+)/state', lambda p, m, qs, b: app.set_endpoint(p, int(m[1]), b), None, True)
    add('POST', '/api/estate/reconcile', lambda p, m, qs, b: app.reconcile(p, b), None, True)
    add('PUT', r'/api/configurations/([A-Za-z]+)', lambda p, m, qs, b: app.set_config(p, m[1], b), None, True)
    add('POST', '/api/vault/verify', lambda p, m, qs, b: app.vault_verify(p, b), None, True)
    add('GET', '/api/test', lambda p, m, qs, b: app.test_status(p))
    add('POST', '/api/test/sign-in', lambda p, m, qs, b: app.test_sign_in(p, b), None, True)
    add('POST', '/api/test/verify', lambda p, m, qs, b: app.test_verify(p, b), None, True)
    add('POST', '/api/test/sign-out', lambda p, m, qs, b: app.test_sign_out(p, b), None, True)
    add('POST', '/api/test/run', lambda p, m, qs, b: app.test_run(p, b), None, True)
    add('POST', '/api/operators', lambda p, m, qs, b: app.create_operator(p, b), None, True)
    add('POST', r'/api/operators/(\d+)/(rotate|disable|enable)', lambda p, m, qs, b: app.operator_action(p, int(m[1]), m[2], b), None, True)
    add('POST', '/api/access/rotate-bootstrap', lambda p, m, qs, b: app.rotate_bootstrap(p, b), None, True)
    add('POST', '/api/backups', lambda p, m, qs, b: app.create_backup(p, b), None, True)
    add('POST', '/api/retention/run', lambda p, m, qs, b: app.run_retention(p, b), None, True)
    return R


class Handler(BaseHTTPRequestHandler):
    server_version = 'FolioAdminCentre/2.0'
    sys_version = ''
    protocol_version = 'HTTP/1.1'

    @property
    def app(self):
        return self.server.app

    def log_message(self, fmt, *args):  # never logs headers, bodies or query strings
        pass

    def access_log(self, status, started, principal):
        if os.environ.get('FOLIO_ADMIN_ACCESS_LOG') == '0':
            return
        path = self.path.split('?', 1)[0]
        ms = int((time.monotonic() - started) * 1000)
        print(f'{iso()} {self.client_address[0]} {self.command} {path} {status} {ms}ms {principal or "-"}', file=sys.stderr)

    def send(self, status, body, ctype='application/json; charset=utf-8', extra=None, security=SECURITY_HEADERS):
        data = body if isinstance(body, bytes) else body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in security.items():
            self.send_header(k, v)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        if getattr(self, '_pending_body', False):
            # Answered without reading the body (refused early): the stream is out of step, so end it.
            self.send_header('Connection', 'close')
            self.close_connection = True
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                # The caller hung up first (a liveness probe reads the status line and goes): nothing to answer.
                self.close_connection = True
        self._status = status
        with self.app.metrics_lock:
            self.app.metrics['requests'] += 1
            self.app.metrics['byStatus'][str(status)] += 1

    def json(self, status, obj, extra=None):
        self.send(status, json.dumps(obj, default=str), extra=extra)

    def error(self, e, corr=None):
        payload = {'error': e.message, 'message': e.detail or e.message, 'status': e.status, 'correlationId': corr or str(uuid.uuid4())}
        if e.status == 429:
            self.json(e.status, payload, {'Retry-After': '300'})
        else:
            self.json(e.status, payload)

    def host_ok(self):
        host = (self.headers.get('Host') or '').lower()
        port = self.server.server_address[1]
        allowed = {f'127.0.0.1:{port}', f'localhost:{port}', f'[::1]:{port}'}
        allowed |= {h.strip().lower() for h in os.environ.get('FOLIO_ADMIN_ALLOWED_HOSTS', '').split(',') if h.strip()}
        return host in allowed

    def origin_ok(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        return urlsplit(origin).netloc.lower() == (self.headers.get('Host') or '').lower()

    def read_body(self):
        ctype = (self.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        try:
            n = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            raise ApiError(400, 'invalid length')
        if n > MAX_BODY or n < 0:
            raise ApiError(413, 'body too large', f'Requests are limited to {MAX_BODY} bytes.')
        raw = self.rfile.read(n) if n else b''
        self._pending_body = False
        if not raw:
            return {}
        if ctype != 'application/json':
            raise ApiError(415, 'content type must be application/json')
        try:
            body = json.loads(raw)
        except ValueError:
            raise ApiError(400, 'invalid json', 'The request body is not valid JSON.')
        if not isinstance(body, dict):
            raise ApiError(400, 'invalid json', 'The request body must be a JSON object.')
        return body

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PUT(self):
        self.dispatch()

    def do_DELETE(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def dispatch(self):
        started = time.monotonic()
        principal = None
        self._status = 0
        try:
            self._pending_body = int(self.headers.get('Content-Length') or 0) > 0
        except ValueError:
            self._pending_body = True
        try:
            if not self.host_ok():
                raise ApiError(403, 'host not allowed', 'The Centre answers only on its loopback address.')
            split = urlsplit(self.path)
            path = unquote(split.path)
            qs = {k: v[-1] for k, v in parse_qs(split.query).items()}
            if path == '/healthz' and self.command in ('GET', 'HEAD'):
                return self.json(200, {'status': 'ok', 'system': self.app.cfg['systemName'], 'version': self.app.cfg['version']})
            if not path.startswith('/api/'):
                if self.command not in ('GET', 'HEAD'):
                    raise ApiError(405, 'method not allowed')
                if path.startswith('/sections/'):
                    return self.section(path)
                if path.startswith('/modules/'):
                    return self.module(path)
                return self.static(path)
            if path == '/api/launch' and self.command == 'POST':
                if not self.origin_ok():
                    raise ApiError(403, 'cross-origin request refused')
                principal = 'launcher'
                return self.json(200, self.app.redeem_launch(self.read_body(), self.client_address[0]))
            p = self.app.authenticate(self.headers.get('Authorization', ''), self.client_address[0])
            principal = p.name or p.role
            if self.command in ('GET', 'HEAD') and path == '/api/export':
                return self.send(200, self.app.export(p, qs), 'application/json; charset=utf-8',
                                 {'Content-Disposition': f'attachment; filename="folio-admin-evidence-{utcnow().strftime("%Y%m%dT%H%M%SZ")}.json"'})
            m = re.fullmatch(r'/api/export/([a-z_]+)\.csv', path)
            if self.command in ('GET', 'HEAD') and m:
                return self.send(200, self.app.export_csv(p, m[1]), 'text/csv; charset=utf-8',
                                 {'Content-Disposition': f'attachment; filename="folio-admin-{m[1]}.csv"'})
            method = 'GET' if self.command == 'HEAD' else self.command
            matched_path = False
            for meth, rx, fn, perm, wants_body in self.server.routes:
                m = rx.match(path)
                if not m:
                    continue
                matched_path = True
                if meth != method:
                    continue
                body = {}
                if wants_body:
                    if not self.origin_ok():
                        raise ApiError(403, 'cross-origin request refused')
                    body = self.read_body()
                if perm:
                    self.app.require(p, perm)
                status = 201 if method == 'POST' and re.fullmatch(r'/api/(alerts|incidents|changes|operators|backups)', path) else 200
                return self.json(status, fn(p, m, qs, body))
            raise ApiError(405 if matched_path else 404, 'method not allowed' if matched_path else 'not found')
        except ApiError as e:
            self.error(e)
        except Exception as e:  # never leak a trace to the client
            print(f'{iso()} internal error on {self.command} {self.path.split("?")[0]}: {type(e).__name__}: {e}', file=sys.stderr)
            self.error(ApiError(500, 'internal error', 'The request failed; nothing was committed.'))
        finally:
            self.access_log(self._status, started, principal)

    def static(self, path):
        root = (PKG / 'static').resolve()
        rel = 'index.html' if path in ('', '/') else path.lstrip('/')
        full = (root / rel).resolve()
        if full != root and root not in full.parents:
            raise ApiError(403, 'forbidden')
        if full.is_dir():
            full = full / 'index.html'
        if not full.is_file():
            raise ApiError(404, 'not found')
        ctype = mimetypes.guess_type(str(full))[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'image/svg+xml', 'application/json'):
            ctype += '; charset=utf-8'
        self.send(200, full.read_bytes(), ctype)


    def module(self, path):
        rel = path[len('/modules/'):]
        if rel not in MODULES or self.app.cfg.repo is None or not (self.app.cfg.repo / rel).is_file():
            raise ApiError(404, 'not found')
        self.send(200, (self.app.cfg.repo / rel).read_bytes(), 'application/javascript; charset=utf-8')

    def section(self, path):
        name, _, rest = path[len('/sections/'):].partition('/')
        if name not in SECTIONS:
            raise ApiError(404, 'not found')
        repo = self.app.cfg.repo
        if repo is None:
            raise ApiError(404, 'not found', 'The Centre was started without the repository, so it hosts no section.')
        rel, folder, platform = SECTIONS[name]
        base = (repo / rel).resolve()
        if folder:
            if not rest and not path.endswith('/'):   # the folder's own address: its pages link relative to it
                return self.send(301, b'', 'text/plain; charset=utf-8', {'Location': f'/sections/{name}/'})
            full = (base / (rest or 'index.html')).resolve()
            if full != base and base not in full.parents:
                raise ApiError(403, 'forbidden')
        else:
            if rest:
                raise ApiError(404, 'not found')
            full = base
        if not full.is_file():
            raise ApiError(404, 'not found')
        ctype = mimetypes.guess_type(str(full))[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype in ('application/javascript', 'image/svg+xml', 'application/json'):
            ctype += '; charset=utf-8'
        self.send(200, full.read_bytes(), ctype, {'X-DGO-Platform': platform} if platform else None, security=SECTION_HEADERS)


for _ext, _type in (('.js', 'application/javascript'), ('.css', 'text/css'), ('.svg', 'image/svg+xml'),
                    ('.png', 'image/png'), ('.woff2', 'font/woff2'), ('.json', 'application/json')):
    mimetypes.add_type(_type, _ext)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def build_server(cfg=None):
    cfg = cfg or Config()
    app = App(cfg)
    srv = Server((cfg['bindHost'], int(cfg['port'])), Handler)
    srv.app = app
    srv.routes = route_table(app)
    return srv


def main(argv):
    cfg = Config()
    if '--check' in argv:
        app = App(cfg)
        print(json.dumps({'config': str(cfg.settings_path), 'home': str(cfg.home), 'repository': str(cfg.repo),
                          'chain': app.store.verify_chain(), 'summary': {k: v for k, v in app.summary().items()
                                                                         if isinstance(v, int)}}, indent=2))
        return 0
    srv = build_server(cfg)
    app = srv.app
    host, port = srv.server_address[:2]
    print(f"{cfg['systemName']} {cfg['version']}\n"
          f"  listening   http://{host}:{port}\n"
          f"  state       {cfg.home}\n"
          f"  token file  {cfg.token_path}  (read it locally; it is never printed)\n"
          f"  estate      {cfg.repo or 'NOT FOUND — set FOLIO_ADMIN_REPO'}\n"
          f"  monitor     {'every ' + str(app.setting('healthIntervalSeconds')) + 's' if app.monitor else 'disabled'}", file=sys.stderr)
    if app.monitor:
        app.monitor.start()

    def stop(*_):
        threading.Thread(target=srv.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        srv.serve_forever()
    finally:
        if app.monitor:
            app.monitor.stopped.set()
            app.monitor.wake.set()
        srv.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
