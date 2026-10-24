# Module rationalisation execution baseline

This change establishes the canonical target registry without deleting or renaming current modules. It is deliberately migration-safe: existing routes and imports continue to operate while future changes are checked against one disposition and one target owner per module.

## Implemented in this increment

- Canonical capability groups and module dispositions in `config/module-rationalisation.config.js`.
- Complete coverage of all 31 files in `modules/`.
- One authoritative target path and owner per module.
- Explicit merge, split, move-out and retain/refine classifications.
- Canonical action-contract fields for subsequent command consolidation.
- Automated structural test in `tests/module-rationalisation.test.mjs`.
- A package script, `test:rationalisation`, for direct CI execution.

## Migration rule

No existing module is removed until route compatibility, permissions, audit history, behavioural parity and rollback have been proven. The registry is the control plane for staged migration, not a signal to perform a big-bang rewrite.

## Sequence

1. Shared API, command, event, validation and telemetry services.
2. Reports plus statistics, then endpoint console plus diagnostics.
3. Single plus bulk assignment behind one assignment service.
4. Email and scan adapters behind one correspondence intake envelope.
5. Shared activity/SLA timeline.
6. Administration suite decomposition.
7. Legacy-route retirement after two stable releases and measured zero-use.
