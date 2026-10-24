/* GOV-04 (04 - GOV - Audit HTTP Flow Registry): the changes its definition needs, as a pure function.
 *
 * GOV-04 is not built from an identification package, so `npm run flows:update` does not reach it. This transform is
 * applied to the definition read live from the tenant (scripts/gov04-update.mjs) and is checked against the captured
 * definition (tests/gov04-fix.test.mjs). It changes exactly three things and refuses to run if the flow no longer
 * looks the way these changes expect.
 *
 * 1. Release 42 (owner decision, 2026-10-20): the five alert e-mails link to the Folio Admin Suite, not to the
 *    DGO_HTTPFlowRegistry list item. deployment/NOTICE_LINKS.md, templates 4 to 8.
 * 2. Filter_Failure_Config selected the StaleAfterDays row, so the consecutive-failure audit used the stale-days number
 *    as its threshold. It now selects ConsecutiveFailureThreshold, as its name, Find_Failing_Flows and the run report
 *    all say it should.
 * 3. If_Exception_Recovered tested "" equals "", which is always true: every run closed every open exception and told
 *    its owner "[CLEARED]", including in the same run that had just sent a reminder for it (run of 2026-10-20 01:19
 *    UTC). It now closes an exception only when its condition has actually cleared: the registry record is no longer
 *    Active, or a stale flow has been seen within StaleAfterDays, or a failing flow is back under the threshold.
 * 4. The two configuration filters read Get_Stale_Threshold's result through four stray Compose actions, two of them
 *    calling item() outside any loop. The service ran them, but the designer refuses to save a flow that has them
 *    ("The input parameter(s) of operation 'Filter_Stale_Config' contains invalid expression(s)", 2026-10-21). Both
 *    filters now read the SharePoint result directly, in sequence, and the four Compose actions are gone.
 */

export const SCOPE = 'Scope_04_GOV_Audit_HTTP_Flow_Registry_COMPLETE_UPDATED';
export const OLD_LINK = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE/Lists/DGO_HTTPFlowRegistry/DispForm.aspx?ID=';
export const NEW_LINK = 'https://folio-platform.page.gd/?notice=http-flow-registry&record=';
export const OLD_LABEL = "'Open registry record'";
export const NEW_LABEL = "'Open in the Folio Admin Suite'";
export const HTML_ACTIONS = [
  'Compose_Stale_Owner_Notification_HTML',
  'Compose_Stale_Reminder_HTML',
  'Compose_Failure_Owner_Notification_HTML',
  'Compose_Failure_Reminder_HTML',
  'Compose_Recovery_Notification_HTML',
];
const OLD_FAILURE_KEY = "'staleafterdays')";
const NEW_FAILURE_KEY = "'consecutivefailurethreshold')";

const RECORD = "first(body('Get_Recovery_Registry_Record')?['value'])";
export const RECOVERED = {
  or: [
    { not: { equals: [`@coalesce(${RECORD}?['LifecycleStatus'],'')`, 'Active'] } },
    { and: [
      { equals: ["@item()?['ExceptionType']", 'StaleRegistration'] },
      { greaterOrEquals: [
        `@ticks(coalesce(${RECORD}?['LastSeenUtc'],'1900-01-01T00:00:00Z'))`,
        "@ticks(addDays(utcNow(),mul(-1,int(first(body('Filter_Stale_Config'))?['ConfigValue']))))",
      ] },
    ] },
    { and: [
      { equals: ["@item()?['ExceptionType']", 'ConsecutiveFailures'] },
      { less: [
        `@int(coalesce(${RECORD}?['ConsecutiveFailures'],0))`,
        "@int(first(body('Filter_Failure_Config'))?['ConfigValue'])",
      ] },
    ] },
  ],
};

export const STRAY = ['Compose', 'Compose_1', 'Compose_1_1', 'Compose_1_2'];
export const CONFIG_FROM = "@coalesce(body('Get_Stale_Threshold')?['value'],json('[]'))";

const clone = (v) => JSON.parse(JSON.stringify(v));

/* Every action under `actions`, however deeply nested (scopes, branches, loops), by name. */
export function actionsByName(actions, out = {}) {
  for (const [name, a] of Object.entries(actions || {})) {
    if (!a || typeof a !== 'object') continue;
    out[name] = a;
    actionsByName(a.actions, out);
    actionsByName(a.else?.actions, out);
    for (const c of Object.values(a.cases || {})) actionsByName(c.actions, out);
  }
  return out;
}

const count = (s, sub) => s.split(sub).length - 1;

/* Returns { definition, changes, already, problems }. `problems` non-empty means: do not write. */
export function fixGov04(definition) {
  const def = clone(definition);
  const problems = [];
  const changes = [];
  const scope = def?.actions?.[SCOPE];
  if (!scope) return { definition: def, changes, already: false, problems: [`no action named ${SCOPE}: this is not the GOV-04 the change was written for`] };
  const all = actionsByName(scope.actions);

  /* 1. Links and the button label. */
  let linksOld = 0, linksNew = 0;
  for (const name of HTML_ACTIONS) {
    const a = all[name];
    if (!a || typeof a.inputs !== 'string') { problems.push(`${name} is missing or not a text Compose`); continue; }
    linksOld += count(a.inputs, OLD_LINK);
    linksNew += count(a.inputs, NEW_LINK);
    if (a.inputs.includes(OLD_LINK)) {
      a.inputs = a.inputs.split(OLD_LINK).join(NEW_LINK).split(OLD_LABEL).join(NEW_LABEL);
    }
  }
  if (linksOld) changes.push(`${linksOld} registry link(s) now open the Folio Admin Suite`);
  else if (linksNew !== HTML_ACTIONS.length) problems.push(`expected ${HTML_ACTIONS.length} registry links, found ${linksOld} old and ${linksNew} new`);

  /* 2. The failure threshold reads its own configuration row. */
  const f = all.Filter_Failure_Config;
  if (!f || typeof f.inputs?.where !== 'string') problems.push('Filter_Failure_Config is missing or has no where clause');
  else if (f.inputs.where.includes(OLD_FAILURE_KEY)) {
    f.inputs.where = f.inputs.where.replace(OLD_FAILURE_KEY, NEW_FAILURE_KEY);
    changes.push('Filter_Failure_Config selects ConsecutiveFailureThreshold');
  } else if (!f.inputs.where.includes(NEW_FAILURE_KEY)) problems.push(`Filter_Failure_Config selects neither row: ${f.inputs.where}`);

  /* 3. An exception closes only when its condition has cleared. */
  const r = all.If_Exception_Recovered;
  if (!r || r.type !== 'If') problems.push('If_Exception_Recovered is missing');
  else if (JSON.stringify(r.expression) === JSON.stringify({ and: [{ equals: ['', ''] }] })) {
    r.expression = clone(RECOVERED);
    changes.push('If_Exception_Recovered closes an exception only when it has cleared');
  } else if (JSON.stringify(r.expression) !== JSON.stringify(RECOVERED)) problems.push('If_Exception_Recovered has a condition this change does not recognise; it was edited since the capture');

  /* 4. The configuration filters read the SharePoint result directly. */
  const main = scope.actions?.Scope_Main?.actions;
  const fs_ = main?.Filter_Stale_Config, ff = main?.Filter_Failure_Config;
  if (!main || !main.Get_Stale_Threshold || !fs_ || !ff) problems.push('Scope_Main, Get_Stale_Threshold or a configuration filter is missing');
  else {
    const stray = STRAY.filter((n) => main[n]);
    const others = Object.entries(main).filter(([n]) => !STRAY.includes(n) && n !== 'Filter_Stale_Config' && n !== 'Filter_Failure_Config');
    const usedElsewhere = stray.filter((n) => others.some(([, a]) => JSON.stringify(a).includes(`'${n}')`) || (a.runAfter && n in a.runAfter)));
    if (usedElsewhere.length) problems.push(`${usedElsewhere.join(', ')} is used by another action; not removed`);
    else if (stray.length || fs_.inputs?.from !== CONFIG_FROM || ff.inputs?.from !== CONFIG_FROM) {
      for (const n of stray) delete main[n];
      fs_.inputs.from = CONFIG_FROM; fs_.runAfter = { Get_Stale_Threshold: ['Succeeded'] };
      ff.inputs.from = CONFIG_FROM; ff.runAfter = { Filter_Stale_Config: ['Succeeded'] };
      changes.push(`the configuration filters read Get_Stale_Threshold directly${stray.length ? `; ${stray.length} stray Compose actions removed` : ''}`);
    }
  }

  return { definition: def, changes, already: !problems.length && !changes.length, problems };
}
