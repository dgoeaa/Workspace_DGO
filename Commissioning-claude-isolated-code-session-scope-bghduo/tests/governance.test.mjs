#!/usr/bin/env node
/**
 * Governance spine tests.
 *
 * The platform's strongest engineering — action ownership, module boundaries, RBAC,
 * idempotency, the audit log and the receipt/queue chain — had NO test coverage. The smoke
 * suite proves pages render; it proves nothing about whether an unowned action is still
 * refused. A refactor could quietly gut every control here and CI would stay green.
 *
 * These are pure-logic assertions: no browser, no network, no fixtures beyond a minimal
 * localStorage shim.
 *
 * Usage:  node tests/governance.test.mjs
 * Exit:   0 = all assertions hold, 1 = otherwise
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];
const group = n => console.log(`\n── ${n}`);
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}
async function throws(fn) { try { await fn(); return false; } catch { return true; } }

// Minimal browser surface so the runtime modules import under Node.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
globalThis.window = { DGO_CONFIG: {} };
globalThis.document = undefined;
if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { ...(globalThis.crypto || {}), randomUUID: () => "test-uuid" };
}

/* ═══════════════ ACTION OWNERSHIP ═══════════════ */
group("Action ownership — config/action-ownership.config.js");
{
  const { actionSpec } = await import("../config/action-ownership.config.js");
  const { boundaryFor, ownsAction } = await import("../config/module-boundaries.config.js");

  const spec = actionSpec("approve");
  check("a declared action resolves to a spec", !!spec);
  check("the spec names an owning module", !!spec?.owner, `owner=${spec?.owner}`);
  check("'approve' is owned by the approvals module", spec?.owner === "approvals", `got ${spec?.owner}`);
  check("an undeclared action resolves to nothing", !actionSpec("definitely-not-an-action"));

  check("every module has a declared boundary", ["correspondence", "approvals", "dispatch", "archive"]
    .every(m => !!boundaryFor(m)));
  check("an unknown module has no boundary", !boundaryFor("no-such-module"));
  check("boundaries declare what a module owns", (boundaryFor("approvals")?.owns || []).length > 0);
  check("boundaries declare what a module must NOT own",
    (boundaryFor("approvals")?.mustNotOwn || []).length > 0);
  check("ownsAction agrees with the boundary", ownsAction("dispatch", "send-dispatch") === true);
  check("a module does not own another's action", ownsAction("dispatch", "approve") === false);

  /* Every `backend` label must name a real endpoint.
   *
   * `scan-deposit` declared `SCAN_UPLOAD.required` — a key that exists nowhere in the
   * endpoint registry; the endpoint is SCAN_INTAKE. Nothing failed at runtime, because
   * core/scan-intake-service.js resolves SCAN_INTAKE for itself and never reads this
   * label. The cost was to anyone reading the governance config to decide which flows to
   * build: docs/deployment/FLOW-BUILD-PLAN.md is generated from exactly this table, and a
   * phantom key there sends someone off to build a flow the client will never call.
   *
   * `none` is a legitimate sentinel — the eight client-only actions declare it. */
  const ownership = (await import("../config/action-ownership.config.js")).ActionOwnership || {};
  const { EndpointContracts, EndpointUrls } = await import("../config/endpoints.config.js");
  const known = new Set([...Object.keys(EndpointContracts), ...Object.keys(EndpointUrls), "none"]);
  const phantom = Object.entries(ownership)
    .filter(([, v]) => v?.backend)
    .map(([action, v]) => [action, String(v.backend).split(".")[0]])
    .filter(([, key]) => !known.has(key));
  check("every declared backend names a real endpoint key",
    phantom.length === 0,
    phantom.map(([a, k]) => `${a} → ${k}`).join(", "));
}

/* ═══════════════ THE OWNERSHIP GATE ═══════════════ */
group("Ownership enforcement — core/action-authority.js");
{
  const { assertModuleAction } = await import("../core/action-authority.js");

  check("an owned action passes the gate",
    !(await throws(() => assertModuleAction("approvals", "approve"))));
  check("an unknown module is REFUSED",
    await throws(() => assertModuleAction("not-a-module", "approve")));
  check("a foreign action is REFUSED",
    await throws(() => assertModuleAction("dispatch", "approve")));
  check("an undeclared action is REFUSED",
    await throws(() => assertModuleAction("approvals", "totally-made-up-action")));
}

/* ═══════════════ THE EXECUTION PATH AND WHAT IT SAYS ═══════════════ */
/* The gate above is only half of executeOwnedAction(). The other half — what it audits, what
   it puts in front of an operator, and whether it lets the caller react — had no coverage at
   all, which is how it came to be reciting raw error text: an unconfigured connection reached
   a registry officer's screen as "AI_CHAT: Endpoint AI_CHAT is not configured", the exact
   vocabulary audit finding I-07 bans, injected by the governance layer AFTER every module's
   copy had been rewritten. Nothing failed; nothing was watching.

   These assertions run the real function against the real config. Two contracts are held
   apart deliberately and both are asserted, because the fix is only correct if both hold:
   the AUDIT keeps the raw technical detail verbatim (IT reads it, and System Health, the
   Operator HUD and the pending-write queue surface it), and the TOAST never contains it. */
group("Failure reporting — core/action-authority.js");
{
  /* core/ui.js resolves <dgo-shell> through `document` at call time, so a shim installed here
     captures every toast the layer emits. It must be a real object: leaving `document`
     undefined would make toast() throw INSIDE the catch block, which would substitute a
     TypeError for the real error and silently destroy the rethrow contract under test. */
  const toasts = [];
  const shell = { toast: (m, t) => toasts.push({ message: String(m), tone: t }) };
  globalThis.document = { querySelector: sel => (sel === "dgo-shell" ? shell : null) };
  const drain = () => toasts.splice(0, toasts.length);

  const { executeOwnedAction, actionFailureMessage, actionLabel } =
    await import("../core/action-authority.js");
  const { byReference } = await import("../core/audit-log.js");
  const { createClosureError, createError, ErrorClass } = await import("../core/errors.js");
  const { ActionOwnership } = await import("../config/action-ownership.config.js");

  /* The vocabulary I-07 reserves for Diagnostics, plus the shape of a contract key
     (AI_CHAT, DISPATCH_OUTBOUND) — SCREAMING_SNAKE_CASE is never operator language. */
  const BANNED = /\b(endpoint|payload|backend|runtime|posture)\b/i;
  const CONTRACT_KEY = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/;
  const offends = s => BANNED.test(s) || CONTRACT_KEY.test(s);

  // The real string that reached an operator. Every failure assertion below throws exactly
  // this, so a regression to error.message cannot pass any of them.
  const RAW = "AI_CHAT: Endpoint AI_CHAT is not configured";
  const boom = () => { throw new Error(RAW); };

  /* ── the gate, through the real entry point ───────────────────────────────── */
  let ran = false;
  check("an UNOWNED action is refused",
    await throws(() => executeOwnedAction("dispatch", "approve", () => { ran = true; })));
  check("a refused action never runs its runner", ran === false);

  ran = false;
  check("an unknown module boundary THROWS",
    await throws(() => executeOwnedAction("not-a-module", "approve", () => { ran = true; })));
  check("an unknown module never runs its runner", ran === false);

  /* An allowed invoker is a different module from the owner and must still be let through —
     this is the clause that keeps one action to one owner while a second channel drives it.
     `scan-intake` invoking `create-correspondence` (owner: correspondence) is the real pair. */
  const invokerSpec = ActionOwnership["create-correspondence"];
  check("the sampled action really is owned elsewhere and lists the invoker",
    invokerSpec?.owner === "correspondence" &&
    (invokerSpec?.allowedInvokers || []).includes("scan-intake"),
    `owner=${invokerSpec?.owner} invokers=${invokerSpec?.allowedInvokers}`);
  drain();
  const invoked = await executeOwnedAction("scan-intake", "create-correspondence",
    () => "committed", { ref: "GOV-INVOKER" });
  check("an ALLOWED INVOKER is permitted", invoked === "committed");
  check("a permitted action toasts nothing", toasts.length === 0, JSON.stringify(toasts));
  check("a completed action is audited as completed",
    byReference("GOV-INVOKER").some(e => e.meta?.stage === "completed"));

  /* ── a failure: audit keeps the raw detail, the operator does not see it ───── */
  drain();
  let rethrown = null;
  try { await executeOwnedAction("approvals", "approve", boom, { ref: "GOV-FAIL-1" }); }
  catch (e) { rethrown = e; }

  const failEvents = byReference("GOV-FAIL-1");
  const failed = failEvents.find(e => e.meta?.stage === "failed");
  check("a failed action is audited with stage 'failed'", !!failed);
  check("the audit RETAINS the raw technical detail verbatim",
    failed?.meta?.error === RAW, `got ${JSON.stringify(failed?.meta?.error)}`);
  check("the started stage is still audited before the runner",
    failEvents.some(e => e.meta?.stage === "started"));
  check("the audit still records the owning module",
    failed?.meta?.owner === "approvals", `got ${failed?.meta?.owner}`);

  check("THE RETHROW CONTRACT HOLDS — the caller receives the original error",
    rethrown instanceof Error && rethrown.message === RAW);

  check("exactly ONE toast per failure", toasts.length === 1,
    `got ${toasts.length}: ${JSON.stringify(toasts.map(t => t.message))}`);
  const shown = toasts[0]?.message || "";
  check("the toast is not empty", shown.length > 0);
  check("the toast is NOT the raw error text", shown !== RAW && !shown.includes("AI_CHAT"), shown);
  check("the toast uses no banned vocabulary", !offends(shown), shown);
  check("the toast names what the operator was trying to do",
    shown.includes(actionLabel("approve")), shown);
  check("the toast says what it means for the record", /nothing was changed/i.test(shown), shown);
  check("the toast is delivered in the error tone", toasts[0]?.tone === "error");

  /* ── a typed error contributes its consequence, never its message ──────────── */
  drain();
  const closure = createClosureError("Closure gate failed.", { reason: "CLOSURE_GATE_FAILED" });
  try { await executeOwnedAction("archive", "archive-reference", () => { throw closure; }, { ref: "GOV-FAIL-2" }); }
  catch { /* expected */ }
  const typed = toasts[0]?.message || "";
  check("a typed error still yields exactly one toast", toasts.length === 1);
  check("a typed error's CLASS selects a plain consequence",
    /still open/i.test(typed), typed);
  check("a typed error's developer MESSAGE is never shown",
    !typed.includes("Closure gate failed"), typed);
  check("the typed failure is audited with its raw message",
    byReference("GOV-FAIL-2").find(e => e.meta?.stage === "failed")?.meta?.error === "Closure gate failed.");

  /* ── the opt-out ───────────────────────────────────────────────────────────── */
  drain();
  try { await executeOwnedAction("archive", "archive-reference", boom, { ref: "GOV-FAIL-3", notify: false }); }
  catch { /* expected */ }
  check("notify:false suppresses the governance toast", toasts.length === 0,
    JSON.stringify(toasts.map(t => t.message)));
  check("notify:false does NOT suppress the audit, nor its raw detail",
    byReference("GOV-FAIL-3").find(e => e.meta?.stage === "failed")?.meta?.error === RAW);
  drain();
  try { await executeOwnedAction("archive", "archive-reference", boom, { ref: "GOV-FAIL-4", notify: true }); }
  catch { /* expected */ }
  check("only an explicit false opts out — anything else still speaks", toasts.length === 1);

  /* ── every action, not just the sampled ones ───────────────────────────────── */
  const actions = Object.keys(ActionOwnership);
  check("the config carries actions to check", actions.length > 40, `got ${actions.length}`);

  const unlabelled = actions.filter(a => !ActionOwnership[a].label);
  check("EVERY action carries a plain-language label",
    unlabelled.length === 0, unlabelled.join(", "));

  const badLabels = actions.filter(a => offends(ActionOwnership[a].label || ""));
  check("no label uses the vocabulary reserved for Diagnostics",
    badLabels.length === 0, badLabels.join(", "));

  /* The whole-table sweep. Generated against the same raw string, so if the layer ever falls
     back to error.message for ANY action this fails loudly rather than for the one action a
     sampled test happened to pick. */
  const messages = actions.map(a => actionFailureMessage(a, new Error(RAW)));
  check("every action produces a message", messages.length === actions.length &&
    messages.every(m => typeof m === "string" && m.length > 0));
  const leaks = actions.filter((a, i) => offends(messages[i]) || messages[i].includes(RAW));
  check(`no action's failure message leaks technical vocabulary (${actions.length} actions)`,
    leaks.length === 0, leaks.join(", "));
  check("every action's failure message names its own label",
    actions.every((a, i) => messages[i].includes(ActionOwnership[a].label)));

  /* Negative control. If `offends` were broken — a regex that matches nothing — every check
     above would pass vacuously while the layer shouted "Endpoint" at operators. */
  check("the vocabulary check can actually fail",
    offends(RAW) && offends("Review the payload before backend execution.") &&
    !offends("Could not archive the reference. Nothing was changed."));

  /* Untyped and unknown actions must still land on plain language, not on an action id. */
  const orphan = actionFailureMessage("an-action-with-no-spec", new Error(RAW));
  check("an action with no spec still gets a plain message",
    !offends(orphan) && !orphan.includes("an-action-with-no-spec"), orphan);
  check("every declared error class maps to a plain consequence",
    Object.values(ErrorClass).every(c =>
      !offends(actionFailureMessage("approve", createError(c, RAW)))));

  globalThis.document = undefined;
}

/* ═══════════════ RBAC ═══════════════ */
group("Access control — config/rbac.config.js");
{
  const { Roles, Permissions, canAccess, RoleRouteAccess, RolePersonaMap } =
    await import("../config/rbac.config.js");

  check("six roles are defined", Object.keys(Roles).length === 6, `got ${Object.keys(Roles).length}`);
  check("thirteen permissions are defined", Object.keys(Permissions).length === 13);
  check("systemAdmin holds every permission",
    Roles.systemAdmin.permissions.length === Object.keys(Permissions).length);
  check("viewer holds no permissions", Roles.viewer.permissions.length === 0);

  const active = r => ({ role: r, status: "active" });
  check("systemAdmin may open user-admin", canAccess(active("systemAdmin"), "user-admin") === true);
  check("viewer may NOT open user-admin", canAccess(active("viewer"), "user-admin") === false);
  check("viewer may NOT open settings", canAccess(active("viewer"), "settings") === false);
  check("viewer MAY open reports", canAccess(active("viewer"), "reports") === true);
  check("operator may NOT open user-admin", canAccess(active("operator"), "user-admin") === false);
  check("executive may NOT open settings", canAccess(active("executive"), "settings") === false);
  check("director may open approvals", canAccess(active("director"), "approvals") === true);

  // Status gating: a non-active account is refused regardless of role.
  check("a DISABLED systemAdmin is refused",
    canAccess({ role: "systemAdmin", status: "disabled" }, "home") === false);
  check("an UNREGISTERED systemAdmin is refused",
    canAccess({ role: "systemAdmin", status: "unregistered" }, "home") === false);

  /* F-020. THE CASES ABOVE ALL PASSED WHILE THE ROUTE TABLE WAS BEING IGNORED.
     Each one builds its subject as { role, status } with no persona, and canAccess() only fell
     through to the persona table when a persona was present. Every real caller has one:
     normalizeUserRecord() derives it from the role through RolePersonaMap. So the examples above
     tested a subject the application never constructs, and five of the six roles were reaching
     routes their own row withholds — userAdmin and viewer 5 routes each on paper, 26 and 21 in
     fact; operator and director into settings, operator-hud, diagnostics and executive.

     Examples cannot catch that returning, because the defect is in the routes nobody thought to
     write an example for. This asserts the property over the whole cross product instead: for
     every role, carrying the persona the application really pairs with it, the set of routes
     granted is exactly the set its row lists. Nothing extra, nothing missing. */
  {
    const routes = [...new Set(Object.values(RoleRouteAccess).flat().filter(r => r !== "*")
      .concat(["settings", "diagnostics", "user-admin", "operator-hud", "executive", "archive"]))];
    for (const role of Object.keys(RoleRouteAccess)) {
      const row = RoleRouteAccess[role];
      const persona = RolePersonaMap[role];
      const subject = { role, persona, status: "active" };
      const extra = routes.filter(r =>
        canAccess(subject, r) && !(row.includes("*") || row.includes(r)));
      const missing = routes.filter(r =>
        !canAccess(subject, r) && (row.includes("*") || row.includes(r)));
      check(`${role} reaches exactly the routes RoleRouteAccess lists for it`,
        extra.length === 0 && missing.length === 0,
        `extra: ${extra.join(", ") || "none"} · missing: ${missing.join(", ") || "none"}`);
    }
  }

  /* The persona table is not deleted — it still answers for the one caller with no role to
     offer. The R11.1 lineage shell passes a bare persona string. That path is unchanged. */
  check("a bare persona string still answers from the persona table",
    canAccess("registry", "reports") === true && canAccess("general", "settings") === false);
}

/* ═══════════════ IDEMPOTENCY ═══════════════ */
group("Idempotency — core/idempotency.js");
{
  const { key, bucket, remember, seen } = await import("../core/idempotency.js");
  const base = { operation: "approve", ref: "REF-1", actor: { email: "A@x.gov" }, payload: { a: 1, b: 2 } };

  const k1 = await key(base);
  const k2 = await key(base);
  check("the same input yields the same key", k1 === k2);
  check("the key carries operation and reference", k1.includes("approve") && k1.includes("REF-1"));
  check("actor email is normalised to lower case", k1.includes("a@x.gov"));

  check("a different payload yields a different key",
    (await key({ ...base, payload: { a: 1, b: 3 } })) !== k1);
  check("a different reference yields a different key",
    (await key({ ...base, ref: "REF-2" })) !== k1);
  check("a different actor yields a different key",
    (await key({ ...base, actor: { email: "B@x.gov" } })) !== k1);

  // Key order must not matter — the digest sorts keys before hashing.
  check("payload key ORDER does not change the digest",
    (await key({ ...base, payload: { b: 2, a: 1 } })) === k1);

  check("the time bucket advances with the window", bucket(1) !== bucket(100000));
  remember("k-test");
  check("a remembered key is seen", seen("k-test") === true);
  check("an unknown key is not seen", seen("k-never") === false);
}

/* ═══════════════ AUDIT LOG ═══════════════ */
group("Audit log — core/audit-log.js");
{
  const { record, byReference, query, snapshot } = await import("../core/audit-log.js");

  const ev = record({ ref: "REF-A", event: "audit:test", actor: { email: "a@x" }, entityType: "task" });
  check("a recorded event is returned", !!ev?.id);
  check("the event is timestamped", !!ev?.at);
  check("the returned event is frozen", Object.isFrozen(ev));

  record({ ref: "REF-A", event: "audit:test-2" });
  record({ ref: "REF-B", event: "audit:other" });
  check("events are indexed by reference", byReference("REF-A").length === 2,
    `got ${byReference("REF-A").length}`);
  check("an unknown reference yields none", byReference("REF-NOPE").length === 0);
  check("events are filterable", query({ event: "audit:other" }).length === 1);
  check("a snapshot exposes the event stream", Array.isArray(snapshot().events));

  // Attempting to mutate a returned record must not corrupt the log.
  const before = byReference("REF-A").length;
  try { byReference("REF-A").push({ forged: true }); } catch { /* frozen — expected */ }
  check("the log cannot be mutated through a returned array", byReference("REF-A").length === before);
}

/* ═══════════════ MODULE BOUNDARY INTEGRITY ═══════════════ */
group("Boundary integrity — cross-config consistency");
{
  const { actionSpec } = await import("../config/action-ownership.config.js");
  const { boundaryFor } = await import("../config/module-boundaries.config.js");
  const { Routes } = await import("../config/routes.config.js");
  const { VisibleWorkspaces, HiddenTechnicalRoutes } = await import("../config/workflow-clarity.config.js");
  const { RoleRouteAccess } = await import("../config/rbac.config.js");

  // Every declared action's owner must be a module with a real boundary.
  const owners = new Set();
  ["approve", "send-dispatch", "acknowledge", "classify", "archive-reference"]
    .forEach(a => { const s = actionSpec(a); if (s?.owner) owners.add(s.owner); });
  check("every sampled action owner has a boundary", [...owners].every(m => !!boundaryFor(m)),
    [...owners].filter(m => !boundaryFor(m)).join(", "));

  // Workflow clarity must account for every declared route.
  const declared = Routes.map(r => r.path);
  const accounted = new Set([...VisibleWorkspaces.map(w => w.route), ...Object.keys(HiddenTechnicalRoutes)]);
  const unaccounted = declared.filter(r => !accounted.has(r));
  check("every route is either a visible workspace or a declared internal route",
    unaccounted.length === 0, unaccounted.join(", "));

  // Every route a role may reach must actually exist.
  const bad = [];
  for (const [role, routes] of Object.entries(RoleRouteAccess)) {
    for (const r of routes) if (r !== "*" && !declared.includes(r)) bad.push(`${role}→${r}`);
  }
  check("RBAC never grants access to a route that does not exist", bad.length === 0, bad.join(", "));

  // 29 since D6(b) brought briefs, meetings and projects across from the ECM Activity Hub;
  // 30 since the Endpoint Console; 31 since the Admin Suite. The Figma "Application Shell"
  // locked IA (audit finding I-01) puts 25 of them directly in the sidebar and leaves 6 as a
  // genuine sub-view of one primary workspace (single-assignment/bulk-assignment under Intake &
  // Assignment, scan-intake under Registry, archive under Dispatch, user-admin and
  // endpoint-console under Administration) — reached from that parent screen's "Continue in"
  // strip and the command palette rather than the sidebar.
  //
  // The Admin Suite is a sidebar destination and not a seventh hidden route, which is the
  // decision this line records. It is the screen an administrator opens when something is wrong
  // and they do not yet know what, and a console reachable only from a screen you would have to
  // already suspect is a console nobody finds in that situation.
  //
  // The number is asserted rather than derived on purpose: a route is a permanent addition to
  // the information architecture, and a count that follows the config silently would let one
  // be added without anyone deciding it belongs. Changing it here is the decision.
  check("31 routes are declared", declared.length === 31, `got ${declared.length}`);
  check("25 visible workspaces", VisibleWorkspaces.length === 25, `got ${VisibleWorkspaces.length}`);
}

/* ═══════════════ PROVISIONING PARITY ═══════════════ */
group("Provisioning parity — config/platform-provisioning.config.js");
{
  /* The activation manifest is what core/platform-provisioner.js validates at boot and
     modules/diagnostics.js renders as provisioning health. It had drifted five routes
     behind the router: briefs, meetings, projects (D6(b)), scan-intake and
     ecm-erp-charter had no entry, so `validate()` enumerated 24 modules, computed `ok`
     over those 24 and returned true while the platform served 29. A module that was never
     provisioned could not make the report false — the failure mode is not a broken
     workspace, it is a readiness surface that cannot see what it is missing. */
  const { PlatformProvisioning } = await import("../config/platform-provisioning.config.js");
  const { Routes } = await import("../config/routes.config.js");
  const { ActionOwnership } = await import("../config/action-ownership.config.js");

  const routeIds = Routes.map(r => r.path);
  const provisioned = Object.keys(PlatformProvisioning);

  const unprovisioned = routeIds.filter(id => !provisioned.includes(id));
  check("every declared route has a provisioning entry",
    unprovisioned.length === 0, unprovisioned.join(", "));

  const phantom = provisioned.filter(id => !routeIds.includes(id));
  check("every provisioning entry has a declared route",
    phantom.length === 0, phantom.join(", "));

  /* NEGATIVE CONTROL for the `readOnly` escape hatch. A workspace may declare no actions
     only when it says it is read-only; otherwise an empty action list is indistinguishable
     from a module whose actions were lost, and ActionRuntime.canRun() would refuse every
     one of them at the desk while provisioning health stayed green. */
  const silentlyActionless = Object.entries(PlatformProvisioning)
    .filter(([, s]) => !s.readOnly && (s.actions || []).length === 0)
    .map(([m]) => m);
  check("no workspace declares an empty action list without declaring itself read-only",
    silentlyActionless.length === 0, silentlyActionless.join(", "));

  const readOnlyWithActions = Object.entries(PlatformProvisioning)
    .filter(([, s]) => s.readOnly && (s.actions || []).length > 0)
    .map(([m]) => m);
  check("a read-only workspace declares no actions",
    readOnlyWithActions.length === 0, readOnlyWithActions.join(", "));

  /* ActionRuntime.canRun() gates on this list, so a call site naming an action the
     manifest does not carry throws "Action X is not enabled for Y" at the moment a user
     presses the button — the one place the failure is most expensive and least
     diagnosable. Read from the module sources rather than asserted from memory.

     Note that two vocabularies coexist by design and are NOT interchangeable:
     config/action-ownership.config.js names governance actions (`bulk-assign`), while this
     manifest names what a workspace offers (`submit-bulk`). They overlap where a workspace
     surfaces its governed action directly. Only the ActionRuntime path is checkable
     mechanically, because only it resolves a name against this list at runtime. */
  const moduleSources = fs.readdirSync(path.join(ROOT, "modules"))
    .filter(f => f.endsWith(".js"))
    .map(f => fs.readFileSync(path.join(ROOT, "modules", f), "utf8"))
    .join("\n");
  const runCalls = [...moduleSources.matchAll(/ActionRuntime\.run\(\s*'([^']+)'\s*,\s*'([^']+)'/g)]
    .map(m => ({ module: m[1], action: m[2] }));
  const unrunnable = runCalls
    .filter(c => !(PlatformProvisioning[c.module]?.actions || []).includes(c.action))
    .map(c => `${c.module}:${c.action}`);
  check(`every ActionRuntime.run() call names a provisioned action (${runCalls.length} call sites)`,
    runCalls.length > 0 && unrunnable.length === 0, unrunnable.join(", "));

  /* Every owner named by the governance config must be a workspace this manifest knows
     about. A governed action owned by a module with no entry is unreachable through
     ActionRuntime and invisible to provisioning health. */
  const unknownOwners = [...new Set(Object.values(ActionOwnership).map(s => s.owner))]
    .filter(owner => !provisioned.includes(owner));
  check("every action owner is a provisioned workspace",
    unknownOwners.length === 0, unknownOwners.join(", "));

  const { PlatformProvisioner } = await import("../core/platform-provisioner.js");
  const report = PlatformProvisioner.validate();
  check("provisioning health enumerates every route",
    report.modules.length === routeIds.length, `${report.modules.length} of ${routeIds.length}`);
  check("every provisioned module reports healthy",
    report.modules.every(m => m.ok),
    report.modules.filter(m => !m.ok).map(m => m.module).join(", "));
}

/* ═══════════════ ENDPOINT CONTRACTS ═══════════════ */
group("Endpoint contracts — core/endpoint-registry.js");
{
  const { EndpointRegistry } = await import("../core/endpoint-registry.js");

  const signed = "https://x.powerplatform.com/flow/abc?api-version=1&sp=%2Ftriggers&sv=1.0&sig=SECRETVALUE123456";
  const red = EndpointRegistry.redact(signed);
  check("redact() removes the signature", !red.includes("SECRETVALUE123456"), red);
  check("redact() keeps the URL readable", red.includes("powerplatform.com"));
  check("redact() masks sv as well", !/sv=1\.0/.test(red) || red.includes("***"));
  check("redact() tolerates an empty value", EndpointRegistry.redact("") === "");

  const c = EndpointRegistry.contract("SINGLE_ASSIGNMENT");
  check("a write contract is marked write", c?.write === true);
  check("a write contract is NOT idempotent-by-default", c?.idempotent === false);
  check("a write contract does not auto-retry", c?.retry === 0);
  const ro = EndpointRegistry.contract("FETCH_ALL");
  check("a read contract is marked readOnly", ro?.readOnly === true);
  check("a read contract is retry-safe", ro?.idempotent === true);
  check("an unknown contract resolves to nothing", EndpointRegistry.contract("NOPE") === null);

  const all = EndpointRegistry.describeAll({});
  check("describeAll() reports every contract", all.entries.length === 19, `got ${all.entries.length}`);
  check("describeAll() warns when endpoints are unconfigured",
    all.warnings.some(w => w.code === "endpoint.unconfigured"));
  check("no describeAll() target leaks a raw signature",
    all.entries.every(e => !/sig=[A-Za-z0-9_-]{20,}/.test(e.target || "")));
}

/* An unknown reference must not be dispatchable.
   Entities.canClose carries a `known` guard and says why: every check in it is an "is
   anything still open?" test, and an empty bundle passes all of them vacuously, so any
   string at all reported ok. canDispatch is the same shape one phase earlier — "is there
   an unapproved approval in the way?" — and did NOT carry the guard. Measured before the
   fix: canDispatch('REF-DOES-NOT-EXIST') returned true, prepareDispatch then minted a
   dispatch record for it, and dispatchOutbound would have called DISPATCH_OUTBOUND and
   written audit:dispatch-receipt-captured for a file the register never held.

   Written as a negative control on both halves: remove the guard from canDispatch and the
   first case fails; remove it from prepareDispatch and the reason reverts to the wrong
   one, which is how this stayed invisible — the refusal it gave was about approvals. */
group("dispatch refuses a reference the register does not hold");
{
  const { Entities } = await import("../core/entity-store.js");
  const { canDispatch, prepareDispatch, markNoDispatch } = await import("../core/dispatch-service.js");
  const GHOST = "REF-GOVERNANCE-PROBE-UNKNOWN";

  check("canClose still reports the unknown reference as unknown",
    Entities.canClose(GHOST).unknownReference === true);
  check("canDispatch refuses it", canDispatch(GHOST) === false);

  let refused = "";
  try { prepareDispatch({ ref: GHOST, actor: {}, recipients: ["probe@example.invalid"] }); }
  catch (e) { refused = e.message; }
  check("prepareDispatch refuses it", refused !== "",
    "a dispatch record was created for a reference the register does not hold");
  check("and the refusal names the real reason, not the approval gate",
    /register does not hold/i.test(refused), refused);

  /* markNoDispatch had the same hole and a quieter failure: both of its status
     transitions sit inside a `catch {}`, so on an unknown reference it swallowed
     "Reference not found" twice and returned Entities.byReference(ref) — a frozen empty
     object — to a caller that had no way to tell the no-dispatch was never recorded. */
  let noDispatchRefused = "";
  try { await markNoDispatch(GHOST, {}, "probe reason"); }
  catch (e) { noDispatchRefused = e.message; }
  check("markNoDispatch refuses it rather than reporting an empty record",
    /register does not hold/i.test(noDispatchRefused), noDispatchRefused || "(returned without throwing)");

  /* The guard must not refuse a reference that IS held: an approved reference with no
     approval records dispatches, which is the path every existing test drives. */
  const REAL = "REF-GOVERNANCE-PROBE-REAL";
  Entities.createReference({ __ref: REAL, __status: "approved" });
  check("a held reference is still dispatchable", canDispatch(REAL) === true);
  let made = null;
  try { made = prepareDispatch({ ref: REAL, actor: {}, recipients: ["probe@example.invalid"] }); }
  catch (e) { made = null; }
  check("and prepareDispatch still creates its dispatch record",
    made?.__status === "dispatch_pending", String(made && made.__status));
}

console.log(`\n${failures.length ? "❌" : "✅"} ${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.error(`   · ${f}`)); process.exit(1); }
process.exit(0);
