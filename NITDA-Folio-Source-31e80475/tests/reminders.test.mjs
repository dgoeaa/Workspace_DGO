/* RN-035: a reminder set on a task is written to DGO_TaskReminders and sent when it falls due (owner decision, 2026-10-18).
 *
 * Written: DYNAMIC_ACTIONS upsert-record serves entityType RMD, refuses one without an address or a due time, and binds the
 * REMINDERS dataset from Flow Configuration. Sent: AUTO_SCHEDULED_SWEEP reads the scheduled rows whose DueAtUtc has passed,
 * e-mails each assignee once with a task-reminder receipt, and marks the row sent or failed so it is not sent again. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DynamicActions } from '../config/dynamic-actions.config.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const rel = JSON.parse(read('docs/folio-Master-Flows-and-Endpoints/registers/identification-release.json'));
const pkgText = (key) => read(`docs/folio-Master-Flows-and-Endpoints/packages/${Object.keys(rel.packages).find((p) => p.includes(key))}`);
const pkgOf = (key) => JSON.parse(pkgText(key));
let pass = 0; const ok = (c, m, d = '') => { assert.ok(c, `${m}${d ? `: ${d}` : ''}`); pass++; console.log(`  ✅ ${m}`); };
const find = (o, n) => { for (const [k, a] of Object.entries(o || {})) { if (k === n) return a; const r = find(a.actions, n) ?? (a.else ? find(a.else.actions, n) : undefined) ?? Object.values(a.cases || {}).map((x) => find(x.actions, n)).find(Boolean); if (r) return r; } return undefined; };

console.log('Task reminders (RN-035)');
const c = DynamicActions.setReminder;
ok(c.operation === 'upsert-record' && c.entityType === 'RMD' && c.required.includes('assignedTo') && c.required.includes('dueAt'), 'set-reminder asks DYNAMIC_ACTIONS for an RMD record with an assignee and a due time');
const D = pkgText('DYNAMIC_ACTIONS__');
ok(D.includes("DATASET_REMINDERS_SITE_URL") && D.includes("DATASET_REMINDERS_LIST_ID"), 'DYNAMIC_ACTIONS binds the REMINDERS dataset from Flow Configuration');
ok(D.includes("A reminder needs assignedTo (an e-mail address) and dueAt"), 'a reminder without an address or a due time is refused before anything is written');
ok(D.includes("'ReminderStatus','scheduled'") && D.includes("'DueAtUtc'"), 'a reminder is written scheduled, with its due time');
const W = pkgOf('AUTO_SCHEDULED_SWEEP__').serializedValue.actions;
const get = find(W, 'Get_Due_Reminders');
ok(get && get.inputs.parameters.table === '2f42abf5-f425-4714-9046-ffa6c0bb7151' && get.inputs.parameters.$filter.includes("ReminderStatus eq ''scheduled'' and DueAtUtc le"), 'the sweep reads the scheduled reminders whose time has passed');
const send = find(W, 'Send_Task_Reminder_Email');
ok(send && send.inputs.parameters['emailMessage/To'].includes("['AssignedTo']") && send.inputs.parameters['emailMessage/To'].includes("opsTo"), 'each is e-mailed to its assignee (the registry mailbox during the commissioning hold)');
const rec = Object.entries(find(W, 'Foreach_Due_Reminder').actions).find(([, a]) => a.runAfter?.Send_Task_Reminder_Email && a.inputs?.parameters?.['item/MessageType'] === 'task-reminder');
ok(!!rec, 'each send writes a task-reminder outbox receipt');
const patch = find(W, 'Patch_Reminder_Status');
ok(patch && patch.inputs.parameters['item/ReminderStatus'].includes("'sent','failed'") && JSON.stringify(patch.runAfter.Send_Task_Reminder_Email) === JSON.stringify(['Succeeded', 'Failed', 'TimedOut']), 'the row is marked sent or failed after the send, so a reminder goes once');
const win = find(W, 'Condition_Reminder_Window');
ok(JSON.stringify(win.expression).includes('Compose_In_Working_Hours') && JSON.stringify(win.expression).includes("['enabled']"), 'reminders are sent in working hours and only while notices are enabled');
console.log(`\n✅ ${pass} passed, 0 failed`);
