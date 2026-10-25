# Provisioning console — operating guide

> **This document carries steps, and owns none.** Every command here operates one tool — the
> provisioning reference and its console. It commissions nothing and changes no tenant: the
> whole of it reads this repository and writes into it. The commissioning path is
> [`RUNBOOK.md`](../../deployment/RUNBOOK.md), and nothing below supersedes or qualifies it.

Every action, start to finish, with the exact command, the exact values it accepts and the
exact thing it prints. Nothing here is illustrative: every command below was run against this
repository and every figure is what it returned.

**What the tool is.** `docs/reference/provisioning/` holds the configuration of every flow and
every endpoint across both platforms, as provisioned. It exists in two forms built from one
model: 134 markdown pages, and a console — a searchable interface over the same facts. The
console can also be exported as a single self-contained HTML file, for the whole estate or for
any subset of it.

---

## 1. Preliminaries

### 1.1 What you need

| | Requirement | Check it |
|---|---|---|
| Node | **22 or later** (`package.json#engines`) | `node --version` |
| The repository | cloned, on the working branch | `git rev-parse --abbrev-ref HEAD` |
| Dependencies | **none** — the whole toolchain imports only `node:` builtins and files in this repo | no `npm install` needed for any command in this guide |
| A browser | any current one. The console is opened from a file path; no server, no network | — |

`npm install` **is** required for the wider test suite (Playwright), but not for building,
exporting, or opening the console.

### 1.2 Where everything lives

```
docs/reference/provisioning/
├── README.md                    the markdown index — 134 pages linked from here
├── ENDPOINT_REGISTER.md         every endpoint on both platforms, one table
├── folio-Master-Flows-and-Endpoints/                       77 pages — the deployed estate, one page per flow
├── packages/                    57 pages — designs, clipboard scopes, patched, recovered
├── index.html         AUTHORED  the console page
├── console.css        AUTHORED  its design
├── console.js         AUTHORED  its behaviour
├── provisioning-index.js   GEN  134 flow summaries + the search index   (322 KB)
├── provisioning-detail.js  GEN  every configured value, every action    (5,925 KB)
└── brand/                        the brand kit, synced from styles/

scripts/
├── build-provisioning-reference.mjs   writes the markdown
├── build-provisioning-console.mjs     writes the console data, and the single-file export
└── lib/provisioning-model.mjs         the one analysis both of them render

tests/
├── provisioning-reference.test.mjs    the markdown matches the packages
├── provisioning-console.test.mjs      25 assertions — parity, file:// safety, selection
└── provisioning-console.spec.js       the browser behaviour (needs Playwright)

dist-console/                          single-file exports. GIT-IGNORED, built on demand
```

**AUTHORED** files are edited by hand and reviewed. **GEN** files are generated — never edit
them; rebuild instead. The markdown generator treats its whole output directory as generated
and deletes anything it did not write, with the five console files named as its one exception
(`CONSOLE_FILES` in `build-provisioning-reference.mjs`). A stray file dropped in there **will**
be swept on the next `npm run provisioning`.

### 1.3 The commands, in full

| Command | Writes | Exit 0 when |
|---|---|---|
| `npm run provisioning` | the 134 markdown pages | written |
| `npm run test:provisioning` | nothing | the pages match a fresh run |
| `npm run provisioningconsole` | the two data files | written |
| `npm run provisioningconsole -- --check` | nothing | the data matches the packages |
| `npm run provisioningconsole:one` | `dist-console/provisioning-console.html` | written |
| `npm run provisioningconsole:one -- --only=…` | one narrowed export | written |
| `npm run test:provisioningconsole` | nothing | 25 assertions pass **and** `--check` passes |

Every failure exits **2**. Success exits **0**.

---

## 2. Open the console (the common case)

Nothing to build — the data is committed.

```bash
git pull
xdg-open docs/reference/provisioning/index.html    # Linux
open      docs/reference/provisioning/index.html   # macOS
start     docs\reference\provisioning\index.html   # Windows
```

Or double-click the file. It works from `file://`: no server, no build step, offline.

**Why it loads fast.** `provisioning-index.js` (322 KB) is in the `<head>`, so the list, the
search and the filters are live on first paint. `provisioning-detail.js` (5.9 MB) is injected
by `console.js` **after** that paint. Open a flow before it lands and you get a
"Reading the configured values…" line for a moment; it resolves on its own.

---

## 3. Using it

### 3.1 Search

One box, top left. It matches **more than the flow name** — the search index carries, per
package: the flow name, its id, its slug, its internal name (GUID), every contract key it
serves, **every action name**, every connection name and operation, the SharePoint site, and
**the resolved name of every list a call targets**.

That last one is the difference from the markdown. A flow is configured with a list *GUID*;
the tenant index resolves it, so:

| You type | You get |
|---|---|
| `DGO_UserDirectory` | the flows that read or write that list |
| `ee82725a-c408-45e2-a8e8-facf7a092047` | the same flows, by the GUID as configured |
| `GetItems` | every flow performing that operation |
| `SCAN_INTAKE` | the flow serving that contract key |
| `Scope_Global` | every flow with an action by that name |

Multiple words are **AND**: `otp verify` requires both.

### 3.2 Filters

Seven chips. Within a group **OR**, across groups **AND** — the way you read them. Picking
*Internal* and *Portal* means both estates, not the empty set.

| Chip | Group | Selects |
|---|---|---|
| **Deployed** | live | the deployed export — the provisioned state |
| **Not deployed** | live | designs, clipboard scopes, patched, recovered |
| **Internal** | estate | `estate === 'Internal platform'` |
| **Portal** | estate | `estate === 'Document portal'` |
| **Serves a key** | own | carries at least one internal contract key |
| **No auth stated** | own | deployed **and** the export carries no `triggerAuthenticationType` |
| **Returns a response** | own | has at least one `Response` action |

Sort: **Name** (default), **Most actions**, **Estate**, **Method**.

### 3.3 Inside a flow — the thirteen sections

Every package renders the same thirteen, numbered as the markdown numbers them, so `§10` means
the same thing in both.

| # | id | Holds |
|---:|---|---|
| 1 | `identity` | display name, internal name, workflow id, environment, estate and the register that decided it, contract keys, export provenance |
| 2 | `envelope` | `$schema`, `contentVersion`, `description`, `outputs`, action count |
| 3 | `parameters` | definition parameters with type and default |
| 4 | `connections` | what each action is bound to, counted by operation |
| 5 | `trigger` | name, type, kind, method, relative path, auth posture, request schema |
| 6 | `responses` | every `Response`: status code, headers, body, what it runs after |
| 7 | `termination` | every `Terminate`: status, code, message |
| 8 | `errors` | actions that run on failure, and every retry policy |
| 9 | `variables` | name, type, initial value, the action that initialises it |
| 10 | `sharepoint` | one row per connector call — operation, connection, site, `table`, **and the list that GUID resolves to** |
| 11 | `http` | raw HTTP and webhooks: method, uri, auth, retry, headers, queries, body |
| 12 | `dependencies` | what every action waits for, and on what outcome |
| 13 | `actions` | the configured input of every action, verbatim |

§13 is collapsed by default and filtered in place — type in its box to narrow 252 actions to
the ones you want. **Expand all** opens what is visible.

### 3.4 Links you can send

The address bar is the state. Grammar:

```
#/<dir>/<slug>[/<section>[/<action path>]]
```

`<dir>` is `flows` (deployed) or `packages` (everything else). It is part of the address
because **the slug alone is not unique** — `Portal_UPLOAD_ECM_DOCS` is both a deployed flow
(33 actions) and the clipboard scope built for it (49).

| Link | Opens |
|---|---|
| `#/flows/cg-submission-endpoint` | that flow, at the top |
| `#/flows/cg-submission-endpoint/variables` | that flow, scrolled to §9 |
| `#/flows/web-subsidiary-doc-actions/actions/Scope_Global%2FResponse` | that flow, §13, with that one action expanded |

The action path is URL-encoded — `/` inside an action path becomes `%2F`. The **Link** button
on any section heading copies the address and puts it in the bar. Arriving by link **jumps**;
clicking inside the page **glides**.

### 3.5 Keyboard

| Key | Does |
|---|---|
| `/` | focus the search and select it |
| `↑` `↓` | move through the list |
| `Enter` | open the focused flow |
| `Esc` | clear the search; on a narrow screen, return to the list |
| `t` | cycle theme — dark → light → follow the system |

### 3.6 On a phone

Below 900 px the layout is one column: the list **is** the page until you pick a flow, and a
**‹ All flows** control returns to it. Below 1200 px the section outline becomes a drawer
behind the ☰ button. Nothing scrolls sideways — every wide table and JSON block scrolls inside
its own box.

---

## 4. Export a single file

The folder is five files that only work together. To hand the reference to somebody, export
one self-contained HTML file: interface, data, brand assets and all.

### 4.1 The whole estate

```bash
npm run provisioningconsole:one
```

```
  docs/reference/provisioning/provisioning-index.js  322 KB
  docs/reference/provisioning/provisioning-detail.js  5925 KB

  134 packages · 77 deployed flows · 6438 actions · 6.10 MB total

  single file: /home/user/ECM_DOCS_DEV/dist-console/provisioning-console.html  6.39 MB
```

### 4.2 A subset — `--only=`

```bash
npm run provisioningconsole:one -- --only=<term>[,<term>…]
```

Terms are comma-separated and **OR'd**, so one flow, several, and a whole category are the
same operation. Note the `--` before `--only` — npm needs it to pass the flag through.

```
  selection: SUBMISSION
  2 of 134 packages · 140 actions
    folio-Master-Flows-and-Endpoints/cg-submission-endpoint
    folio-Master-Flows-and-Endpoints/submission-ecm-docs-portal

  single file: …/dist-console/provisioning-console-SUBMISSION.html  0.45 MB
```

### 4.3 What a term may be

Matched case-insensitively, in this order. First hit wins per package; every package that hits
any term is included.

| # | Form | Example | Notes |
|---:|---|---|---|
| 1 | **alias** | `portal` | the seven below |
| 2 | **package id** | `folio-Master-Flows-and-Endpoints/ip-scan-intake` | `<dir>/<slug>` — always unique |
| 3 | **slug** | `ip-scan-intake` | may match two packages; both are included |
| 4 | **flow name** | `CG_Submission_Endpoint` | the display name |
| 5 | **internal name** | `de9ef13b-ae4c-42b0-9afa-20e71a180759` | the flow GUID |
| 6 | **contract key** | `SCAN_INTAKE`, `SUBMISSION` | internal **and** portal keys |
| 7 | **glob** | `cg-*` | `*` only; tested against id, slug, name and internal name |

**The seven aliases**

| Alias | Selects |
|---|---|
| `internal` | `estate === 'Internal platform'` |
| `portal` | `estate === 'Document portal'` |
| `deployed` | the deployed export |
| `live` | same as `deployed` |
| `design` | the design packages |
| `paste` | the clipboard scopes |
| `undeployed` | everything that is not the deployed export |

**The 20 internal contract keys** — also shown on the rows in the list:

`AI_CHAT` · `AI_DOC_ANALYSIS` · `AI_EMAIL_ANALYSIS` · `ARCHIVE_REFERENCE` · `BULK_ASSIGNMENT` ·
`BULK_ASSIGNMENT_DIRECT` · `DISPATCH_OUTBOUND` · `DYNAMIC_ACTIONS` · `EMAIL` ·
`EMAIL_RELATED_TASK` · `FETCH_ACTIVITIES` · `FETCH_ALL` · `FETCH_EMAIL_ATTACHMENTS` ·
`GET_DOCS` · `OTP_GENERATE` · `OTP_VERIFY` · `REFERENCE_DATA` · `SCAN_INTAKE` ·
`SINGLE_ASSIGNMENT` · `SUBSIDIARY_ACTIONS`

**The 7 portal endpoint keys** — selectable, but **not** shown on the rows, because the rows
carry internal contract keys and the portal endpoints are registered elsewhere:

| Key | Packages it selects |
|---|---:|
| `SUBMISSION` | 2 |
| `UPLOAD` | 1 |
| `SUPPORT` | 2 |
| `VERIFY` | 2 |
| `VERIFY_CONFIRM` | 1 |
| `STATUS` | 2 |
| `WRITEBACK` | 1 |

### 4.4 Worked examples, with real sizes

Every row below was run against this repository; the sizes are what it produced.

| Command | Packages | File |
|---|---:|---:|
| `npm run provisioningconsole:one` | 134 | 6.39 MB |
| `… -- --only=folio-Master-Flows-and-Endpoints/ip-scan-intake` | 1 | 0.35 MB |
| `… -- --only=SUBMISSION` | 2 | 0.45 MB |
| `… -- --only=OTP_GENERATE,OTP_VERIFY` | 3 | 0.47 MB |
| `… -- --only=SUBMISSION,UPLOAD,STATUS` | 5 | 0.54 MB |
| `… -- --only=cg-*` | 13 | 0.95 MB |
| `… -- --only=portal` | 51 | 2.39 MB |
| `… -- --only=deployed,design` | 87 | 4.86 MB |

A one-flow export is 0.35 MB rather than the ~0.05 MB its data would suggest: roughly 0.3 MB
of every export is the brand kit — the stylesheet, the script and two PNG lockups, inlined as
`data:` URIs so the file opens on its own. That is a floor, not a per-flow cost.

### 4.5 Where it is written, and what it is called

Default: `dist-console/<stem>.html`, git-ignored.

- Whole estate → `provisioning-console.html`
- Narrowed → `provisioning-console-<terms>.html`, terms joined with `+`, anything outside
  `[A-Za-z0-9._+-]` replaced by `-`, runs of `-` collapsed, trimmed, capped at 60 characters.
  So `--only=cg-*` → `provisioning-console-cg.html`.

Override the whole path with an environment variable:

```bash
DGO_STANDALONE_OUT=/tmp/for-the-registrar.html \
  npm run provisioningconsole:one -- --only=SUBMISSION
```

### 4.6 What a narrowed export does and does not do

**It says what it is.** A band sits above every screen:

> **Partial export** — 5 of 134 packages in the estate. Selected by `SUBMISSION`, `UPLOAD`,
> `STATUS`. The rest of the estate is not in this file.

Every count — the header, the stat cards, the filter chips — is computed over the selection,
not the estate. A two-flow export that claimed "77 deployed flows" would be a document that
misdescribes itself to whoever received it.

**It never writes the committed data.** `--only` writes the single file and nothing else.
`docs/reference/provisioning/` is the whole estate by definition.

**It carries no credential.** Everything passes the redactor, and the builder refuses to write
a file matching `sig=[A-Za-z0-9_-]{20,}`.

**It is not committed.** `dist-console/` is git-ignored and `--check` does not police it.
Rebuild rather than keep one — a stale copy of a provisioning record is the failure this whole
reference exists to prevent.

---

## 5. After the flows change

The data is generated. When a flow package changes, regenerate both forms — in this order,
because both read the same model and only the second knows about the console:

```bash
npm run provisioning          # the 134 markdown pages
npm run provisioningconsole   # the two data files
```

Then verify and commit:

```bash
npm run test:provisioning            # pages match a fresh run
npm run test:provisioningconsole     # 25 assertions + data matches the packages
git add -A && git commit -m "Regenerate the provisioning reference" && git push
```

Running only the first leaves the console stale — the committed `COMMISSIONING_SURFACE.md`
says so where it describes this directory.

---

## 6. Troubleshooting — every refusal, verbatim

All exit **2**.

### `--only matched nothing for: WRONG`

```
  ✖  --only matched nothing for: WRONG
     A term must name a package id, slug, flow name, internal name or contract key,
     a glob over those, or one of: internal, portal, deployed, live, design, paste, undeployed.
     Refusing rather than exporting less than was asked for.
```

**Why it refuses rather than exporting less.** An export quietly emptier than you asked for is
indistinguishable from a correct one once it is in an inbox.

**Fix.** Check the term against §4.3. Common causes: a typo; a portal key spelled with a space;
a slug that is actually an id (`ip-scan-intake` vs `folio-Master-Flows-and-Endpoints/ip-scan-intake` — both work, but
`folio-Master-Flows-and-Endpoints/ip_scan_intake` does not); a glob with no `*`.

### `--only and --check are contradictory`

`--check` polices the committed data, which is always the whole estate. Drop one.

### `--only writes a single file only. Add --standalone.`

Use `npm run provisioningconsole:one -- --only=…`, which includes `--standalone`.

### `N generated file(s) differ from a rebuild. Run npm run provisioningconsole.`

The committed data no longer matches the packages. Run the rebuild and commit the result.

### `the single file still references href="…" — it would not open on its own`

Something was added to `index.html` that the export cannot inline — a media type not in the
`MIME` map, or a reference outside `docs/reference/provisioning/`. This guard is what caught
the brand kit when it landed. **Fix:** add the extension to `MIME` in
`build-provisioning-console.mjs`, or move the asset inside the directory.

### `… would carry a signature. Refusing to write it.`

A SAS-signed trigger URL reached a generated file. It is a bearer credential. Do not work
around this — find how it got past `redactDeep` and fix that.

### The console opens blank, or unstyled

You are opening the folder version with files missing, or you copied `index.html` alone. All
five files must sit together. Use the single-file export instead — that is what it is for.

### A flow is missing from the list

Check the filter chips (a stuck chip narrows silently) and clear the search. If it is a
narrowed export, the band at the top says so.

---

## 7. Two things to know before you rely on it

**The markdown is the record, the console is the way through it.** Both are generated from
`scripts/lib/provisioning-model.mjs`, so neither can show a fact the other cannot — that is
asserted, flow by flow, by `tests/provisioning-console.test.mjs`. A git diff of a flow's
provisioning is the markdown page; the console is not diffable and is not meant to be.

**This is the configured state, not a live read.** Everything here comes from packages in this
repository — the deployed export is the tenant as exported, on the date its page records. It
is not a call to Power Automate. For that, see `DGO_ENDPOINT_INVENTORY` in
`docs/folio-Master-Flows-and-Endpoints/deployment/internal/ENDPOINT_INVENTORY_FLOW.md`, which reads the tenant and has never
been run.
