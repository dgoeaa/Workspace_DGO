// The names people read. One place, so a rename is one edit.
//
// These are DISPLAY names only. Everything a machine keys on keeps its `dgo` spelling: the
// `--dgo-*` design tokens, the <dgo-shell> element, window.DGO_CONFIG, the state storage key
// `dgo.r11.viewport.runtime.state`, the platform ids in scripts/platforms.config.mjs, and every
// Power Automate flow and SharePoint list name in the tenant. Renaming those would break saved
// state on every device and the 25 wired contracts, and would change nothing a person sees.
//
// "Folio" is the registry's own word: a file is made of folios, and officers minute on them.
// The Document Portal keeps a plain descriptive name under the agency brand, because the public
// knows NITDA and does not need a product name to send it a letter. It deploys standalone, so
// document-portal/ carries its own copy of that name rather than importing this file.
//
// See docs/reference/PLATFORM_NAMING.md for the decision and the names these replaced.

export const Brand = Object.freeze({
  agency: 'NITDA',
  estate: 'NITDA Folio',
  short: 'Folio',
  platforms: Object.freeze({
    runtime: 'Folio Workspace',
    portal: 'NITDA Document Portal',
    console: 'Folio Estate Console',
    workbench: 'Folio Flow Workbench',
    capsule: 'Folio Vault',
    mailer: 'DGO Correspondence Mailer',
    centre: 'Folio Central Administration Centre',
  }),
});
