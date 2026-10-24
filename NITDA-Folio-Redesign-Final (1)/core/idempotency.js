/* Idempotency keys for Folio's writes (IDENTIFICATION_SYSTEM.md §8.3, decision B3).
 *
 * A key is the SHA-256 hex of (operation, reference, actor, time bucket, payload digest). It is sent
 * to the flows as `clientRequestHash`, and a flow that has already stored the same hash in the last
 * 7 days returns its first result instead of acting twice. So the key must be:
 *
 *   STABLE ACROSS A REPLAY. It is computed once per user action and travels with any queued copy.
 *     A replay never recomputes it (core/write-manager.js, core/pending-queue.js). For a queued item
 *     that predates this, `at` pins the time bucket to when it was queued, so the key still can't
 *     drift with the clock.
 *   FREE OF PERSONAL DATA. Only the hash leaves the browser, never the email it was built from.
 *   FAITHFUL TO THE WHOLE PAYLOAD. The digest serialises nested objects with sorted keys. The earlier
 *     JSON.stringify(payload, topLevelKeys) used the key list as an allow-list at every depth, so
 *     nested fields were dropped and two different changes to the same user hashed the same. */
const _seen=new Map(); const enc=new TextEncoder();
const hex=buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(text){ return hex(await crypto.subtle.digest('SHA-256',enc.encode(String(text)))); }
export function canonical(v){ if(Array.isArray(v)) return `[${v.map(canonical).join(',')}]`; if(v&&typeof v==='object') return `{${Object.keys(v).sort().filter(k=>v[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`; return JSON.stringify(v===undefined?null:v); }
async function digestPayload(payload){ return sha256(canonical(payload||{})); }
export const Idempotency=Object.freeze({key,remember,seen,clearExpired,bucket,sha256,canonical});
export function bucket(windowSeconds=300,at=Date.now()){ const t=typeof at==='number'?at:Date.parse(at); return Math.floor((Number.isFinite(t)?t:Date.now())/(windowSeconds*1000)); }
export async function key({operation,ref='',actor={},payload={},windowSeconds=300,at}){ return sha256(['idem',operation,ref,String(actor.email||'').trim().toLowerCase(),bucket(windowSeconds,at??Date.now()),await digestPayload(payload)].join(':')); }
export function remember(k,ttlMs=300000){ _seen.set(k,Date.now()+ttlMs); return k; }
export function seen(k){ const exp=_seen.get(k); if(!exp) return false; if(exp<Date.now()){_seen.delete(k);return false;} return true; }
export function clearExpired(){ for(const [k,exp] of _seen) if(exp<Date.now()) _seen.delete(k); return _seen.size; }
