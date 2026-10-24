/* GOV-04's changes (scripts/lib/gov04-fix.mjs), checked against the definition captured from the tenant. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixGov04, actionsByName, SCOPE, OLD_LINK, NEW_LINK, NEW_LABEL, HTML_ACTIONS, RECOVERED, STRAY, CONFIG_FROM } from '../scripts/lib/gov04-fix.mjs';

const CAPTURE = 'docs/folio-Master-Flows-and-Endpoints/contracts/deployed/04 - GOV - Audit HTTP Flow Registry__3e9e1342-5027-4c0f-bdd3-1e06aa7f2a3b__full_definition.json';
const captured = JSON.parse(fs.readFileSync(CAPTURE, 'utf8')).definition;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log(`  ✅ ${name}`); } catch (e) { fail++; console.log(`  ❌ ${name}\n       ${e.message}`); } };

const r = fixGov04(captured);
const all = actionsByName(r.definition.actions[SCOPE].actions);

t('the captured GOV-04 is recognised, with nothing it cannot place', () => assert.deepEqual(r.problems, []));
t('all five alert e-mails link to the Folio Admin Suite, and none to the list item', () => {
  for (const n of HTML_ACTIONS) {
    assert.ok(all[n].inputs.includes(NEW_LINK), `${n} has no Admin Suite link`);
    assert.ok(!all[n].inputs.includes(OLD_LINK), `${n} still links to the list item`);
  }
  assert.ok(!JSON.stringify(r.definition).includes(OLD_LINK));
});
t('three buttons say "Open in the Folio Admin Suite"', () => assert.equal(HTML_ACTIONS.filter((n) => all[n].inputs.includes(NEW_LABEL)).length, 3));
t('the failure threshold reads ConsecutiveFailureThreshold, the stale threshold StaleAfterDays', () => {
  assert.match(all.Filter_Failure_Config.inputs.where, /'consecutivefailurethreshold'/);
  assert.match(all.Filter_Stale_Config.inputs.where, /'staleafterdays'/);
});
t('an exception closes only when its condition has cleared', () => {
  assert.deepEqual(all.If_Exception_Recovered.expression, RECOVERED);
  assert.notDeepEqual(all.If_Exception_Recovered.expression, { and: [{ equals: ['', ''] }] });
});
t('the configuration filters read the SharePoint result directly, with no item() outside a loop', () => {
  const main = r.definition.actions[SCOPE].actions.Scope_Main.actions;
  for (const n of STRAY) assert.equal(main[n], undefined, `${n} is still there`);
  assert.equal(main.Filter_Stale_Config.inputs.from, CONFIG_FROM);
  assert.equal(main.Filter_Failure_Config.inputs.from, CONFIG_FROM);
  assert.deepEqual(main.Filter_Stale_Config.runAfter, { Get_Stale_Threshold: ['Succeeded'] });
  assert.deepEqual(main.Filter_Failure_Config.runAfter, { Filter_Stale_Config: ['Succeeded'] });
  assert.deepEqual(main.Validate_Audit_Configuration.runAfter, { Filter_Failure_Config: ['Succeeded'] });
  for (const [n, a] of Object.entries(main)) if (a.type !== 'Foreach') assert.ok(!/@\{?item\(\)/.test(JSON.stringify({ i: a.inputs })) || n.startsWith('Filter_'), `${n} calls item() outside a loop`);
});
t('nothing else changes', () => {
  const strip = (d) => {
    const c = JSON.parse(JSON.stringify(d));
    const a = actionsByName(c.actions[SCOPE].actions);
    for (const n of HTML_ACTIONS) a[n].inputs = '';
    a.Filter_Failure_Config.inputs.where = '';
    a.If_Exception_Recovered.expression = null;
    const main = c.actions[SCOPE].actions.Scope_Main.actions;
    for (const n of STRAY) delete main[n];
    for (const n of ['Filter_Stale_Config', 'Filter_Failure_Config']) { main[n].inputs.from = ''; main[n].runAfter = null; }
    return JSON.stringify(c);
  };
  assert.equal(strip(r.definition), strip(captured));
});
t('a second run changes nothing', () => { const again = fixGov04(r.definition); assert.equal(again.already, true); assert.deepEqual(again.problems, []); });
t('the captured definition itself is not modified', () => assert.ok(JSON.stringify(captured).includes(OLD_LINK)));
t('a flow edited since the capture is refused, not overwritten', () => {
  const edited = JSON.parse(JSON.stringify(captured));
  actionsByName(edited.actions[SCOPE].actions).If_Exception_Recovered.expression = { and: [{ equals: ['@true', true] }] };
  assert.ok(fixGov04(edited).problems.length > 0);
});
t('a different flow is refused', () => assert.ok(fixGov04({ actions: {} }).problems.length > 0));

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
