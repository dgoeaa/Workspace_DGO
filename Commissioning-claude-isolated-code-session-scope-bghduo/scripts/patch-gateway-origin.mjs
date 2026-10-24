#!/usr/bin/env node
/* Replace the literal CORS origin in the hand-built correspondence-gateway packages with the
 * same list-driven resolution the generated packages use.
 *
 * The generated packages get this from `finalizeScope` in scripts/lib/designer-paste-builder.mjs.
 * The gateway packages are not generated — they were captured from the tenant and are edited in
 * place — so the transformation lives here instead of being retyped by hand into six Response
 * actions across five scopes. It is idempotent: a package that already resolves its origin is
 * left alone.
 *
 * The resolver goes at the ROOT of the package scope, once, and every Response reads it. Root
 * actions run before anything nested, so a Response inside a catch scope still has the value.
 *
 * Run with --check to fail instead of writing (used by npm test).
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../docs/deployment/sharepoint/flows/designer-paste/correspondence-gateway/', import.meta.url));
const CHECK = process.argv.includes('--check');
const CONFIG_LIST = '9bc168c3-06e5-4d58-982b-0df06205fd35';
const CONFIG_SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';

let changed = 0, seen = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const path = DIR + file;
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const sv = pkg.serializedValue;
  if (!sv?.actions) continue;
  seen++;
  if (!JSON.stringify(sv).includes('your-host')) continue;

  const tag = pkg.nodeId.replace(/^Scope_/, '').replace(/[^A-Za-z0-9_]/g, '_');
  const GET = `Get_Allowed_Origins_${tag}`;
  const SEL = `Select_Allowed_Origins_${tag}`;
  const REQ = `Compose_Request_Origin_${tag}`;
  const ALLOW = `Compose_Allowed_Origin_${tag}`;

  /* The connection these packages already use, so the added read binds like their other reads. */
  const sample = Object.values(pkg.allConnectionData || {})[0];
  if (!sample) throw new Error(`${file}: no allConnectionData to copy a connection from`);
  const refKey = sample.referenceKey;

  const mid = (n) => ({ operationMetadataId: `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}` });
  const resolver = {
    [GET]: {
      type: 'OpenApiConnection',
      inputs: {
        parameters: { dataset: CONFIG_SITE, table: CONFIG_LIST, $filter: "startswith(Title,'ALLOWED_ORIGIN')", $top: 20 },
        host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connection: refKey, operationId: 'GetItems' },
      },
      runAfter: {},
      metadata: mid(1),
    },
    [SEL]: {
      type: 'Select',
      inputs: { from: `@coalesce(outputs('${GET}')?['body/value'],json('[]'))`, select: "@trim(string(coalesce(item()?['ConfigValue'],'')))" },
      runAfter: { [GET]: ['Succeeded', 'Failed', 'TimedOut', 'Skipped'] },
      metadata: mid(2),
    },
    [REQ]: {
      type: 'Compose',
      inputs: "@trim(string(coalesce(triggerOutputs()?['headers']?['Origin'],triggerOutputs()?['headers']?['origin'],'')))",
      runAfter: { [SEL]: ['Succeeded'] },
      metadata: mid(3),
    },
    [ALLOW]: {
      type: 'Compose',
      inputs: `@if(contains(coalesce(body('${SEL}'),json('[]')),outputs('${REQ}')),outputs('${REQ}'),string(coalesce(first(coalesce(body('${SEL}'),json('[]'))),'')))`,
      runAfter: { [REQ]: ['Succeeded'] },
      metadata: mid(4),
    },
  };

  /* Whatever ran first now runs after the resolver. */
  for (const v of Object.values(sv.actions)) {
    if (v && typeof v === 'object' && Object.keys(v.runAfter || {}).length === 0) v.runAfter = { [ALLOW]: ['Succeeded'] };
  }
  sv.actions = { ...resolver, ...sv.actions };

  /* Every Response echoes the resolved origin, and says the answer varies by it. */
  let responses = 0;
  (function walk(actions) {
    for (const v of Object.values(actions || {})) {
      if (!v || typeof v !== 'object') continue;
      if (v.type === 'Response' && v.inputs?.headers?.['Access-Control-Allow-Origin'] === 'https://your-host') {
        v.inputs.headers['Access-Control-Allow-Origin'] = `@outputs('${ALLOW}')`;
        v.inputs.headers.Vary = 'Origin';
        responses++;
      }
      walk(v.actions);
      walk(v.else?.actions);
      if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
      walk(v.default?.actions);
    }
  })(sv.actions);

  pkg.allConnectionData[GET] = JSON.parse(JSON.stringify(sample));

  if (CHECK) { console.error(`❌ ${file} still carries the literal origin on ${responses} Response action(s) — run: node scripts/patch-gateway-origin.mjs`); process.exitCode = 1; continue; }
  writeFileSync(path, JSON.stringify(pkg));
  console.log(`✅ ${file} — resolver added, ${responses} Response action(s) rewired`);
  changed++;
}

if (!CHECK) console.log(`\n${changed} of ${seen} gateway package(s) changed.`);
else if (!process.exitCode) console.log(`✅ ${seen} gateway package(s) resolve their origin from the configuration list`);
