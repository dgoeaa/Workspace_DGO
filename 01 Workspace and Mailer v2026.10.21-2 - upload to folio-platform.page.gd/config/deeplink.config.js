export const DeepLinkConfig = Object.freeze({
  schema: 'dgo-deeplink-config/v1',
  acceptedParams: Object.freeze({
    TaskID: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task' },
    taskId: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task' },
    ACK: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task' },
    AssnPID: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task' },
    /* The shapes the live assignment flows actually send (Bulk Assign Direct and the single
       assignment notice): `?item=2109&…&ref=TASK-2109` and `?items=2109,2110&…&batch=…`.
       They must sit ABOVE `ref`: the first accepted parameter wins, and `ref` would otherwise
       send an acknowledgement link to Lookup. `items` is a list; the first is opened and
       the rest ride along as `taskIds`. */
    item: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task' },
    items: { contextKey:'taskId', route:'acknowledgment', action:'acknowledge-task', list:true },
    DGOPID: { contextKey:'referenceId', route:'lookup', action:'open-document' },
    ITEMID: { contextKey:'referenceId', route:'lookup', action:'open-document' },
    /* Staff notices that once linked to a SharePoint list (config/notice-links.config.js): a Portal Registry record
       opens in Portal submissions, an administrative list in the Admin Suite, which offers the list itself. */
    portal: { contextKey:'portalRef', route:'correspondence', action:'open-portal-submission' },
    notice: { contextKey:'notice', route:'admin-suite', action:'open-notice' },
    USERSUPPORT: { contextKey:'support', route:'assistant', action:'open-support' },
    support: { contextKey:'support', route:'assistant', action:'open-support' },
    ref: { contextKey:'referenceId', route:'lookup', action:'open-document' },
    referenceId: { contextKey:'referenceId', route:'lookup', action:'open-document' }
  }),
  /* Page names the notification flows link to on the old hosts. When the Workspace is served
     for one of these paths, the path decides the route even if no parameter matched. */
  pathRoutes: Object.freeze({
    'acknowledge.html': { route:'acknowledgment', action:'acknowledge-task' },
    'index_bulk.html': { route:'acknowledgment', action:'acknowledge-task' },
    'support.html': { route:'assistant', action:'open-support' }
  }),
  /* `ref=TASK-2109` names a task, not a document. */
  taskRefPattern: /^TASK-(\d+)$/i,
  /* Where the Workspace is published. Every link a notification sends starts here
     (docs/folio-Master-Flows-and-Endpoints/deployment/DEEPLINK_AUDIT.md lists the flows still pointing elsewhere).
     folio-platform.page.gd is the primary host (owner, 2026-10-19; folio-gateway.rf.gd until then); internal-ops.rf.gd and
     activityweb.page.gd are allowed origins too, but links go to the primary. */
  productionBase: 'https://folio-platform.page.gd/',
  routeFallback: 'home',
  preserveQueryParams: ['record','batch','title','email','name','source','returnTo','batchId','trackingId','actorEmail','actorName','userEmail','userName','staffEmail','displayName','persona','role','department','unit','phone'],
  source: 'deeplink-html'
});
export function deeplinkParamEntries(){ return Object.entries(DeepLinkConfig.acceptedParams); }
