#!/usr/bin/env node
/**
 * FORENSIC VALIDATION of every designer-paste package.
 *
 * The rule this enforces: a package is deliverable only if it can be pasted into the Power
 * Automate designer and saved WITHOUT further modification. Everything below is a way for that
 * to be false while every other check in this repository passes.
 *
 * Each rule states the failure it exists to catch. A rule that cannot say what breaks is a rule
 * nobody can act on, and this file has no such rule.
 *
 *   node scripts/forensic-validate-packages.mjs           # report
 *   node scripts/forensic-validate-packages.mjs --json    # machine-readable
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIRS = [
  { dir: 'docs/deployment/internal/flows/designer-paste', estate: 'internal' },
  { dir: 'docs/deployment/sharepoint/flows/designer-paste', estate: 'portal' },
];
const INDEX = JSON.parse(readFileSync(join(ROOT, 'docs/reference/sharepoint-list-index.json'), 'utf8')).lists;

/* Values that are never a real value. Each has been seen in a generated artefact somewhere. */
/* These fire on TOKENS that cannot be anything but a stand-in. An earlier draft used
   /\bYOUR[_ ]/i and /\bfoo\b/ and flagged the email subject "Your NITDA sign-in code" — English
   prose in a citizen-facing template. A placeholder rule that cries wolf on real copy gets
   switched off, which is the opposite of what it is for. */
const PLACEHOLDER = [
  /\bTODO\b/, /\bTBD\b/, /\bFIXME\b/, /\bXXX+\b/, /\bplaceholder\b/i, /\bdummy\b/i,
  /\bexample\.(com|org|net)\b/i, /\bYOUR_[A-Z]/, /\bCHANGE_?ME\b/i, /\bREPLACE_?ME\b/i,
  /<[A-Z][A-Z_]{2,}>/, /\blorem ipsum\b/i, /\bsample[_ ]?(data|value|text)\b/i,
  /\btest@test\b/i, /00000000-0000-0000-0000-000000000000/,
];
/* Connections this estate is entitled to bind, and nothing else. */
const CONNECTIONS = {
  shared_sharepointonline: '3f1943c5955a4cb8b301e8f22f2b590d',
  shared_office365: 'c0b9e7a5b0854c39a435fd8ce92f48ad',
};
/* An action type that carries no `inputs` is not incomplete — these are the ones. */
/* Types whose completeness is not expressed through `inputs`. A Foreach carries `foreach`; a
   Scope, If and Switch carry their branches. Demanding `inputs` of them reported a correctly
   formed Foreach as an action that cannot run. */
const NO_INPUTS = new Set(['Scope', 'If', 'Switch', 'Terminate', 'Foreach', 'Until']);
/* Which connector operations write an item, and therefore must carry item parameters. */
const WRITE_OPS = new Set(['PostItem', 'PatchItem']);

const findings = [];
const add = (pkg, severity, rule, action, detail, breaks) =>
  findings.push({ pkg, severity, rule, action, detail, breaks });

function walk(actions, fn, depth = 1, path = []) {
  for (const [name, node] of Object.entries(actions || {})) {
    fn(name, node, depth, path);
    const inner = [
      node.actions, node.else?.actions, node.default?.actions,
      ...(node.cases ? Object.values(node.cases).map((c) => c.actions) : []),
    ];
    for (const a of inner) walk(a, fn, depth + 1, [...path, name]);
  }
}

const files = [];
for (const { dir, estate } of DIRS) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) continue;
  for (const f of readdirSync(full).filter((x) => x.endsWith('.designer-paste.json')).sort())
    files.push({ file: join(full, f), name: f.replace('.designer-paste.json', ''), estate, rel: `${dir}/${f}` });
}

for (const { file, name, rel } of files) {
  let pkg;
  try { pkg = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { add(name, 'ERROR', 'unparseable', '-', e.message, 'the designer cannot read the clipboard payload at all'); continue; }

  /* ── 1. the clipboard envelope the designer actually reads ───────────────────────────── */
  for (const k of ['nodeId', 'serializedValue', 'allConnectionData', 'staticResults', 'isScopeNode', 'mslaNode'])
    if (!(k in pkg)) add(name, 'ERROR', 'envelope-key-missing', '-', k,
      'the designer rejects a clipboard payload whose envelope is incomplete');
  if (pkg.isScopeNode !== true) add(name, 'ERROR', 'not-a-scope-node', '-', String(pkg.isScopeNode),
    'the payload is pasted as a scope; without this flag the designer does not treat it as one');
  if (pkg.mslaNode !== true) add(name, 'ERROR', 'not-an-msla-node', '-', String(pkg.mslaNode),
    'the modern designer refuses a payload not marked as one of its own nodes');
  const sv = pkg.serializedValue || {};
  if (sv.type !== 'Scope') add(name, 'ERROR', 'root-not-scope', '-', String(sv.type),
    'the root of a pasted package must be a Scope');
  if (!sv.actions || !Object.keys(sv.actions).length)
    add(name, 'ERROR', 'no-actions', '-', 'serializedValue.actions is empty',
      'a package with no actions pastes an empty scope');

  /* ── 2. every action, line by line ───────────────────────────────────────────────────── */
  const all = new Map();
  const dupes = [];
  walk(sv.actions, (an, node, depth) => {
    if (all.has(an)) dupes.push(an);
    all.set(an, { node, depth });
  });
  for (const d of new Set(dupes)) add(name, 'ERROR', 'duplicate-action-name', d,
    'the same action name appears more than once', 'an action name is a key; the second silently replaces the first');

  const declaredVars = new Set();
  walk(sv.actions, (an, node) => { if (node.type === 'InitializeVariable') for (const v of node.inputs?.variables || []) declaredVars.add(v.name); });

  walk(sv.actions, (an, node, depth) => {
    const at = (rule, detail, breaks, sev = 'ERROR') => add(name, sev, rule, an, detail, breaks);

    if (!node.type) at('action-without-type', 'no `type`', 'the designer cannot construct the action');
    if (depth > 8) at('nesting-limit', `nested ${depth} deep`, 'Logic Apps refuses a definition nested more than 8 deep');
    if (!node.metadata?.operationMetadataId)
      at('no-operation-metadata-id', 'metadata.operationMetadataId absent',
        'the designer assigns node identity from this; without it the paste can collide with an existing node', 'WARN');

    /* runAfter must name actions that exist at the same level or above, with valid statuses. */
    for (const [target, statuses] of Object.entries(node.runAfter || {})) {
      if (!all.has(target)) at('run-after-unknown-action', `runAfter names ${target}, which is not in this package`,
        'the designer cannot resolve the dependency and the flow will not save');
      const bad = (statuses || []).filter((s) => !['Succeeded', 'Failed', 'Skipped', 'TimedOut'].includes(s));
      if (bad.length) at('run-after-bad-status', `${target}: ${bad.join(', ')}`,
        'only Succeeded, Failed, Skipped and TimedOut are valid run-after statuses');
      if (!(statuses || []).length) at('run-after-no-status', target, 'a runAfter entry with no status never fires');
    }

    if (!NO_INPUTS.has(node.type) && node.inputs === undefined)
      at('action-without-inputs', `${node.type} carries no inputs`, 'the action is incomplete and cannot run');

    /* Connector actions: the connection must be named, bound, and one this estate owns. */
    if (node.type === 'OpenApiConnection') {
      const h = node.inputs?.host || {};
      for (const k of ['apiId', 'connection', 'operationId'])
        if (!h[k]) at('connector-host-incomplete', `host.${k} missing`, 'the designer cannot bind the operation');
      const cd = pkg.allConnectionData?.[an];
      if (!cd) at('connection-not-in-clipboard', `allConnectionData has no entry for ${an}`,
        'the action pastes unbound and the designer shows a connection picker');
      else {
        const key = cd.referenceKey;
        const want = CONNECTIONS[key];
        const got = cd.connectionReference?.connectionName;
        if (!want) at('unknown-connection-reference', `referenceKey ${key}`, 'this estate binds only SharePoint and Office 365');
        else if (got !== want) at('wrong-connection-id', `${key} bound to ${got}, expected ${want}`,
          'the action resolves to a connection this estate does not own, or to none at all');
        const apiId = cd.connectionReference?.api?.id || '';
        if (!apiId.endsWith(key)) at('connection-api-mismatch', `api.id ${apiId} does not name ${key}`,
          'the reference names one api and keys off another');
      }
      const p = node.inputs?.parameters || {};
      /* SharePoint operations address a site and a list, both by value, never by title. */
      if (h.connection === 'shared_sharepointonline') {
        if (!p.dataset) at('sharepoint-no-site', 'parameters.dataset absent', 'the operation has no site to run against');
        /* Only the item operations address a LIST. CreateFile and its neighbours address a
           folder path in a document library and carry no `table` at all — demanding one reported
           a correctly formed CreateFile as an operation with nowhere to run. */
        const ITEM_OPS = /^(GetItems|GetItem|PostItem|PatchItem|DeleteItem|GetFileItem)$/;
        const FILE_OPS = /^(CreateFile|GetFileContent|GetFileMetadata|DeleteFile|CopyFile)$/;
        if (ITEM_OPS.test(h.operationId || '') && !p.table)
          at('sharepoint-no-list', 'parameters.table absent', 'the item operation has no list to run against');
        if (FILE_OPS.test(h.operationId || '')) {
          for (const k of ['folderPath', 'name'])
            if (!p[k] && h.operationId === 'CreateFile')
              at('sharepoint-file-op-incomplete', `parameters.${k} absent`, 'the file operation has no destination');
        }
        const guid = String(p.table || '').toLowerCase();
        if (guid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(guid))
          at('list-not-addressed-by-guid', `table = ${p.table}`,
            '33 list titles in this tenant name more than one list; only a GUID is unambiguous');
        else if (guid && !INDEX[guid])
          at('list-not-in-tenant-capture', `table = ${guid}`, 'the list is not in the estate capture, so nothing can confirm it exists', 'WARN');
        else if (guid && INDEX[guid] && p.dataset && INDEX[guid].siteUrl !== p.dataset)
          at('site-list-mismatch', `${INDEX[guid].title} is on ${INDEX[guid].siteUrl}, addressed at ${p.dataset}`,
            'the operation looks for the list on a site that does not hold it');
        if (WRITE_OPS.has(h.operationId) && !Object.keys(p).some((k) => k.startsWith('item/')))
          at('write-with-no-columns', `${h.operationId} supplies no item/ parameter`, 'the write carries no data');
      }
      for (const [k, v] of Object.entries(p)) {
        if (v === undefined || v === null) at('parameter-null', k, 'a null parameter is sent as no value at all');
        if (typeof v === 'string' && v.trim() === '' && !/^item\/(LastError|Note|LockToken|Reference)$/.test(k))
          at('parameter-blank', k, 'the column is written blank rather than carrying a value', 'WARN');
      }
    }

    if (node.type === 'Response') {
      const i = node.inputs || {};
      if (i.statusCode === undefined) at('response-no-status', 'inputs.statusCode absent', 'the endpoint answers with no status');
      const h = i.headers || {};
      const acao = Object.keys(h).find((x) => /^access-control-allow-origin$/i.test(x));
      if (!acao) at('response-no-cors', 'no Access-Control-Allow-Origin header', 'a browser refuses the response');
      else if (String(h[acao]).trim() === '*') at('response-wildcard-cors', 'Access-Control-Allow-Origin: *',
        'a wildcard origin is a testing posture and this estate has removed it');
      if (acao && !Object.keys(h).some((x) => /^vary$/i.test(x)))
        at('response-no-vary', 'Vary header absent while the origin varies', 'a cache can serve one origin’s response to another', 'WARN');
    }

    if (node.type === 'InitializeVariable') {
      for (const v of node.inputs?.variables || []) {
        if (!v.name) at('variable-unnamed', JSON.stringify(v), 'a variable with no name cannot be referenced');
        if (!v.type) at('variable-untyped', v.name, 'the designer requires a type on every variable');
        if (v.value === undefined) at('variable-no-initial-value', v.name,
          'an uninitialised variable reads as null on first use', 'WARN');
      }
    }
    if (/^(SetVariable|AppendToArrayVariable|AppendToStringVariable|IncrementVariable|DecrementVariable)$/.test(node.type || '')) {
      const vn = node.inputs?.name;
      if (!vn) at('variable-write-unnamed', 'inputs.name absent', 'the action does not say which variable it writes');
      else if (!declaredVars.has(vn) && !/^var/.test(vn)) at('variable-write-undeclared', vn,
        'writing a variable the flow never initialises fails at run time', 'WARN');
    }

    /* A foreach that writes a variable races itself at the default concurrency of 20. */
    if (node.type === 'Foreach') {
      if (!node.foreach) at('foreach-no-collection', 'no `foreach` expression', 'the loop has nothing to iterate');
      if (!node.actions || !Object.keys(node.actions).length)
        at('foreach-empty', 'the loop body is empty', 'the loop runs and does nothing');
      const inner = JSON.stringify(node.actions || {});
      if (/AppendTo(Array|String)Variable|"SetVariable"/.test(inner)
          && node.runtimeConfiguration?.concurrency?.repetitions !== 1)
        at('parallel-foreach-writes-variable', 'no concurrency.repetitions = 1',
          'twenty repetitions run in parallel and the variable writes race');
    }
  });

  /* ── 3. every expression resolves to something that exists ───────────────────────────── */
  const blob = JSON.stringify(sv);
  const scopes = new Set([...all].filter(([, v]) => ['Scope', 'Foreach', 'Until', 'Switch', 'If'].includes(v.node.type)).map(([k]) => k));
  for (const [re, kind] of [[/outputs\('([^']+)'\)/g, 'outputs'], [/body\('([^']+)'\)/g, 'body'], [/actions\('([^']+)'\)/g, 'actions']])
    for (const m of blob.matchAll(re))
      if (!all.has(m[1])) add(name, 'ERROR', 'expression-names-missing-action', m[1],
        `${kind}('${m[1]}') has no such action`, 'the expression evaluates to null at run time and the designer may refuse the save');
  for (const m of blob.matchAll(/result\('([^']+)'\)/g))
    if (!scopes.has(m[1])) add(name, 'ERROR', 'result-on-non-scope', m[1],
      'result() applies only to Scope, Foreach, Until, Switch and If', 'result() on a plain action returns nothing');
  for (const m of blob.matchAll(/variables\('([^']+)'\)/g))
    if (!declaredVars.has(m[1])) add(name, 'INFO', 'variable-read-from-carrier', m[1],
      'read here, initialised by the flow’s variables package', 'nothing, provided that package is pasted first');

  /* Unbalanced quotes or parens in an expression are a save-time refusal. */
  /* Counted on the STRING VALUE, walked out of the object. Matching /"@[^"]*"/ against the
     serialised JSON stopped at the first quote inside the expression — every gate expression
     contains one, `contains(..., '"*"')` — and reported 12 against 9 on an expression that is
     17 against 17. A check that mis-parses the thing it is checking invents defects. */
  const expressionStrings = [];
  (function collect(v) {
    if (typeof v === 'string') { if (v.startsWith('@')) expressionStrings.push(v); return; }
    if (Array.isArray(v)) return v.forEach(collect);
    if (v && typeof v === 'object') return Object.values(v).forEach(collect);
  })(sv.actions);
  for (const expr of expressionStrings) {
    const open = (expr.match(/\(/g) || []).length, close = (expr.match(/\)/g) || []).length;
    if (open !== close) add(name, 'ERROR', 'unbalanced-expression', '-',
      `${open} '(' against ${close} ')' in ${expr.slice(0, 90)}`, 'the designer refuses to save an unparseable expression');
    const sq = (expr.match(/'/g) || []).length;
    if (sq % 2) add(name, 'ERROR', 'unbalanced-quotes', '-', `${sq} single quote(s) in ${expr.slice(0, 90)}`,
      'an unterminated string literal is a save-time parse failure');
  }

  /* ── 4. the flow's variables package declares everything the flow reads ──────────────── */
  if (!file.endsWith('.variables.designer-paste.json')) {
    const varsFile = file.replace('.designer-paste.json', '.variables.designer-paste.json');
    if (!existsSync(varsFile)) {
      add(name, 'ERROR', 'no-variables-package', '-', `${name}.variables.designer-paste.json is absent`,
        'the flow reads variables nothing declares, and every read fails with "The variable is not defined"');
    } else {
      const vp = JSON.parse(readFileSync(varsFile, 'utf8'));
      const declared = new Set();
      walk(vp.serializedValue?.actions, (vn, vnode) => {
        if (vnode.type !== 'InitializeVariable')
          add(name, 'ERROR', 'variables-package-has-non-declaration', vn, vnode.type,
            'the variables package must contain declarations and nothing else — anything else is dragged out with them');
        for (const v of vnode.inputs?.variables || []) {
          declared.add(v.name);
          if (!v.name || !v.type || v.value === undefined)
            add(name, 'ERROR', 'variable-declaration-incomplete', v.name || '(unnamed)',
              `name=${JSON.stringify(v.name)} type=${JSON.stringify(v.type)} value=${JSON.stringify(v.value)}`,
              'the designer requires a name, a type and an initial value on every variable');
        }
      });
      if (vp.serializedValue?.type !== 'Scope')
        add(name, 'ERROR', 'variables-package-not-a-scope', '-', String(vp.serializedValue?.type),
          'the directive requires a single Scope containing the declarations');
      const read = new Set([...blob.matchAll(/variables\('([^']+)'\)/g)].map((m) => m[1]));
      walk(sv.actions, (an, node) => {
        if (/^(SetVariable|AppendToArrayVariable|AppendToStringVariable|IncrementVariable|DecrementVariable)$/.test(node.type || '')
            && node.inputs?.name) read.add(node.inputs.name);
      });
      for (const v of read)
        if (!declared.has(v)) add(name, 'ERROR', 'variable-used-but-not-declared', v,
          `the flow uses ${v}; its variables package does not declare it`,
          'the run fails with "The variable \'' + v + '\' is not defined"');
      for (const v of declared)
        if (!read.has(v)) add(name, 'WARN', 'variable-declared-but-unused', v,
          'declared and never used', 'nothing, but it is one more thing to drag out of the scope');
    }
  }

  /* ── 5. nothing that stands in for a real value ──────────────────────────────────────── */
  for (const re of PLACEHOLDER) {
    const hit = blob.match(re);
    if (hit) add(name, 'ERROR', 'placeholder-value', '-', hit[0],
      'a placeholder shipped as a value is a defect that reaches production looking like data');
  }
}

/* ── report ──────────────────────────────────────────────────────────────────────────── */
const errors = findings.filter((f) => f.severity === 'ERROR');
const warns = findings.filter((f) => f.severity === 'WARN');
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ packages: files.length, errors: errors.length, warnings: warns.length, findings }, null, 2));
} else {
  console.log(`\nForensic validation — ${files.length} package(s)\n`);
  const byPkg = {};
  for (const f of findings) (byPkg[f.pkg] = byPkg[f.pkg] || []).push(f);
  for (const { name } of files) {
    const fs_ = (byPkg[name] || []).filter((f) => f.severity !== 'INFO');
    if (!fs_.length) { console.log(`  ✅ ${name}`); continue; }
    console.log(`  ${fs_.some((f) => f.severity === 'ERROR') ? '❌' : '⚠️ '} ${name}`);
    for (const f of fs_) console.log(`       ${f.severity} ${f.rule} · ${f.action}\n         ${f.detail}\n         breaks: ${f.breaks}`);
  }
  console.log(`\n${errors.length ? '❌' : '✅'} ${errors.length} error(s), ${warns.length} warning(s) across ${files.length} package(s)\n`);
}
process.exit(errors.length ? 1 : 0);
