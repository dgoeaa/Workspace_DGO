#!/usr/bin/env node
/**
 * Generate the approved routing configuration from the agency's own reference data.
 *
 * Source of record is docs/reference/approved/, approved by the agency on 2026-09-08 and
 * closing MANUAL-1. The routing table is no longer a reading of the fallback matrix — it is
 * the matrix, and this generator is the only thing that writes it.
 *
 * PERSONAL DATA. The departments export carried a DSU_Head Personal_Email column naming 44
 * individuals. It is not in docs/reference/approved/ and must never be: individual identity
 * lives in the DGO_UserDirectory SharePoint list and is resolved at runtime. This generator
 * fails if an address that identifies a person reaches the configuration, so the rule is
 * enforced rather than remembered.
 *
 *   node scripts/build-org-routing.mjs           # write
 *   node scripts/build-org-routing.mjs --check    # fail if stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const UNITS_CSV = 'docs/reference/approved/organizational-units.csv';
const MATRIX_CSV = 'docs/reference/approved/category-matrix.csv';
const FIXES_CSV = 'docs/reference/approved/dsu-key-corrections.csv';
const OUT_UNITS = 'config/organizational-units.config.js';
const OUT_MATRIX = 'config/category-matrix.config.js';

/* A minimal RFC4180 reader. The estate has no runtime dependencies and this file is generated
   at author time, so a parser is cheaper than a dependency. */
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const read = p => parseCsv(readFileSync(join(ROOT, p), 'utf8'));
const units = read(UNITS_CSV);
const supplied = read(MATRIX_CSV);
const fixes = read(FIXES_CSV);

/* Corrections adopted by the agency on 2026-09-08, held apart from the matrix rather than
   edited into it. The CSV the agency supplied stays verbatim as the record of what was
   approved; this file records what was then read into it and why. Applying them here means a
   later re-supply of the matrix does not silently lose them. */
const remap = new Map(fixes.filter(f => f.Kind === 'dsuKey').map(f => [f.From.toUpperCase(), f.To]));
const respell = new Map(fixes.filter(f => f.Kind === 'subcategory').map(f => [f.From.toLowerCase(), f.To]));

/* A row correction names one category/subcategory pair and sets its responsible unit. The
   agency directed these rows to carry a responsible unit and NO supporting or informed unit,
   so the correction clears those three columns rather than leaving whatever stood there — for
   PROPOSALS that means dropping the DGO which sat in INFORMDSU1, since DGO now owns the row
   and informing a unit of its own work is noise. */
const rowFix = new Map(fixes.filter(f => f.Kind === 'row')
  .map(f => [f.From.toLowerCase(), f.To]));

const corrected = supplied.map(r => {
  const row = { ...r };
  const key = (row['Default Primary Responsible'] || '').trim().toUpperCase();
  if (remap.has(key)) row['Default Primary Responsible'] = remap.get(key);
  const sub = (row.Subcategory || '').trim().toLowerCase();
  if (respell.has(sub)) row.Subcategory = respell.get(sub);

  const pair = `${(row.Title || '').trim()}|${(row.Subcategory || '').trim()}`.toLowerCase();
  if (rowFix.has(pair)) {
    row['Default Primary Responsible'] = rowFix.get(pair);
    row['Default Supporting Department/Unit'] = '';
    row.INFORMDSU1 = ''; row.INFORMDSU2 = ''; row.INFORMDSU3 = '';
  }
  return row;
});

/* A correction can turn two rows into one — the matrix carried Educational Institutions twice,
   the second a transcription error. Routing keys on the category/subcategory pair, so the
   duplicate must collapse rather than sit unreachable behind its twin. */
const seen = new Set();
const matrix = corrected.filter(r => {
  const k = `${r.Title}\u0000${r.Subcategory}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});
const collapsed = corrected.length - matrix.length;

const keys = new Set(units.map(u => u.DSU_KEY.toUpperCase()).filter(Boolean));
const GENERIC = new Set(['DG', 'DGS', 'DGCEO', 'REGISTRY', 'DOMAINS', 'ICEGOV', 'DIGITALNIGERIA',
  'CERRT', 'SERVICOM', 'NCSC', 'NCSCSECRETARIAT', 'ITPC', 'ITPCU', 'IICP', 'PPPU', 'HPPPU', 'COMDIR']);

/* A mailbox is a ROLE mailbox when its local part is a unit key, a generic office name, or one
   of those behind a headship prefix (D=Director, H=Head, N/ND/NC=National Coordinator). Anything
   else names a person and is refused. */
function isRoleMailbox(email) {
  const local = String(email || '').split('@')[0].trim().toUpperCase();
  if (!local) return true;
  if (keys.has(local) || GENERIC.has(local)) return true;
  return ['D', 'H', 'N', 'ND', 'NC', 'HS'].some(p => local.startsWith(p) && keys.has(local.slice(p.length)));
}

const leaked = [];
for (const u of units) for (const col of ['DSU_Email', 'DSU_HeadEmail']) {
  if (u[col] && !isRoleMailbox(u[col])) leaked.push(`${u.DSU_KEY}.${col} = ${u[col]}`);
}
if (leaked.length) {
  console.error(`❌ ${leaked.length} address(es) identify a person and must live in DGO_UserDirectory, not in configuration:`);
  leaked.forEach(l => console.error(`   ${l}`));
  process.exit(1);
}

const q = s => JSON.stringify(String(s ?? ''));
const num = v => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };

const unitsJs = `/* GENERATED by npm run orgrouting — do not edit. Source: ${UNITS_CSV} */

/**
 * NITDA organizational units, as approved by the agency on 2026-09-08.
 *
 * ⚠️ NO PERSONAL DATA. Every address here is a role mailbox — a unit key, an office name, or
 * one behind a headship prefix. The approved export also carried a personal email for 44 named
 * heads; those are NOT here and must not be added. Individual identity is resolved at runtime
 * from the DGO_UserDirectory SharePoint list. \`npm run test:orgrouting\` fails if an address
 * that identifies a person appears in this file.
 *
 * headTitle is the title of the POST, not of a person: "DHRM" is whoever directs Human Resource
 * Management, and survives the holder changing.
 */
export const OrganizationalUnits = Object.freeze([
${units.map(u => `  Object.freeze({ key: ${q(u.DSU_KEY)}, title: ${q(u.Title)}, email: ${q(u.DSU_Email)}, headEmail: ${q(u.DSU_HeadEmail)}, headshipType: ${q(u.HeadshipType)}, headTitle: ${q(u.HeadTitle)} }),`).join('\n')}
]);

/** key → unit, for the resolvers that only hold a DSU key. */
export const UnitByKey = Object.freeze(Object.fromEntries(
  OrganizationalUnits.map(u => [u.key.toUpperCase(), u]),
));

/** The mailbox to address for a unit: its head's post, else the unit's own. '' when neither. */
export function mailboxFor(dsuKey) {
  const u = UnitByKey[String(dsuKey || '').trim().toUpperCase()];
  return u ? (u.headEmail || u.email || '') : '';
}
`;

const rowJs = r => {
  const inform = ['INFORMDSU1', 'INFORMDSU2', 'INFORMDSU3'].map(k => r[k]).filter(Boolean);
  const spt = num(r.SPT), ept = num(r.EPT);
  return `  Object.freeze({ category: ${q(r.Title)}, categoryCode: ${q(r['Category Code'])}, `
    + `subcategory: ${q(r.Subcategory)}, subcategoryCode: ${q(r['SubCategory Code'])}, `
    + `dsuKey: ${q(r['Default Primary Responsible'])}, supportDsuKey: ${q(r['Default Supporting Department/Unit'])}, `
    + `informDsu: Object.freeze([${inform.map(q).join(', ')}]), listName: ${q(r['List Name'])}, `
    + `priority: ${q(r.Priority)}, ackDays: ${spt === null ? 'null' : spt}, dueDays: ${ept === null ? 'null' : ept}, `
    + `description: ${q(r.Description)} }),`;
};

const categories = [...new Set(matrix.map(r => r.Title).filter(Boolean))];
const matrixJs = `/* GENERATED by npm run orgrouting — do not edit. Source: ${MATRIX_CSV} */

/**
 * The approved category matrix. Agency approval of 2026-09-08 closes MANUAL-1.
 *
 * This replaces the provisional eleven-kind routing table, which was a reading of the fallback
 * matrix rather than a statement of the operating model. Routing is now Category + Subcategory
 * → a responsible unit, a supporting unit, and up to three units informed.
 *
 * ⚠️ NO PERSONAL DATA. Rows name DSU keys, never people. Resolve a key to a mailbox with
 * mailboxFor() from organizational-units.config.js, which returns a role mailbox; resolve a key
 * to a PERSON through the DGO_UserDirectory SharePoint list at runtime.
 *
 * ackDays and dueDays come from the approved SPT and EPT columns. A row whose timeline the
 * agency recorded as "Ongoing" carries null rather than an invented number.
 */
export const CategoryMatrix = Object.freeze([
${matrix.map(rowJs).join('\n')}
]);

/** The approved categories, in the order the agency listed them. */
export const ApprovedCategories = Object.freeze([
${categories.map(c => `  ${q(c)},`).join('\n')}
]);

/** Where an unmatched category lands. Approved default: the registry classifies and minutes. */
export const DEFAULT_CATEGORY = 'Unclassifieds';

/** Every row for a category. */
export function subcategoriesOf(category) {
  const c = String(category || '').trim().toLowerCase();
  return CategoryMatrix.filter(r => r.category.toLowerCase() === c);
}

/**
 * A row whose subcategory is the catch-all for its category, if the category has one.
 *
 * Without this, a category with no subcategory given resolves to whichever row happens to sort
 * first — so "General Correspondence" landed on Human Resources purely because Human Resources
 * is the first Administrative Matters row. That is an accident of ordering, not a routing
 * decision, and it is the failure tests/categories.test.mjs exists to catch.
 */
const GENERIC_SUBCATEGORY = /^(general|n[/.]a|others?|mainstream|miscellaneous)/i;

/** The matrix row for a category/subcategory pair, or null. Subcategory optional. */
export function routeFor(category, subcategory) {
  const c = String(category || '').trim().toLowerCase();
  const s = String(subcategory || '').trim().toLowerCase();
  const rows = CategoryMatrix.filter(r => r.category.toLowerCase() === c);
  if (!rows.length) return null;
  const fallback = rows.find(r => GENERIC_SUBCATEGORY.test(r.subcategory)) || rows[0];
  if (!s) return fallback;
  return rows.find(r => r.subcategory.toLowerCase() === s
    || r.subcategoryCode.toLowerCase() === s) || fallback;
}
`;

const files = { [OUT_UNITS]: unitsJs, [OUT_MATRIX]: matrixJs };

if (CHECK) {
  const stale = Object.entries(files).filter(([p, c]) => {
    try { return readFileSync(join(ROOT, p), 'utf8') !== c; } catch { return true; }
  }).map(([p]) => p);
  if (stale.length) {
    console.error(`❌ approved routing config is stale — run: npm run orgrouting\n   ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ approved routing config is current — ${units.length} units, ${matrix.length} matrix rows, ${categories.length} categories, ${remap.size + respell.size + rowFix.size} adopted correction(s), 0 personal addresses`);
} else {
  for (const [p, c] of Object.entries(files)) writeFileSync(join(ROOT, p), c);
  console.log(`Wrote ${OUT_UNITS} and ${OUT_MATRIX}`);
  console.log(`  units      : ${units.length}`);
  console.log(`  matrix rows: ${matrix.length}`);
  console.log(`  categories : ${categories.length}`);
  console.log(`  corrections applied: ${remap.size} unit key(s), ${respell.size} spelling(s), ${rowFix.size} row assignment(s), ${collapsed} duplicate row(s) collapsed`);
  console.log(`  personal addresses admitted: 0 (refused by the generator)`);
}
