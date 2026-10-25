# Closing state — both platforms

Written 2026-08-27, at the close of the session that built the Correspondence Gateway
packages. It was the conclusive statement of what exists, what is deployable, and what
must happen before either platform faces a citizen — on that date.

> **Superseded on current state by
> [`../../../deployment/PRODUCTION_READINESS_REGISTER.json`](../../../deployment/PRODUCTION_READINESS_REGISTER.json)**, which
> is verified on every run by `npm run test:readiness`. Of the three blockers below, one
> has since closed and one carried a figure that does not reproduce; both are corrected
> inline. The third stands. The rest is the record of that session and is left as written.

---

## What was delivered

Two static, dependency-free platforms, both built and both verified byte-for-byte
against their own manifests.

| | Internal platform | Document portal |
| --- | --- | --- |
| Package | `dist/dgo-internal-platform/` | `dist/dgo-document-portal/` |
| Files | 169 | 46 |
| Size | 1.7 MB | 0.9 MB |
| Endpoints provisioned | 17 of 18 | 5 of 7 |
| Flow routes | 39 | 9 |
| Manifest check | every file matches | every file matches |

Both are also serialised as single transferable documents — `dist/*.bundle.json` — with
every byte of every file embedded and each file's SHA-256 re-derived on emit.

**Neither package nor bundle may be committed or emailed.** They embed the signed trigger
URLs in full, which is what makes them deployable and what makes them credentials.
`dist/` is git-ignored for that reason.

## Endpoint provisioning gaps

Three endpoints are not provisioned in the built packages because no URL is configured
for them locally:

| Endpoint | Platform | Status |
| --- | --- | --- |
| `UPLOAD` | portal | flow exists and answers; URL not in local config |
| `WRITEBACK` | portal | flow exists and answers; URL not in local config |
| `SCAN_INTAKE` | internal | raw-bytes deposit; carries no contract entry by design |

`UPLOAD` and `WRITEBACK` close by running `npm run setup`, pasting the two URLs, and
rebuilding. Until then the portal ships without attachment upload and without citizen
write-back, and both features report themselves unconfigured rather than failing.

## The Correspondence Gateway

Seven flows, all running clean end to end — `flow_outcome: Succeeded`, zero failed
actions — evidenced by twelve run records committed under
[`evidence/2026-08-27-endpoint-runs/`](../../evidence/2026-08-27-endpoint-runs/).

Two carry direct proof the reply reached a live caller: `CG_Support_Endpoint` answered a
browser CORS call with 400 and a 90-byte body in 25 ms; `CG_Verification_Endpoint`
answered 200 with a 57-byte body.

The 400, 404 and 401 results are correct rejections of probe payloads — validation
failure, no matching record, missing authorisation. **No successful business transaction
is on the record.** Every green result is a guard working, not a document travelling.

## The two platform copies

`modules/` and `index.html` are byte-identical between `dgoeaa/INTERNAL_PLATFORM` and
this repository. Three files in `core/` were not, and `INTERNAL_PLATFORM` held the older
side of all three: `invokeObsidianAction` did no envelope unwrapping there, so a correct
one-time code was always refused and a failed send always reported as sent. Brought
forward 2026-08-27 on `claude/sharepoint-lists-gap-vmdvma`.

Treat this repository as authoritative for `core/`.

---

## Blocking — nothing reaches a citizen until these close

**1. Fifty-five live trigger tokens are in the repository.** *(Was "fifty-six, 195
occurrences". Re-measured 2026-09-02 by three independent methods — `npm run rotation`,
`npm run commission` and a raw `git ls-files` scan — which agree on **55 distinct
signatures in 193 occurrences across 28 files**. Neither 56 nor 195 is reproducible
against this tree; see ITEM-22 `evidenceConflict` in the register. The action is
unchanged.)*
Twenty-eight tracked documents under `docs/reference/foundational/` carry signed trigger
URLs in full — across 39 workflows — and they are in git history, so
deleting the files does not undo the exposure. Separately, four flows publish their own
token in the diagnostic record they email on every run. Rotation is the only remedy. See
open item 22 and [`remediation/29-redact-igw-headers.md`](./remediation/29-redact-igw-headers.md);
apply the redaction fix **before** rotating, or each new token leaks on its first run.

**2. ~~Three hot-path lists are queried on an unindexed `Title`.~~ Closed 2026-08-31.**
`Portal Rate Limits` is filtered on every request to every endpoint and grows one row per
source per endpoint. SharePoint's 5,000-item view threshold makes an unindexed equality
filter **fail**, not slow — so the first list to cross it stops every endpoint at once.

*The index pass ran on 2026-08-31 against all **five** declared targets, not three:
`evidence/2026-08-31-provisioning-run.json` records "Indexes set: 3 · Already indexed: 2 ·
Failed: 0", and a verify pass re-read all five and found every one indexed. The three
`Title` indexes named here are confirmed against the tenant. What remains under items 23,
31 and 33 is not provisioning but live-traffic observation — one assignment and one flag
write against a known reference returning 200 — neither of which has been exercised. The
register carries this as ITEM-23, `APPLIED_UNVERIFIED`.*

**3. No successful citizen journey has ever completed.**
Bind the portal (`document-portal/config.local.js`, seven URLs), then submit → verify →
reference → upload → track. Until that is on the record, "the endpoints work" means the
guards work.

## Also open before public launch

| | Item | Owner |
| --- | --- | --- |
| 7 | Seven third-party API keys, live and unrotated — redaction is not rotation | operator |
| 8 | CORS is `*`, a testing posture only | operator |
| 12 | Attachments: no evidence a submission produces a `Portal Attachments` row | operator |
| 18 | Upload digest not verified — no document may claim SHA-256 is checked | author |
| 24 | Sending mailbox for portal and OTP mail unchosen across three actions | operator |
| 25 | 15 of 19 `DYNAMIC_ACTIONS` operations answer `501`, honestly, pending column evidence | operator + author |

Five superseded flows remain enabled alongside the CG set: `Portal_ECM_DOCS_STATUS`,
`Portal_UBMISSION_ECM_DOCS`, `Portal_UPLOAD_ECM_DOCS`, `Portal_Upload_HTTP`,
`Portal_Verify_Confirm`. Two live endpoints per contract key is an unresolved ambiguity,
not a fallback.

---

## Assurance status

Held: 47 offline test suites, all passing, covering credential scanning, design tokens,
breakpoints, status vocabulary, field specifications, wiring, response contracts,
envelope lifting, packaging and portability.

Not held, and not claimed anywhere: privacy impact assessment, security risk assessment
and penetration test, accessibility conformance test, records-schedule approval,
operational acceptance, load test, disaster-recovery rehearsal, independent assurance.

Nothing in either platform, or in the programme briefing, asserts an outcome these would
be needed to support.
