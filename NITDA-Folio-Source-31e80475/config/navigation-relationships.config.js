/* Module rationalisation F-15: this file was a third description of the navigation (9 sidebar routes, 5 screens left out)
   that contradicted the live sidebar and that nothing in the running platform read. It is now derived from
   config/workflow-clarity.config.js, the one the sidebar is built from, so the two cannot disagree. */
import { VisibleWorkspaces, HiddenTechnicalRoutes } from './workflow-clarity.config.js';

const groupKey = (g) => String(g).replace(/\s+/g, '_');
const primarySidebar = {};
for (const w of VisibleWorkspaces) (primarySidebar[groupKey(w.group)] ||= []).push(w.route);
const hiddenModules = {};
for (const [route, h] of Object.entries(HiddenTechnicalRoutes)) {
  const owner = VisibleWorkspaces.find((w) => w.id === h.workspace || w.label === h.visibleThrough);
  hiddenModules[route] = { ownerWorkspace: owner?.route || '', entryFrom: owner ? [owner.route] : [], exitTo: owner ? [owner.route] : [] };
}
export const NavigationRelationships = Object.freeze({ schema: 'dgo-navigation-relationships/v2', derivedFrom: 'config/workflow-clarity.config.js', primarySidebar, hiddenModules });
