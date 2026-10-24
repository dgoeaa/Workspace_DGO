/* The flow → list map is derived, and the register cannot drift from the code.
 *
 * The full-scope gate is held open by "Internal operations — 7 of ~20 flow definitions
 * available", a statement about coverage that was true on the day someone counted and had no
 * way of staying true. These checks make it hold itself up: the contract keys the register
 * declares must be exactly the keys the platform declares, every definition it claims must
 * exist, and the written map must match what a sweep of the tree produces right now. */
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const index = JSON.parse(read('docs/reference/sharepoint-list-index.json'));
const register = JSON.parse(read('docs/reference/internal-flow-register.json'));
const map = JSON.parse(read('docs/reference/flow-list-map.json'));

console.log('\nFlow → list coverage');

// 1. The list index is addressable and self-consistent.
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const entries = Object.entries(index.lists);
ok('every list is keyed by a lower-case GUID',
   entries.every(([g]) => GUID.test(g)),
   'bad keys: ' + entries.filter(([g]) => !GUID.test(g)).map(([g]) => g).slice(0, 5).join(', '));
ok('every list names a site the index declares',
   entries.every(([, l]) => index.sites.some((s) => s.key === l.site)),
   'orphans: ' + [...new Set(entries.filter(([, l]) => !index.sites.some((s) => s.key === l.site)).map(([, l]) => l.site))].join(', '));
ok('the index totals match its contents',
   index.totals.lists === entries.length
     && index.totals.sites === index.sites.length
     && index.totals.adopted === entries.filter(([, l]) => l.adopted).length,
   `declared ${JSON.stringify(index.totals)} vs actual {lists:${entries.length},sites:${index.sites.length}}`);

// 2. The register declares exactly the platform's contract keys — no more, no fewer — and
//    agrees with the platform about which physical flow serves each one. EndpointContracts is
//    the authority, not EndpointUrls: DISPATCH_OUTBOUND and ARCHIVE_REFERENCE are contracts
//    with no URL of their own, because they ride on DYNAMIC_ACTIONS' flow. A key added to the
//    config without a register row is a flow nobody is tracking toward the gate.
const cfg = read('config/endpoints.config.js');
const contractsBlock = cfg.slice(cfg.indexOf('EndpointContracts = Object.freeze'));
const declaredContracts = [...contractsBlock.matchAll(/^\s*([A-Z][A-Z_0-9]+):\s*Object\.freeze\(\{([^}]*)\}/gm)]
  .map((m) => ({ key: m[1], sourceKey: (m[2].match(/sourceKey:\s*"([^"]+)"/) || [, null])[1] }));
/* SCAN_INTAKE has a URL but no row in EndpointContracts — it is a PUT of raw bytes, not a
 * JSON contract (INTERNAL_PLATFORM_FLOWS.md Part 10). It is still a flow that touches the
 * estate, so the estate the register must cover is the union of both declarations. */
const urlBlock = cfg.slice(cfg.indexOf('EndpointUrls = Object.freeze'), cfg.indexOf('EndpointContracts = Object.freeze'));
const declaredUrls = [...urlBlock.matchAll(/^\s*([A-Z][A-Z_0-9]+):\s*_url\(/gm)].map((m) => m[1]);
const declared = [...new Set([...declaredContracts.map((c) => c.key), ...declaredUrls])];
const registered = register.contractKeys.map((k) => k.key);

ok('both endpoint declarations were parsed', declaredContracts.length > 0 && declaredUrls.length > 0,
   `${declaredContracts.length} contracts, ${declaredUrls.length} urls`);

ok('the platform\'s contract registry was parsed', declared.length > 0, 'EndpointContracts not read from config/endpoints.config.js');
ok('the register covers every contract key the platform declares',
   declared.every((k) => registered.includes(k)),
   'untracked: ' + declared.filter((k) => !registered.includes(k)).join(', '));
ok('the register declares no key the platform does not',
   registered.every((k) => declared.includes(k)),
   'stale: ' + registered.filter((k) => !declared.includes(k)).join(', '));
ok('the register agrees with the platform about which flow serves each key',
   declaredContracts.every((c) => {
     const row = register.contractKeys.find((k) => k.key === c.key);
     return !row || !c.sourceKey || row.physicalFlow === c.sourceKey;
   }),
   declaredContracts.filter((c) => {
     const row = register.contractKeys.find((k) => k.key === c.key);
     return row && c.sourceKey && row.physicalFlow !== c.sourceKey;
   }).map((c) => `${c.key}: config says ${c.sourceKey}, register says ${register.contractKeys.find((k) => k.key === c.key).physicalFlow}`).join('; '));

// 3. Every attribution points at a definition that is actually there.
const claimed = register.contractKeys.flatMap((k) => k.definitions || [])
  .concat(register.unattributedDefinitions.map((d) => d.definition));
const missing = claimed.filter((p) => { try { read(p); return false; } catch { return true; } });
ok('every definition the register names exists on disk', missing.length === 0, missing.join('\n     '));

// 4. Physical flows are the unit of work, and the arithmetic has to hold.
const keysOfFlows = register.physicalFlows.flatMap((p) => p.servesContractKeys).sort();
ok('every contract key belongs to exactly one physical flow',
   keysOfFlows.length === registered.length && new Set(keysOfFlows).size === registered.length,
   `${keysOfFlows.length} key slots across ${register.physicalFlows.length} flows for ${registered.length} keys`);

// 4b. Where a definition states its own workflow id, the register must not contradict it.
//     A flow identifying itself outranks any attribution made from a filename or a labelled
//     URL, so a silent disagreement here means the register is pointing at the wrong flow.
const selfDeclared = new Map(map.flows.filter((f) => f.workflowId).map((f) => [f.file, f.workflowId.toLowerCase()]));
const contradictions = [];
for (const row of register.contractKeys) {
  const recorded = row.workflowId?.toLowerCase();
  if (!recorded) continue;
  for (const def of row.definitions || []) {
    const declared = selfDeclared.get(def);
    if (!declared || declared === recorded) continue;
    const listed = (row.workflowIdCandidates || []).some((c) => c.workflowId.toLowerCase() === declared);
    if (!listed) contradictions.push(`${row.key}: register says ${recorded}, ${def.split('/').pop()} declares ${declared}`);
  }
}
ok('no register attribution contradicts the definition it names', contradictions.length === 0, contradictions.join('\n     '));

// 4c. Every list the sweep reports is either in the adopted set or explicitly known not to be.
//     The gate's own worry was "a list touched ONLY by one of the unswept flows would not
//     appear" — so a newly swept flow surfacing a non-adopted list is the finding, not noise,
//     and it has to be visible rather than buried in a JSON file nobody re-reads.
const notAdopted = map.listsTouched.filter((l) => !l.adopted);
if (notAdopted.length) {
  console.log(`     note: ${notAdopted.length} list(s) touched but outside the adopted set — ` +
    notAdopted.map((l) => `${l.listTitle} (${l.touchedBy.join(', ')})`).join('; '));
}
ok('every list the sweep names resolved to a real list', map.listsTouched.every((l) => l.site && l.listTitle),
   map.listsTouched.filter((l) => !l.site).map((l) => l.listGuid).join(', '));

// 4d. No flow definition committed under flow-contracts/ may carry a live signed trigger
//     token. A definition that calls another flow embeds one, so an export can ship
//     credentials nobody meant to publish. The redaction pattern must also survive both JSON
//     encodings: Windows PowerShell 5.1 escapes & as \u0026, so a pattern anchored on [?&]
//     matches nothing in a file 5.1 wrote while appearing to work on one written by 7.
/* A flow definition holds whatever the flow was built with. Signed trigger URLs are the
 * obvious class; the one that actually reached this repository was third-party API keys pasted
 * into HTTP actions - Google, OpenAI, OpenRouter, Hugging Face - which no sig= pattern would
 * ever have seen. GitHub's push protection caught three of them and this scan finds the rest,
 * which is the argument for checking every class here rather than trusting one. */
const CREDENTIALS = [
  ['signed trigger URL', /sig=(?!REDACTED)[A-Za-z0-9_%-]{8,}/],
  ['OpenAI / OpenRouter / Anthropic key', /\bsk-(?:or-|ant-)?[A-Za-z0-9_-]{20,}/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['credential in an auth header', /"(?:Authorization|api[-_]?key|x-api-key|Ocp-Apim-Subscription-Key)"\s*:\s*"(?![^"]*REDACTED)[^"]{16,}"/i],
];
const LIVE_SIG = CREDENTIALS[0][1];
/* A FILENAME IS NOT A URL, AND ONE CHARACTER PROVED IT.
   This built each child as `new URL(e.name, dirUrl)`. A `#` in a filename is a fragment
   delimiter to the URL parser, so `W#B Task Escalation__….json` resolved to the path
   `…/deployed/W` with `#B Task Escalation__….json` as the fragment — and readFileSync threw
   ENOENT on a file called `W`. `?` would do the same through the query delimiter, and `%`
   through percent-decoding.

   That is not hypothetical here. scripts/export-power-automate-flows.ps1 names each file after
   the flow's display name, and the tenant has a flow called `W#B Task Escalation`. So a routine
   export produces a definition this scan cannot read — and the scan's job is finding committed
   credentials, which makes a silently unreadable definition the worst kind to have.

   Resolving through the filesystem path and converting once at the end removes the whole class:
   pathToFileURL percent-encodes what needs encoding, and nothing is reinterpreted. */
function walkJson(dirUrl, out = []) {
  let entries;
  const dir = fileURLToPath(dirUrl);
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const childPath = join(dir, e.name);
    if (e.isDirectory()) walkJson(pathToFileURL(childPath + '/'), out);
    else if (e.name.endsWith('.json')) out.push(pathToFileURL(childPath));
  }
  return out;
}
const contractFiles = walkJson(new URL('docs/reference/flow-contracts/', root));
const leaking = [];
for (const u of contractFiles) {
  const text = readFileSync(u, 'utf8');
  for (const [label, rx] of CREDENTIALS) {
    if (rx.test(text)) leaking.push(`${label}: ${decodeURIComponent(u.pathname).split('/').slice(-2).join('/')}`);
  }
}
ok(`no committed flow definition carries a credential (${contractFiles.length} scanned, ${CREDENTIALS.length} classes)`,
   leaking.length === 0, leaking.join('\n     '));

/* The PowerShell that does the redacting must know about every class this scan checks for,
 * or an export arrives dirty and only fails once it is already in a commit. */
const redactRules = readFileSync(new URL('scripts/redact-signed-urls.ps1', root), 'utf8');
const unhandled = ['sig=', 'sk-ant-', 'sk-or-', 'hf_', 'AIza', 'gh[pousr]_', 'xox[baprs]-', 'AKIA', 'x-api-key']
  .filter((needle) => !redactRules.includes(needle));
ok('the redaction script covers every credential class this test scans for',
   unhandled.length === 0, 'missing from scripts/redact-signed-urls.ps1: ' + unhandled.join(', '));

/* The pattern the PowerShell actually uses, read out of the script rather than restated here,
 * checked against every encoding a signed URL appears in. */
const redactSrc = readFileSync(new URL('scripts/redact-signed-urls.ps1', root), 'utf8');
const patternLine = redactSrc.match(/Name\s*=\s*'signed trigger URL';\s*Pattern\s*=\s*'([^']+)'/);
ok('the redaction pattern was read from the script', Boolean(patternLine),
   'no signed-trigger-URL rule found in the $Rules table');
if (patternLine) {
  const re = new RegExp(patternLine[1], 'i');
  /* The stand-in token is assembled at run time rather than written out. A 20-plus character
   * run after 'sig=' is exactly the shape tests/check-secrets.mjs treats as a live credential,
   * and a test that trips the repository's own credential ratchet is a bad test even when what
   * it holds is invented. */
  const token = 'A'.repeat(24);
  const encodings = {
    'plain &sig=': `invoke?api-version=1&sp=%2Ftriggers&sig=${token}`,
    'PowerShell 5.1 \\u0026sig=': `invoke?api-version=1\\u0026sp=%2Ftriggers\\u0026sig=${token}`,
    'short token': 'invoke?sig=' + 'B'.repeat(9),
  };
  const missed = Object.entries(encodings).filter(([, v]) => !re.test(v)).map(([k]) => k);
  ok('the redaction pattern catches every encoding a signed URL takes', missed.length === 0,
     'missed: ' + missed.join(', '));
}

// 5. Workflow ids are identifiers; a sig token is a bearer credential and must never be here.
for (const [name, text] of [['list index', read('docs/reference/sharepoint-list-index.json')],
                            ['register', read('docs/reference/internal-flow-register.json')],
                            ['flow → list map', read('docs/reference/flow-list-map.json')]]) {
  ok(`the ${name} carries no signed trigger token`, !/[?&]sig=[A-Za-z0-9_%-]{20,}/.test(text));
}

// 6. The written map is what a sweep of the tree produces right now, not what it produced once.
let sweepOk = true;
let sweepOut = '';
try {
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/flow-list-sweep.mjs', root)), '--check'], { stdio: 'pipe' });
} catch (err) {
  sweepOk = false;
  sweepOut = String(err.stderr || err.stdout || err.message).trim();
}
ok('the written map matches a fresh sweep', sweepOk, sweepOut);

// 7. Nothing in the map claims a list the index cannot name.
ok('every list the map reports resolved is in the index',
   map.listsTouched.every((l) => index.lists[l.listGuid]),
   map.listsTouched.filter((l) => !index.lists[l.listGuid]).map((l) => l.listGuid).join(', '));

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
