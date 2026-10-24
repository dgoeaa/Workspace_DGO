/* Read-only. Changes nothing.
 *
 * List every CUSTOM column on the two lists in question, with the flags that decide what a column
 * is. Both earlier scripts asked narrow questions — "is X there?", "what does X hold?" — and a
 * narrow question cannot show a column neither name anticipated.
 *
 * That matters here. The live run reported CatalogueVersion and EndpointVersion as CREATED, and
 * both lists already carried a custom column called Version holding real values. A create that
 * collides with an existing internal name does not normally succeed, so one of two things is
 * true and they need different remediations:
 *
 *   - nothing new was created, and `Version` is the original column, working, populated; or
 *   - something WAS created, under a name neither script looked for.
 *
 * This shows the whole list, so the answer is read rather than inferred.
 */
(async () => {
  const site = 'https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE';
  const LISTS = [
    { title: 'DGO_RoleCatalogue',    guid: 'f675598b-271d-4200-8d75-2597aad4057f' },
    { title: 'DGO_EndpointRegistry', guid: '08c6e1c4-f2b1-4810-933d-69b4327fb6af' },
  ];

  for (const l of LISTS) {
    const res = await fetch(
      `${site}/_api/web/lists(guid'${l.guid}')/fields`
      + '?$select=InternalName,Title,TypeAsString,FromBaseType,CanBeDeleted,Hidden,Required,Indexed&$top=500',
      { credentials: 'include', headers: { Accept: 'application/json;odata=nometadata' } });

    if (!res.ok) { console.error(`${l.title}: read failed ${res.status}`); continue; }

    const all = (await res.json()).value || [];
    /* Custom means: created on this list, and removable. A field inherited from the base type is
       SharePoint's, not the estate's, and is never a candidate for renaming or deletion. */
    const custom = all
      .filter((f) => f.FromBaseType !== true && f.CanBeDeleted !== false)
      .map((f) => ({
        internalName: f.InternalName,
        title: f.Title,
        type: f.TypeAsString,
        required: f.Required === true,
        indexed: f.Indexed === true,
        hidden: f.Hidden === true,
      }))
      .sort((a, b) => (a.internalName < b.internalName ? -1 : 1));

    console.group(`${l.title} — ${custom.length} custom column(s) of ${all.length} total`);
    console.table(custom);

    /* Anything whose name looks like SharePoint disambiguating a collision. That is the signature
       of a create that "succeeded" against a name already taken. */
    const suffixed = custom.filter((f) => /\d$|_x00/i.test(f.internalName));
    if (suffixed.length) {
      console.log('%cNames that look auto-disambiguated — a create that hit an existing name:', 'color:#b00;font-weight:bold');
      console.table(suffixed);
    }
    console.groupEnd();
  }

  console.log('%cSend this output back before any column is renamed, migrated or deleted.', 'font-weight:bold');
})();
