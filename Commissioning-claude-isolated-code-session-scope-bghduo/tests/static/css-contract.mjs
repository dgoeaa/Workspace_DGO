#!/usr/bin/env node
/**
 * CSS contract - the ratchet styles/index.css has always cited.
 *
 * Referenced by 8 source files for the life of the project and never present. The
 * override-overlap budget it was said to enforce therefore constrained nothing, which is
 * how app.css reached ~3x the size of the components it overrides. Every number in
 * tests/baseline.json was measured against the tree it ships with; none was chosen.
 *
 * A baseline may go DOWN freely - commit the improvement in the same change. Raising one
 * fails the run. tokens.undefined and typography.belowFloor must reach 0 and stay there.
 *
 *   node tests/static/css-contract.mjs           check
 *   node tests/static/css-contract.mjs --report  print values, exit 0
 *   node tests/static/css-contract.mjs --update  rewrite baseline (improvements only)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = join(ROOT, 'tests', 'baseline.json');
const TYPE_FLOOR_PX = 11; // --dgo-type-floor, DGO-R5-TYPO-01

const read = p => readFileSync(join(ROOT, p), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Minimal block parser: at-rules become context, comments are gone. Not a CSS engine. */
function parse(css) {
  css = strip(css);
  const rules = []; let i = 0, cur = '', ctx = [], stack = [];
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      const sel = cur.trim(); cur = '';
      if (sel.startsWith('@')) { ctx.push(sel); stack.push('at'); }
      else stack.push({ sel, ctx: [...ctx], body: '' });
      i++; continue;
    }
    if (ch === '}') {
      const t = stack.pop();
      if (t === 'at') ctx.pop(); else if (t) { t.body = cur; rules.push(t); }
      cur = ''; i++; continue;
    }
    cur += ch; i++;
  }
  return rules;
}
const propsOf = b => b.split(';').map(d => d.split(':')[0].trim().toLowerCase())
  .filter(p => p && !p.startsWith('--'));
const classesOf = s => [...new Set((s.match(/\.[A-Za-z0-9_-]+/g) || []).map(c => c.slice(1)))];
function pairs(rules) {
  const set = new Set();
  for (const r of rules) {
    const scope = r.ctx.length ? '@' : '';
    for (const c of classesOf(r.sel)) for (const p of propsOf(r.body)) set.add(c + '|' + p + scope);
  }
  return set;
}

const CSS_APP = 'styles/app.css';
const CSS_AUTH = 'styles/dgo-design-system/platform-authority.css';
const CSS_COMP = 'styles/dgo-design-system/components.css';
const ALL_CSS = ['styles/index.css', CSS_APP,
  ...['platform-authority','base','reset','layout','components','colors_and_type','brand-type']
    .map(n => 'styles/dgo-design-system/' + n + '.css'),
  ...['primitive','semantic','component','density','breakpoint','enhanced','legacy-bridge',
      'theme-light','theme-dark','theme-hc']
    .map(n => 'styles/dgo-design-system/tokens/tokens.' + n + '.css')];
const jsIn = dir => existsSync(join(ROOT, dir))
  ? readdirSync(join(ROOT, dir)).filter(f => f.endsWith('.js')).map(f => dir + '/' + f) : [];
const ALL_JS = [...jsIn('core'), ...jsIn('modules'), ...jsIn('shared')];

function measure() {
  const app = parse(read(CSS_APP)), auth = parse(read(CSS_AUTH)), comp = parse(read(CSS_COMP));
  const appCss = strip(read(CSS_APP));
  const A = pairs(app), P = pairs(auth), C = pairs(comp);
  const inter = (x, y) => [...x].filter(k => y.has(k)).length;
  const paVsApp = inter(P, A), compVsApp = inter(C, A);

  // tokens
  const defined = new Map(); let allCss = '';
  for (const f of ALL_CSS) {
    const c = read(f); allCss += c;
    for (const m of strip(c).matchAll(/(--dgo-[a-z0-9-]+)\s*:/g)) {
      if (!defined.has(m[1])) defined.set(m[1], new Set());
      defined.get(m[1]).add(f.split('/').pop());
    }
  }
  const refs = new Set();
  for (const m of strip(allCss).matchAll(/var\(\s*(--dgo-[a-z0-9-]+)/g)) refs.add(m[1]);
  for (const f of ALL_JS) for (const m of read(f).matchAll(/--dgo-[a-z0-9-]+/g)) refs.add(m[0]);
  const orphans = [...defined.keys()].filter(k => !refs.has(k));
  const undef = [...refs].filter(k => !defined.has(k));
  const shadowed = [...defined.entries()]
    .filter(([, fs]) => fs.has('app.css') && fs.size > 1).map(([k]) => k);

  // typography
  const sizes = [...appCss.matchAll(/font-size\s*:\s*([^;!}]+)/g)].map(m => m[1].trim());
  const literal = sizes.filter(v => /^\d+(\.\d+)?px$/.test(v));
  const belowFloor = literal.filter(v => parseFloat(v) < TYPE_FLOOR_PX);

  // colour
  const hex = [...appCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase());

  // responsive
  const queries = [...appCss.matchAll(/@(media|container)([^{]+)\{/g)]
    .map(m => m[1] + ' ' + m[2].trim().replace(/\s+/g, ''));
  const cols = {};
  for (const r of app) {
    const m = r.body.match(/grid-template-columns\s*:\s*([^;]+)/); if (!m) continue;
    const mw = (r.ctx.join(' ').match(/max-width:\s*(\d+)/) || [])[1];
    const n = (m[1].match(/repeat\(\s*(\d+)/) || [])[1]; if (!n) continue;
    const k = r.sel.replace(/\s+/g, ' ').trim();
    (cols[k] = cols[k] || []).push({ w: mw ? +mw : Infinity, n: +n });
  }
  const inverted = Object.entries(cols).filter(([, l]) => {
    const s = l.sort((a, b) => a.w - b.w);
    return s.some((x, i) => i > 0 && x.n < s[i - 1].n);
  }).map(([s]) => s);
  const seen = new Map(); let dead = 0;
  for (const r of app) {
    const k = r.sel.replace(/\s+/g, ' ').trim() + '@@' + r.ctx.join('&&');
    if (!seen.has(k)) seen.set(k, new Set());
    const m = seen.get(k);
    for (const p of propsOf(r.body)) { if (m.has(p)) dead++; m.add(p); }
  }

  // surface
  const definedClasses = new Set();
  for (const f of ALL_CSS)
    for (const m of strip(read(f)).matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) definedClasses.add(m[1]);
  const usedClasses = new Set();
  for (const f of [...ALL_JS, 'index.html']) {
    if (!existsSync(join(ROOT, f))) continue;
    const c = read(f);
    for (const m of c.matchAll(/class="([^"$]*)"/g))
      m[1].split(/\s+/).forEach(x => { if (x) usedClasses.add(x); });
    for (const m of c.matchAll(/classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g)) usedClasses.add(m[1]);
  }
  const isWel = c => c.startsWith('wel-') || c.startsWith('dgo-wel');
  const styledUnused = [...definedClasses].filter(c => !usedClasses.has(c));
  const unstyled = [...usedClasses].filter(c => !definedClasses.has(c) && !isWel(c));

  // accessibility
  let controls = 0, hidden = 0, labelled = 0, labelFor = 0, live = 0;
  const unlabelledAt = [];
  for (const f of ALL_JS) {
    const c = read(f);
    labelFor += (c.match(/<label[^>]*\sfor=/g) || []).length;
    live += (c.match(/aria-live=/g) || []).length;
    for (const m of c.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
      controls++;
      const tag = m[0];
      if (/type="hidden"/.test(tag)) { hidden++; continue; }
      const before = c.slice(Math.max(0, m.index - 300), m.index);
      const wrapped = before.lastIndexOf('<label') > before.lastIndexOf('</label>');
      if (wrapped || /aria-label=|aria-labelledby=|\bid=/.test(tag)) labelled++;
      else if (unlabelledAt.length < 40) unlabelledAt.push(f + ': ' + tag.slice(0, 80));
    }
  }

  return {
    overrideOverlap: { platformAuthorityVsApp: paVsApp, componentsVsApp: compVsApp,
      total: paVsApp + compVsApp },
    important: { appCss: (appCss.match(/!important/g) || []).length,
      rulesContaining: app.filter(r => /!important/.test(r.body)).length },
    tokens: { defined: defined.size, orphans: orphans.length, undefined: undef.length,
      shadowedByAppCss: shadowed.length },
    typography: { appCssLiteralFontSizes: literal.length,
      appCssTokenFontSizes: sizes.length - literal.length,
      distinctLiteralSizes: new Set(literal).size, belowFloor: belowFloor.length },
    colour: { appCssLiteralHex: hex.length, appCssDistinctHex: new Set(hex).size,
      appCssTokenRefs: (appCss.match(/var\(--dgo-color/g) || []).length },
    responsive: { distinctQueryConditions: new Set(queries).size, queryBlocks: queries.length,
      invertedColumnCascades: inverted.length, deadDeclarations: dead },
    surface: { classesDefined: definedClasses.size, classesUsed: usedClasses.size,
      styledNeverUsed: styledUnused.length, unstyledInMarkup: unstyled.length },
    accessibility: { formControls: controls, hiddenInputs: hidden, labelled,
      unlabelledControls: controls - hidden - labelled, labelForPairs: labelFor,
      ariaLiveRegions: live },
    _detail: { undefinedTokens: undef, belowFloorSizes: belowFloor,
      invertedSelectors: inverted, unlabelledAt }
  };
}

/* Metrics where a HIGHER number is better. Everything else ratchets downward. */
const HIGHER_IS_BETTER = new Set([
  'tokens.defined', 'typography.appCssTokenFontSizes', 'colour.appCssTokenRefs',
  'surface.classesUsed', 'accessibility.labelled', 'accessibility.labelForPairs',
  'accessibility.ariaLiveRegions', 'accessibility.formControls', 'accessibility.hiddenInputs',
  'responsive.queryBlocks', 'responsive.distinctQueryConditions',
  'surface.classesDefined', 'important.rulesContaining', 'colour.appCssDistinctHex',
  'typography.distinctLiteralSizes'
]);
/* Informational only - moves with legitimate feature work, never fails a run. */
const INFORMATIONAL = new Set([
  'accessibility.formControls', 'accessibility.hiddenInputs', 'surface.classesDefined',
  'surface.classesUsed', 'tokens.defined', 'responsive.queryBlocks',
  'responsive.distinctQueryConditions', 'colour.appCssDistinctHex',
  'typography.distinctLiteralSizes', 'important.rulesContaining'
]);
const MUST_BE_ZERO = new Set(['tokens.undefined', 'typography.belowFloor']);

function flatten(o, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('_')) continue;
    const key = prefix ? prefix + '.' + k : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else if (typeof v === 'number') out[key] = v;
  }
  return out;
}

const args = process.argv.slice(2);
const current = measure();
const flat = flatten(current);

if (args.includes('--report')) {
  console.log('CSS contract - measured values\n');
  for (const [k, v] of Object.entries(flat)) console.log('  ' + k.padEnd(44) + v);
  if (current._detail.undefinedTokens.length)
    console.log('\n  undefined tokens: ' + current._detail.undefinedTokens.join(', '));
  if (current._detail.belowFloorSizes.length)
    console.log('  below type floor: ' + current._detail.belowFloorSizes.join(', '));
  if (current._detail.invertedSelectors.length)
    console.log('  inverted cascades: ' + current._detail.invertedSelectors.join(', '));
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error('tests/baseline.json is missing. Run with --update to create it.');
  process.exit(2);
}
const baseline = JSON.parse(read('tests/baseline.json'));
const baseFlat = flatten(baseline);

const regressions = [], improvements = [], zeroViolations = [], added = [];
for (const [key, now] of Object.entries(flat)) {
  const was = baseFlat[key];
  if (was === undefined) { added.push([key, now]); continue; }
  if (MUST_BE_ZERO.has(key) && now > 0) { zeroViolations.push([key, now]); continue; }
  if (now === was) continue;
  const better = HIGHER_IS_BETTER.has(key) ? now > was : now < was;
  if (better) improvements.push([key, was, now]);
  else if (!INFORMATIONAL.has(key)) regressions.push([key, was, now]);
  else improvements.push([key, was, now, 'informational']);
}

if (args.includes('--update')) {
  if (regressions.length) {
    console.error('Refusing to update: these metrics got worse. Fix them or justify the raise.\n');
    regressions.forEach(([k, w, n]) => console.error('  ' + k + '  ' + w + ' -> ' + n));
    process.exit(1);
  }
  const merged = JSON.parse(read('tests/baseline.json'));
  const setPath = (obj, path, val) => {
    const parts = path.split('.');
    let o = obj;
    for (const p of parts.slice(0, -1)) o = o[p];
    o[parts.at(-1)] = val;
  };
  for (const [k, , n] of improvements) setPath(merged, k, n);
  merged._measuredAt = new Date().toISOString().slice(0, 10);
  writeFileSync(BASELINE, JSON.stringify(merged, null, 2) + '\n');
  console.log('Baseline updated: ' + improvements.length + ' metric(s) improved.');
  improvements.forEach(([k, w, n]) => console.log('  ' + k + '  ' + w + ' -> ' + n));
  process.exit(0);
}

let failed = false;
if (zeroViolations.length) {
  failed = true;
  console.error('\nMUST BE ZERO - these cannot be baselined away:\n');
  for (const [k, n] of zeroViolations) {
    console.error('  ' + k + ' = ' + n);
    if (k === 'tokens.undefined')
      console.error('    ' + current._detail.undefinedTokens.join(', '));
    if (k === 'typography.belowFloor')
      console.error('    sizes: ' + current._detail.belowFloorSizes.join(', ')
        + ' (floor is ' + TYPE_FLOOR_PX + 'px)');
  }
}
if (regressions.length) {
  failed = true;
  console.error('\nRATCHET BROKEN - ' + regressions.length + ' metric(s) got worse:\n');
  regressions.forEach(([k, w, n]) =>
    console.error('  ' + k.padEnd(44) + w + ' -> ' + n + '   (+' + (n - w) + ')'));
  console.error('\nEither bring these back down, or raise the baseline deliberately with a');
  console.error('recorded reason in the commit body. Do not raise it silently.');
}
if (improvements.length) {
  console.log('\n' + improvements.length + ' metric(s) improved:');
  improvements.forEach(([k, w, n, note]) =>
    console.log('  ' + k.padEnd(44) + w + ' -> ' + n + (note ? '  (' + note + ')' : '')));
  console.log('\nRun with --update to commit these gains into the baseline.');
}
if (added.length) {
  console.log('\n' + added.length + ' new metric(s) not in baseline - add them with --update:');
  added.forEach(([k, n]) => console.log('  ' + k.padEnd(44) + n));
}
if (!failed && !improvements.length && !added.length)
  console.log('CSS contract holds. ' + Object.keys(flat).length + ' metrics at baseline.');
process.exit(failed ? 1 : 0);
