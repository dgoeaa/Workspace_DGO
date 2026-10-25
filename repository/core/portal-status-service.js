// Portal status write-back — DECISIONS.md D1, readiness ITEM-6.
//
// A citizen tracks a submission on the portal, which reads Portal Registry and Portal Status
// Timeline. Nothing in the internal estate wrote either, so a citizen could only ever see
// "received". D1 puts the write-back on the intake flow as a second branch, called by this
// platform when an officer changes a portal item's state; the owner identifies the intake flow
// as IP_SCAN_INTAKE (2026-10-08), so the call goes to the SCAN_INTAKE address, the one D1's
// client side named (PORTAL_STATUS_WRITEBACK, sourceKey SCAN_INTAKE).
//
// The trigger is a PUT (it takes deposits as raw bytes), so the branch is chosen by the
// X-DGO-Action: writeback header and the body is JSON. The officer is the sign-in proof
// (authHeaders), never a field of the request. CG_Registry_Status_Notifier, triggered by the
// row change, tells the citizen; nothing here sends mail.

import { EndpointRegistry } from './endpoint-registry.js';
import { authHeaders } from './auth.js';

/** The portal's governed statuses an officer may set (Portal Registry Status choices). `withdrawn` is the citizen's own. */
export const PORTAL_STAFF_STATUSES = Object.freeze([
  Object.freeze({ value: 'received', label: 'Received' }),
  Object.freeze({ value: 'validation', label: 'Validated' }),
  Object.freeze({ value: 'review', label: 'Under review' }),
  Object.freeze({ value: 'action-required', label: 'Action required from the submitter' }),
  Object.freeze({ value: 'approved', label: 'Approved' }),
  Object.freeze({ value: 'declined', label: 'Declined' }),
]);
const ALLOWED = new Set(PORTAL_STAFF_STATUSES.map((s) => s.value));

export function portalStatusConfigured() {
  return !!EndpointRegistry.url('SCAN_INTAKE');
}

/**
 * Set a portal submission's status. Returns `{ok, referenceId, status, label, updatedBy}` or
 * `{ok:false, reason, status?}` with reason one of not-configured, invalid, unreachable,
 * unauthenticated, forbidden, not-found or refused.
 */
export async function setPortalStatus({ referenceId, status, label = '', note = '' }, { fetchImpl = fetch } = {}) {
  const url = EndpointRegistry.url('SCAN_INTAKE');
  if (!url) return { ok: false, reason: 'not-configured' };
  const ref = String(referenceId || '').trim().toUpperCase();
  const st = String(status || '').trim().toLowerCase();
  if (!ref || !ALLOWED.has(st)) return { ok: false, reason: 'invalid' };
  if (String(label).length > 255 || String(note).length > 4000) return { ok: false, reason: 'invalid' };

  let res;
  try {
    res = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-DGO-Action': 'writeback', ...(await authHeaders()) },
      body: JSON.stringify({ referenceId: ref, status: st, label: String(label).trim(), note: String(note).trim() }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  let body = {};
  try { body = await res.json(); } catch { /* the status code still says what happened */ }
  if (!res.ok) {
    return { ok: false, status: res.status,
      reason: res.status === 401 ? 'unauthenticated' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not-found'
        : res.status === 400 ? 'invalid' : 'refused' };
  }
  const data = body.data || {};
  return { ok: true, referenceId: body.referenceId || data.referenceId || ref, status: data.status || st, label: data.label || '', updatedBy: data.updatedBy || '' };
}
