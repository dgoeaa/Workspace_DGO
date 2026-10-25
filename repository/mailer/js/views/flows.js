import { esc } from '../util.js';
import { toast, badge } from '../ui.js';
import { ENDPOINT_KEYS } from '../settings.js';
import { health, verify, op, describe } from '../api.js';
import { Reports } from '../reports.js';

const VERDICT_KIND = {
  healthy: 'ok', verified: 'ok', 'wrong-endpoint-key': 'bad', 'identity-mismatch': 'bad', 'not-implemented': 'warn',
  refused: 'bad', blocked: 'warn', unreachable: 'warn', 'not configured': 'neutral',
};
const VERDICT_HELP = {
  healthy: 'The flow validated itself and wrote nothing.',
  verified: 'The flow proved its identity and echoed the correlation id.',
  'wrong-endpoint-key': 'This URL reaches a different mailer flow. Check you pasted each URL against the right key.',
  'identity-mismatch': 'The correlation id did not come back — a cached or replayed answer.',
  'not-implemented': 'The flow answered without the validationOnly echo — it is not a mailer flow.',
  refused: 'Reached, and it refused.',
  blocked: 'Something between this browser and the tenant answered instead (proxy/filter).',
  unreachable: 'No answer. From a browser this can be a blocked host, DNS or a CORS refusal.',
};

const results = {};
let provisionReport = null;

/* What healthCheck found against the lists this flow uses (listsExpected), naming any missing. */
function listsLine(d) {
  const found = new Set((d.listsFound || []).map((l) => String(l.Title || l.title || l).toLowerCase()));
  const expected = (d.listsExpected || []).map(String);
  if (!expected.length) return `SharePoint ok (${found.size} list(s) found)`;
  const missing = expected.filter((t) => !found.has(t.toLowerCase()));
  return missing.length ? `SharePoint ok, but missing: ${missing.join(', ')} — run Provision` : `SharePoint ok (${expected.length}/${expected.length} lists)`;
}

export async function render(app) {
  const s = app.state.settings;
  const html = `
    <section class="page-head"><div><h1>Flows &amp; setup</h1>
      <p class="lede">The mailer's only back end is seven Power Automate flows, each started by an HTTP request. Import them, paste their URLs, and check them here.</p></div>
      <div class="actions"><button class="btn btn-primary" data-check-all>Check all</button></div></section>

    <section class="panel">
      <h2>Endpoints</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Key</th><th>Flow</th><th>Purpose</th><th>Health</th><th>Identity</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${ENDPOINT_KEYS.map((e) => {
          const r = results[e.key] || {};
          const wired = Boolean(s.endpoints?.[e.key]);
          const cell = (v) => (v ? `${badge(v.verdict, VERDICT_KIND[v.verdict] || 'neutral', VERDICT_HELP[v.verdict] || '')}${v.detail ? `<div class="small muted">${esc(v.detail)}</div>` : ''}` : wired ? '<span class="muted">—</span>' : badge('not configured', 'neutral'));
          return `<tr><td><code>${esc(e.key)}</code></td><td>${esc(e.flow)}${globalThis.DGO_MAILER_PUBLISHED ? '' : `<div class="small"><a href="flows/packages/${esc(e.flow)}.zip" download>package</a> · <a href="flows/definitions/${esc(e.flow)}.definition.json" target="_blank" rel="noopener">definition</a></div>`}</td>
            <td class="small">${esc(e.purpose)}</td><td>${cell(r.health)}</td><td>${cell(r.verify)}</td>
            <td class="row-actions">${wired ? `<button class="btn btn-sm" data-health="${esc(e.key)}">Health</button><button class="btn btn-sm" data-verify="${esc(e.key)}">Verify</button>` : '<a class="btn btn-sm" href="#/settings">Add URL</a>'}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>

    <section class="panel">
      <h2>Provision SharePoint</h2>
      <p>DGO_MAIL_PROVISION creates the mailer's SharePoint lists (<code>DGOMailLog</code>, <code>DGOMailDirectory</code>, <code>DGOMailTemplates</code>, <code>DGOMailOperators</code>, <code>DGOMailSessions</code>, <code>DGOMailCampaigns</code>, <code>DGOMailReports</code>), the <code>DGOMailFiles</code> library, and their columns, on the site configured in the flows. It is idempotent: run it again and it creates only what is missing. <strong>Plan</strong> reports what it would do and writes nothing.</p>
      <div class="toolbar">
        <button class="btn" data-plan ${s.endpoints?.MAIL_PROVISION ? '' : 'disabled'}>Plan</button>
        <button class="btn btn-primary" data-provision ${s.endpoints?.MAIL_PROVISION ? '' : 'disabled'}>Provision</button>
        ${s.endpoints?.MAIL_PROVISION ? '' : '<span class="muted">Add the MAIL_PROVISION URL in Settings first.</span>'}
      </div>
      ${provisionReport ? reportHtml(provisionReport) : ''}
    </section>

    <section class="panel prose">
      <h2>Setting up the flows</h2>
      <ol>
        <li><strong>Automatic setup does all of this.</strong> From the package, run <code>node tools/setup.mjs</code> (<code>setup.cmd</code> on a PC) and sign in once: it creates or updates all seven flows, sets their admin key and allowed origin, binds connections, provisions and indexes the lists, adds you as the first admin operator, and writes <code>mailer.html</code>, the whole mailer in one file, to publish beside the platform's <code>index.html</code>. When your organisation blocks that sign-in, do steps 2–5 instead.</li>
        <li><strong>Import.</strong> In <a href="https://make.powerautomate.com" target="_blank" rel="noopener">make.powerautomate.com</a> → <em>My flows → Import → Import package (legacy)</em>, upload each of the ${ENDPOINT_KEYS.length} packages above. For each, choose <em>Create as new</em> (or <em>Update</em> for one that exists) and select your SharePoint (and, for DGO_MAIL_SEND and DGO_MAIL_AUTH, Office 365 Outlook) connection.</li>
        <li><strong>Configure.</strong> Open each flow, expand <code>Compose_Config</code> and set <code>operatorKey</code> (the admin key — never given to browsers) to the same long random value in all of them, and <code>allowedOrigin</code> to the origin the mailer is published on. In DGO_MAIL_SEND, set <code>sharedMailbox</code> to the DGO office mailbox if mail should come from it. Save and turn each flow on.</li>
        <li><strong>Collect the addresses.</strong> Copy each flow's <em>HTTP URL</em> into a text file, one line each: <code>MAIL_SEND=https://…</code>, <code>MAIL_LOG=…</code>, and so on for all seven.</li>
        <li><strong>Finish with setup, without Microsoft sign-in.</strong> Run <code>node tools/setup.mjs --manual --endpoints FILE --key KEY --operator you@nitda.gov.ng</code>. With the admin key it checks every flow, provisions and indexes the lists, adds you as the first admin operator (the operator list only exists once provisioning has run, so it cannot be done by hand first), and writes <code>mailer.html</code>. The guide's “Manual setup” gives each step.</li>
        <li><strong>Check.</strong> Signed in to the published mailer, press <em>Check all</em> above — each flow should read <em>healthy</em> and <em>verified</em>. <em>Plan</em> and <em>Provision</em> above re-check the lists later; they need you signed in as an admin.</li>
        <li><strong>Share.</strong> Push the directory and templates to SharePoint from their pages, so every operator works from the same list.</li>
        <li><strong>Rehearse.</strong> Send a test of a real mailing to yourself from the Review step before sending to addressees.</li>
      </ol>
      <p class="small muted">The trigger URLs are signed: whoever holds one can call the flow. The operator key and the recipient-domain allowlist inside DGO_MAIL_SEND are what stop a leaked URL being used to send arbitrary mail — keep both.</p>
    </section>`;

  const bind = (root) => {
    const run = async (kind, key) => {
      const out = kind === 'health' ? await health(s, key) : await verify(s, key);
      const detail = out.verdict === 'healthy' && out.res.json?.data
        ? [out.res.json.data.operatorKeyConfigured ? 'key set' : 'OPERATOR KEY NOT SET', out.res.json.data.sharePointReachable ? listsLine(out.res.json.data) : 'SharePoint unreachable'].join(' · ')
        : ['healthy', 'verified'].includes(out.verdict) ? `${out.res.ms} ms` : describe(out.res);
      (results[key] ||= {})[kind] = { verdict: out.verdict, detail };
      return { verdict: out.verdict, detail };
    };
    /* One report line per check: green verdicts are Done; anything else is Failed, with what it means. */
    const line = (report, key, kind, r) => {
      const flow = ENDPOINT_KEYS.find((e) => e.key === key)?.flow || key;
      const good = r.verdict === 'healthy' || r.verdict === 'verified';
      const warn = good && /NOT SET|unreachable/.test(r.detail);
      report.add(`${flow}: ${kind === 'health' ? 'health check' : 'identity check'}`, warn ? 'warn' : good ? 'ok' : 'fail',
        `${r.verdict}. ${r.detail}${good ? '' : `\n${VERDICT_HELP[r.verdict] || ''}`}`.trim());
    };
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.health || b.dataset.verify) {
        b.disabled = true;
        const kind = b.dataset.health ? 'health' : 'verify';
        const key = b.dataset.health || b.dataset.verify;
        const report = Reports.begin(app, 'health', `${kind === 'health' ? 'Health' : 'Identity'} check of ${key}`, { Flow: ENDPOINT_KEYS.find((e) => e.key === key)?.flow || key });
        line(report, key, kind, await run(kind, key));
        await report.finish('', { show: false });
        app.render();
      }
      if (b.dataset.checkAll !== undefined) {
        b.disabled = true;
        const wired = ENDPOINT_KEYS.filter((ep) => s.endpoints?.[ep.key]);
        const report = Reports.begin(app, 'health', 'Check all flows', { Flows: `${wired.length} of ${ENDPOINT_KEYS.length} wired`, 'What it proves': 'Each flow answers, holds the operator key, reaches SharePoint, and is the flow its address claims. It sends nothing. The Outlook connection is proved by a test send.' });
        for (const ep of ENDPOINT_KEYS) {
          if (!s.endpoints?.[ep.key]) { report.add(`${ep.flow}`, 'skip', 'No address in Settings → Endpoints.'); continue; }
          b.textContent = `Checking ${ep.key}…`;
          line(report, ep.key, 'health', await run('health', ep.key));
          line(report, ep.key, 'verify', await run('verify', ep.key));
        }
        const c = report.counts();
        await report.finish(c.fail ? 'Fix the failed lines before sending: each line says what its verdict means.' : `All ${wired.length} wired flows answered correctly.`);
        app.render();
      }
      if (b.dataset.plan !== undefined || b.dataset.provision !== undefined) {
        b.disabled = true;
        const plan = b.dataset.plan !== undefined;
        const report = Reports.begin(app, 'provision', plan ? 'Plan (writes nothing)' : 'Provision', { Site: 'as set in DGO_MAIL_PROVISION (siteUrl)' });
        try {
          provisionReport = await op(s, 'MAIL_PROVISION', 'provision', {}, { validationOnly: plan, timeoutMs: 240000 });
          report.context.Site = provisionReport.siteUrl || report.context.Site;
          for (const l of provisionReport.lists || []) {
            const missing = (l.missingFields || []).map((f) => f.name);
            const state = l.existed ? 'Exists' : l.created ? 'Created' : 'Would be created';
            const cols = missing.length ? (plan ? `${missing.length} column(s) to add: ${missing.join(', ')}` : `${l.fieldsCreated} column(s) added: ${missing.join(', ')}`) : 'All columns present';
            report.add(l.list, plan && (!l.existed || missing.length) ? 'info' : 'ok', `${state}. ${cols}.`);
          }
        } catch (err) {
          provisionReport = { error: err.message };
          report.add('DGO_MAIL_PROVISION', 'fail', err.message);
        }
        await report.finish(plan ? 'Plan only: nothing was written.' : '');
        app.render();
      }
    });
  };
  return { title: 'Flows & setup', html, bind };
}

function reportHtml(r) {
  if (r.error) return `<div class="callout callout-bad">${esc(r.error)}</div>`;
  return `<div class="callout"><strong>${r.mode === 'plan' ? 'Plan' : 'Provisioned'}</strong> on <code>${esc(r.siteUrl)}</code>
    <ul class="plain">${(r.lists || []).map((l) => {
      const missing = (l.missingFields || []).map((f) => f.name);
      const state = l.existed ? 'exists' : l.created ? 'created' : 'would be created';
      const fields = missing.length ? (r.mode === 'plan' ? `${missing.length} column(s) to add: ${missing.join(', ')}` : `${l.fieldsCreated} column(s) added`) : 'all columns present';
      return `<li><strong>${esc(l.list)}</strong> — ${esc(state)}; ${esc(fields)}</li>`;
    }).join('')}</ul></div>`;
}
