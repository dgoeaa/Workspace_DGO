#!/usr/bin/env node
// Every link the flow estate sends people: which flow, which action, whether an email uses
// it, what it says now, and exactly what to change it to.
// Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md §8a (DL-2, DL-5).
// Procedure: docs/deployment/PLATFORM_ACCESS_RUNBOOK.md, part C.
//
//   node scripts/audit-deeplinks.mjs                      write docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md
//   node scripts/audit-deeplinks.mjs --check              exit 1 if the committed report is stale
//   node scripts/audit-deeplinks.mjs --from <dir> --print audit a fresh export (for example
//                                                          docs/folio-Master-Flows-and-Endpoints/contracts/exported) and print it
//
// It reads flow exports ({ workflow_identity, definition }), walks every action, and looks at
// the text of each action that writes a link: a Compose, a Set variable, or an email body.
// "In use" means another action reads its output (outputs('Name') / body('Name') /
// variables('name')), so the link reaches someone's inbox. An action nothing reads is a
// leftover sample: changing it is tidy but changes no email.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DeepLinkConfig } from '../config/deeplink.config.js';
import { parseDeepLink } from '../core/deeplink-parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRC = path.resolve(ROOT, opt('--from', 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed'));
const OUT = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints', 'deployment', 'DEEPLINK_AUDIT.md');

const PROD = new URL(DeepLinkConfig.productionBase);
const PROD_ORIGIN = PROD.origin; // no trailing slash: flows append '/index.html' themselves
const PARAMS = Object.keys(DeepLinkConfig.acceptedParams);
const PAGES = Object.keys(DeepLinkConfig.pathRoutes || {});
/* Pages the Workspace publishes on its own host: the app and the forwarders. */
const PUBLISHED = new Set(['', 'index.html', ...PAGES]);
/* Hosts that notification links have pointed at before the Workspace had one address. */
const OLD_HOST = /(taskack\.page\.gd|cloud-registry\.page\.gd|activityweb\.page\.gd|apps\.powerapps\.com\/play\/[0-9a-f-]+|yourdomain\.com|example\.com)/i;
const URL_RE = /https?:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._\/-]*)?/g;

/** The same link on the production host; only the host (and a retired app's path) changes. */
export function repoint(base) {
  const u = new URL(base);
  const page = u.pathname.split('/').pop();
  return PUBLISHED.has(page.toLowerCase()) && page ? `${PROD_ORIGIN}/${page}` : `${PROD_ORIGIN}/`;
}

/** Every action in a definition, with the chain of scopes it sits in. */
export function* actions(node, trail = []) {
  if (!node || typeof node !== 'object') return;
  for (const [key, val] of Object.entries(node)) {
    if (key === 'actions' && val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [name, act] of Object.entries(val)) {
        if (act && typeof act === 'object' && act.type) {
          yield { name, act, trail: [...trail, name] };
          yield* actions(act, [...trail, name]);
        }
      }
    } else if (key !== 'actions' && val && typeof val === 'object') {
      yield* actions(val, trail);
    }
  }
}

export const textOf = (act) => {
  const i = act.inputs;
  if (typeof i === 'string') return i;
  if (i && typeof i === 'object' && typeof i.value === 'string' && act.type === 'SetVariable') return i.value;
  return JSON.stringify(i ?? '');
};

const q = `(?:'|\\\\u0027)`;
const readsOutput = (text, name) => new RegExp(`(?:outputs|body)\\(${q}${name}${q}\\)`).test(text);
const readsVariable = (text, v) => new RegExp(`variables\\(${q}${v}${q}\\)`).test(text);
const INTERMEDIATE = new Set(['Compose', 'SetVariable', 'AppendToStringVariable', 'InitializeVariable']);

/**
 * Which actions' text reaches a message. A Compose or a variable only matters if something
 * reads it; follow those reads until they end in a real action (an email, an HTTP reply, a
 * list update). An action at the end of no such chain is a leftover.
 */
function reachability(all) {
  const byName = new Map(all.map(a => [a.name, a]));
  const text = new Map(all.map(a => [a.name, JSON.stringify(a.act.inputs ?? '')]));
  const readersOf = (a) => {
    const v = a.act.type === 'SetVariable' || a.act.type === 'AppendToStringVariable' ? a.act.inputs?.name : null;
    return all.filter(r => r !== a && (readsOutput(text.get(r.name), a.name) || (v && readsVariable(text.get(r.name), v))));
  };
  const memo = new Map();
  const live = (a, seen = new Set()) => {
    if (memo.has(a.name)) return memo.get(a.name);
    if (!INTERMEDIATE.has(a.act.type)) { memo.set(a.name, true); return true; }
    if (seen.has(a.name)) return false;
    seen.add(a.name);
    const result = readersOf(a).some(r => live(r, seen));
    memo.set(a.name, result);
    return result;
  };
  return { live, readersOf, byName };
}

function paramsAfter(text, from) {
  const tail = text.slice(from, from + 1500);
  const out = [];
  for (const p of PARAMS) {
    const m = tail.match(new RegExp(`[?&]${p}=([^&'"\\s<]*)(.{0,12})`, 's'));
    if (m) out.push({ name: p, empty: m[1] === '' && /^["<\s]|^'\s*\)/.test(m[2]) });
  }
  return out;
}

/** A whole value on the production host: keep the page if the Workspace publishes it, and the query. */
function repointValue(value) {
  const md = value.match(/^\[(https?:\/\/[^\]]+)\]\(/);
  const u = new URL(md ? md[1] : value);
  const page = u.pathname.split('/').pop();
  const keepPage = page && PUBLISHED.has(page.toLowerCase());
  if (!keepPage && !u.search && (u.pathname === '/' || u.pathname === '')) return PROD_ORIGIN;
  return `${PROD_ORIGIN}/${keepPage ? page : ''}${u.search}`;
}

function inspect(flow, id, reach, entry) {
  const { name, act, trail } = entry;
  const text = textOf(act);
  if (!OLD_HOST.test(text)) return [];
  const rows = [];
  const inUse = reach.live(entry);
  const base = { flow, id, action: name, path: trail.join(' › '), type: act.type, inUse };

  /* Text a reader glues on after the id (e.g. `…@{…['ID']}veggie `) breaks every link. */
  const followUps = [];
  for (const r of reach.readersOf(entry)) {
    const t = textOf(r.act);
    const m = t.match(new RegExp(`(?:outputs|body)\\('${name}'\\)\\}@\\{[^}]+\\}([^"@<]+)$`)) || t.match(new RegExp(`(?:outputs|body)\\('${name}'\\)\\}@\\{[^}]+\\}([A-Za-z][^"@<]*)`));
    if (m && m[1].trim()) followUps.push({ ...base, action: r.name, path: r.trail.join(' › '), type: r.act.type, inUse: reach.live(r),
      now: t, change: t.replace(m[1], ''), whole: true, route: '(adds the id)',
      problems: [`the text \`${m[1]}\` is stuck on after the id, so the Workspace cannot find the item: delete it`] });
  }

  /* A value that is one address (a base constant, or a link the flow appends an id to). */
  const trimmed = text.trim();
  if (/^https?:\/\/\S*$/.test(trimmed) || /^\[https?:\/\/[^\]]+\]\(https?:\/\/[^)]+\)$/.test(trimmed)) {
    const problems = [/yourdomain|example\.com/i.test(trimmed) ? 'placeholder host' : 'old host'];
    if (trimmed.includes('](')) problems.unshift('malformed: a Markdown link was pasted as the address, so every link built from it is broken');
    const parsed = parseDeepLink(`${repointValue(trimmed)}${/[?&]$/.test(trimmed) || /=$/.test(trimmed) ? 'X' : ''}`, 'http://localhost/');
    rows.push({ ...base, now: trimmed, change: repointValue(trimmed), whole: true, problems, route: parsed.route || '(base address)' });
    return [...rows, ...followUps];
  }

  const seen = new Set();
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0];
    if (!OLD_HOST.test(url) || seen.has(url)) continue;
    seen.add(url);
    const params = paramsAfter(text, m.index + url.length);
    const page = url.split('/').pop().toLowerCase();
    if (!params.length && !PAGES.includes(page) && !/apps\.powerapps\.com/.test(url)) continue;
    const parsed = parseDeepLink(`${url}?${params.map(p => `${p.name}=X`).join('&')}`, 'http://localhost/');
    const problems = [/yourdomain|example\.com/i.test(url) ? 'placeholder host' : 'old host'];
    const empty = params.find(p => p.empty);
    if (empty) problems.push(`\`${empty.name}=\` is empty: the task id must be added after it`);
    if (!parsed.route) problems.push('the Workspace does not route it');
    rows.push({ ...base, now: url, change: repoint(url), whole: false, problems, route: parsed.route || '—', params: params.map(p => p.name) });
  }
  return [...rows, ...followUps];
}

/**
 * Buttons in the email a flow actually sends that link nowhere (`<a href="">`). Follows the
 * send action's body through the Compose actions it reads, to the HTML that goes out.
 */
function emptyButtons(flow, id, all) {
  const byName = new Map(all.map(a => [a.name, a]));
  const rows = [];
  for (const send of all) {
    const p = send.act.inputs?.parameters || {};
    const bodyKey = Object.keys(p).find(k => /emailMessage\/Body$|^body\/Body$|^Body$/.test(k));
    if (!bodyKey) continue;
    let text = String(p[bodyKey]); let holder = send; let hops = 0;
    let ref;
    while ((ref = text.trim().match(/^@\{?outputs\('([^']+)'\)\}?$/)) && byName.has(ref[1]) && hops++ < 4) {
      holder = byName.get(ref[1]); text = textOf(holder.act);
    }
    for (const m of text.matchAll(/<a\s[^>]*href=""[^>]*>([\s\S]*?)<\/a>/g)) {
      const label = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || '(no text)';
      const want = /acknowledg/i.test(label) ? ['Compose_Task_Acknowledgement_Link', 'Compose_Acknowledgement_Link']
        : /support/i.test(label) ? ['Compose_SupportLink', 'Compose_Support_Link'] : [];
      const source = want.find(n => byName.has(n));
      rows.push({ flow, id, action: holder.name, path: holder.trail.join(' › '), type: holder.act.type, inUse: true,
        sentBy: send.name, label, now: 'href=""', whole: false, route: '(email button)',
        change: source ? `href="@{outputs('${source}')}"` : 'href="…" pointing at this flow\'s link action',
        problems: [`the **${label}** button in the email that ${send.name} sends links nowhere`] });
    }
  }
  return rows;
}

export function audit(dir = SRC) {
  const rows = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    let doc;
    const raw = fs.readFileSync(path.join(dir, file), 'utf8');
    try { doc = JSON.parse(raw); } catch { continue; }
    const def = doc.definition || doc.properties?.definition || doc;
    const w = doc.workflow_identity || {};
    const flow = w.tags?.flowDisplayName || file.split('__')[0];
    const id = w.internal_name || file.split('__')[1] || '';
    const all = [...actions(def)];
    const reach = reachability(all);
    const buttons = emptyButtons(flow, id, all);
    for (const b of buttons) b.file = file;
    rows.push(...buttons);
    /* A link action an empty button is about to point at goes live with that fix. */
    const willUse = new Set(buttons.map(b => (b.change.match(/outputs\('([^']+)'\)/) || [])[1]).filter(Boolean));
    for (const a of all) {
      for (const r of inspect(flow, id, reach, a)) {
        if (!r.inUse && willUse.has(r.action)) { r.inUse = true; r.problems.push('goes live when the empty button above is fixed: change it in the same edit'); }
        r.file = file;
        rows.push(r);
      }
    }
  }
  return rows;
}

const ENV = 'Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1';
const openLink = (id) => `https://make.powerautomate.com/environments/${ENV}/flows/${id}/details`;

export function render(rows, dir = SRC) {
  const live = rows.filter(r => r.inUse);
  const spare = rows.filter(r => !r.inUse);
  const flows = [...new Set(live.map(r => r.flow))];
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\n/g, ' ');
  const lines = [
    '# Deep-link audit',
    '',
    `<!-- GENERATED by scripts/audit-deeplinks.mjs from ${path.relative(ROOT, dir)}/ — do not edit. Regenerate: npm run deeplinks:audit -->`,
    '',
    'Every action in the exported flows that writes a link into a message, run through the parser the Workspace uses (`core/deeplink-parse.js`). How to make each change, and how to check it: [`PLATFORM_ACCESS_RUNBOOK.md`](../../deployment/PLATFORM_ACCESS_RUNBOOK.md), part C.',
    '',
    `The Workspace is published at **${PROD.href}** (\`productionBase\` in \`config/deeplink.config.js\`).`,
    '',
    '| | Count |',
    '|---|---|',
    `| Link actions an email uses: **must change** | **${live.length}**, in ${flows.length} flows |`,
    `| Link actions nothing uses: optional tidy-up, no email changes | ${spare.length} |`,
    `| Broken right now in emails that go out (empty button, malformed address, text stuck to the id) | ${live.filter(r => r.problems.some(p => /malformed|placeholder|is empty:|links nowhere|stuck/.test(p))).length} |`,
    '',
    '## Must change: these links reach people',
    '',
    'For each flow: open it with the link, choose **Edit**, find the action by following the path (each `›` is one level of scope or condition to expand), then change the action\'s text as shown. **Change only the address.** Leave every parameter and expression after it exactly as it is.',
    '',
  ];
  for (const flow of flows) {
    const list = live.filter(r => r.flow === flow);
    lines.push(`### ${flow}`, '', `Open: ${openLink(list[0].id)}`, '', '| # | Action and where it is | Type | Find this text | Replace it with | Notes |', '|---|---|---|---|---|---|');
    list.forEach((r, i) => lines.push(`| ${i + 1} | **${r.action}**<br>${cell(r.path)} | ${r.type} | \`${cell(r.now)}\` | \`${cell(r.change)}\` | ${cell([r.route === '(email button)' ? `In the HTML of this action, find the link of the **${r.label}** button, whose href is empty, and fill it in as shown.` : r.whole ? 'Replace the whole value.' : `Opens: ${r.route}${r.params?.length ? ` (${r.params.join(', ')})` : ''}`, ...r.problems].join('; '))} |`));
    lines.push('');
  }
  lines.push('## Optional: link actions nothing uses', '', 'Nothing reads these actions, so no email carries their links. Change them the same way to keep the flows tidy, or leave them. They are listed so that nobody mistakes them for live links.', '', '| Flow | Action | Now | Would become |', '|---|---|---|---|');
  for (const r of spare) lines.push(`| ${cell(r.flow)} | ${cell(r.action)} | \`${cell(r.now)}\` | \`${cell(r.change)}\` |`);
  lines.push('', `**Done when:** after re-exporting the flows (\`scripts/export-power-automate-flows.ps1\`), \`node scripts/audit-deeplinks.mjs --from docs/folio-Master-Flows-and-Endpoints/contracts/exported --print\` shows **0** in the first row.`, '');
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const text = render(audit());
  if (argv.includes('--print')) { process.stdout.write(text); process.exit(0); }
  if (argv.includes('--check')) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (have !== text) { console.error('docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md is stale. Run: npm run deeplinks:audit'); process.exit(1); }
    console.log('docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md matches the flow exports');
  } else {
    fs.writeFileSync(OUT, text);
    console.log('wrote docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md');
  }
}
