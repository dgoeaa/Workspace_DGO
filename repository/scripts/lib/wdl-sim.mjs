/**
 * A strict, local simulator for the subset of the Logic Apps / Power Automate workflow definition
 * language that the designer-paste packages use.
 *
 * WHY: a clipboard package can only be run by pasting it into a tenant. This executes it here —
 * expressions, runAfter ordering, conditions, switches, loops, scopes, variables and Terminate —
 * against mocked connectors, so behaviour is tested before an operator ever pastes it.
 *
 * STRICTER THAN THE SERVICE, ON PURPOSE:
 *   - if(), and() and or() evaluate every argument. An expression that is only safe when the
 *     untaken branch is not evaluated fails here, whichever way the service behaves.
 *   - length(), trim(), toLower(), first(), take(), join(), startsWith(), ticks() and comparisons
 *     reject null, as the service does.
 *   - property selection on a string or number is an error, as it is in the service.
 * An evaluation error fails the action with InvalidTemplate, exactly as the runtime would, and is
 * also recorded in `sim.templateErrors` so a test can tell a deliberate failure from a defect.
 *
 * Run status follows the service's terminal-action rule: a container fails when an action with no
 * dependents in it failed — or was skipped BECAUSE a predecessor failed.
 */

const NIL = undefined;
class TemplateError extends Error {}
class TerminateSignal extends Error { constructor(status, error) { super('terminate'); this.status = status; this.error = error; } }

/* ───────────── parsing ───────────── */

function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let s = ''; i++;
      for (;;) {
        if (i >= src.length) throw new TemplateError(`unterminated string in: ${src}`);
        if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
        s += src[i++];
      }
      t.push({ k: 'str', v: s }); continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i + 1; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      t.push({ k: 'num', v: Number(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1; while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      t.push({ k: 'id', v: src.slice(i, j) }); i = j; continue;
    }
    if ('(),[]?.'.includes(c)) { t.push({ k: c }); i++; continue; }
    throw new TemplateError(`unexpected '${c}' in: ${src}`);
  }
  return t;
}

export function parse(src) {
  const t = tokenize(src); let p = 0;
  const peek = (k) => t[p] && t[p].k === k;
  const eat = (k) => { if (!peek(k)) throw new TemplateError(`expected '${k}' at token ${p} in: ${src}`); return t[p++]; };
  function primary() {
    const tok = t[p++];
    if (!tok) throw new TemplateError(`unexpected end of: ${src}`);
    let node;
    if (tok.k === 'str' || tok.k === 'num') node = { lit: tok.v };
    else if (tok.k === 'id') {
      if (peek('(')) {
        p++; const args = [];
        if (!peek(')')) { for (;;) { args.push(primary()); if (peek(',')) { p++; continue; } break; } }
        eat(')'); node = { fn: tok.v, args };
      } else if (tok.v === 'true' || tok.v === 'false') node = { lit: tok.v === 'true' };
      else if (tok.v === 'null') node = { lit: null };
      else throw new TemplateError(`bare identifier '${tok.v}' in: ${src}`);
    } else throw new TemplateError(`unexpected token '${tok.k}' in: ${src}`);
    for (;;) {
      if (peek('?') && t[p + 1]?.k === '[') { p++; p++; const key = primary(); eat(']'); node = { get: node, key, safe: true }; continue; }
      if (peek('[')) { p++; const key = primary(); eat(']'); node = { get: node, key, safe: false }; continue; }
      break;
    }
    return node;
  }
  const n = primary();
  if (p !== t.length) throw new TemplateError(`trailing tokens in: ${src}`);
  return n;
}

/** Split a string value into literal text and `@{...}` expressions. */
export function splitInterpolation(s) {
  const parts = []; let i = 0; let lit = '';
  while (i < s.length) {
    if (s[i] === '@' && s[i + 1] === '@') { lit += '@'; i += 2; continue; }
    if (s[i] === '@' && s[i + 1] === '{') {
      let j = i + 2; let depth = 1; let inStr = false;
      for (; j < s.length; j++) {
        const c = s[j];
        if (inStr) { if (c === "'") { if (s[j + 1] === "'") { j++; continue; } inStr = false; } continue; }
        if (c === "'") inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) throw new TemplateError(`unterminated @{ in: ${s.slice(i, i + 80)}`);
      if (lit) parts.push({ lit }); lit = '';
      parts.push({ expr: s.slice(i + 2, j) }); i = j + 1; continue;
    }
    lit += s[i++];
  }
  if (lit) parts.push({ lit });
  return parts;
}

/** Every expression source in a JSON value — for linting without running. */
export function expressionsIn(value, out = []) {
  if (typeof value === 'string') {
    if (value.startsWith('@') && !value.startsWith('@@') && !value.startsWith('@{')) out.push(value.slice(1));
    else for (const part of splitInterpolation(value)) if (part.expr !== NIL) out.push(part.expr);
  } else if (Array.isArray(value)) value.forEach((v) => expressionsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => expressionsIn(v, out));
  return out;
}

export function functionsIn(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (node.fn) { out.add(node.fn); node.args.forEach((a) => functionsIn(a, out)); }
  if (node.get) { functionsIn(node.get, out); functionsIn(node.key, out); }
  return out;
}

/* ───────────── values ───────────── */

const typeOf = (v) => (v === null || v === NIL ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const need = (fn, v, ...types) => { if (!types.includes(typeOf(v))) throw new TemplateError(`${fn}() does not accept ${typeOf(v)}`); return v; };
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function toStr(v) {
  if (v === null || v === NIL) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}
const cmp = (fn, a, b) => {
  if (typeOf(a) !== typeOf(b) || !['number', 'string'].includes(typeOf(a))) throw new TemplateError(`${fn}() cannot compare ${typeOf(a)} with ${typeOf(b)}`);
  return a < b ? -1 : a > b ? 1 : 0;
};
const EPOCH_TICKS = 621355968000000000;
const parseTs = (fn, s) => {
  need(fn, s, 'string');
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new TemplateError(`${fn}() got an invalid timestamp '${s}'`);
  return ms;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(ms, fmt) {
  if (!fmt) return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.0000000Z');
  const d = new Date(ms); const pad = (n, w = 2) => String(n).padStart(w, '0');
  return fmt.replace(/yyyy|MMM|MM|dd|HH|mm|ss/g, (k) => ({
    yyyy: d.getUTCFullYear(), MMM: MONTHS[d.getUTCMonth()], MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
    HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), ss: pad(d.getUTCSeconds()),
  })[k]);
}
const TZ_OFFSET = { 'W. Central Africa Standard Time': 60, UTC: 0 };

/* ───────────── the simulator ───────────── */

export class Simulator {
  /* prior: results of the target flow's steps that run before a pasted scope, by name ({ status, outputs }). A scope
     pasted into the middle of a flow reads them, as Scope_Library_Identity reads the library flow's own copy and row. */
  constructor({ variables = {}, connectors = {}, workflow = {}, trigger = {}, clock, rand, prior = {} } = {}) {
    this.prior = prior;
    this.rand = rand;
    this.variables = structuredClone(variables);
    this.connectors = connectors;
    this.workflow = workflow;
    this.trigger = trigger;
    this.clock = clock || (() => new Date().toISOString());
    this.templateErrors = [];
    this.calls = [];
    this.runStatus = 'Succeeded';
    this.runError = null;
  }

  /** The declared name a reference resolves to: variable names are case-insensitive in the service. */
  varKey(name) {
    if (name in this.variables) return name;
    const lower = String(name).toLowerCase();
    return Object.keys(this.variables).find((k) => k.toLowerCase() === lower) ?? null;
  }

  run(pkg) {
    const root = { results: new Map(), parent: null, binding: [] };
    this.global = new Map(Object.entries(this.prior || {}));
    try {
      const status = this.runAction(pkg.nodeId, pkg.serializedValue, root);
      if (status === 'Failed' || status === 'TimedOut') this.runStatus = 'Failed';
    } catch (e) {
      if (!(e instanceof TerminateSignal)) throw e;
      this.runStatus = e.status; this.runError = e.error;
    }
    this.root = root;
    return this;
  }

  /* results are looked up through the chain of containers, innermost first */
  lookup(ctx, name) {
    for (let c = ctx; c; c = c.parent) if (c.results.has(name)) return c.results.get(name);
    /* An action in a sibling scope (or one already finished) is visible by name, as in the service. */
    return this.global.has(name) ? this.global.get(name) : NIL;
  }

  evalValue(v, ctx) {
    if (typeof v === 'string') {
      if (v.startsWith('@@')) return v.slice(1);
      if (v.startsWith('@') && !v.startsWith('@{')) return this.evalExpr(v.slice(1), ctx);
      if (!v.includes('@{')) return v;
      const parts = splitInterpolation(v);
      if (parts.length === 1 && parts[0].expr !== NIL && v.startsWith('@{') && v.endsWith('}')) {
        return toStr(this.evalExpr(parts[0].expr, ctx));
      }
      return parts.map((p) => (p.expr !== NIL ? toStr(this.evalExpr(p.expr, ctx)) : p.lit)).join('');
    }
    if (Array.isArray(v)) return v.map((x) => this.evalValue(x, ctx));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, this.evalValue(x, ctx)]));
    return v;
  }

  evalExpr(src, ctx) { return this.evalNode(parse(src), ctx); }

  evalNode(n, ctx) {
    if ('lit' in n) return n.lit;
    if (n.get) {
      const base = this.evalNode(n.get, ctx);
      const key = this.evalNode(n.key, ctx);
      if (base === null || base === NIL) {
        if (n.safe) return null;
        throw new TemplateError(`cannot select '${key}' from null`);
      }
      if (typeof base !== 'object') throw new TemplateError(`property selection '${key}' is not supported on ${typeOf(base)}`);
      /* The designer's path shorthand: outputs('X')?['body/value'] reads outputs.body.value. */
      const v = (typeof key === 'string' && key.includes('/') && !(key in base))
        ? key.split('/').reduce((o, k) => (o && typeof o === 'object' ? o[k] : NIL), base)
        : base[key];
      return v === NIL ? (n.safe ? null : (() => { throw new TemplateError(`property '${key}' does not exist`); })()) : v;
    }
    const args = n.args.map((a) => this.evalNode(a, ctx));
    const f = this.fns[n.fn];
    if (!f) throw new TemplateError(`unknown function ${n.fn}()`);
    return f.call(this, args, ctx);
  }

  get fns() {
    const self = this;
    const actionRecord = (ctx, name) => {
      const r = self.lookup(ctx, name);
      if (r === NIL) {
        if (!self.declared.has(name)) throw new TemplateError(`action '${name}' is not defined`);
        return null;
      }
      return r;
    };
    return {
      concat: (a) => a.map((v) => { if (typeof v === 'object' && v !== null) throw new TemplateError('concat() does not accept objects'); return toStr(v); }).join(''),
      if: ([c, a, b]) => { need('if', c, 'boolean'); return c ? a : b; },
      /* array(value): an array holding the one value given (IP_SEND_EMAIL reads its recipients through it). */
      array: ([v]) => [v],
      equals: ([a, b]) => deepEq(a ?? null, b ?? null),
      and: (a) => a.every((v) => need('and', v, 'boolean')),
      or: (a) => a.some((v) => need('or', v, 'boolean')),
      not: ([v]) => !need('not', v, 'boolean'),
      greater: ([a, b]) => cmp('greater', a, b) > 0,
      greaterOrEquals: ([a, b]) => cmp('greaterOrEquals', a, b) >= 0,
      less: ([a, b]) => cmp('less', a, b) < 0,
      lessOrEquals: ([a, b]) => cmp('lessOrEquals', a, b) <= 0,
      length: ([v]) => need('length', v, 'string', 'array').length,
      coalesce: (a) => { for (const v of a) if (v !== null && v !== NIL) return v; return null; },
      string: ([v]) => toStr(v),
      toLower: ([v]) => need('toLower', v, 'string').toLowerCase(),
      toUpper: ([v]) => need('toUpper', v, 'string').toUpperCase(),
      trim: ([v]) => need('trim', v, 'string').trim(),
      empty: ([v]) => v === null || v === NIL || (typeof v === 'string' && v === '') || (Array.isArray(v) && !v.length) || (typeOf(v) === 'object' && !Object.keys(v).length),
      contains: ([c, v]) => {
        if (typeof c === 'string') return c.includes(need('contains', v, 'string'));
        if (Array.isArray(c)) return c.some((x) => deepEq(x, v));
        if (typeOf(c) === 'object') return Object.prototype.hasOwnProperty.call(c, v);
        throw new TemplateError(`contains() does not accept ${typeOf(c)}`);
      },
      indexOf: ([s, p]) => need('indexOf', s, 'string').indexOf(need('indexOf', p, 'string')),
      lastIndexOf: ([s, p]) => need('lastIndexOf', s, 'string').lastIndexOf(need('lastIndexOf', p, 'string')),
      startsWith: ([s, p]) => need('startsWith', s, 'string').startsWith(need('startsWith', p, 'string')),
      /* As the service: a malformed escape is an error, not a silent pass-through. */
      decodeUriComponent: ([s]) => { try { return decodeURIComponent(need('decodeUriComponent', s, 'string')); } catch { throw new TemplateError(`decodeUriComponent(): '${s}' is not valid percent-encoding`); } },
      float: ([v]) => { const n = Number(toStr(v)); if (toStr(v).trim() === '' || Number.isNaN(n)) throw new TemplateError(`float() cannot convert '${v}'`); return n; },
      endsWith: ([s, p]) => need('endsWith', s, 'string').endsWith(need('endsWith', p, 'string')),
      last: ([v]) => { need('last', v, 'string', 'array'); return v.length ? v[v.length - 1] : null; },
      split: ([s, d]) => need('split', s, 'string').split(need('split', d, 'string')),
      first: ([v]) => { need('first', v, 'string', 'array'); return v.length ? v[0] : null; },
      take: ([v, n]) => { need('take', v, 'string', 'array'); need('take', n, 'number'); return v.slice(0, Math.max(0, n)); },
      skip: ([v, n]) => { need('skip', v, 'array'); need('skip', n, 'number'); return v.slice(n); },
      join: ([v, sep]) => need('join', v, 'array').map(toStr).join(need('join', sep, 'string')),
      union: ([a, b]) => {
        if (Array.isArray(a) && Array.isArray(b)) { const out = []; for (const x of [...a, ...b]) if (!out.some((y) => deepEq(x, y))) out.push(x); return out; }
        if (typeOf(a) === 'object' && typeOf(b) === 'object') return { ...a, ...b };
        throw new TemplateError('union() needs two arrays or two objects');
      },
      createArray: (a) => a,
      removeProperty: ([o, k]) => { need('removeProperty', o, 'object'); const c = { ...o }; delete c[k]; return c; },
      addProperty: ([o, k, v]) => { need('addProperty', o, 'object'); if (k in o) throw new TemplateError(`addProperty(): '${k}' exists`); return { ...o, [k]: v }; },
      replace: ([s, a, b]) => need('replace', s, 'string').split(need('replace', a, 'string')).join(need('replace', b, 'string')),
      json: ([s]) => { try { return JSON.parse(need('json', s, 'string')); } catch { throw new TemplateError(`json() could not parse '${s}'`); } },
      int: ([v]) => { const s = toStr(v); if (!/^-?\d+$/.test(s.trim())) throw new TemplateError(`int() cannot convert '${s}'`); return parseInt(s, 10); },
      add: ([a, b]) => need('add', a, 'number') + need('add', b, 'number'),
      sub: ([a, b]) => need('sub', a, 'number') - need('sub', b, 'number'),
      mul: ([a, b]) => need('mul', a, 'number') * need('mul', b, 'number'),
      div: ([a, b]) => { need('div', a, 'number'); if (!need('div', b, 'number')) throw new TemplateError('div() by zero'); return Number.isInteger(a) && Number.isInteger(b) ? Math.trunc(a / b) : a / b; },
      mod: ([a, b]) => need('mod', a, 'number') % need('mod', b, 'number'),
      max: (a) => Math.max(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map((v) => need('max', v, 'number'))),
      min: (a) => Math.min(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map((v) => need('min', v, 'number'))),
      utcNow: ([fmt]) => (fmt ? fmtDate(Date.parse(self.clock()), fmt) : self.clock()),
      addHours: ([ts, n]) => new Date(parseTs('addHours', ts) + need('addHours', n, 'number') * 3600000).toISOString(),
      /* Deterministic here so a run can be asserted; the service returns a random GUID. */
      guid: () => { self.guidCount = (self.guidCount || 0) + 1; return `00000000-0000-4000-8000-${String(self.guidCount).padStart(12, '0')}`; },
      /* rand(min, max) returns an integer with min <= n < max, as the service does. A test can pass `rand` to pin
         the draw; without it the lowest value is returned, so a run is repeatable. */
      rand: ([lo, hi]) => {
        need('rand', lo, 'number'); need('rand', hi, 'number');
        if (!(hi > lo)) throw new TemplateError(`rand(): max ${hi} must exceed min ${lo}`);
        const v = self.rand ? self.rand(lo, hi) : lo;
        if (!(Number.isInteger(v) && v >= lo && v < hi)) throw new Error(`test rand() returned ${v}, outside ${lo}..${hi - 1}`);
        return v;
      },
      range: ([start, count]) => {
        need('range', start, 'number'); need('range', count, 'number');
        if (count < 0) throw new TemplateError(`range(): count ${count} is negative`);
        return Array.from({ length: count }, (_, i) => start + i);
      },
      /* As the service: the range must lie inside the text, and the start index must be less than its length, so
         substring('',0,0) fails too (tenant, 8 October 2026: "'start index' must be non-negative integer and should be
         less than the length of the string"). */
      substring: ([t, i, n]) => {
        need('substring', t, 'string'); need('substring', i, 'number');
        const len = n === undefined ? t.length - i : need('substring', n, 'number');
        if (i < 0 || i >= t.length) throw new TemplateError(`substring(): start index ${i} is not inside a ${t.length}-character text`);
        if (len < 0 || i + len > t.length) throw new TemplateError(`substring(): range ${i}+${len} is outside a ${t.length}-character text`);
        return t.substr(i, len);
      },
      setProperty: ([o, k, v]) => { need('setProperty', o, 'object'); return { ...o, [need('setProperty', k, 'string')]: v }; },
      addMinutes: ([ts, n]) => new Date(parseTs('addMinutes', ts) + need('addMinutes', n, 'number') * 60000).toISOString(),
      ticks: ([ts]) => parseTs('ticks', ts) * 10000 + EPOCH_TICKS,
      formatDateTime: ([ts, fmt]) => fmtDate(parseTs('formatDateTime', ts), fmt),
      convertFromUtc: ([ts, tz, fmt]) => {
        if (!(tz in TZ_OFFSET)) throw new TemplateError(`convertFromUtc(): unknown time zone '${tz}'`);
        return fmtDate(parseTs('convertFromUtc', ts) + TZ_OFFSET[tz] * 60000, fmt);
      },
      addDays: ([ts, n, fmt]) => { const v = new Date(parseTs('addDays', ts) + need('addDays', n, 'number') * 86400000).toISOString(); return fmt ? fmtDate(Date.parse(v), fmt) : v; },
      /* 0 = Sunday, as the service counts. */
      dayOfWeek: ([ts]) => new Date(parseTs('dayOfWeek', ts)).getUTCDay(),
      uriComponent: ([s]) => encodeURIComponent(toStr(s)),
      convertTimeZone: ([ts, from, to, fmt]) => {
        for (const tz of [from, to]) if (!(tz in TZ_OFFSET)) throw new TemplateError(`convertTimeZone(): unknown time zone '${tz}'`);
        return fmtDate(parseTs('convertTimeZone', ts) + (TZ_OFFSET[to] - TZ_OFFSET[from]) * 60000, fmt);
      },
      formatNumber: ([n, fmt, locale]) => {
        need('formatNumber', n, 'number');
        /* A pattern of zeros pads to that many digits, as the kit's '00000' does; a longer number is kept whole. */
        if (/^0+$/.test(String(fmt))) return String(Math.round(n)).padStart(fmt.length, '0');
        if (fmt !== 'N0') throw new TemplateError(`formatNumber(): format '${fmt}' is not simulated`);
        return Math.round(n).toLocaleString(locale || 'en-US');
      },
      base64: ([s]) => Buffer.from(toStr(s), 'utf8').toString('base64'),
      base64ToBinary: ([s]) => ({ '$content-type': 'application/octet-stream', $content: need('base64ToBinary', s, 'string') }),
      workflow: () => self.workflow,
      trigger: () => self.trigger,
      triggerOutputs: () => self.trigger?.outputs ?? null,
      triggerBody: () => self.trigger?.outputs?.body ?? null,
      variables: ([name]) => { const k = self.varKey(name); if (k === null) throw new TemplateError(`variable '${name}' is not initialised`); return self.variables[k]; },
      item: (_, ctx) => { const b = ctx.binding.at(-1); if (!b) throw new TemplateError('item() used outside a loop'); return b.value; },
      items: ([name], ctx) => {
        for (let c = ctx; c; c = c.parent) { const b = [...c.binding].reverse().find((x) => x.loop === name); if (b) return b.value; }
        throw new TemplateError(`items('${name}') used outside that loop`);
      },
      outputs: ([name], ctx) => { const r = actionRecord(ctx, name); return r ? r.outputs ?? null : null; },
      body: ([name], ctx) => { const r = actionRecord(ctx, name); return r ? r.outputs?.body ?? null : null; },
      actions: ([name], ctx) => { const r = actionRecord(ctx, name); return r ? { name, status: r.status, outputs: r.outputs ?? null, startTime: r.startTime, endTime: r.endTime, error: r.error ?? null } : null; },
      result: ([name], ctx) => {
        const r = actionRecord(ctx, name);
        if (!r || !r.children) throw new TemplateError(`result('${name}') needs a scope that has run`);
        return r.children.map((c) => ({ name: c.name, status: c.status, startTime: c.startTime, endTime: c.endTime, outputs: c.outputs ?? null, ...(c.error ? { code: c.error.code, error: c.error } : {}) }));
      },
    };
  }

  evalCondition(e, ctx) {
    if (typeof e === 'string') { const v = this.evalValue(e, ctx); return need('condition', v, 'boolean'); }
    const [op, val] = Object.entries(e)[0];
    if (op === 'and') return val.map((x) => this.evalCondition(x, ctx)).every(Boolean);
    if (op === 'or') return val.map((x) => this.evalCondition(x, ctx)).some(Boolean);
    if (op === 'not') return !this.evalCondition(val, ctx);
    const args = val.map((x) => this.evalValue(x, ctx));
    return this.fns[op](args, ctx);
  }

  runContainer(actions, ctx) {
    const names = Object.keys(actions || {});
    const done = new Map();
    const dependents = new Set(names.flatMap((n) => Object.keys(actions[n].runAfter || {})));
    let progressed = true;
    while (done.size < names.length && progressed) {
      progressed = false;
      for (const name of names) {
        if (done.has(name)) continue;
        const act = actions[name];
        const deps = Object.entries(act.runAfter || {});
        if (deps.some(([d]) => !names.includes(d))) throw new Error(`${name} runs after '${deps.find(([d]) => !names.includes(d))[0]}', which is not a sibling`);
        if (!deps.every(([d]) => done.has(d))) continue;
        const unmet = deps.filter(([d, allowed]) => !(allowed || ['Succeeded']).includes(done.get(d).status));
        if (unmet.length) {
          const cause = unmet.map(([d]) => done.get(d).effective).find((s) => s === 'Failed' || s === 'TimedOut') || 'Succeeded';
          const rec = { name, status: 'Skipped', effective: cause, startTime: this.clock(), endTime: this.clock() };
          ctx.results.set(name, rec); this.global.set(name, rec); done.set(name, rec);
        } else {
          this.runAction(name, act, ctx);
          const rec = ctx.results.get(name);
          rec.effective = rec.status; done.set(name, rec);
        }
        progressed = true;
      }
    }
    if (done.size < names.length) throw new Error(`deadlock among: ${names.filter((n) => !done.has(n)).join(', ')}`);
    const terminals = names.filter((n) => !dependents.has(n));
    const failed = terminals.some((n) => ['Failed', 'TimedOut'].includes(done.get(n).effective));
    return { status: failed ? 'Failed' : 'Succeeded', children: names.map((n) => done.get(n)) };
  }

  runAction(name, act, ctx) {
    const rec = { name, type: act.type, startTime: this.clock() };
    ctx.results.set(name, rec); this.global.set(name, rec);
    try {
      switch (act.type) {
        case 'Compose': rec.outputs = this.evalValue(act.inputs, ctx); rec.status = 'Succeeded'; break;
        case 'Query': {
          const from = this.evalValue(act.inputs.from, ctx);
          need('Query from', from, 'array');
          rec.outputs = { body: from.filter((it) => { ctx.binding.push({ value: it }); try { return need('Query where', this.evalValue(act.inputs.where, ctx), 'boolean'); } finally { ctx.binding.pop(); } }) };
          rec.status = 'Succeeded'; break;
        }
        case 'Select': {
          const from = this.evalValue(act.inputs.from, ctx);
          need('Select from', from, 'array');
          rec.outputs = { body: from.map((it) => { ctx.binding.push({ value: it }); try { return this.evalValue(act.inputs.select, ctx); } finally { ctx.binding.pop(); } }) };
          rec.status = 'Succeeded'; break;
        }
        /* Create HTML table, automatic columns: the keys of the first row, as the service takes them. */
        case 'Table': {
          const from = this.evalValue(act.inputs.from, ctx);
          need('Table from', from, 'array');
          if (act.inputs.format !== 'HTML' || act.inputs.columns) throw new Error(`${name}: only an HTML table with automatic columns is simulated`);
          const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const cols = from.length ? Object.keys(from[0]) : [];
          rec.outputs = { body: `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${from.map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === 'object' && r[c] !== null ? JSON.stringify(r[c]) : r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>` };
          rec.status = 'Succeeded'; break;
        }
        case 'SetVariable': {
          /* As the service: the variable must exist, and a missing or null value is refused
             ("cannot be set to null or empty value", CG_Submission_Endpoint, 2026-09-28). */
          const vk = this.varKey(act.inputs.name);
          if (vk === null) throw new TemplateError(`SetVariable: ${act.inputs.name} is not initialised`);
          if (!('value' in act.inputs)) throw new TemplateError(`SetVariable: ${act.inputs.name} has no value`);
          const v = this.evalValue(act.inputs.value, ctx);
          if (v === null || v === NIL) throw new TemplateError(`SetVariable: ${act.inputs.name} cannot be set to null`);
          const had = typeOf(this.variables[vk]);
          if (had !== 'null' && typeOf(v) !== had && !(had === 'number' && typeof v === 'number')) throw new TemplateError(`SetVariable: ${act.inputs.name} is ${had}, given ${typeOf(v)}`);
          this.variables[vk] = v; rec.status = 'Succeeded'; break;
        }
        case 'Response': {
          rec.outputs = { statusCode: this.evalValue(act.inputs.statusCode, ctx), headers: this.evalValue(act.inputs.headers ?? {}, ctx), body: this.evalValue(act.inputs.body ?? null, ctx) };
          if (!Number.isInteger(rec.outputs.statusCode)) throw new TemplateError(`Response: statusCode ${rec.outputs.statusCode} is not an integer`);
          this.response = rec.outputs; rec.status = 'Succeeded'; break;
        }
        case 'IncrementVariable': {
          const vk = this.varKey(act.inputs.name) ?? act.inputs.name;
          need('IncrementVariable', this.variables[vk], 'number');
          this.variables[vk] += this.evalValue(act.inputs.value, ctx); rec.status = 'Succeeded'; break;
        }
        case 'AppendToStringVariable': {
          /* As the service: the variable must be a string; an object or array value is appended as its JSON text. */
          const vk = this.varKey(act.inputs.name) ?? act.inputs.name;
          need('AppendToStringVariable', this.variables[vk], 'string');
          const v = this.evalValue(act.inputs.value, ctx);
          this.variables[vk] += v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''); rec.status = 'Succeeded'; break;
        }
        case 'AppendToArrayVariable': {
          const vk = this.varKey(act.inputs.name) ?? act.inputs.name;
          need('AppendToArrayVariable', this.variables[vk], 'array');
          this.variables[vk].push(this.evalValue(act.inputs.value, ctx)); rec.status = 'Succeeded'; break;
        }
        case 'If': {
          const branch = this.evalCondition(act.expression, ctx) ? act.actions : act.else?.actions;
          const inner = { results: new Map(), parent: ctx, binding: [] };
          const r = this.runContainer(branch || {}, inner);
          rec.status = r.status; rec.children = r.children; rec.inner = inner; break;
        }
        case 'Switch': {
          const v = this.evalValue(act.expression, ctx);
          const hit = Object.values(act.cases || {}).find((c) => deepEq(c.case, v));
          const inner = { results: new Map(), parent: ctx, binding: [] };
          const r = this.runContainer((hit || act.default || {}).actions || {}, inner);
          rec.status = r.status; rec.children = r.children; rec.inner = inner; rec.outputs = { case: hit ? hit.case : 'default' }; break;
        }
        case 'Scope': {
          const inner = { results: new Map(), parent: ctx, binding: [] };
          const r = this.runContainer(act.actions, inner);
          rec.status = r.status; rec.children = r.children; rec.inner = inner; break;
        }
        case 'Foreach': {
          const list = this.evalValue(act.foreach, ctx);
          need('Foreach', list, 'array');
          rec.iterations = [];
          for (const it of list) {
            const inner = { results: new Map(), parent: ctx, binding: [{ loop: name, value: it }] };
            const r = this.runContainer(act.actions, inner);
            rec.iterations.push({ item: it, status: r.status, inner });
          }
          rec.status = rec.iterations.some((i) => i.status === 'Failed') ? 'Failed' : 'Succeeded'; break;
        }
        /* A Delay. Nothing waits here; the clock is the test's. */
        case 'Wait': rec.status = 'Succeeded'; rec.outputs = null; break;
        case 'Terminate': {
          rec.status = 'Succeeded';
          throw new TerminateSignal(act.inputs.runStatus, this.evalValue(act.inputs.runError ?? null, ctx));
        }
        case 'OpenApiConnection': {
          const params = this.evalValue(act.inputs.parameters, ctx);
          const op = `${act.inputs.host.connection}.${act.inputs.host.operationId}`;
          const handler = this.connectors[op];
          if (!handler) throw new Error(`no mock for ${op}`);
          this.calls.push({ name, op, params });
          const res = handler(params, name);
          rec.outputs = { statusCode: res.statusCode ?? (res.ok === false ? 400 : 200), body: res.body ?? null };
          if (res.ok === false) { rec.status = 'Failed'; rec.error = { code: 'BadRequest', message: res.message || 'Request failed' }; } else rec.status = 'Succeeded';
          break;
        }
        default: throw new Error(`action type ${act.type} is not simulated`);
      }
    } catch (e) {
      if (e instanceof TerminateSignal) { rec.endTime = this.clock(); throw e; }
      if (!(e instanceof TemplateError)) throw e;
      this.templateErrors.push({ action: name, message: e.message });
      rec.status = 'Failed'; rec.error = { code: 'InvalidTemplate', message: e.message };
    }
    rec.endTime = this.clock();
    return rec.status;
  }

  /** Every action name in the package — so a reference to a real action that has not run reads
      as null, and a reference to a name that does not exist is a template error. */
  declare(pkg) {
    this.declared = new Set();
    const walk = (actions) => {
      for (const [n, a] of Object.entries(actions || {})) {
        this.declared.add(n); walk(a.actions); if (a.else) walk(a.else.actions);
        if (a.cases) for (const c of Object.values(a.cases)) walk(c.actions);
        if (a.default) walk(a.default.actions);
      }
    };
    this.declared.add(pkg.nodeId);
    walk(pkg.serializedValue.actions);
    return this;
  }
}

export function simulate(pkg, opts) {
  return new Simulator(opts).declare(pkg).run(pkg);
}
