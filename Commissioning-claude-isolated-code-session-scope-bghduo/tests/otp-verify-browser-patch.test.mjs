#!/usr/bin/env node
/**
 * The OTP browser patcher, exercised against a simulated Power Automate portal.
 *
 * WHY THIS EXISTS, AND WHY IT IS ON ITS THIRD SHAPE
 * `scripts/apply-otp-verify-patch.browser.js` is pasted into a console against a live flow the
 * public portal depends on. Two earlier versions failed on the operator's tenant, and this suite
 * failed to predict either, for the same reason both times: the stub was built to agree with the
 * script.
 *
 *   v1 hardcoded api.flow.microsoft.com. The tenant is on
 *      <tenant>.<region>.tenant.api.powerplatform.com. The stub served the host the script
 *      expected, so it passed.
 *   v2 stopped assuming the host and instead constructed two candidate PATHS. Both were wrong —
 *      404 and 400 — because these flows live in Dataverse, not at a ProcessSimple path. The stub
 *      served one of the constructed paths, so it passed.
 *
 * A stub that answers where the code looks can only ever confirm the code. So this one answers at
 * a path the script has never heard of, and the script has to find it by reading what comes back.
 * Nothing in the script may construct a URL; if it starts doing so again, these fail.
 *
 * Run: node tests/otp-verify-browser-patch.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const SCRIPT = 'scripts/apply-otp-verify-patch.browser.js';
const source = read(SCRIPT);
const live = readJson('docs/reference/flow-contracts/deployed/' +
  'Web - OTP Verify__3e201620-f1e8-4c17-a90a-4d95b94a24c2__full_definition.json').definition;
const patched = readJson('docs/deployment/power-automate-flows/otp-verify-patched-definition.json');

const FLOW = '3e201620-f1e8-4c17-a90a-4d95b94a24c2';

/* The tenant's real host, from the operator's console on 2026-09-03. */
const DV = 'https://org4e1fbc9c.api.crm4.dynamics.com';
/* A path the script has never seen and could not have constructed. */
const DV_PATH = '/api/data/v9.2/workflows(' + FLOW + ')';
const PS = 'https://unitedkingdom.api.flow.microsoft.com';
const PS_PATH = '/providers/Microsoft.ProcessSimple/environments/x/flows/' + FLOW;

/* The connection bindings that live beside the definition in Dataverse. A write that rebuilt
   clientdata from scratch would drop these and unbind every connector action in the flow. */
const CONNECTION_REFERENCES = {
  shared_sharepointonline: { connectionName: 'shared-sharepointonline-abc', id: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' },
  shared_office365: { connectionName: 'shared-office365-def', id: '/providers/Microsoft.PowerApps/apis/shared_office365' },
};

const SIG = ['s', 'i', 'g'].join('');   /* assembled — see the note in the redaction block below */
const TRIGGER_URL = 'https://prod-00.example.logic.azure.com/workflows/x/triggers/manual/paths/invoke' +
                    `?api-version=2016-06-01&${SIG}=THIS_MUST_NEVER_BE_PRINTED`;
const TOKEN = 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.PRETEND_PAYLOAD_DO_NOT_PRINT.SIG';

let passed = 0, failed = 0;
const ok = (label, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${detail ? `\n       ${detail}` : ''}`); }
};

function harness({ store = 'dataverse', definition = live, patchFails = null } = {}) {
  const lines = [];
  const calls = [];
  let def = JSON.parse(JSON.stringify(definition));
  let refs = JSON.parse(JSON.stringify(CONNECTION_REFERENCES));

  const base = store === 'dataverse' ? DV : PS;
  const p = store === 'dataverse' ? DV_PATH : PS_PATH;

  const body = () => (store === 'dataverse'
    ? { workflowid: FLOW, name: 'Web - OTP Verify', category: 5,
        clientdata: JSON.stringify({ properties: { connectionReferences: refs, definition: def } }) }
    : { name: FLOW, properties: { displayName: 'Web - OTP Verify', flowTriggerUri: TRIGGER_URL, definition: def } });

  const mk = (status, payload) => {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const r = {
      ok: status >= 200 && status < 300, status,
      text: async () => text,
      clone: () => ({ text: async () => text }),
    };
    return r;
  };

  const fakeFetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input.url;
    const method = init.method || 'GET';
    calls.push({ url: raw, method, body: init.body, headers: init.headers });
    const u = new URL(raw);
    if (u.origin !== base || u.pathname !== p) return mk(404, { error: { message: 'not found' } });
    if (method === 'GET') return mk(200, body());
    if (method === 'PATCH') {
      if (patchFails) return mk(patchFails.status, { error: { message: patchFails.message } });
      const sent = JSON.parse(init.body);
      if (store === 'dataverse') {
        const cd = JSON.parse(sent.clientdata);
        def = cd.properties.definition;
        refs = cd.properties.connectionReferences;
      } else {
        def = sent.properties.definition;
      }
      return mk(204, '');
    }
    return mk(405, 'no');
  };

  const win = {};
  const sandbox = {
    window: win, location: { href: 'https://make.powerautomate.com/environments/x/flows/' + FLOW },
    fetch: fakeFetch, Headers, URL, Map, Date, JSON, setTimeout, Promise, Array, Object, String,
    XMLHttpRequest: class {
      constructor() { this.listeners = {}; }
      open(m, url) { this.__url = url; }
      setRequestHeader() {}
      addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); }
      send() {}
    },
    console: { log: (...a) => lines.push(a.map(String).join(' ')), error: (...a) => lines.push(a.map(String).join(' ')) },
  };
  sandbox.globalThis = sandbox;
  win.fetch = fakeFetch;
  win.XMLHttpRequest = sandbox.XMLHttpRequest;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(source, ctx);

  /** What the portal itself does when the flow page loads. */
  const portalLoadsFlow = async ({ via = 'fetch', alsoNoise = true } = {}) => {
    await new Promise((r) => setTimeout(r, 0));
    const auth = { authorization: TOKEN };
    if (alsoNoise) {
      /* Dataverse comments names the flow id and is NOT the definition. v2 would have latched
         onto exactly this and built a nonsense endpoint out of it. */
      await ctx.window.fetch(DV + "/api/data/v9.2/comments(artifactid='" + FLOW + "',artifacttype=0)",
        { method: 'GET', headers: auth });
    }
    if (via === 'fetch') {
      await ctx.window.fetch(base + p + '?api-version=9.2', { method: 'GET', headers: auth });
    } else {
      const x = new ctx.window.XMLHttpRequest();
      x.open('GET', base + p + '?api-version=9.2');
      x.setRequestHeader('Authorization', TOKEN);
      x.send();
      x.responseText = JSON.stringify(body());
      for (const fn of x.listeners.load || []) fn();
    }
  };

  const settle = async (marker) => {
    for (let i = 0; i < 400 && !lines.some((l) => marker.test(l)); i++) await new Promise((r) => setTimeout(r, 5));
  };
  const mine = () => calls.filter((c) => c.headers && c.headers.Authorization);
  return { lines, calls, mine, def: () => def, refs: () => refs, ctx, portalLoadsFlow, settle };
}

console.log('\nThe OTP verify browser patcher\n');

console.log('  DATAVERSE STORAGE — the shape this tenant actually uses');
{
  const h = harness({ store: 'dataverse' });
  await h.portalLoadsFlow();
  await h.settle(/NOTHING WAS SENT|Did not see it/);
  ok('it finds the definition at a path it could not have constructed',
     h.lines.some((l) => l.includes('found the definition on org4e1fbc9c.api.crm4.dynamics.com — dataverse')),
     h.lines.join('\n       '));
  ok('the Dataverse comments response, which names the flow, is not mistaken for it',
     !h.lines.some((l) => l.includes('comments')));
  ok('the read-only pass runs on paste, with no second paste needed',
     h.lines.some((l) => l.includes('NOTHING WAS SENT')));
  ok('it names the scope it would remove',
     h.lines.some((l) => l.includes('will be removed: Scope_VERIFY_Complete_No_Trigger')));
  ok('nothing is written', h.calls.every((c) => (c.method || 'GET') === 'GET'));
  ok('the stored definition is untouched', JSON.stringify(h.def()) === JSON.stringify(live));

  await h.ctx.window.otpPatch.apply();
  const patches = h.calls.filter((c) => c.method === 'PATCH');
  ok('otpPatch.apply() sends exactly one PATCH', patches.length === 1, `${patches.length} sent`);
  ok('it writes clientdata, which is how Dataverse stores a flow',
     patches.length === 1 && typeof JSON.parse(patches[0].body).clientdata === 'string');
  ok('the definition it wrote is the patched one, exactly',
     JSON.stringify(h.def()) === JSON.stringify(patched));
  ok('THE CONNECTION REFERENCES SURVIVE — a rebuilt clientdata would unbind every connector',
     JSON.stringify(h.refs()) === JSON.stringify(CONNECTION_REFERENCES),
     JSON.stringify(h.refs()));
  ok('it reads back from the tenant after writing',
     h.calls.filter((c) => c.method === 'GET').length >= 2);
  ok('every read-back check passes',
     h.lines.some((l) => l.includes('Applied.')) && !h.lines.some((l) => l.includes('❌')),
     h.lines.filter((l) => l.includes('❌')).join('; '));
  ok('the removed scope is confirmed gone', h.lines.some((l) => l.includes('✅') && l.includes('is gone')));

  await h.ctx.window.otpPatch.rollback();
  ok('otpPatch.rollback() restores the definition read first',
     JSON.stringify(h.def()) === JSON.stringify(live));
  ok('and rollback keeps the connection references too',
     JSON.stringify(h.refs()) === JSON.stringify(CONNECTION_REFERENCES));
}

console.log('\n  PROCESSSIMPLE STORAGE — the other shape, on the other host');
{
  const h = harness({ store: 'processsimple' });
  await h.portalLoadsFlow();
  await h.settle(/NOTHING WAS SENT|Did not see it/);
  ok('it finds it and says which shape',
     h.lines.some((l) => l.includes('found the definition on unitedkingdom.api.flow.microsoft.com — processsimple')),
     h.lines.join('\n       '));
  await h.ctx.window.otpPatch.apply();
  const patches = h.calls.filter((c) => c.method === 'PATCH');
  ok('it writes properties.definition, not clientdata',
     patches.length === 1 && JSON.parse(patches[0].body).properties.definition &&
     !JSON.parse(patches[0].body).clientdata);
  ok('the stored definition is the patched one', JSON.stringify(h.def()) === JSON.stringify(patched));
  ok('and it applied cleanly', h.lines.some((l) => l.includes('Applied.')));
}

console.log('\n  IT GUESSES NOTHING');
{
  const h = harness({ store: 'dataverse' });
  await h.portalLoadsFlow();
  await h.settle(/NOTHING WAS SENT/);
  const guessed = h.mine().filter((c) => {
    const p = new URL(c.url).pathname;
    return p !== DV_PATH && !p.startsWith('/api/data/v9.2/comments');
  });
  ok('every request it makes is to an endpoint it watched the portal use',
     guessed.length === 0, guessed.map((c) => new URL(c.url).pathname).join(', '));
  ok('the script constructs no ProcessSimple path of its own',
     !source.includes('/providers/Microsoft.ProcessSimple/environments/'),
     'a constructed path is a guess, and both guesses were wrong on this tenant');
  ok('and no /powerautomate/environments path either',
     !source.includes("'/powerautomate/environments/'"));
}
{
  const h = harness({ store: 'dataverse' });
  await h.portalLoadsFlow({ via: 'xhr' });
  await h.settle(/NOTHING WAS SENT|Did not see it/);
  ok('a definition delivered over XMLHttpRequest is found too',
     h.lines.some((l) => l.includes('found the definition')),
     'the portal uses both transports');
}
{
  const h = harness({ store: 'dataverse' });
  /* Only the noise, never the flow. */
  await h.portalLoadsFlow({ via: 'fetch', alsoNoise: true });
  const h2 = harness({ store: 'dataverse' });
  await new Promise((r) => setTimeout(r, 0));
  await h2.ctx.window.fetch(DV + "/api/data/v9.2/comments(artifactid='" + FLOW + "',artifacttype=0)",
    { method: 'GET', headers: { authorization: TOKEN } });
  await h2.ctx.window.otpPatch.dry(1);
  await h2.settle(/Did not see it/);
  ok('when it never sees the definition it says so and writes nothing',
     h2.lines.some((l) => l.includes('Did not see it')) &&
     h2.calls.every((c) => (c.method || 'GET') === 'GET'));
  ok('and it prints the endpoints it watched, so the gap can be diagnosed',
     h2.lines.some((l) => l.includes('/api/data/v9.2/comments')));
  ok('asking for hostnames and paths, never tokens',
     h2.lines.some((l) => l.includes('no tokens')));
}

console.log('\n  IT REFUSES TO GUESS ON THE TRIGGER');
{
  const drifted = JSON.parse(JSON.stringify(live));
  drifted.triggers.manual.inputs = { ...drifted.triggers.manual.inputs, schema: { type: 'object', changed: true } };
  const h = harness({ store: 'dataverse', definition: drifted });
  await h.portalLoadsFlow();
  await h.settle(/DIFFERS/);
  await h.ctx.window.otpPatch.apply();
  ok('a drifted trigger is reported on the read-only pass', h.lines.some((l) => l.includes('DIFFERS')));
  ok('apply() refuses it', h.lines.some((l) => l.includes('Refusing')));
  ok('and sends nothing', h.calls.filter((c) => c.method === 'PATCH').length === 0);
  ok('leaving the flow exactly as it was', JSON.stringify(h.def()) === JSON.stringify(drifted));
  const asks = h.lines.find((l) => l.includes('rebuilt'));
  ok('what it asks for back is explicitly not the URL', Boolean(asks) && /never the URL/i.test(asks));
}
{
  const h = harness({ store: 'dataverse',
                      patchFails: { status: 400, message: 'WorkflowOperationParametersExtraParameter: item/Attempts' } });
  await h.portalLoadsFlow();
  await h.settle(/NOTHING WAS SENT/);
  await h.ctx.window.otpPatch.apply();
  ok('a service rejection is reported, not swallowed',
     h.lines.some((l) => l.includes('REFUSED') && l.includes('WorkflowOperationParametersExtraParameter')));
  ok('nothing is claimed applied', !h.lines.some((l) => l.includes('Applied.')));
  ok('it names the cause the operator can act on', h.lines.some((l) => l.includes('SharePoint')));
  ok('and the flow is untouched', JSON.stringify(h.def()) === JSON.stringify(live));
}

console.log('\n  NO TOKEN EVER REACHES THE CONSOLE');
{
  const h = harness({ store: 'processsimple' });   /* this shape serves a sig=-bearing trigger URL */
  await h.portalLoadsFlow();
  await h.settle(/NOTHING WAS SENT/);
  await h.ctx.window.otpPatch.apply();
  h.ctx.window.otpPatch.status();
  h.ctx.window.otpPatch.seen();
  const leaked = h.lines.filter((l) => /THIS_MUST_NEVER_BE_PRINTED|PRETEND_PAYLOAD|eyJ/.test(l) || l.includes(SIG + '='));
  ok('no console line carries a sig= token or a JWT', leaked.length === 0, leaked.join('\n       '));
  ok('and the stub served both on every read, so that check could have failed',
     TRIGGER_URL.includes(SIG + '=') && TOKEN.includes('eyJ'));
  ok('status() reports hosts, never tokens', h.lines.some((l) => l.includes('origins with a token')));
  ok('the redaction guard is in the script, not only in this test',
     /return \/sig=[^\n]*\.test\(s \|\| ''\)/.test(source));
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
