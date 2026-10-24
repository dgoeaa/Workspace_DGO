/* The wiring specification has to be coherent, whether or not the tenant matches it yet.
 *
 * Two different things are being checked in this repository and confusing them would make the
 * build lie. Whether the deployed flows ARE wired is a target - 0 of 41 operations today - and
 * asserting it here would leave the suite red until an unrelated piece of tenant work lands.
 * That check is `npm run test:wiring`, a strict acceptance gate run deliberately.
 *
 * What this file asserts is what must be true right now: that the specification names real
 * lists, agrees with the field specification about their GUIDs, keeps the boundary it claims
 * to define, and that the one sanctioned crossing is present in a deployed definition. A
 * wiring spec that pointed at a list nobody provisioned would produce a gap register nobody
 * could act on, and it would look exactly like a real finding. */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log('  ✅ ' + name); return; }
  failed++; console.log('  ❌ ' + name + (detail ? '\n     ' + detail : ''));
};

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const wiring = JSON.parse(read('docs/deployment/sharepoint/portal-wiring.json'));
const spec = JSON.parse(read('docs/deployment/sharepoint/portal-field-spec.json'));
const index = JSON.parse(read('docs/reference/sharepoint-list-index.json'));

console.log('\nPortal wiring specification');

const specByTitle = new Map(spec.lists.map((l) => [l.listTitle, l]));
const allOps = wiring.endpoints.flatMap((e) => e.requiredOperations);

// 1. Every list the wiring names is a list that exists and was provisioned.
ok('every list the wiring names is in the field specification',
   allOps.every((o) => specByTitle.has(o.list)),
   'unknown: ' + [...new Set(allOps.filter((o) => !specByTitle.has(o.list)).map((o) => o.list))].join(', '));
ok('every GUID the wiring names matches the field specification',
   allOps.every((o) => specByTitle.get(o.list)?.listGuid.toLowerCase() === o.listGuid.toLowerCase()),
   allOps.filter((o) => specByTitle.get(o.list) && specByTitle.get(o.list).listGuid.toLowerCase() !== o.listGuid.toLowerCase())
     .map((o) => o.list).join(', '));
ok('every GUID resolves in the tenant list index',
   allOps.every((o) => index.lists[o.listGuid.toLowerCase()]),
   allOps.filter((o) => !index.lists[o.listGuid.toLowerCase()]).map((o) => o.list).join(', '));
ok('every list names the site the index puts it on',
   allOps.every((o) => index.lists[o.listGuid.toLowerCase()]?.site === o.site),
   allOps.filter((o) => index.lists[o.listGuid.toLowerCase()]?.site !== o.site).map((o) => `${o.list}: ${o.site}`).join(', '));

// 2. The wiring covers the portal estate exactly - no list wired twice, none left unaccounted.
const wired = new Set(allOps.map((o) => o.list));
if (wiring.bridge?.list) wired.add(wiring.bridge.list);
const portalLists = spec.lists.filter((l) => l.estate === 'Document portal').map((l) => l.listTitle);
/* Since D11 put WRITEBACK in scope, every provisioned portal list has a writer. The unwired set
   is no longer asserted in the specification — it is derived by the verifier from the endpoints'
   own required operations, because an asserted one went stale the moment WRITEBACK began writing
   Portal Audit Events. So the assertion here is the stronger one: nothing is left over. */
ok('every provisioned portal list is named by some endpoint or by the bridge',
   portalLists.every((t) => wired.has(t)),
   'unaccounted: ' + portalLists.filter((t) => !wired.has(t)).join(', '));
ok('the specification no longer asserts an unwired set',
   wiring.unwiredLists === undefined && typeof wiring.unwiredListsNote === 'string',
   'a hardcoded unwiredLists array is exactly what went stale before');

// 3. The boundary the specification claims is the boundary it describes. A governance list
//    appearing anywhere in the portal wiring would contradict the stated principle outright.
const governanceGuids = new Set(Object.entries(index.lists)
  .filter(([, l]) => l.site === 'DGO_ECM_GOVERNANCE').map(([g]) => g));
ok('no portal endpoint is wired to a governance list',
   !allOps.some((o) => governanceGuids.has(o.listGuid.toLowerCase())),
   allOps.filter((o) => governanceGuids.has(o.listGuid.toLowerCase())).map((o) => o.list).join(', '));
ok('every write outside the portal estate is declared as an exception',
   wiring.endpoints.every((e) => (e.alsoWrites || []).every((a) => a.why && a.target)),
   'an undeclared external write is a boundary hole by another name');

/* The two assertions above read the SPECIFICATION. That is half the boundary and it was the
   weaker half: a portal flow can touch anything at all and neither notices, because a spec that
   never mentions the touch cannot contradict itself about it. The deployed CG_Writeback_Endpoint
   reads Flow Configuration on the internal operations site, and both passed while it did.
   The principle names two estates — "the internal operations estate or any DGO_* governance
   list" — and the governance assertion covers one. So this measures what the DEFINITIONS do,
   using the same sweep `npm run wiring` reports, and requires every touch outside the twelve
   portal lists to be declared. Declared is not the same as permitted: a crossing may sit in
   declaredCrossings with state UNRESOLVED, which is how a violation stays visible while the
   decision to accept or remove it is still open. What must never happen again is a portal flow
   reaching outside the boundary and nothing saying so. */
const measured = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL('scripts/verify-portal-wiring.mjs', root)), '--json'], { encoding: 'utf8' })).boundary;
const declaredCrossings = wiring.declaredCrossings || [];
/* Expanded over appliesToEndpoints, exactly as the package check below does.
   This keyed on the single `endpoint` a declaration is filed under, so D16 — which accepts the
   Flow Configuration read for ALL SEVEN portal endpoints and says so in appliesToEndpoints —
   covered only the one it happened to be written against. The moment the other six were exported
   from the tenant carrying the same accepted read, five of them reported as undeclared crossings.
   Two matchers for one declaration is how a decision gets re-litigated by a test. */
const coversDeployed = (c) => declaredCrossings.some((d) => d.list === c.list && d.operation === c.operation
  && (d.appliesToEndpoints || [d.endpoint]).includes(c.endpoint));
ok('the deployed definitions were measured, not just the specification read',
   Array.isArray(measured), 'verify-portal-wiring.mjs --json did not return a boundary array');
const undeclared = measured.filter((c) => !coversDeployed(c));
ok('every measured crossing of the portal boundary is declared',
   undeclared.length === 0,
   undeclared.map((c) => `${c.endpoint} ${c.operation} ${c.site}/${c.list}`).join('; '));
ok('every declared crossing says what it contradicts and whether it is settled',
   declaredCrossings.every((c) => c.contradicts && ['UNRESOLVED', 'ACCEPTED', 'REMOVED'].includes(c.state)),
   declaredCrossings.filter((c) => !c.contradicts || !c.state).map((c) => c.list).join(', '));
/* ACCEPTED is the state that can rot. An unresolved crossing is loud by construction; an accepted
   one reads as settled forever unless it carries the decision that settled it, the bounds of what
   was settled, and what would reverse it. Without those three a reader cannot tell an accepted
   risk from an abandoned one. */
const accepted = declaredCrossings.filter((c) => c.state === 'ACCEPTED');
const decisionsMd = readFileSync(new URL('docs/deployment/sharepoint/DECISIONS.md', root), 'utf8');
ok('every accepted crossing cites a decision record that exists and names it',
   accepted.every((c) => typeof c.decisionRecord === 'string'
     && decisionsMd.includes(`## ${(c.decisionRecord.match(/\b(D\d+)\b/) || [])[1]} `)),
   accepted.filter((c) => !c.decisionRecord).map((c) => c.list).join(', '));
ok('every accepted crossing states its bounds and what would reverse it',
   accepted.every((c) => c.boundedTo && c.reverses),
   accepted.filter((c) => !c.boundedTo || !c.reverses).map((c) => c.list).join(', '));
ok('no declared crossing is a WRITE outside the portal estate',
   declaredCrossings.every((c) => c.operation === 'read'),
   declaredCrossings.filter((c) => c.operation !== 'read').map((c) => `${c.endpoint} ${c.operation} ${c.list}`).join('; '));
/* And the guard must actually be able to fire — a crossing the sweep reports but nobody declared. */
ok('the rule would catch an undeclared crossing',
   [{ endpoint: 'SUPPORT', list: 'Global Tracking Queue', operation: 'read' }]
     .filter((c) => !coversDeployed(c)).length === 1);
/* And it must still catch an endpoint the declaration does NOT cover, now that one declaration
   can cover several. A list-and-operation match alone would wave through any endpoint at all. */
ok('an endpoint outside appliesToEndpoints is not covered by that declaration',
   [{ endpoint: 'NOT_AN_ENDPOINT', list: 'Flow Configuration', operation: 'read' }]
     .filter((c) => !coversDeployed(c)).length === 1);

/* THE DEPLOYED SET IS ALWAYS ONE PASTE BEHIND, SO THE PACKAGES ARE MEASURED TOO.
   Everything above reads definitions exported from the tenant, which cannot show what the next
   deployment does. All seven portal packages read Flow Configuration on the internal operations
   site and the sweep reported one crossing while seven were staged — the finding was true, and
   nothing here could have found it. A package crossing is checked against the same declarations,
   matched on the endpoint list the accepting decision names rather than on the deployed flow, so
   a crossing introduced into a package fails here BEFORE it is pasted, which is the only moment
   removing it is cheap. */
const pkgMeasured = JSON.parse(execFileSync(process.execPath,
  [fileURLToPath(new URL('scripts/verify-portal-wiring.mjs', root)), '--json'], { encoding: 'utf8' })).packageBoundary;
ok('the designer-paste packages were measured, not only the deployed definitions',
   Array.isArray(pkgMeasured) && pkgMeasured.length > 0,
   'no package crossing measured at all — the walk has stopped seeing the packages');
const coveredBy = (c) => declaredCrossings.some((d) => d.list === c.list && d.operation === c.operation
  && (d.appliesToEndpoints || [d.endpoint]).includes(c.endpoint));
const undeclaredPkg = pkgMeasured.filter((c) => !coveredBy(c));
ok('every crossing a portal package would introduce is already declared and accepted',
   undeclaredPkg.length === 0,
   undeclaredPkg.map((c) => `${c.package} ${c.operation}s ${c.site}/${c.list}`).join('; '));
ok('a declaration that names endpoints names only endpoints the wiring knows',
   declaredCrossings.every((d) => (d.appliesToEndpoints || [])
     .every((n) => wiring.endpoints.some((e) => e.endpoint === n))),
   'an endpoint name in appliesToEndpoints that no endpoint carries would silently cover nothing');
ok('the package rule would catch a crossing nobody accepted',
   !coveredBy({ endpoint: 'STATUS', list: 'DGO_EndpointRegistry', operation: 'read' }));

// 4. The endpoints are the endpoints the public site actually calls.
const cfg = read('document-portal/config.example.js');
const clientKeys = [...cfg.matchAll(/^\s{4}([A-Z_]+):\s*""/gm)].map((m) => m[1]);
ok('the portal client contract was parsed', clientKeys.length > 0);
ok('the wiring covers every endpoint the portal client calls',
   clientKeys.every((k) => wiring.endpoints.some((e) => e.endpoint === k)),
   'unwired: ' + clientKeys.filter((k) => !wiring.endpoints.some((e) => e.endpoint === k)).join(', '));
/* An endpoint the shipped client never calls used to be, without exception, a stale entry. Since
   D11 that is no longer true: WRITEBACK is in scope by sponsor decision and this build implements
   neither the call nor the key. So the rule is not "the client calls it" but "either the client
   calls it, or the specification says plainly that nothing does and cites the decision" — which
   is the difference between a gap someone owns and a gap nobody noticed. */
const unCalled = wiring.endpoints.filter((e) => !clientKeys.includes(e.endpoint));
ok('every endpoint the client does not call is declared as such, with its decision',
   unCalled.every((e) => typeof e.notDeployed === 'string' && /D\d+/.test(e.notDeployed)),
   'undeclared: ' + unCalled.filter((e) => !e.notDeployed || !/D\d+/.test(e.notDeployed)).map((e) => e.endpoint).join(', '));
ok('an endpoint declared as uncalled has no deployed flow candidate either',
   unCalled.every((e) => !(e.deployedFlowCandidates || []).length),
   'claims a candidate while declaring nothing calls it: ' + unCalled.filter((e) => (e.deployedFlowCandidates || []).length).map((e) => e.endpoint).join(', '));

// 5. The one sanctioned crossing exists in a deployed definition, and is read-only.
let report;
try {
  report = JSON.parse(execFileSync(process.execPath,
    [fileURLToPath(new URL('scripts/verify-portal-wiring.mjs', root)), '--json'], { encoding: 'utf8' }));
} catch (err) {
  report = null;
  ok('the wiring report runs', false, String(err.message).slice(0, 300));
}
if (report) {
  ok('the wiring report runs against the deployed definitions', report.totals.deployedDefinitionsRead > 0,
     `${report.totals.deployedDefinitionsRead} definitions read`);
  /* This asserted the bridge reads Portal Registry, and passed — off a superseded export. One
     workflow was in the deployed directory twice, renamed and rebuilt between captures, and
     resolving by display name matched the older copy. The assertion is now that the SPECIFICATION
     matches the MEASUREMENT, in both directions: an entry claiming health the sweep cannot see
     fails, and so does a recorded failure that has quietly been fixed. The state itself is open
     item 37 and needs the tenant, which is why it is declared rather than asserted away. */
  const declaredBridge = wiring.bridge.measuredState;
  ok('the bridge entry records what the sweep actually measures', Boolean(declaredBridge),
     'portal-wiring.json bridge carries no measuredState, so nothing constrains what it claims');
  if (declaredBridge) {
    ok(`the bridge ${wiring.bridge.flow} is in the state the specification records`,
       declaredBridge.presentUnderThisName === report.bridge.present
       && declaredBridge.readsPortalRegistry === report.bridge.readsPortalRegistry,
       `recorded present=${declaredBridge.presentUnderThisName} readsPortalRegistry=${declaredBridge.readsPortalRegistry}; `
       + `measured present=${report.bridge.present} readsPortalRegistry=${report.bridge.readsPortalRegistry}`);
    ok('a recorded bridge failure cites the evidence and the open item that carry it',
       Boolean(declaredBridge.readsPortalRegistry) || (typeof declaredBridge.evidence === 'string'
         && existsSync(new URL(declaredBridge.evidence, root)) && Number.isInteger(declaredBridge.openItem)),
       'a bridge recorded as not reading Portal Registry must name the evidence file and the open item');
  }
  /* No export may be answered for by a copy of itself that a later capture replaced. */
  ok('no superseded export is used to answer for a live flow',
     (report.supersededExports || []).every((e) => e.liveExport && e.liveExportedAtUtc > e.exportedAtUtc),
     (report.supersededExports || []).filter((e) => !e.liveExport).map((e) => e.supersededFile).join(', '));
  /* Not an assertion that the tenant is wired - that is npm run test:wiring. This only says the
     report is telling us something, so a silently empty register cannot read as success. */
  console.log(`     state: ${report.totals.satisfiedOperations}/${report.totals.requiredOperations} operations, ` +
              `${report.totals.boundaryCrossings} boundary crossing(s) — run \`npm run wiring\` for the register`);
}

// 6. The circles are built out of operations the wiring declares. A circle step naming an
//    operation no endpoint performs would describe a loop nobody can implement, and it would
//    read as a design rather than as a gap.
const circles = JSON.parse(read('docs/deployment/sharepoint/portal-circles.json'));
const declared = new Set(allOps.map((o) => `${o.listGuid.toLowerCase()}|${o.operation}`));
const orphanSteps = [];
for (const c of circles.circles) {
  for (const st of c.steps) {
    for (const o of st.on || []) {
      /* C6 and C7 are not endpoint circles - the crossing and the write-back are performed by
         internal flows, so their operations are deliberately outside the endpoint wiring. */
      if (['C6', 'C7'].includes(c.id)) continue;
      if (!declared.has(`${o.listGuid.toLowerCase()}|${o.operation}`) && !o.note?.includes('UNWIRED')) {
        orphanSteps.push(`${c.id} step ${st.n}: ${o.operation} ${o.list}`);
      }
    }
  }
}
ok('every endpoint-circle step is an operation the wiring declares', orphanSteps.length === 0,
   orphanSteps.join('\n     '));
ok('every circle names a list that exists',
   circles.circles.every((c) => c.steps.every((st) => (st.on || []).every((o) => index.lists[o.listGuid.toLowerCase()]))),
   'a circle names a list absent from the tenant index');
ok('the open circle is declared open rather than left to be inferred',
   circles.circles.some((c) => c.built === false && c.consequence),
   'C7 must carry built:false and a stated consequence');
ok('the circle totals match its contents',
   circles.totals.circles === circles.circles.length
     && circles.totals.open === circles.circles.filter((c) => c.built === false).length
     && circles.totals.steps === circles.circles.reduce((n, c) => n + c.steps.length, 0),
   JSON.stringify(circles.totals));

// 7. The remediation artifact must point at the estate the wiring says is correct.
const otp = JSON.parse(read('docs/deployment/sharepoint/remediation/01-otp-estate-split.json'));
const otpList = spec.lists.find((l) => l.listTitle === 'Portal OTP Codes');
ok('the OTP remediation targets the provisioned Portal OTP Codes list',
   otp.to.table.toLowerCase() === otpList.listGuid.toLowerCase() && otp.to.site === otpList.site,
   `${otp.to.table} / ${otp.to.site} vs ${otpList.listGuid} / ${otpList.site}`);
ok('every column the OTP remediation writes exists on the target list',
   otp.columnMapping.every((m) => m.to === 'Title' || otpList.fields.some((f) => f.internalName === m.to)),
   otp.columnMapping.filter((m) => m.to !== 'Title' && !otpList.fields.some((f) => f.internalName === m.to)).map((m) => m.to).join(', '));
ok('the remediation leaves the internal sign-in flows alone',
   otp.doNotChange.length === 2 && otp.doNotChange.every((d) => d.why),
   'Web - OTP Generate and Web - OTP Verify must be explicitly excluded, with the reason');

// 8. Every decision that changed a specification is recorded, and every reserved list carries
//    its reason. A list quietly dropped from the required set and a list deliberately reserved
//    look identical in a diff; only the stated reason tells them apart six months later.
const decisions = read('docs/deployment/sharepoint/DECISIONS.md');
ok('a scope change to the endpoint set states the decision that made it',
   !wiring.scopeNote || /D\d+/.test(wiring.scopeNote),
   'scopeNote must cite the decision that changed the scope');
const cited = ['D1', 'D2', 'D3', 'D4', 'D5', 'D11'];
ok('the decision record covers every decision the specifications cite',
   cited.every((d) => decisions.includes(`## ${d} `)),
   'missing from DECISIONS.md: ' + cited.filter((d) => !decisions.includes(`## ${d} `)).join(', '));

/* D1 turns the crossing into a two-way door. The principle statement has to say so - a boundary
 * document that still claims read-only would be describing a flow that no longer exists. */
ok('the stated principle matches what the crossing now does',
   wiring.bridge.writesBack
     ? wiring.principle.includes('TENANT-AUTHENTICATED') && !/\bread-only\b/.test(wiring.principle.split('not that it is')[0])
     : true,
   'the crossing writes back, so the principle must rest on tenant authentication rather than on read-only');
ok('the write-back stays inside the portal estate',
   (wiring.bridge.writesBack?.operations || []).every((o) => {
     const l = index.lists[o.listGuid.toLowerCase()];
     return l && spec.lists.some((s) => s.listTitle === l.title && s.estate === 'Document portal');
   }),
   'a write-back operation targets a list outside the portal estate');

// 9. D6 - the retained records are declared, and the reference minting that must not inherit
//    the legacy expression is pinned to the counter that makes it collision-free.
ok('the retained NITDA_Central_Registry records are declared with their position and risk',
   Boolean(wiring.retainedRecords?.decision && wiring.retainedRecords.position && wiring.retainedRecords.riskAssessed),
   'portal-wiring.json must carry retainedRecords with decision, position and riskAssessed');
const submission = wiring.endpoints.find((e) => e.endpoint === 'SUBMISSION');
ok('SUBMISSION pins reference minting to Portal Sequence Counters',
   submission?.referenceMinting?.source === 'Portal Sequence Counters' && Boolean(submission.referenceMinting.mustNotUse),
   'the ticks() expression carries a thousand-value namespace into the new estate if it is inherited');
ok('SUBMISSION is wired to every operation minting a reference needs',
   ['read', 'create', 'update'].every((o) => submission.requiredOperations
     .some((r) => r.list === 'Portal Sequence Counters' && r.operation === o)),
   'a counter read without a conditional update is not concurrency-safe');
ok('D6 is in the decision record', decisions.includes('## D6 '));

console.log(failed ? `\n❌ ${failed} failed` : '\n✅ all passed');
process.exit(failed ? 1 : 0);
