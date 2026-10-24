# Security

**Status:** Specification. Binding on anyone contributing to this repository.
**Document ID** `DOC-0003` · **Written** 15 September 2026

This repository is **private and must stay private.** Git history is not revocable, and this
history contains credentials that were live when committed. See *Why this repository is
private* below.

---

## Reporting a vulnerability

Report privately. Do not open a public issue, and do not include a working credential in the
report.

1. Contact the repository owner — NITDA, Office of the Director-General, Digital Operations —
   through the internal channel recorded with the repository administrators.
2. State what you found, where, and what an attacker could do with it. A path and a
   reproduction is enough; exploit code is not needed and not wanted.
3. If the finding involves a live Power Automate trigger URL, say so in the first line. Those
   are bearer credentials and the response is time-critical: the trigger has to be re-issued,
   not merely removed from a file.

Expect an acknowledgement and a named owner for the finding. If the finding is confirmed, it
is tracked to closure like any other blocker, with the evidence kept.

## The one rule that has already been broken once

**A live signature is never committed.** A Power Automate trigger URL carries a SAS
signature; anyone holding the URL can invoke the flow. Committing one publishes it to
everybody who can read the repository, and to everybody who ever could.

**Deleting the file revokes nothing.** The only remedy is to re-issue the trigger in Power
Automate, which changes the signature and invalidates the published one.

This rule exists because it was broken: 43 signed trigger URLs across 28 tracked files, all
since rotated. The detail — what was exposed, what it did and did not establish, and why the
reference corpus that carries them is retained deliberately — is in the security section of
[`README.md`](README.md).

### What enforces it

| Check | Command | What it does |
|---|---|---|
| Secret ratchet | `npm run test:secrets` | Fails on a **new** file carrying a SAS signature. Known carriers are listed in `tests/secrets-baseline.txt`, which may only shrink |
| Exposure report | `npm run test:exposure` | Reports the standing exposure rather than asserting it is zero |
| Rotation register | `npm run rotation` | Prints the rotation worklist and what it covered |

`tests/secrets-baseline.txt` says it in its own words: *"Do not add to this list to make a
build pass. A new entry means a credential was committed and then accepted instead of
removed."*

## Authentication posture — read this before assuming

The auth layer is **complete on the client side and switched off.** While inert, caller
identity travels as a client-asserted `userEmail` from `localStorage`, and RBAC is advisory
only: editing one storage key escalates a viewer to `systemAdmin`.

This is a deliberate pilot posture, not a defect to report — but it means **the client
enforces nothing.** Every flow behind every endpoint must authenticate and authorise its own
callers. Activation is a configuration event with server-side obligations, specified in
[`docs/architecture/AUTHENTICATION_CONTRACT.md`](docs/architecture/AUTHENTICATION_CONTRACT.md).

A finding that the client can be bypassed is expected and already recorded. A finding that a
*flow* accepts an unauthenticated or unauthorised caller is a real vulnerability — report it.

## Scope

**In scope:** the two delivered platforms and the three specialised ones; the flow contracts;
the SharePoint provisioning specification; anything in this repository that would let a
caller reach data they should not.

**Out of scope for this repository, though still worth reporting to NITDA:** the tenant's own
configuration, the identity provider, and the Power Platform environment. Those are not
governed here.

## Why this repository is private

Two reasons, and only one of them is closed.

1. **Rotation is done; history is not revocable.** The 43 signatures were re-issued and
   `docs/folio-Master-Flows-and-Endpoints/registers/endpoint-register.json` is a post-rotation export. But every old signature
   is still in git history, where deleting a file reaches nothing. Treat them as burned, not
   as harmless.
2. **Authentication is inert.** Until the server-side obligations are discharged, the
   repository describes a system whose client-side controls are advisory.

Making this repository public requires both a decision and a history rewrite. Neither has
happened.
