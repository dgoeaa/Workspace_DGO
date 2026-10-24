/**
 * Canonical, non-destructive module rationalisation registry.
 * This registry describes target ownership and migration; it does not remove legacy routes.
 */
export const RationalisationGroups = Object.freeze({
  workspace: { label:'Workspace', primaryNav:true, purpose:'Role-based entry, workload and contextual assistance' },
  correspondence: { label:'Correspondence', primaryNav:true, purpose:'Intake, correspondence cases, channels and acknowledgements' },
  work: { label:'Work', primaryNav:true, purpose:'Assignments, tasks, activities, queues, projects and engagements' },
  decisions: { label:'Decisions', primaryNav:true, purpose:'Decision cases, approvals and executive review' },
  records: { label:'Records', primaryNav:true, purpose:'Registry, dispatch, closure and archive' },
  oversight: { label:'Oversight', primaryNav:true, purpose:'SLA tracking, metrics, reporting and operational coordination' },
  administration: { label:'Administration', primaryNav:true, roleGated:true, purpose:'Identity, configuration, integrations, provisioning, health and audit' },
  governance: { label:'Governance', primaryNav:false, purpose:'Boundaries, policies, terminology and controlled references' },
  platform: { label:'Platform Services', primaryNav:false, purpose:'Cross-cutting runtime services and reusable UI' }
});

const entry=(group,target,disposition,owner,note)=>Object.freeze({group,target,disposition,owner,note});
export const ModuleRationalisation = Object.freeze({
  home: entry('workspace','workspace/home','retain-refine','workspace','Role-based landing; no domain writes'),
  'operator-hud': entry('workspace','workspace/operations-hud','merge','workspace','Compose into Home while retaining a role-specific route'),
  assistant: entry('workspace','workspace/assistant','retain-refine','workspace','Cross-cutting assistant; never a business-record owner'),
  correspondence: entry('correspondence','correspondence/cases','retain-refine','correspondence','Authoritative correspondence-case owner'),
  'correspondence-email': entry('correspondence','correspondence/channels/email','merge','correspondence','Thin email channel adapter'),
  'scan-intake': entry('correspondence','correspondence/channels/scan','merge','correspondence','Thin scan channel adapter using the common intake envelope'),
  acknowledgment: entry('correspondence','correspondence/acknowledgements','retain-refine','correspondence','Acknowledgement, receipt and ledger capability'),
  overview: entry('workspace','workspace/overview','merge','workspace','Role-oriented overview composed into the Workspace'),
  inbox: entry('work','work/inbox','retain-refine','work','Unified work inbox over assignments, tasks and approvals'),
  tasks: entry('work','work/tasks','retain-refine','work','Authoritative task execution capability'),
  activities: entry('work','work/activity','merge','work','Shared event timeline; display lens only'),
  'single-assignment': entry('work','work/assignments','merge','work','Single mode of authoritative assignment service'),
  'bulk-assignment': entry('work','work/assignments','merge','work','Bulk mode of authoritative assignment service'),
  fasttrack: entry('work','work/queues','retain-refine','work','Special queue policy within Work'),
  projects: entry('work','work/projects','retain-refine','work','Project register and task composition'),
  meetings: entry('work','work/engagements','merge','work','Engagement template using common decision/task primitives'),
  briefs: entry('decisions','decisions/cases','merge','decisions','Decision-case template and common state machine'),
  approvals: entry('decisions','decisions/approvals','retain-refine','decisions','Authoritative approval decision owner'),
  executive: entry('decisions','decisions/executive-workspace','retain-refine','decisions','Read-oriented executive composition layer'),
  registry: entry('records','records/registry','retain-refine','records','Authoritative registry custody and minutes'),
  dispatch: entry('records','records/dispatch','retain-refine','records','Outbound dispatch and proof'),
  archive: entry('records','records/archive','retain-refine','records','Closure, retention, archive and controlled reopen'),
  'response-tracking': entry('oversight','oversight/tracking','merge','oversight','SLA policy over the shared event timeline'),
  reports: entry('oversight','oversight/reporting','merge','oversight','Reports over the common metrics catalogue'),
  statistics: entry('oversight','oversight/reporting','merge','oversight','Charts over the common metrics catalogue'),
  orchestrator: entry('oversight','oversight/operations','retain-refine','oversight','Coordinates commands and events; owns no domain records'),
  'admin-suite': entry('administration','administration/control-centre','split','administration','Split into identity, configuration, integrations, provisioning, health and audit'),
  'user-admin': entry('administration','administration/identity-access','merge','administration','Unified identity and access administration'),
  settings: entry('administration','administration/configuration','merge','administration','Separate defaults, environment, tenant policy and preferences'),
  'endpoint-console': entry('administration','administration/integrations','merge','administration','Integration registry and safe endpoint operations'),
  diagnostics: entry('administration','administration/health','merge','administration','Shared observability, probes and failure diagnostics'),
  'ecm-erp-charter': entry('governance','governance/boundaries','move-out','governance','Governed reference, not a daily operational route'),
  lookup: entry('platform','platform/reference-data','retain-refine','platform','Shared reference-data normalization and cache'),
  comments: entry('platform','platform/collaboration/comments','merge','platform','Reusable collaboration service across cases and tasks')
});

export const ActionContractFields = Object.freeze([
  'id','domainOwner','label','permission','inputSchema','preconditions','command',
  'endpointKey','successEvent','failurePolicy','auditCategory','idempotencyPolicy'
]);
export const rationalisationFor=(moduleId)=>ModuleRationalisation[moduleId]||null;
export const modulesForGroup=(group)=>Object.entries(ModuleRationalisation).filter(([,v])=>v.group===group).map(([k])=>k);
