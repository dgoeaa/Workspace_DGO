/* Essentials plan UX-201: the source views are the four intakes of config/entry-points.config.js, in its order, under
   its names, plus "All". Nothing here is declared twice. A view's id is the entry point's sourceView, the value stored
   records already carry. */
import { EntryPoints } from './entry-points.config.js';
export const SourceViewAll = 'all';
export const SourceViews = Object.freeze([
  Object.freeze({ id:SourceViewAll, label:'All sources', short:'All', icon:'i-grid', purpose:'Records from every intake.' }),
  ...EntryPoints.map(e => Object.freeze({ id:e.sourceView, entryPoint:e.id, label:e.label, short:e.short, icon:e.icon, purpose:e.purpose })),
]);
export const SourceViewIds = Object.freeze(SourceViews.map(s=>s.id));
export function sourceView(id){ return SourceViews.find(s=>s.id===id) || SourceViews[0]; }
export function isSourceView(id){ return SourceViewIds.includes(id); }
