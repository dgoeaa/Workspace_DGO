// The send log's rows for one letter.
//
// DGO_MAIL_LOG's "list" reads only the newest 5,000 rows of the log and filters them, so once the
// log is larger an older letter's rows are not in it. Each addressee's row is therefore read
// directly by its message id (<letter id>-<addressee key>, a Title look-up), five at a time. The
// letter's test sends, whose ids are random, are taken from "list" as before.

import { op } from './api.js';

export async function letterLog(settings, c, { batch = 5 } = {}) {
  const keys = c.recipients || [];
  const rows = [];
  for (let i = 0; i < keys.length; i += batch) {
    const part = await Promise.all(keys.slice(i, i + batch).map(async (k) => {
      try {
        const d = await op(settings, 'MAIL_LOG', 'get', { messageId: `${c.id}-${k}` });
        const history = d?.history || [d?.item].filter(Boolean);
        return history.find((x) => x?.status === 'Sent') || history[0] || null;
      } catch (e) {
        if (/NOT_FOUND/.test(e.message || '')) return null;
        throw e;
      }
    }));
    rows.push(...part.filter(Boolean));
  }
  let tests = [];
  try {
    tests = ((await op(settings, 'MAIL_LOG', 'list', { campaignId: c.id, top: 500 }))?.items || [])
      .filter((i) => i.messageId && i.messageId !== `${c.id}-${i.recipientKey}`);
  } catch { /* the test sends are a courtesy; the addressees' rows above are what counts */ }
  return [...rows, ...tests];
}
