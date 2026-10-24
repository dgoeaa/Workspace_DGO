/**
 * One definition of the four intakes; email joins the intake list (essentials plan UX-201, ESSENTIALS_MAP.md E-2).
 *
 * The intakes were named three ways: config/entry-points.config.js (public portal, email, scan / physical counter,
 * internal origination), config/source-views.config.js and its chips (physical scans, customer service emails, public
 * portal, DGCEO outgoing), and the Intake workspace's purpose (portal, e-mail, the counter and the scanner, with
 * internal origination missing). The Command Center, the welcome tips, the product definition and two documentation
 * generators held copies of their own. Email messages were outside the intake list, behind an "Emails (n)" button.
 *
 * Now entry-points.config.js is the only definition and everything else is derived from it; a message not yet
 * registered is a row of the intake list, and stops being one once it is registered.
 */
globalThis.localStorage = { _s: {}, getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); }, removeItem(k) { delete this._s[k]; } };
globalThis.window = globalThis;
import { readFileSync, readdirSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, m, d = '') => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}${d ? ` — ${d}` : ''}`)); };
console.log('\nThe four intakes: one definition, one list\n');

const { EntryPoints, intakeListText } = await import('../config/entry-points.config.js');
const { SourceViews } = await import('../config/source-views.config.js');
const { VisibleWorkspaces, ProductCharterReference } = await import('../config/workflow-clarity.config.js');
const { WelcomeExperienceConfig } = await import('../config/welcome-experience.config.js');
const { unregisteredEmails, isRegistered } = await import('../core/intake-list.js');

/* ── one definition ─────────────────────────────────────────────────────────────────── */
const views = SourceViews.filter((v) => v.id !== 'all');
ok(views.length === 4 && views.every((v, i) => v.id === EntryPoints[i].sourceView && v.label === EntryPoints[i].label && v.short === EntryPoints[i].short && v.purpose === EntryPoints[i].purpose && v.icon === EntryPoints[i].icon),
  'the source views are the entry points, in their order, under their names', views.map((v) => v.short).join(', '));
ok(EntryPoints.map((e) => e.short).join(' · ') === 'Portal · Email · Counter / scan · Internal', 'the filter reads Portal, Email, Counter / scan, Internal');
ok(EntryPoints.every((e) => e.label && e.short && e.purpose && /^i-[a-z-]+$/.test(e.icon)), 'every intake has a name, a short name, a purpose and an icon');

const intake = VisibleWorkspaces.find((w) => w.id === 'inbox');
ok(EntryPoints.every((e) => intake.purpose.toLowerCase().includes(e.label.toLowerCase())), "the Inbox's purpose names all four intakes", intake.purpose);
ok(JSON.stringify(ProductCharterReference.sources) === JSON.stringify(EntryPoints.map((e) => e.sourceView)), 'the charter reference lists the entry points');
ok(WelcomeExperienceConfig.tips.some((t) => t.includes(intakeListText())) && WelcomeExperienceConfig.spotlight.some((s) => s.body.includes(intakeListText())), 'the welcome tips name the intakes from the definition');

const product = JSON.parse(readFileSync(new URL('../config/product-definition.config.json', import.meta.url), 'utf8'));
ok(!('ingestionSources' in product) && /entry-points\.config\.js/.test(product.ingestionSourcesFrom || ''), 'the product definition points at the definition instead of copying it');

/* No copy of the old names survives in the code that draws screens or generates documentation. */
const OLD = [/Physical Scans/, /DGCEO Outgoing/, /Customer Service e?mails/i, /Four ingestion sources/i, /Physical documents received and scanned/, /the counter and the scanner/, /Scan \/ physical counter/];
const walk = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(m?js|json)$/.test(e.name) ? [`${dir}/${e.name}`] : []);
const hits = ['core', 'modules', 'shared', 'config', 'scripts'].flatMap(walk).flatMap((f) => { const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'); return OLD.filter((rx) => rx.test(src)).map((rx) => `${f}: ${rx}`); });
ok(hits.length === 0, 'no screen, configuration or generator carries its own names for the intakes', hits.join('; '));

/* ── email in the intake list ───────────────────────────────────────────────────────── */
const emails = [
  { id: 'AAMk-1', subject: 'Request for clearance', fromAddress: 'a@ministry.gov.ng', receivedDateTime: '2026-10-20T09:00:00Z' },
  { id: 'AAMk-2', subject: 'Invitation to a summit', fromAddress: 'b@agency.gov.ng', receivedDateTime: '2026-10-21T09:00:00Z' },
  { id: 'AAMk-3', subject: 'Partnership proposal', fromAddress: 'c@firm.com', receivedDateTime: '2026-10-19T09:00:00Z' },
];
const none = unregisteredEmails({ emails });
ok(none.length === 3 && none[0].id === 'AAMk-2' && none[2].id === 'AAMk-3', 'unregistered messages are listed, newest first', none.map((e) => e.id).join(','));
ok(unregisteredEmails({ emails, correspondence: [{ id: 'NITDA-1', sourceEmailId: 'AAMk-1', channel: 'Email', subject: 'x' }] }).every((e) => e.id !== 'AAMk-1'),
  'a message this device registered leaves the list');
ok(unregisteredEmails({ emails, portalRegister: [{ referenceId: 'NITDA-2', channel: 'email', subject: 'invitation to a summit', senderEmail: 'B@agency.gov.ng' }] }).every((e) => e.id !== 'AAMk-2'),
  'a message registered on another device leaves the list, matched by the subject and sender its registration sent');
ok(!isRegistered(emails[2], [{ channel: 'Document', subject: 'Partnership proposal', senderEmail: 'c@firm.com' }]),
  'a record that did not come in by email does not register a message that shares its subject');
ok(!isRegistered(emails[2], [{ channel: 'Email', subject: 'Partnership proposal', senderEmail: 'someone@else.com' }]),
  'nor does an email record from another sender');
ok(unregisteredEmails({}).length === 0 && unregisteredEmails({ emails: [null] }).length === 0, 'no messages, or a malformed one, list nothing');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
