# Deployment — NITDA Email Template Library 2.1.0

> **Superseded and read-only (2026-10-21, finding F7 of the e-mail template package).** This library is not wired to
> any send. Every message now comes from the e-mail catalogue ([`email-catalogue/`](../../../email-catalogue/README.md))
> or the e-mail template package ([`email-templates/`](../../../email-templates/README.md)). Its two intents that had no
> catalogue template now do: the internal support request (TR-133) is `WS-Support-Request`, and the acknowledgement
> clock overdue notice (TR-143) is `PT-Ack-Overdue`. Do not paste from `deploy/`; do not edit these files.

Twenty templates covering every notification event of the two platforms in
`ECM_OPS_CLOSURE`: the **NITDA Document Portal** (external, citizen-facing) and
**DGO Digital Ops** (internal, staff-facing; the sub-brand beside NITDA; products are named Folio). Built from one master shell on the NITDA
Design System tokens carried in the repository.

```
deploy/    20 Power Automate-ready files  ← paste these into Send an email (V2)
preview/   20 rendered samples, same markup with sample values substituted
build/     registry.json, tokens.json, generator sources
assets/    endorsed NITDA lockups (host these; reference by Compose_Org_Logo_Url)
```

Open **NITDA Email Template Library.dc.html** to browse the set, switch between the
rendered sample and the flow-ready source, and read each template's subject line,
trigger and token contract.

## What changed from the previous library

| Defect in the previous candidate set | Resolution |
|---|---|
| Off-brand green `#008751` throughout | Every template on brand Deep Green `#05583B` and Smart Green `#17B255` (PANTONE 7484C / 354C, per the design system in the platform folders) |
| Logo hot-linked from a third-party CloudFront bucket belonging to an unrelated tenant | Logo referenced through `Compose_Org_Logo_Url`, defaulting to an Agency-hosted path; the endorsed lockups are in `assets/` |
| Nine near-duplicate visual directions (dashboard card / minimal / document / four "design options") | One master shell. Templates differ by content structure, not by chrome — a recipient seeing three of them sees one Agency |
| 38 candidate templates, 22 exact-duplicate retirements, none approved | 20 canonical templates, one per real event, each mapped to the platform module that fires it (see `PLATFORM_MAPPING.md`) |
| Raw SharePoint bindings (`outputs('Update_item')?['body/TrackingID']`) in the email layer | One governed `Compose_*` namespace with a fallback on every token — the email layer never reads a connector shape directly |
| Six correspondence variants with no email template at all | `IP-11` carries all six configured variants through `Compose_Correspondence_Type` and `Compose_Body_Html` |
| No template for email verification, overdue acknowledgement, approvals or dispatch | `DP-02`, `DP-08`, `IP-08`, `IP-09` |
| Free-form status words per template | Governed vocabulary only on anything leaving the Agency |

## Going live — per template

1. **Host the lockups.** Copy `assets/nitda-lockup-white.png` (masthead, on green) and
   `assets/nitda-lockup.png` (on white) to an Agency-controlled HTTPS path. Set
   `Compose_Org_Logo_Url` to the white lockup. Images are blocked by default in most
   corporate inboxes — every template is legible with images off, and the lockup carries
   the full agency name as `alt` text.
2. **Add the identity Composes once** per flow, before the send:
   `Compose_Org_Logo_Url`, `Compose_Org_Office_Line`, `Compose_Org_Address_Line`,
   `Compose_Org_Portal_Url`, `Compose_Org_Support_Url`.
3. **Add the event Composes** listed for that template in the library's Flow contract
   panel, or in `TOKEN_CONTRACT.md`.
4. **Initialise the row variables** the template uses (`varTaskRowsHTML` and friends) to
   an empty string, then append one `<tr>` per item using the canonical row expression in
   `TOKEN_CONTRACT.md` §3.
5. **Paste `deploy/<id>.html` whole** into *Send an email (V2)* → **Body** in code view.
   Do not edit it in the rich-text editor: it strips the MSO conditional comments and the
   button fallbacks with them.
6. **Set the subject** to the expression printed for that template.
7. **Reply-to.** Portal templates are unmonitored one-way notices — set reply-to to the
   helpdesk. `DP-07` is the exception: replies attach to the case. Internal templates
   reply to `dgsregistry@nitda.gov.ng` per `correspondence-email-templates.config.js`.

## Rendering guarantees

- **Width** 640 px fixed, single column, 640 px breakpoint. Two-column meta rows and
  button pairs stack on narrow screens; the masthead sub-brand block hides below 640 px
  rather than crushing the lockup.
- **Outlook (Word engine, Windows).** Table-only layout, no flexbox, no CSS grid, no
  `position`, no background images, no web fonts required for legibility. Every call to
  action carries a VML `roundrect` fallback so the button paints as a filled rectangle.
  `mso-table-lspace/rspace` reset on every table; `PixelsPerInch` set to 96.
- **Dark mode.** `color-scheme: light` and `supported-color-schemes: light` on all
  nineteen so Outlook and Gmail do not force-invert the deep-green masthead into an
  unreadable grey.
- **Gmail clipping.** Largest file is 21 KB — well inside Gmail's 102 KB clip threshold
  even after a flow injects long row tables.
- **No JavaScript, no external CSS, no forms, no iframes** anywhere in `deploy/`. All
  styling is inline or in the single scoped `<style>` block that carries only resets and
  media queries.
- **Accessibility.** `lang="en"`, `role="presentation"` on every layout table,
  descriptive `alt` on the lockup, no meaning carried by colour alone (every priority and
  status chip states its level in words), body text at 13.5–14.5 px with 1.68 line height,
  44 px minimum touch targets on all buttons, text contrast at or above 4.5:1 against its
  own background.
- **Preheader** on every template — a hidden first line so the inbox preview says
  something useful instead of repeating the subject.

## Static conformance audit — 19 August 2026

Run against all twenty files in `deploy/`. These are the properties verifiable without a
mailbox; all nineteen pass, so the live-client matrix below only needs to cover what a real
client can tell us that source cannot.

| Property | Result |
|---|---|
| Table-based layout only — no `display:flex` / `grid` | 20 / 20 clean |
| No `position:absolute` / `fixed` | 20 / 20 clean |
| No external stylesheets, no `<script>` | 20 / 20 clean |
| No `background-image` (no image-blocked layout collapse) | 20 / 20 clean |
| No inline `<svg>` (Outlook drops it) | 20 / 20 clean |
| `<!--[if mso]-->` head block present | 20 / 20 |
| `color-scheme` + `supported-color-schemes` meta | 20 / 20 |
| 640 px constraint + `@media` stack rules | 20 / 20 |
| Every `<img>` carries `alt` | 20 / 20 |
| Every token wrapped in `coalesce(...)` — no bare `outputs()` | 20 / 20, zero uncoalesced |
| Status indicator resolves from one token | 18 / 18 templates that report a status |
| VML `roundrect` behind every filled CTA | 18 / 18 templates that have one |
| Largest file | IP-01, 21.4 KB — all well under Gmail's 102 KB clip |

DP-02 (verification code) and IP-11 (official correspondence) carry no filled CTA by
design — footer text links only — so they need no VML and are excluded from that row.

## Live-client test matrix before release sign-off

| # | Test | Pass condition |
|---|---|---|
| 1 | Send with **no** Compose actions set | Every field shows its fallback; no literal `@{` in the received mail |
| 2 | Priority sweep: Low / Normal / High / Urgent on IP-01, IP-03, IP-10 | Spine, chip and subject prefix all change together |
| 3 | Empty row variables on IP-02, IP-07, DP-01 | Schedule renders header only, no broken table |
| 4 | 40-row batch on IP-02 | No clipping in Gmail; rows keep hairline rules |
| 5 | Outlook 2019 / 365 Windows | Buttons filled and clickable; masthead green; no gaps between bands |
| 6 | Outlook web, Gmail web, Apple Mail, iOS Mail, Gmail Android | Single column below 640 px; button pairs stacked |
| 7 | Images blocked | Agency name legible in place of the lockup; layout unchanged |
| 8 | Forced dark mode (iOS Mail, Outlook mobile) | Masthead stays deep green, body stays light |
| 9 | Long subject (200 chars) into `Compose_Subject` | Wraps, does not overflow the container |
| 10 | Screen reader (NVDA + Narrator) | Reads eyebrow → heading → body in order; tables announce as layout, not data |
| 11 | Governed status check on DP-01/03/04/05/06 | Only governed public labels appear |
| 12 | HTML fragment injection through a row variable | Upstream sanitisation blocks it; no script survives |

Record results in `production_templates/qa/` alongside the existing QA artefacts. The
release gate in `approved_template_release_manifest.yaml` should move from `pending` to
approved on tests 1–12 passing; nothing in the template layer remains outstanding.

## Regenerating

The templates are generated, not hand-maintained. `build/lib.js` holds the master shell
and primitives; `build/templates-portal.js` and `build/templates-internal.js` hold the
per-template content. Editing a shell primitive and regenerating changes all nineteen
consistently — which is the point of a single shell.

## 2.1.0 — what was added

**IP-12 · Single Task Assignment — Email Origin.** A purpose-built variant of IP-01 for a
task raised from an email the Agency received. Carries a provenance card of record —
sender, organisation, address, receiving mailbox, hour of receipt, message id, the subject
as received and an excerpt of the message — plus a four-step chain of custody. Batch
language is absent by design. Contract in §7 of `TOKEN_CONTRACT.md`.

**Conditional status indicators across the collection.** Eighteen templates now colour
their status badge and accent rail from `Compose_Status_Text` (DP-05 from
`Compose_Decision_Label`), resolved inside the HTML with nested
`if(contains(...))`. The flow sets the status word; the template does the rest. An
unrecognised or unset status lands in Neutral. DP-05 no longer needs
`Compose_Decision_Color` — the outcome colour now follows the decision label itself.
IP-11 and DP-02 carry no indicator; neither reports a status.

### Conditional rendering test matrix

Set `Compose_Status_Text` to each value and confirm the badge, the rail and the spine
all move together. One template per bucket is sufficient; IP-01 exercises all five.

| Status set by the flow | Expected bucket | Accent |
|---|---|---|
| `Pending action` | In hand | `#05583B` |
| `Under review` | In hand | `#05583B` |
| `Overdue` | Pressing | `#5A3F00` |
| `Action required` | Pressing | `#5A3F00` |
| `Approved` | Cleared | `#0D7234` |
| `Closed` | Cleared | `#0D7234` |
| `Declined` | Adverse | `#C8102E` |
| `Returned` | Adverse | `#C8102E` |
| `(unset)` | Neutral | `#4A4849` |
| `Wibble` (unrecognised) | Neutral | `#4A4849` |

Deploy-mode regeneration: run the generator sources in `build/` — `lib.js`,
`templates-internal.js`, `templates-portal.js` — in both modes and write to `deploy/`
and `preview/`. `registry.json` and `tokens.json` are derived from the built output, so
they never drift from the files that ship.
