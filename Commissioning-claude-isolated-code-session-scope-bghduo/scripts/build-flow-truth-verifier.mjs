#!/usr/bin/env node
/**
 * Emit the read-only verifier for GOV-11 — the flow-truth resources provisioned out of band.
 *
 * WHAT HAPPENED
 *
 * Two browser scripts were reported executed against the tenant on 2026-09-10, creating two lists
 * and a document library titled `NITDA Flow Truth Registry`, `NITDA Flow Truth History` and
 * `NITDA Flow Truth Artefacts`. They are held verbatim in `docs/reference/out-of-band/`.
 *
 * None of the three is in any specification this repository holds, and none is in the 326-list
 * tenant capture of 2026-08-18. So `B1` of `docs/audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md` — "the
 * three target lists exist nowhere in the estate" — is a statement about the capture, and the
 * capture is now three weeks and one execution out of date.
 *
 * WHY A VERIFIER RATHER THAN A CONCLUSION
 *
 * "Reported executed" is not "executed", and "executed" is not "executed as written". Three things
 * about those scripts make the difference material, and none of them can be settled by reading:
 *
 *   1. **Neither script pins a site.** Both take `window._spPageContextInfo.webAbsoluteUrl` —
 *      whichever page the console was open on. GOV-01 made one site authoritative and GOV-09
 *      records a live producer writing to the other. Nothing in either script distinguishes them,
 *      and neither writes down which it used. So this verifier asks **both**.
 *
 *   2. **`createfieldasxml` is called with `Options: 0`.** The estate's own provisioners call it
 *      with `Options: 24`, and 8 of that is `AddFieldInternalNameHint` — the bit that makes
 *      SharePoint take the internal name from the SchemaXml `Name` attribute instead of deriving
 *      it from the display name. Without it, a column declared `Name="RegistryKey"
 *      DisplayName="Registry Key"` may well have landed as `Registry_x0020_Key`. It would look
 *      right in every view and be unaddressable by every flow. So this verifier reports the
 *      internal name it **finds** beside the one the script asked for, rather than answering
 *      present/absent.
 *
 *   3. **The idempotence guard depends on the bit that is missing.** The script tests
 *      `existing.has(definition.internalName)` — a set of live `InternalName` against the SchemaXml
 *      `Name`. If SharePoint derived the names, that test never matches, every re-run re-creates
 *      every column, and SharePoint auto-disambiguates by appending a digit. So this verifier
 *      counts `<base><digits>` siblings, which is the only thing that distinguishes one run from
 *      three.
 *
 * WHY THE EXPECTED COLUMNS ARE PARSED, NOT TYPED
 *
 * There are 90 of them. Typing 90 names beside a file that already contains them is how a checker
 * starts disagreeing with the thing it checks — the defect that produced two false positives in
 * `verify-governance-columns.browser.js` on 2026-09-10 and would have halted every agent at WP-0.
 * So the field constructors and the two field functions are lifted out of the executed script and
 * evaluated in a `node:vm`, and the emitted verifier looks for exactly what that script asked the
 * tenant for. If the source file changes shape, the extraction fails loudly here rather than
 * silently emitting the wrong names.
 *
 * THIS SCRIPT WRITES NOTHING TO THE TENANT, and the file it emits writes nothing either. Deciding
 * what to do with whatever it finds — adopt the three resources into the specification, or retire
 * them in favour of the specified seven lists — is an agency decision, not an executing one.
 *
 *   npm run governance:flowtruthverifier
 *   npm run governance:flowtruthverifier -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_BROWSER_CONSOLE1.js');
const RESUME = path.join(ROOT, 'docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_RESUME_FIX.js');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/verify-flow-truth-provisioning.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

for (const f of [SOURCE, RESUME]) {
  if (!fs.existsSync(f)) fail(`${path.relative(ROOT, f)} is missing; GOV-11 cannot be verified without it`);
}
const src = fs.readFileSync(SOURCE, 'utf8');

/* ── the sites to ask ────────────────────────────────────────────────────────────────────────
   The authoritative one because that is where the estate's lists belong, and every site the
   retirement register names because that is where GOV-09's producer was found writing. Neither
   executed script recorded which it used, so the question is answered by asking both rather than
   by choosing one. */
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const AUTHORITATIVE = registry.decision.authoritativeSite;
const HOST = new URL(AUTHORITATIVE).origin;
const SITES = [
  { url: AUTHORITATIVE, role: 'authoritative (GOV-01)' },
  ...[...new Set((registry.retire || []).map((r) => r.site))]
    .map((name) => ({ url: `${HOST}/sites/${name}`, role: 'non-authoritative — GOV-09 producer site' }))
    .filter((s) => s.url !== AUTHORITATIVE),
];
if (SITES.length < 2) fail('only one site is known; GOV-11 needs both candidates to be conclusive');

/* ── the three resource titles, read from the script that created them ───────────────────── */
const titleOf = (key) => {
  const m = new RegExp(`${key}:\\s*"([^"]+)"`).exec(src);
  if (!m) fail(`could not read CONFIG.${key} from the executed script`);
  return m[1];
};
const RESOURCES = [
  { title: titleOf('currentList'), kind: 'list', template: 100, uniqueKey: 'RegistryKey' },
  { title: titleOf('historyList'), kind: 'list', template: 100, uniqueKey: 'HistoryKey' },
  { title: titleOf('artefactLibrary'), kind: 'library', template: 101, uniqueKey: null },
];

/* ── the columns, evaluated out of the script rather than retyped ────────────────────────────
   The slice runs from the first field constructor to the first function that is not one, so the
   only things evaluated are pure string builders. Nothing in the slice reaches the network, and
   `vm` gets no globals at all — a slice that tried would throw here, which is the point. */
const START = src.indexOf('const textField =');
const END = src.indexOf('async function configureTitle');
if (START < 0 || END < 0 || END <= START) {
  fail('the field-constructor region of the executed script could not be located; it has changed shape');
}
const slice = src.slice(START, END);
for (const forbidden of ['fetch', 'request(', 'XMLHttpRequest', 'import(']) {
  if (slice.includes(forbidden)) fail(`the extracted region contains \`${forbidden}\`; it is not a pure field builder`);
}

let extracted;
try {
  const context = vm.createContext(Object.create(null));
  extracted = vm.runInContext(
    `(() => { ${slice}\n return { common: commonFields(), artefact: artefactFields() }; })()`,
    context,
    { timeout: 2000 },
  );
} catch (err) {
  fail(`the field constructors could not be evaluated: ${err.message}`);
}

/* Every constructor declares Name and StaticName as the same value and DisplayName separately.
   Both are read back: the whole question is whether the tenant honoured Name (Options bit 8) or
   derived the internal name from DisplayName. */
const parse = (f) => {
  const attr = (a) => (new RegExp(`(?<![A-Za-z])${a}="([^"]*)"`).exec(f.xml) || [])[1];
  const askedFor = attr('Name');
  const displayName = attr('DisplayName');
  const type = attr('Type');
  if (!askedFor || !displayName || !type) fail(`a field in the executed script has no Name, DisplayName or Type: ${f.xml}`);
  if (askedFor !== f.internalName) fail(`${askedFor} disagrees with its own declared internalName ${f.internalName}`);
  return { askedFor, displayName, type, required: /(?<![A-Za-z])Required="TRUE"/.test(f.xml) };
};

const byResource = [
  { ...RESOURCES[0], fields: extracted.common.map(parse) },
  { ...RESOURCES[1], fields: extracted.common.map(parse) },
  { ...RESOURCES[2], fields: extracted.artefact.map(parse) },
];
const totalFields = byResource.reduce((n, r) => n + r.fields.length, 0);
if (!totalFields) fail('no fields were extracted; the verifier would check nothing');

/* The fields RESUME_FIX indexes without uniqueness. Each of its calls sends `Required: unique`,
   so all of these were sent `Required: false` — clearing Required where CONSOLE1 set it. The
   verifier reports the live Required state of exactly these, because that is the claim. */
const requiredWasSetBy = new Set(
  byResource.flatMap((r) => r.fields.filter((f) => f.required).map((f) => `${r.title}::${f.askedFor}`)),
);

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built by scripts/build-flow-truth-verifier.mjs from
 * docs/reference/out-of-band/NITDA_Flow_Truth_SharePoint_Provisioning_BROWSER_CONSOLE1.js.
 * Edit neither; re-run the generator.
 */
/*
 * READ-ONLY. Changes nothing. Establishes what GOV-11 actually put on the tenant.
 *
 * WHAT THIS ANSWERS
 *   Two browser scripts were reported executed on 2026-09-10, creating ${byResource.length} resources and
 *   ${totalFields} columns outside every specification this estate holds. Neither script pinned a site,
 *   neither recorded which site it used, and both called createfieldasxml with Options: 0 — without
 *   AddFieldInternalNameHint, so SharePoint was free to derive each internal name from the display
 *   name instead of taking the one the script asked for.
 *
 *   This script asks ${SITES.length} sites, for each of the ${byResource.length} resources, for each of its columns:
 *     · is it there at all
 *     · under the internal name the script asked for, or under one SharePoint derived
 *     · with how many auto-disambiguated siblings beside it (the re-run signature)
 *     · with Required and uniqueness in the state the scripts left them
 *
 *   It concludes nothing. Adopting these resources into the specification or retiring them in
 *   favour of the seven specified registry lists is an agency decision. Report what this prints.
 *
 * VERDICTS
 *   absent               the resource or column is not on this site
 *   asked-name           the column is there under the internal name the script asked for
 *   DERIVED NAME         the column is there under a DIFFERENT internal name — Options: 0 bit it
 *   DUPLICATED           more than one column answers to the same base name (a re-run happened)
 *   REQUIRED CLEARED     the script created it Required, and it is not Required now
 *
 * HOW TO RUN
 *   1. Sign in. Open any page on EITHER site — it asks about both regardless.
 *   2. F12 → Console. Paste. Nothing is written.
 */

const SITES = ${JSON.stringify(SITES, null, 2)};
const RESOURCES = ${JSON.stringify(byResource, null, 2)};
const REQUIRED_BY_SCRIPT = ${JSON.stringify([...requiredWasSetBy], null, 2)};

(async () => {
  const NOMETA = 'application/json;odata=nometadata';
  const required = new Set(REQUIRED_BY_SCRIPT);

  const send = async (url, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', headers: { Accept: NOMETA } });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(\`  throttled, waiting \${wait / 1000}s\`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, attempt + 1);
    }
    return res;
  };

  const isCustom = (f) => f && f.FromBaseType !== true && f.CanBeDeleted !== false;

  /* SharePoint encodes characters it cannot use in an internal name as _xHHHH_. A display name of
     'Registry Key' derives to 'Registry_x0020_Key'. Matching on the decoded form rather than on a
     guessed encoding means an unexpected encoding still resolves. */
  const decode = (n) => String(n || '').replace(/_x([0-9a-fA-F]{4})_/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  const ledger = [];
  let asked = 0, derived = 0, duplicated = 0, cleared = 0, absentCols = 0, foundResources = 0, absentResources = 0;

  console.log('%cGOV-11 — what the out-of-band flow-truth provisioning actually created',
    'font-weight:bold;font-size:13px');

  for (const site of SITES) {
    console.log(\`%c\${site.url}  —  \${site.role}\`, 'color:#888');

    for (const r of RESOURCES) {
      let meta = null;
      try {
        const res = await send(
          \`\${site.url}/_api/web/lists/getbytitle('\${r.title.replace(/'/g, "''")}')?$select=Id,Title,BaseTemplate,ItemCount,Created\`);
        if (res.ok) meta = await res.json();
        else if (res.status !== 404) throw new Error(\`HTTP \${res.status}\`);
      } catch (err) {
        ledger.push({ site: site.url, resource: r.title, column: '(whole resource)', verdict: 'UNREADABLE', detail: err.message });
        continue;
      }

      if (!meta) {
        absentResources++;
        ledger.push({ site: site.url, resource: r.title, column: '(whole resource)', verdict: 'absent', detail: 'not on this site' });
        continue;
      }

      foundResources++;
      ledger.push({
        site: site.url, resource: r.title, column: '(whole resource)', verdict: 'PRESENT',
        detail: \`guid \${meta.Id} · template \${meta.BaseTemplate} (expected \${r.template}) · \${meta.ItemCount} item(s) · created \${meta.Created}\`,
      });

      let live;
      try {
        const res = await send(
          \`\${site.url}/_api/web/lists(guid'\${meta.Id}')/fields?$select=InternalName,Title,Required,Indexed,EnforceUniqueValues,FromBaseType,CanBeDeleted&$top=500\`);
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        live = ((await res.json()).value || []).filter(isCustom);
      } catch (err) {
        ledger.push({ site: site.url, resource: r.title, column: '(fields)', verdict: 'UNREADABLE', detail: err.message });
        continue;
      }

      const byInternal = new Map(live.map((f) => [f.InternalName, f]));

      for (const f of r.fields) {
        /* Anything that could plausibly be this column: the exact name the script asked for, the
           name SharePoint would derive from the display name, and any digit-suffixed sibling of
           either — which is what a second run leaves behind. */
        const base = new RegExp(\`^\${f.askedFor.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}\\\\d*$\`);
        const candidates = live.filter(
          (x) => base.test(x.InternalName) || decode(x.InternalName) === f.displayName || x.Title === f.displayName,
        );

        if (!candidates.length) {
          absentCols++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'absent',
            detail: \`no column under that name and none titled '\${f.displayName}'\`,
          });
          continue;
        }

        const exact = byInternal.get(f.askedFor);
        if (candidates.length > 1) {
          duplicated++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'DUPLICATED',
            detail: \`\${candidates.length} columns answer to it: \${candidates.map((c) => c.InternalName).join(', ')} — the script was run more than once and SharePoint disambiguated\`,
          });
        } else if (exact) {
          asked++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'asked-name',
            detail: \`Required=\${exact.Required} · Indexed=\${exact.Indexed} · Unique=\${exact.EnforceUniqueValues}\`,
          });
        } else {
          derived++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'DERIVED NAME',
            detail: \`present as '\${candidates[0].InternalName}' — Options: 0 omitted AddFieldInternalNameHint, so every flow addressing '\${f.askedFor}' will not find it\`,
          });
        }

        /* The Required claim, checked against whichever column actually answers. RESUME_FIX sent
           Required: false on every field it indexed without uniqueness. */
        const live1 = exact || candidates[0];
        if (required.has(\`\${r.title}::\${f.askedFor}\`) && live1 && live1.Required !== true) {
          cleared++;
          ledger.push({
            site: site.url, resource: r.title, column: f.askedFor, verdict: 'REQUIRED CLEARED',
            detail: "created Required=TRUE; RESUME_FIX's index() sends Required: false on every non-unique field",
          });
        }
      }

      if (r.uniqueKey) {
        const k = byInternal.get(r.uniqueKey);
        if (k && k.EnforceUniqueValues !== true) {
          ledger.push({
            site: site.url, resource: r.title, column: r.uniqueKey, verdict: 'UNIQUENESS NOT ENFORCED',
            detail: 'the scripts enforce uniqueness on this column; nothing stops a duplicate key without it',
          });
        }
      }
    }
  }

  console.table(ledger);
  console.log(
    \`%c\${foundResources} resource(s) present · \${absentResources} absent · \${asked} column(s) under the asked name · \${derived} under a DERIVED name · \${duplicated} DUPLICATED · \${cleared} REQUIRED CLEARED · \${absentCols} absent\`,
    (derived || duplicated || cleared) ? 'color:#b00;font-weight:bold' : 'color:#080;font-weight:bold',
  );

  if (!foundResources) {
    console.log('%cNothing was found on either site. The out-of-band provisioning did not reach this tenant, or reached a site not listed above.',
      'color:#080;font-weight:bold');
  } else {
    console.log('%cReport this output under GOV-11. Do NOT re-run either provisioning script — a re-run is the duplication case, not a repair.',
      'color:#b00;font-weight:bold');
  }
${relayBlock('verify-flow-truth-provisioning.browser.js', "'read-only'", 'SITES.map((s) => s.url).join(" + ")')}
})();
`;

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGOV-11 flow-truth verifier\n');
for (const s of SITES) console.log(`  site      ${s.url}  (${s.role})`);
for (const r of byResource) console.log(`  probes    ${r.title.padEnd(30)} ${String(r.fields.length).padStart(3)} column(s), ${r.kind}`);
console.log(`  total     ${totalFields} column(s), ${totalFields * SITES.length} probe(s)\n`);

if (CHECK) {
  if (emitted !== previous) fail('the flow-truth verifier is stale. Run: npm run governance:flowtruthverifier');
  console.log('  ✅ the flow-truth verifier matches the executed script\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, read-only\n`);
