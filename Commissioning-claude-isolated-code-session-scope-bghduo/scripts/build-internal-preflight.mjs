#!/usr/bin/env node
/* Bakes a pre-paste preflight for the internal endpoint flows into
 * scripts/preflight-internal-flows.browser.js.
 *
 * WHY THIS EXISTS
 *   Seven packages paste cleanly and then fail at run time for reasons the designer cannot see:
 *   a governance column that was never provisioned, a directory with no active row, a role
 *   catalogue whose permissions do not carry the capability the gate tests for. Every one of
 *   those surfaces as a 401, a 403 or a rejected write on the first real call — long after the
 *   paste, and attributed to the wrong thing.
 *
 *   The 2026-08-19 provisioning run covered thirteen lists and NOT ONE of DGO_AuditLog,
 *   DGO_UserDirectory or DGO_RoleCatalogue. Their item counts match the workbook's seed counts
 *   exactly, which is suggestive and is not proof. This is what turns it into proof.
 *
 *   The requirements are read out of the packages themselves rather than restated here, so the
 *   preflight cannot drift from what the flows actually do.
 *
 * Run after any change to the internal packages:
 *     node scripts/build-internal-preflight.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PKG_DIR = ROOT + 'docs/deployment/internal/flows/designer-paste/';
const OUT = ROOT + 'scripts/preflight-internal-flows.browser.js';
const isVariablesPackage = (f) => f.endsWith('.variables.designer-paste.json');

const lists = JSON.parse(readFileSync(ROOT + 'docs/reference/sharepoint-list-index.json', 'utf8')).lists;
const indexTargets = JSON.parse(readFileSync(ROOT + 'docs/deployment/sharepoint/index-targets.json', 'utf8')).targets;

/* Walk every package and record what each list is actually asked for. */
const need = new Map();
const flows = [];
for (const file of readdirSync(PKG_DIR).filter((f) => f.endsWith('.designer-paste.json') && !isVariablesPackage(f)).sort()) {
  const flow = file.replace('.designer-paste.json', '');
  flows.push(flow);
  const sv = JSON.parse(readFileSync(PKG_DIR + file, 'utf8')).serializedValue;
  (function walk(actions) {
    for (const v of Object.values(actions || {})) {
      if (!v || typeof v !== 'object') continue;
      const host = v.inputs?.host;
      if (host && v.inputs?.parameters?.table) {
        const guid = String(v.inputs.parameters.table).toLowerCase();
        const e = need.get(guid) || { writes: new Set(), filters: new Set(), flows: new Set(), writeSets: [] };
        e.flows.add(flow);
        const thisWrite = new Set();
        for (const [k, val] of Object.entries(v.inputs.parameters)) {
          if (k.startsWith('item/')) { const c = k.slice(5).split('/')[0]; e.writes.add(c); thisWrite.add(c); }
          /* EVERY OPERATOR, NOT JUST `eq`, AND THE SORT COLUMN TOO.
           *
           * This matched `<Col> eq ` and nothing else, so the scheduled sweep's two date filters
           * — `DueDate lt …` and `Acknowledgement_x0020_Due_x0020_ lt …` — were invisible to it.
           * The preflight said READY TO PASTE, the flow was imported, and its first live run
           * returned the list view threshold 400 on both. A detector that only sees equality
           * cannot report the filters that actually failed.
           *
           * $orderby is read for the same reason: past 5,000 items SharePoint refuses to SORT on
           * an unindexed column just as firmly as it refuses to filter on one, and three
           * packages sort those two lists on `Modified`. Neither had ever been looked at. */
          if (k === '$filter') {
            for (const m of String(val).matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s+(?:eq|ne|lt|le|gt|ge)\s/g)) e.filters.add(m[1]);
            for (const m of String(val).matchAll(/\b(?:startswith|substringof)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g)) e.filters.add(m[1]);
          }
          if (k === '$orderby') {
            for (const part of String(val).split(',')) {
              const col = part.trim().split(/\s+/)[0];
              if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) e.filters.add(col);
            }
          }
        }
        if (thisWrite.size && host.operationId === 'PostItem') e.writeSets.push(thisWrite);
        need.set(guid, e);
      }
      walk(v.actions);
      walk(v.else?.actions);
      if (v.cases) for (const c of Object.values(v.cases)) walk(c.actions);
      walk(v.default?.actions);
    }
  })(sv.actions);
}

const mustIndex = new Set(indexTargets.map((t) => `${t.listGuid.toLowerCase()} ${t.internalName}`));

/* The GUIDs the packages address, by title. Built from `need` rather than from the tenant index,
   so a title that names two lists in the tenant is unambiguous here as long as the packages use
   only one of them — and if they use both, that is a real ambiguity and the build stops. */
function seedGuid(title) {
  const hits = [...need.keys()].filter((g) => lists[g]?.title === title);
  if (hits.length === 1) return hits[0];
  const inTenant = Object.keys(lists).filter((g) => lists[g].title === title);
  throw new Error(hits.length === 0
    ? `No package addresses a list titled "${title}", so its seed cannot be checked. `
      + `The tenant holds ${inTenant.length} list(s) with that title: ${inTenant.join(', ')}. `
      + `Name the GUID the packages use, or drop the seed.`
    : `"${title}" resolves to ${hits.length} GUIDs the packages address (${hits.join(', ')}). `
      + `A seed must name one list; addressing by title cannot choose between them.`);
}

const SPEC = {
  flows,
  lists: [...need.entries()].map(([guid, e]) => {
    const l = lists[guid];
    if (!l) throw new Error(`${guid} is used by a package but is not in the tenant capture`);
    return {
      guid,
      title: l.title,
      siteUrl: l.siteUrl,
      itemsAtCapture: l.itemsAtCapture,
      writes: [...e.writes].sort(),
      /* A column only some creates supply is covered by a fallback: the packages write the
         telemetry row again without RunRecordJson when SharePoint rejects the unknown column,
         so its absence costs the run record and not the run. Derived from the packages — two
         creates against one list where one write set is a strict subset of the other — rather
         than named here, so a future fallback is picked up without editing this. */
      optionalWrites: [...e.writes].filter((c) => {
        const sets = e.writeSets;
        return sets.length > 1 && sets.some((w) => !w.has(c)) && sets.some((w) => w.has(c));
      }).sort(),
      filters: [...e.filters].sort(),
      /* WHAT MUST BE INDEXED IS DECIDED BY THE SIZE OF THE LIST, NOT BY A CURATED LIST.
       *
       * This intersected the filtered columns with index-targets.json, so a column could only be
       * reported as needing an index if someone had already written it down — which makes the
       * check incapable of finding the case it exists to find. The threshold is a property of
       * the LIST: past 5,000 items every filtered or sorted column needs an index, whoever
       * remembered to record it. index-targets.json is kept as an additional source, for a list
       * whose captured size is stale or unknown. */
      mustIndex: [...e.filters]
        .filter((c) => (lists[guid]?.itemsAtCapture ?? 0) > 5000 || mustIndex.has(`${guid} ${c}`))
        .sort(),
      usedBy: [...e.flows].sort(),
    };
  }).sort((a, b) =>byteCompare( a.title, b.title)),
  /* Seed conditions the gate depends on. Every internal flow resolves the caller from
     DGO_UserDirectory and the caller's permissions from DGO_RoleCatalogue; with either empty,
     or with no row matching the filter the flow uses, every call is refused and the refusal
     looks like a bug in the flow.

     ADDRESSED BY GUID, FROM THE PACKAGES, NEVER BY TITLE.
     These were resolved with `Object.keys(lists).find((g) => lists[g].title === '…')`, and both
     governance lists exist TWICE in this tenant — DGO_RoleCatalogue as 55c0daae on
     NITDADGO-EAAACTIVITYTRACKING and as f675598b on DGO_ECM_GOVERNANCE, DGO_UserDirectory
     likewise. `.find()` returns whichever comes first in key order, so the RoleCatalogue seed
     addressed the list on the site the packages do not use, and the UserDirectory seed was
     right by luck rather than by rule. The 2026-08-31 index run already recorded this hazard for
     exactly these two titles and set its own targets by GUID; the preflight did not follow.
     `seedGuid` therefore takes the GUID from `need` — the set the packages actually address —
     and refuses to build if a title does not resolve to exactly one of them. */
  seeds: [
    {
      guid: seedGuid('DGO_UserDirectory'),
      title: 'DGO_UserDirectory',
      /* $top was 1, and the report then printed "1 row(s)" — which reads as "there is one active
         user" when it only ever meant "the cap was reached". How many people the gate will admit
         is worth knowing before the first call, not after, so the cap is high enough to answer it
         and the report says when it has been hit. */
      query: "$filter=Status eq 'active'&$top=100",
      need: 'at least one row with Status = active',
      because: 'every flow resolves the caller here; with none, every call answers 401',
    },
    {
      guid: seedGuid('DGO_RoleCatalogue'),
      title: 'DGO_RoleCatalogue',
      query: "$filter=Active eq 1&$top=20&$select=RoleId,PermissionsJson,AllowedRoutesJson",
      need: "rows with Active = yes, and PermissionsJson carrying 'bulk:assign' and 'user:view'",
      because: 'the gate tests these strings; without them a known caller answers 403',
    },
    {
      guid: seedGuid('Flow Configuration'),
      title: 'Flow Configuration',
      query: "$filter=startswith(Title,'ALLOWED_ORIGIN')&$top=20&$select=Title,ConfigValue",
      need: 'at least one row whose ConfigValue is the portal origin',
      because: 'CORS fails closed — with no row a browser refuses every response',
    },
  ],
};

const banner = `/* GENERATED FILE — do not edit by hand.
 * Built from the seven internal designer-paste packages and the tenant capture by
 * scripts/build-internal-preflight.mjs. Change the packages and re-run.
 */\n`;

const template = readFileSync(ROOT + 'scripts/lib/internal-preflight.template.js', 'utf8');
const marker = '/* __SPEC__ */';
if (!template.includes(marker)) { console.error(`Template has no ${marker}`); process.exit(1); }
const built = banner + template.replace(marker, JSON.stringify(SPEC, null, 2));

const cols = SPEC.lists.reduce((n, l) => n + l.writes.length + l.filters.length, 0);
const summary = `${SPEC.lists.length} lists, ${cols} column requirements, ${SPEC.seeds.length} seed conditions, ${flows.length} flows`;

/* A preflight that has drifted from the packages is worse than none: it clears a paste whose
   real requirements it no longer knows. --check makes that a build failure. */
if (process.argv.includes('--check')) {
  const current = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })();
  if (current !== built) {
    console.error('❌ preflight is stale — run: node scripts/build-internal-preflight.mjs');
    process.exit(1);
  }
  console.log(`✅ preflight matches the packages — ${summary}`);
} else {
  writeFileSync(OUT, built);
  console.log(`Wrote ${OUT} — ${summary}`);
}
