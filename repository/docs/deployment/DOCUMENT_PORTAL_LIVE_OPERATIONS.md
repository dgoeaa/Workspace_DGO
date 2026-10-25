# Document portal — live operations, as the baseline actually stands

**Living document — not an audit.** [`docs/audits/OPERATIONAL_READINESS_AUDIT.md`](../governance/RETIRED_RECORDS.md)
is a dated, unedited record of what was true on the commit it examined; this document is
the opposite kind of thing on purpose. It describes what "live" means for
`document-portal/` **right now**, is meant to be re-verified against whatever commit you're
reading it on, and should be corrected in place rather than superseded when the baseline
moves. If this document and a command's actual output disagree, the command is right —
that's true of every generated-documentation claim in this repository, and this one is no
exception.

Commentary below was checked against commit `0d7826e` (2026-08-09) by running the commands
it cites, not by reading prior write-ups about them. Re-run them yourself before relying on
a number here.

---

## 1 · What "live" means for this portal specifically

`document-portal/` is a static site with **no server component of its own**. There is no
proxy, worker or broker between the browser and Power Automate — every configured endpoint
is called directly from client JavaScript (`document-portal/js/data.js` →
`PF.CONFIG.endpoints`, read by `document-portal/js/core.js`). "Live operations" therefore
means exactly two things, and only two:

1. A real, signed Power Automate trigger URL is present in `document-portal/config.local.js`
   for a given endpoint key, and
2. The flow behind that URL is built to be safe when called by an anonymous stranger on the
   open internet, because nothing in front of it can be — the browser sends every visitor's
   request straight to the tenant.

There is no third state where the portal is "partly live" through some intermediary. Each of
the six endpoint keys is independently either wired (a URL is configured) or not (it falls
back to demo mode for that feature only, and `SUBMISSION` empty puts the whole portal in
demo mode: everything stays local, nothing transmits).

## 2 · Current baseline, measured

```
$ npm run commission
```

Run against this commit with a fresh `npm install` and no `config.local.js` of any kind
(the state a clean checkout is actually in):

| | Result |
|---|---|
| Posture inferred | **pilot** |
| Internal runtime | not configured — `config/config.local.js` absent, demo mode |
| **Public portal** | **not configured — `document-portal/config.local.js` absent, demo mode** |
| Signed trigger URLs committed to the repo | **55, across 28 tracked files** (reference corpus, by explicit decision D5) |
| Secret ratchet on the application tree | passes |
| Module graph | passes |

In plain terms: **as checked out, the document portal transmits nothing.** It boots, every
page renders, the eight correspondence types and the FAQ display, and a visitor can walk the
entire submission wizard — but `SUBMISSION` resolves to `''`, so nothing leaves the browser.
That is the intended, safe failure state for a public channel with no endpoints configured,
not a defect.

Nothing about this baseline has changed since the operational readiness audit measured the
same 55-signature, 28-file figure on 6–7 August — the numbers in that audit and the numbers
above agree, which is itself worth recording since audit prose is not re-verified after the
fact.

## 3 · The six endpoints — what "live" looks like for each, today

| Key | Package in this repo (identification release 42) | What's live-op ready client-side | What's still open |
|---|---|---|---|
| `SUBMISSION` | Yes — [`SUBMISSION__CG_Submission_Endpoint__de9ef13b.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/SUBMISSION__CG_Submission_Endpoint__de9ef13b.paste.json), in the tenant | Full four-step wizard, attachment declaration, draft autosave, confirm-before-send | The flow must mint the `NITDA-YYYY-<sequence>` reference itself (unpadded, monotonic), rate-limit by source, and issue one single-use upload ticket per attachment — none of that can happen client-side |
| `UPLOAD` | Yes — [`UPLOAD__CG_Upload_Endpoint__df82e331.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/UPLOAD__CG_Upload_Endpoint__df82e331.paste.json), in the tenant | Raw-bytes PUT with the ticket in `X-Upload-Ticket`, no base64/4 MB ceiling | The flow must redeem the ticket exactly once and verify the received bytes against the declared size and SHA-256 |
| `SUPPORT` | Yes — [`SUPPORT__CG_Portal_Support_Endpoint__4873c936.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/SUPPORT__CG_Portal_Support_Endpoint__4873c936.paste.json), in the tenant | Helpdesk case form, preview-and-confirm | Validation and rate-limiting are the flow's job; case references never enter the registry |
| `VERIFY` | Yes — [`VERIFY__CG_Portal_Verification_Endpoint__ba47f79b.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/VERIFY__CG_Portal_Verification_Endpoint__ba47f79b.paste.json), in the tenant | Requests a one-time code | Flow must rate-limit per address/source and report `sent:false` honestly on mail failure |
| `VERIFY_CONFIRM` | Yes — [`VERIFY_CONFIRM__CG_Portal_Verification_Confirmation_Endpoint__f96e3448.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/VERIFY_CONFIRM__CG_Portal_Verification_Confirmation_Endpoint__f96e3448.paste.json), in the tenant | Submits the code, holds the returned proof | Flow must single-use/expire the code and cap attempts; the comparison is not constant-time (SC-003) |
| `STATUS` | Yes — [`STATUS__CG_Portal_Status_Check_Endpoint__60042a2e.paste.json`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/STATUS__CG_Portal_Status_Check_Endpoint__60042a2e.paste.json), in the tenant | `PF.intake.status()` sends `{referenceId, verification}` once a proof exists, `{referenceId, email}` otherwise — the email leaves the request body the instant a proof enters it | **Flow-side proof enforcement is the whole remaining gap.** Until the `STATUS` flow answers `403 {"error":"verification_required"}` and resolves the caller's address from the proof rather than trusting the request body, possession of a reference and its (not-very-secret) email is what authorises reading the record back |

All six are packaged in identification release 42,
[`docs/folio-Master-Flows-and-Endpoints/packages/identification-phase3/`](../folio-Master-Flows-and-Endpoints/packages/identification-phase3/README.md), and the tenant runs them (2026-10-20). The early design files once kept in
`packages/` were retired on 2026-10-21. That closes
the "no flow exists to import" gap the 6 August audit recorded for `UPLOAD`. **Having a
template is not the same as having a deployed, rotated, live trigger URL.** As of this
baseline, `document-portal/config.local.js` doesn't exist, so none of the six is actually
wired to anything; importing and configuring is still a manual step per
**Part 2 of [`RUNBOOK.md`](./RUNBOOK.md)**, which carries what `MINIMAL-PILOT.md` §3d and its
"What you skipped" section said before that document was retired on 2026-09-24.

## 4 · What actually happens at each level of wiring

| `document-portal/config.local.js` state | Live behaviour |
|---|---|
| Absent (current baseline) | Full demo mode. Every page works; nothing transmits; `PF.store` is the only source of truth |
| `SUBMISSION` set, rest empty | Real submissions reach the registry with a real reference. Tracking, verification and the helpdesk stay device-local — a citizen who returns on another device or clears storage cannot look up what they submitted |
| `SUBMISSION` + `UPLOAD` set | The minimal pilot's public half: submission and file upload work end to end. This is the six-endpoint pilot Part 2 of the runbook builds toward, minus tracking/verify/support |
| All six set | Full portal behaviour, including the `STATUS` flow's own decision on whether to demand proof of ownership before answering a lookup |

Every endpoint left empty degrades independently — it disables only the feature it serves
and reports itself as unconfigured, rather than the portal failing as a whole. That
degrade-per-key behaviour is itself part of "live operations": a partially wired portal is a
supported, intentional state, not a broken one.

## 5 · The exposure model while live

Because there is no intermediary, going live on any of the six keys means that key's signed
trigger URL is delivered to **every visitor's browser** and is readable by anyone who fetches
`config.local.js` as a static asset. Two consequences that don't change no matter how minimal
the deployment:

- **Each flow is the only place any control exists.** Whatever fronts the interface — a CDN,
  a login page, a reverse proxy — never sees a flow call, so it cannot help. Input
  validation, rate limiting, reference minting and upload verification all have to live
  inside the Power Automate flow itself.
- **Rotation is the only revocation mechanism.** `npm run commission` refuses to let a pilot
  or enforced build wire an endpoint to a signature that's still published anywhere in this
  repository — the 55/28 figure in §2 above — so a signature that was ever committed here
  cannot reach a live deployment without being regenerated first.

## 6 · What this document is not

It is not a runbook (`RUNBOOK.md` is), not a frozen audit
(`docs/audits/OPERATIONAL_READINESS_AUDIT.md` §3 "Platform 2" is, as of 6 August), and not a
description of the API contract each flow must satisfy (`document-portal/README.md` has the
full request/response table). It exists to answer one narrow question — *if I stood this
portal up exactly as the repository sits today, what would actually happen* — and should be
edited in place, not left to drift, whenever that answer changes.
