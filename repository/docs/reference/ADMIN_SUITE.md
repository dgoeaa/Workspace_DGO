# The Admin Suite

`#/admin-suite` · `modules/admin-suite.js` · restricted to `systemAdmin` and `userAdmin`

One interface for the endpoint estate, the flow catalogue, live checks, commissioning, the
capsule registry, people, platform control and the audit trail.

## Why it exists

Administration of this estate was spread across five in-platform screens and a drawer of
standalone HTML consoles, each built for one commissioning problem and each carrying a capability
the others lacked:

| Tool | What it was right about | What it could not see |
|---|---|---|
| Endpoint Console (`modules/endpoint-console.js`) | A key can be present, HTTPS, correctly signed and address the wrong workflow | What the flow behind it will *accept* |
| Flow Operations Workbench | Every trigger schema in the tenant, composed and validated before sending | Which contract key calls which flow |
| DGO Configuration Launchpad | A non-destructive health test that a write endpoint survives | Any register to test the results against |
| Live Operations Execution Console | The obligations no script can settle, dependency-gated with evidence | Lived in a file emailed between the people settling them |
| Guided Desk Walkthrough | Stop conditions — when to *not* continue | Same |
| Endpoint Provisioning Documentation | The estate as data: schemas, responses, mail actions, connectors | Static; nothing acted on it |
| flow-url-capsule registry | Version history, rollback, enable/disable, an audit row per invocation | Administered only from a shell on the server |

Each was right about something. None could see the others' facts, so the question an
administrator actually asks — *is this estate fit to go live, and if not, what do I do about it* —
could not be answered from any one of them, or from all of them together, because the joins were
in somebody's head.

## What the merge actually joined

- **A contract key opens the request schema of the workflow the register says it calls.** The
  estate table's *Shape* column is that join. Before, the key and the schema were in two tools
  that did not know about each other.
- **A probe result attaches to the endpoint it probed** and to the commissioning action that
  required it.
- **The commissioning register lives in the platform's audited state**, not in a spreadsheet.
  Every change is recorded against the person who made it.
- **Every control is drawn from `core/admin-actions.js`**, which states its blast radius and the
  permission it needs. An action that exists is listed; an action that is listed exists. There is
  only one record, so the two cannot drift.

## The sections

| Section | What it answers |
|---|---|
| **Overview** | What needs attention now, across every domain, worst first — each row naming the section that fixes it. Plus the release gate. |
| **Endpoints** | All 25 contract keys against the tenant register: configured, signed, addressing the right workflow. Estate findings. Address overrides (this device only). |
| **Live checks** | The three probes — health contract, identity handshake, read-only call — and what each result is *entitled* to claim. |
| **Flow shapes** | All 77 exported workflows: request schemas, field records, actions, responses, mail actions, connectors. Compose, validate, fill in a conforming example, copy the call as `curl`, send under a typed confirmation, and export the five provisioning tables as CSV. |
| **Commissioning** | The 14-action runbook, 21 parameters, one acceptance record per contract key, residual risk, cutover and hypercare, the release gate and the structural audit. Export, **restore** and print the record. |
| **Capsule registry** | Alias lifecycle against a deployed `flowcapsule.py`: list, verify, enable, disable, roll back, register or rotate. |
| **People & access** | Who can sign in, what each role actually grants, and where an account is recorded without the detail an audit would need. |
| **Platform control** | Registry data, cache, the queued-write queue, receipts, device state. |
| **Action catalogue** | Every administrative action with its reach, the permission it needs, and whether you may run it. |
| **Audit & evidence** | The audit trail, and the evidence bundle that carries everything above in one artefact. |

Deep link to one section with `/?section=<id>#/admin-suite`. The section rides on the page query
string and not on the hash, because the hash *is* the route.

## The five rules it holds itself to

1. **It never renders a signature it resolved.** Every address the suite reads — from the
   registry, from a probe result, from an export — goes through a redactor before it reaches the
   DOM. `tests/admin-suite.spec.js` asserts that against the rendered page, on every section.
   One exception, and it is not a leak: the override field echoes what an operator typed into it
   on this device, because a field you cannot read back is a field you cannot correct.

2. **It does not invoke a write endpoint by accident.** The read probe refuses a write contract
   by name rather than skipping it quietly. Sending a composed request to a real flow is a
   separate, typed confirmation naming exactly what that flow does — including how many mail
   actions it has.

3. **It does not pretend a device is an estate.** Every control that changes only this browser
   says so where the control is. An endpoint override is stored in this browser's state, for this
   device. The estate is configured by `npm run setup -- --values <file> --force` and shipped by
   `npm run package`.

4. **Irreversible actions cannot be confirmed by clicking.** They require typing a word. A
   confirmation dialog with a Continue button is dismissed by muscle memory.

5. **Every action is audited before and after, including on failure.** An administrative action
   that succeeded and left no trace is indistinguishable from one that never happened.

## Blast radius

The `Reach` column in the action catalogue, and the field that matters most:

| Reach | Meaning |
|---|---|
| `reads only` | Changes nothing. Safe to run while wondering whether to. |
| `this device only` | This browser, this device, nobody else. |
| `reaches the tenant` | It leaves this building. |
| `affects everyone here` | Changes what every user of this deployment sees. |
| `cannot be undone` | No undo and no copy. Typed confirmation, always. |

## What backs it

| File | Role |
|---|---|
| `core/admin-actions.js` | The action catalogue, permission gating and audited dispatch |
| `core/flow-shapes.js` | Field records, the draft-07 validator, alignment reports |
| `core/endpoint-formation.js` | URL formation rules (the capsule registry's, moved to where the URL is pasted) |
| `core/health-contract.js` | The three probes and what each result may claim |
| `core/ops-runbook.js` | Dependency gating, evidence rules, the computed release gate, the structural audit, export **and import** |
| `core/capsule-client.js` | The registry admin client — no `invoke`, deliberately |
| `config/flow-shapes.data.js` | **Generated** by `npm run flowshapes` from the tenant's own exports |
| `config/ops-runbook.config.js` | The commissioning runbook, grounded in `scripts/commission-check.mjs` |
| `tools/flow-capsule/` | The capsule service the Capsule registry section administers — server, CLI, Termux installer, 7 tests |

Regenerate the catalogue after a flow re-export:

```bash
npm run flowshapes          # rebuild config/flow-shapes.data.js
npm run test:flowshapes     # fail if it has drifted (this runs in CI)
npm run test:adminsuite     # the analysis suite — 84 assertions
npm run test:toolcoverage   # every source-tool capability still has a home — 96 rows
npm run test:capsule        # the capsule service's own 7 tests
```

## Restoring a commissioning record

An export you cannot import is not a record — it cannot move to the machine the commissioning is
happening on, cannot be restored after a device is cleared, and cannot be handed over. Import is
on the Release gate tab, and it validates before it accepts:

- the schema must be `dgo-ops-runbook/v1` and the definition id must match, or nothing is read;
- **a locked parameter in the file is discarded** — those are facts about this repository, and a
  file is exactly how one would be replaced with a plausible wrong value;
- an action or acceptance id this runbook does not declare is dropped and named;
- a status outside the vocabulary is reset to Blocked rather than stored;
- a record that **contradicts itself** — resolved with no evidence, progressed out of order — is
  imported with a warning naming the contradiction. A record that is merely **incomplete** is
  not warned about at all: that is the normal state of a mid-commissioning export.

The report is shown before anything is written, and the restore is typed-confirmed, because it
replaces the whole record.

## The five tables

`Download the five tables as CSV` on the Flow shapes section emits flow summary, request fields,
response actions, mail actions and endpoint keys. The column contracts are the provisioning
workbook's, so last quarter's spreadsheet still diffs against them, but the rows come from the
live catalogue rather than being frozen at export time.

Each carries a UTF-8 BOM — without one Excel reads the file as the local codepage and turns every
en-dash into mojibake — and **none carries an endpoint URL or a signature**. The endpoint-keys
table reports whether a key is configured, never what it is configured to; a spreadsheet is the
artefact most likely to be mailed.

## Its relationship to the standalone tools

`tools/flow-workbench/` and `tools/admin-console.html` are the *offline* half of the same
merge, and they are not superseded by this. They exist because the platform sometimes cannot be
reached at all — a laptop with no deployment on it, a phone in a data centre over Termux, a
commissioning session before anything has been installed. They run from `file://`, carry a
loopback relay for the CORS wall that stops a browser reading a Power Automate response, and
need nothing from this repository at runtime.

What they cannot do is the reason this section exists in the platform too:

| | Standalone tools | Admin Suite |
|---|---|---|
| Runs with no deployment | ✅ | ✕ |
| Runs from a phone over Termux | ✅ | ✕ |
| Reads a response through the CORS wall | ✅ via the loopback relay | ✕ direct calls only |
| Knows which contract key calls which flow | ✕ | ✅ joined to the tenant register |
| Gated by role, and audited | ✕ | ✅ every action, before and after |
| Holds the commissioning register | ✕ | ✅ in the platform's own state |
| Sees the estate and the shapes together | ✕ | ✅ that join is the point |

Both read the same authority — `docs/folio-Master-Flows-and-Endpoints/contracts/deployed/` — so neither can
describe a request shape the other would dispute. This suite catalogues all 69 exports there;
the standalone workbench filters to the 50 it was built around.

## What it will not do

It is an administration console, not a second place to do the work. Creating a user, assigning a
task, approving a response and dispatching correspondence stay in the workspaces that own them;
the suite links to them. `config/module-boundaries.config.js` records that as
`mustNotOwn: ['business-workflow-action', …]` and `tests/admin-suite.test.mjs` asserts it.

The capsule client exposes health, list, versions, verify, enable, disable, rollback and
register. `POST /invoke/{alias}` is deliberately absent: a console that can invoke arbitrary
aliases with an operator's token is a console that can dispatch correspondence by accident.

## What a green suite does not prove

The structural audit checks the commissioning register against *itself*. It does not inspect the
tenant, and a clean result says only that what has been recorded is internally consistent. A
`healthy` probe says a flow validated its own configuration — not that the caller was authorised,
which under the inert authentication posture nothing in the request path checks. And a run in
which nothing reached Power Automate measured the network, not the estate; the suite says so
rather than reporting an estate-wide failure.
