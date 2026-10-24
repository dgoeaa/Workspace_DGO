#!/usr/bin/env node
// Build the Folio platform suite release: every platform, application and tool, in one ZIP.
//
//   node scripts/package-platform-release.mjs            write releases/folio-platform-suite-<version>.zip
//   node scripts/package-platform-release.mjs --check    exit 1 if the committed zip differs from a fresh build
//   node scripts/package-platform-release.mjs --out DIR  also unpack the release into DIR
//
// WHAT IS IN IT
//
// The eight platforms scripts/platforms.config.mjs declares, each built the way its own
// delivery already builds it, so this adds no second definition of any of them:
//
//   runtime/           Folio Workspace         scripts/package.mjs, runtime surface, demo posture
//   document-portal/   NITDA Document Portal   scripts/package.mjs, portal surface, demo posture
//   mailer/            Correspondence Mailer   scripts/package-mailer.mjs, the whole release
//   tools/admin-console.html                   Folio Estate Console, as tracked
//   tools/flow-workbench/                      Folio Flow Workbench, as tracked
//   tools/flow-capsule/                        Folio Vault, as tracked
//   tools/admin-centre/                        Central Administration Centre, as tracked
//   tools/hub/                                 Platform Hub, as tracked
//
// Around them: the repository's own launcher (scripts/run-platform.mjs, platforms.config.mjs,
// hub-server.mjs, dev/mime.mjs) with the paths the package re-roots rewritten, the estate
// records the Centre reads (at the same relative paths, so it finds them unaided), start
// scripts, an integrity checker, README.md and RELEASE_MANIFEST.json.
// tests/platform-release.test.mjs unpacks the committed zip and starts all eight from it.
//
// WHAT IT NEVER CONTAINS
//
// A signed trigger URL, a config.local.js with a value in it, or any platform's state (the
// Vault's registry and tokens, the Centre's database and token). The Workspace and Portal are
// built with --demo, and the build refuses any file carrying a sig= signature.
//
// DETERMINISM
//
// --check compares bytes. SOURCE_DATE_EPOCH pins the packager's build stamp, text files are
// normalised to LF (.cmd to CRLF), members are ordered by path, and scripts/lib/zip-writer.mjs
// stamps one fixed time.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { buildZip } from './lib/zip-writer.mjs';
import { openZip } from './lib/zip-reader.mjs';
import { Platforms } from './platforms.config.mjs';
import { packageFiles as mailerFiles, VERSION as MAILER_VERSION } from './package-mailer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT = path.join(ROOT, 'scripts', 'platform-release');

export const VERSION = fs.readFileSync(path.join(KIT, 'VERSION'), 'utf8').trim();
export const NAME = 'folio-platform-suite';
export const ZIP_PATH = path.join(ROOT, 'releases', `${NAME}-${VERSION}.zip`);
const TOP = `${NAME}-${VERSION}`;

/* 2026-01-01T00:00:00Z — the same instant scripts/lib/zip-writer.mjs stamps on every member. */
const SOURCE_DATE_EPOCH = '1767225600';
const TEXT = new Set(['.js', '.mjs', '.py', '.css', '.html', '.md', '.json', '.csv', '.sh', '.cmd', '.txt', '.svg', '.webmanifest', '.service', '']);
const SIGNATURE = /sig=[A-Za-z0-9_%-]{20,}/;

/* Tracked directories copied as they are. Nothing under them is state: the Vault and the
   Centre write theirs to data directories the launcher points outside the package. */
const TOOL_DIRS = ['tools/flow-workbench', 'tools/flow-capsule', 'tools/admin-centre', 'tools/hub'];
const TOOL_FILES = ['tools/admin-console.html'];

/* What the Centre reads to seed its endpoint estate (tools/admin-centre/server.py,
   ESTATE_SOURCES and TENANT_EXPORT_GLOB). Shipped at the same paths so _find_repo() resolves
   the package root itself. mailer/flows/flows.catalogue.json comes with the Mailer release. */
const CENTRE_ESTATE = [
  'docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json',
  'docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json',
];
const TENANT_EXPORT = /^docs\/folio-Master-Flows-and-Endpoints\/audits\/flow-usage-analysis-.*\.json$/;

const EXECUTABLE = /(^|\/)([^/]+\.sh|folio)$/;

function normalise(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  if (!TEXT.has(ext)) return buf;
  let s = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (ext === '.cmd') s = s.replace(/\n/g, '\r\n');
  return Buffer.from(s, 'utf8');
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const abs = path.join(dir, d.name);
    return d.isDirectory() ? walk(abs, base) : [path.relative(base, abs).split(path.sep).join('/')];
  });
}

const tracked = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

/** Replace exactly once, or fail: a launcher edit that silently stops applying ships a broken suite. */
function rewrite(src, file, pairs) {
  for (const [from, to] of pairs) {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`${file}: expected one occurrence of ${JSON.stringify(from)}, found ${n}. Update scripts/package-platform-release.mjs.`);
    src = src.replace(from, to);
  }
  return src;
}

/** The Workspace and Portal packages, built by scripts/package.mjs in demo posture. */
function demoPackages() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-suite-'));
  try {
    const env = { ...process.env, SOURCE_DATE_EPOCH };
    for (const k of Object.keys(env)) if (/^(DGO_|PF_)/.test(k)) delete env[k]; // no endpoint or auth value leaks in from the shell
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'package.mjs'), '--demo', '--out', tmp, '--quiet'], { cwd: ROOT, env, stdio: 'pipe' });
    } catch (e) {
      throw new Error(`scripts/package.mjs refused a package:\n${e.stdout || ''}${e.stderr || ''}`);
    }
    const out = {};
    for (const [dir, prefix] of [['dgo-internal-platform', 'runtime'], ['dgo-document-portal', 'document-portal']]) {
      const abs = path.join(tmp, dir);
      const manifest = JSON.parse(fs.readFileSync(path.join(abs, 'PACKAGE_MANIFEST.json'), 'utf8'));
      if (!manifest.demo || manifest.endpoints.some((e) => e.provisioned)) throw new Error(`${dir} came back provisioned — the suite ships with every endpoint empty.`);
      for (const rel of walk(abs)) out[`${prefix}/${rel}`] = fs.readFileSync(path.join(abs, rel));
    }
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** The repository's launcher, with the three paths the package re-roots rewritten. */
function launcher() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const config = rewrite(read('scripts/platforms.config.mjs'), 'scripts/platforms.config.mjs', [
    // The Workspace ships as its own package folder, not the repository root.
    ["    serveFrom: '.',\n    entry: 'index.html',", "    serveFrom: 'runtime',\n    entry: 'runtime/index.html',"],
    // The Mailer ships as its whole release; the app is its web/ folder.
    ["    serveFrom: 'mailer',\n    entry: 'mailer/index.html',", "    serveFrom: 'mailer/web',\n    entry: 'mailer/web/index.html',"],
    // There is no npm here: the Hub tells people the command that works in this package.
    ['startCommand: `npm run ${scriptName(p.id)}`', 'startCommand: `node scripts/run-platform.mjs ${p.id}`'],
  ]);
  const run = rewrite(read('scripts/run-platform.mjs'), 'scripts/run-platform.mjs', [
    ['npm run ${scriptName(p.id)}  →  ${url(p)}', 'node scripts/run-platform.mjs ${p.id}  →  ${url(p)}'],
    ['npm run start:all   starts all ${Platforms.length} at once.', 'node scripts/run-platform.mjs --all   starts all ${Platforms.length} at once.'],
  ]);
  return {
    'scripts/platforms.config.mjs': Buffer.from(config),
    'scripts/run-platform.mjs': Buffer.from(run),
    'scripts/hub-server.mjs': Buffer.from(read('scripts/hub-server.mjs')),
    'scripts/dev/mime.mjs': Buffer.from(read('scripts/dev/mime.mjs')),
  };
}

/**
 * What `folio` (scripts/platform-release/folio.mjs) needs beside the launcher: the repository's
 * own endpoint definition, validation, config renderer, live checker and values fetcher, so the
 * suite wires and checks exactly as `npm run package` and `npm run verify:endpoints` do.
 */
function adminTool() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
  const out = {};
  for (const lib of ['endpoint-surface', 'endpoint-validation', 'endpoint-config-render', 'endpoint-probes', 'zip-writer', 'zip-reader']) {
    out[`scripts/lib/${lib}.mjs`] = read(`scripts/lib/${lib}.mjs`);
  }
  out['scripts/fetch-values-file.mjs'] = read('scripts/fetch-values-file.mjs');
  // fetch-values-file reads the harvester scope's build stamp to detect a stale paste.
  const harvester = 'docs/folio-Master-Flows-and-Endpoints/packages/harvester/Scope_Endpoint_Values_Delivery.designer-paste.json';
  out[harvester] = read(harvester);
  // The checker imports the contracts from ../config/; in the suite they are the Workspace's.
  out['scripts/verify-endpoints.mjs'] = Buffer.from(rewrite(read('scripts/verify-endpoints.mjs').toString('utf8'), 'scripts/verify-endpoints.mjs', [
    ["'../config/endpoints.config.js'", "'../runtime/config/endpoints.config.js'"],
  ]));
  // Keys the platform owner's map declares to share one flow (the same groups scripts/package.mjs allows).
  const groups = new Map();
  for (const r of JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/reference/contract-key-flow-map.json')).map) {
    if (r.mappingConfidence !== 'SHARED_CONTRACT_KEYS' || !r.flowId) continue;
    (groups.get(r.flowId) || groups.set(r.flowId, []).get(r.flowId)).push(r.contractKey);
  }
  out['scripts/lib/shared-keys.json'] = Buffer.from(`${JSON.stringify([...groups.values()].filter((g) => g.length > 1), null, 2)}\n`);
  return out;
}

/** Every file in the release, as { path inside the release: Buffer }, ordered by path. */
export function releaseFiles() {
  const files = { ...demoPackages() };

  for (const [rel, buf] of Object.entries(mailerFiles())) files[`mailer/${rel}`] = buf;

  const all = tracked();
  for (const rel of all) {
    if (TOOL_FILES.includes(rel) || TOOL_DIRS.some((d) => rel.startsWith(`${d}/`)) || CENTRE_ESTATE.includes(rel)) {
      files[rel] = fs.readFileSync(path.join(ROOT, rel));
    }
  }
  const exports = all.filter((rel) => TENANT_EXPORT.test(rel)).sort();
  if (exports.length) files[exports.at(-1)] = fs.readFileSync(path.join(ROOT, exports.at(-1))); // the Centre reads only the newest

  Object.assign(files, launcher(), adminTool());
  for (const f of ['README.md', 'start.sh', 'start.cmd', 'folio', 'folio.cmd']) files[f] = fs.readFileSync(path.join(KIT, f));
  for (const f of ['verify-release.mjs', 'folio.mjs']) files[`scripts/${f}`] = fs.readFileSync(path.join(KIT, f));
  files.VERSION = Buffer.from(`${VERSION}\n`);

  /* Every platform the launcher declares must have its entry point in the package. */
  for (const p of Platforms) {
    const entry = p.id === 'runtime' ? 'runtime/index.html' : p.id === 'mailer' ? 'mailer/web/index.html' : p.entry;
    if (!files[entry]) throw new Error(`${p.name}: ${entry} is not in the package.`);
  }

  const out = {};
  for (const rel of Object.keys(files).sort()) {
    const buf = normalise(rel, files[rel]);
    if (!rel.endsWith('.zip') && SIGNATURE.test(buf.toString('latin1'))) throw new Error(`${rel} carries a signed trigger URL — refusing to package it.`);
    out[rel] = buf;
  }

  const manifest = {
    name: 'NITDA Folio — platform suite',
    package: NAME,
    version: VERSION,
    builtBy: 'scripts/package-platform-release.mjs',
    posture: 'demo',
    note: 'No endpoint is wired and no signed trigger URL is included. Every platform starts; the Workspace, Portal and Mailer transmit nothing until they are configured. See README.md.',
    start: 'node scripts/run-platform.mjs --all',
    platforms: Platforms.map((p) => ({
      id: p.id, name: p.name, group: p.group, port: p.port, needs: p.needs,
      entry: p.id === 'runtime' ? 'runtime/index.html' : p.id === 'mailer' ? 'mailer/web/index.html' : p.entry,
      start: `node scripts/run-platform.mjs ${p.id}`,
      ...(p.id === 'mailer' ? { version: MAILER_VERSION } : {}),
    })),
    files: Object.entries(out).map(([p, b]) => ({ path: p, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') })),
  };
  out['RELEASE_MANIFEST.json'] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return out;
}

/** The zip of the release; pass the files when they are already built. */
export function buildRelease(files = releaseFiles()) {
  return buildZip(Object.keys(files).sort().map((rel) => ({ name: `${TOP}/${rel}`, data: files[rel], executable: EXECUTABLE.test(rel) })));
}

/** Unpack a built release into a directory; returns the release's top folder. */
export function unpack(zipPath, dir) {
  for (const m of openZip(zipPath).members) {
    if (m.isDirectory) continue;
    const abs = path.join(dir, m.name);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, m.read());
    if (EXECUTABLE.test(m.name)) fs.chmodSync(abs, 0o755);
  }
  return path.join(dir, TOP);
}

function main() {
  const files = releaseFiles();
  const zip = buildRelease(files);
  const rel = path.relative(ROOT, ZIP_PATH);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(ZIP_PATH) ? fs.readFileSync(ZIP_PATH) : null;
    if (!current || !current.equals(zip)) {
      console.log(`  ❌ ${rel} is stale — run: npm run platform:release`);
      process.exit(1);
    }
    console.log(`  ✅ ${rel} matches a fresh build (${(zip.length / 1024).toFixed(0)} KB)`);
    return;
  }
  fs.mkdirSync(path.dirname(ZIP_PATH), { recursive: true });
  fs.writeFileSync(ZIP_PATH, zip);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  console.log(`  wrote ${rel} (${(zip.length / 1024 / 1024).toFixed(1)} MB, ${Object.keys(files).length} files)\n  sha256 ${sha}`);
  const i = process.argv.indexOf('--out');
  if (i > 0) console.log(`  unpacked to ${unpack(ZIP_PATH, path.resolve(process.argv[i + 1]))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
