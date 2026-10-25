#!/usr/bin/env node
/**
 * Deep links open what they name. Spec: docs/architecture/PLATFORM_ACCESS_SPEC.md §8a.
 *
 *   - every accepted parameter routes where config/deeplink.config.js says (resolver table)
 *   - the link shapes the live flows send open the task or item they name
 *   - a task link is never sent to Lookup, and a document link never to acknowledgement
 *   - values are bounded; lists are capped
 *   - Lookup's matcher finds a linked item by list id or reference number
 *   - buildDeepLink() refuses a local base (DL-5)
 *   - docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md is current (checked by npm run deeplinks:audit --check)
 *
 * Run: node tests/deeplinks.test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DeepLinkConfig } from '../config/deeplink.config.js';
import { MAX_PARAM_LENGTH, buildDeepLink, findLinkedRecord, parseDeepLink } from '../core/deeplink-parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0;
const failures = [];
const ok = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}`); if (detail) console.log(`     ${detail}`); }
};
const p = (u) => parseDeepLink(u, 'https://workspace.example.gov/');

console.log('\nDeep links\n');

/* Resolver table: every accepted parameter, alone, lands where it is declared. */
for (const [param, spec] of Object.entries(DeepLinkConfig.acceptedParams)) {
  const r = p(`/?${param}=42`);
  const expectRoute = param === 'ref' || param === 'referenceId' ? spec.route : spec.route;
  ok(`?${param}= routes to ${spec.route}`, r.route === expectRoute && r.context[spec.contextKey] === '42',
     JSON.stringify(r));
}

/* The shapes the live flows send (docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md). */
const single = p('https://taskack.page.gd/index.html?item=2109&name=Amina&email=a%40nitda.gov.ng&title=Budget&ref=TASK-2109');
ok('an assignment notice opens the task to acknowledge, not Lookup',
   single.route === 'acknowledgment' && single.context.taskId === '2109', JSON.stringify(single));

const bulk = p('https://taskack.page.gd/acknowledge.html?items=2109,2110,2111&email=u%40nitda.gov.ng&ref=BULK-BATCH-1&batch=BATCH-1');
ok('a bulk assignment notice opens the first task and carries the rest',
   bulk.route === 'acknowledgment' && bulk.context.taskId === '2109' && bulk.context.taskIds.join() === '2109,2110,2111' && bulk.context.batch === 'BATCH-1',
   JSON.stringify(bulk));

ok('a bulk page with no recognised parameter still routes by its page name',
   p('https://taskack.page.gd/index_Bulk.html?x=1').route === 'acknowledgment');

const doc = p('https://cloud-registry.page.gd?DGOPID=77');
ok('an incoming-document notice opens the item in Lookup', doc.route === 'lookup' && doc.context.referenceId === '77');

ok('ref=TASK-n is a task: acknowledged, not looked up',
   p('/?ref=TASK-9').route === 'acknowledgment' && p('/?ref=TASK-9').context.taskId === '9');
ok('ref=<reference number> is an item: looked up', p('/?ref=NITDA-DGO-001').route === 'lookup');
ok('a task parameter outranks ref when both are present', p('/?ref=NITDA-1&TaskID=5').route === 'acknowledgment');
ok('a hash-routed link is read too', p('/#/lookup?ITEMID=5').context.referenceId === '5');
ok('a link naming nothing we know routes nowhere', p('/?utm_source=mail').route === '');

/* Staff notices that once linked to a SharePoint list (config/notice-links.config.js, owner 2026-10-20). */
const portalLink = p('https://folio-platform.page.gd/?portal=NITDA-DGO-2026-0042');
ok('a Portal Registry alert opens Portal submissions on its reference',
   portalLink.route === 'correspondence' && portalLink.action === 'open-portal-submission' && portalLink.context.portalRef === 'NITDA-DGO-2026-0042', JSON.stringify(portalLink));
const noticeLink = p('https://folio-platform.page.gd/?notice=http-flow-registry&record=17');
ok('an administrative notice opens the Admin Suite with its key and record',
   noticeLink.route === 'admin-suite' && noticeLink.context.notice === 'http-flow-registry' && noticeLink.context.record === '17', JSON.stringify(noticeLink));
{
  const { NoticeTargets, noticeSharePointLinks, noticeRecordId } = await import('../config/notice-links.config.js');
  ok('a notice key outside the allow-list names no address', noticeSharePointLinks('https://evil.example', '1') === null && noticeSharePointLinks('constructor', '1') === null);
  ok('a notice record that is not a list item id is dropped', noticeRecordId('1 OR 1=1') === '' && noticeSharePointLinks('portal-support-case', 'x').item === '');
  ok('every notice key opens its SharePoint list and item', Object.keys(NoticeTargets).every((k) => /^https:\/\/nitdanigeria\.sharepoint\.com\/sites\/.+\/AllItems\.aspx$/.test(noticeSharePointLinks(k).list) && noticeSharePointLinks(k, '5').item.endsWith('/DispForm.aspx?ID=5')));
  const cat = path.join(ROOT, 'docs/folio-Master-Flows-and-Endpoints/email-catalogue');
  const html = fs.readdirSync(cat, { recursive: true }).filter((f) => String(f).endsWith('.html')).map((f) => fs.readFileSync(path.join(cat, String(f)), 'utf8')).join('\n');
  ok('no catalogue e-mail links to a SharePoint list or list item', !/sharepoint\.com\/[^"' ]*\/Lists\//i.test(html) && !/in SharePoint&nbsp;/.test(html));
  const used = [...html.matchAll(/\?notice=([a-z-]+)/g)].map((m) => m[1]);
  ok('every notice key an e-mail sends is in the allow-list', used.length > 0 && used.every((k) => k in NoticeTargets), used.join());
}

/* Bounds. */
ok('a parameter value is bounded', p(`/?TaskID=${'9'.repeat(5000)}`).context.taskId.length === MAX_PARAM_LENGTH);
ok('a list is capped', p(`/?items=${Array.from({ length: 500 }, (_, i) => i).join(',')}`).context.taskIds.length <= 50);

/* Lookup's matcher. */
const state = {
  activities: [{ id: 11, referenceId: 'NITDA-DGO-001' }],
  tracking: [{ id: 2109, referenceId: 'TASK-2109' }],
  emails: [], comments: [], approvals: [],
};
ok('Lookup finds a linked item by reference number', JSON.stringify(findLinkedRecord(state, 'nitda-dgo-001')) === '{"type":"activities","id":"11"}');
ok('Lookup finds a linked item by list id', JSON.stringify(findLinkedRecord(state, '2109')) === '{"type":"tasks","id":"2109"}');
ok('Lookup reports an item that has not loaded', findLinkedRecord(state, 'NOPE') === null);

/* DL-5: the one link format, never local. */
ok('buildDeepLink writes a task link', buildDeepLink('https://ops.nitda.gov.ng/', { taskId: 12 }) === 'https://ops.nitda.gov.ng/?TaskID=12');
ok('buildDeepLink writes an item link', buildDeepLink('https://ops.nitda.gov.ng/', { referenceId: 'A B' }) === 'https://ops.nitda.gov.ng/?ref=A+B');
let threw = false; try { buildDeepLink('http://localhost:8080/', { taskId: 1 }); } catch { threw = true; }
ok('buildDeepLink refuses a local base', threw);

/* The resolver uses the tested parser, replaces stale context, and the bell and Lookup use it. */
const resolver = fs.readFileSync(path.join(ROOT, 'core/deeplink-resolver.js'), 'utf8');
ok('the resolver parses with core/deeplink-parse.js', /import \{ parseDeepLink \} from '\.\/deeplink-parse\.js'/.test(resolver));
ok('a new link replaces the previous link\'s context', !resolver.includes('...(current.deepLinkContext'));
ok('Lookup opens the linked item', fs.readFileSync(path.join(ROOT, 'modules/lookup.js'), 'utf8').includes('findLinkedRecord('));
ok('the bell opens items through the resolver', fs.readFileSync(path.join(ROOT, 'shared/shell.js'), 'utf8').includes('DeepLinkResolver.openRef'));
/* The Platform Hub and its ?to= forwarding were retired on 2026-10-22: the Centre's Portfolio is the front door. */

/* The production host and the forwarders that keep old page names working. */
ok('the production base is a real https host', /^https:\/\/(?!localhost)[^/]+\/$/.test(DeepLinkConfig.productionBase));
const pkgSrc = fs.readFileSync(path.join(ROOT, 'scripts/package.mjs'), 'utf8');
for (const page of Object.keys(DeepLinkConfig.pathRoutes)) {
  const file = fs.readdirSync(ROOT).find(f => f.toLowerCase() === page);
  ok(`${page} has a forwarder at the root`, Boolean(file));
  if (!file) continue;
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  ok(`${file} forwards to the Workspace naming itself`, src.includes(`page=${file}`) && src.includes("location.replace('./index.html'"));
  ok(`${file} ships with the Workspace package`, pkgSrc.includes(`'${file}'`));
}
ok('a forwarded support link still opens support, not acknowledgement',
   p('/index.html?item=101&ref=BATCHID&page=support.html').route === 'assistant');
ok('a forwarded bulk link opens acknowledgement',
   p('/index.html?items=1,2&page=index_Bulk.html').route === 'acknowledgment');
ok('an unknown page name is ignored', p('/index.html?item=5&page=evil.html').route === 'acknowledgment');

const { platformHref } = await import('../config/platforms.data.js');
const hubLink = { id: 'hub', port: 8079, openPath: '/', prodUrl: null };
const wsLink = { id: 'runtime', port: 8080, openPath: '/', prodUrl: 'https://folio-platform.page.gd/' };
ok('in production, a local-only tool gets no link', platformHref(hubLink, { hostname: 'folio-platform.page.gd', protocol: 'https:' }) === null);
ok('in production, a published platform links to its address', platformHref(wsLink, { hostname: 'folio-platform.page.gd', protocol: 'https:' }) === 'https://folio-platform.page.gd/');
ok('locally, platforms link by port', platformHref(hubLink, { hostname: 'localhost', protocol: 'http:' }) === 'http://localhost:8079/');

/* The runbook's status board states the audit's numbers; it must not drift from them. */
{
  const { audit } = await import('../scripts/audit-deeplinks.mjs');
  const rows = audit();
  const live = rows.filter(r => r.inUse);
  const flows = new Set(live.map(r => r.flow)).size;
  const broken = live.filter(r => r.problems.some(p => /malformed|placeholder|is empty:|links nowhere|stuck/.test(p))).length;
  const runbook = fs.readFileSync(path.join(ROOT, 'docs/deployment/PLATFORM_ACCESS_RUNBOOK.md'), 'utf8');
  ok('the runbook states the audit\'s count of flows and actions', runbook.includes(`**${flows} flows, ${live.length} actions**`),
     `audit: ${flows} flows, ${live.length} actions`);
  ok('the runbook states the audit\'s count of broken links', runbook.includes(`**${broken} of those are broken`), `audit: ${broken}`);
  ok('the audit finds the empty Acknowledge button in the single-task email',
     live.some(r => r.action === 'Compose_Email_Notification_Template_3' && /Acknowledge Receipt/.test(r.label || '')));
  ok('a whole-value replacement keeps the query the flow appends to',
     live.some(r => r.action === 'APP_FAST_TRACK_LINK' && r.change === 'https://folio-platform.page.gd/?DGOPID='));
  ok('the spec points to the runbook', fs.readFileSync(path.join(ROOT, 'docs/architecture/PLATFORM_ACCESS_SPEC.md'), 'utf8').includes('PLATFORM_ACCESS_RUNBOOK.md'));
}

/* DL-1: links must survive sign-in once auth is enforced (browser proof: tests/deeplinks-signin.spec.js). */
{
  const { RoleRouteAccess } = await import('../config/rbac.config.js');
  const { AuthConfig } = await import('../config/auth.config.js');
  const assignable = Object.entries(RoleRouteAccess).filter(([, r]) => r.includes('response-tracking'));
  ok('every role that sees tasks can open the Acknowledgment Queue its emails link to',
     assignable.every(([, r]) => r.includes('acknowledgment')),
     assignable.filter(([, r]) => !r.includes('acknowledgment')).map(([k]) => k).join(', '));
  ok('only the two identity endpoints may be called before sign-in',
     JSON.stringify(AuthConfig.identityEndpoints) === '["OTP_GENERATE","OTP_VERIFY"]');
  const dc = fs.readFileSync(path.join(ROOT, 'core/data-client.js'), 'utf8');
  ok('the identity endpoints skip the sign-in gate and carry no proof', /establishesIdentity\?\{\}:await authHeaders\(\)/.test(dc) && /if\(!establishesIdentity\) await ensureAuthenticated/.test(dc));
  const otp = fs.readFileSync(path.join(ROOT, 'core/otp-identity.js'), 'utf8');
  ok('a governed action waits for sign-in instead of failing', /if \(!isSignedIn\(\)\) await acquireInteractively\(\)/.test(otp) && otp.includes('export function setSignInPrompt'));
  ok('the code calls never show the generic flow-execution confirmation', (otp.match(/skipConfirmation: true/g) || []).length === 2);
  const boot = fs.readFileSync(path.join(ROOT, 'core/boot.js'), 'utf8');
  ok('boot signs in before drawing, and registers the real sign-in dialog', boot.includes('setSignInPrompt(') && boot.includes('await getAccessToken()'));
  ok('the demo welcome sign-in is not shown when auth is enforced', /if\(!isAuthEnforced\(\)\)\{ const wel=/.test(boot));
  const ack = fs.readFileSync(path.join(ROOT, 'core/acknowledgement-service.js'), 'utf8');
  ok('when enforced, the acknowledging person is the signed-in identity, never a link or the local profile',
     /if \(isAuthEnforced\(\)\) \{\s*const id = getIdentity\(\);/.test(ack) && ack.includes("source: 'verified-proof'"));
}

if (failures.length) { console.log(`\n  ${passed} passed, ${failures.length} FAILED\n`); process.exit(1); }
console.log(`\n  ✅ ${passed}/${passed} assertions hold\n`);
