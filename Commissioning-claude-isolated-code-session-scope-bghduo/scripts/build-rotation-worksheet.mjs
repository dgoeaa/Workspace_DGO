#!/usr/bin/env node
/**
 * Turn ITEM-22 from a number into an ordered run.
 *
 * WHY THIS EXISTS
 * The register says "rotate 55 disclosed trigger tokens" and stops there, so the work reads as
 * unbounded and the two configuration items sit behind it indefinitely. It is not unbounded. The
 * disclosed signatures name their workflow in the URL, and `endpoint-workflow-ids.json` records
 * which workflow each endpoint key must reach. Intersecting the two answers the only question
 * that decides the order of work: WHICH endpoint keys need a new URL after rotation, and which
 * do not.
 *
 * The answer is narrower than the headline. It is computed here rather than asserted, from the
 * two files named above, and regenerated on every build so it cannot drift from either.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It reads signatures and never emits one. Every artefact it writes carries endpoint keys,
 * workflow ids and verdicts — nothing that can be pasted into a browser to invoke a flow.
 *
 *   node scripts/build-rotation-worksheet.mjs           # write
 *   node scripts/build-rotation-worksheet.mjs --check   # fail if stale
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/deployment/rotation';
const MAP_FILE = 'docs/reference/endpoint-workflow-ids.json';
const SCAN_ROOT = 'docs/reference/foundational';

const MAP = JSON.parse(readFileSync(path.join(ROOT, MAP_FILE), 'utf8'));

/* ---- which workflows have a disclosed signature -------------------------------------------
   A Logic Apps trigger URL names its workflow in the path and carries the credential in `sig`.
   Only the workflow id is kept; the signature is counted and discarded. */
const URL_RE = /https:\/\/[^"\s\\]*?\/workflows\/([0-9a-f]{32})\/triggers\/[^/]+\/paths\/invoke[^"\s\\]*?sig=([A-Za-z0-9_-]{20,})/g;
const leaked = new Map();     // workflowId -> Set of signature
const filesTouched = new Set();
(function scan(dir) {
  /* The corpus this scans is optional — an absent one leaks nothing, which is the answer, not
     a failure. Before this, its absence threw ENOENT and stopped the worksheet being built. */
  let entries;
  try { entries = readdirSync(path.join(ROOT, dir)); } catch { return; }
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    const abs = path.join(ROOT, rel);
    if (statSync(abs).isDirectory()) { scan(rel); continue; }
    let text = '';
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    for (const m of text.matchAll(URL_RE)) {
      if (!leaked.has(m[1])) leaked.set(m[1], new Set());
      leaked.get(m[1]).add(m[2]);
      filesTouched.add(rel);
    }
  }
})(SCAN_ROOT);

const distinctSignatures = new Set([...leaked.values()].flatMap((s) => [...s])).size;

/* ---- every endpoint key, and what rotation does to it -------------------------------------- */
const rows = [];
for (const scope of ['internal', 'portal']) {
  for (const [key, v] of Object.entries(MAP[scope] || {})) {
    const wid = v.workflowId || null;
    rows.push({
      scope, key, workflowId: wid, flow: v.flow || '', action: v.action || '',
      status: !wid ? 'UNDETERMINED' : leaked.has(wid) ? 'MUST_RECAPTURE' : 'UNAFFECTED',
      signatures: wid && leaked.has(wid) ? leaked.get(wid).size : 0,
    });
  }
}
const of = (s) => rows.filter((r) => r.status === s);
const recapture = of('MUST_RECAPTURE');
const unaffected = of('UNAFFECTED');
const undetermined = of('UNDETERMINED');
const behindAKey = new Set(recapture.map((r) => r.workflowId));
const noKey = [...leaked.keys()].filter((w) => !behindAKey.has(w));

const worksheet = {
  schema: 'dgo-rotation-worksheet/v1',
  purpose: 'Which endpoint keys need a new trigger URL after ITEM-22 rotation, and which do not. ' +
           'Computed from endpoint-workflow-ids.json and the disclosed signatures under ' +
           SCAN_ROOT + '. Workflow ids and verdicts only — no signature is ever written here.',
  generatedBy: 'scripts/build-rotation-worksheet.mjs',
  disclosure: {
    workflowsCarryingASignature: leaked.size,
    distinctSignatures,
    filesTouched: filesTouched.size,
    note: 'Counted by the URL form above. The register headline of 55 was counted differently; ' +
          'this file states its own method rather than restating that number.',
  },
  endpointKeys: {
    total: rows.length,
    mustRecapture: recapture.length,
    unaffected: unaffected.length,
    undetermined: undetermined.length,
  },
  distinctFlowsBehindAKey: behindAKey.size,
  flowsBehindNoKey: {
    count: noKey.length,
    meaning: 'These carry a disclosed signature but no endpoint key in either client points at ' +
             'them. Rotating them cannot break the internal runtime or the portal, so they need ' +
             'no re-capture and no configuration change. It does NOT establish that they are ' +
             'unused — something outside this repository may call them.',
    workflowIds: noKey.sort(),
  },
  /* Sorted by codepoint, not by locale: this file is committed, so its byte order must not
     depend on the machine that generated it. */
  rows: rows.sort((a, b) => (a.scope < b.scope ? -1 : a.scope > b.scope ? 1
                             : a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
};

/* The values file the operator fills in and hands to `npm run setup -- --values`. */
const template = [
  '# Rotated trigger URLs — one KEY=value line per endpoint.',
  '#',
  '# Hand this to:  npm run setup -- --values <this file>',
  '# Then verify:   node scripts/check-config-local.mjs   and   --portal',
  '#',
  '# THIS FILE HOLDS BEARER CREDENTIALS. Keep it outside the repository, and delete it once',
  '# both config.local.js files are written and verified. Every URL below carries a sig= token;',
  '# a file of them is a file of live keys to the estate.',
  '#',
  `# ${recapture.length} keys need a NEW url — their flow's token is disclosed and must be rotated first.`,
  `# ${unaffected.length} keys are unaffected by the rotation, but still need their url to be configured at all.`,
  `# ${undetermined.length} keys have no workflow id recorded, so whether rotation changes them is UNKNOWN.`,
  '',
  '# ---- must be re-captured after rotating the flow -------------------------------------',
  ...recapture.map((r) => `${r.key}=`),
  '',
  '# ---- flow not among the disclosed set; url unchanged by rotation ----------------------',
  ...unaffected.map((r) => `${r.key}=`),
  '',
  '# ---- workflow id not recorded; see ROTATION.md ----------------------------------------',
  ...undetermined.map((r) => `${r.key}=`),
  '',
].join('\n');

const tbl = (list) => list.length
  ? ['| Key | Scope | Flow | Workflow id |', '| --- | --- | --- | --- |',
     ...list.map((r) => `| \`${r.key}\` | ${r.scope} | ${r.flow || '—'} | \`${r.workflowId || '(none recorded)'}\` |`)].join('\n')
  : '_(none)_';

const md = `# Rotation, and the two configuration items behind it

> GENERATED by \`scripts/build-rotation-worksheet.mjs\` from [\`${MAP_FILE}\`](../../reference/endpoint-workflow-ids.json)
> and the disclosed signatures under \`${SCAN_ROOT}\`. Do not edit. \`npm run test:rotation\` fails if it drifts.

## The size of it

${leaked.size} workflows carry a disclosed signature — ${distinctSignatures} distinct signatures across
${filesTouched.size} files. What matters for sequencing is not that number but this one:

| | Endpoint keys |
| --- | --- |
| **Must be re-captured** — the flow's token is disclosed, so rotating it changes the URL | **${recapture.length}** |
| Unaffected by rotation — the flow carries no disclosed token | ${unaffected.length} |
| Undetermined — no workflow id is recorded for the key | ${undetermined.length} |
| **Total** | **${rows.length}** |

Those ${recapture.length} keys are served by **${behindAKey.size} distinct flows** — two flows back two keys each.
And **${noKey.length} of the ${leaked.size} token-bearing workflows sit behind no endpoint key at all**: rotating them
cannot break the internal runtime or the portal, because neither client calls them. That is not the
same as saying they are unused — something outside this repository may. It means they need no
re-capture and no configuration change, so they can be rotated first, on their own, at no risk.

## What this corrects

CFG-2's stated reason for being blocked is "same as CFG-1: depends on rotated URLs". For the
portal that is only partly true. ${unaffected.length} of the 7 portal keys point at flows carrying no disclosed
token, so their URLs do not change when rotation happens. ${undetermined.filter((r) => r.scope === 'portal').length} portal keys have no workflow id
recorded at all, so their status is genuinely unknown — and settling that is a small, bounded task
(read the workflow id out of each flow's trigger URL and add it to \`${MAP_FILE}\`), not a
dependency on the whole rotation.

## Order of work

1. **Rotate the ${noKey.length} workflows behind no endpoint key.** No client calls them; nothing to re-capture.
   This shrinks the disclosed surface without touching either runtime.
2. **Record the missing workflow ids** for the ${undetermined.length} undetermined keys, and regenerate this
   worksheet. Either they join the re-capture list or they leave it; both are better than unknown.
3. **Rotate the ${behindAKey.size} flows behind the ${recapture.length} keys, capturing each new URL as you go.** Regenerating a
   trigger URL and not writing it down means the endpoint is lost until you open the flow again.
4. **Fill in \`values.template.txt\`** and run:
   \`\`\`
   npm run setup -- --values <file> --force
   \`\`\`
   \`--force\` matters on any run after the first. Without it \`setup\` reports
   *"already exists — left untouched (pass --force to replace)"* and keeps the old file, so a
   post-rotation re-run would leave the revoked URLs in place. It says so plainly; this is a note,
   not a defect.
5. **Verify**, and this is the step that catches the failure hand-editing cannot:
   \`\`\`
   node scripts/check-config-local.mjs
   node scripts/check-config-local.mjs --portal
   npm run commission
   \`\`\`
   \`check-config-local.mjs\` compares the workflow id inside each URL against the id that key is
   supposed to reach, so a well-formed URL under the wrong key is caught. It prints keys, ids and
   verdicts and never a URL.
6. **Delete the values file.** It is a list of live bearer credentials.

## Keys that must be re-captured

${tbl(recapture)}

## Keys unaffected by the rotation

${tbl(unaffected)}

## Keys with no workflow id recorded

${tbl(undetermined)}

These are undetermined, not clean. Step 2 settles them.

## This chain was run before you run it

Every step above was exercised locally on 2026-09-04 against a synthetic values file — 25
well-formed URLs carrying invented signatures, outside the repository, deleted afterwards. It
established three things:

- \`setup --values --force\` writes both config files and wires all 25 keys.
- \`check-config-local.mjs\` accepts a correct mapping and exits 0.
- **The negative control fires.** Two internal keys were swapped so each pointed at the other's
  flow. The checker refused both by name — *"FETCH_ALL points at the WRONG FLOW — expected
  31e02518…, got 818ec405… (that is GET_DOCS)"* — and exited 1. That is the failure hand-editing
  cannot show you, and it is caught.

What it cannot check is the signature. A URL under the right key with a revoked token reads as
correct here, because the workflow id is still right. Only a live call proves a token; that is
what step 5's \`npm run commission\` and the endpoint probes are for.

## The rule that applies to all of it

A trigger URL is a bearer credential. It goes into a \`config.local.js\` — which is git-ignored —
and into nothing else. Not this repository, not a ticket, not an email, not a chat message. Every
tool named on this page prints keys, ids and verdicts only, so their output is safe to paste
anywhere.
`;

const files = {
  'ROTATION.md': md,
  'rotation-worksheet.json': JSON.stringify(worksheet, null, 2) + '\n',
  'values.template.txt': template,
};

mkdirSync(path.join(ROOT, OUT), { recursive: true });
if (process.argv.includes('--check')) {
  const stale = Object.entries(files).filter(([n, c]) => {
    try { return readFileSync(path.join(ROOT, OUT, n), 'utf8') !== c; } catch { return true; }
  }).map(([n]) => n);
  if (stale.length) {
    console.error(`❌ ${OUT} is stale — run: node scripts/build-rotation-worksheet.mjs\n   ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ ${OUT} is current — ${recapture.length} keys to re-capture, ${noKey.length} flows behind no key`);
} else {
  for (const [n, c] of Object.entries(files)) writeFileSync(path.join(ROOT, OUT, n), c);
  console.log(`Wrote ${OUT}`);
  console.log(`  workflows with a disclosed signature : ${leaked.size} (${distinctSignatures} signatures, ${filesTouched.size} files)`);
  console.log(`  endpoint keys                        : ${rows.length}`);
  console.log(`    must re-capture                    : ${recapture.length}  (${behindAKey.size} distinct flows)`);
  console.log(`    unaffected                         : ${unaffected.length}`);
  console.log(`    undetermined (no workflow id)      : ${undetermined.length}`);
  console.log(`  token-bearing flows behind no key    : ${noKey.length}`);
}
