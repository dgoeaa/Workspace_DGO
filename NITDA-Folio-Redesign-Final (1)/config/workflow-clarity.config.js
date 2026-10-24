// Workflow Clarity Layer.
// Module rationalisation, Phase 2 (2026-10-20; docs/architecture/MODULE_RATIONALISATION.md §6): the sidebar holds 13
// workspaces, one per stage of the work, grouped START HERE / OPERATIONS / CONTROL / CLOSURE / SYSTEM. Each workspace
// is a set of tabs, and each tab is one of the 31 declared routes, so every old address still opens, now as a tab of
// its workspace. A tab keeps its own route's role rule, action owner and audit vocabulary; a role sees a workspace when
// it may open at least one of its tabs, and its sidebar entry opens the first such tab. The 18 routes that are not a
// workspace's first tab are listed in HiddenTechnicalRoutes with the workspace that shows them.
export const VisibleWorkspaces = Object.freeze([
  {
    "id": "command-center",
    "route": "home",
    "label": "Command Center",
    "group": "START HERE",
    "purpose": "Shows what needs attention now and routes users to the correct governed workspace.",
    "owns": [
      "work summary",
      "attention queues",
      "guided handoff",
      "scope-boundary-charter",
      "ownership-matrix",
      "shared-terminology",
      "integration-rules"
    ],
    "handoffs": [
      "correspondence",
      "orchestrator",
      "approvals",
      "dispatch",
      "response-tracking",
      "activities",
      "fasttrack",
      "assistant",
      "reports"
    ],
    "tabs": [
      {
        "route": "home",
        "label": "Overview"
      },
      {
        "route": "ecm-erp-charter",
        "label": "ERP–ECM Charter"
      }
    ]
  },
  {
    "id": "intake",
    "route": "correspondence",
    "label": "Intake",
    "group": "OPERATIONS",
    "purpose": "Every incoming record in one list, from the portal, e-mail, the counter and the scanner: triage it, decide it, assign it, or route it to the SIWES, NYSC or archive queue.",
    "owns": [
      "create correspondence",
      "classify",
      "triage",
      "assign one",
      "payload preview",
      "confirmation",
      "attention queue",
      "queue filters"
    ],
    "handoffs": [
      "registry",
      "orchestrator"
    ],
    "tabs": [
      {
        "route": "correspondence",
        "label": "To triage"
      },
      {
        "route": "scan-intake",
        "label": "Counter deposit"
      },
      {
        "route": "activities",
        "label": "Routed"
      },
      {
        "route": "single-assignment",
        "label": "Assignment Desk"
      },
      {
        "route": "bulk-assignment",
        "label": "Bulk assignment"
      }
    ]
  },
  {
    "id": "my-work",
    "route": "orchestrator",
    "label": "My Work",
    "group": "OPERATIONS",
    "purpose": "The work assigned to you: acknowledge it, start it, update it and complete it, with your team's, overdue and escalated work one tab away.",
    "owns": [
      "acknowledge",
      "start work",
      "progress",
      "complete action",
      "submit review",
      "acknowledgment queue",
      "receipt confirmation",
      "threaded comments"
    ],
    "handoffs": [
      "lookup"
    ],
    "tabs": [
      {
        "route": "orchestrator",
        "label": "My tasks"
      },
      {
        "route": "acknowledgment",
        "label": "Acknowledge"
      },
      {
        "route": "comments",
        "label": "Comments"
      }
    ]
  },
  {
    "id": "registry",
    "route": "registry",
    "label": "Registry",
    "group": "OPERATIONS",
    "purpose": "Physical file custody: register a file jacket, record who holds it, move it on and close it. Every hand-over is kept.",
    "owns": [
      "registry search",
      "official file control"
    ],
    "handoffs": [
      "scan-intake",
      "correspondence"
    ],
    "tabs": [
      {
        "route": "registry",
        "label": "File custody"
      }
    ]
  },
  {
    "id": "lookup",
    "route": "lookup",
    "label": "Lookup",
    "group": "OPERATIONS",
    "purpose": "Search and retrieve any record by reference, sender or subject, and act on it directly.",
    "owns": [
      "record search",
      "direct action"
    ],
    "handoffs": [
      "dispatch",
      "response-tracking"
    ],
    "tabs": [
      {
        "route": "lookup",
        "label": "Lookup & Direct Action"
      }
    ]
  },
  {
    "id": "sla-tracking",
    "route": "response-tracking",
    "label": "SLA & Tracking",
    "group": "CONTROL",
    "purpose": "Monitor responses and ageing, and act on work at risk of missing its service-level target before it does.",
    "owns": [
      "monitor response",
      "ageing",
      "matched pairs",
      "tracking export",
      "SLA risk queue",
      "escalation"
    ],
    "handoffs": [
      "reports",
      "statistics",
      "projects"
    ],
    "tabs": [
      {
        "route": "response-tracking",
        "label": "Monitoring"
      },
      {
        "route": "fasttrack",
        "label": "SLA risk"
      }
    ]
  },
  {
    "id": "decisions",
    "route": "approvals",
    "label": "Decisions",
    "group": "CONTROL",
    "purpose": "Everything waiting for a decision in one place: approval requests, DG/CEO correspondence decisions and brief packs.",
    "owns": [
      "approve",
      "return",
      "reject",
      "minute",
      "executive handoff",
      "executive decision queue",
      "brief pack",
      "submission tracking"
    ],
    "handoffs": [
      "meetings",
      "dispatch"
    ],
    "tabs": [
      {
        "route": "approvals",
        "label": "Approvals"
      },
      {
        "route": "executive",
        "label": "DG/CEO"
      },
      {
        "route": "briefs",
        "label": "Briefs"
      }
    ]
  },
  {
    "id": "meetings",
    "route": "meetings",
    "label": "Meetings",
    "group": "CONTROL",
    "purpose": "Request, schedule and record the outcomes of meetings; agreed actions are recorded for their owners.",
    "owns": [
      "meeting requests",
      "outcomes"
    ],
    "handoffs": [
      "orchestrator",
      "approvals"
    ],
    "tabs": [
      {
        "route": "meetings",
        "label": "Meetings"
      }
    ]
  },
  {
    "id": "projects",
    "route": "projects",
    "label": "Projects",
    "group": "CONTROL",
    "purpose": "A register of projects and the measures they are tracked against.",
    "owns": [
      "project register",
      "tracked measures"
    ],
    "handoffs": [
      "response-tracking",
      "reports"
    ],
    "tabs": [
      {
        "route": "projects",
        "label": "Projects"
      }
    ]
  },
  {
    "id": "insight",
    "route": "statistics",
    "label": "Insight",
    "group": "CONTROL",
    "purpose": "Statistics and trend views, and the formal M1–M10 reports, built by one report engine.",
    "owns": [
      "analytics",
      "trend views",
      "report generation",
      "export"
    ],
    "handoffs": [],
    "tabs": [
      {
        "route": "statistics",
        "label": "Statistics"
      },
      {
        "route": "reports",
        "label": "Reports"
      }
    ]
  },
  {
    "id": "outbound",
    "route": "correspondence-email",
    "label": "Outbound",
    "group": "CLOSURE",
    "purpose": "Send official correspondence by e-mail, record any other dispatch, and close a reference with its evidence.",
    "owns": [
      "outgoing correspondence email drafts",
      "official template rendering",
      "email dispatch register",
      "queued email retry evidence",
      "send dispatch",
      "capture receipt",
      "closure check",
      "archive handoff"
    ],
    "handoffs": [
      "lookup"
    ],
    "tabs": [
      {
        "route": "correspondence-email",
        "label": "Send by email"
      },
      {
        "route": "dispatch",
        "label": "Record a dispatch"
      },
      {
        "route": "archive",
        "label": "Close & archive"
      }
    ]
  },
  {
    "id": "admin-suite",
    "route": "admin-suite",
    "label": "Admin Suite",
    "group": "SYSTEM",
    "purpose": "The single monitoring, control and management interface: the endpoint estate, the flow catalogue, live checks, commissioning, the capsule registry, people, platform control and the audit trail.",
    "owns": [
      "administrative-action-catalogue",
      "endpoint-estate-oversight",
      "flow-request-shapes",
      "live-endpoint-checks",
      "commissioning-register",
      "capsule-registry-administration",
      "platform-control",
      "evidence-export",
      "settings",
      "users",
      "diagnostics",
      "operator health",
      "runtime health readout"
    ],
    "handoffs": [],
    "tabs": [
      {
        "route": "admin-suite",
        "label": "Suite"
      },
      {
        "route": "settings",
        "label": "Administration"
      },
      {
        "route": "diagnostics",
        "label": "Health"
      },
      {
        "route": "operator-hud",
        "label": "Runtime"
      },
      {
        "route": "endpoint-console",
        "label": "Endpoints"
      },
      {
        "route": "user-admin",
        "label": "Users"
      }
    ]
  },
  {
    "id": "assistant",
    "route": "assistant",
    "label": "Assistant",
    "group": "SYSTEM",
    "purpose": "Contextual guidance for the DGO operating model — not a module of record.",
    "owns": [
      "contextual guidance"
    ],
    "handoffs": [
      "home"
    ],
    "tabs": [
      {
        "route": "assistant",
        "label": "Assistant"
      }
    ]
  }
]);

export const HiddenTechnicalRoutes = Object.freeze({
  "ecm-erp-charter": {
    "visibleThrough": "Command Center",
    "reason": "A tab of Command Center (ERP–ECM Charter). Defines the authoritative boundary, ownership model, and integration rules between ERP and ECM.",
    "workspace": "command-center",
    "tab": "ERP–ECM Charter"
  },
  "scan-intake": {
    "visibleThrough": "Intake",
    "reason": "A tab of Intake (Counter deposit). A document handed in at the counter is scanned and deposited here, and becomes an incoming record in the Intake Register, like every other channel (F-6: it used to sit under Registry, which holds file jackets, not incoming records).",
    "workspace": "intake",
    "tab": "Counter deposit"
  },
  "activities": {
    "visibleThrough": "Intake",
    "reason": "A tab of Intake (Routed). Cross-workspace queue of items awaiting action, filterable by stage and owner.",
    "workspace": "intake",
    "tab": "Routed"
  },
  "single-assignment": {
    "visibleThrough": "Intake",
    "reason": "A tab of Intake (Assignment Desk). Gives one record to an officer as a governed task; it is also built into Intake's own record view.",
    "workspace": "intake",
    "tab": "Assignment Desk"
  },
  "bulk-assignment": {
    "visibleThrough": "Intake",
    "reason": "A tab of Intake (Bulk assignment). Assigns several records at once, behind a one-time code.",
    "workspace": "intake",
    "tab": "Bulk assignment"
  },
  "acknowledgment": {
    "visibleThrough": "My Work",
    "reason": "A tab of My Work (Acknowledge). Confirm receipt of assigned work before it starts, with the SLA clock in view.",
    "workspace": "my-work",
    "tab": "Acknowledge"
  },
  "comments": {
    "visibleThrough": "My Work",
    "reason": "A tab of My Work (Comments). Threaded collaboration on correspondence and tasks, visible to everyone on the record.",
    "workspace": "my-work",
    "tab": "Comments"
  },
  "fasttrack": {
    "visibleThrough": "SLA & Tracking",
    "reason": "A tab of SLA & Tracking (SLA risk). Track items at risk of breaching their service-level target before they do.",
    "workspace": "sla-tracking",
    "tab": "SLA risk"
  },
  "executive": {
    "visibleThrough": "Decisions",
    "reason": "A tab of Decisions (DG/CEO). Executive review and decision surface for DG/CEO correspondence and exceptions.",
    "workspace": "decisions",
    "tab": "DG/CEO"
  },
  "briefs": {
    "visibleThrough": "Decisions",
    "reason": "A tab of Decisions (Briefs). Prepare and track brief packs raised for an executive decision.",
    "workspace": "decisions",
    "tab": "Briefs"
  },
  "reports": {
    "visibleThrough": "Insight",
    "reason": "A tab of Insight (Reports). Generate and export operational reports drawn from tracking and management views.",
    "workspace": "insight",
    "tab": "Reports"
  },
  "dispatch": {
    "visibleThrough": "Outbound",
    "reason": "A tab of Outbound (Record a dispatch). Prepare dispatch, send/no-dispatch, capture receipt, close and hand off to archive.",
    "workspace": "outbound",
    "tab": "Record a dispatch"
  },
  "archive": {
    "visibleThrough": "Outbound",
    "reason": "A tab of Outbound (Close & archive). It closes a reference with its evidence bundle, the last step after a reply has gone out (F-6: executives may open it, and now reach it through Outbound).",
    "workspace": "outbound",
    "tab": "Close & archive"
  },
  "settings": {
    "visibleThrough": "Admin Suite",
    "reason": "A tab of Admin Suite (Administration). Manage profile, settings and users. Restricted to IT — see the System · Restricted group.",
    "workspace": "admin-suite",
    "tab": "Administration"
  },
  "diagnostics": {
    "visibleThrough": "Admin Suite",
    "reason": "A tab of Admin Suite (Health). System health, connectivity and configuration checks. Restricted to IT.",
    "workspace": "admin-suite",
    "tab": "Health"
  },
  "operator-hud": {
    "visibleThrough": "Admin Suite",
    "reason": "A tab of Admin Suite (Runtime). Runtime and integration health at a glance while operating the platform.",
    "workspace": "admin-suite",
    "tab": "Runtime"
  },
  "endpoint-console": {
    "visibleThrough": "Admin Suite",
    "reason": "A tab of Admin Suite (Endpoints). The endpoint estate: every contract key on both surfaces and every workflow in the tenant, checked against the tenant register.",
    "workspace": "admin-suite",
    "tab": "Endpoints"
  },
  "user-admin": {
    "visibleThrough": "Admin Suite",
    "reason": "A tab of Admin Suite (Users). Adds, changes and disables accounts in the user directory.",
    "workspace": "admin-suite",
    "tab": "Users"
  }
});
/** The workspace a route belongs to: its own entry, or the one that shows it as a tab. */
export function workspaceOfRoute(route){ return VisibleWorkspaces.find(w=>w.route===route||(w.tabs||[]).some(t=>t.route===route)) || null; }
export function visibleWorkspaceForRoute(route){ return VisibleWorkspaces.find(w=>w.route===route) || null; }
export function routeVisibility(route){ return visibleWorkspaceForRoute(route) ? 'visible-workspace' : HiddenTechnicalRoutes[route] ? 'guided-internal-route' : 'unknown'; }
export function workspaceGuide(route){
  const v=visibleWorkspaceForRoute(route);
  if (v) return v;
  const h=HiddenTechnicalRoutes[route];
  return h ? { route, label: route, group:'INTERNAL', purpose:h.reason, owns:[], handoffs:[], visibleThrough:h.visibleThrough } : null;
}

export const ProductCharterReference = Object.freeze({ sources:['physical-scanned-documents','customer-service-emails','public-portal-correspondence','dgceo-outgoing-correspondence'], charter:'PRODUCT_CHARTER.md', operatingModel:'PRODUCT_OPERATING_MODEL.md' });
