#!/usr/bin/env node
/**
 * Build the standalone administrative console: ONE HTML file, no server, no build, no network.
 *
 * WHY A SECOND CONSOLE, AND WHY IT IS A FILE RATHER THAN A ROUTE
 *
 * `modules/endpoint-console.js` administers the estate from inside the internal platform. That is
 * the right place for an operator who is already signed in, and the wrong place for four jobs the
 * same person actually has:
 *
 *   · Commissioning happens BEFORE the platform is wired. A console that needs the platform to
 *     boot cannot tell you why the platform will not boot — the endpoints it reads are the thing
 *     that is missing.
 *   · The public portal has no administrative surface and must never grow one. Its seven keys
 *     were therefore visible from nowhere.
 *   · A deployed build is inspected by someone who has a copy of `config.local.js` and no
 *     checkout, no Node, and no rights on the running site.
 *   · A phone. `docs/deployment/CLEAR-THE-LAST-BLOCKER-TERMUX.md` exists because that is where
 *     this work is done; a laptop-only tool is not available at the moment of use.
 *
 * So this one is a single file that opens by double-click, from a USB stick, from `file://`, with
 * no dependency on either platform, on npm, or on being online.
 *
 * ONE ANALYSIS, NOT TWO
 *
 * The judgements — configured, signed, pointing at the workflow the register names — are NOT
 * reimplemented here. `core/endpoint-atlas.js` is read, its import lines are removed, and the
 * source is embedded verbatim alongside the data those imports would have supplied. Two consoles
 * disagreeing about whether an endpoint is healthy would be worse than having one, and a copy
 * maintained by hand is how that happens. `--check` fails if the built file no longer matches
 * what the source produces now, so the copy cannot rot.
 *
 * WHAT IT MAY NEVER CONTAIN. A signature. The atlas it embeds stops at `sig=`; anything the user
 * loads at runtime — a values file, a `config.local.js` — is read in the browser, held in memory,
 * redacted before display, and never written anywhere. The built file is committed, so
 * `tests/admin-console.test.mjs` scans it for signature-shaped values and fails on one.
 *
 *   npm run console            # build tools/admin-console.html
 *   npm run console -- --check # fail if it has drifted from its sources
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/admin-console.html');
const CHECK = process.argv.includes('--check');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const { EndpointAtlas } = await import(path.join(ROOT, 'config/endpoint-atlas.data.js'));
const { EndpointContracts, EndpointKeys } = await import(path.join(ROOT, 'config/endpoints.config.js'));

/* The analysis, verbatim, minus the imports whose values are injected below it. Stripping by
   line rather than by regex over the whole file so a string containing the word "import" inside
   a comment cannot silently remove a line of logic. */
const analysis = read('core/endpoint-atlas.js')
  .split('\n')
  /* `export default X;` becomes `default X;` if the keyword is merely stripped — a syntax error
     that blanks the whole page, and one a build that only checks for signatures would ship. The
     default export has no meaning in a classic script, so the line goes rather than the word. */
  .filter((l) => !/^import\s/.test(l) && !/^export\s+default\s/.test(l))
  .join('\n')
  .replace(/^export\s+/gm, '');

/* `redact` is the one thing the analysis needs from the platform's registry. Extracted from its
   source rather than rewritten, for the same reason the analysis is: one definition of what
   "redacted" means, or the two consoles hide different things. */
const registrySrc = read('core/endpoint-registry.js');
const redactStart = registrySrc.indexOf('export function redact');
const redactSrc = registrySrc.slice(redactStart, registrySrc.indexOf('\n}', redactStart) + 2)
  .replace(/^export\s+/, '');
if (!redactSrc.includes('sig')) {
  console.error('\n  ✖  Could not extract redact() from core/endpoint-registry.js — refusing to '
    + 'build a console that might display a signature.\n');
  process.exit(2);
}

/* Contracts are stripped of `url`: in a checkout that has been wired, EndpointContracts carries
   the resolved URL, and that URL carries the signature. Embedding it would put a live credential
   in a committed file — and the built console does not need it, because the URL it analyses is
   the one the user loads at runtime. */
const contracts = Object.fromEntries(
  Object.entries(EndpointContracts).map(([k, c]) => [k, { ...c, url: undefined }]));

const DATA = `
const EndpointAtlas = ${JSON.stringify(EndpointAtlas, null, 2)};
const EndpointContracts = ${JSON.stringify(contracts, null, 2)};
const EndpointKeys = ${JSON.stringify(EndpointKeys)};
const EndpointRegistry = { ${redactSrc.replace(/^function redact/, 'redact:function redact')} };
`.trim();

const CSS = `
:root{color-scheme:light dark;
 --bg:#F4F6F5;--card:#FFF;--ink:#111C17;--ink2:#4C5D55;--ink3:#7C8D85;--line:#D8E0DB;
 --brand:#05583B;--ok:#0B7A46;--okbg:#E8F5EE;--warn:#8A5B00;--warnbg:#FCF3E3;
 --bad:#B3132C;--badbg:#FCEBEE;--info:#2C5F80;--infobg:#EAF2F7;
 --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
 --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
@media(prefers-color-scheme:dark){:root{
 --bg:#0E1512;--card:#161F1B;--ink:#E8EFEB;--ink2:#A9BAB2;--ink3:#7D9087;--line:#2A3833;
 --brand:#3FBF87;--ok:#4ED08A;--okbg:#12291F;--warn:#E0AE55;--warnbg:#2A2113;
 --bad:#FF7A8A;--badbg:#2E151A;--info:#7FB6DA;--infobg:#132430}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 var(--sans)}
header.top{background:var(--brand);color:#fff;padding:18px 20px}
@media(prefers-color-scheme:dark){header.top{background:#0A2E20}}
header.top h1{margin:0;font-size:19px;letter-spacing:-.01em}
header.top p{margin:6px 0 0;opacity:.9;font-size:13px;max-width:80ch}
.wrap{max-width:1200px;margin:0 auto;padding:18px 20px 60px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi small{display:block;color:var(--ink3);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.kpi b{display:block;font-size:22px;margin-top:4px;font-weight:650}
nav.tabs{display:flex;gap:6px;flex-wrap:wrap;margin:18px 0 14px}
nav.tabs button{font:inherit;font-size:13px;padding:7px 13px;border-radius:999px;cursor:pointer;
 border:1px solid var(--line);background:var(--card);color:var(--ink2)}
nav.tabs button[aria-selected=true]{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:600}
section.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 14px}
section.panel h2{margin:0 0 4px;font-size:16px}
section.panel h3{margin:14px 0 6px;font-size:14px}
.muted{color:var(--ink2);font-size:13px}
.tiny{color:var(--ink3);font-size:12px}
code,.mono{font-family:var(--mono);font-size:12px;overflow-wrap:anywhere}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:650;
 border:1px solid var(--line);background:var(--bg);color:var(--ink2);white-space:nowrap}
.pill.ok{background:var(--okbg);color:var(--ok);border-color:transparent}
.pill.bad{background:var(--badbg);color:var(--bad);border-color:transparent}
.pill.warn{background:var(--warnbg);color:var(--warn);border-color:transparent}
.pill.info{background:var(--infobg);color:var(--info);border-color:transparent}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:10px}
table{border-collapse:collapse;width:100%;font-size:13px;min-width:640px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--ink3);font-size:11px;text-transform:uppercase;letter-spacing:.05em;font-weight:650}
tr[data-key]{cursor:pointer}tr[data-key]:hover td{background:var(--bg)}
input[type=text],input[type=search],textarea{font:inherit;font-size:13px;width:100%;padding:8px 10px;
 border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
textarea{font-family:var(--mono);min-height:120px;resize:vertical}
button.btn{font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;
 border:1px solid var(--brand);background:var(--brand);color:#fff}
button.btn.ghost{background:transparent;color:var(--brand)}
button.btn:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 18px;margin-top:10px}
.finding{border-left:3px solid var(--line);padding-left:12px;margin:14px 0}
.finding.error{border-color:var(--bad)}.finding.warn{border-color:var(--warn)}.finding.info{border-color:var(--info)}
.note{background:var(--warnbg);border:1px solid transparent;border-radius:10px;padding:12px 14px;margin:12px 0;font-size:13px;color:var(--warn)}
.drop{border:2px dashed var(--line);border-radius:12px;padding:22px;text-align:center;color:var(--ink3);font-size:13px}
.drop.over{border-color:var(--brand);color:var(--brand)}
ul.plain{margin:8px 0;padding-left:20px}ul.plain li{margin:3px 0;font-size:13px}
@media print{nav.tabs,button{display:none}body{background:#fff}section.panel{break-inside:avoid}}
.kpi.good b{color:var(--ok)}.kpi.bad b{color:var(--bad)}
section.panel.good{border-color:var(--ok)}section.panel.danger{border-color:var(--bad)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:12px}
.card{border:1px solid var(--line);border-radius:10px;padding:14px}
.card h3{margin:0 0 6px;font-size:14px}
.stack{display:flex;flex-direction:column;gap:10px;margin-top:10px}
.issue{border:1px solid var(--line);border-left-width:3px;border-radius:8px;padding:12px 14px}
.issue.bad{border-left-color:var(--bad)}.issue.warn{border-left-color:var(--warn)}.issue.good{border-left-color:var(--ok)}
.issue p{margin:4px 0}
.flowhead{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px}
.progress{position:relative;height:26px;border-radius:999px;background:var(--bg);border:1px solid var(--line);margin:14px 0;overflow:hidden}
.progress .bar{position:absolute;inset:0 auto 0 0;background:var(--ok);opacity:.25;transition:width .3s}
.progress span{position:relative;display:block;text-align:center;line-height:24px;font-size:12px;font-weight:650;color:var(--ink2)}
.chip{font:inherit;font-size:12px;padding:5px 11px;border-radius:999px;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink2);margin-right:6px}
.chip.on{background:var(--brand);border-color:var(--brand);color:#fff;font-weight:650}
th.sortable{cursor:pointer;user-select:none}th.sortable:hover{color:var(--ink)}th.sortable.on{color:var(--brand)}
tr[data-key],tr[data-wf]{cursor:pointer}
.tiny-btn{padding:3px 9px;font-size:11px}
input.bad{border-color:var(--bad)}
.check{display:flex;gap:9px;align-items:flex-start;margin:12px 0;font-size:13px;color:var(--ink2)}
.check input{margin-top:3px;flex:none}
.note.bad{background:var(--badbg);color:var(--bad)}
p.bad{color:var(--bad)}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,14px);opacity:0;transition:.25s;
 background:var(--ink);color:var(--bg);padding:10px 18px;border-radius:999px;font-size:13px;z-index:99;max-width:90vw;text-align:center}
.toast.in{opacity:1;transform:translate(-50%,0)}
.toast.bad{background:var(--bad);color:#fff}
@media(max-width:640px){.wrap{padding:14px 12px 50px}header.top{padding:14px 12px}.kpi b{font-size:18px}}
`.trim();

/* The UI, from its own source file rather than a string in this one.
 *
 * It grew past the point where a template literal was honest: no syntax highlighting, no
 * linting, no way to run it, and backticks banned inside it. `scripts/lib/admin-console-ui.js`
 * is a plain script — deliberately not a module, because the console is one <script> in one file
 * and must run from file:// where module loading is restricted — and it is inlined verbatim.
 */
const UI = read('scripts/lib/admin-console-ui.js');

/* THE BUILD DATE MUST NOT BE PART OF WHAT --check COMPARES.
 *
 * This stamped `new Date()` into the output and then compared the whole file byte for byte, so
 * `npm run test:console` went red on the first day after a build and stayed red — not because a
 * source had changed but because the calendar had. It was red on this baseline, in the middle of
 * the chain, for exactly that reason. A gate that fails for a reason unrelated to correctness
 * teaches an operator to scroll past red, which costs more than the gate is worth.
 *
 * Under --check the stamp is carried forward from the file on disk, so the comparison measures
 * source drift and nothing else. The stamp keeps its meaning either way: it records the day the
 * console was actually built, not the day someone last ran the check. */
const previousBuildDate = (() => {
  if (!CHECK || !fs.existsSync(OUT)) return null;
  const m = fs.readFileSync(OUT, 'utf8').match(/const BUILD = \{"at":"(\d{4}-\d{2}-\d{2})"/);
  return m ? m[1] : null;
})();

const buildMeta = {
  at: previousBuildDate || new Date().toISOString().slice(0, 10),
  source: 'docs/reference/endpoint-register.json',
};

const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DGO Endpoint Administration — standalone console</title>
<!--
  GENERATED — do not edit. Rebuild with: npm run console
  Built ${buildMeta.at} from ${buildMeta.source}.

  A single self-contained file. No server, no build, no network, no dependency on the internal
  platform or the public portal. Open it by double-click, from a USB stick, from file://.

  It carries NO SIGNATURE and never will: the URLs embedded below stop at "sig=". Anything you
  load into it is read in your browser, held in memory, redacted before display, and discarded
  when the tab closes. It writes nothing to disk and nothing to browser storage.
-->
<style>${CSS}</style>
</head><body>
<header class="top">
  <h1>DGO Endpoint Administration</h1>
  <p>Standalone console for the whole endpoint estate — ${EndpointAtlas.keys.length} contract keys across the internal platform
     and the public portal, and all ${EndpointAtlas.workflows.length} workflows in the tenant. Runs entirely in this page:
     nothing is uploaded, nothing is stored.</p>
</header>
<main class="wrap" id="app"></main>
<script>
const BUILD = ${JSON.stringify(buildMeta)};
${DATA}
${analysis}
${UI}
</script>
</body></html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;

/* Never ship a console carrying a credential. Checked on the built artefact rather than on the
   inputs, because the artefact is what gets copied onto a USB stick and emailed to a colleague. */
const leaked = html.match(/sig=[A-Za-z0-9_%-]+/g) || [];
if (leaked.length) {
  console.error(`\n  ✖  The built console carries ${leaked.length} signature value(s). Refusing to write it.\n`);
  process.exit(2);
}

/* The page is one <script>. A syntax error anywhere in it blanks the entire console, silently,
   and the artefact is committed — so it is parsed here rather than discovered by whoever opens
   it. This caught `export default` surviving the import strip. */
const inlineScript = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
try {
  new Function(inlineScript);
} catch (e) {
  console.error(`\n  ✖  The built console does not parse: ${e.message}`);
  console.error('     Refusing to write a file that would open as a blank page.\n');
  process.exit(2);
}

if (CHECK) {
  /* The build date is stamped from the clock, so a byte-for-byte comparison reports drift on
     every day after the one the file was built on — the gate would go red overnight with nothing
     changed. `--check` asks whether the CONTENT has drifted from its sources, and the date is not
     one of them, so it is normalised out of both sides. Everything else, including the source
     path the date sits beside, is still compared exactly. */
  const undated = (x) => String(x)
    .replace(/^(\s*Built )\d{4}-\d{2}-\d{2}( from )/m, '$1<date>$2')
    .replace(/("at":")\d{4}-\d{2}-\d{2}(")/, '$1<date>$2');
  if (previous !== null && undated(previous) === undated(html)) {
    console.log(`\n  ✅ ${path.relative(ROOT, OUT)} matches its sources.\n`);
    process.exit(0);
  }
  console.error(`\n  ✖  ${path.relative(ROOT, OUT)} has drifted from its sources.`);
  console.error('     Run: npm run console\n');
  process.exit(1);
}

fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`\nStandalone administrative console\n`);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${kb} KB, one file, no dependencies`);
console.log(`     ${EndpointAtlas.keys.length} contract keys · ${EndpointAtlas.workflows.length} tenant workflows · no signature\n`);
console.log(`  Open it directly in a browser — no server needed. It runs from file://,`);
console.log(`  from a USB stick, and offline.\n`);
