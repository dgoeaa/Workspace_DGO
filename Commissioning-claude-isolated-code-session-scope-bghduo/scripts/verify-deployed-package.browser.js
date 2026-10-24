/*
 * IS THE SITE THAT IS SERVING RIGHT NOW THE PACKAGE THAT WAS BUILT?
 *
 * WHY THIS EXISTS
 *   A package left this repository complete, verified against its own manifest, and arrived at
 *   the host with 67 files missing. `core/` was absent entirely — boot.js included — and the
 *   platform showed a spinner for fifteen seconds and then a failure screen. Nothing in the
 *   upload reported an error. The file manager said it had finished.
 *
 *   That is not a property of one host. Every transfer that moves files one at a time can drop
 *   one silently, and the only way to know is to ask the SERVER what it has, not the tool that
 *   put it there. `npm run package:verify` checks the folder on the machine that built it, which
 *   is the wrong end of the wire.
 *
 *   PACKAGE_MANIFEST.json already carries every file, its byte length and its SHA-256. This
 *   fetches each one from the live origin and recomputes the hash in the browser. A file that is
 *   missing, truncated, mangled by the host, or served as an HTML error page fails on the hash
 *   before anyone has to notice a blank screen.
 *
 * HOW TO RUN IT
 *   Open the deployed site. Open the browser console. Paste this whole file. That is all — it
 *   takes no arguments and needs nothing installed.
 *
 * WHAT IT NEVER DOES
 *   It reads config/config.local.js like any other file and hashes the bytes, but it neither
 *   prints nor parses them. No trigger URL and no signature reaches the console, so the output
 *   is safe to paste into a ticket or a chat.
 *
 * REQUIRES HTTPS. crypto.subtle is unavailable on plain http:// origins, and a platform holding
 * signed trigger URLs has no business on one anyway — the check says so rather than degrading
 * quietly to a size comparison.
 */
(async () => {
  const t0 = Date.now();
  const say = (s) => console.log(s);

  if (!self.crypto?.subtle) {
    say('✗ crypto.subtle is unavailable — serve this site over HTTPS and run it again.');
    return;
  }

  let manifest;
  try {
    const r = await fetch('PACKAGE_MANIFEST.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    /* A host that answers a missing file with its own error page returns HTML and a JSON parse
       error four characters in. Say which of the two happened, because they mean different
       things: the manifest absent means the upload never completed, HTML in its place means the
       host rewrites 404s and every missing module will look like a syntax error. */
    if (text.trimStart().startsWith('<')) {
      say('✗ PACKAGE_MANIFEST.json came back as HTML, not JSON.');
      say('  The host is answering a missing file with an error page. The manifest is not deployed.');
      return;
    }
    manifest = JSON.parse(text);
  } catch (e) {
    say(`✗ PACKAGE_MANIFEST.json could not be read — ${e.message}`);
    say('  It sits beside index.html in every package. If it is not here, neither is the rest.');
    return;
  }

  const files = manifest.files || [];
  say(`${manifest.package || 'package'} · build ${manifest.buildId || '?'} · ${files.length} files on record`);
  say(`origin ${location.origin}`);

  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const problems = [];
  let checked = 0;

  for (const f of files) {
    if (f.path === 'PACKAGE_MANIFEST.json') continue;
    try {
      const r = await fetch(f.path, { cache: 'no-store' });
      if (!r.ok) { problems.push([`HTTP ${r.status}`, f.path]); continue; }
      const buf = await r.arrayBuffer();
      if (buf.byteLength !== f.bytes) {
        problems.push([`${buf.byteLength}b, expected ${f.bytes}b`, f.path]);
        continue;
      }
      const digest = hex(await crypto.subtle.digest('SHA-256', buf));
      if (digest !== f.sha256) problems.push(['content differs from the build', f.path]);
      checked++;
    } catch (e) {
      problems.push([`fetch failed: ${e.message}`, f.path]);
    }
  }

  say('');
  if (!problems.length) {
    say(`✅ ${checked} files, every one byte-identical to the build. This host is serving the package.`);
  } else {
    say(`❌ ${problems.length} problem(s) across ${files.length} files — ${checked} verified clean`);
    for (const [what, path] of problems.slice(0, 60)) say(`   ${what.padEnd(34)} ${path}`);
    if (problems.length > 60) say(`   … and ${problems.length - 60} more`);
    say('');
    say('   Re-upload the package as one archive and extract it server-side. A transfer that');
    say('   moves files individually is what produces this, and it will drop different ones next');
    say('   time. Then run this again.');
  }

  /* The second thing that breaks a move between hosts, and it is invisible from here.
     Every flow answers with Access-Control-Allow-Origin taken from the Flow Configuration list —
     the rows whose Title starts with ALLOWED_ORIGIN — and echoes the caller's Origin only when it
     is one of them. A correct deployment on a new origin therefore still fails every call until
     that row exists. It is one row of data, no provisioning and no code, and it is the single
     thing a host move needs beyond the files. */
  say('');
  say(`If this origin is new, add it to the Flow Configuration list before expecting any endpoint`);
  say(`to answer — a row whose Title starts with ALLOWED_ORIGIN and whose ConfigValue is exactly:`);
  say(`   ${location.origin}`);
  say(`Without it the flows return another site's origin in Access-Control-Allow-Origin and the`);
  say(`browser discards every response. The platform looks broken and the flows look fine.`);
  say('');
  say(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
})();
