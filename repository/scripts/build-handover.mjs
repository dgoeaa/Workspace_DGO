#!/usr/bin/env node
/**
 * The NITDA Folio Handover Pack and the confidential Deployment Kit, built from the repository and the private build.
 *
 *   npm run handover -- --builds DIR [--out DIR]
 *
 *   --builds  the folder npm run config:rebuild wrote (FOLIO-WORKSPACE-v<version>-upload-to-site-root.zip and
 *             FOLIO-PORTAL-v<version>-upload-to-portal-site-root.zip; the Workspace zip carries mailer.html)
 *   --from-ledger  in place of --builds: the Pack and the Toolkit for the build registers/config-build-ledger.json
 *             records as delivered, without the Deployment Kit (its uploads are the private build)
 *   --out     where to write, outside the repository (default ../folio-handover)
 *
 * NITDA-Folio-Handover-Pack-<date>.zip carries no signed flow address and may be shared within the Agency. Every item
 * is numbered by its place in the pack, and its document reference carries the same number:
 *   00 Read Me First.pdf
 *   01 Commissioning/          1.1 Commissioning Report · 1.2 Registers workbook · 1.3 Supporting Evidence/
 *   02 Documentation/          2.1 Handbook · 2.2 User Guide · 2.3 Administrator Guide · 2.4 Developer Guide
 *   03 Power Automate Flows/   3.1 Flow Catalogue · 3.2 Flow Package Guide · 3.3 Flow Packages/<group>/
 *   04 Applications and Tools/ 4.1 Running the Administrator Tools · 4.2 Source Code · 4.3 Mailer Package
 *   Checksums.txt
 * NITDA-Folio-Deployment-Kit-<date>-CONFIDENTIAL.zip carries the two site uploads, which hold signed addresses, with
 * their instructions and checksums.
 *
 * Every document is rendered from its Markdown source (docs/handbook, the package READMEs, scripts/handover) with a
 * cover, document control, a contents page with page numbers and PDF bookmarks, and printed by the Chromium the browser
 * suite uses; pdftotext (poppler) reads back where each heading landed. A link to a file placed in the pack points at
 * the placed copy; a link to anything else opens the file in the repository at this commit.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readAll } from './lib/outstanding-sources.mjs';
import { byteCompare } from './lib/stable-sort.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { Marked } = require('marked');
const { RequiredNotifications } = await import(pathToFileURL(path.join(ROOT, 'config/notification-matrix.config.js')).href);

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const BUILDS = arg('--builds', '');
/* The packages are found by their identity (scripts/lib/package-identity.mjs): FOLIO-WORKSPACE-v<version>-…zip, or the
   unversioned name of a build made before versions. Their version is carried into the kit's file names. */
const { findZip, zipName } = await import(pathToFileURL(path.join(ROOT, 'scripts/lib/package-identity.mjs')).href);
/* --from-ledger: the build last delivered, as registers/config-build-ledger.json records it, with no private build at
   hand. The Handover Pack and the Administrator Toolkit hold no signed address and are written for that build; the
   Deployment Kit, whose two uploads do, is not written: the kit delivered for that version stays current until the sites
   are rebuilt (npm run config:rebuild), and a new kit then comes from --builds. */
const FROM_LEDGER = process.argv.includes('--from-ledger');
const LEDGER_V = FROM_LEDGER ? JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/registers/config-build-ledger.json'), 'utf8')).version : '';
const WS_ZIP = FROM_LEDGER ? { file: zipName('WORKSPACE', LEDGER_V, 'upload-to-site-root'), version: LEDGER_V }
  : BUILDS && fs.existsSync(BUILDS) ? findZip(BUILDS, 'WORKSPACE', 'upload-to-site-root') : null;
const PORTAL_ZIP = FROM_LEDGER ? { file: zipName('PORTAL', LEDGER_V, 'upload-to-portal-site-root'), version: LEDGER_V }
  : BUILDS && fs.existsSync(BUILDS) ? findZip(BUILDS, 'PORTAL', 'upload-to-portal-site-root') : null;
if (!WS_ZIP || !PORTAL_ZIP || (FROM_LEDGER && !LEDGER_V)) {
  console.error('--builds must name the folder npm run config:rebuild wrote (it holds FOLIO-WORKSPACE-v<version>-upload-to-site-root.zip),'
    + ' or pass --from-ledger to build the Handover Pack and the Administrator Toolkit for the build last delivered');
  process.exit(2);
}
const WITH_KIT = !FROM_LEDGER;
const vtag = (z) => (z.version ? ` v${z.version}` : '');
const PARENT = path.resolve(arg('--out', path.join(ROOT, '..', 'folio-handover')));
if (PARENT === ROOT || PARENT.startsWith(ROOT + path.sep)) { console.error('--out must be outside the repository'); process.exit(2); }

const git = (a) => execSync(`git -C "${ROOT}" ${a}`).toString().trim();
const COMMIT = git('rev-parse HEAD');
const SHORT = COMMIT.slice(0, 8);
const BRANCH = git('rev-parse --abbrev-ref HEAD');
const GH = `https://github.com/dgoeaa/ECM_DOCS_DEV/blob/${COMMIT}/`;
const NOW = new Date();
const DAY = NOW.toISOString().slice(0, 10);
const DATE = NOW.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const SIG = /[?&]sig=[A-Za-z0-9_%-]{10,}|sig%3D[A-Za-z0-9_%-]{10,}/;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wbr = (s) => esc(s).replace(/_/g, '_<wbr>').replace(/\.(?=[a-z])/g, '.<wbr>');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(String(iso || '')); return m ? `${+m[3]} ${MONTHS[m[2] - 1]} ${m[1]}${m[4] ? `, ${m[4]} UTC` : ''}` : ''; };

/* Each bundle is identified (owner, 2026-10-20): by the build it ships (the Workspace and Portal version in the Deployment
   Kit, scripts/lib/package-identity.mjs) and the commit its documents and tools were made from. Two handovers of one
   build made from different commits therefore never share a name. Each bundle also holds BUILD-ID.json, and every
   document's control table names the build. */
const BUILD_V = WS_ZIP.version;
const TAG = `${BUILD_V ? `v${BUILD_V}` : DAY}-${SHORT}`;
const PACK = `NITDA-Folio-Handover-Pack-${TAG}`;
const KIT = `NITDA-Folio-Deployment-Kit-${TAG}-CONFIDENTIAL`;
const TOOLKIT = `NITDA-Folio-Administrator-Toolkit-${TAG}`;
const BUILD_LABEL = BUILD_V ? `v${BUILD_V} (Workspace and Portal packages)` : 'an unversioned build';
const P = path.join(PARENT, PACK);
const K = path.join(PARENT, KIT);
const TK = path.join(PARENT, TOOLKIT);
for (const d of [P, K, TK]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(P, { recursive: true });
if (WITH_KIT) fs.mkdirSync(K, { recursive: true, mode: 0o700 });
fs.mkdirSync(TK, { recursive: true });

/* ---------------- facts every document shares ---------------- */
const F = 'docs/folio-Master-Flows-and-Endpoints';
const register = readJson('docs/deployment/PRODUCTION_READINESS_REGISTER.json');
const sources = readAll(ROOT).results;
const OPEN = sources.reduce((n, s) => n + s.open.length, 0);
const CLOSED = sources.reduce((n, s) => n + s.closed.length, 0);
const release = readJson(`${F}/registers/identification-release.json`);
const ledger = readJson(`${F}/registers/identification-paste-ledger.json`).entries;
const results = readJson(`${F}/deployment/notification-instrument/tenant-execution/evidence/notification-test-results.json`);
const liveSet = readJson(`${F}/evidence/2026-10-20-final-live-set.json`);
const catalogue = readJson(`${F}/registers/flow-catalogue.json`).flows;
const evidenceText = readJson('scripts/handover/evidence-index.json').files;
const liveById = new Map(liveSet.flows.list.map((f) => [f.flowId, f]));
const mailerZip = fs.readdirSync(path.join(ROOT, 'releases')).find((f) => /^dgo-correspondence-mailer-.*\.zip$/.test(f));
const MAILER_VERSION = mailerZip.replace(/^dgo-correspondence-mailer-|\.zip$/g, '');

/* ---------------- the layout ---------------- */
const L = {
  readMe: '00 Read Me First.pdf',
  c: '01 Commissioning', report: '01 Commissioning/1.1 Folio Commissioning Report.pdf', registers: '01 Commissioning/1.2 Folio Registers.xlsx',
  evidence: '01 Commissioning/1.3 Supporting Evidence', evidenceIndex: '01 Commissioning/1.3 Supporting Evidence/00 Evidence Index.pdf',
  d: '02 Documentation', handbook: '02 Documentation/2.1 Folio Handbook.pdf', user: '02 Documentation/2.2 Folio User Guide.pdf',
  admin: '02 Documentation/2.3 Folio Administrator Guide.pdf', dev: '02 Documentation/2.4 Folio Developer Guide.pdf',
  f: '03 Power Automate Flows', catalogue: '03 Power Automate Flows/3.1 Folio Flow Catalogue.pdf',
  guide: '03 Power Automate Flows/3.2 Folio Flow Package Guide.pdf', packages: '03 Power Automate Flows/3.3 Flow Packages',
  t: '04 Applications and Tools', tools: '04 Applications and Tools/4.1 Running the Administrator Tools.pdf',
  source: `04 Applications and Tools/4.2 Folio Source Code (commit ${SHORT}).zip`,
  mailer: `04 Applications and Tools/4.3 Correspondence Mailer Package ${MAILER_VERSION}.zip`,
};
const GROUPS = [
  { name: 'Folio Workspace', folder: '1 Folio Workspace', about: 'The flows the Workspace calls: loading the registry, assigning work, the actions on a record, sign-in, administration and e-mail.' },
  { name: 'Document Portal', folder: '2 Document Portal', about: 'The flows the public Document Portal calls: submissions, uploads, status checks, verification and support.' },
  { name: 'Scheduled and event-driven', folder: '3 Scheduled and Event-Driven', about: 'The flows that start on a schedule, or when a file or message arrives, rather than on a call from an application.' },
  { name: 'Correspondence Mailer', folder: '4 Correspondence Mailer', about: 'The seven flows behind the DGO Correspondence Mailer, installed from their own import packages.' },
  { name: 'Governance flow registry', folder: null, about: 'The registry of the Agency\'s HTTP flows and the flows that maintain it. They run as built in the tenant and have no package.' },
];
const groupNamed = new Map(GROUPS.map((g) => [g.name, g]));
for (const c of catalogue) if (!groupNamed.has(c.group)) throw new Error(`flow-catalogue.json: ${c.name} is in an unknown group ${c.group}`);

/* ---------------- where each placed file goes ---------------- */
const PLACED = new Map(); /* repository path -> path inside the pack */
const place = (repoPath, packPath) => { PLACED.set(repoPath, packPath); };

/* Flow packages, grouped by the platform their flow serves. */
const packageRows = [];
for (const [rel, fp] of Object.entries(release.packages)) {
  const file = rel.split('/').pop();
  const id8 = (file.match(/__([0-9a-f]{8})\.paste\.json$/) || [])[1];
  const flow = catalogue.find((c) => c.flowId.startsWith(id8));
  if (!flow) throw new Error(`no flow in flow-catalogue.json for the package ${file}`);
  const group = groupNamed.get(flow.group);
  const at = ledger.filter((e) => e.file === file).pop();
  place(`${F}/packages/${rel}`, `${L.packages}/${group.folder}/${file}`);
  packageRows.push({ group, file, flow: flow.name, kind: 'Paste into the flow', fingerprint: fp, inTenant: at && at.fingerprint === fp ? 'Yes, at this version' : 'No' });
}
for (const f of fs.readdirSync(path.join(ROOT, 'mailer/flows/packages')).filter((x) => x.endsWith('.zip')).sort(byteCompare)) {
  const group = groupNamed.get('Correspondence Mailer');
  place(`mailer/flows/packages/${f}`, `${L.packages}/${group.folder}/${f}`);
  const fp = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'mailer/flows/packages', f))).digest('hex').slice(0, 16);
  packageRows.push({ group, file: f, flow: f.replace(/\.zip$/, ''), kind: 'Import into the tenant', fingerprint: fp, inTenant: `Yes (Mailer ${MAILER_VERSION})` });
}
packageRows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || byteCompare(a.file, b.file));
place(`releases/${mailerZip}`, L.mailer);
const packageOf = new Map(packageRows.map((r) => [r.flow, r.file]));

/* ---------------- documents ---------------- */
const handbook = (n) => `docs/handbook/${fs.readdirSync(path.join(ROOT, 'docs/handbook')).find((f) => f.startsWith(String(n).padStart(2, '0') + '-'))}`;
const GENERATED_NOTE = /^\*\*Generated by .*Do not edit by hand\.\*\*\n+/m;
const DOCS = [
  { out: L.readMe, title: 'Read Me First', subtitle: 'What this pack holds, the position at handover, and where to start', ref: 'NITDA-FOLIO-HO-00', cls: 'Internal',
    parts: [{ src: 'scripts/handover/read-me-first.md', templated: true }], toc: false },
  { out: L.report, title: 'Folio Commissioning Report', subtitle: 'Declaration, scope, verification, defects corrected and the position at handover', ref: 'NITDA-FOLIO-HO-1.1', cls: 'Internal',
    parts: [{ src: handbook(11) }], signoff: true },
  { out: L.evidenceIndex, title: 'Evidence Index', subtitle: 'The records the Commissioning Report cites', ref: 'NITDA-FOLIO-HO-1.3', cls: 'Internal', toc: false,
    parts: [{ src: `${F}/evidence/`, html: () => evidenceIndexHtml() }] },
  { out: L.handbook, title: 'Folio Handbook', subtitle: 'The complete documentation: architecture, processes, operation and use', ref: 'NITDA-FOLIO-HO-2.1', cls: 'Internal',
    parts: [{ src: 'docs/handbook/README.md', label: 'About this handbook' }, ...Array.from({ length: 11 }, (_, i) => ({ src: handbook(i + 1) })),
      { src: 'docs/deployment/RUNBOOK.md', label: 'Appendix A · Commissioning runbook' }, { src: 'docs/PLATFORM.md', label: 'Appendix B · The platform at a glance' }] },
  { out: L.user, title: 'Folio User Guide', subtitle: 'For staff: signing in, finding your way, your tasks and getting help', ref: 'NITDA-FOLIO-HO-2.2', cls: 'Internal', parts: [{ src: handbook(9) }] },
  { out: L.admin, title: 'Folio Administrator Guide', subtitle: 'People and roles, settings, monitoring, deployment and troubleshooting', ref: 'NITDA-FOLIO-HO-2.3', cls: 'Internal',
    parts: [{ src: handbook(8) }, { src: handbook(10) }] },
  { out: L.dev, title: 'Folio Developer Guide', subtitle: 'Architecture, components, data model, service contracts and development', ref: 'NITDA-FOLIO-HO-2.4', cls: 'Internal',
    parts: [2, 3, 4, 6, 7].map((n) => ({ src: handbook(n) })) },
  { out: L.catalogue, title: 'Folio Flow Catalogue', subtitle: 'Every Folio flow in the tenant: what it does, how it starts, its state and its package', ref: 'NITDA-FOLIO-HO-3.1', cls: 'Internal', toc: false,
    parts: [{ src: `${F}/registers/flow-catalogue.json`, html: () => catalogueHtml() }] },
  { out: L.guide, title: 'Folio Flow Package Guide', subtitle: 'What a flow package is, how one is applied, the release history, and each package\'s changes', ref: 'NITDA-FOLIO-HO-3.2', cls: 'Internal',
    parts: [{ src: `${F}/registers/identification-release.json`, md: packageGuideMd(), label: 'Flow packages' },
      { src: `${F}/packages/identification-phase3/README.md`, label: 'Annex A · Document Portal and scan intake packages', strip: [GENERATED_NOTE] },
      { src: `${F}/packages/identification-phase4/README.md`, label: 'Annex B · Workspace and scheduled packages', strip: [GENERATED_NOTE] }] },
  { out: L.tools, title: 'Running the Administrator Tools', subtitle: 'Starting, using and checking the platform team\'s tools', ref: 'NITDA-FOLIO-HO-4.1', cls: 'Internal',
    parts: [{ src: 'scripts/handover/running-the-tools.md', templated: true }], toc: false },
];
const KIT_DOCS = [
  { out: '00 Deployment Instructions.pdf', title: 'Deployment Instructions', subtitle: 'Uploading the commissioned Workspace, Mailer and Portal', ref: 'NITDA-FOLIO-DK-00', cls: 'Confidential',
    parts: [{ src: 'scripts/handover/deployment-instructions.md', templated: true }], toc: false },
];
const TOOLKIT_DOCS = [
  { out: '00 Read Me First.pdf', title: 'Folio Administrator Toolkit', subtitle: 'The platform team\'s suite: the Central Administration Centre and the Folio Vault, and how to run them', ref: 'NITDA-FOLIO-TK-00', cls: 'Internal',
    parts: [{ src: 'scripts/handover/running-the-tools.md', templated: true }], toc: false },
];

/* The pack's contents, in order, as Read Me First lists them. */
const evidenceCount = () => [...PLACED.values()].filter((v) => v.startsWith(L.evidence + '/')).length;
function contentsMd() {
  const n = (g) => packageRows.filter((r) => r.group === g).length;
  const rows = [
    ['00', 'Read Me First', 'This document: the position at handover, the contents and where to start'],
    ['**01**', '**Commissioning**', '**Folder: the commissioning record**'],
    ['1.1', 'Folio Commissioning Report', 'The declaration, the scope, how each part was verified, the defects found and corrected, and the position at handover, with an acceptance page'],
    ['1.2', 'Folio Registers (workbook)', 'Every readiness item, governance and flow truth finding, notification, flow, package, application and tool, with its status and evidence'],
    ['1.3', 'Supporting Evidence', `The ${evidenceCount()} records the Commissioning Report cites, with their index (00 Evidence Index)`],
    ['**02**', '**Documentation**', '**Folder: how Folio is built, run and used**'],
    ['2.1', 'Folio Handbook', 'The complete documentation in one volume'],
    ['2.2', 'Folio User Guide', 'For staff: signing in, finding your way, tasks by role, getting help'],
    ['2.3', 'Folio Administrator Guide', 'People and roles, server-side settings, monitoring, deployment, troubleshooting'],
    ['2.4', 'Folio Developer Guide', 'Architecture, components, data model, service contracts, development'],
    ['**03**', '**Power Automate Flows**', '**Folder: the flows Folio runs**'],
    ['3.1', 'Folio Flow Catalogue', `Every Folio flow in the tenant (${catalogue.length}): what it does, how it starts, its state and its package`],
    ['3.2', 'Folio Flow Package Guide', 'What a package is, how one is applied, the release history, and what each package changes'],
    ['3.3', 'Flow Packages', `The ${packageRows.length} released packages, in four folders: ${GROUPS.filter((g) => g.folder).map((g) => `${g.folder} (${n(g)})`).join(', ')}`],
    ['**04**', '**Applications and Tools**', '**Folder: the software**'],
    ['4.1', 'Running the Administrator Tools', 'The platform team\'s suite, the Central Administration Centre with the Folio Vault: what each part is for, and how to run it from the Administrator Toolkit or the source'],
    ['4.2', `Folio Source Code (commit ${SHORT})`, 'The complete source of every application and tool at the commissioned commit'],
    ['4.3', `Correspondence Mailer Package ${MAILER_VERSION}`, 'The Mailer\'s release package: the application, its flows and its setup guide'],
    ['', 'Checksums.txt', 'The SHA-256 checksum of every file in the pack'],
  ];
  return ['| Ref | Item | What it holds |', '| --- | --- | --- |', ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
const FACTS = {
  OPEN, CLOSED, COMMIT: SHORT, BRANCH, DATE, RELEASE: release.release,
  PACKAGES: Object.keys(release.packages).length, NOTICES: results.results.length,
  FLOWS: liveSet.flows.count, RUNNING: liveSet.flows.started, CONTENTS: () => contentsMd(),
};
const fill = (text) => text.replace(/\{\{([A-Z]+)\}\}/g, (m, k) => (k in FACTS ? String(typeof FACTS[k] === 'function' ? FACTS[k]() : FACTS[k]) : m));

function catalogueHtml() {
  const state = (c) => (liveById.get(c.flowId)?.state === 'Started' ? 'Running' : 'Off by design');
  let h = `<p>Every flow Folio runs in the Power Automate tenant, read from the tenant on ${esc(when(liveSet.flows.readUtc))}: ${liveSet.flows.count} flows,
    ${liveSet.flows.started} running. A package is the definition a flow runs, released and recorded by its fingerprint; each is in
    <em>3.3 Flow Packages</em>, in the folder of its group, and described in <em>3.2 Folio Flow Package Guide</em>. The last run of each flow,
    as read, is in <em>1.2 Folio Registers</em>, sheet Flows.</p>
    <table class="fixed"><colgroup><col style="width:40%"><col style="width:12%"><col style="width:12%"><col style="width:36%"></colgroup>
    <thead><tr><th>Group</th><th>Flows</th><th>Running</th><th>Packages in</th></tr></thead><tbody>`;
  for (const g of GROUPS) {
    const fl = catalogue.filter((c) => c.group === g.name);
    h += `<tr><td>${esc(g.name)}</td><td>${fl.length}</td><td>${fl.filter((c) => state(c) === 'Running').length}</td><td>${g.folder ? `3.3 Flow Packages / ${esc(g.folder)}` : 'None: run as built'}</td></tr>`;
  }
  h += `<tr><td><strong>Total</strong></td><td><strong>${catalogue.length}</strong></td><td><strong>${catalogue.filter((c) => state(c) === 'Running').length}</strong></td><td></td></tr></tbody></table>`;
  for (const g of GROUPS) {
    h += `<h2 id="cat--${g.folder ? g.folder.slice(0, 1) : 5}">${esc(g.name)}</h2><p>${esc(g.about)}</p>
      <table class="fixed"><colgroup><col style="width:33%"><col style="width:41%"><col style="width:15%"><col style="width:11%"></colgroup>
      <thead><tr><th>Flow</th><th>What it does</th><th>Starts on</th><th>State</th></tr></thead><tbody>`;
    for (const c of catalogue.filter((x) => x.group === g.name)) {
      const pkg = packageOf.get(c.name);
      h += `<tr><td><strong>${wbr(c.name.trim())}</strong>${pkg ? `<div class="pkg">Package: ${wbr(pkg)}</div>` : ''}</td><td>${esc(c.purpose)}${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</td><td>${esc(c.trigger)}</td><td>${state(c)}</td></tr>`;
    }
    h += '</tbody></table>';
  }
  return h;
}

/* Raw HTML tables inside Markdown: one line each, so marked passes them through whole. */
function htmlTable(widths, head, rows) {
  return `<table class="fixed"><colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>`
    + `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function packageGuideMd() {
  const lines = ['# Flow packages', '', '## What a flow package is', '',
    'A flow package is the definition a Folio flow runs, kept in the repository, tested offline, and released as a set. Folio has two kinds.', '',
    htmlTable([20, 22, 22, 36], ['Kind', 'Flows', 'File', 'How it is applied'], [
      ['Identification package', `${Object.keys(release.packages).length} Workspace, Portal and scheduled flows`, '<code>.paste.json</code>: the flow\'s root scope',
        'Pasted into the existing flow in the designer, or written by <code>npm run flows:update -- apply</code> (Annexes A and B)'],
      ['Import package', 'The Mailer\'s 7 flows', '<code>.zip</code>: a Power Automate export', 'Imported into the tenant, as the Mailer\'s setup guide in 4.3 describes']]), '',
    `A release freezes every identification package by its fingerprint. Release ${release.release}, of ${when(release.date)}, is the commissioned release. `
    + 'The paste ledger records, by fingerprint, what each flow in the tenant runs; at handover every package runs at its released version. '
    + 'A new release is cut only for a defect found in the tenant or an owner decision that Flow Configuration cannot meet, and its changes are released together.', '',
    '## Applying a package', '',
    '1. Back the flow up: export it, or let `npm run flows:update -- apply` back it up for you.',
    '2. Apply the package, as its annex describes for that flow: paste the root scope in place of the old one, keeping the flow\'s **Initialize variable** steps above it. If a step shows *Invalid connection*, choose the existing connection once.',
    '3. Save, and run the flow\'s test.',
    '4. Record what the flow now runs: `npm run flows:update -- check` reads every flow back and saves a report, and `npm run flows:update -- record <report>` files that report as evidence and updates the paste ledger.', '',
    `## The packages at release ${release.release}`, '',
    `Each package is in <em>3.3 Flow Packages</em>, in the folder named below. The fingerprint identifies the package's content; "In the tenant" compares it with what the paste ledger records the flow runs.`, ''];
  for (const g of GROUPS.filter((x) => x.folder)) {
    lines.push(`### ${g.folder}`, '', htmlTable([43, 27, 17, 13], ['Package file', 'Flow', 'Fingerprint', 'In the tenant'],
      packageRows.filter((r) => r.group === g).map((r) => [wbr(r.file), wbr(r.flow), `<code>${r.fingerprint}</code>`, esc(r.inTenant)])), '');
  }
  lines.push('## Release history', '', 'Every release of the identification packages, newest first.', '',
    htmlTable([9, 14, 11, 66], ['Release', 'Date', 'Packages changed', 'Reason'],
      [...release.history].sort((a, b) => b.release - a.release).map((h) => [String(h.release), when(h.date), String(h.changed ?? ''), esc(h.reason || '')])));
  return lines.join('\n');
}

/* Supporting evidence: every evidence file a rendered document cites. */
const resolveTarget = (href, src) => path.posix.normalize(path.posix.join(path.posix.dirname(src), decodeURIComponent(href.split('#')[0])));
for (const d of [...DOCS, ...KIT_DOCS, ...TOOLKIT_DOCS]) for (const part of d.parts) {
  if (part.html) continue;
  const md = part.md ?? read(part.src);
  for (const m of md.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(m[1])) continue;
    const t = resolveTarget(m[1], part.src);
    if (t.startsWith(`${F}/evidence/`) && fs.existsSync(path.join(ROOT, t)) && fs.statSync(path.join(ROOT, t)).isFile()) {
      if (!evidenceText[path.posix.basename(t)]) throw new Error(`${part.src} cites ${t}; describe it in scripts/handover/evidence-index.json`);
      place(t, `${L.evidence}/${path.posix.basename(t)}`);
    }
  }
}
const evidenceRows = [...PLACED.entries()].filter(([, v]) => v.startsWith(L.evidence + '/')).map(([k]) => {
  const j = JSON.parse(read(k));
  const file = path.posix.basename(k);
  const at = String(j.recordedUtc || j.readUtc || j.finishedUtc || j.generatedAtUtc || j.dateUtc || '');
  return { file, at, recorded: when(at), ...evidenceText[file] };
}).sort((a, b) => byteCompare(a.at, b.at) || byteCompare(a.file, b.file));
function evidenceIndexHtml() {
  return `<p>Each file in this folder is a record the Commissioning Report cites, copied from the repository at commit
    <code>${SHORT}</code>, and listed here in the order it was recorded. Each is a JSON document written when the check
    it records was made. No record holds a signed flow address, a sign-in code or a session proof. Officers' e-mail
    addresses are masked; only the registry and Director-General's office mailboxes appear in full.</p>
    <table class="fixed"><colgroup><col style="width:34%"><col style="width:16%"><col style="width:50%"></colgroup>
    <thead><tr><th>File</th><th>Recorded</th><th>What it records</th></tr></thead><tbody>${evidenceRows.map((r) =>
    `<tr><td>${wbr(r.file)}</td><td>${esc(r.recorded)}</td><td><strong>${esc(r.title)}</strong><br>${esc(r.records)}</td></tr>`).join('')}</tbody></table>`;
}

/* ---------------- rendering ---------------- */
const isRegister = (t) => t === 'docs/deployment/PRODUCTION_READINESS_REGISTER.json' || t.startsWith(`${F}/registers/`) || t.endsWith('notification-test-results.json');
const docFor = (t) => DOCS.find((d) => d.parts.some((p) => p.src === t));
const relFrom = (outFile, target) => encodeURI(path.posix.relative(path.posix.dirname(outFile), target) || path.posix.basename(target));

function hrefFor(href, part, doc, partIds) {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith('#')) return `#${partIds.get(part.src)}--${href.slice(1)}`;
  const frag = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
  const t = resolveTarget(href, part.src);
  if (partIds.has(t)) return `#${partIds.get(t)}${frag ? '--' + frag : ''}`;
  if (PLACED.has(t)) return relFrom(doc.out, PLACED.get(t));
  if (isRegister(t)) return relFrom(doc.out, L.registers);
  const other = docFor(t);
  if (other && other !== doc) return relFrom(doc.out, other.out);
  return GH + encodeURI(t) + (frag ? '#' + frag : '');
}

const slug = (text) => text.toLowerCase().trim().replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const clean = (s) => String(s).replace(/`([^`]*)`/g, '$1').replace(/\*\*|__/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'styles/dgo-design-system/brand/nitda/nitda-lockup-digital-colour.png')).toString('base64');

const CSS = `
@page{size:A4;margin:22mm 18mm 20mm 18mm}
:root{--green:#05583B;--green-10:#E6EEEB;--green-20:#CDDDD7;--ink:#1B1A1A;--muted:#5F5C5D}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#fff;color:var(--ink);font:10.5pt/1.55 Inter,"Liberation Sans",Arial,sans-serif}
.cover{height:250mm;display:flex;flex-direction:column;page-break-after:always}
.cover img{width:62mm}
.cover .band{margin-top:48mm;border-left:3mm solid var(--green);padding-left:8mm}
.cover h1{font-size:28pt;line-height:1.15;margin:0 0 4mm;color:var(--green);font-weight:700}
.cover .sub{font-size:13pt;color:var(--muted);margin:0}
.cover .org{margin-top:10mm;font-size:10.5pt;color:var(--ink);font-weight:600}
.cover table.control{margin-top:auto;border-collapse:collapse;width:100%;font-size:9pt}
.cover table.control td{border:0;border-top:1px solid var(--green-20);padding:2.2mm 0;vertical-align:top;background:none}
.cover table.control td:first-child{width:40mm;color:var(--muted)}
.cls{display:inline-block;padding:0.6mm 2.5mm;border-radius:1mm;font-weight:600;font-size:8.5pt}
.cls.Internal{background:var(--green-10);color:var(--green)}.cls.Confidential{background:#FBE7EA;color:#C8102E}
nav.toc{page-break-after:always}nav.toc h2{margin-top:0}
nav.toc ol{list-style:none;margin:0;padding:0}nav.toc li{padding:1.1mm 0;border-bottom:1px dotted var(--green-20)}
nav.toc li.t1{font-weight:600;margin-top:2mm}nav.toc li.t2{padding-left:7mm;font-size:9.5pt}
nav.toc a{color:var(--ink);text-decoration:none;display:flex;gap:4mm}nav.toc .tt{flex:1}nav.toc .pg{width:12mm;text-align:right;color:var(--muted);font-weight:400}
.mk{position:absolute;font-size:2px;line-height:1;color:#fff;white-space:nowrap}
section.part{page-break-before:always}section.part:first-of-type{page-break-before:auto}
h1.part{font-size:19pt;color:var(--green);margin:0 0 6mm;padding-bottom:3mm;border-bottom:0.6mm solid var(--green)}
h2{font-size:13.5pt;color:var(--green);margin:8mm 0 3mm;page-break-after:avoid}
h3{font-size:11.5pt;margin:6mm 0 2mm;page-break-after:avoid}h4,h5,h6{font-size:10.5pt;margin:5mm 0 2mm}
p{margin:0 0 3mm}ul,ol{margin:0 0 3mm;padding-left:6mm}li{margin:0.8mm 0}
a{color:var(--green)}
code{font:8.8pt/1.4 "DejaVu Sans Mono",monospace;background:#F2F5F3;padding:0.3mm 1mm;border-radius:0.8mm;word-break:break-word}
pre{background:#F2F5F3;padding:3mm;border-radius:1mm;white-space:pre-wrap;page-break-inside:avoid}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:2mm 0 5mm;font-size:8.8pt;page-break-inside:auto}
table.fixed{table-layout:fixed}td{overflow-wrap:break-word}table.fixed td{overflow-wrap:anywhere}
table.kv td:first-child{width:24%;color:var(--muted);font-weight:600}table.kv tbody tr:nth-child(even) td{background:none}
thead{display:table-header-group}tr{page-break-inside:avoid}
th{background:var(--green);color:#fff;text-align:left;font-weight:600;padding:1.8mm 2mm;vertical-align:top}
td{border-bottom:1px solid var(--green-20);padding:1.6mm 2mm;vertical-align:top}
tbody tr:nth-child(even) td{background:#F7FAF8}
td .pkg{margin-top:1mm;font-size:7.6pt;color:var(--muted)}td .note{margin-top:1mm;font-size:8pt;color:var(--muted);font-style:italic}
blockquote{margin:3mm 0;padding:2.5mm 4mm;border-left:1mm solid var(--green);background:var(--green-10)}
.signoff td{height:14mm}
`;

/* pages: null on the first pass, which marks each contents entry where it lands; then each entry's page number. */
function renderHtml(doc, pages) {
  const partIds = new Map(doc.parts.map((p, i) => [p.src, `p${i}`]));
  const multi = doc.parts.length > 1;
  const toc = [];
  const entry = (level, id, text) => { const n = toc.length; toc.push({ level: multi ? level : 1, id, text }); return pages ? '' : `<span class="mk">ZZ${n}ZZ</span>`; };
  let body = '';
  for (const part of doc.parts) {
    const id = partIds.get(part.src);
    if (part.html) { body += `<section class="part"><a id="${id}"></a>${part.html()}</section>\n`; continue; }
    let md = part.md ?? read(part.src);
    for (const re of part.strip || []) md = md.replace(re, '');
    if (part.templated) md = fill(md);
    const seen = new Map();
    let first = true;
    const marked = new Marked({ gfm: true });
    marked.use({ renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let s = slug(text); const n = seen.get(s) || 0; seen.set(s, n + 1); if (n) s = `${s}-${n}`;
        const hid = `${id}--${s}`;
        if (first && depth === 1) {
          first = false;
          if (!multi) return `<a id="${id}"></a><a id="${hid}"></a>`; /* the cover carries the title */
          return `<h1 class="part" id="${id}">${entry(1, id, part.label || clean(text))}${part.label ? esc(part.label) : inner}</h1><a id="${hid}"></a>`;
        }
        first = false;
        const mark = depth === 2 ? entry(2, hid, clean(text)) : '';
        const d = Math.min(Math.max(depth, 2), 6);
        return `<h${d} id="${hid}">${mark}${inner}</h${d}>`;
      },
      link({ href, title, tokens }) {
        return `<a href="${esc(hrefFor(href, part, doc, partIds))}"${title ? ` title="${esc(title)}"` : ''}>${this.parser.parseInline(tokens)}</a>`;
      },
    } });
    /* A table whose header row is empty is a list of labels and values: print it without the header bar. */
    const html = marked.parse(md).replace(/<table>\s*<thead>\s*<tr>\s*(?:<th[^>]*>\s*<\/th>\s*)+<\/tr>\s*<\/thead>/g, '<table class="kv">');
    body += `<section class="part">${html}</section>\n`;
  }
  if (doc.signoff) {
    body += `<section class="part"><h1 class="part" id="acceptance">${entry(1, 'acceptance', 'Acceptance')}Acceptance</h1><p>This report records the commissioning
      of NITDA Folio within the scope in section 3. Acceptance below records that the Agency has received it and accepts Folio for live operation.</p>
      <table class="signoff fixed"><colgroup><col style="width:15%"><col style="width:23%"><col style="width:28%"><col style="width:20%"><col style="width:14%"></colgroup><thead><tr><th></th><th>Name</th><th>Title</th><th>Signature</th><th>Date</th></tr></thead><tbody>
      <tr><td>Prepared by</td><td>Folio commissioning</td><td>For DGO Platform Engineering</td><td></td><td>${esc(DATE)}</td></tr>
      <tr><td>Reviewed by</td><td></td><td></td><td></td><td></td></tr>
      <tr><td>Accepted by</td><td></td><td>For the Office of the Director-General/CEO, NITDA</td><td></td><td></td></tr></tbody></table></section>`;
  }
  const showToc = doc.toc !== false && toc.length > 3;
  const control = [['Document', doc.title], ['Reference', doc.ref], ['Version', '1.0'], ['Date', DATE], ['Classification', `<span class="cls ${doc.cls}">${doc.cls}</span>`],
    ['Built from', `Repository dgoeaa/ECM_DOCS_DEV, commit ${SHORT}`], ['Build', BUILD_LABEL], ['Register of record', `Version ${register.registerVersion}: ${OPEN} open, ${CLOSED} closed`]];
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${CSS}</style></head><body>
<div class="cover"><img src="${LOGO}" alt="NITDA"><div class="band"><h1>${esc(doc.title)}</h1><p class="sub">${esc(doc.subtitle)}</p>
<p class="org">National Information Technology Development Agency · Office of the Director-General/CEO · DGO Digital Operations</p></div>
<table class="control">${control.map(([k, v]) => `<tr><td>${k}</td><td>${k === 'Classification' ? v : esc(v)}</td></tr>`).join('')}</table></div>
${showToc ? `<nav class="toc"><h2>Contents</h2><ol>${toc.map((t, i) => `<li class="t${t.level}"><a href="#${t.id}"><span class="tt">${esc(t.text)}</span><span class="pg">${pages?.[i] ?? ''}</span></a></li>`).join('')}</ol></nav>` : ''}
${body}</body></html>`;
}

const { chromium } = require('playwright');
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
async function toPdf(html, out, doc) {
  const tmp = path.join(os.tmpdir(), `folio-handover-${crypto.randomUUID()}.html`);
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.route(/^https?:/, (r) => r.abort());
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, outline: true, tagged: true,
    margin: { top: '22mm', bottom: '20mm', left: '18mm', right: '18mm' },
    headerTemplate: `<div style="font:7.5pt Inter,Arial,sans-serif;width:100%;padding:0 18mm;color:#5F5C5D;display:flex;justify-content:space-between"><span>NITDA Folio · ${esc(doc.title)}</span><span>${esc(doc.cls)}</span></div>`,
    footerTemplate: `<div style="font:7.5pt Inter,Arial,sans-serif;width:100%;padding:0 18mm;color:#5F5C5D;display:flex;justify-content:space-between"><span>${esc(doc.ref)} · Version 1.0 · ${esc(DATE)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>` });
  await page.close();
  fs.rmSync(tmp);
}
async function printPdf(doc, root) {
  const out = path.join(root, doc.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let html = renderHtml(doc, null);
  const marks = (html.match(/class="mk"/g) || []).length;
  if (doc.toc !== false && marks > 3) {
    await toPdf(html, out, doc);
    const pages = [];
    execFileSync('pdftotext', ['-enc', 'UTF-8', out, '-']).toString().split('\f').forEach((text, i) => {
      for (const m of text.matchAll(/ZZ(\d+)ZZ/g)) if (pages[+m[1]] == null) pages[+m[1]] = i + 1;
    });
    const missing = Array.from({ length: marks }, (_, i) => i).filter((i) => pages[i] == null);
    if (missing.length) throw new Error(`${doc.out}: could not place contents entries ${missing.join(', ')}`);
    html = renderHtml(doc, pages);
  } else {
    html = renderHtml(doc, []);
  }
  await toPdf(html, out, doc);
}
for (const d of DOCS) await printPdf(d, P);
if (WITH_KIT) for (const d of KIT_DOCS) await printPdf(d, K);
for (const d of TOOLKIT_DOCS) await printPdf(d, TK);
await browser.close();

/* ---------------- placed files ---------------- */
for (const [from, to] of PLACED) { const d = path.join(P, to); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(ROOT, from), d); }

/* ---------------- the registers workbook ---------------- */
const matrixById = new Map(RequiredNotifications.map((r) => [r.id, r]));
const bySource = Object.fromEntries(sources.map((s) => [s.src.id, s.entries]));
const workbook = {
  title: 'NITDA Folio · Registers at commissioning',
  control: [['Reference', 'NITDA-FOLIO-HO-1.2'], ['Version', '1.0'], ['Date', DATE], ['Classification', 'Internal'],
    ['Built from', `Repository dgoeaa/ECM_DOCS_DEV, commit ${SHORT}`], ['Build', BUILD_LABEL], ['Register of record', `Version ${register.registerVersion}`],
    ['Position', `${OPEN} open, ${CLOSED} closed across the three registers`]],
  sheets: [
    { name: 'Readiness Register', about: `Every readiness item (${register.items.length}): its status, the criterion it had to meet, its resolution record and the evidence it cites.`,
      columns: [['ID', 11], ['Item', 46], ['Category', 15], ['Status', 14], ['Resolution criterion', 50], ['Resolution record', 90], ['Evidence', 70]],
      rows: register.items.map((i) => [i.id, i.title, i.category, i.status, i.resolutionCriteria || '', String(i.whyOpen || '').slice(0, 32000),
        (i.evidence || []).map((e) => `${e.ref}${e.states ? ': ' + e.states : ''}`).join('\n').slice(0, 32000)]) },
    { name: 'Governance Register', about: `The governance findings (${(bySource.governance || []).length}) and their disposition.`,
      columns: [['ID', 11], ['Finding', 60], ['Status', 14], ['Detail', 100]], rows: (bySource.governance || []).map((e) => [e.id, e.title, e.status, e.what || '']) },
    { name: 'Flow Truth Review', about: `The flow truth persistence review (${(bySource['flow-truth-review'] || []).length} findings) and their disposition.`,
      columns: [['ID', 11], ['Finding', 60], ['Severity', 12], ['Status', 14], ['Detail', 90]], rows: (bySource['flow-truth-review'] || []).map((e) => [e.id, e.title, e.severity || '', e.status, e.what || '']) },
    { name: 'Notifications', about: `Every notification Folio sends (${results.results.length}): the run that proved it and its record.`,
      columns: [['ID', 9], ['Event', 46], ['Channel', 10], ['Result', 10], ['Flow', 40], ['Run', 34], ['Tested (UTC)', 18], ['Record', 60]],
      rows: results.results.map((r) => [r.requirementId, matrixById.get(r.requirementId)?.event || '', matrixById.get(r.requirementId)?.channel || '', r.status, r.flowId, r.runId, String(r.testedAtUtc || '').replace('T', ' ').slice(0, 16), r.receiptOrAuditReference || r.sendResult || '']) },
    { name: 'Flows', about: `Every Folio flow in the tenant (${catalogue.length}), with its state and last run as read on ${when(liveSet.flows.readUtc)}.`,
      columns: [['Group', 24], ['Flow', 44], ['What it does', 70], ['Starts on', 34], ['State', 14], ['Last run, as read (UTC)', 26], ['Note', 70], ['Flow ID', 38]],
      rows: catalogue.map((c) => { const l = liveById.get(c.flowId) || {}; return [c.group, c.name.trim(), c.purpose, c.trigger, l.state === 'Started' ? 'Running' : 'Off by design', String(l.lastRun || '').replace('T', ' '), c.note || '', c.flowId]; }) },
    { name: 'Flow Packages', about: `Every released flow package (${packageRows.length}), the folder it is in under 3.3 Flow Packages, and whether the tenant runs it.`,
      columns: [['Folder', 26], ['Package file', 70], ['Flow', 44], ['Applied by', 22], ['Fingerprint', 20], ['In the tenant', 26]],
      rows: packageRows.map((r) => [r.group.folder, r.file, r.flow, r.kind, r.fingerprint, r.inTenant]) },
    { name: 'Platforms and Tools', about: 'The applications people use and the platform team\'s tools: where each runs and how it was verified.',
      columns: [['Name', 34], ['For', 20], ['Runs at', 44], ['Verified by', 90], ['Status at handover', 60]],
      rows: [
        ['Folio Workspace', 'Staff', 'https://folio-platform.page.gd/', 'Browser suite against the deployed build, signed in; every governed flow live', 'In service'],
        ['NITDA Document Portal', 'The public', 'https://folio-portal.page.gd/', 'Browser suite against the deployed build (17 passed); its flows and notices live', 'In service'],
        [`DGO Correspondence Mailer ${MAILER_VERSION}`, 'DGO staff', 'https://folio-platform.page.gd/mailer.html', 'npm run test:mailer (392 and 78 passed); its seven flows healthy from the published address', 'In service once the Workspace build is uploaded'],
        ['Folio Central Administration Centre', 'Platform team', 'A platform-team computer (Administrator Toolkit)', 'Signed in, all 14 screens without error; installation check passed all 24 checks', `The suite: watches all ${catalogue.length} Folio flows; incidents, changes, audit; hosts the Estate Console and the flow packages; Test a flow; configuration check`],
        ['Folio Estate Console', 'Platform team', 'A platform-team computer (Administrator Toolkit)', 'Browser specification (7 passed); started and opened with no error', 'Hosted in the Administration Centre (Reference)'],
        ['Provisioning console', 'Platform team', 'Opened from a file (Administrator Toolkit)', 'Opened: 102 packages, search works, no error', 'Hosted in the Administration Centre (Reference › Flow packages)'],
        ['Folio Vault', 'Platform team', 'A platform-team computer (Administrator Toolkit)', 'End to end against the tenant (defect corrected: it refused the Mailer flows\' contract version)', 'Part of the suite: holds the signed addresses; Test a flow calls through it'],
        ['Platform Hub', 'Platform team', 'A platform-team computer (Administrator Toolkit)', 'Started; lists all eight platforms and reports which are running', 'Replaced by the Administration Centre\'s Portfolio'],
        ['Folio Flow Workbench', 'Platform team', 'A platform-team computer (Administrator Toolkit)', 'Started and driven; its relay forwarded a request (defect corrected: it opened at an address its relay refuses)', 'Replaced by the Administration Centre\'s Test a flow'],
      ] },
    { name: 'Evidence Index', about: `The records the Commissioning Report cites (${evidenceRows.length}), in 1.3 Supporting Evidence.`,
      columns: [['File', 46], ['Recorded', 22], ['Record', 46], ['What it records', 100]], rows: evidenceRows.map((r) => [r.file, r.recorded, r.title, r.records]) },
  ],
};
const wbJson = path.join(os.tmpdir(), `folio-registers-${crypto.randomUUID()}.json`);
fs.writeFileSync(wbJson, JSON.stringify(workbook));
execFileSync('python3', [path.join(ROOT, 'scripts/handover/registers.py'), wbJson, path.join(P, L.registers)], { stdio: ['ignore', 'ignore', 'inherit'] });
fs.rmSync(wbJson);

/* ---------------- the source at this commit ---------------- */
const tmpSrc = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-src-'));
const srcDir = path.join(tmpSrc, `NITDA-Folio-Source-${SHORT}`);
fs.mkdirSync(srcDir);
execSync(`git -C "${ROOT}" archive --format=tar HEAD | tar -x -C "${srcDir}"`);
const withheld = [];
const walkFiles = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walkFiles(p, out) : out.push(p); } return out; };
for (const f of walkFiles(path.join(srcDir, 'docs'))) if (SIG.test(fs.readFileSync(f).toString('latin1'))) { withheld.push(path.relative(srcDir, f)); fs.rmSync(f); }
fs.writeFileSync(path.join(srcDir, 'WITHHELD.txt'), ['Files in the repository that are not in this copy. Each is a record of the flow estate before its addresses were rotated (ITEM-22)',
  'and holds signed addresses of that estate. None is a live address. They remain in the repository.', '', ...withheld.sort(byteCompare).map((f) => '  ' + f), ''].join('\n'));
execFileSync('zip', ['-qrX', path.join(P, L.source), path.basename(srcDir)], { cwd: tmpSrc });
fs.rmSync(tmpSrc, { recursive: true, force: true });

/* ---------------- the deployment kit's uploads ---------------- */
if (WITH_KIT) {
  fs.copyFileSync(path.join(BUILDS, WS_ZIP.file), path.join(K, `01 Workspace and Mailer${vtag(WS_ZIP)} - upload to folio-platform.page.gd.zip`));
  fs.copyFileSync(path.join(BUILDS, PORTAL_ZIP.file), path.join(K, `02 Document Portal${vtag(PORTAL_ZIP)} - upload to folio-portal.page.gd.zip`));
}

/* ---------------- the administrator toolkit ----------------
 * The six tools with what they read at run time, in the repository's own layout under Programs/, so each starts with
 * its launcher unchanged. The Centre reads the estate registers (tools/admin-centre/server.py ESTATE_SOURCES,
 * flow-adoption.json, the flow catalogue and the newest tenant export); the provisioning console is a page opened as a file.
 * scripts/folio-admin.mjs, which the two start files run, starts, configures and fills them in one step; it reads the
 * tenant's addresses with scripts/lib/config-drift.mjs. */
const tenantExport = fs.readdirSync(path.join(ROOT, F, 'audits')).filter((f) => /^flow-usage-analysis-.*\.json$/.test(f)).sort(byteCompare).pop();
const TOOLKIT_FILES = ['scripts/folio-admin.mjs', 'scripts/lib/config-drift.mjs', 'scripts/lib/endpoint-surface.mjs',
  'scripts/run-platform.mjs', 'scripts/platforms.config.mjs', 'scripts/dev/mime.mjs',
  'tools/admin-console.html', 'tools/admin-centre', 'tools/flow-capsule', `${F}/provisioning`,
  `${F}/registers/endpoint-workflow-ids.json`, `${F}/registers/flow-identity-crosswalk.json`, `${F}/registers/flow-adoption.json`,
  `${F}/registers/flow-catalogue.json`,
  `${F}/audits/${tenantExport}`, 'mailer/flows/flows.catalogue.json'];
/* Every repository file the Centre serves (its MODULES and SECTIONS) goes too: read from server.py, so they cannot drift. */
{
  const centre = read('tools/admin-centre/server.py');
  const served = [...(centre.match(/MODULES = \(([^)]+)\)/) || ['', ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    .concat([...centre.matchAll(/'[a-z-]+': \('([^']+)', (?:True|False), /g)].map((m) => m[1]));
  if (served.length < 6) throw new Error('toolkit: could not read the files the Centre serves from server.py');
  for (const f of served) if (!TOOLKIT_FILES.some((t) => f === t || f.startsWith(t + '/'))) TOOLKIT_FILES.push(f);
}
const PROGRAMS = path.join(TK, 'Programs');
fs.mkdirSync(PROGRAMS);
execFileSync('sh', ['-c', `git -C "${ROOT}" archive --format=tar HEAD -- "$@" | tar -x -C "${PROGRAMS}"`, 'sh', ...TOOLKIT_FILES]);
for (const dir of ['tools/admin-centre/tests', 'tools/flow-capsule/tests']) fs.rmSync(path.join(PROGRAMS, dir), { recursive: true, force: true });
/* Every module the launchers import must be in the toolkit: a new import in run-platform.mjs would otherwise break it unseen. */
for (const f of walkFiles(path.join(PROGRAMS, 'scripts')).filter((x) => x.endsWith('.mjs'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) throw new Error(`toolkit: ${path.relative(PROGRAMS, f)} imports ${m[1]}, which is not in TOOLKIT_FILES`);
  }
}
for (const name of fs.readdirSync(path.join(ROOT, 'scripts/handover/toolkit'))) {
  const text = fs.readFileSync(path.join(ROOT, 'scripts/handover/toolkit', name), 'utf8');
  fs.writeFileSync(path.join(TK, name), name.endsWith('.cmd') ? text.replace(/\r?\n/g, '\r\n') : text, { mode: name.endsWith('.sh') ? 0o755 : 0o644 });
}
/* The shortcut is written here, not kept as a file: its link resolves only in the toolkit's layout. */
const CONSOLE = `Programs/${F}/provisioning/index.html`;
if (!fs.existsSync(path.join(TK, CONSOLE))) throw new Error(`toolkit: ${CONSOLE} is missing`);
fs.writeFileSync(path.join(TK, 'Open the provisioning console.html'), `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Opening the provisioning console</title>
<meta http-equiv="refresh" content="0; url=${encodeURI(CONSOLE)}">
</head>
<body>
<p>Opening the provisioning console… <a href="${encodeURI(CONSOLE)}">Continue</a></p>
</body>
</html>
`);

/* ---------------- identity ---------------- */
function bundleId(name) {
  return { schema: 'folio-build-id/v1', package: name.replace(/-v?\d{4}[.-]\d{2}[.-]\d{2}.*$/, ''), label: name, version: BUILD_V, commit: COMMIT,
    builtUtc: NOW.toISOString(), registerVersion: register.registerVersion,
    ships: { workspace: WS_ZIP.file, portal: PORTAL_ZIP.file } };
}
/* The Centre names the toolkit it came in, in its footer (tools/admin-centre/server.py reads this file beside it). */
fs.writeFileSync(path.join(PROGRAMS, 'tools/admin-centre/BUILD-ID.json'), `${JSON.stringify(bundleId(TOOLKIT), null, 2)}\n`);

/* ---------------- checksums, the signature rule, the zips ---------------- */
function seal(dir, name, mustBeClean) {
  fs.writeFileSync(path.join(dir, 'BUILD-ID.json'), `${JSON.stringify(bundleId(name), null, 2)}\n`);
  const files = walkFiles(dir).map((p) => path.relative(dir, p).split(path.sep).join('/')).sort(byteCompare);
  if (mustBeClean) for (const rel of files) {
    if (rel.endsWith('.zip')) continue; /* the source zip was cleaned before it was written */
    if (SIG.test(fs.readFileSync(path.join(dir, rel)).toString('latin1'))) { console.error(`${name}: ${rel} holds a signed address; nothing was written`); process.exit(1); }
  }
  fs.writeFileSync(path.join(dir, 'Checksums.txt'), files.map((rel) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex')}  ${rel}`).join('\n') + '\n');
  const zip = path.join(PARENT, `${name}.zip`);
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-qrX', zip, name], { cwd: PARENT });
  fs.chmodSync(zip, 0o600);
  return { zip, files: files.length + 1, bytes: fs.statSync(zip).size };
}
const pack = seal(P, PACK, true);
const kit = WITH_KIT ? seal(K, KIT, false) : `not written (--from-ledger): the Deployment Kit for v${BUILD_V} stays current`;
const toolkit = seal(TK, TOOLKIT, true);
console.log(JSON.stringify({ commit: SHORT, build: BUILD_V, pack, kit, toolkit, documents: DOCS.length + KIT_DOCS.length + TOOLKIT_DOCS.length, evidence: evidenceRows.length, packages: packageRows.length, withheldFromSource: withheld.length }, null, 1));
