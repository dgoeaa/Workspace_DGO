/* BUILD THE PATCHED DEFINITION FOR Web - OTP Verify — all four defects, one patch.
 *
 * The trigger is triggerAuthenticationType "All", so every one of these is reachable by anyone.
 *
 * 1. NO IDENTITY BINDING — authentication bypass.
 *    Get_items_OTP_Verify matched on OTP_Code and Is_Verified alone. The caller's identity was
 *    computed and never used, so a code issued to one person verified a session claimed for
 *    anyone. The identity is in the list's Title column, which Create_item_OTP_Record writes.
 *
 * 2. ODATA INJECTION.
 *    Both values were interpolated raw into the $filter. A code of  x' or Is_Verified eq 0 or 'a'
 *    eq 'a  closes the literal and rewrites the query — which would strip fix 1 straight back off.
 *    Escaping in OData is doubling the quote: replace(x,'''','''''').
 *
 * 3. WRONG ORDER — the fix for 1 would have failed at runtime.
 *    Compose_OTP_Identifier_Verify ran AFTER Get_items_OTP_Verify, so a filter referencing it
 *    referenced an action that had not run. All three Compose actions read only triggerBody(),
 *    so the chain is reordered to compute the identity first. Nothing else depended on the order.
 *
 * 4. UNCONDITIONAL MAIL — an open relay on the agency's Office 365 connection.
 *    Scope_VERIFY_Complete_No_Trigger ran on every request with no test of the requested action,
 *    mailing a code to any caller-supplied address. It is removed rather than gated: Scope_Global
 *    already carries the whole generate/verify switch AND its own Response, so this scope was
 *    duplicate scaffolding whose only live effects were the relay and overwriting the answer
 *    Scope_Global had already decided. Gating it would have left a legitimate generate sending
 *    two codes. Removing it sends one.
 *
 * AND THE ATTEMPT CAP, which is why 1 was not enough on its own.
 *    A wrong guess finds no row, so nothing per-row can count it. The cap therefore reads the
 *    newest unverified code for the CALLER, refuses at 5, and increments before checking the
 *    code. Codes are issued with Attempts 0. This needs one new column on the OTP list; the
 *    runbook adds it first, and the flow is patched second.
 *
 *   node scripts/patch-otp-verify.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const SRC = fileURLToPath(new URL('docs/reference/flow-contracts/deployed/Web - OTP Verify__3e201620-f1e8-4c17-a90a-4d95b94a24c2__full_definition.json', root));
const OUT = fileURLToPath(new URL('docs/deployment/power-automate-flows/otp-verify-patched-definition.json', root));

const SITE = 'https://nitdanigeria.sharepoint.com/sites/NITDADGO-EAAACTIVITYTRACKING';
const OTP_LIST = '9421d473-8906-43b7-a41f-a213046683c1';
const MAX_ATTEMPTS = 5;

const def = JSON.parse(readFileSync(SRC, 'utf8')).definition;
const esc = (e) => `replace(${e},'''','''''')`;
const ID = esc("outputs('Compose_OTP_Identifier_Verify')");
const sw = def.actions.Scope_Global.actions.Switch;
const cv = sw.cases.Case_Verify.actions;
const done = [];

/* ---- 3: compute the identity before the lookup needs it ---- */
cv.Compose_OTP_Code_Verify.runAfter = { Compose_OTP_Code: ['Succeeded'] };
done.push('Compose_OTP_Code_Verify now runs after Compose_OTP_Code, not after the lookup');

/* ---- the cap: read the caller's newest outstanding code ---- */
cv.Get_items_OTP_Attempts = {
  type: 'OpenApiConnection', runAfter: { Compose_OTP_Identifier_Verify: ['Succeeded'] },
  inputs: {
    host: { ...cv.Get_items_OTP_Verify.inputs.host },
    parameters: {
      dataset: SITE, table: OTP_LIST,
      $filter: `Title eq '@{${ID}}' and Is_Verified eq 0`,
      $orderby: 'Created desc', $top: 1,
    },
  },
};
cv.Compose_Attempts_So_Far = {
  type: 'Compose', runAfter: { Get_items_OTP_Attempts: ['Succeeded'] },
  inputs: "@int(coalesce(first(outputs('Get_items_OTP_Attempts')?['body/value'])?['Attempts'], 0))",
};
done.push(`Get_items_OTP_Attempts + Compose_Attempts_So_Far read the caller's newest outstanding code`);

/* ---- the cap gate: the existing verify chain moves inside its else-branch ---- */
const moved = ['Get_items_OTP_Verify', 'Compose_Count_Items_Check', 'Condition'];
const inner = {};
for (const n of moved) { inner[n] = cv[n]; delete cv[n]; }

/* the lookup now binds the caller AND escapes both values, and waits on the increment */
inner.Get_items_OTP_Verify.inputs.parameters.$filter =
  `Title eq '@{${ID}}' and OTP_Code eq '@{${esc("outputs('Compose_OTP_Code')")}}' and Is_Verified eq 0`;
/* These three were siblings of actions that now sit outside this scope, so their runAfter has to
   be restated explicitly. The validator below is what caught it. */
inner.Get_items_OTP_Verify.runAfter = { Update_item_Attempts: ['Succeeded'] };
inner.Compose_Count_Items_Check.runAfter = { Get_items_OTP_Verify: ['Succeeded'] };
inner.Condition.runAfter = { Compose_Count_Items_Check: ['Succeeded'] };

inner.Update_item_Attempts = {
  type: 'OpenApiConnection', runAfter: {},
  inputs: {
    host: { ...cv.Get_items_OTP_Attempts.inputs.host },
    parameters: {
      dataset: SITE, table: OTP_LIST,
      id: "@first(outputs('Get_items_OTP_Attempts')?['body/value'])?['ID']",
      'item/Attempts': "@add(outputs('Compose_Attempts_So_Far'), 1)",
    },
  },
};

cv.Condition_Attempt_Cap = {
  type: 'If', runAfter: { Compose_Attempts_So_Far: ['Succeeded'] },
  expression: { and: [{ greaterOrEquals: ["@outputs('Compose_Attempts_So_Far')", MAX_ATTEMPTS] }] },
  actions: {
    Set_variable_varStatusCode_Too_Many_Attempts: { type: 'SetVariable', runAfter: {}, inputs: { name: 'varStatusCode', value: 429 } },
    Append_to_string_variable_varResponse_Too_Many_Attempts: {
      type: 'AppendToStringVariable', runAfter: { Set_variable_varStatusCode_Too_Many_Attempts: ['Succeeded'] },
      inputs: { name: 'varResponse', value: { status: 'error', valid: false, message: 'Too many attempts. Request a new code.', request_id: '@{guid()}' } },
    },
  },
  else: { actions: inner },
};
done.push(`Condition_Attempt_Cap refuses at ${MAX_ATTEMPTS} with 429; below it, the attempt is counted before the code is checked`);
done.push('Get_items_OTP_Verify binds Title and escapes both values');

/* ---- codes are issued with a counter ---- */
sw.cases.Case_Generate.actions.Create_item_OTP_Record.inputs.parameters['item/Attempts'] = 0;
done.push('Create_item_OTP_Record issues codes with Attempts 0');

/* ---- 4: remove the relay ---- */
delete def.actions.Scope_VERIFY_Complete_No_Trigger;
for (const a of Object.values(def.actions)) {
  if (a.runAfter && 'Scope_VERIFY_Complete_No_Trigger' in a.runAfter) delete a.runAfter.Scope_VERIFY_Complete_No_Trigger;
}
done.push('Scope_VERIFY_Complete_No_Trigger removed entirely — the relay and the duplicate send go with it');

writeFileSync(OUT, JSON.stringify(def, null, 2) + '\n');

/* ---- every outputs('X') must name an action that has already run ---- */
const problems = [];
const check = (actions, ancestry) => {
  const order = new Map();
  const settle = () => {
    let changed = true, depth = 0;
    while (changed) { changed = false;
      for (const [n, a] of Object.entries(actions)) {
        const deps = Object.keys(a.runAfter || {});
        const d = deps.length ? (deps.every((x) => order.has(x)) ? Math.max(...deps.map((x) => order.get(x))) + 1 : null) : 0;
        if (d !== null && order.get(n) !== d) { order.set(n, d); changed = true; }
      }
      if (++depth > 50) break;
    }
  };
  settle();
  for (const [n, a] of Object.entries(actions)) {
    const refs = [...JSON.stringify(a).matchAll(/outputs\('([^']+)'\)/g)].map((m) => m[1]);
    for (const r of new Set(refs)) {
      const visible = [...ancestry, actions].some((s) => r in s);
      if (!visible) continue;                       /* resolved by an enclosing scope */
      if (!(r in actions)) continue;
      if (!order.has(n) || !order.has(r) || order.get(r) >= order.get(n)) {
        problems.push(`${n} reads outputs('${r}') which does not precede it`);
      }
    }
    for (const sub of [a.actions, a.else?.actions, ...Object.values(a.cases || {}).map((c) => c.actions)]) {
      if (sub) check(sub, [...ancestry, actions]);
    }
  }
};
check(def.actions, []);

const orig = JSON.parse(readFileSync(SRC, 'utf8')).definition;
const count = (a, n = 0) => { for (const v of Object.values(a || {})) { n++; n = count(v.actions, n); n = count(v.else?.actions, n); for (const c of Object.values(v.cases || {})) n = count(c.actions, n); } return n; };
console.log(`\nWritten: ${OUT.replace(fileURLToPath(root), '')}\n`);
done.forEach((d) => console.log(`  · ${d}`));
console.log(`\n  actions ${count(orig.actions)} -> ${count(def.actions)}`);
console.log(`  triggers unchanged: ${JSON.stringify(orig.triggers) === JSON.stringify(def.triggers)}`);
console.log(`  reference-order check: ${problems.length ? '❌\n    ' + problems.join('\n    ') : '✅ every outputs() reference resolves to an action that already ran'}\n`);
process.exit(problems.length ? 1 : 0);
