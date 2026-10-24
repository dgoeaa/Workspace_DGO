/**
 * The command-line route of the estate orchestrator (Termux, or any machine with Node 18+).
 * The same runtime as the console paste; only the session and the files differ:
 *   session  a device-code sign-in (scripts/lib/device-sign-in.mjs) instead of the browser tab
 *   files    backups, run reports and repoint values are written to --out (default
 *            ./estate-apply-output); the repoint file holds signed URLs and is written 0600
 *
 * Self-contained, because the build embeds it into one file with toString(); everything it needs
 * is passed in `deps`.
 */
export async function estateCliMain(DATA, deps) {
  const { createEstate, deviceSignIn, fs, path, argv, env } = deps;
  const args = argv.slice(2);
  const cmd = args.find((a) => !a.startsWith('--')) || 'plan';
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
  const list = (name) => (opt(name) || '').split(',').map((s) => s.trim()).filter(Boolean);
  const USAGE = [
    'Usage: node estate-apply.cli.mjs <command> [options]',
    '  plan [--only A,B]                     read only: what each package would do (the default);',
    '                                        with --only, reads just the flows attributed to endpoint keys',
    '  apply [--only A,B] [--repointed K,..]  back up, write, read back; stops at the first failure',
    '  repoint                               writes DGO_ENDPOINT_<KEY>=<url> lines to a 0600 file in --out',
    '  restore <estate-backup-….json>        puts back every flow in a backup and reads each back',
    '  values [--repointed K,..]             writes dgo-values.txt (0600) for npm run package -- --values',
    '  run <flow-id> [<run-id>] [--last N]   read only: a flow\'s recent runs, and why one failed',
    'Options: --out <dir> (default ./estate-apply-output)',
  ].join('\n');
  if (!['plan', 'apply', 'repoint', 'restore', 'values', 'run', 'help'].includes(cmd) || args.includes('--help') || cmd === 'help') { console.log(USAGE); return cmd === 'help' || args.includes('--help') ? 0 : 2; }

  const OUT = path.resolve(opt('--out') || 'estate-apply-output');
  const FLOW = env.DGO_ESTATE_FLOW_BASE || 'https://api.flow.microsoft.com';
  const LOGIN = env.DGO_ESTATE_LOGIN_BASE || 'https://login.microsoftonline.com';
  const TENANT = DATA.environment.replace(/^Default-/i, '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const write = (name, text, mode) => {
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, name);
    fs.writeFileSync(file, text, mode ? { mode } : undefined);
    if (mode) fs.chmodSync(file, mode);
    console.log(`    wrote ${file}`);
    return file;
  };
  /* Sign-in form posts: a phone's connection can drop, so try four times. */
  const post = async (url, fields) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields) });
        let json = {}; try { json = await res.json(); } catch { /* not JSON */ }
        return { status: res.status, json: json || {} };
      } catch (e) {
        if (attempt >= 3) throw new Error(`No connection to Microsoft sign-in after 4 tries (${e.message}). Check the connection and run the command again.`);
        await sleep(3000 * (attempt + 1));
      }
    }
  };

  let runArgs = null;
  if (cmd === 'run') {
    const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
    runArgs = { flowId: pos[1] || null, runId: pos[2] || null, last: opt('--last') ? Number(opt('--last')) : 10 };
    if (!runArgs.flowId) { console.log(USAGE); return 2; }
  }
  let backupFile = null;
  if (cmd === 'restore') {
    const i = args.indexOf('restore');
    backupFile = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
    if (!backupFile) { console.log(USAGE); return 2; }
    JSON.parse(fs.readFileSync(backupFile, 'utf8')); // fail before sign-in if the file is not JSON
  }

  console.log(`Estate orchestrator ${DATA.version} — command-line route (${cmd})`);
  const retryDelays = env.DGO_ESTATE_RETRY_MS ? env.DGO_ESTATE_RETRY_MS.split(',').map(Number) : undefined;
  const io = {
    fetch: (u, i) => fetch(u, i),
    capturedAuth: () => [], authSeen: () => [], storages: () => [], observedOrigins: () => [FLOW],
    sleep, authWaitMs: 0, retryDelaysMs: retryDelays,
    cmd: {
      apply: 'node estate-apply.cli.mjs apply',
      repoint: 'node estate-apply.cli.mjs repoint',
      applyRepointed: (keys) => `node estate-apply.cli.mjs apply --repointed ${keys.join(',')}`,
    },
    connectedNote: '    connected to the Flow service (the sign-in is kept in memory only, never written to disk)',
    log: (...a) => console.log(...a),
    table: (t) => console.table(t),
    now: () => new Date().toISOString(),
    clipboard: async () => { throw new Error('no clipboard on the command line'); },
    downloadText: (name, text) => write(name, text, 0o600),
    download: (name, obj) => write(name, JSON.stringify(obj, null, 2)),
  };
  const estate = createEstate(DATA, io);

  const { token, user } = await deviceSignIn({ tenant: TENANT, post, say: (s) => console.log(s), sleep, login: LOGIN, pollMs: env.DGO_ESTATE_POLL_MS ? Number(env.DGO_ESTATE_POLL_MS) : null });
  console.log(`    signed in as ${user.name ? `${user.name} <${user.email}>` : user.email || 'the account you chose'}`);
  await estate.useToken(`Bearer ${token}`, FLOW);

  if (cmd === 'plan') { await estate.plan({ only: list('--only').length ? list('--only') : null }); console.log('\nPlanned. To write: node estate-apply.cli.mjs apply'); }
  if (cmd === 'apply') {
    const report = await estate.apply({ only: list('--only').length ? list('--only') : null, repointed: list('--repointed') });
    return report.rows.some((r) => r.status === 'FAILED') ? 1 : 0;
  }
  if (cmd === 'repoint') {
    const r = await estate.repoint();
    if (r.keys.length) console.log('    That file holds signed trigger URLs: copy the lines into your values file, then delete it.');
  }
  if (cmd === 'values') {
    const r = await estate.values({ repointed: list('--repointed') });
    console.log(`    Next, from the repository clone: npm run package -- --values ${path.join(OUT, 'dgo-values.txt')} --surface portal`);
    console.log('    The file holds signed trigger addresses: delete it after the build.');
    return r.written ? 0 : 1;
  }
  if (cmd === 'run') {
    const r = await estate.run(runArgs);
    return r.failed.length ? 1 : 0;
  }
  if (cmd === 'restore') {
    const rows = await estate.restore(JSON.parse(fs.readFileSync(backupFile, 'utf8')));
    return rows.some((r) => r.status === 'FAILED') ? 1 : 0;
  }
  return 0;
}
