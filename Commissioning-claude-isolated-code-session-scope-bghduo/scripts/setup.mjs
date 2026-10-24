#!/usr/bin/env node
/**
 * One-command endpoint wiring.
 *
 *   npm run setup                                        # scaffold both config.local.js files
 *   npm run values:template ~/dgo-values.txt             # 25 keys, URLs pre-filled
 *   npm run setup -- --values ~/dgo-values.txt --force   # wire them
 *
 * Writes the two git-ignored files the platform reads its Power Automate flow URLs
 * from — `config/config.local.js` (internal runtime) and
 * `document-portal/config.local.js` (public portal) — and reports exactly which
 * endpoints are wired and which are not.
 *
 * WHERE THE VALUES COME FROM, in precedence order:
 *
 *   1. `--values <file>`   plain `KEY=value` lines, one per endpoint, `#` comments
 *      allowed. This is the `~/dgo-values.txt` that docs/deployment/MINIMAL-PILOT.md
 *      has you fill in as you regenerate each trigger.
 *   2. environment          `DGO_ENDPOINT_<KEY>` for the runtime,
 *                           `PF_ENDPOINT_<KEY>` for the portal.
 *   3. nothing              the key is written empty, and that feature reports itself
 *                           unconfigured at runtime rather than failing mid-action.
 *
 * ON `--recover`, WHICH IS RETIRED. It read trigger URLs out of this repository's reference
 * corpus. The rotation revoked every one of those signatures, and reconciliation against
 * docs/reference/endpoint-register.json showed the workflows behind them superseded. It now
 * refuses rather than writing a config that looks complete and 401s on every call — see the
 * refusal further down for the full reasoning and the replacement.
 *
 * Generate the values file instead: `npm run values:template <path>` emits all 25 keys with
 * their current URLs already filled in, complete but for the signature.
 *
 * Idempotent, and it never overwrites an existing config.local.js without --force, so
 * a hand-edited file survives a re-run. Exits 0 with no values supplied: that is the
 * demo-mode scaffold, which is what a fresh Codespace or a first clone should get.
 *
 * ON REFUSING TO NO-OP SILENTLY. Those two behaviours combine badly. Supply values, omit
 * --force, and the file that already exists is left alone: nothing is wired, and the run
 * exits 0 having printed one line among thirty. Every published instance of
 * `npm run setup -- --values <file>` in this repository's own documentation was wrong for
 * exactly that reason — the reader has values, so the file exists, so the command does
 * nothing and says it succeeded. Supplying values is an unambiguous request to write them,
 * so when they cannot be written this exits 2 and names --force. Passing values only to
 * discover none of them took effect is not something an exit code should let you do.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_ENDPOINTS, PORTAL_ENDPOINTS } from './lib/endpoint-surface.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const FORCE = argv.includes('--force');
const QUIET = argv.includes('--quiet');
const RECOVER = argv.includes('--recover');
const VALUES_FILE = (() => {
  const i = argv.indexOf('--values');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
})();

/* ------------------------------------------------------------------ *
 * The two endpoint surfaces come from scripts/lib/endpoint-surface.mjs.
 *
 * They used to be declared here, and again in scripts/package.mjs, and the pilot subset
 * a third time in scripts/commission-check.mjs. Three copies of a list that must agree is
 * three chances to disagree, and the consequence is not cosmetic: a wired working tree and
 * a delivered package would provision different endpoint sets while both reported success.
 *
 * `pilot: true` marks the endpoints docs/deployment/MINIMAL-PILOT.md treats as the
 * irreducible set — correspondence cannot flow end to end without them. Everything else is
 * a feature you add later with one value and a re-run, which is why an unset key is
 * reported rather than treated as an error.
 * ------------------------------------------------------------------ */

/**
 * Authentication, injected the same way the endpoints are.
 *
 * config/auth.config.js reads `window.DGO_CONFIG.auth` and holds every structure the
 * enforced posture needs, switched off. There is no tenantId or clientId to supply — no
 * identity provider is depended on, and identity is the OTP_GENERATE / OTP_VERIFY pair,
 * which arrives with every other endpoint. Activation is therefore a flag, not a registration.
 *
 * Flipping `enabled` changes four behaviours at once, by design — see the header of
 * config/auth.config.js. It does NOT make anything server-authoritative on its own:
 * the flows still have to verify the proof. That is what `npm run commission`
 * refuses to let you forget.
 */
const AUTH_KEYS = [
  { key: 'enabled', env: 'DGO_AUTH_ENABLED', cast: v => v === 'true' || v === '1' },
  { key: 'roleSource', env: 'DGO_AUTH_ROLE_SOURCE' },
];

/* ------------------------------------------------------------------ *
 * Value resolution
 * ------------------------------------------------------------------ */

/** Parse `KEY=value` lines. Tolerates `export KEY=value`, quotes and `#` comments. */
function parseValuesFile(file) {
  const abs = path.resolve(file.replace(/^~(?=$|\/)/, process.env.HOME || '~'));
  if (!fs.existsSync(abs)) {
    console.error(`\n  ✖  Values file not found: ${abs}\n`);
    process.exit(1);
  }
  const out = {};
  for (const raw of fs.readFileSync(abs, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const FILE_VALUES = VALUES_FILE ? parseValuesFile(VALUES_FILE) : {};

/**
 * Recovered endpoints, when `--recover` is passed. Loaded lazily so the corpus is only
 * scanned when it is actually wanted — it is a few hundred megabytes of documentation.
 */
/**
 * `--recover` IS RETIRED, and refuses rather than wiring a dead estate.
 *
 * It scraped trigger URLs out of the reference corpus, and while those URLs were the live ones
 * that was the fastest way to get a working tree talking to the tenant. Two things ended it, in
 * the same week:
 *
 *   1. The estate was rotated. Every signature in the corpus is revoked, so every URL it
 *      recovers now 401s.
 *   2. `docs/reference/endpoint-register.json` arrived from the tenant, and reconciling against
 *      it showed all 25 keys pointing at *different workflows* than this repository recorded.
 *      The corpus is not merely holding stale signatures; it is describing a previous estate.
 *      `npm run check:config` reports 17 of 17 recovered keys as "points at the WRONG FLOW".
 *
 * A recovery that produces revoked credentials on superseded workflows is worse than no
 * recovery, because it produces a config that looks complete. So this exits rather than writing
 * one, and names the replacement — which is strictly better on every axis: 25 keys rather than
 * 17, the current workflows, no published signature, and the operator pastes a 43-character
 * signature per key instead of a 300-character URL.
 */
if (RECOVER) {
  console.error(`
  ✖  --recover is retired. It would wire a dead estate.

     The signatures it reads from docs/reference/ were revoked when the estate was
     rotated, and reconciliation against docs/reference/endpoint-register.json showed
     all 25 keys now point at different workflows than that corpus records. A config
     built from it looks complete and answers 401 on every call.

     Use the register instead — it covers all 25 keys, at their current workflows:

         npm run values:template ~/dgo-values.txt

     Every URL arrives complete except its signature. Open each flow, copy the part of
     its trigger URL after "sig=", paste it at the end of the matching line, then:

         npm run check:values -- ~/dgo-values.txt
         npm run setup -- --values ~/dgo-values.txt --force

     --force without --recover is correct now: the values file carries all 25 keys, so
     there is nothing left for a fallback to supply.
`);
  process.exit(2);
}
const RECOVERED = null;

/**
 * Resolve one endpoint. `prefixes` are tried in order against the values file first,
 * then the environment, then anything recovered from the corpus — so an explicit value
 * always overrides a recovered one, and a values file entry beats a stale shell export.
 *
 * Both the bare key and the `DGO_ENDPOINT_`/`PF_ENDPOINT_` forms are accepted because
 * MINIMAL-PILOT.md tells you to record them prefixed, and people reasonably write
 * them bare.
 */
function resolve(key, prefixes, surface) {
  const names = [...prefixes.map(p => p + key), key];
  for (const n of names) if (FILE_VALUES[n]) return FILE_VALUES[n].trim();
  for (const n of names) if (process.env[n]) return process.env[n].trim();
  if (RECOVERED?.[surface]?.found[key]) return RECOVERED[surface].found[key].url;
  return '';
}

/* ------------------------------------------------------------------ *
 * Emission
 * ------------------------------------------------------------------ */

const pad = (s, n) => String(s).padEnd(n, ' ');

/** Wrap prose to a width, so a caveat stays readable in a terminal report. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The auth block is emitted only when something was actually supplied. Writing
 * `enabled: false` explicitly would be indistinguishable from a deliberate decision to
 * run inert, and config/auth.config.js already defaults to inert — so silence here
 * means "unchanged", not "switched off".
 */
function renderAuth(auth) {
  if (!Object.keys(auth).length) return '';
  const w = Math.max(...Object.keys(auth).map(k => k.length)) + 2;
  const lines = Object.entries(auth).map(
    ([k, v]) => `    ${pad(k + ':', w)}${JSON.stringify(v)},`
  );
  return `
  /* Authentication. Supplied at deploy time — never committed.
   *
   * ⚠  enabled:true switches on the CLIENT half only: the browser acquires a token and
   * sends it, stops asserting identity itself, and reads roles from claims. It does NOT
   * make any decision server-authoritative. Each Power Automate flow must validate the
   * token, derive the role and authorise the action itself — that is gap G-04's server
   * half, and it lives in Power Automate, not in this repository.
   * See docs/architecture/AUTHENTICATION_CONTRACT.md.
   */
window.DGO_CONFIG.auth = Object.assign({
${lines.join('\n')}
}, window.DGO_CONFIG.auth);
`;
}

function renderRuntime(values, auth) {
  const w = Math.max(...RUNTIME_ENDPOINTS.map(e => e.key.length)) + 2;
  const lines = RUNTIME_ENDPOINTS.map(
    e => `    ${pad(e.key + ':', w)}${JSON.stringify(values[e.key] || '')},`
  );
  return `/* DGO R11.6 runtime — endpoint configuration.
 *
 * WRITTEN BY \`npm run setup\`. Git-ignored on purpose: every URL below is a signed
 * Power Automate trigger, and a signed trigger URL is a bearer credential —
 * possession alone authorises invoking the flow.
 *
 * This file is delivered verbatim to every browser that loads the platform, so treat
 * each URL as public from the moment you deploy. There is no proxy in the request
 * path: the flow behind each URL is the only place authentication, authorisation,
 * validation and rate limiting can happen, and it must do all four itself.
 *
 * Rotate on a schedule: regenerate the signature in Power Automate, re-run
 * \`npm run setup -- --force\`, redeploy. That is the only way to revoke one.
 *
 * An empty value is not a failure — that endpoint's feature reports itself
 * unconfigured rather than pretending an action succeeded.
 *
 * MERGED, NOT ASSIGNED. config/endpoints.config.js documents injecting window.DGO_CONFIG
 * before the module graph evaluates as a supported way to supply endpoints, so anything
 * already set when this file loads must win. Overwriting it wholesale would silently
 * break that path — and every test harness that relies on it.
 */
window.DGO_CONFIG = window.DGO_CONFIG || {};
window.DGO_CONFIG.endpoints = Object.assign({
${lines.join('\n')}
}, window.DGO_CONFIG.endpoints);
${renderAuth(auth)}`;
}

function renderPortal(values) {
  const w = Math.max(...PORTAL_ENDPOINTS.map(e => e.key.length)) + 2;
  const lines = PORTAL_ENDPOINTS.map(
    e => `    ${pad(e.key + ':', w)}${JSON.stringify(values[e.key] || '')},`
  );
  return `/* Document portal — endpoint configuration.
 *
 * WRITTEN BY \`npm run setup\`. Git-ignored on purpose.
 *
 * ⚠  This is the PUBLIC portal. Every URL below is readable by anyone who fetches a
 * static asset from the site, so configure only endpoints whose flows are built to be
 * invoked by an anonymous stranger: each must validate its own input, rate-limit its
 * own callers, return only what that caller is entitled to see, and be rotatable.
 *
 * Leave SUBMISSION empty and the portal stays in DEMO MODE — everything stays on the
 * device and nothing is transmitted, which is the safe failure for a public channel.
 *
 * MERGED, NOT ASSIGNED. document-portal/js/data.js documents injecting window.PF_CONFIG
 * before it loads as a supported way to supply endpoints, so anything already set when
 * this file loads must win.
 */
window.PF_CONFIG = window.PF_CONFIG || {};
window.PF_CONFIG.endpoints = Object.assign({
${lines.join('\n')}
}, window.PF_CONFIG.endpoints);
`;
}

function write(relPath, contents, label) {
  const abs = path.join(ROOT, relPath);
  if (fs.existsSync(abs) && !FORCE) {
    return { written: false, reason: 'exists', abs, relPath, label };
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  return { written: true, abs, relPath, label };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const runtimeValues = Object.fromEntries(
  RUNTIME_ENDPOINTS.map(e => [e.key, resolve(e.key, ['DGO_ENDPOINT_', 'DGO_'], 'runtime')])
);
const portalValues = Object.fromEntries(
  PORTAL_ENDPOINTS.map(e => [
    e.key,
    resolve(e.key, ['PF_ENDPOINT_', 'DGO_ENDPOINT_INTAKE_', 'PF_'], 'portal'),
  ])
);

const authValues = {};
for (const { key, env, cast } of AUTH_KEYS) {
  const raw = FILE_VALUES[env] ?? process.env[env];
  if (raw === undefined || raw === '') continue;
  authValues[key] = cast ? cast(String(raw).trim()) : String(raw).trim();
}

const results = [
  write('config/config.local.js', renderRuntime(runtimeValues, authValues), 'runtime'),
  write('document-portal/config.local.js', renderPortal(portalValues), 'portal'),
];

if (!QUIET) {
  console.log('\nDGO Digital Operations — endpoint setup\n');

  if (VALUES_FILE) console.log(`  Reading values from ${VALUES_FILE}\n`);

  if (RECOVERED) {
    console.log('  RECOVERED FROM THE REFERENCE CORPUS — the documented estate.');
    console.log('  These signatures are committed to this repository and are therefore');
    console.log('  published: anyone with repository access holds them. That is a');
    console.log('  deliberate decision for live testing, and `npm run commission`');
    console.log('  reports it in every posture rather than blocking the only');
    console.log('  configuration that can be exercised.\n');

    for (const [surface, label] of [['runtime', 'Internal runtime'], ['portal', 'Public portal']]) {
      const { found, missing } = RECOVERED[surface];
      const keys = Object.keys(found);
      if (keys.length) {
        console.log(`  ${label} — ${keys.length} recovered`);
        for (const k of keys) {
          const r = found[k];
          console.log(`    ✅ ${pad(k, 24)} ${r.workflowId?.slice(0, 8) ?? '?'}  ${r.flow || r.via}`);
          if (r.alternates?.length) {
            console.log(`       ${r.alternates.length} alternate URL(s) available — see FLOW_CATALOGUE.json in a built package`);
          }
          if (r.warning) {
            for (const line of wrap(r.warning, 68)) console.log(`       ⚠  ${line}`);
          }
          if (r.caveat) {
            for (const line of wrap(r.caveat, 68)) console.log(`       ⚠  ${line}`);
          }
        }
      }
      const unavailable = RECOVERED.unavailable[surface] || {};
      for (const k of missing) {
        const why = unavailable[k];
        console.log(`    ·  ${pad(k, 24)} no flow in the corpus`);
        if (why) for (const line of wrap(why, 68)) console.log(`       ${line}`);
      }
      console.log('');
    }
  }

  for (const [label, list, values] of [
    ['Internal runtime  (config/config.local.js)', RUNTIME_ENDPOINTS, runtimeValues],
    ['Public portal     (document-portal/config.local.js)', PORTAL_ENDPOINTS, portalValues],
  ]) {
    const set = list.filter(e => values[e.key]);
    const pilotUnset = list.filter(e => e.pilot && !values[e.key]);
    /* "Wired" counts non-empty values, and since `npm run values:template` began emitting every
       URL complete but for its signature, a non-empty value is no longer the same thing as a
       usable endpoint. A template that was generated and never signed reports 18/18 and calls
       nothing. Two later gates catch it — `check:values` before this runs, `check:config` after
       — but a success line that overstates by a whole category is the failure this codebase has
       corrected repeatedly, so it is counted here rather than left to them. */
    const unsigned = set.filter(e => /[?&]sig=(?:$|&)/.test(String(values[e.key])));
    console.log(`  ${label}`);
    console.log(`    ${set.length}/${list.length} endpoints wired`
      + (unsigned.length ? `  —  ${unsigned.length} carry NO SIGNATURE and will not authenticate` : ''));
    if (unsigned.length) {
      console.log(`      the URL is complete but nothing follows "sig=": ${unsigned.map(e => e.key).join(', ')}`);
      console.log(`      npm run values:sign -- <values file> <KEY>   # once per key`);
    }
    if (pilotUnset.length) {
      console.log(`    ${pilotUnset.length} of the minimal-pilot set still unwired:`);
      for (const e of pilotUnset) console.log(`      ·  ${pad(e.key, 24)} ${e.note}`);
    }
    console.log('');
  }

  if (Object.keys(authValues).length) {
    console.log('  Authentication');
    for (const [k, v] of Object.entries(authValues)) {
      console.log(`    ·  ${pad(k, 24)} ${k === 'enabled' ? v : '(supplied)'}`);
    }
    if (authValues.enabled === true) {
      console.log('    ⚠  Client half only. Each flow must still validate the token itself.');
    }
    console.log('');
  }

  for (const r of results) {
    if (r.written) console.log(`  ✅ wrote ${r.relPath}`);
    else console.log(`  ·  ${r.relPath} already exists — left untouched (pass --force to replace)`);
  }

  console.log('');
}

const anyWired =
  Object.values(runtimeValues).some(Boolean) || Object.values(portalValues).some(Boolean);

/* ------------------------------------------------------------------ *
 * Refuse to exit 0 having discarded values the caller supplied.
 *
 * `--recover` is exempt: `npm run recover` already passes --force, and a bare
 * `--recover` is a query about what the corpus holds, not an instruction to write.
 * What is not exempt is an explicit value — a --values file or a DGO_/PF_ environment
 * variable — landing nowhere because the target already existed.
 * ------------------------------------------------------------------ */

const suppliedExplicit =
  Object.keys(FILE_VALUES).length > 0 ||
  [...RUNTIME_ENDPOINTS.map(e => ['DGO_ENDPOINT_' + e.key, 'DGO_' + e.key, e.key]),
   ...PORTAL_ENDPOINTS.map(e => ['PF_ENDPOINT_' + e.key, 'PF_' + e.key, e.key])]
    .flat().some(n => process.env[n]);

const skipped = results.filter(r => !r.written);

if (suppliedExplicit && skipped.length) {
  console.error(
    `\n  ✖  Values were supplied, but ${skipped.length === results.length ? 'neither file was' : 'one file was not'} written.\n\n` +
    skipped.map(r => `       ${r.relPath} already exists\n`).join('') +
    `\n  setup does not overwrite an existing config.local.js without --force, so every\n` +
    `  value you passed was discarded. Re-run with --force:\n\n` +
    `      npm run setup --${VALUES_FILE ? ` --values ${VALUES_FILE}` : ''} --force\n\n` +
    `  --force rewrites the whole file from what you supply, so a key absent from your\n` +
    `  values is written empty rather than carried over. Generate a complete file with\n` +
    `  npm run values:template — it emits all 25 keys with their URLs already filled in.\n`);
  process.exit(2);
}

if (!QUIET) {
  if (!anyWired) {
    console.log('  No endpoint URLs were supplied, so both files were scaffolded empty.');
    console.log('  The platform will boot and run in DEMO MODE — nothing is transmitted.');
    console.log('  That is the correct state for a fresh clone or a Codespace.\n');
    console.log('  To wire real endpoints, follow docs/deployment/MINIMAL-PILOT.md and then:');
    console.log('    npm run setup -- --values ~/dgo-values.txt --force\n');
  } else {
    console.log('  Next:  npm run commission     # readiness gate for live usage');
    console.log('         npm start             # serve on http://localhost:8080\n');
  }
}

process.exit(0);
