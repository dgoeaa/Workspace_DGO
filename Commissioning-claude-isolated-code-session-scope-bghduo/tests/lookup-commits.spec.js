/**
 * Lookup's two forms commit what they collect.
 *
 * The defect was the same shape as the document-flagging one already covered in
 * tests/document-flags.spec.js, and it survived that fix in two other handlers on the same
 * screen. The task-update form and the email-to-task form each gathered a full set of
 * fields — progress, priority, comments; title, assignee, category, DSU, dates, CC list,
 * instruction — showed a confirmation, navigated away, and discarded every one of them.
 * Nothing was ever written. The officer saw a dialog, landed on another workspace with an
 * empty form, and retyped the lot.
 *
 * `config/action-ownership.config.js` already registered `lookup` as an allowed invoker of
 * `update-task` (owned by `orchestrator`) and `create-task-from-email` (owned by
 * `single-assignment`), and `updateTaskState`/`createTask` were already imported by the
 * module and unused — so the gap was in the handler alone, not in the governance layer.
 *
 * The assertions that matter are therefore the dull ones: after submitting, the task exists
 * and carries what was typed. A test that only checked for a dialog, or for a toast, would
 * have passed against the broken build — that is exactly how this shipped.
 */
import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/index.html?skipWelcome=1', { waitUntil: 'networkidle' });
  await expect.poll(() => page.evaluate(() => window.__DGO_BOOTED__ === true), { timeout: 15_000 }).toBe(true);
}

const seed = (page, patch) => page.evaluate(async p => {
  const { State } = await import('./core/state.js');
  State.patch(p, { module: 'test', action: 'seed' });
}, patch);

const stateOf = (page, key) => page.evaluate(async k => {
  const { State } = await import('./core/state.js');
  return State.get()[k];
}, key);

const auditEvents = page => page.evaluate(async () => {
  const { AuditLog } = await import('./core/audit-log.js');
  return AuditLog.snapshot().events.map(e => e.event);
});

/**
 * Answer the topmost confirmation and wait for THAT dialog to go.
 *
 * Confirmations stack — a governed write with an endpoint configured raises the module's
 * own dialog and then core/flow-confirmation.js's execution gate, both
 * `[data-dialog="confirm"]`. Waiting on the selector to detach would hang the moment a
 * second opened, so the wait is on the element that was answered.
 */
async function answerConfirm(page, choice) {
  const dlg = await page.waitForSelector('[data-dialog="confirm"]', { state: 'visible', timeout: 5_000 });
  await dlg.$eval(choice === 'yes' ? '[data-yes]' : '[data-no]', b => b.click());
  await page.waitForFunction(el => !el.isConnected, dlg, { timeout: 5_000 });
}
const confirmYes = page => answerConfirm(page, 'yes');
const confirmNo = page => answerConfirm(page, 'no');

/* No endpoints are provisioned in this spec, so no flow-execution gate follows and no
   request leaves the browser. Both handlers are local-first with a PendingQueue fallback,
   which is the path a workspace with no configured connection takes anyway. */

const openLookupOn = async (page, selType, selId) => {
  await page.evaluate(async ([t, i]) => {
    const { UIState } = await import('./core/ui-state.js');
    UIState.set('lookup', { selType: t, selId: i, md: 'detail' });
    location.hash = '#/lookup';
  }, [selType, selId]);
};

/* ── the task-update form ──────────────────────────────────────────────────── */

const TASK = {
  id: 'TSK-1', referenceId: 'NITDA-2026-000450', title: 'Draft the broadband rollout response',
  assignedTo: 'officer@nitda.gov.ng', status: 'Not started', priority: 'normal',
  description: 'Original instruction, which a blank comment box must not erase.',
  due: '2026-09-01', created: '2026-08-01T09:00:00Z',
};

async function openTask(page) {
  await boot(page);
  await seed(page, { tracking: [TASK] });
  await openLookupOn(page, 'tasks', 'TSK-1');
  await page.waitForSelector('[data-outlet] .route-stage [data-update-task]');
}

test.describe('Lookup · updating a task', () => {
  test('the update is written to the task, not thrown away on navigate', async ({ page }) => {
    await openTask(page);

    await page.selectOption('[data-update-task] [name="status"]', 'In progress');
    await page.selectOption('[data-update-task] [name="priority"]', 'high');
    await page.fill('[data-update-task] [name="comments"]', 'Chased the desk officer.');
    await page.click('[data-update-task] button');
    await confirmYes(page);

    await expect
      .poll(async () => (await stateOf(page, 'tracking'))[0].status,
            { message: 'the whole defect was that this never changed' })
      .toBe('In progress');
    const [t] = await stateOf(page, 'tracking');
    expect(t.priority).toBe('high');
    expect(t.description, 'the comment the officer typed must reach the record').toBe('Chased the desk officer.');
  });

  test('the officer stays in Lookup', async ({ page }) => {
    // The old handler confirmed and sent them to #/orchestrator to start again. Same
    // contract as flagActivity(), which this now matches.
    await openTask(page);
    await page.selectOption('[data-update-task] [name="status"]', 'Completed');
    await page.click('[data-update-task] button');
    await confirmYes(page);

    await expect.poll(async () => (await stateOf(page, 'tracking'))[0].status).toBe('Completed');
    expect(page.url()).toContain('#/lookup');
  });

  test('a blank comment box does not wipe the instruction the task already carries', async ({ page }) => {
    await openTask(page);
    await page.selectOption('[data-update-task] [name="status"]', 'In progress');
    await page.click('[data-update-task] button');
    await confirmYes(page);

    await expect.poll(async () => (await stateOf(page, 'tracking'))[0].status).toBe('In progress');
    expect((await stateOf(page, 'tracking'))[0].description)
      .toBe('Original instruction, which a blank comment box must not erase.');
  });

  test('cancelling writes nothing', async ({ page }) => {
    await openTask(page);
    await page.selectOption('[data-update-task] [name="status"]', 'Completed');
    await page.click('[data-update-task] button');
    await confirmNo(page);
    await page.waitForTimeout(400);

    expect((await stateOf(page, 'tracking'))[0].status).toBe('Not started');
  });

  test('the update is audited under the action the ownership config registers', async ({ page }) => {
    await openTask(page);
    await page.selectOption('[data-update-task] [name="status"]', 'In progress');
    await page.click('[data-update-task] button');
    await confirmYes(page);

    await expect.poll(async () => (await stateOf(page, 'tracking'))[0].status).toBe('In progress');
    expect(await auditEvents(page)).toContain('audit:task-updated');
  });
});

/* ── the email-to-task form ────────────────────────────────────────────────── */

const EMAIL = {
  id: 'EML-1', subject: 'Q3 broadband rollout status update',
  fromAddress: 'dg.office@nitda.gov.ng', from: 'Office of the DG',
  receivedDateTime: '2026-08-05T08:15:00Z', hasAttachments: false,
  bodyPreview: 'Requesting an update ahead of the ministerial briefing.',
};

async function openEmail(page) {
  await boot(page);
  await seed(page, { emails: [EMAIL], tracking: [] });
  await openLookupOn(page, 'emails', 'EML-1');
  await page.waitForSelector('[data-outlet] .route-stage [data-email-task-form]');
}

test.describe('Lookup · raising a task from an email', () => {
  test('a task is actually created, carrying what the form collected', async ({ page }) => {
    await openEmail(page);

    await page.fill('[data-email-task-form] [name="title"]', 'Prepare broadband briefing note');
    await page.fill('[data-email-task-form] [name="assignedTo"]', 'policy@nitda.gov.ng');
    await page.fill('[data-email-task-form] [name="due"]', '2026-09-15');
    await page.fill('[data-email-task-form] [name="comments"]', 'Cover the Q3 milestones only.');
    await page.click('[data-email-task-form] button');
    await confirmYes(page);

    await expect
      .poll(async () => (await stateOf(page, 'tracking')).length,
            { message: 'the form collected nine fields and created nothing' })
      .toBe(1);
    const [t] = await stateOf(page, 'tracking');
    expect(t.title).toBe('Prepare broadband briefing note');
    expect(t.assignedTo).toBe('policy@nitda.gov.ng');
    expect(t.due).toBe('2026-09-15');
    expect(t.description).toBe('Cover the Q3 milestones only.');
    // The task must be traceable back to the message it came from.
    expect(t.sourceEmailId).toBe('EML-1');
    expect(t.referenceId, 'a task with no reference cannot be found again').toBeTruthy();
  });

  test('the officer stays in Lookup', async ({ page }) => {
    await openEmail(page);
    await page.fill('[data-email-task-form] [name="assignedTo"]', 'policy@nitda.gov.ng');
    await page.click('[data-email-task-form] button');
    await confirmYes(page);

    await expect.poll(async () => (await stateOf(page, 'tracking')).length).toBe(1);
    expect(page.url(), 'the old handler sent them to #/single-assignment with an empty form')
      .toContain('#/lookup');
  });

  test('cancelling creates nothing', async ({ page }) => {
    await openEmail(page);
    await page.fill('[data-email-task-form] [name="assignedTo"]', 'policy@nitda.gov.ng');
    await page.click('[data-email-task-form] button');
    await confirmNo(page);
    await page.waitForTimeout(400);

    expect(await stateOf(page, 'tracking')).toEqual([]);
  });

  test('an invalid assignee is refused before anything is created', async ({ page }) => {
    /* The payload validator (core/assignment-payload.js) is shared with the Assignment
       Desk. Committing in place must run it, not skip it because the screen is smaller. */
    await openEmail(page);
    await page.evaluate(() => {
      const f = document.querySelector('[data-email-task-form] [name="assignedTo"]');
      f.value = 'not-an-address';           // set directly: type=email blocks submit otherwise
    });
    await page.click('[data-email-task-form] button');
    await page.waitForTimeout(400);

    expect(await stateOf(page, 'tracking')).toEqual([]);
  });

  test('the creation is audited under the action the ownership config registers', async ({ page }) => {
    await openEmail(page);
    await page.fill('[data-email-task-form] [name="assignedTo"]', 'policy@nitda.gov.ng');
    await page.click('[data-email-task-form] button');
    await confirmYes(page);

    await expect.poll(async () => (await stateOf(page, 'tracking')).length).toBe(1);
    expect(await auditEvents(page)).toContain('audit:email-task-created');
  });
});
