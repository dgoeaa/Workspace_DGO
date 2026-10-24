#!/usr/bin/env node
/**
 * THE ATLAS MUST STAY A READING OF THE CONTRACTS, AND MUST NOT BECOME THE HARVEST AGAIN.
 *
 * docs/reference/PROVISIONING_ATLAS.html replaces, for current use, the visualization under
 * docs/reference/foundational/ — a file docs/README.md classifies as *untrusted, prefer the
 * contract over the sample*, and which four separate gates exclude because a verbatim record is
 * never edited to agree with the present.
 *
 * Three things about that harvest made it actively misleading rather than merely dated, and all
 * three are failure modes the replacement could drift back into:
 *
 *   1. It addressed `NITDADGO-EAAACTIVITYTRACKING`. GOV-01 moved the governance lists to
 *      `DGO_ECM_GOVERNANCE` on 2026-09-09. An operator following the superseded document
 *      provisions into the wrong site.
 *   2. It described creating lists by title. Creating by title twice is what produced GOV-02 and
 *      the seventeen duplicates still standing. The contract updates in place and never creates.
 *   3. It rendered a design-time definition as though it recorded a completed run. Every one of
 *      the registry contract's 102 field rows says `Defined; …` — the contract's own first risk
 *      is "do not treat Defined as Created".
 *
 * So this suite checks the atlas is current, complete against both contracts, and still says the
 * three things the harvest could not.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log(`  ❌ ${m}${d ? `\n       ${d}` : ''}`)); };

console.log('\nProvisioning atlas — a reading of the contracts, not a restyle of the harvest\n');

const TARGET = 'docs/reference/PROVISIONING_ATLAS.html';
const GOV_SPEC = 'docs/reference/sharepoint-provisioning-spec.json';
const REG_SPEC = 'docs/reference/http-flow-registry-spec.json';
const HARVEST = 'docs/reference/foundational/lists-and-data/DGO_POWER_AUTOMATE_PROVISIONING_FULL_VISUALIZATION.html';

/* ------------------------------------------------------------------ *
 * 1 · it is current
 * ------------------------------------------------------------------ */

{
  let code = 0, out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/build-provisioning-atlas.mjs'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
  } catch (e) { code = e.status ?? 1; out = `${e.stdout || ''}${e.stderr || ''}`; }
  ok(code === 0, 'npm run provisioning:atlas is current', out.trim().split('\n').slice(-2).join(' '));
}

if (!existsSync(join(ROOT, TARGET))) {
  console.log(`\n❌ ${TARGET} does not exist — run npm run provisioning:atlas\n`);
  process.exit(1);
}

const html = read(TARGET);
const gov = JSON.parse(read(GOV_SPEC));
const reg = JSON.parse(read(REG_SPEC));

/* The page carries its data as one JSON payload; parse it rather than grepping the markup, so
   these assertions are about what the document SAYS and not about how it is rendered. */
const payload = (/<script id="atlas" type="application\/json">([\s\S]*?)<\/script>/.exec(html) || [])[1];
ok(Boolean(payload), 'the page carries its data as parseable JSON');
const atlas = payload ? JSON.parse(payload.replace(/<\\\//g, '</')) : { scopes: [], retire: [] };

/* ------------------------------------------------------------------ *
 * 2 · both contracts are rendered, whole
 * ------------------------------------------------------------------ */

{
  ok(atlas.scopes.length === 2, 'both provisioning scopes are present',
    `found ${atlas.scopes.map((s) => s.id).join(', ')}`);

  const g = atlas.scopes.find((s) => s.id === 'governance') || { lists: [], fields: [], seeds: [], actions: [], checks: [] };
  const r = atlas.scopes.find((s) => s.id === 'registry') || { lists: [], fields: [], seeds: [], actions: [], views: [], uniqueKeys: [], settings: [], rest: [] };

  const counts = [
    ['governance lists', g.lists.length, gov.lists.length],
    ['governance fields', g.fields.length, gov.fields.length],
    ['governance seeds', g.seeds.length, gov.seedItems.length],
    ['governance actions', g.actions.length, gov.powerAutomateActions.length],
    ['governance checks', g.checks.length, gov.validationChecks.length],
    ['registry lists', r.lists.length, reg.lists.length],
    ['registry fields', r.fields.length, reg.fields.length],
    ['registry config seeds', r.seeds.length, reg.configSeeds.length],
    ['registry actions', r.actions.length, reg.workflowActions.length],
    ['registry views', r.views.length, reg.views.length],
    ['registry unique keys', r.uniqueKeys.length, reg.uniqueKeys.length],
    ['registry list settings', r.settings.length, reg.listSettings.length],
    ['registry REST calls', r.rest.length, reg.restRequests.length],
  ];
  const short = counts.filter(([, got, want]) => got !== want);
  ok(short.length === 0,
    `every row of both contracts is rendered (${counts.reduce((n, [, got]) => n + got, 0)} rows)`,
    short.map(([what, got, want]) => `${what}: ${got} rendered, ${want} in the contract`).join('; '));

  /* A field that belongs to no rendered list is a field nobody can reach: the list index is the
     only way into the detail pane, so an orphan is invisible however complete the count is. */
  const orphans = [];
  for (const s of atlas.scopes) {
    const titles = new Set(s.lists.map((l) => l.title));
    for (const f of s.fields) if (!titles.has(f.list)) orphans.push(`${s.id}: ${f.list}.${f.internalName}`);
  }
  ok(orphans.length === 0, 'every field belongs to a list the index offers',
    orphans.slice(0, 6).join(', '));

  /* Schema XML is the thing an operator actually pastes. Rendering the row without it turns the
     page back into a summary of a provisioning run rather than a record of one. */
  const noXml = atlas.scopes.flatMap((s) => s.fields.filter((f) => !f.schemaXml).map((f) => `${f.list}.${f.internalName}`));
  ok(noXml.length === 0, 'every field carries the schema XML its contract states', noXml.slice(0, 5).join(', '));
}

/* ------------------------------------------------------------------ *
 * 3 · nothing is invented
 * ------------------------------------------------------------------ */

{
  const g = atlas.scopes.find((s) => s.id === 'governance');
  const r = atlas.scopes.find((s) => s.id === 'registry');

  /* Spot-check the join in both directions: a rendered value must be the contract's value, and a
     value the contract does not state must be null rather than borrowed from the other scope. */
  const govField = g.fields.find((f) => f.internalName === 'UserId' && f.list === 'DGO_UserDirectory');
  const govSource = gov.fields.find((f) => f.InternalName === 'UserId' && f.ListTitle === 'DGO_UserDirectory');
  ok(govField && govSource && govField.schemaXml === govSource.SchemaXml,
    'a governance field renders its contract\'s schema XML verbatim');

  const regField = r.fields.find((f) => f.internalName === 'RegistryKey');
  const regSource = reg.fields.find((f) => f.internalName === 'RegistryKey');
  ok(regField && regSource && regField.schemaXml === regSource.schemaXml && regField.unique === true,
    'a registry field renders its contract\'s schema XML and uniqueness verbatim');

  /* The governance contract states no per-field uniqueness. The registry one does. Filling the
     gap from the sibling scope would be the exact failure this document exists to avoid. */
  const borrowed = g.fields.filter((f) => f.unique !== null);
  ok(borrowed.length === 0,
    'a value the governance contract does not state stays null rather than borrowing the registry\'s',
    borrowed.slice(0, 4).map((f) => f.internalName).join(', '));

  /* And the registry contract states no GUIDs, because the lists do not exist. */
  const guessedGuids = r.lists.filter((l) => l.guid);
  ok(guessedGuids.length === 0, 'no GUID is shown for a list that does not exist',
    guessedGuids.map((l) => l.title).join(', '));
}

/* ------------------------------------------------------------------ *
 * 4 · the three things the harvest could not say
 * ------------------------------------------------------------------ */

{
  const g = atlas.scopes.find((s) => s.id === 'governance');
  const r = atlas.scopes.find((s) => s.id === 'registry');

  const AUTHORITATIVE = 'DGO_ECM_GOVERNANCE';
  const SUPERSEDED = 'NITDADGO-EAAACTIVITYTRACKING';

  ok(g.targetSite && g.targetSite.includes(AUTHORITATIVE),
    'the governance scope targets the authoritative site GOV-01 named', `targets ${g.targetSite}`);
  ok(r.targetSite && r.targetSite.includes(AUTHORITATIVE),
    'the registry scope targets it too', `targets ${r.targetSite}`);

  const listSites = [...g.lists, ...r.lists].map((l) => l.site).filter(Boolean);
  const wrong = listSites.filter((s) => s.includes(SUPERSEDED));
  ok(wrong.length === 0,
    `no list addresses the superseded site (${listSites.length} addressed)`,
    `${wrong.length} still point at ${SUPERSEDED}`);

  /* It may NAME the superseded site — saying which site was left behind is the point — but only
     as the thing that was superseded. */
  ok(g.supersedes && g.supersedes.includes(SUPERSEDED),
    'the page names the superseded site, as superseded');

  ok(/update-in-place/.test(g.mode || ''),
    'the governance scope states that it updates in place and does not create', `mode: ${g.mode}`);

  ok(/defined is not created/i.test(html),
    'the page states, in the reader\'s first screen, that defined is not created');

  /* Every registry field states its execution evidence, and every field the workbook declares
     states it as "Defined". The exception is real and is not smoothed over: the amended columns
     carry a different sentence, because they are not in the workbook at all — and a page that
     rendered 102 identical "Defined" rows would hide the divergence the contract warns about. */
  const noEvidence = r.fields.filter((f) => !f.evidence);
  ok(noEvidence.length === 0, 'every registry field states its execution evidence',
    noEvidence.slice(0, 5).map((f) => f.internalName).join(', '));

  const fromWorkbook = r.fields.filter((f) => !f.amended);
  const defined = fromWorkbook.filter((f) => /^Defined/i.test(f.evidence || '')).length;
  ok(defined === fromWorkbook.length,
    `every field the workbook declares carries "Defined" evidence (${defined}/${fromWorkbook.length})`);

  const amended = r.fields.filter((f) => f.amended);
  ok(amended.length === (reg.amendments?.applied || []).length && amended.length > 0,
    `the ${amended.length} amended column(s) are marked as not from the workbook`,
    `contract applies ${(reg.amendments?.applied || []).length}`);
  ok(r.amendments && r.amendments.divergence && html.includes('Consequence'),
    'the page states what provisioning an amended column does to flow 01’s expected-field count');

  ok(r.standing === 'NONE EXIST' && g.standing.startsWith('ALL'),
    'each scope states its standing in the tenant, and the two differ',
    `${g.standing} / ${r.standing}`);

  ok(Array.isArray(atlas.retire) && atlas.retire.length > 0,
    `the duplicate instances GOV-02 left are carried (${atlas.retire.length})`);
}

/* ------------------------------------------------------------------ *
 * 5 · the harvest is gone and the atlas stands alone
 * ------------------------------------------------------------------ */

{
  /* The atlas was written to supersede a harvested visualisation WITHOUT rewriting it, and this
     section used to assert that the harvested file was still on disk and unedited. The harvest
     corpus has since been removed from the estate, so the atlas is not a replacement standing
     beside an original any more — it is the only copy. The assertion is inverted rather than
     deleted: if the harvest is ever restored there are two documents describing one thing again,
     and the reader has no way to tell which is current. */
  ok(!existsSync(join(ROOT, HARVEST)),
    'the superseded harvest is not carried beside the atlas',
    `${HARVEST} is back on disk — the atlas is meant to be the only copy`);
}

/* ------------------------------------------------------------------ *
 * 6 · the interface complaints are actually addressed
 * ------------------------------------------------------------------ */

{
  /* These are structural, not aesthetic: each one names a defect in the harvest that made it
     unusable, and asserts the mechanism that fixes it is present. */
  const has = (re, what) => ok(re.test(html), what);

  has(/id="q"[^>]*type="search"/, 'fields are searchable — the harvest had no search at all');
  has(/data-f="required"[\s\S]{0,400}data-f="indexed"[\s\S]{0,400}data-f="unique"/,
    'fields can be filtered by obligation, index and uniqueness');
  has(/aria-pressed/, 'every toggle reports its state to assistive technology');
  has(/IntersectionObserver/, 'the navigation tracks which section you are in');
  has(/role="tablist"/, 'the list index is a tablist, not thirty loose anchors');
  has(/@media \(max-width:860px\)/, 'the layout is redesigned for narrow screens, not merely stacked');
  has(/@media \(prefers-reduced-motion: reduce\)/, 'motion is opt-out');
  has(/env\(safe-area-inset-top, 0px\)/, 'the sticky bar clears the phone\'s system bars');

  /* The harvest's tables carried `min-width:850px`, which forces the whole page to scroll
     sideways on a phone. Every table here scrolls inside its own container instead. */
  ok(!/min-width:\s*8[0-9]{2}px/.test(html),
    'no table forces a minimum width wider than a phone');
  ok(/\.tw\{overflow-x:auto/.test(html),
    'tables that must stay tabular scroll inside their own container');

  /* NO EXTERNAL RESOURCE, EVER.
     The first version of this page linked three families from fonts.googleapis.com. Every other
     committed HTML document in this estate loads nothing external, and tests/references.test.mjs
     names the standard: "No server, no network, no dependencies." An operator opening this on a
     locked-down tenant machine would have got a page that silently changed shape. The tenant URL
     the contracts name is data the page PRINTS, not a resource it fetches, which is why the check
     is on loading constructs rather than on the string. */
  const loaders = [...html.matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"/gi)].map((m) => m[1]);
  ok(loaders.length === 0,
    'the page loads nothing from the network — it opens identically with the network off',
    loaders.slice(0, 4).join(', '));
  ok(!/@import\s+url\(|fonts\.googleapis|fonts\.gstatic|cdnjs|jsdelivr|unpkg/i.test(html),
    'no stylesheet, font or script host is referenced by any other route');

  /* Both themes are defined token-level, and the body paints its own ground. */
  ok(/:root:not\(\[data-theme="light"\]\)/.test(html) && /:root\[data-theme="dark"\]/.test(html),
    'dark resolves for the system default and for an explicit toggle');
  ok(/body\{[\s\S]{0,120}background:var\(--ground\)/.test(html),
    'the body paints an explicit background rather than borrowing the host\'s');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
