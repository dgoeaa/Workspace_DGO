#!/usr/bin/env node
/**
 * The e-mail template package of 2026-10-20 (docs/folio-Master-Flows-and-Endpoints/email-templates/) and its senders.
 *
 * Proves, without a browser or a network:
 *   1. every complete document meets the package's own checks (04-Validation/validation-report.md, 1 to 9 and 14):
 *      lang, colour scheme, title, preheader, presentational tables, palette colours, hosted images with alt text,
 *      identity by audience, no dead links, no external stylesheet or script, a 600 px card, a 12 px type floor;
 *   2. every fragment is a body (no document), carries its hero and footer note, and is coloured on the palette;
 *   3. config/email-fragments.generated.js, email-documents.generated.js and mailer/js/seed-letters.generated.js are the
 *      package (their --check runs first in test:emailfragments);
 *   4. every sender sends its design's fragment with email.hero and email.footerNote, and the frame adds no greeting:
 *      the staff notices (SN-*), the Correspondence Desk (CL-*), the report e-mails (RP-*); every fragment has a sender;
 *   5. the Mailer's starter letters are the ML letters, and its sign-in code mail is ML-Sign-In-Code;
 *   6. the IP_SEND_EMAIL frame package colours its hero by payload.email.hero.purpose and falls back to its own colours;
 *   7. no identification package step loads images from a third-party host, except one whose output is stored (B5);
 *   8. the daily sweep tells a citizen once that their submission is overdue (F5).
 *
 * Usage:  node tests/email-fragments.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const PKG = 'docs/folio-Master-Flows-and-Endpoints/email-templates';

let passed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = { DGO_CONFIG: {} };
if (!globalThis.crypto?.randomUUID) globalThis.crypto = { ...(globalThis.crypto || {}), randomUUID: () => 'test-uuid' };

const tokens = read('styles/dgo-design-system/tokens/tokens.primitive.css') + read('styles/dgo-design-system/tokens/tokens.semantic.css');
const PALETTE = new Set([...tokens.matchAll(/--dgo-[\w-]+:\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => m[1].toUpperCase()));
const colours = (html) => [...new Set((html.match(/(?<![&\w])#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase()))];
const HOST = 'https://folio-portal.page.gd/email-assets/';
const EXTERNAL = /^(CL-|ML-(?!Sign-In-Code)|PT-|Frame-IP-Send-Email--external)/;

/* ── 1. Complete documents ───────────────────────────────────────────── */
console.log('\nComplete documents');
const docs = readdirSync(join(ROOT, PKG, '01-Templates/email')).filter((f) => f.endsWith('.html')).sort();
check('59 complete documents', docs.length === 59, String(docs.length));
const docFail = [];
for (const f of docs) {
  const id = f.replace(/\.html$/, '');
  const html = read(`${PKG}/01-Templates/email/${f}`);
  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const problems = [
    !/^<!doctype html>\s*<html lang="en" dir="ltr"/i.test(html) && 'doctype or lang',
    !/<meta name="color-scheme" content="light">/.test(html) && 'colour scheme',
    !/<title>[^<]+<\/title>/.test(html) && 'title',
    !/<div style="display:none;[^"]*">[^<]+/.test(html) && 'preheader',
    (html.match(/<table\b(?![^>]*role="presentation")[^>]*>/g) || []).length > 0 && 'a table without role="presentation"',
    /display:\s*(flex|grid)|box-shadow/.test(html) && 'flex, grid or box-shadow',
    colours(html).some((h) => !PALETTE.has(h)) && `off-palette ${colours(html).filter((h) => !PALETTE.has(h)).join(' ')}`,
    imgs.some((i) => !i.includes(`src="${HOST}`) || !/alt="[^"]+"/.test(i)) && 'an image not on the brand host, or without alt text',
    EXTERNAL.test(id) && /dgo-logo-whiteout|DGO Digital Ops/.test(html) && 'external but carries the DGO mark',
    !EXTERNAL.test(id) && !/dgo-logo-whiteout\.png/.test(html) && 'internal but lacks the DGO mark',
    /href="#"/.test(html) && 'a dead href="#"',
    /<link\b|<script\b|fonts\.googleapis|@import/.test(html) && 'an external stylesheet, script or web font',
    !/max-width:600px/.test(html) && 'no 600 px card',
    [...html.matchAll(/font-size:\s*(\d+)px/g)].some((m) => +m[1] > 1 && +m[1] < 12) && 'type below 12 px',
    !/-webkit-text-size-adjust:100%/.test(html) && 'text inflation not disabled',
  ].filter(Boolean);
  if (problems.length) docFail.push(`${id}: ${problems.join(', ')}`);
}
check('every complete document passes the package checks (lang, preheader, tables, palette, images, identity, links, width, type)', !docFail.length, docFail.join('; '));
const texts = readdirSync(join(ROOT, PKG, '01-Templates/text')).filter((f) => f.endsWith('.txt'));
check('every complete document has its plain-text version', docs.every((f) => texts.includes(f.replace(/\.html$/, '.txt'))));

/* ── 2. Fragments ────────────────────────────────────────────────────── */
console.log('\nFragments');
const { EmailFragments } = await import('../config/email-fragments.generated.js');
const { EmailDocuments } = await import('../config/email-documents.generated.js');
const frags = Object.values(EmailFragments);
check('29 IP_SEND_EMAIL fragments are compiled, and WS-Support-Request derived from its document', frags.length === 30 && frags.filter((f) => f.derived).map((f) => f.id).join() === 'WS-Support-Request', String(frags.length));
const fragFail = frags.flatMap((f) => [
  /<!doctype|<html|<head|<body/i.test(f.html) && `${f.id}: a document, not a body`,
  !f.derived && !/dear |hello/i.test(f.html.slice(0, 600)) && `${f.id}: no greeting in the first 600 characters (the frame would add "Dear Sir/Madam,")`,
  f.hero.purpose !== f.id && `${f.id}: hero.purpose is ${f.hero.purpose}`,
  !(f.hero.chip && f.hero.title && f.footerNote && f.subject && f.preheader) && `${f.id}: hero, footer note, subject or preheader missing`,
  !f.scheme?.ground && `${f.id}: no hero scheme`,
  [...colours(f.html), ...colours(JSON.stringify(f.scheme))].some((h) => !PALETTE.has(h)) && `${f.id}: off-palette colour`,
  /href="#"/.test(f.html) && `${f.id}: a dead href="#"`,
  /\{\{row\./.test(f.html.replace(/<!--each:\w+-->[\s\S]*?<!--\/each:\w+-->/g, '')) && `${f.id}: a list row outside <!--each-->`,
].filter(Boolean));
check('every fragment is a body with its greeting first, its hero and footer note, on the palette', !fragFail.length, fragFail.join('; '));
check('the sample rows of a list are compiled to one repeated row with an empty state', ['RP-Management', 'RP-Statistics'].every((id) => {
  const f = EmailFragments[id];
  return (f.html.match(/<!--each:rows-->/g) || []).length === 1 && /No records fall inside/.test(f.lists.rows);
}) && /\{\{row\.pct\}\}%/.test(EmailFragments['RP-Statistics'].html) && EmailFragments['RP-Management'].html.includes('{{insight}}'));
check('every CL design has its complete document, with the fragment slot', Object.keys(EmailDocuments).length === 10 && Object.entries(EmailDocuments).every(([id, d]) => /^CL-/.test(id) && d.split('{{html}}').length === 2 && /^<!doctype html>/i.test(d)));
/* The docket band (Reference and Date or Record) broke both values mid-word in the Outlook mobile app (2026-10-22, ITEM-93):
   word-break:break-all in two fixed half-width columns. Each value now has its own full-width row and the second never wraps. */
{
  const bad = [];
  for (const f of readdirSync(join(ROOT, PKG, '01-Templates/email')).filter((x) => x.endsWith('.html'))) {
    const s = read(`${PKG}/01-Templates/email/${f}`);
    const i = s.indexOf('data-folio-v3="docket"');
    if (i < 0) continue;
    const d = s.slice(i, s.indexOf('</td></tr>\n', i));
    if (/break-all|table-layout:fixed|border-left/.test(d) || (d.match(/<tr>/g) || []).length !== 2 || !/white-space:nowrap/.test(d)) bad.push(f);
  }
  const docs = Object.values(EmailDocuments).every((d) => { const i = d.indexOf('data-folio-v3="docket"'); return i >= 0 && !/break-all/.test(d.slice(i, d.indexOf('{{html}}'))); });
  check('the docket band never breaks a value mid-word: one row each, the second unwrapped', !bad.length && docs, bad.join(' '));
}

/* ── 4. The senders ──────────────────────────────────────────────────── */
console.log('\nThe senders');
const used = new Set();
{
  const { StaffNoticeTemplates } = await import('../config/staff-notice-templates.config.js');
  const { render } = await import('../core/staff-notice-service.js');
  for (const [rn, t] of Object.entries(StaffNoticeTemplates)) {
    const ctx = { referenceId: 'REF-1', title: 'T', decision: 'approved', recipientName: 'Ada', actorName: 'Bola' };
    for (const hold of [null, { email: 'a@nitda.gov.ng', name: 'Ada' }]) used.add(render(rn, ctx, { hold }).design);
    if (rn === 'RN-018') used.add(render(rn, { ...ctx, decision: 'rejected' }).design);
    void t;
  }
  check('the staff notices send every SN fragment (default, --hold, --not-approved)', frags.filter((f) => f.id.startsWith('SN-')).every((f) => used.has(f.id)), frags.filter((f) => f.id.startsWith('SN-') && !used.has(f.id)).map((f) => f.id).join(' '));
}
{
  const svc = await import('../core/correspondence-email-service.js');
  const { documentBody } = await import('../core/email-fragment-service.js');
  const { CorrespondenceEmailTemplates } = await import('../config/correspondence-email-templates.config.js');
  const full = { referenceId: 'R/1', subject: 'S', recipientEmail: 'a@b.gov.ng', recipientName: 'Sir', body: 'B', actionRequired: 'A', dueDate: '1 Nov', attachmentSummary: 'a.pdf' };
  const bare = { referenceId: 'R/1', subject: 'S', recipientEmail: 'a@b.gov.ng', body: 'B' };
  let ok = true;
  for (const t of CorrespondenceEmailTemplates) {
    for (const d of [full, bare]) {
      const r = svc.render({ templateId: t.id, ...d }, {});
      used.add(r.design);
      /* The fragment carries Reference and Date for the frame; the document holds them in its docket band, once. */
      ok = ok && r.hero.purpose === r.design && !/<!doctype/i.test(r.html) && /^<!doctype html>/i.test(r.preview) && r.html.includes('<!--folio-docket-->')
        && r.preview.includes(documentBody(r.html)) && !r.preview.includes('folio-docket') && r.preview.includes('data-folio-v3="docket"') && !/\{\{\w+\}\}/.test(r.preview);
    }
  }
  check('the Desk sends every CL fragment, and previews it in its complete document', ok && frags.filter((f) => f.id.startsWith('CL-')).every((f) => used.has(f.id)), frags.filter((f) => f.id.startsWith('CL-') && !used.has(f.id)).map((f) => f.id).join(' '));
  const r = svc.render({ templateId: 'official-correspondence', ...bare }, {});
  check('a letter with no action or reply-by line is sent as CL-Official--no-optional-lines', r.design === 'CL-Official--no-optional-lines' && !/Action required/.test(r.html));
  const half = svc.render({ templateId: 'official-correspondence', ...bare, dueDate: '1 Nov' }, {});
  check('a line left empty is left out with its label', half.design === 'CL-Official' && !/Action required/.test(half.html) && /on or before/.test(half.html));
  const src = read('core/correspondence-email-service.js');
  check('the Desk puts hero and footer note on the EMAIL payload', /hero:row\.hero,footerNote:row\.footerNote/.test(src));
}
{
  const { managementReportEmail, statisticsReportEmail } = await import('../core/report-email-service.js');
  const rows = [{ title: 'A <b>', status: 'Pending', taskStatus: 'Pending', due: '2020-01-01', referenceId: 'R1', kind: 'Task' }];
  const m = managementReportEmail({ profile: { name: 'Ada' }, rows, start: '2026-10-01', end: '2026-10-14' });
  const s = statisticsReportEmail({ profile: { name: 'Ada' }, rows });
  const e = managementReportEmail({ profile: { name: 'Ada' }, rows: [] });
  used.add(m.templateId); used.add(s.templateId);
  check('Reports sends RP-Management, its rows filled and escaped, its insight from the data', m.templateId === 'RP-Management' && m.hero.purpose === 'RP-Management' && m.html.includes('A &lt;b&gt;') && /Immediate attention/.test(m.html) && !/\{\{[\w.]+\}\}/.test(m.html));
  check('Reports prints the empty state for a range with no rows', /No records fall inside the dates chosen above/.test(e.html) && /No overdue item/.test(e.html));
  check('Statistics sends RP-Statistics with its status bars and record list', s.templateId === 'RP-Statistics' && /width:100%;height:12px/.test(s.html) && !/\{\{[\w.]+\}\}/.test(s.html));
  check('both modules post the fragment as payload.email', /managementReportEmail\(/.test(read('modules/reports.js')) && /email:\{\.\.\.email/.test(read('modules/reports.js')) && /statisticsReportEmail\(/.test(read('modules/statistics.js')) && /email:\{\.\.\.email/.test(read('modules/statistics.js')));
}
{
  const { supportEmail } = await import('../core/support-service.js');
  const { SupportRoutingConfig } = await import('../config/support-routing.config.js');
  const e = supportEmail({ category: 'access-error', message: 'I cannot open <b>TASK-12</b>\nsince Monday', context: { ref: 'TASK-12', profile: { name: 'Ada Obi', email: 'ada@nitda.gov.ng', persona: 'Registry' }, receipts: [{ type: 'support', ref: 'X', status: 'sent' }], online: true, at: '2026-10-21T09:00:00Z', route: 'lookup' } });
  used.add(e.templateId);
  check('the support request is WS-Support-Request to the support mailbox, through EMAIL (owner decision 2026-10-21)', e.to === 'dgs@nitda.gov.ng' && SupportRoutingConfig.endpointAlias === 'EMAIL' && e.templateId === 'WS-Support-Request'
    && e.hero.purpose === 'WS-Support-Request' && /Access Error/.test(e.hero.title) && /Ada Obi/.test(e.hero.lead) && e.subject === '[high] Support request: Access Error — TASK-12', e.subject);
  check('its message is escaped and keeps its line breaks, and it links the task', e.html.includes('&lt;b&gt;TASK-12&lt;/b&gt;<br>since Monday') && e.html.includes('href="https://folio-platform.page.gd/?TaskID=12"') && !/\{\{[\w.]+\}\}/.test(e.html + e.subject + e.footerNote));
  check('the request no longer goes to SUBSIDIARY_ACTIONS, which no flow implements', !/SUBSIDIARY_ACTIONS|CREATESUPPORTREQUEST/.test(read('core/support-service.js').replace(/\/\*[\s\S]*?\*\//g, '')));
}
check('every fragment in the package has a sender', frags.every((f) => used.has(f.id)), frags.filter((f) => !used.has(f.id)).map((f) => f.id).join(' '));

/* ── 5. The Mailer ───────────────────────────────────────────────────── */
console.log('\nThe Mailer');
{
  const { SEED_TEMPLATES } = await import('../mailer/js/seed-templates.js');
  const ok = SEED_TEMPLATES.length === 3 && SEED_TEMPLATES.every((t) => {
    const doc = read(`${PKG}/01-Templates/email/${t.design}.html`);
    return t.bodyHtml === doc.replace(/\{\{Message\}\}/g, '{{Message?}}').replace('{{SenderEmail}} · {{SenderPhone}}', '{{SenderContact?}}') && !/Cambria/.test(t.bodyHtml);
  });
  check('the three starter letters are ML-Cover-Letter, ML-Invitation and ML-Follow-Up, with an optional message', ok, SEED_TEMPLATES.map((t) => t.design).join(' '));
  const def = JSON.parse(read('mailer/flows/definitions/DGO_MAIL_AUTH.definition.json'));
  const find = (o) => (o && typeof o === 'object' ? (o.Send_Code || Object.values(o).map(find).find(Boolean)) : null);
  const p = find(def)?.inputs?.parameters || {};
  check('DGO_MAIL_AUTH Send_Code sends ML-Sign-In-Code, with the code in the body only', /folio-template" content="ML-Sign-In-Code"/.test(p['emailMessage/Body'] || '') && /Compose_Challenge'\)\?\['code'\]/.test(p['emailMessage/Body'] || '') && !/code/.test((p['emailMessage/Subject'] || '').replace(/sign-in code/, '')), p['emailMessage/Subject']);
  const { longExpressions } = await import('../scripts/lib/flow-bulk-update.mjs');
  const long = readdirSync(join(ROOT, 'mailer/flows/definitions')).flatMap((f) => longExpressions(JSON.parse(read(`mailer/flows/definitions/${f}`))).map((x) => `${f} ${x.action} ${x.length}`));
  check('no Mailer flow holds an expression over the service\'s 8192 characters', !long.length, long.join('; '));
  {
    const { Simulator } = await import('../scripts/lib/wdl-sim.mjs');
    const sim = new Simulator();
    const ctx = { results: new Map([['Compose_Challenge', { outputs: { code: '482913', email: 'ada@nitda.gov.ng' } }], ['Compose_Config', { outputs: { codeMinutes: 10 } }]]), binding: [] };
    let mail = ''; try { mail = sim.evalValue(p['emailMessage/Body'], ctx); } catch (e) { mail = `error: ${e.message}`; }
    check('the sign-in code e-mail renders: the code, the address, the minutes and the year, no token left', /482913/.test(mail) && /ada@nitda\.gov\.ng/.test(mail) && /10/.test(mail) && /20\d\d/.test(mail) && !/\{\{\w+\}\}|@\{/.test(mail) && /^<!DOCTYPE/i.test(mail), mail.slice(0, 120));
  }
}

/* ── 6. The IP_SEND_EMAIL frame colours its hero by purpose (ITEM-92) ──────────────── */
console.log('\nThe IP_SEND_EMAIL frame');
{
  const { Simulator } = await import('../scripts/lib/wdl-sim.mjs');
  const pkg = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/EMAIL__IP_SEND_EMAIL__df59a69f.paste.json'));
  const find = (o, n) => (o && typeof o === 'object' ? (o[n]?.type ? o[n] : Object.values(o).map((v) => find(v, n)).find(Boolean)) : null);
  const [schemes, hero, body] = ['Compose_SendEmail_Hero_Schemes', 'Compose_SendEmail_Hero', 'Compose_SendEmail_Body_Html'].map((n) => find(pkg, n));
  check('the frame package carries the hero schemes and the hero step, and the body runs after them', !!schemes && !!hero && JSON.stringify(body?.runAfter) === '{"Compose_SendEmail_Hero":["Succeeded"]}' && JSON.stringify(hero.runAfter) === '{"Compose_SendEmail_Hero_Schemes":["Succeeded"]}');
  const pkgSchemes = JSON.parse(read(`${PKG}/02-Design-System/hero-schemes.json`)).schemes;
  check('every scheme of the package is in the frame, with its seven colours', Object.entries(pkgSchemes).every(([id, sc]) => ['ground', 'rule', 'chipGround', 'chipBorder', 'chipText', 'headline', 'subline'].every((k) => schemes.inputs[id]?.[k] === sc[k])));
  const run = (triggerBody) => {
    const actions = {
      Compose_SendEmail_Subject: { type: 'Compose', runAfter: {}, inputs: 'The subject' },
      Compose_SendEmail_Attachment_Section: { type: 'Compose', runAfter: { Compose_SendEmail_Subject: ['Succeeded'] }, inputs: '' },
      Compose_SendEmail_Message_Body: { type: 'Compose', runAfter: { Compose_SendEmail_Attachment_Section: ['Succeeded'] }, inputs: '<p>Dear Ada,</p>' },
      Compose_SendEmail_Hero_Schemes: schemes, Compose_SendEmail_Hero: hero, Compose_SendEmail_Body_Html: body,
    };
    const scope = { nodeId: 'Scope_Frame', serializedValue: { type: 'Scope', actions } };
    const sim = new Simulator({ trigger: { outputs: { body: triggerBody, headers: {} } }, clock: () => '2026-10-21T09:00:00Z' }).declare(scope).run(scope);
    const out = (n) => sim.root.results.get('Scope_Frame')?.results?.get?.(n)?.outputs ?? sim.global.get(n)?.outputs;
    return { sim, hero: out('Compose_SendEmail_Hero'), html: String(out('Compose_SendEmail_Body_Html') ?? '') };
  };
  const sent = run({ payload: { email: { hero: { purpose: 'SN-Escalation--hold', chip: 'Escalated', title: 'A record', lead: 'Open Folio' }, footerNote: 'Sent by Folio for Bola.' } } });
  const sc = pkgSchemes['SN-Escalation--hold'];
  check('a purpose picks its scheme, and the frame prints its chip, title, lead and footer note', sent.sim.templateErrors.length === 0 && sent.hero?.ground === sc.ground && sent.hero?.rule === sc.rule
    && sent.html.includes(`background:${sc.ground}`) && sent.html.includes('>Escalated</span>') && sent.html.includes('>A record</h1>') && sent.html.includes('Open Folio</p>') && sent.html.includes('Sent by Folio for Bola.</p>'),
    `${JSON.stringify(sent.hero).slice(0, 200)} ${sent.sim.templateErrors.join(' | ').slice(0, 200)}`);
  const bare = run({ payload: { email: { subject: 'S' } } });
  check('a caller that sends no hero gets the frame as before: its own colours, "Official correspondence", the subject, no lead or note', bare.sim.templateErrors.length === 0
    && bare.hero?.ground === '#FFFFFF' && bare.hero?.rule === '#05583B' && bare.html.includes('>Official correspondence</span>') && bare.html.includes('>The subject</h1>') && !/<p style="margin:10px 0 0 0;/.test(bare.html),
    `${JSON.stringify(bare.hero).slice(0, 200)} ${bare.sim.templateErrors.join(' | ').slice(0, 200)}`);
  const unknown = run({ email: { hero: { purpose: 'NO-SUCH-TEMPLATE' } } });
  check('an unknown purpose falls back to the frame\'s colours', unknown.sim.templateErrors.length === 0 && unknown.hero?.ground === '#FFFFFF');
}

/* ── 7. B5: no package step loads images from third-party hosts, except one that is read (ITEM-92) ── */
console.log('\nThird-party images (B5)');
{
  const HOSTS = /cloudfront|flaticon|myfiles\.space|yourcdn\.com/;
  const dir = 'docs/folio-Master-Flows-and-Endpoints/packages';
  const hits = [];
  for (const phase of readdirSync(join(ROOT, dir)).filter((d) => /^identification-phase\d$/.test(d))) {
    for (const f of readdirSync(join(ROOT, dir, phase)).filter((x) => x.endsWith('.paste.json'))) {
      const walk = (acts) => { for (const [n, a] of Object.entries(acts || {})) {
        const own = JSON.stringify(Object.fromEntries(Object.entries(a).filter(([k]) => !['actions', 'else', 'cases', 'default'].includes(k))));
        if (HOSTS.test(own)) hits.push(`${f}:${n}`);
        walk(a.actions); if (a.else) walk(a.else.actions); for (const c of Object.values(a.cases || {})) walk(c.actions); if (a.default) walk(a.default.actions);
      } };
      walk(JSON.parse(read(`${dir}/${phase}/${f}`)).serializedValue?.actions);
    }
  }
  check('only the scan flow\'s Compose_3 still names a third-party image host (it is written to SharePoint through varResponse, not sent)',
    hits.length === 1 && /Folio_Incoming_Correspondence_Scan_Processing_Flow__197527c8\.paste\.json:Compose_3$/.test(hits[0]), hits.join(' '));
}

/* ── 8. F5: the citizen is told once that their submission is overdue (CG_Portal_Daily_Sweep, ITEM-92) ── */
console.log('\nCitizen overdue notice (F5)');
{
  const { Simulator } = await import('../scripts/lib/wdl-sim.mjs');
  const { sharepoint } = await import('./lib/identification-sharepoint.mjs');
  const pkg = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/NOKEY__CG_Portal_Daily_Sweep__f12aec6d.paste.json'));
  const G = pkg.serializedValue.actions.Scope_Global_Sweep.actions;
  const loop = G.Foreach_Overdue_Submission;
  check('the sweep checks each unacknowledged submission, and its counts wait for the notices', !!loop && loop.runAfter?.Get_Unacknowledged_Submissions && G.Compose_Sweep_Counts.runAfter?.Foreach_Overdue_Submission
    && loop.actions.Compose_Ack_Overdue_Is_Overdue.inputs === `@${G.Select_Overdue_Rows.inputs.select.slice(4, G.Select_Overdue_Rows.inputs.select.indexOf(',concat(concat('))}`.replaceAll('item()', "items('Foreach_Overdue_Submission')"));
  const RECEIPTS = '88a81ca1-319a-45f5-8409-f91a24538ffa';
  const NOW = '2026-10-21T09:00:00Z';
  const row = (ref, submitted) => ({ ID: 1, ReferenceId: ref, SenderEmail: 'Citizen@Example.com', SenderName: 'Ada Obi', SubmittedAtUtc: submitted });
  const run = ({ rows, receipts = [], enabled = true }) => {
    const sp = sharepoint({ [RECEIPTS]: receipts });
    const scope = { nodeId: 'Scope_Overdue', serializedValue: { type: 'Scope', actions: { Foreach_Overdue_Submission: { ...structuredClone(loop), runAfter: {} } } } };
    const prior = {
      Compose_Notify_Config: { status: 'Succeeded', outputs: { enabled, replyTo: 'dgsregistry@nitda.gov.ng', trackUrl: 'https://folio-portal.page.gd/track.html' } },
      Get_Unacknowledged_Submissions: { status: 'Succeeded', outputs: { body: { value: rows } } },
    };
    const sim = new Simulator({ connectors: sp.connectors, prior, clock: () => NOW, workflow: { name: 'f12aec6d', run: { name: 'RUN-1' }, tags: { flowDisplayName: 'CG_Portal_Daily_Sweep' } } }).declare(scope).run(scope);
    return { sim, mail: sp.db.mail || [], receipts: sp.db[RECEIPTS] || [] };
  };
  const late = run({ rows: [row('NITDA-2026-00101', '2026-10-05T09:00:00Z')] });
  const m = late.mail[0] || {};
  check('an overdue submission with no notice yet: one e-mail to the citizen, in PT-Ack-Overdue, and a sent receipt naming the submission',
    late.sim.templateErrors.length === 0 && late.mail.length === 1 && m['emailMessage/To'] === 'citizen@example.com' && /NITDA-2026-00101 is still being processed/.test(m['emailMessage/Subject'])
    && /folio-template" content="PT-Ack-Overdue"/.test(m['emailMessage/Body']) && /Ada Obi/.test(m['emailMessage/Body']) && /track\.html\?id=NITDA-2026-00101&amp;email=|track\.html\?id=NITDA-2026-00101&email=/.test(m['emailMessage/Body']) && !/\{\{\w+\}\}/.test(m['emailMessage/Body'])
    && late.receipts.length === 1 && late.receipts[0].MessageType === 'citizen-ack-overdue' && late.receipts[0].Reference === 'NITDA-2026-00101' && late.receipts[0].Status === 'sent',
    `${late.sim.templateErrors.join(' | ').slice(0, 300)} mails ${late.mail.length} ${JSON.stringify(late.receipts).slice(0, 200)}`);
  const dated = run({ rows: [row('NITDA-2026-00103', '2026-10-14T16:30:00Z')] });
  const body = dated.mail[0]?.['emailMessage/Body'] || '';
  check('the dates are the sweep\'s own: submitted Wednesday 14 Oct (WAT), due three working days later, Monday 19 Oct', body.includes('14 Oct 2026') && body.includes('19 Oct 2026'), body.match(/\d\d \w{3} \d{4}/g)?.join(' '));
  const again = run({ rows: [row('NITDA-2026-00101', '2026-10-05T09:00:00Z')], receipts: late.receipts });
  check('the next day\'s sweep does not tell the citizen again', again.mail.length === 0 && again.receipts.length === 1);
  const failedBefore = run({ rows: [row('NITDA-2026-00101', '2026-10-05T09:00:00Z')], receipts: [{ ...late.receipts[0], Status: 'failed' }] });
  check('a notice that failed is tried again', failedBefore.mail.length === 1);
  const fresh = run({ rows: [row('NITDA-2026-00102', '2026-10-20T09:00:00Z')] });
  check('a submission not yet overdue is not notified', fresh.sim.templateErrors.length === 0 && fresh.mail.length === 0 && fresh.receipts.length === 0);
  const off = run({ rows: [row('NITDA-2026-00101', '2026-10-05T09:00:00Z')], enabled: false });
  check('with portal notices switched off, nothing is sent', off.mail.length === 0);
}

console.log(`\n${failures.length ? '❌' : '✅'} ${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
