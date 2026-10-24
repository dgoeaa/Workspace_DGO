/* Read-only. Changes nothing. Run this BEFORE deleting any column.
 *
 * scripts/verify-governance-columns.browser.js established that three columns were created under
 * the wrong internal name by the run of 2026-09-09:
 *
 *   DGO_RoleCatalogue.Version      wanted CatalogueVersion
 *   DGO_EndpointRegistry.FlowUrl   wanted EndpointRedacted
 *   DGO_EndpointRegistry.Version   wanted EndpointVersion
 *
 * "Delete them and re-run" is the obvious remediation and it is only safe if they are empty.
 * DGO_RoleCatalogue carries six role rows that pre-date this run, and the ORIGINAL specification
 * declared a custom column called `Version` holding 'R11.6-PILOT'. If an earlier provisioning
 * created that column successfully, this `Version` is not a stray at all — it is the real column,
 * populated, and deleting it destroys data the estate depends on.
 *
 * A column created minutes ago by a create that reported CREATED, and a column that has held
 * production values for months, are indistinguishable from their names alone. This reads the
 * values so the difference is observed rather than assumed.
 */
(async () => {
  const site = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
  const NOMETA = 'application/json;odata=nometadata';

  const STRAYS = [
    { list: 'DGO_RoleCatalogue',    guid: 'f675598b-271d-4200-8d75-2597aad4057f', field: 'Version',  wanted: 'CatalogueVersion' },
    { list: 'DGO_EndpointRegistry', guid: '08c6e1c4-f2b1-4810-933d-69b4327fb6af', field: 'FlowUrl',  wanted: 'EndpointRedacted' },
    { list: 'DGO_EndpointRegistry', guid: '08c6e1c4-f2b1-4810-933d-69b4327fb6af', field: 'Version',  wanted: 'EndpointVersion' },
  ];

  const rows = [];
  const samples = [];

  for (const s of STRAYS) {
    let res = await fetch(
      `${site}/_api/web/lists(guid'${s.guid}')/items?$select=Id,${s.field}&$top=500`,
      { credentials: 'include', headers: { Accept: NOMETA } });

    if (!res.ok) {
      const body = await res.text();
      rows.push({ list: s.list, field: s.field, items: '?', populated: '?', verdict: `READ FAILED ${res.status}`, note: body.slice(0, 120) });
      continue;
    }

    const items = (await res.json()).value || [];
    const filled = items.filter((it) => {
      const v = it[s.field];
      return v !== null && v !== undefined && String(v).trim() !== '';
    });

    /* A signed trigger URL is a bearer credential. If FlowUrl holds one, that is a live exposure
       and it changes what happens next — so it is detected and reported as a fact, and the value
       itself is never printed. */
    const withSig = filled.filter((it) => /[?&]sig=/i.test(String(it[s.field])));

    rows.push({
      list: s.list,
      field: s.field,
      wanted: s.wanted,
      items: items.length,
      populated: filled.length,
      carriesSignature: withSig.length ? `YES — ${withSig.length}` : 'no',
      verdict: withSig.length ? 'DO NOT DELETE YET — CREDENTIAL PRESENT'
        : filled.length ? 'HOLDS DATA — MIGRATE, DO NOT DELETE'
          : 'EMPTY — SAFE TO DELETE',
    });

    for (const it of filled.slice(0, 6)) {
      const raw = String(it[s.field]);
      samples.push({
        list: s.list, field: s.field, itemId: it.Id,
        value: /[?&]sig=/i.test(raw) ? '(withheld — contains a sig)' : raw.slice(0, 80),
      });
    }
  }

  console.table(rows);
  if (samples.length) {
    console.log('%cValues found (signatures withheld):', 'font-weight:bold');
    console.table(samples);
  }

  const blocked = rows.filter((r) => /DO NOT DELETE|MIGRATE/.test(r.verdict));
  const safe = rows.filter((r) => r.verdict.startsWith('EMPTY'));
  console.log(
    `%c${safe.length} safe to delete · ${blocked.length} must be migrated first`,
    blocked.length ? 'color:#b00;font-weight:bold' : 'color:#080;font-weight:bold',
  );
  if (blocked.length) {
    console.log(
      '%cA populated column is not a stray. Do not delete it. GOVERNANCE-TENANT-RUNBOOK.md §2.7 covers '
      + 'moving the values onto the correctly-named column first.',
      'color:#b00',
    );
  }
})();
