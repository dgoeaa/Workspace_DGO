/**
 * The e-mail catalogue (readiness register ITEM-68): every message an identification package sends, its body held once as
 * a template in docs/folio-Master-Flows-and-Endpoints/email-catalogue/, and the packages' body steps generated from it.
 *
 * A message's body reaches its send in one of three shapes, and the catalogue keeps the shape:
 *   parts   the body is a Compose whose input only joins Compose_<…>_Part1…n (each ≤ 6,000 characters, the size the flows
 *           were authored in); the catalogue holds the joined template and the parts are cut from it again here
 *   single  the body is one Compose holding the whole template
 *   body    the send's own Body field holds the template
 * The templates keep the flows' own expression syntax (@{…}); nothing is rendered here.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const CATALOGUE_DIR = 'docs/folio-Master-Flows-and-Endpoints/email-catalogue';
export const PART_LIMIT = 6000;
const SENDS = /SendEmail/;

function index(actions) {
  const out = {};
  const walk = (o) => { for (const [n, a] of Object.entries(o || {})) {
    out[n] = { a, parent: o };
    walk(a.actions); if (a.else) walk(a.else.actions);
    for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
  } };
  walk(actions);
  return out;
}
const JOIN = /^(?:@\{outputs\('([^']+)'\)\})+$/;

/** Every send in a package with its body's shape, the steps that hold it and the template text. */
export function messagesOf(pkg) {
  const A = index(pkg.serializedValue.actions);
  const out = [];
  for (const [send, { a }] of Object.entries(A)) {
    if (a.type !== 'OpenApiConnection' || !SENDS.test(a.inputs?.host?.operationId || '')) continue;
    const p = a.inputs.parameters;
    const body = p['emailMessage/Body'];
    /* The designer wraps a body that only interpolates a Compose in a paragraph (<p class="editor-paragraph">@{outputs('X')}</p>);
       the message is X either way. */
    const m = typeof body === 'string' && (/^@outputs\('([^']+)'\)$/.exec(body) || /^<p(?: class="editor-paragraph")?>@\{outputs\('([^']+)'\)\}<\/p>$/.exec(body));
    const base = { send, subject: p['emailMessage/Subject'] ?? '', to: p['emailMessage/To'] ?? '', cc: p['emailMessage/Cc'] ?? '' };
    if (m && A[m[1]] && typeof A[m[1]].a.inputs === 'string') {
      const wrapper = m[1], w = A[wrapper].a.inputs;
      if (JOIN.test(w)) {
        const parts = [...w.matchAll(/outputs\('([^']+)'\)/g)].map((x) => x[1]);
        if (parts.every((n) => A[n] && typeof A[n].a.inputs === 'string')) {
          out.push({ ...base, shape: 'parts', wrapper, parts, html: parts.map((n) => A[n].a.inputs).join('') });
          continue;
        }
      }
      out.push({ ...base, shape: 'single', wrapper, html: w });
      continue;
    }
    out.push({ ...base, shape: 'body', html: typeof body === 'string' ? body : JSON.stringify(body) });
  }
  return out;
}

/** Cut a template into pieces of at most PART_LIMIT characters, never inside an @{…} expression, never leaving a piece
 *  that starts with "@" (which the designer would read as an expression). Prefers a cut just after ">". */
export function cut(html, limit = PART_LIMIT) {
  const safe = new Uint8Array(html.length + 1);
  let depth = 0, quote = false;
  for (let i = 0; i < html.length; i++) {
    safe[i] = depth === 0 ? 1 : 0;
    const c = html[i];
    if (depth === 0) { if (c === '@' && html[i + 1] === '{') { depth = 1; i++; safe[i] = 0; } continue; }
    if (quote) { if (c === "'") quote = false; continue; }
    if (c === "'") quote = true; else if (c === '{') depth++; else if (c === '}') depth--;
  }
  safe[html.length] = 1;
  const pieces = [];
  let start = 0;
  while (html.length - start > limit) {
    let at = -1, fallback = -1;
    for (let i = start + limit; i > start; i--) {
      if (!safe[i] || html[i] === '@') continue;
      if (fallback < 0) fallback = i;
      if (html[i - 1] === '>') { at = i; break; }
    }
    if (at < 0) at = fallback;
    if (at <= start) throw new Error('a template has no safe cut within the part limit');
    pieces.push(html.slice(start, at));
    start = at;
  }
  pieces.push(html.slice(start));
  return pieces;
}

export const sha = (t) => createHash('sha256').update(t).digest('hex');
export const fileOf = (pkgFile, send) => `${pkgFile.replace(/\.paste\.json$/, '')}/${send.replace(/[()]/g, '')}.html`;

export function loadCatalogue(root) {
  const p = join(root, CATALOGUE_DIR, 'catalogue.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

/**
 * Write each send's body from the catalogue. A send the catalogue does not name fails the build: a new message is added to
 * the catalogue (npm run emailcatalogue -- --extract), not composed inline. Returns the sends written.
 */
export function applyCatalogue(pkg, pkgFile, root) {
  const cat = loadCatalogue(root);
  if (!cat) return [];
  const A = index(pkg.serializedValue.actions);
  const done = [];
  for (const m of messagesOf(pkg)) {
    const e = cat.messages.find((x) => x.package === pkgFile && x.send === m.send);
    if (!e) throw new Error(`${pkgFile}: ${m.send} is not in the e-mail catalogue — run: npm run emailcatalogue -- --extract`);
    if (e.shape !== m.shape) throw new Error(`${pkgFile}: ${m.send} is ${m.shape} in the package but ${e.shape} in the catalogue`);
    const html = readFileSync(join(root, CATALOGUE_DIR, e.file), 'utf8');
    if (sha(html) !== e.sha256) throw new Error(`${e.file}: its text does not match catalogue.json — run: npm run emailcatalogue`);
    if (m.shape === 'body') { A[m.send].a.inputs.parameters['emailMessage/Body'] = html; done.push(m.send); continue; }
    if (m.shape === 'single') { A[m.wrapper].a.inputs = html; done.push(m.send); continue; }
    /* parts: replace the chain Part1 → … → PartN → wrapper with pieces cut from the template. */
    const holder = A[m.wrapper].parent;
    const first = A[m.parts[0]].a;
    for (const n of m.parts) {
      if (A[n].parent !== holder) throw new Error(`${pkgFile}: ${n} is not beside ${m.wrapper}`);
      for (const [o, { a }] of Object.entries(A)) {
        if (o === m.wrapper || m.parts.includes(o)) continue;
        const { actions, else: e, cases, default: d, ...own } = a; /* a scope holding the part is not a reader of it */
        if (JSON.stringify(own).includes(`'${n}'`)) throw new Error(`${pkgFile}: ${o} reads ${n}`);
      }
    }
    const runAfter = first.runAfter || {};
    for (const n of m.parts) delete holder[n];
    const pieces = cut(html);
    const names = pieces.map((_, i) => `${m.wrapper}_Part${i + 1}`);
    pieces.forEach((t, i) => { holder[names[i]] = { type: 'Compose', inputs: t, runAfter: i ? { [names[i - 1]]: ['Succeeded'] } : runAfter }; });
    holder[m.wrapper].inputs = names.map((n) => `@{outputs('${n}')}`).join('');
    holder[m.wrapper].runAfter = { [names[names.length - 1]]: ['Succeeded'] };
    done.push(m.send);
  }
  return done;
}
