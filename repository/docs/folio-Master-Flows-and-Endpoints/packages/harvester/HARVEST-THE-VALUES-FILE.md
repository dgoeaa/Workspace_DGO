# Harvest the 25 trigger URLs from inside the tenant

> **This document covers one step of commissioning, not commissioning.** The authoritative path
> is [`docs/deployment/RUNBOOK.md`](../../../deployment/RUNBOOK.md), on a desktop or a phone alike.
> Come here only for §3/§4 of that document — getting the trigger URLs into `~/dgo-values.txt`
> — and go back to it for everything after.

**Read this first: the exporter already fetches these URLs.** `Complete Power Automate Flow
Definition Exporter v7` calls `ListCallbackUrl` on the same `shared_flowmanagement` connection
three production flows use, normalises the answer, and explicitly does not redact it — its own
record says *"No filtering, reduction, redaction, masking, validation, or omission of retrieved
URL or flow information."*

The URLs have been reachable all along. What has never worked is the delivery.

## Why nothing ever arrived

Three defects in the exporter's `Scope_Outtput_Delivery`, all static properties of the document:

| Defect | Effect |
|---|---|
| `runAfter` reads `["SUCCEEDED"]` | Logic Apps status values are case-sensitive `Succeeded`. The condition never matches, so **the delivery scope is never scheduled at all.** This alone explains the silence. |
| `Compose_Execution_Report_Attachments` is malformed JSON — `"Name";@{string('')}`, an unterminated string, a stray `}` | The attachment array cannot be built, so the email carries nothing usable. |
| `Observed_feedback_Compose_Compose_Current_Flow_Error` has an entire **action definition** as its `inputs`, referencing `@item()?['Capture ID']` and `actions('Get_Flow_Definition')` from outside the loop those resolve in | Unresolvable wherever it runs. |

Two more worth fixing while you are in there, though they are not what blocked you:

- `body('Get_Flow_Definition')?['body']?['properties']…` — `body()` already returns the body, so
  the second `['body']` yields null. Several fields in `Append_Found_Flow` are silently empty
  because of it. `outputs('Get_Flow_Definition')?['body']?…` is the correct form and is what
  `Compose_Normalized_Callback_URL` already uses.
- `Add_Final_Collection_Run_Row` has `"item": ""`.

## And one thing to stop doing

The exporter bundles the signed callback URLs into the governance record it emails to
`dgsRegistry@nitda.gov.ng`, classified *"Restricted — complete inventory including signed
callback URLs."* That is twenty live bearer credentials landing in a shared mailbox, indexed,
backed up and retained indefinitely. Possession of one authorises invoking that flow; deleting
the mail revokes nothing.

**This scope keeps them out of every record.** They appear only in the HTTP response. The
rejection log it returns when something fails carries workflow ids and action statuses and never
a URL, so an incomplete run is safe to read on screen and safe to paste into a ticket.

Leave `credentials_removed: true` alone. It is a standing assertion in a permanent governance
record, and a run that quietly contradicts it makes every earlier record less trustworthy too.

## Rights this needs, and the two it does not

**No Entra app registration.** No client id, no secret, no redirect URI, no admin consent. The
flow authenticates through a *connector connection* — a delegated OAuth grant created by signing
in to the connector once, with Power Automate holding and refreshing the token. An app
registration is what you need to call these APIs from your own code as a service principal, and
nothing here is your own code.

**No tenant admin.** The Power Automate Management connector has two families of operation:
user-scoped (`GetFlow`, `ListFlowOwners`, `ListCallbackUrl`) and admin-scoped
(`GetFlowAsAdmin`, `ListFlowsAsAdmin`, …). This scope uses exactly one operation,
`ListCallbackUrl`, and it is user-scoped: it answers for flows the connection's identity owns or
co-owns, and nothing else. No Global Administrator, no Power Platform Administrator, no
Environment Administrator. `tests/endpoint-values-harvester.test.mjs` refuses any operationId but
that one, so the scope cannot quietly acquire an admin dependency later.

What it does need — each already true here, which is why this route was chosen:

| Requirement | Evidence in this tenant |
|---|---|
| A Power Automate Management connection (premium connector) | `shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2` is used daily by `IP_FETCH_ALL_ENDPOINT`, `IP_Retrieve_Email_Attachment_Endpoint` and `Single_Task_Assignment`. |
| A premium licence for whoever owns the flow | Same three flows. Premium is licensed per flow owner, so this holds for the account that owns them. |
| Maker access to the Default environment | The estate's twenty endpoint flows live there. |
| Anonymous HTTP triggers permitted | 20 of the 21 HTTP triggers catalogued run `triggerAuthenticationType: All` — anonymous is not merely allowed here, it is the estate's norm. |
| Ownership or co-ownership of each flow queried | The one genuine gate. See the note under **Before you start**. |

That last row is the only requirement not automatically satisfied, and it is a question of
*identity*, not of *session* — which is the whole reason this route works where two browser
harvesters were refused.

## Before you start

**Get the scope onto the clipboard first.** The portal work needs it, so this comes before
anything in the browser — not just before the curl:

```bash
cd ~/ecm_docs_dev
git fetch origin claude/system-remediation-gaps-ahpmsy
git checkout claude/system-remediation-gaps-ahpmsy
git pull origin claude/system-remediation-gaps-ahpmsy
termux-clipboard-set < docs/folio-Master-Flows-and-Endpoints/packages/harvester/Scope_Endpoint_Values_Delivery.designer-paste.json
```

23 KB, and it carries no credential — it is the instructions for fetching them, not the result.
Safe on a clipboard, safe in the repository.

The clipboard then gets used **twice**: the scope goes out to the browser, and the trigger URL
comes back on it. Sequential, so it works, but you cannot hold both at once.

**What you do not need:**

- No `npm install`. Every script in this chain — `check:values`, `setup`, `check:config`,
  `commission`, `verify:endpoints` — imports only Node builtins and repository-local files.
- Node 22 or newer (`node -v`).
- `curl` (`pkg install curl` if Termux does not have it).

**The one thing that can still block, and it is not your browser session.** The flow runs as the
Power Automate Management *connection*, and that connection's identity has to own or co-own
every flow it asks about. `shared-flowmanagemen-6a2f7a95-3886-4631-b8ca-bd6b5e9bf5c2` already
does — three production flows use it daily. **Reuse it.** Creating a fresh connection under a
different account means `ListCallbackUrl` returns 403 for every flow that account does not own,
and the run comes back 409 listing them.

## What to build

`Scope_Endpoint_Values_Delivery.designer-paste.json` in this folder. Generated from
`docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json`, so it cannot drift from the register:

```bash
npm run harvester          # regenerate
npm run test:harvester     # staleness gate + the checks that catch the defects above
```

It makes one `ListCallbackUrl` call per **(contract key, candidate flow)** — 32 records for 25
keys, because seven keys have two candidate flows and the wrong one has to be refused rather
than avoided. That is the only connector operation it uses, and it is the only one this tenant
is known to answer.

**Each URL is verified before it is written.** The invoke URL that comes back must name the
application workflow id the register holds for that key, and must carry a signature. A candidate
that answers for a different workflow is rejected and named, never written. Unverified, a
candidate match is how one endpoint's signature ends up under another endpoint's key — the worst
failure available here, because the values file would look complete.

**If any key is unresolved, nothing is returned.** You get a `409` naming the missing keys.

### 1. The trigger: **When an HTTP request is received**, in a flow of its own

Not a manual button, and the reason is not convenience. **The trigger choice is the egress
choice**, and only a Request trigger can use the `Response` action:

| Trigger | Where the twenty-five credentials end up |
|---|---|
| **HTTP request** | The response body only. `curl -o ~/dgo-values.txt` — never rendered, never stored in the tenant. |
| Manual button | No `Response` is available, so the output has to come from run history (renders them in the maker UI, retained around 28 days), an email (a mailbox, permanently), or a file write (at rest in SharePoint under whatever that library inherits). |
| Recurrence | Mints and exposes them repeatedly, unattended. Never. |

**Make a new flow rather than pasting into the exporter.** You delete it afterwards and its URL
dies with it; the exporter keeps running untouched and its governance record stays clean. If the
exporter is itself HTTP-triggered, adding a `Response` to it also changes its contract for
whatever already calls it.

Settings on the trigger:

- Method **POST**. No request body schema — the scope reads nothing from the body.
- **Who can trigger the flow: Anyone.** "Any user in my tenant" requires an Entra bearer token
  on top of the signature, which curl on a phone cannot readily supply. That is precisely why
  step 5 is not optional.

**This flow's own trigger URL is the sharpest object in the exercise:** one credential that
vends twenty-five. It is live from the moment you save until the moment you delete the flow, so
have the commands in step 4 ready *before* you save, and keep the flow **turned off** until you
are about to run it.

### 2. Add four top-level variables

`Initialize variable` is illegal inside a scope, so these go in the flow body **before** the
pasted scope, in this order. Names are exact — the scope reads them by name.

| Name | Type | Initial value |
|---|---|---|
| `EnvironmentName` | String | `Default-ca6a4b3f-9123-49bc-bcb9-27085ebbf1a1` |
| `ValuesLines` | Array | *(empty)* |
| `ValuesResolvedKeys` | Array | *(empty)* |
| `ValuesRejections` | Array | *(empty)* |

The exporter already initialises `EnvironmentName`; do not add a second one.

### 3. Paste the scope — and re-paste it whenever it changes

**A `git pull` does not reach the tenant.** The flow keeps running whatever scope was pasted
into it, and an older scope answers *exactly as it did before* — same keys resolved, same
refusals, byte for byte. From the output that reads as the change having done nothing, and it
has cost a round trip twice.

So the scope carries a **build id**, stamped into its 409 body and into the values file's
header. `npm run fetch:values` compares it against the copy on disk and says, in one line, that
the flow is running an older scope. `npm run harvester` prints the current build when it writes.

To replace it in the designer: **delete the `Scope_DGO_Endpoint_Values_Delivery` action**, then
paste the current one and save. Editing around it is not enough — the registry is a Compose
inside the scope, and that is what changes.

### 3a. The first paste

Copy the whole of `Scope_Endpoint_Values_Delivery.designer-paste.json` to the clipboard, then in
the designer use **Paste** at the end of the flow body. Save.

If the paste lands with the connection unset, open `List_Callback_URL_For_Values` and pick the
existing Power Automate Management connection — the same one `IP_FETCH_ALL_ENDPOINT` uses.

### 4. Run it, straight into the file

Turn the flow on, then copy its **HTTP POST URL** from the trigger card. That one copy replaces
twenty.

**The URL never goes on a command line, and the clipboard can only hold one thing.** That second
point is what makes this awkward on a phone: the clipboard is how commands get into Termux *and*
how the URL gets out of the browser. Paste a block of shell that reads the clipboard and you have
just pasted the shell over the URL — which is exactly what happened the first time, and `curl`
reported `empty string within braces`.

So the command is short enough to type, and it reads the clipboard itself:

```bash
cd ~/ecm_docs_dev
npm run fetch:values
```

That is the whole step. Copy the flow's **HTTP POST URL** in the browser, type those two lines,
and the clipboard never has to hold anything else.

It refuses anything that is not a trigger URL — one line, `https://`, a `/triggers/` path ending
`/paths/invoke`, and a signature of at least 20 characters — and says which of those failed. **A
length check is not enough**: the command block that caused this was 308 characters, inside the
range a real URL occupies. Length is not a shape.

It writes `~/dgo-values.txt` at mode `0600` set explicitly, not inherited from `umask`, and it
refuses to overwrite an existing values file. Nothing it prints is a credential: on success you
get a key count and a byte count; on failure, the reasons. The single exception is a value that
does not begin with `https://` — that cannot be a signed URL, so the first 48 characters are
shown, which is how you discover the clipboard held your own instructions.

Without termux-api, pipe it instead:

```bash
npm run fetch:values -- --stdin        # then paste the URL and press Ctrl-D
```

**If curl returns `202 Accepted` instead of the file**, the run started but did not reach
`Response` within the 120-second synchronous window, and the body is lost. Thirty-two sequential
connector calls should land well inside it; if yours does not, say so rather than reading the
output out of the run history — the fix is to call once per distinct flow (about 23 instead of
32) and match keys to banked URLs in a second pass, which is a change to the generator, not to
your tenant.

**If curl returns `409`**, no key is missing from the file because there is no file: the run
resolved fewer than 25 keys and returned the reason instead. The body names `missingKeys` and a
`rejections` list carrying workflow ids and action statuses — no URLs — so it is safe to read on
screen and safe to paste here.

`check:values` prints no URL, no host and no signature — only shapes — so its output is safe to
show anyone. Expect:

```
✅ 25 value(s), all with a complete 43-character signature.
```

**43 is exact** — a signature is base64url of an HMAC-SHA256, 32 bytes, 43 characters unpadded.
Any other number is a defect in the transfer, not in the tenant.

### 5. Delete the harvester — this is the step, not the tidy-up

Do this **after** `check:values` says 25 and **before** `setup`. That order is deliberate: once
the file is proven complete you never need the flow again, and every minute it stays is a minute
one request fetches twenty-five credentials.

**Delete the flow.** Turning it off stops it answering; deleting it ends the exposure. If you
pasted into the exporter instead, remove the scope again.

Deleting it does not revoke the twenty-five URLs it handed you — those go only when each trigger
is regenerated in Power Automate. What it revokes is the ability to fetch them all again with one
request.

### 6. Wire the values in, then gate

```bash
npm run setup -- --values ~/dgo-values.txt --force
npm run check:config && npm run check:config:portal
npm run commission
```

`setup` writes both config files — `config/config.local.js` for the internal runtime and
`document-portal/config.local.js` for the public portal.

**`--force` is not optional here.** Both files already exist, and without it setup refuses to
overwrite them, discards every value you passed, and exits 2 naming the flag. It does say so; it
is just easy to read as a warning rather than as "nothing was wired".

`check:config` and `check:config:portal` confirm what landed. `commission` answers the separate
question of whether the platform may be declared live — a correct configuration can still fail
it, for instance if trigger URLs are published or the register answers anonymous callers.

Optionally exercise the live flows end to end:

```bash
npm run verify:endpoints
```

Read-only endpoints on both surfaces, calling each flow for real and reporting status, latency
and body shape against the contract. No signature reaches the terminal or the JSON report.
**Writes are opt-in** (`--include-writes`) because roughly two thirds of the surface mutates
something; probes that run carry a `__DGO_PROBE__` marker and a run id so their rows can be found
and deleted.

### Where everything lands

| | Path | Holds | Committed? |
|---|---|---|---|
| Values file | `~/dgo-values.txt` | all 25 keys | **outside the repository**, `0600` via `umask 077`, shredded at step 7 |
| Internal runtime config | `config/config.local.js` | 18 keys, the `DGO_ENDPOINT_*` half | git-ignored (`.gitignore`) |
| Public portal config | `document-portal/config.local.js` | 7 keys, the `PF_ENDPOINT_*` half | git-ignored (`.gitignore`) |

The prefix on each values-file line is what routes it. `DGO_ENDPOINT_*` → runtime,
`PF_ENDPOINT_*` → portal, and **no key name appears in both surfaces**, so nothing is written
twice and nothing is ambiguous:

- **runtime (18)** — FETCH_ALL, DYNAMIC_ACTIONS, SINGLE_ASSIGNMENT, BULK_ASSIGNMENT,
  FETCH_ACTIVITIES, REFERENCE_DATA, GET_DOCS, FETCH_EMAIL_ATTACHMENTS, BULK_ASSIGNMENT_DIRECT,
  EMAIL, EMAIL_RELATED_TASK, AI_EMAIL_ANALYSIS, AI_DOC_ANALYSIS, AI_CHAT, OTP_GENERATE,
  OTP_VERIFY, SUBSIDIARY_ACTIONS, SCAN_INTAKE
- **portal (7)** — SUBMISSION, UPLOAD, STATUS, SUPPORT, VERIFY, VERIFY_CONFIRM, WRITEBACK

**Both config files are loaded by a browser** — `index.html` pulls `config/config.local.js`,
and each `document-portal/*.html` pulls `config.local.js` beside it. There is no proxy or broker
in the request path, by architectural decision, so every signature in either file is delivered to
the client that uses it. The two differ in *audience*, not in mechanism: the portal's seven face
the public, the runtime's eighteen face internal officers. Treat both as disclosed to whoever can
open the page.

Neither is ever committed. `.gitignore` carries both, under the note *"config.local.js — a
credential. Never commit one."*

**If you are delivering rather than running locally**, `npm run package` writes
`dist/dgo-internal-platform/` and `dist/dgo-document-portal/`, each self-contained with its
endpoints configured in, a manifest hashing every byte, and a provisioning record naming what is
wired and what is not. That exists because a clone or a "Download ZIP" cannot by construction
carry credentials, which used to make provisioning a manual step on the far side of the handover
with nothing checking the result.

One gate to expect: `commission` and `package` both **refuse a deployment wired to a signature
that is committed in this repository**. A signature in the tree is held by everyone who can read
the tree, and deleting the file revokes nothing — only regenerating the trigger does. Freshly
harvested URLs pass; recycled ones do not.

### 7. Shred the values file

Once `check:config` is green the file has done its job:

```bash
shred -u ~/dgo-values.txt 2>/dev/null || rm -P ~/dgo-values.txt 2>/dev/null || rm ~/dgo-values.txt
```

Deleting it revokes nothing — the signatures live in the two config files now, and in the tenant.
It just stops a second copy sitting in your home directory.

## What the first live run established, 12 September

It ran. `ListCallbackUrl` answered on the flowmanagement connection, twenty-one of twenty-five
keys resolved and verified, and every refusal was informative. That settles the approach: the
management API is reachable from a flow on this tenant, whatever the browser session is doing.

**Five of the seven two-candidate keys are now decided by the tenant rather than by inference.**
In each case the losing candidate turned out to be a *different flow that exists in its own
right* — the register holds a row for each of them — and the workflow-id check refused it:

| Key | Resolved by | Refused, and why |
|---|---|---|
| `FETCH_ALL` | `IP_FETCH_ALL_ENDPOINT` `b79e6707` | `IP_Fetch_All_Endpoint` `be1f89bd` — the callback call failed outright |
| `SINGLE_ASSIGNMENT` | `Single_Task_Assignment` `3caf9458` | `IP_Single_Assignment_Endpoint` `05825db0` serves `27272c09…`, its own register row |
| `OTP_GENERATE` / `OTP_VERIFY` | `IP_OTP_VERIFY` `4dbe6dde` | `IP_OTP_Endpoint` `913bd078` serves `9bca4990…` = `IP_DGO_OTP_Endpoint` / `OTP_GENERATE_LEGACY` |
| `PF_ENDPOINT_SUPPORT` | `CG_Portal_Support_Endpoint` `4873c936` | `CG_Support_Endpoint` `1b2c2e53` serves `8f948e0a…`, its own register row |
| `PF_ENDPOINT_VERIFY` | `CG_Portal_Verification_Endpoint` `ba47f79b` | `CG_Verification_Endpoint` `86897b2f` serves `ee627334…`, its own register row |

Those are not duplicates of one flow. They are distinct flows whose display names resemble each
other, which is precisely why a name match must never be trusted and why nothing is written
under a key whose workflow id the URL does not carry.

### The four that did not resolve, and what has since been supplied

**`SUBSIDIARY_ACTIONS` and `DYNAMIC_ACTIONS` — closed pending a run.** The crosswalk had offered
only `IP_Subsidiary_Actions_Endpoint` `08da1783`, and the tenant said it serves `df90ba34…`,
which the register lists as `["IP_Subsidiary_Actions_Endpoint"]` — **a row carrying no contract
key at all**. The catalogue had called the pair `ALIAS_ALIGNED`; the tenant refuted it. They are
two flows, not one under two names.

`IP_Dynamic_Global_Actions_Endpoint` was exported on 12 September:
`31c0aaf0-ddbb-478c-9a98-bc013265c4c7`, a flow id that appeared nowhere in this repository
before. It is now the second candidate for both keys, tried after `08da1783` and verified like
any other.

**`EMAIL_RELATED_TASK` — a second candidate, and a thing to check.** `2fbb5485` answered
`Failed`, matching the catalogue's own `NOT_FOUND_OR_UNAUTHORIZED`. Its export package says
`triggerAuthenticationType: All`, so the flow is *meant* to issue a signed URL — the failure is
the flow or the access to it, not its configuration. **Check whether it is turned off**:
`ListCallbackUrl` fails on a stopped flow. The probe `IP_Create_Email_Assignment` `3f2f649b` is
the other candidate and is now in the scope.

**`SCAN_INTAKE` — still a decision, and now confirmed from the flow's own definition.** Its
export carries `"triggerAuthenticationType": "Tenant"` inside the trigger's `inputs`, and its
method is **PUT**, not POST — this is the bytes-transport endpoint. A tenant-authenticated
trigger's callback URL carries no `sig` because the caller presents an Entra token instead, so
the workflow id matched exactly and the URL was still refused.

An unsigned URL cannot be called by a browser in an architecture with no proxy, so it is not
written — a values file carrying it would look complete and 401 on first use. Two ways forward:

1. Set **Who can trigger the flow → Anyone** on `IP_SCAN_INTAKE`. It then issues a signed URL
   like the other twenty-four and nothing else changes.
2. Keep tenant authentication, and accept that this one endpoint needs the client to acquire and
   send an Entra token — which the direct browser-to-flow architecture does not do today.

Every record now carries its `triggerAuthentication`, read from the export package's own
definition where one exists and from the catalogue otherwise, and every rejection carries a
computed `diagnosis` naming which of four things happened. A 409 no longer needs decoding.

## What the ten export packages did and did not close

The packages are committed at `docs/folio-Master-Flows-and-Endpoints/exports/` and reflected in
`docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json`. Five arrived on 11 September and took resolution
from 19 of 25 keys to 23; `IP_Get_Docs_Endpoint` took it to **25 of 25, none unevidenced**; and
four more on 12 September supplied the candidate the first live run proved was missing. They
fall into three groups:

| Package | Tenant flow id | What it did |
|---|---|---|
| `BULKOPSDATARETRIEVALHTTP` | `5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06` | **Closed** `BULK_ASSIGNMENT` — new evidence |
| `AI_Document_Processing` | `fefa43c6-fb9d-4337-8b65-7fd19fa09b6d` | **Closed** `AI_EMAIL_ANALYSIS`, `AI_DOC_ANALYSIS`, `AI_CHAT` |
| `IP_Bulk_Assign_Endpoint` | `0d1e8df5-30b3-4069-8903-665b87c197eb` | Corroborated an extraction already held |
| `IP_Get_Docs_Endpoint` | `28f6e62a-fea8-437c-a61a-47aec706c4e2` | **Closed** `FETCH_ACTIVITIES` and `GET_DOCS` — the last two open keys |
| `IP_FETCH_ALL__EXTENDED_ENDPOINT` | `ce2cbed8-d180-4160-a0c7-f552101bc412` | **Unplaced** — its display name matches no register flow name |
| `IP_Create_Email_Assignment` | `3f2f649b-55af-48e0-9a1e-43135e11a4b0` | **Unplaced** — likewise |

The last two are the interesting ones, and they are *near misses rather than matches*:

- The register's `FETCH_ALL` already has two candidates, `IP_FETCH_ALL_ENDPOINT` and
  `IP_Fetch_All_Endpoint`. `IP_FETCH_ALL__EXTENDED_ENDPOINT` would be a third flow with a third
  id.
- The register's `EMAIL_RELATED_TASK` names `IP_Create_Email_Assignment_Endpoint`
  (`2fbb5485-…`). The package is `IP_Create_Email_Assignment` (`3f2f649b-…`) — the same name
  without the suffix, and a different flow id. The catalogue could not retrieve `2fbb5485-…` at
  all: `NOT_FOUND_OR_UNAUTHORIZED`.

The crosswalk refuses to place either, and that is right: it is an evidence record, and matching
on a name that nearly agrees is how one endpoint's signature ends up under another's key.

**The harvester can try them anyway, because it verifies.** Both are offered as extra candidates
for the key their name suggests, tried *after* every evidenced candidate. If one is the live flow
the run resolves it; if not, its callback URL names a different workflow, the candidate is
rejected, and the rejection records which workflow it actually serves — settling the question
either way. A wrong probe here produces a fact, not a credential. The same guess in the crosswalk
would produce an unverified claim.

So a run answers three open questions at once: whether `ce2cbed8-…` serves `FETCH_ALL`, whether
`3f2f649b-…` serves `EMAIL_RELATED_TASK`, and which of the seven two-candidate keys is served by
which flow.

## Every contract key now has a flow

`docs/folio-Master-Flows-and-Endpoints/registers/flow-identity-crosswalk.json` reports **25 resolved, 0 unevidenced**. The last
gap — `FETCH_ACTIVITIES` and `GET_DOCS`, both on application workflow
`c4c26f93ba1e4d7db5247536c30cdc11` — closed when `IP_Get_Docs_Endpoint` was exported on
12 September: tenant flow `28f6e62a-fea8-437c-a61a-47aec706c4e2`.

Worth noting because it is the trap this whole exercise turns on: that package's folder is
`2e066f71-2b41-4f93-be69-932fabb4bf1a`, which is the **package resource id** and addresses
nothing. The tenant flow id is the `name` inside `definition.json`. Three identifier domains,
and only one of them opens a flow.

So a run should now return a complete file rather than a 409 — every one of the 34 (key,
candidate) records carries a flow id to call.

**Resolved is still not verified.** The crosswalk reports `verified: 0` and will keep doing so:
nothing has yet asked the tenant whether a given flow's callback URL names the workflow the
register expects. That is exactly what the run does, and it is why the scope refuses to write a
URL under a key whose workflow id it does not carry.

## The exporter's registry is a separate thing, and this does not update it

`Compose_Expanded_Flow_Registry` lives inside the flow, in the tenant. It cannot read this
repository, so committing evidence here does not change what it reports — and its
`unvalidated_due_to_extraction_failure` list will keep naming flows this repo has already
resolved. Two registries, no link between them.

To close its gaps too, edit that Compose directly:

| Flow | Exporter registry | This repo now holds |
|---|---|---|
| `BULK OPS DATA RETRIEVAL HTTP` | `null` | `5aab9e61-ab9f-4af1-9f2b-eaba23a1bf06` |
| `AI_Document_Processing` | `null` | `fefa43c6-fb9d-4337-8b65-7fd19fa09b6d` |
| `IP_Get_Docs_Endpoint` | `null` | `28f6e62a-fea8-437c-a61a-47aec706c4e2` |

Filling all three closes six contract keys for the exporter's own governance record, and
retires its `unvalidated_due_to_extraction_failure` list for everything but the two duplicate
aliases.
