#!/usr/bin/env node
/**
 * The provisioning model: every package read once, joined to the registers once.
 *
 * WHY THIS IS A MODULE RATHER THAN THE TOP OF A GENERATOR
 *
 * `build-provisioning-reference.mjs` reads 131 packages, joins them to six registers, decides
 * which estate each flow belongs to and mints a stable slug per page — and then renders
 * markdown from the result. `build-provisioning-console.mjs` renders an interface from exactly
 * the same result.
 *
 * Two renderers over one analysis. The alternative — each generator doing its own reading — is
 * how the four documents that disagreed about which keys share a flow came to disagree: nothing
 * was wrong in any one of them, and no two were built from the same read. A second reader here
 * would put the markdown and the interface one register-change apart, and the difference would
 * surface as a reader being told two different things about the same flow.
 *
 * So the analysis is here, the renderers are elsewhere, and neither can reach a fact the other
 * cannot. `npm run test:provisioning` proves the markdown is byte-identical across this
 * extraction; `npm run test:provisioningconsole` proves the interface carries every flow the
 * model holds.
 *
 * This module READS. It renders nothing, writes nothing, and decides nothing a register has not
 * already decided — an estate attribution is cited to the register that made it, and a flow no
 * register names is recorded as unnamed rather than guessed at.
 */

import { readFileSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from './flow-definition-reader.mjs';
import { readPackage, containsSignature } from './provisioning-reader.mjs';
import { byteCompare } from './stable-sort.mjs';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const OUT_DIR = 'docs/folio-Master-Flows-and-Endpoints/provisioning';
export const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
export const repoPath = (abs) => relative(ROOT, abs).split(sep).join('/');

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'flow';
export { slug };

/**
 * Read every package, join every register, and return the result.
 *
 * Async because the endpoint contracts are a live ES module under `config/`, read rather than
 * restated so a contract added there appears here without anyone remembering to copy it.
 */
export async function buildProvisioningModel() {
  /* ── the registers this reference joins against ───────────────────────────────────────
     Each is cited on the page that uses it. None of them is a source of flow configuration —
     they map a flow to a name a person uses for it, and nothing more. */
  const listIndex = read('docs/reference/sharepoint-list-index.json');
  const register = read('docs/folio-Master-Flows-and-Endpoints/registers/internal-flow-register.json');
  const wiring = read('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/portal-wiring.json');
  const standard = read('docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/flow-standard.json');
  const portalIds = read('docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json');
  const internalIds = read('docs/folio-Master-Flows-and-Endpoints/registers/endpoint-workflow-ids.json');
  const { EndpointContracts } = await import(new URL('../../config/endpoints.config.js', import.meta.url));

  const listsByGuid = new Map();
  for (const [guid, l] of Object.entries(listIndex.lists || {})) {
    listsByGuid.set(String(guid).toLowerCase(), l);
  }
  /* Which estate a flow belongs to is CITED, never guessed from its name. Two registers say it
     and they say different parts of it: flow-standard.json lists the portal flows it holds to
     the build standard, and portal-endpoint-workflow-ids.json names the flow behind each portal
     endpoint key — which is where the CG_* endpoints are, and they are absent from the first
     list. Reading only one of the two files four portal endpoints under the internal platform. */
  const PORTAL_FLOWS = new Map();
  for (const f of standard.portalFlows || []) {
    PORTAL_FLOWS.set(f, 'listed in `docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/flow-standard.json#portalFlows`');
  }
  for (const e of portalIds.endpoints || []) {
    if (e.flow && !PORTAL_FLOWS.has(e.flow)) {
      PORTAL_FLOWS.set(e.flow, `named as the \`${e.key}\` endpoint flow in \`docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json\``);
    }
  }
  const PORTAL_INTERNAL_NAMES = new Map(
    (portalIds.endpoints || []).filter((e) => e.internalName)
      .map((e) => [e.internalName, `carries the internal name recorded for the \`${e.key}\` endpoint in \`docs/folio-Master-Flows-and-Endpoints/registers/portal-endpoint-workflow-ids.json\``]),
  );
  /* A package that is not a deployed flow belongs to the estate whose tree it sits in.
     This table and the SOURCES list below are two halves of one statement, and on 2026-09-18 they
     came apart: the designer-paste packages moved under `docs/folio-Master-Flows-and-Endpoints/surfaces/`, SOURCES moved with
     them and this did not. Nothing failed to be READ — every package was still found. They simply
     stopped matching any prefix and fell through to the default, so seven Document portal flows
     were silently re-attributed to the Internal platform, each with the basis "no portal register
     names this flow" printed beside it. `assertEveryPackageSourceIsAttributed()` below closes that:
     a package source with no prefix is now a build failure naming the directory. */
  const PACKAGE_ESTATE = [
    ['docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/', 'Document portal'],
    ['docs/folio-Master-Flows-and-Endpoints/packages/', 'Document portal'],
    ['docs/folio-Master-Flows-and-Endpoints/surfaces/portal/', 'Document portal'],
    ['docs/folio-Master-Flows-and-Endpoints/surfaces/internal/', 'Internal platform'],
    ['docs/folio-Master-Flows-and-Endpoints/deployment/internal/', 'Internal platform'],
  ];

  function estateOf(pkg) {
    const byName = PORTAL_FLOWS.get(pkg.displayName);
    if (byName) return { estate: 'Document portal', basis: byName };
    const byId = pkg.internalName ? PORTAL_INTERNAL_NAMES.get(pkg.internalName) : null;
    if (byId) return { estate: 'Document portal', basis: byId };
    for (const [prefix, estate] of PACKAGE_ESTATE) {
      if (pkg.file.startsWith(prefix)) return { estate, basis: `the package sits in \`${prefix}\`` };
    }
    return { estate: 'Internal platform', basis: 'no portal register names this flow' };
  }

  /** definition file -> the contract keys the register attributes to it. */
  const keysByFile = new Map();
  for (const c of register.contractKeys || []) {
    for (const def of c.definitions || []) {
      if (!keysByFile.has(def)) keysByFile.set(def, []);
      keysByFile.get(def).push(c);
    }
  }
  /** portal endpoint key -> its wiring entry, and internal name -> its portal endpoint row. */
  const wiringByEndpoint = new Map((wiring.endpoints || []).map((e) => [e.endpoint, e]));
  const portalByInternalName = new Map(
    (portalIds.endpoints || []).filter((e) => e.internalName).map((e) => [e.internalName, e]),
  );

  /* ── read every package ──────────────────────────────────────────────────────────────── */

  const SOURCES = [
    { dir: 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed', part: 'deployed', attribution: 'byRegister' },
    { dir: 'docs/folio-Master-Flows-and-Endpoints/packages', part: 'package', attribution: 'byTree' },
  ];

  /* Every `byTree` source must actually be named by the estate table. A source that is not is a
     directory whose packages are attributed by a default that says "no portal register names this
     flow" — a sentence that would be printed on every page as though it had been established. */
  for (const src of SOURCES) {
    if (src.attribution !== 'byTree') continue;
    if (PACKAGE_ESTATE.some(([prefix]) => `${src.dir}/`.startsWith(prefix))) continue;
    throw new Error(
      `provisioning model: \`${src.dir}\` is attributed byTree, but PACKAGE_ESTATE has no prefix for it. `
      + `Add one, or declare the source byRegister. Prefixes: ${PACKAGE_ESTATE.map(([p]) => p).join(', ')}`,
    );
  }

  /* Flow-shaped documents this reference deliberately does NOT document, and why.
     They are enumerated by scanning the tree rather than listed by hand, so a new capture
     cannot appear without either being documented or being counted here. */
  const EXCLUDED = [
    { prefix: 'docs/reference/foundational/', why: 'the harvest corpus — historic captures of flows the deployed export already covers. `docs/README.md` classifies it as *"Harvest: untrusted, prefer the contract over the sample"*, and a superseded capture documented as provisioning would read as current state.' },
    { prefix: 'docs/folio-Master-Flows-and-Endpoints/evidence/', why: 'run evidence — one execution of an endpoint on the day it was captured, kept as proof that the run happened. A run is not a provisioning package.' },
  ];

  const packages = [];
  const signatureCarriers = [];
  for (const src of SOURCES) {
    for (const abs of walk(join(ROOT, src.dir))) {
      const rp = repoPath(abs);
      const pkg = readPackage(abs, rp);
      if (!pkg) continue;
      pkg.part = src.part;
      const e = estateOf(pkg);
      pkg.estate = e.estate;
      pkg.estateBasis = e.basis;
      pkg.portal = e.estate === 'Document portal';
      if (containsSignature(pkg.definition)) signatureCarriers.push(rp);
      packages.push(pkg);
    }
  }
  packages.sort((a, b) => byteCompare(a.file, b.file));

  /* Counted by reading them, not by remembering how many there were. */
  const excludedCounts = new Map(EXCLUDED.map((e) => [e.prefix, 0]));
  for (const e of EXCLUDED) {
    for (const abs of walk(join(ROOT, e.prefix))) {
      if (readPackage(abs, repoPath(abs))) excludedCounts.set(e.prefix, excludedCounts.get(e.prefix) + 1);
    }
  }

  /* A slug collision would silently overwrite one flow's page with another's. Two deployed
     flows do differ only by a character markdown eats — `01 - Fetch_All_Data_&_...` and
     `01-Fetch_...` both slug to the same stem — so the internal name disambiguates rather than
     the loop order deciding which flow gets documented. */
  const usedSlugs = new Map([['flows', new Set()], ['packages', new Set()]]);
  for (const pkg of packages) {
    /* Scoped per directory. A deployed flow and the clipboard scope built for it share a name
       by design — `Portal_UPLOAD_ECM_DOCS` is both — and a single namespace hands the clean
       slug to whichever the directory walk reached first, which is the paste package. The
       deployed flow is the one a reader arrives looking for; it keeps its own name. */
    const dir = pkg.part === 'deployed' ? 'flows' : 'packages';
    const taken = usedSlugs.get(dir);
    let s = slug(pkg.displayName || pkg.file.split('/').pop());
    /* Where the internal name slugs to the same stem (two folders hold a package of one name, as the identification
       phases do), the folder disambiguates instead of the stem repeating. */
    const alt = slug(pkg.internalName || pkg.file.split('/').pop().replace(/\.json$/, ''));
    if (taken.has(s)) s = `${s}--${alt !== s ? alt : slug(pkg.file.split('/').slice(-2, -1)[0] || 'dup')}`;
    let n = 2;
    const base = s;
    while (taken.has(s)) { s = `${base}-${n++}`; }
    taken.add(s);
    pkg.slug = s;
    pkg.page = `${OUT_DIR}/${dir}/${s}.md`;
  }

  return {
    listIndex, register, wiring, standard, portalIds, internalIds, EndpointContracts,
    listsByGuid, keysByFile, wiringByEndpoint, portalByInternalName,
    packages, signatureCarriers, excludedCounts, estateOf, SOURCES, EXCLUDED,
  };
}
