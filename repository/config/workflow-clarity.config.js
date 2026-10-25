// Workflow Clarity Layer.
// Essentials plan UX-401 (cut-over, owner approval 2026-10-22; docs/architecture/ESSENTIALS_MAP.md §6, §8.1): the sidebar is
// the three places the office works in. Overview (the Command Center's address), Inbox (Intake's) and Tasks (My Work's).
// Every other office route redirects to the place its job moved to (RouteRedirects), so a link already sent in an e-mail
// still lands where that work is now; a record opens on its record page wherever it is opened from.
// Essentials plan UX-402: Administration is not in the office sidebar. It is reached from the profile menu, by the roles
// that may open it, and keeps its own tabs.
// A role sees a place when it may open at least one of the routes whose work moved into it (`merges`).
// Essentials plan UX-201: the intakes are named and listed from config/entry-points.config.js.
import { EntryPoints, intakeListText } from './entry-points.config.js';
export const VisibleWorkspaces = Object.freeze([
  {
    "id": "overview",
    "route": "home",
    "label": "Overview",
    "group": "START HERE",
    "purpose": "What is waiting on this office at a glance: figures that each open their list, incoming by intake, what needs attention now, and Reports.",
    "owns": ["work summary", "attention queues", "reports", "export"],
    "handoffs": ["correspondence", "orchestrator"],
    "merges": ["home", "statistics", "reports"],
    "tabs": [{ "route": "home", "label": "Overview" }]
  },
  {
    "id": "inbox",
    "route": "correspondence",
    "label": "Inbox",
    "group": "OPERATIONS",
    "purpose": `Every incoming record in one list, from ${intakeListText()}: register a document, open a record to triage and assign it, or assign several at once.`,
    "owns": ["register a document", "register an e-mail", "assign selected", "queue filters", "physical files"],
    "handoffs": ["orchestrator"],
    "merges": ["correspondence", "scan-intake", "activities", "single-assignment", "bulk-assignment", "registry"],
    "tabs": [{ "route": "correspondence", "label": "Inbox" }]
  },
  {
    "id": "tasks",
    "route": "orchestrator",
    "label": "Tasks",
    "group": "OPERATIONS",
    "purpose": "Every task in one list: yours, your team's, not yet acknowledged, overdue, at risk, escalated, awaiting a decision and ready to close. A task opens on its record.",
    "owns": ["task views", "acknowledge", "start work", "complete", "decide", "reply", "dispatch", "close and archive"],
    "handoffs": ["correspondence"],
    "merges": ["orchestrator", "acknowledgment", "comments", "response-tracking", "fasttrack", "approvals", "executive", "correspondence-email", "dispatch", "archive"],
    "tabs": [{ "route": "orchestrator", "label": "Tasks" }]
  }
]);

/* Essentials plan UX-402: Administration, outside the office sidebar, opened from the profile menu. Health and Runtime are
   one Health tab (operator-hud redirects to it); the Endpoints tab is dropped (owner decision UX-D7: the Estate Console is
   the endpoint tool). */
export const AdministrationWorkspace = Object.freeze({
  "id": "administration",
  "route": "admin-suite",
  "label": "Administration",
  "group": "SYSTEM",
  "purpose": "Platform administration for IT and user administrators: the suite, settings, health and users.",
  "owns": ["platform-control", "settings", "users", "diagnostics", "runtime health readout"],
  "handoffs": [],
  "merges": ["admin-suite", "settings", "diagnostics", "operator-hud", "user-admin"],
  "tabs": [
    { "route": "admin-suite", "label": "Suite" },
    { "route": "settings", "label": "Settings" },
    { "route": "diagnostics", "label": "Health" },
    { "route": "user-admin", "label": "Users" }
  ]
});

/* Where each route that is no longer a place goes (ESSENTIALS_MAP §6.2). `to` is the route drawn; `inbox` / `tasks` is
   the filter that list opens with; `palette` opens the header search. */
export const RouteRedirects = Object.freeze({
  "ecm-erp-charter": { "to": "home", "why": "A reference document, docs/architecture/ECM_ERP_CHARTER.md; it ran no action and read no state." },
  "scan-intake": { "to": "correspondence", "inbox": { "panel": "register", "registerAs": "scan-counter" }, "why": "Inbox › Register a document, Counter / scan." },
  "activities": { "to": "correspondence", "inbox": { "status": "in-progress" }, "why": "The Inbox's records; Routed was the assigned ones." },
  "single-assignment": { "to": "correspondence", "openSelected": true, "why": "Record › Assign." },
  "bulk-assignment": { "to": "correspondence", "why": "Inbox › select rows › Assign selected." },
  "registry": { "to": "correspondence", "inbox": { "files": true, "status": "all" }, "openSelected": true, "why": "Record › File custody, and the Inbox's Physical files filter (owner decision UX-D2)." },
  "lookup": { "to": "correspondence", "palette": true, "why": "Header search, which opens the record." },
  "acknowledgment": { "to": "orchestrator", "tasks": { "view": "unacknowledged" }, "why": "Record › Acknowledge receipt." },
  "comments": { "to": "orchestrator", "tasks": { "view": "mine" }, "why": "The record's timeline › Add minute or comment." },
  "response-tracking": { "to": "orchestrator", "tasks": { "view": "team" }, "why": "Tasks views; Overview figures." },
  "fasttrack": { "to": "orchestrator", "tasks": { "view": "at-risk" }, "why": "Tasks › At risk; Record › Escalate." },
  "approvals": { "to": "orchestrator", "tasks": { "view": "awaiting-decision" }, "why": "Tasks › Awaiting decision; Record › Request approval, Decide." },
  "executive": { "to": "orchestrator", "tasks": { "view": "awaiting-decision" }, "why": "Tasks › Awaiting decision; Record › Decide." },
  "correspondence-email": { "to": "orchestrator", "tasks": { "view": "ready-to-close" }, "why": "Record › Reply (owner decision UX-D4)." },
  "dispatch": { "to": "orchestrator", "tasks": { "view": "ready-to-close" }, "why": "Record › Record dispatch." },
  "archive": { "to": "orchestrator", "tasks": { "view": "ready-to-close" }, "why": "Record › Close & archive." },
  "statistics": { "to": "home", "why": "Overview figures." },
  "reports": { "to": "home", "why": "Overview › Reports." },
  "briefs": { "to": "home", "why": "Removed from the Workspace (owner decision UX-D3); its data stays on the server." },
  "meetings": { "to": "home", "why": "Removed from the Workspace (owner decision UX-D3); its data stays on the server." },
  "projects": { "to": "home", "why": "Removed from the Workspace (owner decision UX-D3); its data stays on the server." },
  "assistant": { "to": "home", "support": true, "why": "Removed (owner decision UX-D5); Ask the support team is under Help, and a support link opens it there." },
  "operator-hud": { "to": "diagnostics", "why": "Administration › Health, which now shows runtime health too." },
  "endpoint-console": { "to": "admin-suite", "why": "Dropped from the Workspace (owner decision UX-D7); the Estate Console is the endpoint tool." }
});

/* Every route that is not a place: the administration tabs, and each redirected route with where its work is now. */
export const HiddenTechnicalRoutes = Object.freeze(Object.fromEntries([
  ...AdministrationWorkspace.tabs.filter((t) => t.route !== AdministrationWorkspace.route).map((t) => [t.route, { visibleThrough: 'Administration', reason: `A tab of Administration (${t.label}), opened from the profile menu.`, workspace: 'administration', tab: t.label }]),
  ...Object.entries(RouteRedirects).map(([route, r]) => {
    const w = [...VisibleWorkspaces, AdministrationWorkspace].find((x) => x.route === r.to || x.tabs.some((t) => t.route === r.to));
    return [route, { visibleThrough: w?.label || r.to, reason: `Redirects to ${w?.label || r.to}. ${r.why}`, workspace: w?.id || '', tab: w?.tabs.find((t) => t.route === r.to)?.label || '', redirect: r.to }];
  }),
]));

/** The workspace a route belongs to: its own entry, or the one that shows it as a tab. */
export function workspaceOfRoute(route){ return [...VisibleWorkspaces, AdministrationWorkspace].find(w=>w.route===route||(w.tabs||[]).some(t=>t.route===route)) || null; }
export function visibleWorkspaceForRoute(route){ return VisibleWorkspaces.find(w=>w.route===route) || null; }
export function routeVisibility(route){ return visibleWorkspaceForRoute(route) ? 'visible-workspace' : HiddenTechnicalRoutes[route] ? 'guided-internal-route' : 'unknown'; }
export function workspaceGuide(route){
  const v=visibleWorkspaceForRoute(route) || (AdministrationWorkspace.route===route ? AdministrationWorkspace : null);
  if (v) return v;
  const h=HiddenTechnicalRoutes[route];
  return h ? { route, label: route, group:'INTERNAL', purpose:h.reason, owns:[], handoffs:[], visibleThrough:h.visibleThrough } : null;
}

export const ProductCharterReference = Object.freeze({ sources:EntryPoints.map(e=>e.sourceView), charter:'PRODUCT_CHARTER.md', operatingModel:'PRODUCT_OPERATING_MODEL.md' });
