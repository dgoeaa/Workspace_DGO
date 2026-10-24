/**
 * The estate orchestrator's runtime: every flow update and every reference-data change the
 * repository holds, applied in one pass from the operator's own browser session.
 *
 * Embedded by source text into docs/folio-Master-Flows-and-Endpoints/deployment/ESTATE_APPLY.console.js (scripts/build-estate-apply.mjs),
 * and imported directly by tests/estate-apply.test.mjs with a simulated tenant. It must stay
 * self-contained: it may reference only its parameters, standard globals, and installPackage /
 * validateWiring from scripts/lib/flow-install.mjs, which are embedded beside it.
 *
 * NO ADMIN RIGHTS, NO ENTRA ID, NO AZURE. The Flow API is called with the token the maker portal
 * already holds, on the user-scoped paths only (never the /scopes/admin/ ones), so it can change
 * only flows the operator owns or co-owns. SharePoint is called with the operator's own cookie.
 *
 * WHERE THE TARGETS COME FROM
 *   Not from a list of flow ids typed into this file: the estate holds several flows per
 *   endpoint, and ids written from an old capture have already named flows nothing calls. The
 *   target of an HTTP package is the flow whose OWN trigger answers the workflow id the platform
 *   calls (config/endpoint-atlas.data.js, from the endpoint register), read live through the
 *   trigger's listCallbackUrl. The signed URL that call returns is a credential: only the 32-hex
 *   workflow id is kept from it, and nothing else of it is stored or printed.
 *
 * WHAT IT REFUSES
 *   · a package whose target flow also serves a contract key the package does not implement —
 *     replacing that flow's body would take the other endpoint down;
 *   · two packages resolving to one flow;
 *   · a package that does not install cleanly (wiring, host shape, a variable write with no value);
 *   · a package whose prerequisite (runbook §0.4) is neither current nor applied in this run.
 *
 * HOW IT WRITES
 *   Plan first, always. apply() re-plans, downloads a backup of every flow it is about to change,
 *   then writes in dependency order. After each write it reads the flow back; if the structure
 *   did not land, that flow is restored from the backup and the run stops.
 */
import { installPackage } from './flow-install.mjs';

export function createEstate(DATA, io) {
  const log = (...a) => io.log(...a);
  const say = (text, style = '') => io.log(`%c${text}`, style);
  const RED = 'color:#c00;font-weight:bold', GREEN = 'color:#080;font-weight:bold', AMBER = 'color:#b8860b;font-weight:bold', GREY = 'color:#888';
  const clone = (v) => JSON.parse(JSON.stringify(v ?? null));

  /* Canonical JSON: key order and designer bookkeeping (metadata, empty runAfter) do not count
     as a difference. */
  const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) {
        if (k === 'metadata') continue;
        if (k === 'runAfter' && v[k] && !Object.keys(v[k]).length) continue;
        out[k] = canon(v[k]);
      }
      return out;
    }
    return v;
  };
  const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
  /* A copy of a stored flow's actions without the inputs.authentication the service adds to
     connector actions, wherever the package's matching action carries none. */
  const withoutServiceAdded = (have, want) => {
    const out = {};
    for (const [n, a] of Object.entries(have || {})) {
      if (!a || typeof a !== 'object') { out[n] = a; continue; }
      const w = (want || {})[n] || {};
      const c = { ...a };
      if (c.inputs && typeof c.inputs === 'object' && 'authentication' in c.inputs && !(w.inputs && typeof w.inputs === 'object' && 'authentication' in w.inputs)) {
        c.inputs = { ...c.inputs }; delete c.inputs.authentication;
      }
      if (a.actions) c.actions = withoutServiceAdded(a.actions, w.actions);
      if (a.else?.actions) c.else = { ...a.else, actions: withoutServiceAdded(a.else.actions, w.else?.actions) };
      if (a.cases) c.cases = Object.fromEntries(Object.entries(a.cases).map(([k, v]) => [k, { ...v, actions: withoutServiceAdded(v?.actions, w.cases?.[k]?.actions) }]));
      if (a.default?.actions) c.default = { ...a.default, actions: withoutServiceAdded(a.default.actions, w.default?.actions) };
      out[n] = c;
    }
    return out;
  };

  /* Where two definitions first differ, as a path of names only (no values). */
  const firstDiff = (a, b, path = '') => {
    const x = canon(a), y = canon(b);
    if (JSON.stringify(x) === JSON.stringify(y)) return null;
    if (x && y && typeof x === 'object' && typeof y === 'object' && Array.isArray(x) === Array.isArray(y)) {
      for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])].sort()) {
        if (!(k in x) || !(k in y)) return `${path}${k} (${k in x ? 'only in the flow' : 'only in the package'})`;
        const d = firstDiff(x[k], y[k], `${path}${k}.`);
        if (d) return d;
      }
    }
    return path.replace(/\.$/, '') || '(top level)';
  };

  /* The structure that must survive a write: every action's name, type and place, every variable
     write's value, and the trigger's type and method. A service that re-serialises a field
     differently has not lost the flow; one that drops an action or a value has. */
  const skeleton = (def) => {
    const out = [];
    const walk = (actions, path) => {
      for (const [n, a] of Object.entries(actions || {}).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
        const here = `${path}${n}`;
        out.push(`${here}:${a?.type}`);
        if (/Variable$/.test(a?.type || '') && a.type !== 'InitializeVariable') out.push(`${here}=${JSON.stringify(canon(a.inputs?.value))}`);
        walk(a?.actions, `${here}/`); if (a?.else) walk(a.else.actions, `${here}/else/`);
        for (const [cn, c] of Object.entries(a?.cases || {})) walk(c?.actions, `${here}/${cn}/`);
        walk(a?.default?.actions, `${here}/default/`);
      }
    };
    walk(def?.actions, '');
    for (const [n, t] of Object.entries(def?.triggers || {})) out.push(`trigger ${n}:${t?.type}:${t?.inputs?.method || ''}:${JSON.stringify(canon(t?.recurrence || null))}`);
    return out.join('\n');
  };

  /* ───────────────────────────── Flow API ───────────────────────────── */

  function findFlowToken() {
    const wanted = /service\.flow\.microsoft\.com|service\.powerapps\.com/i;
    const out = [];
    for (const store of io.storages()) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!/accesstoken/i.test(key || '')) continue;
        let v; try { v = JSON.parse(store.getItem(key)); } catch { continue; }
        const secret = v && (v.secret || v.accessToken);
        if (!secret) continue;
        const target = `${key} ${v.target || v.scopes || ''}`;
        if (!wanted.test(target)) continue;
        out.push({ secret, expires: Number(v.expiresOn || v.expires_on || 0), flow: /service\.flow\.microsoft\.com/i.test(target) });
      }
    }
    out.sort((a, b) => (b.flow - a.flow) || (b.expires - a.expires));
    return out[0]?.secret || null;
  }

  /* WHERE THE TOKEN COMES FROM. Older portal builds kept it readable in browser storage; current
     ones encrypt that cache, so storage is tried first and the portal's OWN traffic second: the
     paste installs a listener on the page's fetch/XMLHttpRequest that keeps the Authorization
     header of any request the portal itself sends to the Flow service (…/providers/Microsoft.
     ProcessSimple/…), together with the host it sent it to. Nothing is printed or stored beyond
     this tab's memory. If nothing has been seen yet, the operator clicks My flows (no reload) and
     the run continues by itself. */
  let api = null;
  const FLOW_AUDIENCE = /service\.flow\.microsoft\.com|service\.powerapps\.com/i;

  /* What the tab has seen, without any secret: hosts, request counts, token audiences. */
  function diagnose() {
    const rows = (io.authSeen ? io.authSeen() : []).map((r) => ({ host: r.host, requests: r.requests, withBearer: r.bearer, flowServicePath: r.flowPath, tokenAudiences: r.audiences.join(' ') }));
    say('Requests this tab has seen since the paste (no tokens are shown):', 'font-weight:bold');
    if (rows.length) io.table(rows); else log('  none — the page sent no request through fetch or XMLHttpRequest since the paste');
    log(`  Flow hosts in the page's resource timings: ${io.observedOrigins().join(', ') || 'none'}`);
    log(`  Readable token in browser storage: ${findFlowToken() ? 'yes' : 'no'}`);
    return rows;
  }

  /* One HTTP call, read to the end. A dropped connection (the browser's "Failed to fetch",
     ERR_CONNECTION_ABORTED, ERR_NETWORK_CHANGED) is retried for reads; a write is not retried
     here, because apply() reads the flow back to learn whether the write landed. After the last
     attempt the result is { ok:false, status:0, network:true } rather than an exception. */
  /* How the operator types each next step: console calls by default, CLI commands when io.cmd says so. */
  const CMD = {
    apply: 'await ESTATE.apply()',
    repoint: 'await ESTATE.repoint()',
    applyRepointed: (keys) => `await ESTATE.apply({ repointed: [${keys.map((k) => `'${k}'`).join(', ')}] })`,
    ...(io.cmd || {}),
  };
  const RETRY_MS = io.retryDelaysMs ?? [2000, 4000, 8000];
  async function request(url, init = {}, { retry = true } = {}) {
    const delays = retry ? RETRY_MS : [];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await io.fetch(url, init);
        const text = await res.text();
        let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
        /* Throttled or briefly unavailable: wait and read again. */
        if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < delays.length) {
          log(`%c  the service answered ${res.status}; retrying in ${delays[attempt] / 1000} s (${attempt + 1}/${delays.length})`, AMBER);
          await io.sleep(delays[attempt]);
          continue;
        }
        return { ok: res.ok, status: res.status, body };
      } catch (e) {
        if (attempt >= delays.length) return { ok: false, status: 0, network: true, body: { error: { code: 'NetworkError', message: `the connection dropped (${e && e.message ? e.message : e}); check the network and run the command again` } } };
        log(`%c  connection dropped; retrying in ${delays[attempt] / 1000} s (${attempt + 1}/${delays.length})`, AMBER);
        await io.sleep(delays[attempt]);
      }
    }
  }

  const flowBase = (o) => `${o}/providers/Microsoft.ProcessSimple/environments/${DATA.environment}`;
  const flowOrigins = () => [...new Set([...io.observedOrigins().filter((o) => /^https:\/\/[^/]+$/.test(o)), 'https://api.flow.microsoft.com'])];
  const tryCandidates = async (cands) => {
    for (const c of cands) {
      const headers = { Authorization: c.authorization, 'Content-Type': 'application/json', Accept: 'application/json' };
      const r = await request(`${flowBase(c.origin)}/flows?api-version=2016-11-01`, { headers });
      if (r.ok) {
        api = {
          base: flowBase(c.origin), headers,
          json(path, init = {}) {
            const method = String(init.method || 'GET').toUpperCase();
            return request(`${api.base}${path}${path.includes('?') ? '&' : '?'}api-version=2016-11-01`, { headers, ...init }, { retry: method === 'GET' || /listCallbackUrl/.test(path) });
          },
        };
        return api;
      }
      if (r.network) throw new Error(r.body.error.message);
      log(`%c  ${c.origin.replace(/^https:\/\//, '')} -> ${r.status}`, GREY);
    }
    return null;
  };

  const TOKEN_STEPS = 'Hand the session over by hand (no admin rights needed):\n'
    + '  1. DevTools (F12) → Network tab. In its filter box type: ProcessSimple\n'
    + '  2. Click "My flows" in the portal\'s left menu.\n'
    + '  3. Click a row whose Type is fetch or xhr (not preflight). Headers → Request Headers → authorization.\n'
    + '  4. Right-click the value → Copy value. It starts with "Bearer ey".\n'
    + '  5. Console: ESTATE.useToken(\'<paste>\')   then   await ESTATE.plan()\n'
    + '  The token is your sign-in for about an hour: do not send it to anyone or save it in a file.';

  /* The operator's own Authorization header, copied from DevTools → Network. Validated against the
     Flow API before use; kept in this tab's memory only; never printed. */
  let pendingToken = null;
  function useToken(value, origin) {
    pendingToken = handOver(value, origin).finally(() => { pendingToken = null; });
    return pendingToken;
  }
  async function handOver(value, origin) {
    let v = String(value ?? '').trim().replace(/^["'`]+|["'`]+$/g, '').trim();
    v = v.replace(/^authorization\s*:\s*/i, '').replace(/^bearer\s+/i, '').trim();
    if (!/^[A-Za-z0-9._~+/=-]{20,}$/.test(v)) throw new Error('That is not an authorization header value. Copy only the value (it starts with "Bearer ey"), with no line breaks.');
    if (origin != null && !/^(https:\/\/[^/]+|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?)$/.test(String(origin).replace(/\/+$/, ''))) throw new Error('The origin must look like https://api.flow.microsoft.com');
    const origins = origin != null ? [String(origin).replace(/\/+$/, '')] : flowOrigins();
    const previous = api;
    api = null;
    if (await tryCandidates(origins.map((o) => ({ origin: o, authorization: `Bearer ${v}` })))) {
      say(io.connectedNote || 'Connected with the token you supplied (kept in this tab only). Next: await ESTATE.plan()', GREEN);
      return true;
    }
    api = previous;
    throw new Error('The Flow service refused that token: it has expired, or it was copied from a request to another service. Copy it again from a request whose URL contains /providers/Microsoft.ProcessSimple/, then retry.');
  }

  async function connect() {
    if (pendingToken) await pendingToken.catch(() => null);
    if (api) return api;
    const candidates = () => {
      const out = [];
      for (const c of io.capturedAuth()) {
        /* A request the portal sent to the Flow service itself: reuse its host and header as is. */
        if (c.flowPath) out.push({ origin: c.origin, authorization: c.authorization });
        /* A token issued for the Flow service, seen on any request: try it on the Flow hosts. */
        else if (FLOW_AUDIENCE.test(String(c.aud || ''))) for (const o of flowOrigins()) out.push({ origin: o, authorization: c.authorization });
      }
      const token = findFlowToken();
      if (token) for (const o of flowOrigins()) out.push({ origin: o, authorization: `Bearer ${token}` });
      const seen = new Set();
      return out.filter((c) => { const k = `${c.origin} ${c.authorization}`; if (seen.has(k)) return false; seen.add(k); return true; });
    };
    if (await tryCandidates(candidates())) return api;
    say('Waiting 20 seconds for the portal to call the Flow service: click "My flows" in the left menu (do not reload the page).', AMBER);
    const deadline = Date.now() + (io.authWaitMs ?? 20000);
    const tried = new Set();
    while (Date.now() < deadline) {
      await io.sleep(1000);
      if (api) return api;
      const fresh = candidates().filter((c) => !tried.has(`${c.origin} ${c.authorization}`));
      fresh.forEach((c) => tried.add(`${c.origin} ${c.authorization}`));
      if (fresh.length && await tryCandidates(fresh)) { say('Connected.', GREEN); return api; }
    }
    diagnose();
    say(TOKEN_STEPS, AMBER);
    throw new Error('No Power Automate session could be read from this tab. Follow the 5 steps above, then run: await ESTATE.plan()');
  }

  /* The listing is read without $top: the live service answered $top=250 with 400 while the
     plain listing returned 200 (run of 2026-09-27). A refused listing stops the run with the
     service's own message; it is never read as "no flows". The shared-with-me pass is optional. */
  async function listFlows() {
    const seen = new Map();
    const passes = [{ path: '/flows?$top=50', plain: '/flows', required: true }, { path: "/flows?$top=50&$filter=search('team')", plain: "/flows?$filter=search('team')", required: false }];
    for (const pass of passes) {
      let path = pass.path;
      for (let guard = 0; path && guard < 200; guard++) {
        let r = await api.json(path);
        if (!r.ok && r.status === 400 && guard === 0 && path !== pass.plain) { path = pass.plain; r = await api.json(path); }
        if (!r.ok) {
          const why = `${r.status} ${String(r.body?.error?.code || '')} ${String(r.body?.error?.message || r.body?.raw || '').slice(0, 300)}`.trim();
          if (pass.required) throw new Error(`Listing your flows was refused: ${why}`);
          log(`%c  shared-flow listing skipped: ${why}`, GREY);
          break;
        }
        for (const f of r.body?.value || []) if (!seen.has(f.name)) seen.set(f.name, f);
        const next = r.body?.nextLink || r.body?.['@odata.nextLink'];
        path = next ? next.slice(next.indexOf('/flows')).replace(/[?&]api-version=[^&]*/, '') : null;
      }
    }
    log(`%c  ${seen.size} flow(s) visible to this account`, GREY);
    return [...seen.values()];
  }

  async function getFlow(name) {
    const r = await api.json(`/flows/${name}`);
    if (!r.ok) throw new Error(`reading flow ${name} returned ${r.status}`);
    return r.body;
  }

  /* The callback URL of a flow's Request trigger. It is a CREDENTIAL: only workflowIdOf keeps
     anything from it (the id), and only repoint() hands it on — to the clipboard, on request. */
  async function callbackOf(flow) {
    const triggers = flow?.properties?.definition?.triggers || {};
    const name = Object.keys(triggers).find((t) => triggers[t]?.type === 'Request');
    if (!name) return null;
    const r = await api.json(`/flows/${flow.name}/triggers/${encodeURIComponent(name)}/listCallbackUrl`, { method: 'POST', body: '{}' });
    if (r.network) throw new Error(r.body.error.message);
    return r.ok ? String(r.body?.response?.value || r.body?.value || '') || null : null;
  }
  async function workflowIdOf(flow) {
    const m = /\/workflows\/([0-9a-f]{32})\//i.exec((await callbackOf(flow)) || '');
    return m ? m[1].toLowerCase() : null;
  }

  /* ───────────────────────────── planning ───────────────────────────── */

  const keyByName = new Map(DATA.keys.map((k) => [k.key, k]));
  const containsAction = (actions, name) => {
    for (const [n, a] of Object.entries(actions || {})) {
      if (n === name) return true;
      if (containsAction(a?.actions, name) || containsAction(a?.else?.actions, name) || containsAction(a?.default?.actions, name)) return true;
      for (const c of Object.values(a?.cases || {})) if (containsAction(c?.actions, name)) return true;
    }
    return false;
  };

  let lastPlan = null;

  /* MIGRATIONS. Where the register wires two keys to one flow and the packages give each key
     its own flow, a key MOVES: its package is installed into its own flow while nothing calls
     it (STAGED), the operator points the key at that flow (repoint()), and says so
     (apply({ repointed })). Only then is the flow that was shared free to take its own package.
     `repointed` is the operator's statement that the platform now calls the new flow; the run
     report records the wiring it assumed, so the endpoint register can be updated from it. */
  /* The routes a move needs that its target flow does not name. A route counts when the
     definition holds it as a whole quoted literal ("TRACK" or 'TRACK' in an expression). */
  function unmetRoutes(mv) {
    const text = JSON.stringify(mv.target?.full?.properties?.definition || {});
    return [].concat(mv.requires || []).filter((r) => !new RegExp(`["']${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(text));
  }

  function wiringFor(flows, repointed) {
    const wired = new Map(DATA.keys.map((k) => [k.key, k.workflowId]));
    const moves = [];
    const all = (DATA.migrations || []).flatMap((m) => m.moves.map((mv) => ({ ...mv, migration: m.id })));
    /* A move to a flow named by id first; then a move to "wherever key X lives", which follows X
       to its own new flow when X is itself moving (FETCH_ACTIVITIES follows SUBSIDIARY_ACTIONS). */
    for (const mv of all.filter((x) => x.flowId)) moves.push({ ...mv, target: flows.find((f) => f.id.toLowerCase() === mv.flowId.toLowerCase()) || null });
    for (const mv of all.filter((x) => !x.flowId)) {
      const lead = moves.find((x) => x.key === mv.toKey);
      const byWire = flows.filter((f) => f.workflowId && f.workflowId === wired.get(mv.toKey));
      moves.push({ ...mv, target: lead ? lead.target : (byWire.length === 1 ? byWire[0] : null) });
    }
    for (const key of repointed) {
      const mv = moves.find((x) => x.key === key);
      if (!mv) throw new Error(`repointed: ${key} is not a key any migration moves`);
      if (!mv.target?.workflowId) throw new Error(`repointed: ${key}'s new flow could not be found or has no trigger`);
      const unmet = unmetRoutes(mv);
      if (unmet.length) throw new Error(`repointed: ${mv.target.name} does not implement ${unmet.join(', ')}, so ${key} cannot be pointed there`);
      wired.set(key, mv.target.workflowId);
    }
    for (const mv of moves) {
      mv.done = Boolean(mv.target?.workflowId) && wired.get(mv.key) === mv.target.workflowId;
      mv.asserted = repointed.includes(mv.key);
    }
    return { wired, moves };
  }

  /* Every flow this account can see, with its definition and the workflow id its trigger answers. */
  /* Each flow is read twice (definition, then trigger). With hundreds of flows that is the long
     part of a run, so up to six flows are read at once and progress is shown every 50. */
  async function readFlows(list, quiet) {
    const flows = new Array(list.length);
    let next = 0, done = 0;
    const PARALLEL = io.parallelReads ?? 6;
    const worker = async () => {
      while (next < list.length) {
        const i = next++, f = list[i];
        try {
          const full = await getFlow(f.name);
          flows[i] = { id: f.name, name: full.properties?.displayName || f.properties?.displayName || f.name, full, workflowId: await workflowIdOf(full) };
        } catch (e) { flows[i] = { id: f.name, name: f.properties?.displayName || f.name, full: null, error: e.message }; }
        done += 1;
        if (!quiet || list.length > 50) { if (done % 50 === 0 || done === list.length) log(`%c  read ${done} of ${list.length} flows`, GREY); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, list.length) }, worker));
    return flows;
  }

  /* keysOnly: the work concerns endpoint keys alone, so the flows the repository already attributes
     to a key (DATA.knownFlowIds) are read directly. A workflow id is only learnt by reading a flow's
     trigger, so if any wired key is not answered by one of them, every other flow is read too. */
  async function readAllFlows(quiet, { keysOnly = false } = {}) {
    const listed = await listFlows();
    const known = new Set((DATA.knownFlowIds || []).map((x) => x.toLowerCase()));
    let flows;
    if (keysOnly && known.size) {
      const first = listed.filter((f) => known.has(String(f.name).toLowerCase()));
      log(`%c  reading the ${first.length} flow(s) the repository attributes to endpoint keys, not all ${listed.length}`, GREY);
      flows = await readFlows(first, quiet);
      const answered = new Set(flows.map((f) => f.workflowId).filter(Boolean));
      const orphan = [...new Set(DATA.keys.map((k) => k.workflowId).filter(Boolean))].filter((w) => !answered.has(w));
      if (orphan.length) {
        say(`  ${orphan.length} wired workflow id(s) not answered by those flows; reading the other ${listed.length - first.length} to find them`, AMBER);
        flows = flows.concat(await readFlows(listed.filter((f) => !known.has(String(f.name).toLowerCase())), quiet));
      }
    } else {
      flows = await readFlows(listed, quiet);
    }
    const unread = flows.filter((f) => f.error);
    if (unread.length) say(`  ${unread.length} flow(s) could not be read (${unread[0].error}); a package whose flow is among them shows as not found. Run the command again.`, AMBER);
    return { flows, unread };
  }

  async function plan({ quiet = false, repointed = [], only = null, keysOnly = false } = {}) {
    await connect();
    if (!quiet) say(`Estate orchestrator ${DATA.version} — planning (reads only)`, 'font-weight:bold;font-size:14px');
    /* A package found by its contents (no contract keys) needs every flow read; one found by its
       key needs only the flows attributed to keys. */
    const byContent = (p) => !(p.keys && p.keys.length);
    const narrow = keysOnly || Boolean(only && only.length && DATA.packages.filter((p) => only.includes(p.name)).every((p) => !byContent(p)));
    const { flows, unread } = await readAllFlows(quiet, { keysOnly: narrow });
    const byWorkflow = new Map();
    for (const f of flows) if (f.workflowId) (byWorkflow.get(f.workflowId) || byWorkflow.set(f.workflowId, []).get(f.workflowId)).push(f);
    const { wired, moves } = wiringFor(flows, repointed);
    const servedBy = (wid) => [...wired].filter(([, w]) => w === wid).map(([k]) => k);
    const pendingFor = (key) => moves.find((m) => m.key === key && !m.done) || null;

    const rows = [];
    for (const p of DATA.packages) {
      const row = { package: p.name, flow: '', flowId: '', status: '', reason: '', change: '', live: true, p };
      rows.push(row);
      let target = null;
      if (p.keys?.length) {
        const staging = p.keys.map(pendingFor).find((m) => m && m.package === p.name) || null;
        if (staging) {
          /* This package's key is moving to its own flow: install there, where nothing calls it yet. */
          if (!staging.target) { row.status = 'BLOCKED'; row.reason = `its own flow ${staging.flowName} (${staging.flowId.slice(0, 8)}…) is not among the flows you own; share it with this account`; continue; }
          target = staging.target; row.live = false;
          const foreign = target.workflowId ? servedBy(target.workflowId) : [];
          if (foreign.length) { row.flow = target.name; row.flowId = target.id; row.status = 'BLOCKED'; row.reason = `${target.name} is already called for ${foreign.join(', ')}, so it cannot be staged into`; continue; }
        } else {
          const wids = [...new Set(p.keys.map((k) => wired.get(k)).filter(Boolean))];
          if (wids.length !== 1) { row.status = 'BLOCKED'; row.reason = `its contract keys ${p.keys.join(', ')} are not wired to one workflow`; continue; }
          const found = byWorkflow.get(wids[0]) || [];
          if (!found.length) { row.status = 'BLOCKED'; row.reason = `no flow you own answers workflow ${wids[0].slice(0, 8)}… (the one the platform calls); share it with this account or apply it in the designer${unread.length ? ` — or it is among the ${unread.length} flow(s) that could not be read` : ''}`; continue; }
          if (found.length > 1) { row.status = 'BLOCKED'; row.reason = `${found.length} flows answer workflow ${wids[0].slice(0, 8)}…`; continue; }
          target = found[0];
          const foreign = servedBy(wids[0]).filter((k) => !p.keys.includes(k));
          if (foreign.length) {
            row.flow = target.name; row.flowId = target.id; row.status = 'BLOCKED';
            const moving = foreign.filter((k) => pendingFor(k));
            row.reason = moving.length === foreign.length
              ? `this flow still serves ${foreign.join(', ')}; it is free once ${moving.length > 1 ? 'they are' : 'that key is'} repointed (${CMD.repoint}, then ${CMD.applyRepointed(moving)})`
              : `this flow also serves ${foreign.join(', ')}, which ${p.name} does not implement; replacing its body would take ${foreign.length > 1 ? 'those endpoints' : 'that endpoint'} down`;
            continue;
          }
        }
      } else if (p.fingerprint && narrow) {
        row.status = 'NOT_READ'; row.reason = 'found by its contents, which needs every flow read; run plan without --only to see it'; continue;
      } else if (p.fingerprint) {
        const found = flows.filter((f) => f.full && Object.prototype.hasOwnProperty.call(f.full.properties?.definition?.actions || {}, p.fingerprint.topLevel)
          && (!p.fingerprint.contains || [].concat(p.fingerprint.contains).some((c) => containsAction(f.full.properties.definition.actions, c))));
        if (!found.length) { row.status = 'BLOCKED'; row.reason = `no flow you own holds ${p.fingerprint.topLevel}${p.fingerprint.contains ? ` with ${[].concat(p.fingerprint.contains).join(' or ')}` : ''}; ${p.whenMissing || 'build it once in the designer, then run this again'}`; continue; }
        if (found.length > 1) { row.status = 'BLOCKED'; row.reason = `${found.length} flows hold ${p.fingerprint.topLevel}: ${found.map((f) => f.name).join(', ')}`; continue; }
        target = found[0];
      }
      row.flow = target.name; row.flowId = target.id; row.target = target;
      if (!target.full) { row.status = 'BLOCKED'; row.reason = `could not read the flow: ${target.error}`; continue; }
      const cur = target.full.properties;
      const res = installPackage({
        definition: cur.definition, connectionReferences: cur.connectionReferences, pkg: p.pkg,
        declarations: p.declarations, mode: p.mode, method: p.method, triggers: p.triggers, hostActions: p.hostActions || [],
      });
      if (res.problems.length) { row.status = 'BLOCKED'; row.reason = `does not install cleanly: ${res.problems.slice(0, 3).join('; ')}${res.problems.length > 3 ? ` (+${res.problems.length - 3})` : ''}`; continue; }
      row.desired = res;
      const current = { actions: cur.definition?.actions || {}, triggers: cur.definition?.triggers || {}, refs: Object.keys(cur.connectionReferences || {}).sort() };
      const wanted = { actions: res.definition.actions, triggers: res.definition.triggers, refs: Object.keys(res.connectionReferences).sort() };
      /* The service adds inputs.authentication to every connector action it stores (seen on all
         seven portal flows and the staged OTP flow, 2026-09-27). That one field is not a change;
         every other difference is, including one inside an action's parameters. */
      const stored = { ...current, actions: withoutServiceAdded(current.actions, wanted.actions) };
      if (same(stored, wanted)) {
        row.status = row.live ? 'UP_TO_DATE' : 'STAGED';
        row.reason = row.live ? '' : 'installed in its own flow; nothing calls it until the key is repointed';
        continue;
      }
      const diff = `first difference: ${firstDiff({ actions: stored.actions, triggers: stored.triggers }, { actions: wanted.actions, triggers: wanted.triggers })}`;
      row.status = 'WILL_UPDATE';
      const bits = [`${Object.keys(current.actions).length} → ${Object.keys(wanted.actions).length} top-level actions; ${diff}`];
      if (!row.live) bits.unshift('staged into its own flow, not yet called');
      if (res.stats.triggerChanged) bits.push('trigger updated');
      if (res.stats.referencesAdded.length) bits.push(`adds connection ${res.stats.referencesAdded.join(', ')}`);
      row.change = bits.join('; ');
    }

    /* Two packages, one flow: neither may write. */
    const claims = new Map();
    for (const r of rows) if (r.flowId && r.status !== 'BLOCKED') (claims.get(r.flowId) || claims.set(r.flowId, []).get(r.flowId)).push(r);
    for (const [, rs] of claims) if (rs.length > 1) for (const r of rs) { r.status = 'BLOCKED'; r.reason = `${rs.map((x) => x.package).join(' and ')} resolve to the same flow`; }

    /* The repoints: each ready once its new flow carries what the key needs. */
    const repoints = moves.map((mv) => {
      const out = { key: mv.key, to: mv.target ? mv.target.name : (mv.flowName || mv.toKey), status: '', detail: '', mv };
      if (mv.done) { out.status = 'DONE'; out.detail = mv.asserted ? 'you stated the platform now calls this flow' : 'the register already wires this key here'; return out; }
      if (!mv.target) { out.status = 'BLOCKED'; out.detail = mv.flowId ? `${mv.flowName} (${mv.flowId.slice(0, 8)}…) is not among the flows you own` : `no single flow you own serves ${mv.toKey}`; return out; }
      if (!mv.target.workflowId) { out.status = 'BLOCKED'; out.detail = `${mv.target.name} has no HTTP trigger`; return out; }
      const unmet = unmetRoutes(mv);
      if (unmet.length) {
        const all = [].concat(mv.requires).length;
        out.status = 'BLOCKED';
        out.detail = all === 1 ? `${mv.target.name} does not implement "${unmet[0]}", so ${mv.key} cannot move there`
          : `${mv.target.name} implements ${all - unmet.length} of the ${all} routes ${mv.key} needs (missing: ${unmet.join(', ')}), so ${mv.key} cannot move there`;
        return out;
      }
      if (mv.package) {
        const pr = rows.find((r) => r.package === mv.package);
        if (pr?.status !== 'STAGED') { out.status = 'AFTER_APPLY'; out.detail = `${CMD.apply} first stages ${mv.package} into ${mv.target.name}`; return out; }
      }
      out.status = 'READY'; out.detail = `${CMD.repoint} copies the new value for your values file`;
      return out;
    });

    holdDependents(rows);
    lastPlan = { at: io.now(), rows, repoints, repointed, wired };
    if (!quiet) printPlan(rows, 'Plan', repoints);
    return lastPlan;
  }

  /* A package waits while any prerequisite is neither current nor about to be written, or is
     staged in a flow the platform does not call yet. Repeated until nothing changes, because
     holding one package can hold the next in its chain. */
  function holdDependents(rows) {
    const byName = new Map(rows.map((r) => [r.package, r]));
    const fine = (d) => d && ['UP_TO_DATE', 'WILL_UPDATE', 'APPLIED'].includes(d.status) && d.live !== false;
    for (let changed = true; changed;) {
      changed = false;
      for (const r of rows) {
        if (r.status !== 'WILL_UPDATE' || r.live === false) continue; // staging touches nothing the platform calls
        const bad = (r.p.dependsOn || []).filter((d) => !fine(byName.get(d)));
        if (bad.length) { r.status = 'HELD'; r.reason = `waits for ${bad.join(', ')} to be live (${r.p.dependencyReason || 'runbook §0.4'})`; changed = true; }
      }
    }
  }

  function printPlan(rows, title, repoints = []) {
    say(title, 'font-weight:bold');
    io.table(rows.map((r) => ({ package: r.package, flow: r.flow, status: r.status, detail: [r.reason, r.change].filter(Boolean).join(' · ') })));
    const n = (s) => rows.filter((r) => r.status === s).length;
    log(`  ${n('WILL_UPDATE')} to update · ${n('UP_TO_DATE')} up to date · ${n('APPLIED')} applied · ${n('STAGED')} staged · ${n('HELD')} held · ${n('BLOCKED')} blocked · ${n('FAILED')} failed`);
    if (repoints.length) {
      say('Repoints (keys moving to their own flow)', 'font-weight:bold');
      io.table(repoints.map((r) => ({ key: r.key, to: r.to, status: r.status, detail: r.detail })));
    }
  }

  /* ───────────────────────────── applying ───────────────────────────── */

  const session = { applied: [] };

  async function apply({ only = null, repointed = [] } = {}) {
    const planned = await plan({ quiet: true, repointed, only });
    const { rows } = planned;
    if (only) for (const r of rows) if (!only.includes(r.package) && r.status === 'WILL_UPDATE') { r.status = 'SKIPPED'; r.reason = 'not in only[]'; }
    holdDependents(rows);
    const todo = rows.filter((r) => r.status === 'WILL_UPDATE');
    if (!todo.length) { printPlan(rows, 'Nothing to write', planned.repoints); return report(planned); }

    const backup = { takenUtc: io.now(), environment: DATA.environment, version: DATA.version, flows: {} };
    for (const r of todo) backup.flows[r.flowId] = { name: r.flow, properties: { definition: r.target.full.properties.definition, connectionReferences: r.target.full.properties.connectionReferences } };
    io.download(`estate-backup-${io.now().replace(/[:.]/g, '-')}.json`, backup);
    say(`Backup of ${todo.length} flow(s) downloaded before any write.`, GREEN);

    let stopped = false;
    for (const r of rows) {
      if (r.status !== 'WILL_UPDATE') continue;
      if (stopped) { r.status = 'NOT_RUN'; r.reason = 'the run stopped at an earlier failure'; continue; }
      const unmet = (r.live === false ? [] : r.p.dependsOn || []).filter((d) => { const x = rows.find((y) => y.package === d); return !x || !['UP_TO_DATE', 'APPLIED'].includes(x.status) || x.live === false; });
      if (unmet.length) { r.status = 'HELD'; r.reason = `waits for ${unmet.join(', ')} to be live`; continue; }
      say(`→ ${r.package} into ${r.flow}${r.live ? '' : ' (staged)'}`, 'font-weight:bold');
      const body = { properties: { definition: r.desired.definition, connectionReferences: r.desired.connectionReferences } };
      const w = await api.json(`/flows/${r.flowId}`, { method: 'PATCH', body: JSON.stringify(body) });
      if (!w.ok && w.network) say('  the connection dropped during the write; reading the flow back to see whether it landed', AMBER);
      if (!w.ok && !w.network) {
        r.status = 'FAILED'; r.reason = `write refused (${w.status}): ${String(w.body?.error?.message || w.body?.raw || '').slice(0, 2000)}`;
        say(`  ${r.reason}`, RED); stopped = true; continue;
      }
      const after = await getFlow(r.flowId).catch(() => null);
      if (!after || skeleton(after.properties?.definition) !== skeleton(r.desired.definition)) {
        const back = await api.json(`/flows/${r.flowId}`, { method: 'PATCH', body: JSON.stringify({ properties: backup.flows[r.flowId].properties }) });
        r.status = 'FAILED'; r.reason = `${w.network ? 'the connection dropped and the write did not land' : 'read-back did not match what was written'}; ${back.ok ? 'restored from the backup' : `RESTORE FAILED (${back.status}) — restore from the downloaded backup`}`;
        say(`  ${r.reason}`, RED); stopped = true; continue;
      }
      r.status = r.live ? 'APPLIED' : 'STAGED';
      r.change = r.live ? r.change : 'installed in its own flow; nothing calls it until the key is repointed';
      if (!same(after.properties.definition.actions, r.desired.definition.actions)) r.reason = 'the service re-serialised some fields (structure and values verified)';
      session.applied.push({ flowId: r.flowId, flow: r.flow, package: r.package, properties: backup.flows[r.flowId].properties });
      say(`  ${r.live ? 'applied' : 'staged'} and verified`, GREEN);
    }
    /* Staging may have made a repoint ready. */
    for (const rp of planned.repoints) {
      if (rp.status === 'AFTER_APPLY' && rows.find((r) => r.package === rp.mv.package)?.status === 'STAGED') { rp.status = 'READY'; rp.detail = `${CMD.repoint} copies the new value for your values file`; }
    }
    printPlan(rows, stopped ? 'Stopped' : 'Done', planned.repoints);
    if (planned.repoints.some((r) => r.status === 'READY')) say(`Next: ${CMD.repoint}`, 'color:#268bd2;font-weight:bold');
    return report(planned);
  }

  /* Hand the operator the values-file lines for every READY repoint. The lines carry signed
     trigger URLs, so they go to the clipboard (or, if the page refuses it, one downloaded text
     file) and are never written to the console. */
  async function repoint() {
    const planned = await plan({ quiet: true, keysOnly: true });
    const ready = planned.repoints.filter((r) => r.status === 'READY');
    if (!ready.length) { printPlan(planned.rows, 'Nothing is ready to repoint', planned.repoints); return { keys: [] }; }
    const lines = [];
    for (const r of ready) {
      const url = await callbackOf(r.mv.target.full);
      if (!url) throw new Error(`could not read the trigger of ${r.mv.target.name}`);
      lines.push(`DGO_ENDPOINT_${r.key}=${url}`);
    }
    const text = `# ${ready.length} endpoint(s) moving to their own flow — generated ${io.now()}\n# Replace these keys in your values file, rebuild (npm run package -- --values <file>) and redeploy.\n${lines.join('\n')}\n`;
    let where = 'clipboard';
    try { await io.clipboard(text); } catch { io.downloadText('estate-repoint-values.txt', text); where = 'a downloaded file, estate-repoint-values.txt (delete it after use: it holds signed URLs)'; }
    say(`Copied ${ready.length} value(s) to ${where}: ${ready.map((r) => `${r.key} → ${r.to}`).join(', ')}`, GREEN);
    log('  1. Replace those keys in your values file (it holds credentials: keep it where it already lives).');
    log('  2. npm run package -- --values <your file>, redeploy the platform, and sign in once to confirm.');
    log(`  3. ${CMD.applyRepointed(ready.map((r) => r.key))}`);
    return { keys: ready.map((r) => r.key) };
  }

  /* The values file `npm run package -- --values <file>` reads: one line per endpoint key, the
     signed trigger address of the flow the register wires it to (or, with `repointed`, the flow
     it moves to). The addresses are credentials: they go to a file (0600 on the command line),
     never to the screen. A key whose flow this account cannot see is listed and left out. */
  async function values({ repointed = [] } = {}) {
    await connect();
    say(`Estate orchestrator ${DATA.version} — endpoint values (reads only)`, 'font-weight:bold;font-size:14px');
    const { flows } = await readAllFlows(false, { keysOnly: true });
    const { wired } = wiringFor(flows, repointed);
    const rows = [], lines = [];
    for (const surface of DATA.surfaces || []) {
      for (const key of surface.keys) {
        const wid = wired.get(key);
        const found = wid ? flows.filter((f) => f.workflowId === wid) : [];
        let status = 'MISSING', detail = '';
        if (!wid) detail = 'the register has no workflow id for this key';
        else if (!found.length) detail = `no flow this account can see answers workflow ${wid.slice(0, 8)}…; share that flow with this account`;
        else if (found.length > 1) detail = `${found.length} flows answer workflow ${wid.slice(0, 8)}…`;
        else {
          const f = found[0], at = `${f.name} (${f.id})`;
          const url = await callbackOf(f.full).catch(() => null);
          if (url && /[?&]sig=/.test(url)) { lines.push(`${surface.prefix}${key}=${url}`); status = 'WRITTEN'; detail = at; }
          else if (url) detail = `${at}: its trigger address carries no signature: the trigger requires a Microsoft sign-in (authentication other than "Anyone"), so there is no signed address to put in a package. For SCAN_INTAKE that setting is required (docs/folio-Master-Flows-and-Endpoints/provisioning/ENDPOINT_REGISTER.md §5, ITEM-59)`;
          else detail = `${at}: the service refused to give its trigger address`;
        }
        rows.push({ surface: surface.id, key, status, detail });
      }
    }
    io.table(rows);
    const missing = rows.filter((r) => r.status !== 'WRITTEN');
    const text = `# Endpoint values for npm run package -- --values <this file>\n# Generated ${io.now()} from the live flows (${lines.length} of ${rows.length} keys).\n# These are signed trigger addresses: keep this file private and delete it after the build.\n${lines.join('\n')}\n`;
    io.downloadText('dgo-values.txt', text);
    say(`${lines.length} of ${rows.length} endpoint value(s) written${missing.length ? `; ${missing.length} missing (see the table)` : ''}.`, missing.length ? AMBER : GREEN);
    return { written: lines.length, missing: missing.map((r) => r.key) };
  }

  /* Read-only: why a run failed. Lists a flow's recent runs, then for one run (the one named, or
     else the newest that failed) every action that failed, with the service's error code and
     message. For a connector action the reason is in its outputs, which the service keeps behind
     a signed link: the link is fetched and never shown, and only the message fields are kept. */
  async function run({ flowId, runId = null, last = 10 } = {}) {
    if (!/^[0-9a-f-]{36}$/i.test(String(flowId || ''))) throw new Error('run needs the flow id (the 36-character id, for example internal_name in a flow run record).');
    await connect();
    const list = await api.json(`/flows/${flowId}/runs?$top=${Math.max(1, Math.min(50, Number(last) || 10))}`);
    if (!list.ok) throw new Error(`Reading the runs of ${flowId} was refused: ${list.status} ${String(list.body?.error?.message || '').slice(0, 300)}`);
    const runs = (list.body?.value || []).map((r) => ({ run: r.name, status: r.properties?.status || '', started: r.properties?.startTime || '', code: r.properties?.code || '' }));
    io.table(runs);
    const target = runId || (runs.find((r) => r.status === 'Failed') || {}).run;
    if (!target) { say('No failed run among these.', GREEN); return { runs, failed: [] }; }
    let all;
    const acts = await api.json(`/flows/${flowId}/runs/${target}/actions`);
    if (acts.ok) all = acts.body?.value || [];
    else {
      /* The other form the Power Automate site reads: the run with its actions expanded. */
      const one = await api.json(`/flows/${flowId}/runs/${target}?$expand=properties/actions`);
      if (!one.ok) throw new Error(`Reading the actions of run ${target} was refused: ${acts.status} ${String(acts.body?.error?.message || '').slice(0, 200)}; ${one.status} ${String(one.body?.error?.message || '').slice(0, 200)}`);
      all = Object.entries(one.body?.properties?.actions || {}).map(([name, properties]) => ({ name, properties }));
    }
    const bad = all.filter((a) => ['Failed', 'TimedOut'].includes(a.properties?.status));
    /* A scope or condition fails because something inside it failed ("ActionFailed"); the actions
       that failed on their own account are the cause. */
    const cause = bad.filter((a) => a.properties?.error?.code !== 'ActionFailed');
    const rows = [];
    for (const a of (cause.length ? cause : bad)) {
      const pr = a.properties || {};
      let detail = String(pr.error?.message || '').slice(0, 500);
      let http = '';
      const link = pr.outputsLink?.uri;
      if (link) {
        try {
          const res = await io.fetch(link, {});
          const out = JSON.parse(await res.text());
          http = out?.statusCode ?? '';
          const b = out?.body || {};
          const msg = b.message || b.error?.message || b['odata.error']?.message?.value || '';
          if (msg) detail = String(msg).slice(0, 500);
        } catch { /* the outputs could not be read; the service's own message stands */ }
      }
      rows.push({ action: a.name, status: pr.status, code: pr.code || pr.error?.code || '', http, detail });
    }
    say(`Run ${target}: ${all.length} action(s), ${bad.length} failed; ${rows.length} failed on their own account`, rows.length ? AMBER : GREEN);
    io.table(rows);
    return { runs, runId: target, failed: rows };
  }

  /* Put back every flow a downloaded backup holds (estate-backup-*.json). Used by the command-line
     route, where the process that wrote the flows has ended; each flow is read back afterwards. */
  async function restore(backup) {
    if (!backup || typeof backup !== 'object' || !backup.flows) throw new Error('That is not an estate backup file (it has no "flows").');
    if (backup.environment && backup.environment !== DATA.environment) throw new Error(`The backup is for environment ${backup.environment}, not ${DATA.environment}.`);
    await connect();
    const rows = [];
    for (const [flowId, f] of Object.entries(backup.flows)) {
      const want = f?.properties;
      if (!want?.definition) { rows.push({ flow: f?.name || flowId, status: 'SKIPPED', detail: 'no definition in the backup' }); continue; }
      const w = await api.json(`/flows/${flowId}`, { method: 'PATCH', body: JSON.stringify({ properties: { definition: want.definition, connectionReferences: want.connectionReferences } }) });
      const after = (w.ok || w.network) ? await getFlow(flowId).catch(() => null) : null;
      const back = after && skeleton(after.properties?.definition) === skeleton(want.definition);
      rows.push({ flow: f.name || flowId, status: back ? 'RESTORED' : 'FAILED', detail: back ? 'read back and confirmed' : `the service answered ${w.status}: ${String(w.body?.error?.message || '').slice(0, 160)}` });
    }
    say('Restore', 'font-weight:bold');
    io.table(rows);
    return rows;
  }

  async function rollback() {
    await connect();
    for (const a of session.applied.slice().reverse()) {
      const w = await api.json(`/flows/${a.flowId}`, { method: 'PATCH', body: JSON.stringify({ properties: a.properties }) });
      say(`${w.ok ? 'restored' : `RESTORE FAILED (${w.status})`}: ${a.flow}`, w.ok ? GREEN : RED);
    }
    session.applied = [];
  }

  /* The run report carries workflow ids and flow names, never a URL. Its `wiring` is what the
     endpoint register must say once the repoints are made. */
  function report(planned) {
    const { rows, repoints = [], repointed = [] } = planned;
    const out = {
      schema: 'dgo-estate-apply-report/v1', version: DATA.version, environment: DATA.environment, finishedUtc: io.now(),
      rows: rows.map((r) => ({ package: r.package, flow: r.flow || null, flowId: r.flowId || null, status: r.status, detail: [r.reason, r.change].filter(Boolean).join(' · ') || null })),
      repoints: repoints.map((r) => ({ key: r.key, to: r.to, flowId: r.mv.target?.id || null, workflowId: r.mv.target?.workflowId || null, status: r.status, detail: r.detail })),
      repointedAsserted: repointed,
    };
    io.download(`estate-apply-report-${io.now().replace(/[:.]/g, '-')}.json`, out);
    return out;
  }

  /* ───────────────────────── SharePoint reference data ───────────────────────── */

  async function sp(site, path, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    return request(`${site}${path}`, { credentials: 'include', ...init, headers: { Accept: 'application/json;odata=nometadata', ...(init.headers || {}) } }, { retry: method === 'GET' });
  }
  async function spAll(site, listId, select) {
    const out = [];
    let path = `/_api/web/lists(guid'${listId}')/items?$select=${select}&$top=5000`;
    for (let guard = 0; path && guard < 50; guard++) {
      const r = await sp(site, path);
      if (!r.ok) throw new Error(`reading list ${listId} returned ${r.status}`);
      out.push(...(r.body?.value || []));
      const next = r.body?.['odata.nextLink'] || r.body?.['@odata.nextLink'];
      path = next ? next.slice(next.indexOf('/_api/')) : null;
    }
    return out;
  }
  const lc = (v) => String(v ?? '').trim().toLowerCase();

  async function dataPlan({ quiet = false } = {}) {
    const d = DATA.data;
    if (!quiet) say(`Estate orchestrator ${DATA.version} — reference data plan (reads only)`, 'font-weight:bold;font-size:14px');
    const rows = [];
    const units = await spAll(d.departments.site, d.departments.listId, 'Id,Title,field_1');
    const have = new Set(units.map((u) => lc(u.field_1)));
    for (const u of d.departments.units) {
      rows.push({ kind: 'department', item: `${u.field_1} — ${u.Title}`, status: have.has(lc(u.field_1)) ? 'UP_TO_DATE' : 'WILL_ADD', row: u });
    }
    const cats = await spAll(d.categories.site, d.categories.listId, 'Id,Title,field_2,field_4');
    for (const m of d.categories.moves) {
      const hit = cats.filter((c) => lc(c.Title) === lc(m.title) && lc(c.field_2) === lc(m.subcategory));
      if (!hit.length) rows.push({ kind: 'category', item: `${m.title} / ${m.subcategory}`, status: 'BLOCKED', reason: 'no such row in the list' });
      else for (const c of hit) rows.push({ kind: 'category', item: `${m.title} / ${m.subcategory}`, status: lc(c.field_4) === lc(m.to) ? 'UP_TO_DATE' : 'WILL_UPDATE', reason: `${c.field_4 || '(blank)'} → ${m.to}`, id: c.Id, to: m.to });
    }
    if (!quiet) { io.table(rows.map((r) => ({ kind: r.kind, item: r.item, status: r.status, detail: r.reason || '' }))); }
    return rows;
  }

  async function digest(site) {
    const r = await sp(site, '/_api/contextinfo', { method: 'POST' });
    const v = r.body?.FormDigestValue || r.body?.GetContextWebInformation?.FormDigestValue;
    if (!v) throw new Error(`no request digest from ${site} (${r.status}); you need edit rights on that site`);
    return v;
  }

  async function dataApply() {
    const d = DATA.data;
    const rows = await dataPlan({ quiet: true });
    for (const r of rows.filter((x) => x.status === 'WILL_ADD')) {
      const site = d.departments.site;
      const body = Object.fromEntries(Object.entries(r.row).filter(([, v]) => v !== '' && v != null));
      const w = await sp(site, `/_api/web/lists(guid'${d.departments.listId}')/items`, {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json;odata=nometadata', 'X-RequestDigest': await digest(site) },
      });
      r.status = w.ok ? 'ADDED' : 'FAILED'; if (!w.ok) r.reason = `${w.status} ${String(w.body?.['odata.error']?.message?.value || w.body?.raw || '').slice(0, 160)}`;
    }
    for (const r of rows.filter((x) => x.status === 'WILL_UPDATE')) {
      const site = d.categories.site;
      const w = await sp(site, `/_api/web/lists(guid'${d.categories.listId}')/items(${r.id})`, {
        method: 'POST', body: JSON.stringify({ field_4: r.to }),
        headers: { 'Content-Type': 'application/json;odata=nometadata', 'X-RequestDigest': await digest(site), 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' },
      });
      r.status = w.ok ? 'UPDATED' : 'FAILED'; if (!w.ok) r.reason = `${w.status}`;
    }
    const check = await dataPlan({ quiet: true });
    const open = check.filter((x) => x.status !== 'UP_TO_DATE');
    io.table(rows.map((r) => ({ kind: r.kind, item: r.item, status: r.status, detail: r.reason || '' })));
    say(open.length ? `${open.length} item(s) still differ after the write — see the table.` : 'Reference data verified: every item matches.', open.length ? RED : GREEN);
    return { rows, verified: !open.length };
  }

  return { plan, apply, repoint, rollback, restore, values, run, diagnose, useToken, data: { plan: dataPlan, apply: dataApply }, _internals: { skeleton, canon } };
}
