// Every runnable platform in this repository, and the port each one owns.
//
// WHY THIS EXISTS
//
// Seven separate things in this tree can be started and used, and until now the repository
// could start two of them. `npm start` served the checkout root on 8080, which puts the
// runtime at `/` and the portal at `/document-portal/`; `npm run serve:portal` served the
// portal on the same 8080, so the two commands could not both be running. The Admin Console,
// the Flow Workbench and the Flow Capsule registry each had run instructions in their own
// README and no entry in package.json at all, which means the only way to find out how to
// start one was to know it existed and go looking.
//
// This file is the answer to "what can I run, and on what port". scripts/run-platform.mjs
// starts anything listed here, tests/platforms.test.mjs holds the list to the tree, and
// README.md documents it. All three read this file; none of them restates it.
//
// ON THE PORT ASSIGNMENTS
//
// The runtime keeps 8080 because README.md, .devcontainer/devcontainer.json and
// scripts/dev-server.mjs already name it, and moving it would break every one of them.
//
// The portal gets an origin of its own rather than a path under the runtime, because the
// portal is a PWA: document-portal/js/core.js registers `sw.js` relatively and
// manifest.webmanifest declares `"scope": "./"`. Served at a subpath the service worker
// takes a subpath scope, which is not the shape it deploys in. On its own port it is served
// at `/`, exactly as it is deployed. (scripts/dev-server.mjs still mounts it at `/portal/`
// on one origin on purpose — that is the mode that removes CORS from the picture while you
// work against the stub endpoints. Both are wanted; they are different jobs.)
//
// The Workbench and the Capsule do NOT get ports assigned by this file — they get the ports
// their own code already binds, and this file records them. The Workbench relay hardcodes
// 127.0.0.1:8765 in tools/flow-workbench/local_agent.py and accepts browser requests only
// from that exact origin, so serving the Workbench anywhere else produces a page that loads
// and cannot send. The Capsule reads FLOWCAP_PORT and defaults to 8787. Choosing different
// numbers here would mean either patching their source or shipping instructions that do not
// work.

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const Platforms = Object.freeze([
  Object.freeze({
    id: 'runtime',
    group: 'staff',
    name: 'Folio Workspace',
    summary: 'The operations platform shell — routing, RBAC, state, 31 routes, Admin Suite.',
    port: 8080,
    kind: 'static',
    audience: 'staff',
    category: 'Operations',
    purpose: 'Use this for daily work: correspondence, assignments, approvals, reports and the Admin Suite.',
    owner: 'DGO Platform Engineering',
    exposure: 'internal',
    probe: '/',
    // Where it is published. Notification links start here (config/deeplink.config.js).
    prodUrl: 'https://folio-platform.page.gd/',
    // Served from the checkout root: the runtime imports from core/, modules/, config/,
    // shared/ and styles/, so its document root is the repository, not a subdirectory.
    serveFrom: '.',
    entry: 'index.html',
    openPath: '/',
    needs: 'Node 22+',
    // Both applications load their config with onerror="void 0", so an absent
    // config.local.js is a 404 the page ignores. That is demo mode, and it is the intended
    // state for a fresh clone — see README.md.
    note: 'Boots in demo mode without config/config.local.js. `npm run setup` scaffolds it.',
  }),
  Object.freeze({
    id: 'portal',
    group: 'public',
    name: 'NITDA Document Portal',
    summary: 'Public document submission and tracking PWA — service worker, manifest, offline shell.',
    port: 8081,
    kind: 'static',
    audience: 'public',
    category: 'Service',
    purpose: 'Use this to submit a document to the Agency and track its progress.',
    owner: 'DGO Platform Engineering',
    exposure: 'public',
    probe: '/',
    // Owner, 2026-10-19: the Portal is at the root of folio-portal.page.gd (Flow Configuration ALLOWED_ORIGIN_PORTAL);
    // it was at correspondence-gateway.rf.gd from 2026-10-17, and activityweb.page.gd serves an older Portal.
    prodUrl: 'https://folio-portal.page.gd/',
    serveFrom: 'document-portal',
    entry: 'document-portal/index.html',
    openPath: '/',
    needs: 'Node 22+',
    note: 'Own origin, so the service worker takes the root scope it deploys with.',
  }),
  Object.freeze({
    id: 'console',
    group: 'staff',
    name: 'Folio Estate Console',
    summary: 'Single-file console over the endpoint estate and the flow catalogue.',
    port: 8082,
    kind: 'static',
    audience: 'admin',
    category: 'Administration',
    purpose: 'Use this to inspect the endpoint estate when the Admin Suite in the Runtime is unavailable.',
    owner: 'DGO Platform Engineering',
    exposure: 'internal',
    probe: '/admin-console.html',
    fallbackFor: 'runtime',
    serveFrom: 'tools',
    entry: 'tools/admin-console.html',
    openPath: '/admin-console.html',
    needs: 'Node 22+',
    // It carries no local <script src> or <link href> — every asset is inline — so it will
    // also open straight off the filesystem. It is served here anyway: over file:// the
    // origin is opaque, which changes what fetch and storage are allowed to do.
    note: 'Self-contained. `npm run console` rebuilds it from the endpoint register.',
  }),
  Object.freeze({
    id: 'mailer',
    group: 'staff',
    name: 'DGO Correspondence Mailer',
    summary: 'SPA that sends personalised letters, with per-addressee attachments, through seven HTTP-triggered flows.',
    port: 8083,
    kind: 'static',
    audience: 'staff',
    category: 'Correspondence',
    purpose: 'Use this to send personalised letters with per-addressee attachments.',
    owner: 'DGO Platform Engineering',
    exposure: 'internal',
    probe: '/',
    // Owner, 2026-10-19: published beside the Workspace, as one file at the root of folio-platform.page.gd (its seven
    // flows let only that origin read their answers). The two share an origin but not storage: the Mailer keeps its
    // drafts and attachments in IndexedDB 'dgo-mailer', and the Workspace uses no IndexedDB.
    prodUrl: 'https://folio-platform.page.gd/mailer.html',
    // Locally it is still served on a port of its own, as the portal is.
    serveFrom: 'mailer',
    entry: 'mailer/index.html',
    openPath: '/',
    needs: 'Node 22+',
    note: 'Runs in simulation without mailer/config.local.js. `npm run mailer:mock` stands in for the flows.',
  }),
  Object.freeze({
    id: 'workbench',
    group: 'control',
    name: 'Folio Flow Workbench',
    summary: 'Inspect, compose, validate and send requests against the catalogued Power Automate flows.',
    port: 8765,
    kind: 'python',
    audience: 'engineering',
    category: 'Commissioning',
    purpose: 'Use this to send test requests to the Power Automate flows and read their replies.',
    owner: 'DGO Platform Engineering',
    exposure: 'local',
    probe: '/',
    serveFrom: 'tools/flow-workbench',
    entry: 'tools/flow-workbench/index.html',
    openPath: '/',
    // The relay accepts browser requests only from its own origin, http://127.0.0.1:8765 (local_agent.py ORIGIN), so
    // the page is opened there: from http://localhost:8765 every call to the relay is refused as cross-origin
    // (found commissioning the tools, 2026-10-19).
    openHost: '127.0.0.1',
    // The relay serves the page AND forwards its requests server-side. Opening index.html
    // directly gives you inspection only: Power Automate answers without CORS headers, so a
    // browser can issue the request and can never read the reply.
    // The interpreter is nominal: run-platform.mjs resolves a real Python 3 itself, so this
    // records what the platform needs rather than naming a binary that must exist.
    command: ['python3', ['local_agent.py']],
    needs: 'Python 3.7+',
    note: 'The relay is unauthenticated and binds 127.0.0.1. Stop it when you are done.',
  }),
  Object.freeze({
    id: 'capsule',
    group: 'control',
    name: 'Folio Vault',
    summary: 'SQLite-backed registry holding each signed flow URL as an alias it never returns.',
    port: 8787,
    kind: 'python',
    audience: 'engineering',
    category: 'Commissioning',
    purpose: 'Use this (as an API) to hold signed flow URLs behind aliases that are never returned.',
    owner: 'DGO Platform Engineering',
    exposure: 'local',
    probe: '/health',
    serveFrom: 'tools/flow-capsule',
    entry: 'tools/flow-capsule/app/flowcapsule.py',
    // It is an API, not a page. /health is the one route that answers without a bearer
    // token, which is what makes it the readiness probe in run-platform.mjs.
    openPath: '/health',
    command: ['python3', ['app/flowcapsule.py']],
    needs: 'Python 3.11+',
    // First start writes bootstrap-credentials.json and registry.db, both 0600. The service
    // defaults FLOWCAP_DATA_DIR to ./data — INSIDE THE CHECKOUT. That is overridden here to
    // a path under the system temp directory, for the same reason dev-server.mjs keeps its
    // store there: a data directory inside the tree shows up in `git status` and is
    // eventually committed, and this one holds credentials. Keyed by the checkout path so
    // two clones do not share one registry.
    //
    // Declared here rather than in the launcher so that what the Capsule needs sits beside
    // the Capsule. The launcher reads `env` and `ensureEnvDirs` and knows nothing about
    // which platform it is starting.
    env: ({ host }) => {
      const e = {};
      if (!process.env.FLOWCAP_DATA_DIR) {
        e.FLOWCAP_DATA_DIR = path.join(
          os.tmpdir(),
          `dgo-flowcapsule-${Buffer.from(ROOT).toString('base64url').slice(-16)}`,
        );
      }
      if (host !== 'localhost') e.FLOWCAP_HOST = host;
      return e;
    },
    // Env vars naming a directory the service expects to exist. Created 0700 before start.
    ensureEnvDirs: ['FLOWCAP_DATA_DIR'],
    note: 'Bearer tokens are written to the data directory on first start; read them there.',
  }),
  Object.freeze({
    id: 'centre',
    group: 'control',
    name: 'Folio Central Administration Centre',
    summary: 'Governed control plane: monitors every platform above, and holds alerts, incidents, changes and a hash-chained audit trail.',
    port: 8844,
    kind: 'python',
    audience: 'admin',
    category: 'Administration',
    purpose: 'Use this to monitor every platform and manage alerts, incidents, changes and the audit trail.',
    owner: 'DGO Platform Engineering',
    exposure: 'local',
    probe: '/healthz',
    serveFrom: 'tools/admin-centre',
    entry: 'tools/admin-centre/server.py',
    // /healthz is its one unauthenticated route: liveness only, no data.
    openPath: '/',
    command: ['python3', ['server.py']],
    needs: 'Python 3.9+',
    // Same reasoning as the Capsule: the database and the bootstrap token are state and a
    // credential, so a launcher run keeps them out of the checkout. Run server.py directly
    // (tools/admin-centre/README.md) and they live in the package directory, git-ignored.
    //
    // It also points the Centre at the Capsule's bootstrap credentials, so `npm run start:all`
    // gives the Centre's Vault view a working admin token without anyone copying one. The
    // Centre reads that file; it never stores what is in it.
    env: () => {
      const tag = Buffer.from(ROOT).toString('base64url').slice(-16);
      const e = {};
      if (!process.env.FOLIO_ADMIN_HOME) e.FOLIO_ADMIN_HOME = path.join(os.tmpdir(), `folio-admin-centre-${tag}`);
      if (!process.env.FOLIO_VAULT_ADMIN_TOKEN && !process.env.FOLIO_VAULT_TOKEN_FILE) {
        e.FOLIO_VAULT_TOKEN_FILE = path.join(process.env.FLOWCAP_DATA_DIR || path.join(os.tmpdir(), `dgo-flowcapsule-${tag}`),
          'bootstrap-credentials.json');
      }
      return e;
    },
    ensureEnvDirs: ['FOLIO_ADMIN_HOME'],
    note: 'Loopback only. The bootstrap token is written to FOLIO_ADMIN_HOME/config/admin.token on first start; read it there.',
  }),
  Object.freeze({
    id: 'hub',
    group: 'staff',
    name: 'Platform Hub',
    summary: 'The front door: every platform above, what it is for, who it is for, and whether it is up.',
    port: 8079,
    kind: 'node',
    audience: 'staff',
    category: 'Navigation',
    purpose: 'Use this to find and open any platform, and see which ones are running.',
    owner: 'DGO Platform Engineering',
    exposure: 'local',
    probe: '/api/platforms',
    // Served from the root so the page can reach tools/hub/ and nothing else; the server
    // (scripts/hub-server.mjs) answers only its own routes and never proxies platform traffic.
    serveFrom: '.',
    entry: 'tools/hub/index.html',
    openPath: '/',
    command: ['node', ['scripts/hub-server.mjs']],
    needs: 'Node 22+',
    note: 'Reads this file on every request, so a platform added here appears in the Hub with no other change.',
  }),
]);

/* ------------------------------------------------------------------ *
 * Groups — who a platform serves and what it may reach
 * ------------------------------------------------------------------ */

/**
 * Every platform belongs to exactly one group, and each group starts on its own
 * (`npm run start:<group>`). No platform in one group may depend on a platform in another,
 * with one standing exception: the Hub and the Centre read every platform's liveness probe,
 * which is read-only and fails safe when the target is down. tests/platforms.test.mjs holds
 * the tree to this, and the launcher refuses to mix a Control platform into any other run.
 *
 *   public   the one public platform; its own origin, no shared sign-in.
 *   staff    the staff platforms; the only group where one sign-in could later be shared.
 *   control  the relay, the credential store and the control plane; loopback only, never
 *            proxied, each with its own token.
 */
export const Groups = Object.freeze([
  Object.freeze({ id: 'public', label: 'Public', bind: 'routable', sharedSignIn: false }),
  Object.freeze({ id: 'staff', label: 'Staff', bind: 'internal', sharedSignIn: true }),
  Object.freeze({ id: 'control', label: 'Control', bind: 'loopback', sharedSignIn: false }),
]);

/** The platforms in one group, in declaration order. */
export const inGroup = (g) => Platforms.filter(p => p.group === g);

/** One platform by id, or undefined. */
export const platform = (id) => Platforms.find(p => p.id === id);

/** The id list, in declaration order — used by the CLI and by the help text. */
export const ids = () => Platforms.map(p => p.id);

/** The npm script that starts a platform. Kept as a function so the name has one spelling. */
export const scriptName = (id) => `start:${id}`;

/** Where a platform answers once it is up. */
export const url = (p, host = 'localhost') => `http://${host === 'localhost' && p.openHost ? p.openHost : host}:${p.port}${p.openPath}`;

/* ------------------------------------------------------------------ *
 * Access model — docs/architecture/PLATFORM_ACCESS_SPEC.md §3
 * ------------------------------------------------------------------ */

/** Audiences in display order, each with the roles (config/rbac.config.js) that may see it. */
export const Audiences = Object.freeze([
  Object.freeze({ id: 'staff', label: 'Staff', roles: ['viewer', 'operator', 'director', 'executive', 'userAdmin', 'systemAdmin'] }),
  Object.freeze({ id: 'admin', label: 'Administration', roles: ['userAdmin', 'systemAdmin'] }),
  Object.freeze({ id: 'engineering', label: 'Engineering', roles: ['systemAdmin'] }),
  Object.freeze({ id: 'public', label: 'Public', roles: ['*'] }),
]);

export const Exposures = Object.freeze(['public', 'internal', 'local']);

/**
 * The platforms a role may see. Advisory while auth is inert (README, item 2): it decides what
 * is SHOWN, not what is reachable. Engineering platforms stay safe because they bind loopback.
 */
export const visibleTo = (role) => Platforms.filter(p => {
  const a = Audiences.find(x => x.id === p.audience);
  return a && (a.roles.includes('*') || a.roles.includes(role));
});

/** What a browser may be told about a platform: no command, env or filesystem paths. */
export const publicView = (p, host = 'localhost') => ({
  id: p.id, name: p.name, purpose: p.purpose, summary: p.summary,
  audience: p.audience, group: p.group, category: p.category, exposure: p.exposure,
  owner: p.owner, port: p.port, url: url(p, host), prodUrl: p.prodUrl ?? null,
  startCommand: `npm run ${scriptName(p.id)}`, fallbackFor: p.fallbackFor ?? null, needs: p.needs,
});

/**
 * The README platform table (PLATFORM_ACCESS_SPEC.md FR-11). README.md carries it between the
 * `platforms:begin` / `platforms:end` markers; `npm run platforms:readme` rewrites it there and
 * tests/platforms.test.mjs fails when the two differ. Rows are ordered by port.
 */
export const markdownTable = () => {
  const label = (a) => Audiences.find(x => x.id === a)?.label ?? a;
  const rows = [...Platforms].sort((a, b) => a.port - b.port).map(p =>
    `| **${p.name}**${p.id === 'hub' ? ' — start here' : ''} | ${label(p.audience)} | \`${p.entry}\` | \`npm run ${scriptName(p.id)}\` | ${p.port} | ${p.needs} |`);
  return ['| Platform | Audience | Entry point | Run | Port | Needs |', '|---|---|---|---|---|---|', ...rows].join('\n');
};
export const README_MARKERS = Object.freeze(['<!-- platforms:begin (generated: npm run platforms:readme) -->', '<!-- platforms:end -->']);
