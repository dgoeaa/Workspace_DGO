# Governance flow packages

One package: `DGO_FLOW_TRUTH_PERSISTENCE`, the corrected replacement for the
`Scope_SharePoint_Flow_Truth_Persistence` clipboard scope submitted for review. The review is
[`docs/folio-Master-Flows-and-Endpoints/audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md`](../../audits/FLOW_TRUTH_PERSISTENCE_REVIEW.md).

## Why it is here and not beside the other thirty-four

`docs/folio-Master-Flows-and-Endpoints/surfaces/portal/designer-paste/` and
`docs/folio-Master-Flows-and-Endpoints/surfaces/internal/designer-paste/` are gated in CI by
`verify-designer-paste.mjs --strict`, and one of its checks is that every SharePoint action
targets a list the tenant capture actually holds. The seven `DGO_HTTPFlow*` governance lists are
**defined and not built** — `tests/http-flow-registry.test.mjs` says so by name and goes red the
day a capture contains them. Committing this package into either gated directory would mean
either turning CI red or weakening the check that keeps the other thirty-four honest.

It has its own gate instead: `npm run test:flowtruth`.

## Moving it into the estate

1. Provision the two lists and the library on https://nitdanigeria.sharepoint.com/sites/DGO_ECM_GOVERNANCE, from
   `docs/folio-Master-Flows-and-Endpoints/registers/http-flow-registry-spec.json` — including `RegistryKey` and
   `ExecutionKey` as indexed **and** unique, which is what makes this scope idempotent.
2. Record their GUIDs in `../list-bindings.json`.
3. `npm run flowtruth` — the package re-emits targeting by GUID and its companion flips to
   `BOUND`.
4. Move the four files into `docs/folio-Master-Flows-and-Endpoints/surfaces/internal/designer-paste/` and run
   `npm run designerpaste`; the estate gate then covers it and this directory can go.
