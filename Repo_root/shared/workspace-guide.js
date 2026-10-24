import { VisibleWorkspaces, HiddenTechnicalRoutes, workspaceGuide, AdministrationWorkspace } from '../config/workflow-clarity.config.js';
export function guideFor(route){ return workspaceGuide?.(route) || VisibleWorkspaces.find(w=>w.route===route) || HiddenTechnicalRoutes[route] || null; }
export function allWorkspaceCommands(){
  return [
    ...VisibleWorkspaces.map(w=>({route:w.route,label:w.label,group:w.group,purpose:w.purpose,primary:true})),
    // V-05 — the palette is the one surface that reaches all 29 routes, so it is the one
    // surface where a screen must not be called something no other surface calls it. These
    // used to be route.replace(/-/g,' '), so the palette listed "scan intake" and "user
    // admin" in lower case beside nine properly-named workspaces.
    /* Essentials plan UX-401/402: a redirected route is not offered (it would only land on its place); Administration and
       its tabs are, to the accounts that may open them. */
    {route:AdministrationWorkspace.route,label:AdministrationWorkspace.label,group:AdministrationWorkspace.group,purpose:AdministrationWorkspace.purpose,primary:false,visibleThrough:'Profile menu'},
    ...Object.entries(HiddenTechnicalRoutes).filter(([,v])=>!v.redirect).map(([route,v])=>({route,label:`Administration › ${v.tab}`,group:'Contextual',purpose:v.reason,visibleThrough:v.visibleThrough,primary:false}))
  ];
}
