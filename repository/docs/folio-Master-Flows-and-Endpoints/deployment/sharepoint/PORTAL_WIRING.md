# Portal wiring — which flow touches which list, and what must not

**State today: 0 of 41 required operations in place, 25 boundary crossings.** The estate is
provisioned and the bridge is built; the flows in between are wired to a previous generation.
Run `npm run wiring` for the live register.

---

**Read [`PORTAL_CIRCLES.md`](./PORTAL_CIRCLES.md) first** if you want the loops end to end —
who starts each one, what closes it, and the one that does not close. This page is the
per-operation specification those loops are built from.

## The principle

The portal estate is a **trust boundary**, not a naming convention.

Every portal flow is invoked by an anonymous stranger with no session, from a public static
site that delivers its own trigger URLs to every visitor. `document-portal/config.example.js`
states the consequence plainly: *"Configure ONLY endpoints whose flows are built to be invoked
by an anonymous stranger."*

So the rule is a boundary, and it has three parts:

1. A portal flow may read and write **the twelve portal lists and nothing else.**
2. Exactly **one** crossing into the internal platform exists — `ECM_DOCS_INTAKE`. It is
   tenant-authenticated, read-only, and projects a fixed column set out of `Portal Registry`.
3. **No** portal flow touches a `DGO_*` governance list, in either direction.

`scripts/verify-portal-wiring.mjs` checks all three on every run, because "wired correctly" is
a claim that decays silently — nothing about a flow announces that someone repointed it.

---

## The wiring

Read out of the `01-09` design as the SPOT workbook resolves it, expressed against live list
GUIDs (correction SC-004), and checked against the definitions exported from the tenant. The
machine-readable form is [`portal-wiring.json`](./portal-wiring.json).

| Endpoint | Reads | Writes |
| --- | --- | --- |
| `SUBMISSION` | Rate Limits, Verification Proofs, Sequence Counters | Rate Limits, Verification Proofs (consume), Sequence Counters, **Registry** (create + reference), **Status Timeline**, **Upload Tickets** |
| `UPLOAD` | Rate Limits, **Upload Tickets** | Rate Limits, Upload Tickets (redeem), **Attachments** |
| `SUPPORT` | Rate Limits | Rate Limits, **Support Cases** |
| `VERIFY` | Rate Limits, **OTP Codes** | Rate Limits, OTP Codes (supersede + mint) |
| `VERIFY_CONFIRM` | Rate Limits, **OTP Codes** | Rate Limits, OTP Codes (consume), **Verification Proofs** |
| `STATUS` | Rate Limits, Verification Proofs, **Registry**, **Status Timeline** | Rate Limits, Verification Proofs (consume) |

One write leaves the portal estate by design: `UPLOAD` stores attachment **bytes** in the
`NITDA_Central_Registry` document library. A library holds files, a list holds metadata; that
is the split, and it is the only sanctioned exception.

### The bridge, and why it is already right

`ECM_DOCS_INTAKE` (the design's `09-portal-intake-feed`) reads `Portal Registry` and projects
22 columns for the internal platform. Every one of those 22 is a column the 2026-08-19
provisioning run created — `Subject`, `Category`, `CorrespondenceType`, `Channel`, `SenderName`,
`SenderPhone`, `SenderOrganisation`, `SenderOrganisationType`, `EventDate`, `Description`,
`AttachmentCount`, `SubmittedAtUtc`, `UpdatedAtUtc`, `AcknowledgedAtUtc`, `ClosedAtUtc`,
`StatusLabel`, `ActionRequired`, `VerifiedSubmission`, `LocalId` and the three that were already
live.

That settles a question the flow export had left open. The twelve lists are the **target**
estate, not a superseded one: the bridge was built against exactly these columns and was
returning nulls for twenty of its twenty-two fields until they existed. It is tenant-
authenticated and read-only, so the boundary holds across it.

---

## What is wired today, and what is not

`npm run wiring` reports it live. As of the 2026-08-19 export:

### None of the six endpoints writes the portal estate

`0/41` required operations. Not one deployed portal flow creates a `Portal Registry` item, a
`Portal Status Timeline` row, an upload ticket, an attachment record, a support case, a rate-limit
bucket or a verification proof. `Portal_UBMISSION_ECM_DOCS` creates a **file** in
`NITDA_Central_Registry` and stops there.

The consequence is concrete rather than theoretical: `ECM_DOCS_INTAKE` reads `Portal Registry`,
nothing writes it, so the internal platform's portal feed is empty by construction.

### 25 crossings, and one of them is the sharp one

| Crossing | Endpoints | Why it matters |
| --- | --- | --- |
| `OTP_Transactions` on NITDADGO-EAAACTIVITYTRACKING — create, read, update | `VERIFY`, `VERIFY_CONFIRM` | **An anonymous public endpoint writes into the internal operations site.** Sharing an OTP table between the public portal and internal sign-in means a public caller's traffic lands in the same list as staff authentication. `Portal OTP Codes` on GDDC exists and is provisioned precisely so these are separate. |
| `Global Tracking Queue` — read | `SUBMISSION`, `UPLOAD`, `SUPPORT`, `STATUS` | The internal task register, read by flows a stranger can invoke. |
| `NITDA_Central_Registry` — file write | `SUBMISSION`, `SUPPORT`, `STATUS` | Sanctioned for `UPLOAD` only. On the other three it is the submission being filed as a document instead of registered as a row. |

### Three provisioned lists — superseded, see the decision record

> This section is from an earlier state of the estate and is kept as history, not as current
> fact. All three have since been given writers by decision, not left for this page to flag:
> [D2](./DECISIONS.md#d2--two-of-the-three-unwired-lists-are-reserved-one-is-wired) wires
> `Portal Flow Telemetry` (one create in `Scope_Flow_Data_Capture`) and `Portal Outbox Receipts`
> (`VERIFY` and `SUPPORT`); [D13](./DECISIONS.md#d13--writeback-is-fully-provisioned--the-portal-audit-events-row-is-no-longer-proposed)
> gives `Portal Audit Events` its writer, `WRITEBACK`. None of the three is undecided any more.
> The current specification is `PORTAL_DATA_CONTRACT.md` and `portal-wiring.json`
> (`npm run wiring`); what is actually deployed to the tenant is a separate question this page's
> headline number (0 of 41, dated) does not answer either — see `npm run wiring` for that.

`Portal Audit Events`, `Portal Flow Telemetry` and `Portal Outbox Receipts` were provisioned with
no reader or writer anywhere — not in the deployed flows and not in the `01-09` design either.
Each needed a decision rather than an implementation: give it a writer, or drop it.

- **Audit Events** — the natural writer is an append in each portal flow at each decision point.
- **Flow Telemetry** — a terminating scope in each portal flow recording run id, outcome, duration.
- **Outbox Receipts** — `VERIFY` and `SUPPORT`, the two flows that send mail.

---

## Remediating, in the order that pays

1. **Split the OTP estate first.** Repoint `Portal_Verify` and `Portal_Verify_Confirm` at
   `Portal OTP Codes` (GDDC, `3f85213c-1fdc-4be0-8c0c-e28aa77fbe56`). This is the only change on
   this page that closes an exposure rather than completing a feature, and it touches two flows.
   `Web - OTP Generate` / `Web - OTP Verify` stay on `OTP_Transactions` — they are the internal
   sign-in flows and belong there. Splitting them is the point.
2. **Make `SUBMISSION` write the registry.** Create the `Portal Registry` item, mint the
   reference through `Portal Sequence Counters`, patch it back, append the first
   `Portal Status Timeline` row, and issue one `Portal Upload Tickets` row per declared
   attachment. This is what lights up `ECM_DOCS_INTAKE` and therefore the internal feed.
3. **Make `UPLOAD` redeem tickets.** Read and mark the ticket, write the `Portal Attachments`
   row alongside the existing file write.
4. **Make `STATUS` read the registry** rather than `Global Tracking Queue`.
5. **`SUPPORT` to `Portal Support Cases`.**
6. **Rate limiting on all six.** Every endpoint is public and every one currently has none.
7. **Decide the three unwired lists.**

After each step, `npm run wiring` moves and names what is still missing. The target is
`41/41 operations, 0 crossings`.

---

## Harmony with the rest of the architecture

| Component | Relationship | Held by |
| --- | --- | --- |
| `document-portal/` static site | Calls the six endpoints directly, no proxy. Contract in `document-portal/config.example.js` and its README. | `npm run test:verification` |
| Portal estate (12 lists, 96 columns) | Written only by portal flows; the public side of the boundary. | `npm run test:sharepoint` |
| `ECM_DOCS_INTAKE` | The one crossing. Tenant-authenticated, read-only, fixed projection. | `npm run wiring` |
| Internal operations estate | Reached from the portal **only** through the bridge. Never directly. | `npm run wiring` (boundary section) |
| `DGO_*` governance estate | Never reachable from the portal side, in either direction. | `npm run wiring` (boundary section) |
| Status vocabulary | `Portal Registry.Status` and `StatusLabel` carry the governed vocabulary both platforms publish. | `npm run test:statuses` |
| Contract keys → flows | 20 keys across 16 physical flows, each attributed to a deployed definition. | `npm run test:flowmap` |

The join key throughout is the minted reference: `Portal Registry.Title` holds it, and
`Portal Status Timeline.SubmissionRef`, `Portal Attachments.SubmissionRef` and
`Portal Upload Tickets.SubmissionRef` all point back to it. `ECM_DOCS_INTAKE` projects it three
ways — `Reference_ID`, `RefIDD`, `ReferenceId` — because the internal platform's normalisers
read it under all three aliases.
