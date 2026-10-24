/**
 * The GOV-04 change of deployment/NOTICE_LINKS.md, as a function: its five registry alerts link to the Admin Suite
 * (`/?notice=http-flow-registry&record=<id>`) instead of the DGO_HTTPFlowRegistry list item (owner, 2026-10-20).
 *
 * It works on the definition's text and counts before it changes anything: exactly five addresses and three
 * "Open registry record" labels, or nothing is changed. The same flow already changed reads as applied.
 */
export const OLD_URL = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE/Lists/DGO_HTTPFlowRegistry/DispForm.aspx?ID=';
export const NEW_URL = 'https://folio-platform.page.gd/?notice=http-flow-registry&record=';
export const OLD_LABEL = "'Open registry record'";
export const NEW_LABEL = "'Open in the Folio Admin Suite'";
export const EXPECT = { urls: 5, labels: 3 };

const count = (text, s) => text.split(s).length - 1;

/** { state: 'change' | 'applied' | 'refused', definition?, counts, reason? } */
export function rewriteGov04(definition) {
  const text = JSON.stringify(definition);
  const counts = { oldUrl: count(text, OLD_URL), newUrl: count(text, NEW_URL), oldLabel: count(text, OLD_LABEL), newLabel: count(text, NEW_LABEL) };
  if (counts.oldUrl === 0 && counts.oldLabel === 0 && counts.newUrl === EXPECT.urls && counts.newLabel === EXPECT.labels) return { state: 'applied', counts };
  if (counts.oldUrl !== EXPECT.urls || counts.oldLabel !== EXPECT.labels || counts.newUrl || counts.newLabel) {
    return { state: 'refused', counts, reason: `expected ${EXPECT.urls} registry addresses and ${EXPECT.labels} "Open registry record" labels and none of the new text; the flow has changed since NOTICE_LINKS.md was written` };
  }
  return { state: 'change', counts, definition: JSON.parse(text.split(OLD_URL).join(NEW_URL).split(OLD_LABEL).join(NEW_LABEL)) };
}
