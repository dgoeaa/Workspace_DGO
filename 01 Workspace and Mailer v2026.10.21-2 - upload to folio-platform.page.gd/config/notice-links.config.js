/* Where a staff e-mail's link lands, in place of a SharePoint list or list item (owner direction, 2026-10-20).
 *
 * E-mails link to a Folio platform, never to a SharePoint list. Administrative and governance notices go to the
 * Admin Suite (`/?notice=<key>&record=<id>`); the Admin Suite has no screen that works these lists, so it shows what the
 * notice is about and leaves the administrator to open the list or the record in SharePoint. Portal Registry notices go
 * to the Workspace's Portal submissions (`/?portal=<reference>`, `/?portal=all`), where the Registry works them.
 *
 * The SharePoint addresses live here, not in the e-mail: a link carries only a key from this allow-list and a numeric
 * item id, so a crafted link cannot send an administrator anywhere this file does not name. The e-mails that use each
 * key are listed in docs/folio-Master-Flows-and-Endpoints/deployment/NOTICE_LINKS.md. */

const TENANT = 'https://nitdanigeria.sharepoint.com';

export const NoticeTargets = Object.freeze({
  'http-flow-registry': Object.freeze({
    label: 'HTTP flow registry record',
    list: 'DGO_HTTPFlowRegistry',
    listUrl: `${TENANT}/sites/DGO_ECM_GOVERNANCE/Lists/DGO_HTTPFlowRegistry`,
    about: 'A registered HTTP flow has gone stale, is failing, or has recovered (04 - GOV - Audit HTTP Flow Registry). Review the registry record and its open exception.',
    related: Object.freeze({ section: 'estate', label: 'Open Endpoints' }),
  }),
  'portal-support-case': Object.freeze({
    label: 'Portal support case',
    list: 'Portal Support Cases',
    listUrl: `${TENANT}/sites/Global_Digital_Documents_Centre/Lists/Portal%20Support%20Cases`,
    about: 'A member of the public asked for help through the Document Portal (CG_Portal_Support_Endpoint). Read the case and reply to the person.',
  }),
  'portal-upload-tickets': Object.freeze({
    label: 'Portal upload tickets',
    list: 'Portal Upload Tickets',
    listUrl: `${TENANT}/sites/NEDMS/Lists/Portal%20Upload%20Tickets`,
    about: 'Files declared on a Portal submission that never arrived (CG_Portal_Daily_Sweep). The submitters were asked to send them by reply.',
    related: Object.freeze({ route: 'correspondence', tab: 'portal', label: 'Open Portal submissions' }),
  }),
  'portal-outbox-receipts': Object.freeze({
    label: 'Portal Outbox Receipts',
    list: 'Portal Outbox Receipts',
    listUrl: `${TENANT}/sites/Global_Digital_Documents_Centre/Lists/Portal%20Outbox%20Receipts`,
    about: 'Notices that could not be delivered after three attempts (AUTO_SCHEDULED_SWEEP). They are marked Abandoned; check each address and its last error.',
    related: Object.freeze({ route: 'diagnostics', label: 'Open System Health (failed notices)' }),
  }),
});

/** A list item id as a SharePoint list numbers it, or '' when the value is not one. */
export const noticeRecordId = (v) => (/^\d{1,9}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

/** The SharePoint addresses a notice may open: { list, item } (item '' when the link names no record). */
export function noticeSharePointLinks(key, record) {
  const t = Object.prototype.hasOwnProperty.call(NoticeTargets, key) ? NoticeTargets[key] : null;
  if (!t) return null;
  const id = noticeRecordId(record);
  return { list: `${t.listUrl}/AllItems.aspx`, item: id ? `${t.listUrl}/DispForm.aspx?ID=${id}` : '' };
}
