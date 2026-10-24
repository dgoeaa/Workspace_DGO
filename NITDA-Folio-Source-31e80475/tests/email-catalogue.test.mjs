/**
 * The e-mail catalogue (ITEM-68): every identification package's send takes its body from the catalogue, exactly.
 *
 *   1. every send in every package has a catalogue entry, and every entry a package send
 *   2. the body the package composes is the template, character for character
 *   3. a body composed in parts: each part at most 6,000 characters, none starting with "@", none cutting an @{…} expression
 *   4. the cut is lossless on every template
 */
import { readFileSync, readdirSync } from 'node:fs';
import { CATALOGUE_DIR, PART_LIMIT, messagesOf, cut, sha, loadCatalogue } from '../scripts/lib/email-catalogue.mjs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nE-mail catalogue\n');

const cat = loadCatalogue('.');
ok(cat && cat.messages.length > 40, `the catalogue lists the packages' messages (${cat?.messages.length})`);
const B = 'docs/folio-Master-Flows-and-Endpoints/packages';
const sends = [];
for (const d of ['identification-phase3', 'identification-phase4']) {
  for (const f of readdirSync(`${B}/${d}`).filter((x) => x.endsWith('.paste.json'))) {
    const pkg = JSON.parse(readFileSync(`${B}/${d}/${f}`, 'utf8'));
    for (const m of messagesOf(pkg)) sends.push({ f, pkg, m });
  }
}
const unlisted = sends.filter(({ f, m }) => !cat.messages.some((e) => e.package === f && e.send === m.send)).map(({ f, m }) => `${f}: ${m.send}`);
const orphan = cat.messages.filter((e) => !sends.some(({ f, m }) => e.package === f && e.send === m.send)).map((e) => e.file);
ok(!unlisted.length && !orphan.length, `every send (${sends.length}) has a template and every template a send`, [...unlisted, ...orphan].join('; '));

const differ = [], badPart = [];
const balanced = (t) => { let depth = 0, quote = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (!depth) { if (c === '@' && t[i + 1] === '{') { depth = 1; i++; } continue; } if (quote) { if (c === "'") quote = false; continue; } if (c === "'") quote = true; else if (c === '{') depth++; else if (c === '}') depth--; } return depth === 0; };
for (const { f, pkg, m } of sends) {
  const e = cat.messages.find((x) => x.package === f && x.send === m.send);
  if (!e) continue;
  const t = readFileSync(`${CATALOGUE_DIR}/${e.file}`, 'utf8');
  if (sha(t) !== e.sha256 || m.html !== t || m.shape !== e.shape) differ.push(`${f}: ${m.send}`);
  if (m.shape === 'parts') {
    const all = {}; const walk = (o) => { for (const [n, a] of Object.entries(o || {})) { all[n] = a; walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions); } }; walk(pkg.serializedValue.actions);
    for (const n of m.parts) { const p = all[n].inputs; if (p.length > PART_LIMIT || p.startsWith('@') || !balanced(p)) badPart.push(`${f}: ${n}`); }
  }
}
ok(!differ.length, 'every package body is its catalogue template, character for character', differ.join('; '));
ok(!badPart.length, `every part is at most ${PART_LIMIT} characters, starts with no "@" and closes every expression it opens`, badPart.join('; '));

const lossy = cat.messages.filter((e) => { const t = readFileSync(`${CATALOGUE_DIR}/${e.file}`, 'utf8'); return cut(t).join('') !== t; }).map((e) => e.file);
ok(!lossy.length, 'cutting a template into parts loses nothing', lossy.join('; '));

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
