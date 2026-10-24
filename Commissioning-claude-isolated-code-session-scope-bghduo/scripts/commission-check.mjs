#!/usr/bin/env node
/**
 * Commissioning readiness gate.
 *
 *   npm run commission                     # gate against the posture the config declares
 *   npm run commission -- --posture pilot
 *   npm run commission -- --posture enforced
 *
 * Answers one question: **may this platform be declared live?**
 *
 * The repository has long been able to say "the tests pass" — 17 Node suites and 78
 * browser tests, all green. That is not the same claim. A platform whose code is
 * correct can still be uncommissionable because its trigger URLs are published, its
 * register is answerable by anonymous callers, or nothing is wired up at all. This
 * checks the obligations that stand between a healthy repository and live usage, and
 * it distinguishes the ones a machine can settle from the ones a person must sign.
 *
 * Two postures, because they are genuinely different products. A third — `development` — is
 * retired and refuses to run; see the refusal below for why.
 *
 *   pilot     Whatever gates who may LOAD the interface is set up outside this repository.
 *             Auth is inert, role is advisory, and a flow called directly answers whoever
 *             calls it. Fit for an internal pilot on correspondence you accept being
 *             readable by anyone holding a URL. Not fit for citizens' personal data at scale.
 *
 *   enforced  auth.enabled:true with OTP_GENERATE and OTP_VERIFY wired — and each flow
 *             verifying the proof itself. There is no identity-provider tenant, no directory
 *             registration and no administrator approval on this path; identity is two
 *             Power Automate flows the platform already calls. The client half is in this
 *             repository. The server half is not and cannot be: it lives in the flows.
 *             This gate can verify the client half and can prove the server half is
 *             UNVERIFIED; it cannot verify it for you.
 *
 * Exit 0 = cleared for the checked posture. Exit 1 = at least one blocker stands.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { pilotKeysOf } from './lib/endpoint-surface.mjs';
import { trackedFiles, publishedSignatures, reusedSignatures } from './lib/published-signatures.mjs';
import { validateEndpointUrl } from './lib/endpoint-validation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const posturArg = (() => {
  const i = argv.indexOf('--posture');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
})();

/* The pilot sets come from scripts/lib/endpoint-surface.mjs, the same definition
   scripts/setup.mjs wires and scripts/package.mjs provisions. They were hardcoded here as
   a third copy, which meant this gate could clear a configuration the packager would
   refuse — or refuse one it would build. */
const PILOT_RUNTIME = pilotKeysOf('runtime');
const PILOT_PORTAL = pilotKeysOf('portal');

const PUBLIC_PORTAL = ['SUBMISSION', 'UPLOAD', 'STATUS', 'SUPPORT', 'VERIFY', 'VERIFY_CONFIRM'];

/* Placeholder detection moved to scripts/lib/endpoint-validation.mjs, which this gate and
   the packager now share. */

/* ------------------------------------------------------------------ *
 * Reporting
 * ------------------------------------------------------------------ */

/* THE MANUALS BELONG TO THE REGISTER, NOT TO THIS FILE.
 *
 * Every obligation this gate reports as MANUAL is a row in
 * docs/deployment/PRODUCTION_READINESS_REGISTER.json. They were written here as literal
 * strings, and nothing connected the two. So when the agency approved the routing matrix on
 * 2026-09-08 and MANUAL-1 went RESOLVED, this gate went on telling every operator who ran it
 * that the table "has not been approved by anyone" — and the register, closing the item, cited
 * this gate's own stale sentence as the evidence that it was ever open. MANUAL-4 did the same
 * with the personal-data disposition. A closed item came back as an outstanding obligation on
 * the one command the commissioning directive names as the readiness test.
 *
 * Each manual now names its register id. A manual whose item the register has closed is not
 * printed as outstanding; it is printed as SETTLED, carrying the register's own closure
 * sentence, so the operator sees that the obligation existed and has been discharged rather
 * than seeing it silently vanish. Closing an item in the register is now the only way to
 * retire an obligation here, and it takes effect on the next run without anyone editing this
 * file. An id this gate names that the register does not carry is a BLOCKER: the gate would
 * otherwise be asserting an obligation no register tracks.
 */
const GOVERNANCE_PATH = 'docs/reference/governance-estate-position.json';
const REGISTER_PATH = 'docs/deployment/PRODUCTION_READINESS_REGISTER.json';
const registerAbs = path.join(ROOT, REGISTER_PATH);
if (!fs.existsSync(registerAbs)) {
  /* Loudly, not quietly. Without the register this gate cannot tell a live obligation from one
     that was discharged a week ago, and the failure it would produce — reporting closed items as
     outstanding — is indistinguishable to a reader from the gate working. */
  console.error(`\n  ✖  ${REGISTER_PATH} is missing.`);
  console.error('     This gate reads it to tell an outstanding obligation from a discharged one.');
  console.error('     Without it every manual would be reported as open, including the closed ones.\n');
  process.exit(2);
}
const register = JSON.parse(fs.readFileSync(registerAbs, 'utf8'));

/* TWO REGISTERS, ONE RULE.
 *
 * The readiness register tracks the commissioning items. The governance estate keeps its own
 * position file, with its own openFindings/closedFindings split and its own suite — and it earns
 * that separation: the endpoint commissioning path touches no governance list, so a GOV finding
 * does not belong in a register whose every other row gates a pilot.
 *
 * What matters for the binding is not which file an obligation lives in but whether closing it
 * there stops this gate reporting it. Both satisfy that: the loop below reads openFindings, so a
 * finding moved to closedFindings leaves this output on the next run, exactly as a RESOLVED item
 * does. So both are accepted, and an id belonging to neither is still refused. */
const governanceStatus = (() => {
  const abs = path.join(ROOT, GOVERNANCE_PATH);
  if (!fs.existsSync(abs)) return new Map();
  try {
    const pos = JSON.parse(fs.readFileSync(abs, 'utf8'));
    return new Map([
      ...(pos.openFindings || []).map((f) => [f.id, 'OPEN']),
      ...(pos.closedFindings || []).map((f) => [f.id, 'CLOSED']),
    ]);
  } catch { return new Map(); }
})();
/* DISCHARGED_UNTRACKABLE counts as closed: done, evidenced once, and unverifiable from
   this repository because the proof is a credential or a git-ignored file. See
   statusVocabulary in the register. */
const REGISTER_CLOSED = new Set(['RESOLVED', 'ACCEPTED', 'DISCHARGED_UNTRACKABLE']);
const registerItem = new Map(register.items.map((i) => [i.id, i]));

const findings = [];
const record = (level, area, title, detail, fix, item = null) =>
  findings.push({ level, area, title, detail, fix, item });

const blocker = (...a) => record('BLOCKER', ...a);
const warn = (...a) => record('WARNING', ...a);
const pass = (...a) => record('PASS', ...a);

/* `item` is the register id this obligation is tracked under. Every manual needs one. The
   exemption below is a list rather than a default, because a default is how the binding gets
   dropped: passing no id was once legal for any call site, so removing an id silently returned
   the gate to hardcoding the obligation — the exact failure this binding exists to prevent, and
   one that no check could see, since an unbound manual names no id to check against. */
const UNTRACKED_MANUALS = new Set([
  /* About this RUN, not about the estate: there is no repository to compare against, so the
     rotation check did not execute. No register item can track a missing work tree. */
  'rotation could not be verified — this is not a git work tree',
]);

const manual = (area, title, detail, fix, item = null) => {
  if (item === null) {
    if (UNTRACKED_MANUALS.has(title)) return record('MANUAL', area, title, detail, fix, null);
    return record('BLOCKER', area, `${title} — reported with no register item`,
      'This gate is asserting an obligation that no register item tracks, so nothing can ever ' +
      'close it: the register can go RESOLVED and this text will still print. Every manual ' +
      'names its register id, or declares itself untracked in UNTRACKED_MANUALS with a reason.',
      `Add the register id to the manual() call for "${title}" in scripts/commission-check.mjs`,
      null);
  }

  const row = registerItem.get(item);
  if (row) {
    if (REGISTER_CLOSED.has(row.status)) {
      return record('SETTLED', area, title, row.whyOpen, `${item} — ${row.status}`, item);
    }
    return record('MANUAL', area, title, detail, fix, item);
  }

  const gov = governanceStatus.get(item);
  if (gov) {
    if (gov === 'CLOSED') {
      return record('SETTLED', area, title,
        'Closed in the governance estate position.', `${item} — CLOSED`, item);
    }
    return record('MANUAL', area, title, detail, fix, item);
  }

  return record('BLOCKER', area, `${title} — names ${item}, which no register carries`,
    `This gate reports ${item} as an outstanding obligation, but neither ${REGISTER_PATH} nor ` +
    `${GOVERNANCE_PATH} carries that id. Either a register dropped it or this gate invented it, ` +
    'and until that is settled the gate cannot be trusted about what is outstanding.',
    `Add ${item} to one of the two registers, or remove the claim from scripts/commission-check.mjs`,
    item);
};

/* ------------------------------------------------------------------ *
 * Load the deploy-time config the way the browser does
 * ------------------------------------------------------------------ */

/**
 * Both config.local.js files are plain scripts assigning to a global. Evaluating them
 * with a stand-in `window` is exactly what the browser does, and it means this gate
 * reads the same bytes that ship rather than a re-parse that could drift.
 */
function loadLocalConfig(relPath, globalName) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return { present: false, config: null, abs, relPath };
  const src = fs.readFileSync(abs, 'utf8');
  const sandbox = { window: {} };
  try {
    // eslint-disable-next-line no-new-func
    new Function('window', src).call(sandbox, sandbox.window);
  } catch (e) {
    return { present: true, config: null, error: e.message, abs, relPath };
  }
  return { present: true, config: sandbox.window[globalName] || null, abs, relPath, src };
}

const runtime = loadLocalConfig('config/config.local.js', 'DGO_CONFIG');
const portal = loadLocalConfig('document-portal/config.local.js', 'PF_CONFIG');

/* ------------------------------------------------------------------ *
 * Posture
 *
 * Settled before anything is checked, because the posture decides what "required" even
 * means. Inference goes to `enforced` when auth is on, otherwise `pilot` — never to
 * `development`, which has to be asked for. A posture that quietly downgrades its own
 * standard is not a gate.
 * ------------------------------------------------------------------ */

const authCfg = runtime.config?.auth || {};
const declaredEnforced = authCfg.enabled === true;
const posture = posturArg || (declaredEnforced ? 'enforced' : 'pilot');

if (!['development', 'pilot', 'enforced'].includes(posture)) {
  console.error(`\n  ✖  Unknown posture "${posture}". Use --posture development | pilot | enforced\n`);
  process.exit(2);
}

/* DEVELOPMENT IS REACHABLE AGAIN, AND NO LONGER GRADED ON A LOWER BAR.
 *
 * This posture used to be wired by `npm run setup -- --recover`, and I retired it with that
 * command: the corpus --recover reads describes the pre-rotation estate, so a config built from
 * it looks complete and answers 401 on every call. That reasoning is now out of date. The
 * endpoint register carries a complete trigger URL for all 25 keys, signature removed, so
 * `npm run values:template` + `values:sign` wires development against the LIVE estate. The
 * posture is entered from the register, not from the corpus, and COMMISSIONING.md says so.
 *
 * What does not come back is the lower bar. Development required PILOT_RUNTIME minus nothing
 * and a portal set of SUBMISSION alone, so the same configuration cleared development while
 * failing pilot — and the operator who ran it had no way to see that the pass meant less. The
 * narrower set existed because no ticket-redeeming UPLOAD flow was in the corpus; the register
 * carries one, so the reason is gone. Development now requires exactly what pilot requires.
 *
 * What it still means is the security declaration below: nothing is enforced, every flow
 * answers whoever calls it, and this configuration must never face the public. That is the
 * difference between the postures, and it is the honest one. */
const isDev = posture === 'development';

/* One required set, every posture. See the note above the posture check. */
const requiredRuntime = PILOT_RUNTIME;
const requiredPortal = PILOT_PORTAL;

/* ------------------------------------------------------------------ *
 * 1 · Endpoint wiring
 * ------------------------------------------------------------------ */

/* WHICH REGISTER ITEM A MISSING CONFIG FILE IS. Both are DISCHARGED_UNTRACKABLE: the work was
   done on 2026-09-13 and the proof — a values file that was shredded, a config.local.js that is
   git-ignored — cannot live here. So this blocker is permanent in every clone, and saying so is
   the whole point. An operator who meets an unexplained blocker against a register that calls the
   item closed does one of two things: re-does a day of work, or decides the register lies. */
const CONFIG_ITEM = { 'Internal runtime': 'CFG-1', 'Public portal': 'CFG-2' };

function checkWiring(surface, required, label, cfgFile) {
  if (!surface.present) {
    const id = CONFIG_ITEM[label];
    const row = id ? registerItem.get(id) : null;
    const discharged = row && row.status === 'DISCHARGED_UNTRACKABLE';
    blocker('wiring', `${label}: not configured`,
      `${surface.relPath} does not exist, so every endpoint resolves to '' and the ` +
      `platform runs in demo mode — it boots and renders, but transmits nothing.`
      + (discharged
        ? `\n  ${id} is ${row.status} in the register — NOT a regression. The wiring was done and `
          + `evidenced once; the values file was shredded and this config is git-ignored, both `
          + `deliberately, so no run in a clone can ever see it. Expect this blocker here forever. `
          + `It stands only for the host you are about to serve from: if that host is configured, `
          + `you are done. If it is not, the steps are in ${id}.`
        : ''),
      discharged
        ? `Only on a host that is not yet wired: docs/deployment/CLEAR-THE-LAST-BLOCKER.md`
        : `npm run setup -- --values ~/dgo-values.txt`,
      id);
    return {};
  }
  if (surface.error) {
    blocker('wiring', `${label}: config file does not evaluate`,
      `${surface.relPath} threw when loaded: ${surface.error}. The browser will fail ` +
      `the same way, silently, because the tag carries onerror="void 0".`,
      `Fix the syntax, or regenerate with npm run setup -- --force`);
    return {};
  }
  const endpoints = surface.config?.endpoints || {};
  const missing = required.filter(k => !String(endpoints[k] || '').trim());

  if (missing.length) {
    /* Two keys are named separately because "regenerate the trigger" is the wrong instruction
       for both, and it is the wrong instruction for DIFFERENT reasons. Telling an operator to
       build a flow that already exists wastes the same day as telling them to rotate one that
       does not.

       SCAN_INTAKE has to be BUILT. Nothing in the estate reads the X-DGO-* headers depositScan
       sends; it is the one genuinely unbuilt flow.

       UPLOAD exists. CG_Upload_Endpoint (workflow df7ddff1) performs the full ticket
       redemption. Two things stand between it and a working portal upload, neither of them a
       flow to write: its trigger is tenant-authenticated, so the portal's anonymous caller is
       refused at the door, and it declares POST where the contract PUTs. Its URL is also not
       recoverable from the corpus, so setup cannot wire it for you.

       Either way the portal runs; attachments are what cannot be delivered, and the client
       reports itself unconfigured rather than pretending a deposit succeeded.
       npm run keyimpl is the current statement of which keys are in which state. */
    /* WHAT UPLOAD STILL NEEDS, READ RATHER THAN ASSERTED.
       This sentence used to say "set its trigger to accept anonymous callers and the PUT the
       portal sends" — correct when written, and false within a day of the operator doing exactly
       that. A commissioning gate that hands out a stale instruction sends someone to change a
       setting that is already right, and the next person to read it trusts it less. So it is
       derived from the same export keyimpl reads: the trigger's own method and authentication. */
    const uploadTriggerAdvice = () => {
      try {
        const dir = path.join(ROOT, 'docs/reference/flow-contracts/deployed');
        const files = fs.readdirSync(dir).filter(f => f.startsWith('CG_Upload_Endpoint__'));
        if (!files.length) return 'Its definition is not exported here, so its trigger cannot be read.';
        const latest = files
          .map(f => ({ f, doc: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }))
          .sort((a, b) => String(a.doc.exportedAtUtc || '').localeCompare(String(b.doc.exportedAtUtc || '')))
          .at(-1);
        const t = Object.values(latest.doc.definition?.triggers || {})[0]?.inputs || {};
        const wrong = [];
        if ((t.method || '').toUpperCase() !== 'PUT') wrong.push(`accept the PUT the portal sends (it declares ${t.method || 'no method'})`);
        if (t.triggerAuthenticationType !== 'All') wrong.push(`accept anonymous callers (it is ${t.triggerAuthenticationType || 'Tenant by default'})`);
        return wrong.length
          ? `Set its trigger to ${wrong.join(' and ')}, then paste its URL in by hand.`
          : 'Its trigger is already correct — PUT, anonymous. What is missing is only its URL, '
            + 'which is a credential and is never recorded in this repository: paste it in by hand.';
      } catch { return 'Its trigger could not be read; npm run keyimpl reports the current posture.'; }
    };

    const toBuild = missing.filter(k => k === 'SCAN_INTAKE');
    const toFixTrigger = missing.filter(k => k === 'UPLOAD');
    const toWire = missing.filter(k => !toBuild.includes(k) && !toFixTrigger.includes(k));
    blocker('wiring', `${label}: ${missing.length} required endpoint(s) unwired`,
      `Correspondence cannot flow end to end without: ${missing.join(', ')}.` +
      (toBuild.length
        ? `\n  ${toBuild.join(', ')} — no flow in the documented estate serves this. It must be ` +
          `BUILT, not rotated: see docs/deployment/FLOW-BUILD-PLAN.md. Everything else runs ` +
          `without it; what fails is the feature it serves, and it reports itself unconfigured.`
        : '') +
      (toFixTrigger.length
        ? `\n  ${toFixTrigger.join(', ')} — the flow EXISTS (CG_Upload_Endpoint). Do not build a ` +
          `second one. ${uploadTriggerAdvice()}`
        : ''),
      toWire.length
        ? `Regenerate each trigger in Power Automate and re-run setup with --force`
        : toFixTrigger.length
          ? `Fix the trigger on CG_Upload_Endpoint, then wire its URL: npm run keyimpl`
          : `Build the flow, then wire it: docs/deployment/FLOW-BUILD-PLAN.md`);
  } else {
    pass('wiring', `${label}: every required endpoint is wired`,
      `${required.length}/${required.length} of the minimal set present in ${cfgFile}.`);
  }

  /* Validated with the same rules scripts/package.mjs applies, so this gate and the
     packager cannot reach opposite verdicts on the same configuration. This used to check
     three things — empty, placeholder, non-HTTPS — which are the failures you make once. A
     URL truncated at the first `&`, or one that lost its api-version somewhere between a
     mail client and a spreadsheet, passed all three and failed at an officer's desk. */
  const invalid = Object.entries(endpoints)
    .filter(([, v]) => String(v || '').trim())
    .map(([k, v]) => validateEndpointUrl(v, { key: k }))
    .filter(r => !r.ok);

  if (invalid.length) {
    blocker('wiring', `${label}: ${invalid.length} endpoint URL(s) are not usable`,
      invalid.map(r => `  ${r.key} — ${r.message}`).join('\n') +
      '\n  Called directly, a malformed URL has nothing in front of it to produce a useful ' +
      'error: it fails mid-action, as a network error, with nothing to point at.',
      `Correct each value and re-run npm run setup -- --force`);
  } else if (Object.values(endpoints).some(Boolean)) {
    pass('wiring', `${label}: every wired URL is a complete, invocable endpoint`,
      'Scheme, host, workflow, trigger path, api-version and signature all present.');
  }
  return endpoints;
}

const runtimeEndpoints = checkWiring(runtime, requiredRuntime, 'Internal runtime', 'config/config.local.js');
const portalEndpoints = checkWiring(portal, requiredPortal, 'Public portal', 'document-portal/config.local.js');

/* ------------------------------------------------------------------ *
 * 2 · Credential hygiene — the part that actually decides go-live
 * ------------------------------------------------------------------ */

/*
 * The signature scan lives in scripts/lib/published-signatures.mjs, shared with
 * scripts/package.mjs. Both gates ask the same question — is this endpoint wired to a
 * credential this repository already discloses? — and two implementations of it is two
 * chances for the packager to build what this gate would refuse.
 *
 * Running the gate on an exported or deployed copy is legitimate; that is arguably where
 * you most want it. So a missing .git must not crash, and must not silently pass either:
 * without the repository there is nothing to compare a wired signature against, and
 * "could not check" is a different claim from "checked, and it is clean".
 */

const tracked = trackedFiles(ROOT);
const inGitTree = tracked !== null;
const published = inGitTree ? publishedSignatures(ROOT, tracked) : new Map();

if (!inGitTree) {
  manual('credentials', 'rotation could not be verified — this is not a git work tree',
    'The gate compares each wired trigger URL against every signature committed to this ' +
    'repository, which is how it catches an endpoint that was never rotated. Without the ' +
    'repository there is nothing to compare against, so that check did not run. This is ' +
    'not a pass.',
    'Run npm run commission from a clone of the repository');
} else if (published.size) {
  const files = new Set();
  for (const fl of published.values()) fl.forEach(f => files.add(f));
  /* Two very different situations produce committed signatures, and calling both "live
     credentials" is wrong in one direction and dangerous in the other.

     Before the rotation these were the working URLs, and the warning was literal. Since it, the
     estate has moved: `docs/reference/endpoint-register.json` is a post-rotation export, and
     none of the signatures committed here appears in it — the reuse check below reports zero
     for both surfaces. So they no longer authenticate anything this platform calls.

     That is measured, not asserted, and it is deliberately still a warning rather than a pass.
     What the measurement establishes is narrow: no committed signature matches a CONFIGURED
     endpoint. It cannot establish that a signature belonging to some flow outside the 25 was
     also regenerated, and every one of them is in git history where deletion reaches nothing.
     Treat them as burned, not as harmless. */
  const supersededByRegister = (() => {
    try {
      const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/endpoint-workflow-ids.json'), 'utf8'));
      return /endpoint-register\.json$/.test(map?.authority?.file || '');
    } catch { return false; }
  })();

  warn('credentials', `${published.size} signed trigger URL(s) are committed to this repository`,
    supersededByRegister
      ? `Across ${files.size} tracked file(s) under docs/reference/foundational/, which documents `
        + `the pre-rotation estate verbatim by explicit decision (D5). The estate has since been `
        + `rotated and reconciled against docs/reference/endpoint-register.json: none of these `
        + `signatures appears in the current configuration, so none authenticates an endpoint `
        + `this platform calls. They are superseded, not secret — every one is in git history, `
        + `where deleting a file reaches nothing. Treat them as burned.`
      : `Across ${files.size} tracked file(s), largely the reference corpus under `
        + `docs/reference/foundational/, which documents the deployed flow estate verbatim `
        + `by explicit decision (D5). Anyone who can read this repository holds every one of `
        + `them, and deleting a file revokes nothing.`,
    supersededByRegister
      ? `Confirm each was regenerated. Superseded is not the same as verified-revoked.`
      : `Rotate each in Power Automate. Deletion is not rotation.`);
} else {
  pass('credentials', 'no signed trigger URL is committed', 'The tracked tree carries no SAS signature.');
}

/**
 * The check that matters most, and the one no other suite performs: is an endpoint you
 * are about to go live on the SAME signature that is already published in this
 * repository? If so it was never rotated, and the deployment inherits a credential
 * that anyone with repository access already holds.
 */
function checkRotation(endpoints, label) {
  const reused = reusedSignatures(endpoints, published);
  if (reused.length) {
    const detail =
      reused.map(r => `  ${r.key} — same signature as ${r.files[0]}${r.files.length > 1 ? ` (+${r.files.length - 1} more)` : ''}`).join('\n');
    /* A WARNING IN EVERY POSTURE, AND NO LONGER A BLOCKER.

       This blocked pilot and enforced, which made the only configuration that can actually
       be tested live the one the gate refused — and the only way past it was to mint a fresh
       production estate before anything had been exercised. That is the sequence that gets
       an estate regenerated two or three times, re-exposing each new set through the same
       working files.

       So the exposure is reported, loudly, wherever it is found. What it means does not
       change with the posture: these URLs are held by everyone with repository access, and
       a deployment carrying them may be exercised but must not receive real correspondence. */
    warn('credentials', `${label}: ${reused.length} endpoint(s) wired to a PUBLISHED signature`,
      detail +
      `\n  These trigger URLs are committed to this repository, so anyone who can read it ` +
      `holds them. Fit for live testing of the flow contracts; NOT fit for real ` +
      `correspondence or citizens' personal data.` +
      (isDev ? '' : `\n  Rotate once testing concludes — not before, or you will be rotating again.`),
      `npm run rotation   # 39 flows, then rebuild with npm run package -- --values`);
  } else if (inGitTree && Object.values(endpoints || {}).some(Boolean)) {
    pass('credentials', `${label}: no wired endpoint reuses a published signature`,
      'Every configured trigger URL is distinct from the ones committed here.');
  }
}

checkRotation(runtimeEndpoints, 'Internal runtime');
checkRotation(portalEndpoints, 'Public portal');

/** The config.local files must be untracked. A committed one is a permanent leak. */
if (inGitTree) {
  const committed = ['config/config.local.js', 'document-portal/config.local.js']
    .filter(rel => tracked.includes(rel));
  for (const rel of committed) {
    blocker('credentials', `${rel} is tracked by git`,
      'This file holds live trigger URLs. Committing it publishes them to everyone with ' +
      'repository access, permanently — rewriting history does not revoke them.',
      `git rm --cached ${rel}  (then rotate every URL it contained)`);
  }
  if (!committed.length) {
    pass('credentials', 'deploy-time config is untracked',
      'Both config.local.js files are git-ignored and unstaged.');
  }
}

/* ------------------------------------------------------------------ *
 * 3 · Authentication posture
 * ------------------------------------------------------------------ */

if (isDev) {
  warn('auth', 'development posture: nothing is enforced anywhere',
    'Authentication is inert by design here — no identity provider, no token, identity ' +
    'from the local profile. Every flow is reachable by anyone holding its URL. This is a ' +
    'development configuration and carries no security properties at all.',
    'Correct for development. Never expose it to the public or to real correspondence.');

  manual('auth', 'authorisation is the flows\' obligation, in every posture',
    'With no proxy and no identity provider, a flow is the only place a caller can be ' +
    'checked. That does not change when you move to production — it is the same ' +
    'obligation. What development buys you is the chance to get the request and response ' +
    'contracts right first, against the live estate.',
    'npm run verify:endpoints -- --include-writes, then docs/architecture/AUTHENTICATION_CONTRACT.md §2',
    'G-04');
} else if (posture === 'enforced') {
  if (!declaredEnforced) {
    blocker('auth', 'enforced posture requested but auth is inert',
      'config/auth.config.js defaults to enabled:false, and nothing in ' +
      'config/config.local.js overrides it. Caller identity travels as a client-asserted ' +
      'userEmail from localStorage, and RBAC is advisory: editing one storage key ' +
      'escalates a viewer to systemAdmin.',
      'npm run setup -- --force with DGO_AUTH_ENABLED=true and the tenant values');
  } else {
    /* Identity is OTP, so "is the enforced posture configured?" is now the same question
       as "are two endpoints wired?" — and they arrive in the package with every other URL.
       This used to demand a tenantId and a clientId, which put a directory registration and
       an administrator's approval on the critical path of activation. */
    const missingOtp = ['OTP_GENERATE', 'OTP_VERIFY']
      .filter(k => !String(runtimeEndpoints[k] || '').trim());
    if (missingOtp.length) {
      blocker('auth', `enforced posture is incomplete: ${missingOtp.join(', ')} unwired`,
        'auth.enabled is true but the OTP flows that issue and verify the proof are not ' +
        'configured, so no caller can obtain one and every governed action will fail closed.',
        'Wire OTP_GENERATE and OTP_VERIFY, then rebuild the package');
    } else {
      pass('auth', 'client half of enforced auth is complete',
        'enabled:true with both OTP endpoints wired. No identity provider to register.');
    }
    if (authCfg.roleSource !== 'verified') {
      warn('auth', 'roles still read from local state under enforced auth',
        `roleSource is "${authCfg.roleSource || 'local'}". The proof is acquired and sent, ` +
        'but the role decision is still made from the browser profile — which the user ' +
        'controls. This is the half-enabled state config/auth.config.js warns against.',
        'Set DGO_AUTH_ROLE_SOURCE=verified, and have the flow return the role it resolved');
    }
  }
  manual('auth', 'server half: each flow must verify the proof itself',
    'This is gap G-04. There is no proxy and no identity provider, so proof verification, ' +
    'role derivation, per-action authorisation, rate limiting, reference minting and ' +
    'upload ticketing are each flow\'s own obligation. No check in this repository can ' +
    'verify a Power Automate flow. Until you have tested each one against an anonymous ' +
    'caller and an under-privileged caller, treat enforcement as unproven.',
    'docs/architecture/AUTHENTICATION_CONTRACT.md §2, then verify per docs/deployment/MINIMAL-PILOT.md §7',
    'G-04');
} else {
  warn('auth', 'pilot posture: authentication is inert and enforcement is advisory',
    'Caller identity is a client-asserted userEmail from localStorage; editing one ' +
    'storage key escalates a viewer to systemAdmin. Whatever gates who may LOAD the ' +
    'interface, it does not sit between the page and the flows — a flow ' +
    'called directly answers whoever calls it.',
    'Acceptable for an internal pilot. Not for citizens\' personal data at scale.');
  if (portalEndpoints && Object.keys(portalEndpoints).some(k => PUBLIC_PORTAL.includes(k) && portalEndpoints[k])) {
    manual('auth', 'the public channel is open by definition',
      'Portal endpoints are delivered to every visitor\'s browser and are readable from ' +
      'the page source. Each configured flow must validate its own input, rate-limit its ' +
      'own callers, mint its own reference and verify its own uploads, because nothing ' +
      'else in the request path can.',
      'Confirm C7/C9 obligations in docs/deployment/FLOW-BUILD-WALKTHROUGH.md are built',
      'G-04');
  }
}

/* ------------------------------------------------------------------ *
 * 4 · The quality gate still has to be green
 * ------------------------------------------------------------------ */

for (const [label, script] of [
  ['module graph', 'tests/check-imports.mjs'],
  ['secret ratchet', 'tests/check-secrets.mjs'],
]) {
  try {
    execFileSync(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, stdio: 'pipe' });
    pass('quality', `${label} passes`, `${script} exits clean.`);
  } catch {
    blocker('quality', `${label} FAILS`,
      `${script} exits non-zero. The runtime once shipped 12 config modules that were ` +
      `imported but never committed; because those are static imports the failure ` +
      `preceded boot()'s own try/catch, so nothing threw and the app hung on its spinner.`,
      `node ${script}`);
  }
}

manual('quality', 'browser suite must be run against the deployed build',
  'npm run test:smoke covers boot, accessibility, all 29 routes, themes and the portal, ' +
  'but against a local server. Run it once more against the deployed hostname before ' +
  'declaring live, because deployment is where config.local.js presence differs.',
  'npm run test:smoke', 'MANUAL-3');

/* ------------------------------------------------------------------ *
 * 5 · Obligations no script can settle
 * ------------------------------------------------------------------ */

manual('governance', 'routing table needs approval',
  'docs/deployment/MINIMAL-PILOT.md §8 decides which desk each kind of ' +
  'correspondence lands on. It has not been approved by anyone.',
  'docs/deployment/MINIMAL-PILOT.md §8', 'MANUAL-1');

manual('governance', 'test records must be cleared before real correspondence arrives',
  'Commissioning verification writes real rows into the Correspondence list, and a ' +
  'reference sequence that has issued test numbers keeps issuing from there.',
  'docs/deployment/MINIMAL-PILOT.md §8', 'MANUAL-2');

/* The governance list estate, read from its recorded position rather than restated here — so
   the gate and `tests/governance-estate.test.mjs` cannot come to disagree about what is open.
   These are reported as obligations, not blockers, and the distinction is load-bearing: the
   endpoint commissioning path reaches Power Automate directly and touches no governance list,
   so none of this stops a pilot. What it stops is enrolment, the role catalogue and the audit
   trail landing where anything reads them — which an operator will otherwise discover as
   silence, after going live. */
{
  let position = null;
  try { position = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reference/governance-estate-position.json'), 'utf8')); }
  catch { /* absent in a partial checkout; the suite above is where that is caught */ }
  for (const f of position?.openFindings || []) {
    if (f.blocksCommissioning) continue;   // a blocker would be raised as one, not as an obligation
    /* The tenant half is what is left to DO. Printing the narrative alone made a finding whose
       repository work is finished read exactly like one where nothing has happened, which is how
       an operator learns to skim this section — and a gate people skim has stopped being a gate.
       Where the record separates the two, the tenant status leads. */
    manual('governance', `${f.id} — ${f.title}`,
      f.tenantStatus
        ? `STILL TO DO IN THE TENANT: ${f.tenantStatus} In this repository: ${f.repositoryStatus ?? 'no recorded change.'}`
          + ` Owner: ${f.owner}.`
        : `${f.detail}${f.blocksNote ? ` ${f.blocksNote}` : ''} Owner: ${f.owner}.`,
      'docs/reference/governance-estate-position.json', f.id);
  }

  /* A CLOSED FINDING LEAVES THIS OUTPUT VISIBLY, NOT SILENTLY.
     Iterating openFindings alone means closing one makes it vanish, and a reader who remembers it
     cannot tell "discharged" from "dropped" — so they go and check, or worse, re-raise it. Register
     items already print as SETTLED for exactly this reason; the governance findings now do too. The
     work these record is real and someone did it. */
  for (const f of position?.closedFindings || []) {
    /* `status` is a one-word disposition on the older entries ("consistent", "superseded by
       GOV-08") and a sentence on the newer ones. A reader needs the reason, so take the longer of
       status and detail rather than preferring either — and say both when the short one adds a
       word the long one does not. */
    const short = (f.status ?? '').trim();
    const long = (f.detail ?? '').trim();
    const why = short.length > long.length ? short
      : long && short ? `${long} (${short})`
        : long || short || 'Closed in the governance estate position.';
    record('SETTLED', 'governance', `${f.id} — ${f.title}`, why,
      `${f.id} — CLOSED${f.closedUtc || f.correctedUtc ? `, ${f.closedUtc ?? f.correctedUtc}` : ''}`, f.id);
  }
}

manual('data-protection', 'personal data of ~785 individuals is in scope',
  'Finding R-01. The repository is private now, which closed the exposure, but live ' +
  'usage puts that data through a channel whose enforcement posture you are choosing ' +
  'above. The pilot posture does not protect it.',
  'docs/STATUS_REPORT.md R-01', 'MANUAL-4');

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const ICON = { PASS: '✅', WARNING: '⚠️ ', BLOCKER: '⛔', MANUAL: '📋', SETTLED: '🔒' };
const ORDER = ['BLOCKER', 'WARNING', 'MANUAL', 'PASS', 'SETTLED'];
const LABEL = { SETTLED: 'SETTLED — obligations the register has closed' };

console.log(`\nDGO Digital Operations — commissioning readiness\n`);
console.log(`  Posture checked: ${posture.toUpperCase()}${posturArg ? '' : '  (inferred from configuration)'}\n`);

for (const level of ORDER) {
  const group = findings.filter(f => f.level === level);
  if (!group.length) continue;
  const plural = group.length === 1 ? '' : level === 'PASS' ? 'ES' : 'S';
  console.log(`  ${ICON[level]} ${LABEL[level] || level + plural} — ${group.length}\n`);
  for (const f of group) {
    console.log(`     ${f.title}${level === 'MANUAL' && f.item ? `  [${f.item}]` : ''}`);
    if (level !== 'PASS') {
      for (const line of f.detail.split('\n')) console.log(`       ${line}`);
      if (f.fix) console.log(`       → ${f.fix}`);
    }
    console.log('');
  }
}

const blockers = findings.filter(f => f.level === 'BLOCKER');
const manuals = findings.filter(f => f.level === 'MANUAL');
const settled = findings.filter(f => f.level === 'SETTLED');

console.log('  ' + '─'.repeat(72) + '\n');
if (blockers.length) {
  /* A blocker whose register item is DISCHARGED_UNTRACKABLE is not the same animal as one that
     has never been done, and reporting both under one count taught the reader nothing. Separating
     them is the difference between "you have a day of work" and "check whether the host you are
     about to serve from is the one that was already wired". */
  const discharged = blockers.filter((f) => f.item && registerItem.get(f.item)?.status === 'DISCHARGED_UNTRACKABLE');
  const live = blockers.length - discharged.length;

  console.log(`  NOT CLEARED for ${posture} usage — ${blockers.length} blocker(s) stand.\n`);
  if (discharged.length) {
    console.log(`  ${discharged.length} of them (${discharged.map((f) => f.item).join(', ')}) are DISCHARGED_UNTRACKABLE:`);
    console.log(`  done once, on a host this repository cannot see, with the proof deliberately`);
    console.log(`  destroyed. They will stand in every clone forever. Judge them against the host`);
    console.log(`  you are serving from, not against this checkout.\n`);
  }
  if (live) {
    console.log(`  ${live} ${live === 1 ? 'is' : 'are'} outstanding on any host.`);
  }
  console.log(`  Nothing here is a code defect. Every blocker is a commissioning step that`);
  console.log(`  has to happen in your tenant, not in this repository.\n`);
  process.exit(1);
}
console.log(`  No automated blocker for ${posture} usage.\n`);
console.log(`  ${manuals.length} obligation(s) remain that no script can settle — they need a`);
console.log(`  person to verify and sign. Read them above before declaring live.\n`);
if (settled.length) {
  console.log(`  ${settled.length} further obligation(s) are closed in the register and are not`);
  console.log(`  outstanding. They are listed above so their closure is visible, not silent.\n`);
}
process.exit(0);
