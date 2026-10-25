/**
 * Physical file custody: opening an official file, routing it with a minute, recording its receipt, closing it.
 *
 * These lived inside modules/registry.js. The owner decided that file custody is a panel on the record (essentials plan
 * UX-D2, UX-204), so they are here, once, and Registry and the record page both call them: one owner and audit name
 * each (config/action-ownership.config.js, `registry`), one server write each. Each resolves to an outcome
 * ({ ok, file, message }) and the calling screen says it in its own words; the calling screen asks for confirmation.
 *
 * F-24: a file is opened on the server, which issues its number (open-file), and every hand-over is a move-file, which
 * records the holder and the movement. A file registered on this device only has nothing on the server to move.
 */
import { executeOwnedAction } from './governed-actions.js';
import { Payloads, attempt, isServerKey } from './server-writes.js';
import { State } from './state.js';
import { createRegistryFile, createMovement, audit } from './enterprise-domain.js';

const refOf = (x) => x?.registryNumber || x?.referenceId || String(x?.id || '');

/** Open an official file for a correspondence record: the server issues its number. */
export const openFile = (c) => executeOwnedAction('registry', 'register-file', async () => {
  const w = await attempt(Payloads.openFile({ title: `${c.referenceId ? c.referenceId + ' · ' : ''}${c.subject || 'Untitled'}`.slice(0, 255), toOrgKey: 'Central Registry' }), { module: 'registry', ref: c.referenceId || String(c.id) });
  if (!w.ok) return w;
  const st = State.get();
  const f = { ...createRegistryFile(c, st.profile.email), id: w.data.entityKey, entityKey: w.data.entityKey, registryNumber: w.data.fileRef || '', fileRef: w.data.fileRef || '', source: 'registry' };
  State.patch({ registryFiles: [f, ...(st.registryFiles || [])], correspondence: (st.correspondence || []).map((x) => x.id === c.id ? { ...x, referenceId: x.referenceId || f.registryNumber } : x), audit: [audit('File Registered', 'registryFile', f.id, { registryNumber: f.registryNumber }, st.profile.email), ...(st.audit || [])] }, { module: 'registry', action: 'registry:register', ref: f.registryNumber });
  return { ok: true, file: f };
}, { ref: c.referenceId || String(c.id) });

/** Record a minute and send the file on: custody passes to `to`, awaiting their receipt. */
export async function routeFile(file, { from = file.currentHolder, to, action = 'FOR_ACTION', priority = 'normal', minute = '' }) {
  if (!isServerKey(file.entityKey)) return { ok: false, localOnly: true, message: 'This file was registered on this device only, so the server has no record of it to move. Register it again to give it a registry number.' };
  return executeOwnedAction('registry', 'route-file', async () => {
    const w = await attempt(Payloads.moveFile(file, { toOrgKey: to, movementAction: action || 'FOR_ACTION', reason: minute }), { module: 'registry', ref: file.registryNumber });
    if (!w.ok) return w;
    const s = State.get(), d = { from, to, action, priority, minute };
    const m = createMovement(file, { ...d, by: s.profile.email });
    const note = { id: crypto.randomUUID(), registryFileId: file.id, registryNumber: file.registryNumber, referenceId: file.referenceId, text: minute, action, priority, routeTo: to, by: s.profile.email, at: new Date().toISOString() };
    const updated = { ...file, status: 'Routed', currentHolder: to, currentDsu: to };
    State.patch({ registryFiles: (s.registryFiles || []).map((x) => x.id === file.id ? updated : x), fileMovements: [m, ...(s.fileMovements || [])], registryMinutes: [note, ...(s.registryMinutes || [])], audit: [audit('File Routed', 'registryFile', file.id, { movementId: m.id, to }, s.profile.email), ...(s.audit || [])] }, { module: 'registry', action: 'registry:route', ref: file.registryNumber });
    return { ok: true, file: updated, movement: m };
  }, { ref: refOf(file) });
}

/** Record that the holder a file was routed to now has it. */
export const receiveFile = (file, movement) => executeOwnedAction('registry', 'receive-file', async () => {
  if (isServerKey(file.entityKey)) { const w = await attempt(Payloads.moveFile(file, { toOrgKey: movement.to, movementAction: 'RECEIVED' }), { module: 'registry', ref: file.registryNumber }); if (!w.ok) return w; }
  const s = State.get();
  State.patch({ fileMovements: (s.fileMovements || []).map((x) => x.id === movement.id ? { ...x, status: 'Received', receivedAt: new Date().toISOString(), receivedBy: s.profile.email } : x), registryFiles: (s.registryFiles || []).map((x) => x.id === file.id ? { ...x, status: 'Received' } : x), audit: [audit('Custody Received', 'registryFile', file.id, { movementId: movement.id }, s.profile.email), ...(s.audit || [])] }, { module: 'registry', action: 'registry:receive', ref: file.registryNumber });
  return { ok: true };
}, { ref: refOf(file) });

/** Close an official file: no further minute or movement can be recorded against it. */
export const closeFile = (file) => executeOwnedAction('registry', 'close-file', async () => {
  if (isServerKey(file.entityKey)) { const w = await attempt(Payloads.moveFile(file, { toOrgKey: 'Central Registry', movementAction: 'CLOSED', reason: 'File closed' }), { module: 'registry', ref: file.registryNumber }); if (!w.ok) return w; }
  const s = State.get(), at = new Date().toISOString();
  State.patch({ registryFiles: (s.registryFiles || []).map((x) => x.id === file.id ? { ...x, status: 'Closed', closedAt: at } : x), audit: [audit('File Closed', 'registryFile', file.id, {}, s.profile.email), ...(s.audit || [])] }, { module: 'registry', action: 'registry:closed', ref: file.registryNumber });
  return { ok: true };
}, { ref: refOf(file) });
