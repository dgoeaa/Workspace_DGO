#!/usr/bin/env node
/**
 * Emit the browser equivalent of GOVERNANCE-TENANT-RUNBOOK.md Step 3 — retire the duplicate list
 * instances without PowerShell.
 *
 * WHY A DIFFERENT SHAPE FROM THE OTHER BROWSER SCRIPTS
 *
 * Every other script in this set is idempotent and additive: worst case it creates a column that
 * was already there. This one deletes whole lists, and two of the duplicates carry items. A
 * DRY_RUN boolean is not enough protection for that, because the only thing standing between a
 * dry run and seventeen deleted lists is one word an operator edits at 2am.
 *
 * So this is MODE-driven and the modes are ordered. Each refuses to run unless the one before it
 * has visibly happened in the tenant:
 *
 *   survey   read-only. What exists, how many items, what state.
 *   export   downloads every item of every list as JSON. The backup.
 *   rename   Title becomes ZZ_RETIRED_<title>. Fully reversible, and the soak period.
 *   delete   only lists ALREADY renamed, and only with a second explicit acknowledgement.
 *   restore  strips the prefix. The rollback for rename.
 *
 * `delete` cannot act on a list that `rename` has not touched, so a rename it did not do is a
 * rename that did not happen — which makes the reversible step unskippable. That is the whole
 * design: the irreversible action is reachable only through a reversible one.
 *
 * THE OTHER HALF IS THE KEEP SET
 *
 * The seventeen duplicates share their titles with the ten authoritative lists — that is what
 * makes them duplicates. A retirement script that addressed lists by title would eventually be
 * pointed at the wrong site and delete the estate. Everything here is a GUID, and the emitted
 * script asserts at runtime that no GUID it is about to touch appears in the keep set, refusing
 * to start if one does.
 *
 *   npm run governance:retirement
 *   npm run governance:retirement -- --check
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relayBlock } from './lib/browser-relay.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = path.join(ROOT, 'docs/reference/governance-list-registry.json');
const OUT = path.join(ROOT, 'scripts/retire-duplicate-governance-lists.browser.js');
const CHECK = process.argv.includes('--check');

const fail = (msg) => { console.error(`\n  ✖  ${msg}\n`); process.exit(2); };

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const AUTHORITATIVE = registry.decision.authoritativeSite;
const ORIGIN = AUTHORITATIVE.split('/sites/')[0];

const sites = [...new Set(registry.retire.map((r) => r.site))];
if (sites.length !== 1) fail(`the duplicates span ${sites.length} sites; this script assumes one`);
const DUPLICATE_SITE = `${ORIGIN}/sites/${sites[0]}`;

if (DUPLICATE_SITE === AUTHORITATIVE) {
  fail('the duplicate site and the authoritative site are the same — refusing to emit a retirement script');
}

const keep = registry.lists.map((l) => ({ title: l.listTitle, guid: l.listGuid }));
const retire = registry.retire
  .map((r) => ({ title: r.listTitle, guid: r.listGuid, supersededBy: r.supersededBy }))
  .sort((a, b) => (a.title + a.guid < b.title + b.guid ? -1 : 1));

/* The generator makes the same check the emitted script makes at runtime. If they can ever
   disagree, one of them is wrong; if the registry is malformed, nothing is emitted at all. */
const keepGuids = new Set(keep.map((k) => k.guid));
const overlap = retire.filter((r) => keepGuids.has(r.guid));
if (overlap.length) {
  fail(`${overlap.length} GUID(s) are in BOTH the keep and retire sets: ${overlap.map((o) => `${o.title} ${o.guid}`).join(', ')}`);
}
if (!retire.length) fail('the registry names no duplicates to retire');

const emitted = `/* GENERATED FILE — do not edit by hand.
 * Built from docs/reference/governance-list-registry.json by
 * scripts/build-governance-retirement.mjs. Edit the registry and re-run.
 */
/*
 * GOVERNANCE-TENANT-RUNBOOK.md Step 3, from the browser console. No PowerShell, no PnP, no install.
 *
 * Retire the ${retire.length} duplicate governance list instances on
 *   ${DUPLICATE_SITE}
 * leaving the ${keep.length} authoritative instances on
 *   ${AUTHORITATIVE}
 * completely untouched.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * THIS SCRIPT DELETES WHOLE LISTS. Read this section before the first paste.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * It is MODE-driven, not DRY_RUN-driven, because a single boolean is not enough protection
 * when the mistake is unrecoverable. The modes are ORDERED, and each refuses to act unless the
 * previous one has visibly happened in the tenant:
 *
 *   'survey'   READ-ONLY. What exists, how many items each holds, what state it is in.
 *   'export'   Downloads every item of every list as JSON. This is your backup.
 *   'rename'   Title becomes ZZ_RETIRED_<title>. Fully reversible. This is the soak period.
 *   'delete'   ONLY lists already renamed, and only with I_HAVE_THE_EXPORT set to true.
 *   'restore'  Strips the prefix. The rollback for 'rename'.
 *
 * 'delete' cannot touch a list that 'rename' has not already renamed. A rename you did not do
 * is a rename that did not happen, so the reversible step cannot be skipped: the irreversible
 * action is reachable only through it.
 *
 * WAIT BETWEEN RENAME AND DELETE. The rename is what surfaces a consumer nobody documented —
 * a flow, a view, a Power BI query that silently reads one of these. Give it long enough for
 * something to break loudly while the fix is still one rename away. Days, not minutes.
 *
 * WHAT IT WILL NOT DO
 *   It never touches the ${keep.length} authoritative lists. Their GUIDs are listed below and
 *   checked against every target before anything runs; if any target appears in that set the
 *   script refuses to start at all.
 *   It never addresses a list by title. The duplicates share their titles with the lists being
 *   kept — that is what makes them duplicates — so a title-addressed retirement would
 *   eventually delete the estate.
 *   It never deletes a list that is not already prefixed ZZ_RETIRED_.
 *   It never touches a list not named below.
 *
 * HOW TO RUN
 *   1. Sign in and open any page on
 *      ${DUPLICATE_SITE}
 *      NOTE: this is the DUPLICATE site, not the authoritative one.
 *   2. F12 → Console.
 *   3. Paste this file. It runs 'survey' and changes nothing.
 *   4. Work through the modes in order, editing MODE at the top each time.
 *
 * PERMISSION REQUIRED
 *   Manage Lists on ${sites[0]}. Site Owner is enough.
 */

const MODE = 'survey';          // 'survey' | 'export' | 'rename' | 'delete' | 'restore'
const I_HAVE_THE_EXPORT = false; // must be true for 'delete'. Set it only if you really do.

const SITE = ${JSON.stringify(DUPLICATE_SITE)};
const AUTHORITATIVE_SITE = ${JSON.stringify(AUTHORITATIVE)};
const PREFIX = 'ZZ_RETIRED_';

/** The ${keep.length} lists that must never be touched by this script. */
const KEEP = ${JSON.stringify(keep, null, 2)};

/** The ${retire.length} duplicate instances to retire. */
const RETIRE = ${JSON.stringify(retire, null, 2)};

(async () => {
  const VERBOSE = 'application/json;odata=verbose';
  const NOMETA = 'application/json;odata=nometadata';

  /* ── the guard that runs before anything else ──────────────────────────────────────────
     If a GUID ever appears in both sets, the registry is wrong and every mode below is
     dangerous. Refuse to start rather than skip the offending row: a script that quietly
     drops a target it cannot classify is how a partial retirement gets reported as a whole
     one. */
  const keepGuids = new Set(KEEP.map((k) => k.guid));
  const collide = RETIRE.filter((r) => keepGuids.has(r.guid));
  if (collide.length) {
    console.error(
      '%cREFUSING TO RUN — ' + collide.length + ' target GUID(s) are also in the keep set:\\n'
      + collide.map((c) => '  ' + c.title + '  ' + c.guid).join('\\n')
      + '\\nThe registry is wrong. Fix docs/reference/governance-list-registry.json.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  if (!['survey', 'export', 'rename', 'delete', 'restore'].includes(MODE)) {
    console.error(\`%cUnknown MODE '\${MODE}'. Use survey, export, rename, delete or restore.\`, 'color:#b00;font-weight:bold');
    return;
  }

  /* The backup acknowledgement, enforced BEFORE the loop.
     This check first sat after the delete loop, where it printed 'NOTHING WAS DELETED' having
     just deleted everything — a warning that lies is worse than no warning, because an operator
     who reads it stops looking. A precondition belongs before the thing it is a precondition
     for. */
  if (MODE === 'delete' && !I_HAVE_THE_EXPORT) {
    console.error(
      '%cNOTHING WAS DELETED — I_HAVE_THE_EXPORT is false.\\n\\n'
      + "Set it true only when you actually hold the JSON files from MODE = 'export'. Two of these\\n"
      + 'lists carry items, and a delete is not undoable from here: the site recycle bin is the\\n'
      + 'only other route and it expires.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  /* A paste on the wrong site would address GUIDs that do not exist there and report 17
     failures, which is survivable — but saying so up front costs nothing. */
  if (!location.href.startsWith(SITE)) {
    console.warn(
      \`%cYou are on \${location.origin + location.pathname}, and this script targets\\n  \${SITE}\\n\`
      + 'Every list below lives on that site. Open a page there and paste again.',
      'color:#b60;font-weight:bold',
    );
  }
  if (location.href.startsWith(AUTHORITATIVE_SITE)) {
    console.error(
      '%cSTOP. You are on the AUTHORITATIVE site. This script retires the DUPLICATES, which are\\n'
      + 'on a different site collection. Nothing was done.',
      'color:#b00;font-weight:bold',
    );
    return;
  }

  const send = async (url, init, attempt = 0) => {
    const res = await fetch(url, { credentials: 'include', ...init });
    if ((res.status === 429 || res.status === 503) && attempt < 4) {
      const wait = (Number(res.headers.get('Retry-After')) || 2 ** attempt) * 1000;
      console.warn(\`  throttled, waiting \${wait / 1000}s\`);
      await new Promise((r) => setTimeout(r, wait));
      return send(url, init, attempt + 1);
    }
    return res;
  };

  const detail = async (res) => {
    const text = await res.text();
    let msg = text;
    try {
      const body = JSON.parse(text);
      const err = body['odata.error'] || body.error || body;
      msg = err?.message?.value ?? err?.message ?? err?.Message ?? text;
      if (err?.code) msg = \`\${msg} [\${err.code}]\`;
    } catch { /* keep the raw body */ }
    return \`\${res.status} \${String(msg).trim()}\`;
  };

  const digestFor = async () => {
    const res = await send(\`\${SITE}/_api/contextinfo\`, { method: 'POST', headers: { Accept: VERBOSE } });
    if (!res.ok) throw new Error(\`contextinfo \${res.status} — are you signed in, and a member of this site?\`);
    return (await res.json()).d.GetContextWebInformation.FormDigestValue;
  };

  const readList = async (guid) => {
    const res = await send(
      \`\${SITE}/_api/web/lists(guid'\${guid}')?$select=Title,ItemCount,Created,LastItemModifiedDate,Hidden\`,
      { headers: { Accept: NOMETA } });
    if (!res.ok) throw new Error(await detail(res));
    return res.json();
  };

  const setTitle = async (guid, digest, title) => {
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')\`, {
      method: 'POST',
      headers: {
        Accept: NOMETA, 'Content-Type': NOMETA, 'X-RequestDigest': digest,
        'X-HTTP-Method': 'MERGE', 'IF-MATCH': '*',
      },
      body: JSON.stringify({ Title: title }),
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  const deleteList = async (guid, digest) => {
    const res = await send(\`\${SITE}/_api/web/lists(guid'\${guid}')\`, {
      method: 'POST',
      headers: { Accept: NOMETA, 'X-RequestDigest': digest, 'X-HTTP-Method': 'DELETE', 'IF-MATCH': '*' },
    });
    if (!res.ok) throw new Error(await detail(res));
  };

  /* Every field of every item, so the export is a restore and not a summary. */
  const allItems = async (guid) => {
    const out = [];
    let url = \`\${SITE}/_api/web/lists(guid'\${guid}')/items?$top=500\`;
    while (url) {
      const res = await send(url, { headers: { Accept: NOMETA } });
      if (!res.ok) throw new Error(await detail(res));
      const body = await res.json();
      out.push(...(body.value || []));
      url = body['odata.nextLink'] || null;
    }
    return out;
  };

  const download = (filename, text) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /* ── run ─────────────────────────────────────────────────────────────────────────────── */

  console.log(\`%cSTEP 3 — mode: \${MODE}\`, 'font-weight:bold;font-size:13px');
  console.log(\`%c\${SITE}\`, 'color:#888');
  console.log(\`%c\${RETIRE.length} duplicate(s) targeted · \${KEEP.length} authoritative list(s) excluded by GUID\`, 'color:#888');

  let digest = null;
  if (MODE !== 'survey' && MODE !== 'export') {
    try { digest = await digestFor(); }
    catch (err) { console.error(err.message); return; }
  }

  const ledger = [];
  let acted = 0, skipped = 0, failed = 0;

  for (const t of RETIRE) {
    let live;
    try {
      live = await readList(t.guid);
    } catch (err) {
      /* A 404 here is the expected steady state after a successful delete, and saying so beats
         reporting the finished job as seventeen errors. */
      const gone = /404/.test(err.message);
      ledger.push({
        list: t.title, guid: t.guid,
        action: gone ? 'ALREADY GONE' : 'UNREADABLE',
        items: '', detail: gone ? 'no list with this GUID on this site' : err.message,
      });
      if (!gone) failed++; else skipped++;
      continue;
    }

    const renamed = String(live.Title || '').startsWith(PREFIX);
    const row = { list: t.title, guid: t.guid, liveTitle: live.Title, items: live.ItemCount };

    if (MODE === 'survey') {
      ledger.push({
        ...row,
        action: renamed ? 'renamed, awaiting delete' : 'live',
        lastItemChange: live.LastItemModifiedDate,
        supersededBy: t.supersededBy,
        detail: '',
      });
      continue;
    }

    if (MODE === 'export') {
      try {
        const items = await allItems(t.guid);
        download(
          \`\${t.title}-\${t.guid}.json\`,
          JSON.stringify({
            capturedUtc: new Date().toISOString(),
            site: SITE, listTitle: live.Title, listGuid: t.guid,
            itemCount: items.length, items,
          }, null, 2),
        );
        acted++;
        ledger.push({ ...row, action: 'EXPORTED', detail: \`\${items.length} item(s) downloaded\` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'EXPORT FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'rename') {
      if (renamed) {
        skipped++;
        ledger.push({ ...row, action: 'already renamed', detail: '' });
        continue;
      }
      try {
        await setTitle(t.guid, digest, PREFIX + live.Title);
        acted++;
        ledger.push({ ...row, action: 'RENAMED', detail: \`→ \${PREFIX}\${live.Title}\` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'RENAME FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'restore') {
      if (!renamed) {
        skipped++;
        ledger.push({ ...row, action: 'not renamed', detail: 'nothing to restore' });
        continue;
      }
      try {
        await setTitle(t.guid, digest, String(live.Title).slice(PREFIX.length));
        acted++;
        ledger.push({ ...row, action: 'RESTORED', detail: \`→ \${String(live.Title).slice(PREFIX.length)}\` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'RESTORE FAILED', detail: err.message });
      }
      continue;
    }

    if (MODE === 'delete') {
      /* The rename gate. A list that was never renamed never had its soak period, and this is
         where that is enforced rather than trusted. */
      if (!renamed) {
        skipped++;
        ledger.push({
          ...row, action: 'REFUSED — NOT RENAMED',
          detail: \`'\${live.Title}' does not start with \${PREFIX}. Run MODE='rename' first, wait, then delete.\`,
        });
        continue;
      }
      try {
        await deleteList(t.guid, digest);
        acted++;
        ledger.push({ ...row, action: 'DELETED', detail: \`\${live.ItemCount} item(s) went with it\` });
      } catch (err) {
        failed++;
        ledger.push({ ...row, action: 'DELETE FAILED', detail: err.message });
      }
    }
  }

  console.table(ledger);

  const verb = { survey: 'surveyed', export: 'exported', rename: 'renamed', delete: 'deleted', restore: 'restored' }[MODE];
  console.log(
    \`%c\${MODE === 'survey' ? \`\${ledger.length} list(s) surveyed. Nothing was changed.\` : \`\${acted} \${verb} · \${skipped} skipped · \${failed} failed\`}\`,
    failed ? 'color:#b00;font-weight:bold' : 'font-weight:bold',
  );

  const next = {
    survey: "Next: MODE = 'export' to download a backup of every item.",
    export: "Next: MODE = 'rename'. Then WAIT — days, not minutes — and watch for anything that breaks.",
    rename: "Now WAIT. The rename is what surfaces an undocumented consumer while the fix is still one rename away. "
      + "MODE = 'restore' undoes it. When nothing has broken for long enough, MODE = 'delete' with I_HAVE_THE_EXPORT = true.",
    delete: 'Step 3 is done. Re-paste in survey mode to confirm every row reads ALREADY GONE.',
    restore: "The renames are undone. Nothing has been deleted.",
  }[MODE];
  console.log(\`%c\${next}\`, 'font-weight:bold');
${relayBlock("retire-duplicate-governance-lists.browser.js", "MODE", "SITE")}
})();
`;

/* The delete guard is the reason this file exists; assert it survived the template. */
if (!/I_HAVE_THE_EXPORT/.test(emitted) || !/REFUSED — NOT RENAMED/.test(emitted)) {
  fail('the emitted script lost a delete guard — refusing to write it');
}

const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';

console.log('\nGovernance duplicate-list retirement (Step 3, browser)\n');
console.log(`  duplicates   ${retire.length} on ${DUPLICATE_SITE}`);
console.log(`  protected    ${keep.length} on ${AUTHORITATIVE}`);
console.log('  modes        survey → export → rename → (wait) → delete   ·   restore rolls back the rename\n');

if (CHECK) {
  if (emitted !== previous) fail('the retirement script is stale. Run: npm run governance:retirement');
  console.log('  ✅ the retirement script matches the registry\n');
  process.exit(0);
}

fs.writeFileSync(OUT, emitted);
console.log(`  ✅ wrote ${path.relative(ROOT, OUT)} — ${Math.round(emitted.length / 1024)} KB, survey mode by default\n`);
