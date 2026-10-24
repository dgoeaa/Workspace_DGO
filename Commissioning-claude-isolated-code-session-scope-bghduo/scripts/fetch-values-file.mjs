#!/usr/bin/env node
/**
 * Fetch the values file from the harvester flow, without the trigger URL ever touching a
 * command line, a shell history, or the screen.
 *
 *   npm run fetch:values                       # take the URL from the clipboard
 *   npm run fetch:values -- --stdin            # read it from stdin instead
 *   npm run fetch:values -- --out ~/other.txt
 *
 * WHY THIS EXISTS, AND IT IS NOT CONVENIENCE
 *   The documented sequence was a block of shell to paste into Termux, ending in a curl that
 *   read the URL from the clipboard. On a phone that is circular: the clipboard is also how the
 *   COMMANDS get into the terminal. Run as written, it pasted the instructions over the URL and
 *   then posted the instructions to nothing — curl reported `empty string within braces`, which
 *   explains nothing to anyone.
 *
 *   A length check was supposed to catch that and did not: the command block was 308 characters,
 *   inside the range quoted for a real trigger URL. Length is not a shape. What distinguishes a
 *   signed invoke URL from a paragraph of shell is that it is ONE LINE, starts https://, ends in
 *   a trigger path, and carries a signature — so those are what is checked.
 *
 *   Typing `npm run fetch:values` is eight words and leaves the clipboard holding exactly one
 *   thing: the URL.
 *
 * NOTHING HERE PRINTS THE URL. Not on success, not on failure. The one exception is a value that
 * does not begin with https:// at all — that is definitionally not a signed URL, so a short
 * prefix is shown to say what arrived instead. It is how you learn the clipboard held your own
 * instructions.
 *
 * THE FILE IT WRITES IS A CREDENTIAL — 25 of them. It is created 0600 by mode, not by umask, so
 * it is right even if the shell's umask is not.
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const expand = (p) => path.resolve(String(p).replace(/^~(?=$|[/\\])/, os.homedir()));

/**
 * Is this a Power Automate trigger URL, or is it something else that happened to be on the
 * clipboard? Returns { ok } or { ok: false, why: [...], shown }.
 *
 * `shown` is populated ONLY when the value is not a URL at all, and is the one thing here that
 * echoes any of the input.
 */
export function validateTriggerUrl(raw) {
  const why = [];
  const value = String(raw ?? '');
  const trimmed = value.trim();

  if (!trimmed) return { ok: false, why: ['nothing was on the clipboard'], shown: null };

  /* The failure that prompted this file. A shell block is multi-line; a URL never is. */
  if (/[\r\n]/.test(trimmed)) {
    why.push('it spans several lines, so it is not a URL');
    if (/termux-clipboard-get|npm run|curl /.test(trimmed)) {
      why.push('it looks like the command block itself — copy the flow\'s HTTP POST URL, then run this again');
    }
  }
  if (!/^https:\/\//i.test(trimmed)) why.push('it does not start with https://');
  if (/\s/.test(trimmed)) why.push('it contains whitespace');

  let u = null;
  if (!why.length) {
    try { u = new URL(trimmed); } catch { why.push('it does not parse as a URL'); }
  }
  if (u) {
    if (!/\/triggers\//i.test(u.pathname)) why.push('its path names no trigger');
    if (!/\/paths\/invoke$/i.test(u.pathname)) why.push('its path does not end in /paths/invoke');
    const sig = u.searchParams.get('sig');
    if (!sig) why.push('it carries no signature, so it is not a credential and cannot authenticate');
    else if (sig.length < 20) why.push(`its signature is ${sig.length} characters, which is too short to be one`);
  }

  /* Shown only when it is not a URL at all — nothing sensitive can be in a value that fails
     the https:// test, and seeing the first words of it is how the operator diagnoses this. */
  const shown = /^https:\/\//i.test(trimmed) ? null : trimmed.replace(/\s+/g, ' ').slice(0, 48);
  return why.length ? { ok: false, why, shown, length: trimmed.length } : { ok: true, url: trimmed };
}

function fromClipboard() {
  try { return execFileSync('termux-clipboard-get', { encoding: 'utf8' }); }
  catch { return null; }
}
function fromStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return null; }
}

/**
 * The build stamped into the scope on disk. A flow answering with a different one is running a
 * scope pasted before the last change — which is invisible from the output, because an older
 * scope answers exactly as it did before.
 */
export function expectedScopeBuild() {
  try {
    const paste = JSON.parse(readFileSync(path.join(
      path.dirname(fileURLToPath(import.meta.url)), '..',
      'docs/deployment/power-automate-flows/harvester/Scope_Endpoint_Values_Delivery.designer-paste.json'), 'utf8'));
    return paste.serializedValue.actions.Condition_Endpoint_Values_Complete
      .else.actions.Response_Endpoint_Values_Incomplete.inputs.body.scopeBuild || null;
  } catch { return null; }
}

export function reportStaleScope(answered) {
  const want = expectedScopeBuild();
  if (!want || !answered || want === answered) return false;
  console.error('');
  console.error('  ⚠  THE FLOW IS RUNNING AN OLDER SCOPE.');
  console.error(`     it answered with build ${answered}; this repository holds ${want}.`);
  console.error('     `git pull` updates the file on disk and does not touch the tenant, so the');
  console.error('     flow keeps whatever was pasted into it — and answers exactly as it did');
  console.error('     before, which reads as the change having done nothing.');
  console.error('');
  console.error('     In the designer: delete the Scope_DGO_Endpoint_Values_Delivery action, then');
  console.error('     paste the current one and save. Everything below is the OLD scope talking.');
  console.error('');
  return true;
}

async function main() {
  const out = expand(opt('--out', '~/dgo-values.txt'));
  const raw = argv.includes('--stdin') ? fromStdin() : fromClipboard();

  if (raw === null) {
    console.error('Could not read the clipboard. termux-clipboard-get is part of termux-api:');
    console.error('  pkg install termux-api        (and install the Termux:API app)');
    console.error('Or pipe the URL in:  npm run fetch:values -- --stdin');
    process.exit(2);
  }

  const check = validateTriggerUrl(raw);
  if (!check.ok) {
    console.error('That is not a flow trigger URL.');
    for (const w of check.why) console.error('  · ' + w);
    if (check.shown) console.error(`\n  what arrived (${check.length} chars): ${check.shown}…`);
    console.error('\nCopy the HTTP POST URL from the flow\'s trigger card, then run this again.');
    console.error('Nothing was written and nothing was sent.');
    process.exit(2);
  }

  if (existsSync(out)) {
    console.error(`${out} already exists. Move or shred it first — this will not overwrite a values file.`);
    process.exit(2);
  }

  let res;
  try {
    res = await fetch(check.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    console.error(`The request got no answer at all: ${err && err.message}`);
    console.error('That is the network, not Power Automate. Nothing was written.');
    process.exit(1);
  }

  const body = await res.text();

  if (res.status === 409) {
    let answered = null;
    try { answered = JSON.parse(body).scopeBuild || null; } catch { /* an older scope carries none */ }
    const stale = reportStaleScope(answered);
    if (!stale && answered === null && expectedScopeBuild()) {
      console.error('');
      console.error('  ⚠  THE FLOW IS RUNNING A SCOPE FROM BEFORE BUILDS WERE STAMPED.');
      console.error('     Re-paste Scope_DGO_Endpoint_Values_Delivery before reading anything below.');
      console.error('');
    }
    console.error('The harvest ran and did not resolve every key, so it returned nothing.');
    console.error('No URL is in the response below — it is safe to read and safe to share.\n');
    console.error(body.slice(0, 4000));
    process.exit(1);
  }
  if (res.status === 202) {
    console.error('202 Accepted: the run started but did not reach its Response inside the');
    console.error('120-second synchronous window, so the body is lost. Do NOT read the values out');
    console.error('of the run history — ask for the batched variant instead. Nothing was written.');
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`The flow answered ${res.status}. Nothing was written.`);
    if (res.status === 401 || res.status === 403) {
      console.error('That is the trigger refusing the call: check "Who can trigger the flow" is');
      console.error('Anyone, and that the flow is turned on.');
    }
    process.exit(1);
  }

  const stamped = /^#\s*Scope build:\s*([0-9a-f]{12})\s*$/m.exec(body);
  reportStaleScope(stamped ? stamped[1] : null);

  const keys = body.split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l.trim())).length;
  if (!keys) {
    console.error('The flow answered 200 but the body carries no KEY=URL lines. Nothing was written.');
    process.exit(1);
  }

  /* 0600 by mode, not by umask: the file is 25 credentials and must not depend on the shell. */
  writeFileSync(out, body, { mode: 0o600 });
  console.log(`Wrote ${out} — ${keys} key(s), ${body.length} bytes, mode 0600.`);
  console.log('Nothing above is a credential. Next:');
  console.log(`  npm run check:values -- ${opt('--out', '~/dgo-values.txt')}`);
  console.log('  …then DELETE the harvester flow.');
}

/* pathToFileURL, not a hand-built file:// string: a Windows argv[1] never matches the latter. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
