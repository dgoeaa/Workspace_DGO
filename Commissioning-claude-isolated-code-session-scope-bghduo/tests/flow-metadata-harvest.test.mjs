#!/usr/bin/env node
/**
 * `scripts/harvest-flow-metadata.browser.js`, exercised against a simulated portal.
 *
 * WHY THE STUB IS SHAPED THE WAY IT IS
 * tests/otp-verify-browser-patch.test.mjs records the lesson this suite inherits: a stub that
 * answers where the code looks can only ever confirm the code. Two earlier browser scripts in
 * this estate passed their tests and then failed on the tenant, both times because the stub
 * had been built to agree with the script's assumptions about hostnames and paths.
 *
 * So this stub serves the flow API on unitedkingdom.api.flow.microsoft.com — a REGIONAL host
 * the script does not contain, and must therefore learn by watching the portal — and asserts
 * separately that the global host is never contacted. If the script starts constructing a
 * hostname again, `it never contacts a host it was not shown` fails.
 *
 * The other half of the suite is the shaping: chunking, CSV escaping and redaction are
 * exercised through `flowHarvest.helpers` directly. Inferring them from console output would
 * test the log rather than the rule.
 *
 * Run: node tests/flow-metadata-harvest.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = 'scripts/harvest-flow-metadata.browser.js';
const source = readFileSync(path.join(ROOT, SCRIPT), 'utf8');

/* The tenant is NOT on the global host. Nothing in the script names this one. */
const PS_HOST = 'https://unitedkingdom.api.flow.microsoft.com';
const GLOBAL_HOST = 'api.flow.microsoft.com';
const DV_HOST = 'https://org4e1fbc9c.api.crm4.dynamics.com';
const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const PS_PATH = `/providers/Microsoft.ProcessSimple/environments/${ENV}/flows`;

/* The SECOND shape, and the reason this suite is parametrised at all. This estate's own
   tenant serves its flow API per-environment by HOSTNAME, on a flat path, and never calls a
   ProcessSimple URL: the environment appears in the host's first label instead of in a path
   segment. A detector written for the first shape alone watched 120 authenticated endpoints
   here and still reported that it had seen no flow API.

   Nothing in the script names either host or either path. Both must be learned. */
const FLAT_HOST = 'https://defaultca6a4b3f912349bcbcb927085ebbf1.a1.environment.api.powerplatform.com';
const FLAT_PATH = '/powerautomate/flows';
const FLAT_ENV = 'defaultca6a4b3f912349bcbcb927085ebbf1';
const TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.PRETEND_PAYLOAD.DO_NOT_PRINT';

const FLOW_PS = 'aa662769f13a4666bfadf3039cd8d247';
const FLOW_DV = 'bb662769f13a4666bfadf3039cd8d248';
const FLOW_429 = 'cc662769f13a4666bfadf3039cd8d249';

/* Assembled, and deliberately shorter than the 20 characters tests/check-secrets.mjs treats as
   a signature, so this file cannot itself trip the leak ratchet while still being long enough
   (8+) for the script's redaction to fire. */
const SIG = ['s', 'i', 'g'].join('');
const EMBEDDED_URL = `https://prod-00.example.logic.azure.com/workflows/x/triggers/manual/paths/invoke?api-version=2016-06-01&${SIG}=ABCDEFGHIJKL`;

/* An emoji in a display name is all it takes to put an astral character in the definition. */
const EMOJI = '\u{1F600}';

const definitionFor = (triggerName) => ({
  $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
  contentVersion: '1.0.0.0',
  triggers: {
    /* NOT named "manual". A script that matches on the name misses this entirely. */
    [triggerName]: { type: 'Request', kind: 'Http', inputs: { method: 'POST', schema: {} } },
    Recurrence_unused: { type: 'Recurrence', recurrence: { frequency: 'Day', interval: 1 } },
  },
  actions: {
    Compose_note: { type: 'Compose', inputs: `notify ${EMOJI} then call ${EMBEDDED_URL}` },
    Respond: { type: 'Response', inputs: { statusCode: 200 } },
  },
});

const psFlow = (id, triggerName) => ({
  id: `/providers/Microsoft.ProcessSimple/environments/${ENV}/flows/${id}`,
  name: id,
  type: 'Microsoft.ProcessSimple/environments/flows',
  properties: {
    displayName: `Harvest target ${EMOJI}`,
    state: 'Started',
    createdTime: '2026-01-01T00:00:00Z',
    lastModifiedTime: '2026-02-01T00:00:00Z',
    creator: { objectId: 'obj-1', tenantId: 'ten-1' },
    definition: definitionFor(triggerName),
  },
});

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};
const section = (s) => console.log(`\n${s}`);

function harness({ throttleOnce = false, host = PS_HOST, basePath = PS_PATH } = {}) {
  const API_HOST = host;
  const API_PATH = basePath;
  const lines = [];
  const calls = [];
  const downloads = [];
  let throttled = false;

  /* A virtual clock, advanced by whatever each timer was asked to wait for. It makes the
     180-second portal wait and the spacing between downloads instant and deterministic,
     without the suite depending on wall-clock timing. */
  let clock = Date.UTC(2026, 8, 11);
  class FakeDate extends Date {
    constructor(...a) { if (!a.length) super(clock); else super(...a); }
    static now() { return clock; }
  }
  const fakeSetTimeout = (fn, ms = 0) => { clock += Number(ms) || 0; return setImmediate(fn); };

  const mk = (status, payload, headers = {}) => {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
      text: async () => text,
    };
  };

  const fakeFetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    calls.push({ url: raw, method, headers: init.headers || {}, credentials: init.credentials });
    const u = new URL(raw);

    if (u.origin === API_HOST) {
      if (u.pathname === API_PATH) {
        return mk(200, { value: [{ name: FLOW_PS }, { name: FLOW_DV }, { name: FLOW_429 }] });
      }
      if (u.pathname === `${API_PATH}/${FLOW_PS}`) return mk(200, psFlow(FLOW_PS, 'When_a_HTTP_request_is_received'));
      if (u.pathname === `${API_PATH}/${FLOW_429}`) {
        if (throttleOnce && !throttled) { throttled = true; return mk(429, { error: { message: 'too many' } }, { 'retry-after': '7' }); }
        return mk(200, psFlow(FLOW_429, 'manual'));
      }
      /* The solution-aware flow is simply not at the flow API's path. */
      if (u.pathname === `${API_PATH}/${FLOW_DV}`) return mk(404, { error: { message: 'not found' } });
      if (u.pathname.endsWith('/permissions')) {
        return mk(200, { value: [{ properties: { roleName: 'Owner', principal: { id: 'p1', type: 'User', displayName: 'A Person', email: 'a@example.com' } } }] });
      }
      if (u.pathname.endsWith('/listCallbackUrl')) return mk(200, { value: EMBEDDED_URL });
      return mk(404, { error: { message: 'no route' } });
    }

    if (u.origin === DV_HOST && u.pathname === `/api/data/v9.2/workflows(${FLOW_DV})`) {
      return mk(200, {
        workflowid: FLOW_DV,
        name: 'Solution aware flow',
        statecode: 1,
        createdon: '2026-03-01T00:00:00Z',
        modifiedon: '2026-04-01T00:00:00Z',
        clientdata: JSON.stringify({ properties: { definition: definitionFor('manual'), connectionReferences: {} } }),
      });
    }
    return mk(404, { error: { message: 'nothing here' } });
  };

  const win = {};
  class SandboxURL extends URL {}
  SandboxURL.createObjectURL = (blob) => { const href = `blob:${downloads.length}`; downloads.push({ href, blob }); return href; };
  SandboxURL.revokeObjectURL = () => {};

  const sandbox = {
    window: win,
    location: { href: `https://make.powerautomate.com/environments/${ENV}/flows/${FLOW_PS}`, hostname: 'make.powerautomate.com' },
    fetch: fakeFetch,
    Headers, URL: SandboxURL, URLSearchParams,
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    document: {
      createElement: () => ({ click() {}, remove() {}, set href(v) { this._href = v; }, get href() { return this._href; } }),
      body: { appendChild: (el) => downloads.length && (downloads[downloads.length - 1].name = el.download) },
    },
    crypto: { randomUUID: () => 'run-0000' },
    Date: FakeDate,
    setTimeout: fakeSetTimeout,
    XMLHttpRequest: class {
      open(m, url) { this.__url = url; }
      setRequestHeader() {}
      addEventListener() {}
      send() {}
    },
    console: { log: (...a) => lines.push(a.map(String).join(' ')), error: (...a) => lines.push(a.map(String).join(' ')) },
  };
  sandbox.globalThis = sandbox;
  win.fetch = fakeFetch;
  win.crypto = sandbox.crypto;
  win.XMLHttpRequest = sandbox.XMLHttpRequest;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx);

  /** What the portal itself does on F5: an authenticated call to the flow API, plus noise. */
  const portalLoads = () => {
    ctx.window.fetch(`${DV_HOST}/api/data/v9.2/comments(artifactid='${FLOW_PS}')`, { headers: { authorization: TOKEN } });
    ctx.window.fetch(`${API_HOST}${API_PATH}/${FLOW_PS}?api-version=2016-11-01`, { headers: { authorization: TOKEN } });
  };

  const settle = async (marker) => {
    for (let i = 0; i < 4000 && !lines.some((l) => marker.test(l)); i++) await new Promise((r) => setImmediate(r));
  };

  const csvNamed = (suffix) => {
    const hit = downloads.find((d) => (d.name || '').endsWith(suffix));
    return hit ? hit.blob.text : null;
  };

  return { lines, calls, downloads, ctx, portalLoads, settle, csvNamed, API_HOST, API_PATH };
}

console.log('\nThe flow metadata harvester\n');

/* ── discovery ──────────────────────────────────────────────────────────────── */
section('  DISCOVERY — it is shown the host, it does not know it');
{
  const h = harness();
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED|Did not see it/);

  ok('it finds the flow API on a regional host that appears nowhere in the script',
     h.lines.some((l) => l.includes(`found the flow API on unitedkingdom.${GLOBAL_HOST.replace('api.', 'api.')}`))
     || h.lines.some((l) => l.includes('found the flow API on unitedkingdom.api.flow.microsoft.com')),
     h.lines.join('\n       '));
  ok('the script contains no hardcoded global flow host',
     !new RegExp(`['"\`]https://${GLOBAL_HOST.replace(/\./g, '\\.')}`).test(source));
  ok('it takes the environment segment verbatim from the observed URL',
     h.lines.some((l) => l.includes(`environment ${ENV}`)));
  ok('the read-only pass runs on paste, and fetches nothing',
     h.lines.some((l) => l.includes('NOTHING WAS FETCHED')) &&
     h.calls.filter((c) => c.url.startsWith(h.API_HOST)).length === 1,
     `calls: ${h.calls.map((c) => c.url).join(', ')}`);
}

{
  const h = harness();
  /* No portal traffic at all: it has been shown nothing. */
  await h.ctx.window.flowHarvest.dry(0);
  ok('shown nothing, it guesses nothing and sends no request',
     h.calls.length === 0 && h.lines.some((l) => l.includes('Did not see it')),
     `calls: ${h.calls.length}`);
}

/* ── the instruction ────────────────────────────────────────────────────────────
   This is a test of PROSE, which is unusual and deliberate. The hook lives in the
   page's JavaScript, so a reload destroys it: telling an operator to press F5 after
   pasting means the hook is gone before the traffic it waits for ever happens. No
   runtime test can catch that, because a vm context is never reloaded — the suite
   would keep passing while every real run timed out. So the instruction is pinned
   here instead. The portal is a single-page app; navigating inside it calls the API
   without a reload, which is what makes the whole approach work. */
section('  THE INSTRUCTION — it must not tell the operator to destroy the script');
{
  const instructions = source.slice(0, source.indexOf('*/'));
  /* Strip the negated forms FIRST, then look for what is left. Testing for "press F5" behind
     a negative lookahead is defeated the moment the warning appears anywhere in the block —
     which it does, by design — so the warning would mask the very instruction it warns about. */
  const withoutWarning = instructions.replace(/(DO NOT PRESS F5|Do NOT press F5)[^.]*\./gi, '');
  ok('no run instruction tells the operator to press F5',
     !/press F5|hit F5|reload the (flow )?page/i.test(withoutWarning),
     (withoutWarning.match(/.{0,60}(press F5|reload the).{0,60}/i) || [''])[0]);
  ok('it warns explicitly that a reload destroys the script',
     /DO NOT PRESS F5/.test(instructions) && /reload destroys this script/i.test(source));
  ok('it names the thing to do instead — navigate inside the portal',
     /NAVIGATE INSIDE THE PORTAL/i.test(instructions));
  ok('the waiting message says the same thing as the header, not the opposite',
     /Do NOT ' \+\n\s*'press F5|Do NOT press F5/.test(source) || /press F5: a reload destroys/.test(source),
     'the runtime prompt and the header disagree');
}

/* ── the harvest ────────────────────────────────────────────────────────────── */
section('  HARVEST');
const main = harness();
main.portalLoads();
await main.settle(/NOTHING WAS FETCHED/);
await main.ctx.window.flowHarvest.run();

{
  const h = main;
  ok('it never contacts a host it was not shown',
     !h.calls.some((c) => new URL(c.url).hostname === GLOBAL_HOST),
     h.calls.map((c) => new URL(c.url).hostname).join(', '));
  /* Either casing: the simulated portal traffic sends `authorization`, the script sends
     `Authorization`, and the point of the assertion is that no request to the API is
     unauthenticated — not which of the two spellings it used. */
  ok('every request to the API carries a bearer token',
     h.calls.filter((c) => c.url.startsWith(PS_HOST) || c.url.startsWith(DV_HOST))
       .every((c) => /^Bearer /.test(String(c.headers.Authorization || c.headers.authorization || ''))),
     'a request went out unauthenticated');
  /* Comments are stripped first: the header explains at length why cookie auth does NOT work
     here, and a check that reads prose would fail on the explanation itself. */
  ok('it never falls back to cookie auth',
     !h.calls.some((c) => c.credentials === 'include') &&
     !/credentials:\s*['"]include/.test(source.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('it discovers the flows rather than needing ids',
     h.calls.some((c) => c.url.includes(`${PS_PATH}?`)));

  const flows = h.csvNamed('_Flows.csv');
  ok('a flows dataset was written', !!flows, h.downloads.map((d) => d.name).join(', '));

  const row = (flows || '').split('\r\n').find((l) => l.includes(FLOW_PS)) || '';
  ok('the Request trigger is found by kind, not by the name "manual"',
     row.includes('When_a_HTTP_request_is_received'), row.slice(0, 300));
  ok('the workflow id comes from the flow itself, with no callback needed',
     row.includes(FLOW_PS), row.slice(0, 300));
  ok('the Recurrence trigger is not mistaken for the Request trigger',
     !row.includes('Recurrence_unused'), row.slice(0, 300));
}

/* ── credentials ────────────────────────────────────────────────────────────── */
section('  CREDENTIALS');
{
  const h = main;
  ok('no trigger URL is requested by default',
     !h.calls.some((c) => c.url.includes('listCallbackUrl')));

  const everything = [h.csvNamed('_Flows.csv'), h.csvNamed('_DefinitionParts.csv'),
                      h.csvNamed('_PropertiesParts.csv'), h.downloads.find((d) => (d.name || '').endsWith('.json'))?.blob.text]
    .filter(Boolean).join('\n');
  ok('a signature already embedded in a definition is redacted before it reaches a cell',
     everything.includes(`${SIG}=REDACTED`) && !everything.includes('ABCDEFGHIJKL'),
     'an unredacted signature reached the output');
  ok('nothing printed to the console carries a token or a signature',
     !h.lines.some((l) => /eyJ[A-Za-z0-9_-]{20}|ABCDEFGHIJKL/.test(l)),
     h.lines.filter((l) => /eyJ|ABCDEF/.test(l)).join('\n       '));
  ok('the script defaults to leaving trigger URLs alone',
     /INCLUDE_TRIGGER_URLS:\s*false/.test(source));
}

/* ── shaping ────────────────────────────────────────────────────────────────── */
section('  SHAPING — chunking, CSV and redaction, exercised directly');
{
  const H = main.ctx.window.flowHarvest.helpers;

  const text = `ab${EMOJI}cd`;
  const parts = H.chunks(text, 3);
  const lone = parts.some((p) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(p));
  ok('a chunk boundary never splits an astral character', !lone, JSON.stringify(parts));

  const enc = new TextEncoder(), dec = new TextDecoder();
  const throughUtf8 = parts.map((p) => dec.decode(enc.encode(p))).join('');
  ok('parts survive the UTF-8 round trip a Blob download performs',
     throughUtf8 === text, `${JSON.stringify(throughUtf8)} !== ${JSON.stringify(text)}`);
  ok('the parts still reassemble to the original', parts.join('') === text);
  ok('every part is within the requested size', parts.every((p) => p.length <= 3));

  let threw = false;
  try { H.chunks('abc', 0); } catch { threw = true; }
  ok('a chunk size of zero is refused rather than looping forever', threw);

  ok('a cell beginning @ is neutralised — a definition is full of @{...}',
     H.csvEscape('@{triggerBody()}').startsWith("'@"), H.csvEscape('@{triggerBody()}'));
  for (const lead of ['=', '+', '-']) {
    ok(`a cell beginning ${lead} is neutralised`, H.csvEscape(`${lead}SUM(A1)`).startsWith(`'${lead}`),
       H.csvEscape(`${lead}SUM(A1)`));
  }
  /* Both rules at once: the apostrophe goes on first, then the whole thing is quoted, so the
     cell Excel finally parses still begins with the apostrophe rather than the formula. */
  ok('a formula lead inside a value that also needs quoting is still neutralised',
     H.csvEscape('=HYPERLINK("x")') === '"\'=HYPERLINK(""x"")"', H.csvEscape('=HYPERLINK("x")'));
  ok('ordinary text is left alone', H.csvEscape('Started') === 'Started');
  ok('quotes and commas are still escaped the RFC 4180 way',
     H.csvEscape('a,"b"') === '"a,""b"""', H.csvEscape('a,"b"'));
  ok('the CSV carries a BOM so Excel reads it as UTF-8',
     H.toCsv([{ a: 1 }]).charCodeAt(0) === 0xfeff);
  ok('an empty dataset produces no file rather than an empty one', H.toCsv([]) === '');
}

/* ── resilience ─────────────────────────────────────────────────────────────── */
section('  RESILIENCE');
{
  const h = harness({ throttleOnce: true });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED/);
  const summary = await h.ctx.window.flowHarvest.run();

  ok('a 429 is a pace instruction, not a failure',
     summary.flowsFailed === 0 && h.lines.some((l) => l.includes('throttled (429)')),
     `failed=${summary.flowsFailed}`);
  ok('it honours Retry-After rather than its own backoff',
     h.lines.some((l) => l.includes('waiting 7s')), h.lines.filter((l) => l.includes('throttled')).join(' | '));
  ok('the throttled flow is retried and read',
     h.calls.filter((c) => c.url.includes(FLOW_429) && !c.url.includes('permissions')).length === 2);

  ok('a solution-aware flow absent from ProcessSimple is read from Dataverse',
     h.calls.some((c) => c.url.includes(`/api/data/v9.2/workflows(${FLOW_DV})`)));
  const flows = h.csvNamed('_Flows.csv') || '';
  ok('the flows dataset records which store each flow came from',
     flows.includes('dataverse') && flows.includes('processsimple'),
     flows.split('\r\n').slice(0, 2).join('\n       '));
  /* Asserted against the JSON bundle rather than the CSV: a definition contains commas and
     quotes, so picking a column out of a CSV row by splitting on commas would be reading the
     wrong field and calling it a pass.

     The two stores disagree about what `name` means. In Dataverse it is the DISPLAY name,
     so reading it as the id puts "Solution aware flow" into an id column. */
  const bundle = JSON.parse(h.downloads.find((d) => (d.name || '').endsWith('.json')).blob.text);
  const dvFlow = bundle.flows.find((f) => f.Storage === 'dataverse');
  ok('the Dataverse workflow id is read from workflowid, not from its display name',
     dvFlow && dvFlow.WorkflowId === FLOW_DV,
     `WorkflowId=${dvFlow && dvFlow.WorkflowId}`);
  ok('the Dataverse display name still lands in the display name column',
     dvFlow && dvFlow.DisplayName === 'Solution aware flow', `DisplayName=${dvFlow && dvFlow.DisplayName}`);
  const psRow = bundle.flows.find((f) => f.Storage === 'processsimple' && f.FlowName === FLOW_PS);
  ok('the ProcessSimple workflow id is the flow name, as the endpoint register keys on',
     psRow && psRow.WorkflowId === FLOW_PS, `WorkflowId=${psRow && psRow.WorkflowId}`);
  ok('all three flows are accounted for', summary.flowsDetailed === 3, `detailed=${summary.flowsDetailed}`);
  ok('the owners dataset is populated from the permissions route',
     (h.csvNamed('_Owners.csv') || '').includes('a@example.com'));
  ok('no errors dataset is written when nothing failed', h.csvNamed('_Errors.csv') === null);
}

/* ── the second tenant shape ─────────────────────────────────────────────────────
   The regression this section exists for is not hypothetical: it is what this estate's
   tenant did. The flow API there is per-environment by hostname on a flat path, the portal
   calls it constantly, and a detector that knew only the ProcessSimple shape reported "Did
   not see it" after watching 120 authenticated endpoints. Everything downstream — listing,
   reading, owners, callback URLs — was gated on the shape it had failed to recognise.

   So the whole harvest runs again here against that shape, on a host and a path the script
   does not contain, and the assertions are about what it CALLED, not about what it logged. */
section('  A SECOND SHAPE — a flat path, and the environment in the host');
{
  const h = harness({ host: FLAT_HOST, basePath: FLAT_PATH });
  h.portalLoads();
  await h.settle(/NOTHING WAS FETCHED|Did not see it/);

  ok('it finds a flow API whose path is not a ProcessSimple path',
     h.lines.some((l) => l.includes('found the flow API on ' + new URL(FLAT_HOST).hostname)),
     h.lines.join('\n       '));
  ok('it reads the environment from the host when the path does not name it',
     /* Anchored on the discovery line for the same reason as the path assertion below: this
        environment id is also the host's first label, so it appears in the failure dump. */
     h.lines.some((l) => /found the flow API on /.test(l) && l.includes(FLAT_ENV)),
     h.lines.filter((l) => /found the flow API/.test(l)).join('\n       ') || '(it found nothing)');
  ok('it says the environment was derived rather than observed in the path',
     h.lines.some((l) => /from the host/.test(l)),
     'an environment taken from a hostname must not be presented as a path segment');
  ok('it reports the observed path verbatim, and the shape that matched',
     /* Anchored on the dry-run's own line. Matching anywhere in the log passes on the
        "Did not see it" endpoint dump, which prints that path too — a green tick for the
        exact failure this section exists to catch. */
     h.lines.some((l) => /^api path\s/.test(l) && l.includes(FLAT_PATH) && l.includes('(powerautomate,')),
     h.lines.filter((l) => /^api /.test(l)).join('\n       ') || '(no api lines at all)');

  const summary = await h.ctx.window.flowHarvest.run();

  ok('it never builds a ProcessSimple path on a tenant that has none',
     !h.calls.some((c) => c.url.includes('/providers/Microsoft.ProcessSimple/')),
     h.calls.map((c) => c.url).find((u) => u.includes('ProcessSimple')) || '');
  ok('it never contacts the global flow host',
     !h.calls.some((c) => c.url.includes(GLOBAL_HOST)));
  ok('it lists and reads flows at the flat path it was shown',
     h.calls.some((c) => c.url === `${FLAT_HOST}${FLAT_PATH}?api-version=2016-11-01&$top=250`)
     && h.calls.some((c) => c.url.startsWith(`${FLAT_HOST}${FLAT_PATH}/${FLOW_PS}?`)),
     h.calls.map((c) => c.url).join('\n       '));
  ok('all three flows are read on this shape too', !!summary && summary.flowsDetailed === 3,
     summary ? `detailed=${summary.flowsDetailed}, failed=${summary.flowsFailed}` : 'run() returned nothing — discovery never happened');

  /* The gate that used to read `storage === 'processsimple'`. Written that way it skipped
     owners here and recorded "not attempted" — indistinguishable from being asked not to. */
  ok('owners are still read: the gate is "not Dataverse", not "is ProcessSimple"',
     (h.csvNamed('_Owners.csv') || '').includes('a@example.com'),
     (h.csvNamed('_Flows.csv') || '').slice(0, 200));

  const jsonDownload = h.downloads.find((d) => (d.name || '').endsWith('.json'));
  const bundle = jsonDownload ? JSON.parse(jsonDownload.blob.text) : null;
  ok('the flows dataset records the shape that answered',
     !!bundle && bundle.flows.some((f) => f.Storage === 'powerautomate')
     && bundle.flows.some((f) => f.Storage === 'dataverse'),
     bundle ? bundle.flows.map((f) => f.Storage).join(', ') : 'nothing was downloaded');
  ok('the run header records the host it was shown',
     !!bundle && bundle.run.apiHost === new URL(FLAT_HOST).hostname,
     bundle ? bundle.run.apiHost : 'nothing was downloaded');
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
