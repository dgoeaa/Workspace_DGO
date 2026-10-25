# Authentication & RBAC — complete configuration and enablement guide

**Status: reference.** This consolidates what already exists across `config/`, `core/`,
`docs/architecture/AUTHENTICATION_CONTRACT.md`, `docs/deployment/RUNBOOK.md` and
`docs/folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md` into one place: what the two apps in this
repository do today, what switching each one on requires, and where responsibility sits
between the browser and the flow estate. It does not introduce new behaviour.

---

## 0. Correcting the starting assumption

The internal platform (repository root — `index.html`, `core/`, `modules/`) and the
**document-portal** (`document-portal/`) do **not** share the same authentication/RBAC
structure. They share one *mechanism* — a Power Automate OTP flow pair — but only the
internal platform has roles, permissions, or anything resembling access control:

| | Internal platform (root) | `document-portal/` |
|---|---|---|
| Audience | Staff — officers, directors, executives, admins | The public — citizens submitting/tracking correspondence |
| Accounts / users | Yes — `DGO_UserDirectory`, six roles | **None.** Deleted deliberately (see §6) |
| RBAC / permissions | Yes — `config/rbac.config.js`, route + capability matrix | **None exists.** There is nothing to be a role *of* |
| What OTP proves | **Who you are** (an enrolled officer) and **what role you hold** | **That you control an email address** — nothing more |
| Where OTP is used | Sign-in (`core/otp-identity.js`) and step-up confirmation on sensitive writes (`core/otp-service.js`) | Gating a submission and, optionally, a status read-back to the address that made it |
| Governed by | `config/auth.config.js` + `config/rbac.config.js` | `document-portal/config.local.js` endpoints only — no config flag equivalent to `auth.enabled` |

If you came here expecting one RBAC surface to configure for both apps: **there isn't one.**
The portal has an identity-*proving* mechanism (email verification) but never had, and does
not need, a role model — it is a stranger-facing intake channel, not a workspace. Sections
1–5 below cover the platform's full auth/RBAC surface; §6 covers the portal's narrower
verification-only contract; §7 is the combined activation runbook.

---

## 1. Current posture (both apps, today)

Everything described below **exists in the codebase and is switched off.** This is
deliberate: a half-enabled auth layer is worse than none, because it invites the assumption
that something is being enforced when it is not.

| | Internal platform, today | Internal platform, enforced | `document-portal`, today |
|---|---|---|---|
| Identity source | `localStorage` profile (client-asserted) | A verified one-time-code proof | None (anonymous) unless `VERIFY`/`VERIFY_CONFIRM` are configured |
| Role source | `state.users` lookup, or a bootstrap admin if no directory has ever answered | The role `OTP_VERIFY` resolved from `DGO_UserDirectory`, carried in the proof | N/A — no roles |
| `Authorization` header | absent | `Bearer <proof>` | never sent — the portal has no bearer concept |
| Tampering with `localStorage` | **changes the effective role** (the demonstrated `viewer → systemAdmin` escalation, tracked as finding **G-04**) | no effect | N/A |
| RBAC enforcement | Client-side only (menu/route gating) — **advisory** | Client gating *and* server-side check against the role catalogue | N/A |

`config/auth.config.js#authPosture()` surfaces this at runtime (Diagnostics reads it):

> *Authentication is provisioned but INERT. Client-asserted identity is trusted and RBAC is
> advisory only. Do not treat any governance control as enforced.*

---

## 2. Configuration surface

### 2.1 `config/auth.config.js` — the master switch (platform only)

```js
export const AuthConfig = Object.freeze({
  enabled: false,                    // MASTER SWITCH. false = dev posture, true = enforced.
  provider: 'otp',                   // fixed — there is exactly one identity provider.
  allowClientAssertedIdentity: true, // auto-flips to false the moment enabled:true.
  roleSource: 'local',               // 'local' (dev) | 'verified' (the OTP proof's role).
  renewSkewSeconds: 120,
  authorizationHeader: 'Authorization',
});
```

Overridden at deploy time via `window.DGO_CONFIG.auth`, injected into the packaged bundle
(`npm run package` — see `docs/deployment/RUNBOOK.md`):

```js
window.DGO_CONFIG = {
  auth: { enabled: true, roleSource: 'verified' },
  // endpoints — including OTP_GENERATE and OTP_VERIFY — are written in by `npm run package`.
};
```

`missingActivationConfig()` reports what is still needed before `enabled` may go `true` —
today just `OTP_GENERATE` and `OTP_VERIFY` having real URLs. There is no tenant ID, client
ID, or IdP registration step; a prior Entra ID design was removed entirely (see the header
comment in the file) because it added a directory dependency this platform has no other use
for.

### 2.2 `config/rbac.config.js` — roles, personas, routes, permissions (platform only)

Four things live here, and none of them are gated by `AuthConfig.enabled` — the RBAC
*model* is unconditional; what changes with the switch is where its **input** (the current
user's role) comes from.

- `RoleRouteAccess` — which of the 25 routes each of the six roles may open.
- `Roles` / `Permissions` — the capability matrix (`user:create`, `role:assign`,
  `dispatch:approve`, …) used by the User Administration screen and by
  `hasPermission()`/`canManageUsers()`.
- `Personas` / `RolePersonaMap` / `PersonaScopes` — a coarser grouping (`admin`, `executive`,
  `registry`, `general`) used for directorate-level record scoping (§4.3).
- `canAccess(subject, route)` — the route gate every workspace mount calls indirectly through
  `canCurrentUserAccess()`.

### 2.3 `config/platform-provisioning.config.js`

Not an auth file, but relevant: it lists the actions each of the platform's 29 modules is
provisioned to run (e.g. `user-admin`'s `create-user`, `edit-user`, `disable-user`,
`assign-role`). `core/action-runtime.js` and `core/action-authority.js` use it, together with
`config/action-ownership.config.js`, to refuse an action a module does not own — this is
*module* boundary enforcement, a separate axis from *role* enforcement, and both are
client-side only until Wave 3 (§7) lands.

### 2.4 `config/endpoints.config.js` — the two identity flows (platform)

```js
OTP_GENERATE: { method:'POST', action:'otpGenerate', write:true, url: EndpointUrls.OTP_GENERATE }
OTP_VERIFY:   { method:'POST', action:'otpVerify',   write:true, url: EndpointUrls.OTP_VERIFY   }
```

Populated at package time from deploy-supplied URLs, same as every other endpoint — there is
no separate identity-provider configuration surface.

### 2.5 `document-portal/config.local.js` — the portal's endpoints (no role config)

```js
window.PF_CONFIG = {
  endpoints: {
    SUBMISSION: '...', UPLOAD: '...', SUPPORT: '...',
    VERIFY: '...', VERIFY_CONFIRM: '...', STATUS: ''
  }
};
```

Leaving `SUBMISSION` empty puts the portal in **demo mode** (everything local, nothing
transmitted — the safe failure for a public site). `VERIFY`/`VERIFY_CONFIRM` are independent
of every other endpoint: configure them and email verification becomes available for
submission; leave `STATUS` answering `403 verification_required` and the same pair gates
status read-back too (§6). There is no `enabled` flag to flip here — verification activates
per-endpoint, at the flow, not in this file.

---

## 3. The RBAC model (internal platform)

### 3.1 Roles → routes

```
systemAdmin  → * (every route)
userAdmin    → home, settings, user-admin, diagnostics, operator-hud
executive    → home, executive, response-tracking, approvals, briefs, meetings,
               projects, reports, statistics, lookup, assistant, archive
director     → home, activities, correspondence, response-tracking, orchestrator,
               approvals, dispatch, scan-intake, briefs, meetings, projects,
               reports, statistics, lookup, assistant
operator     → home, activities, correspondence, response-tracking, orchestrator,
               single-assignment, bulk-assignment, scan-intake, registry, comments,
               dispatch, correspondence-email, meetings, projects, lookup, assistant
viewer       → home, response-tracking, reports, statistics, lookup
```

### 3.2 Roles → permissions (capability matrix)

| Role | Persona | Permissions |
|---|---|---|
| `systemAdmin` | admin | all 13 (`*`) |
| `userAdmin` | admin | `user:view/create/update/disable`, `role:assign`, `role:view`, `audit:view` |
| `executive` | executive | `executive:view`, `executive:export`, `audit:view` |
| `director` | registry | `executive:view`, `route:manage`, `dispatch:approve`, `bulk:assign` |
| `operator` | registry | `route:manage`, `bulk:assign` |
| `viewer` | general | none |

This is the exact table generated into `docs/reference/role-catalogue-seed.json` by
`npm run seed:roles`, which is meant to be pushed into `DGO_RoleCatalogue` so the flow estate
authorizes from the same source the client does (§5).

### 3.3 Personas and directorate scoping

`PersonaScopes` (in `config/rbac.config.js`) plus `core/directorate-scope.js` add a second,
orthogonal control: *which records* a role may see, not just which routes. `admin`,
`executive` and `registry` personas default to `directorateScope: ['all']`; `general` gets an
empty scope and falls back to the user's own directorate/department. `canReadRecord()` checks
a record's `__directorate` against that scope — this is what stops an operator in one
directorate reading another's file jacket even though both hold the `operator` role.

### 3.4 Resolution order — `canAccess()`

```
1. inactive user (status !== 'active')          → deny everything
2. user.role present and mapped in RoleRouteAccess → use it (role-based, precise)
3. no role → fall back to persona-based coarse rule (admin/executive/general/registry)
```

The persona fallback exists for records that predate a `role` field; role-based access always
wins when present. `core/current-user.js#getCurrentUser()` is what supplies the `subject` —
see §4.

---

## 4. Identity resolution (internal platform)

### 4.1 Dev posture (`AuthConfig.enabled === false`, today's default)

`core/current-user.js#getCurrentUser()`:

1. If `state.users` is non-empty, find the row matching `State.profile.email`. Found → that
   user (role, persona, status as stored). Not found → `viewer` / `unregistered`.
2. If `state.users` is empty **and** the directory has never been served
   (`state.runtime.directory.served !== true`) → a **bootstrap administrator**
   (`dgsregistry@nitda.gov.ng`, `systemAdmin`, `accessScope: ['all']`) so a fresh install can
   boot at all.
3. If `state.users` is empty **and** the directory *has* answered (with zero rows) → `viewer`
   / `unregistered`, never the bootstrap admin. This distinction — "never configured" vs.
   "configured and you're not in it" — is the fix for the exact failure mode audited as part
   of **G-04**: a backend returning `users: []` used to silently promote every caller to
   `systemAdmin`.

Because step 1 reads `State.profile`, which lives in `localStorage`, **editing localStorage
changes the effective role** in this posture. That is the documented, accepted behaviour of
development mode — not a bug to patch here, but the reason enforcement (§4.2) exists.

### 4.2 Enforced posture (`AuthConfig.enabled === true`)

`getCurrentUser()` instead calls `core/auth.js#getIdentity()`, which reads the **verified
proof's claims**, never `state.users`:

```
email/role/name  ← Auth.getClaims()   (decoded from the signed proof)
no email/role    → 'unauthenticated' / status:'unregistered' — never a fallback role
```

`localStorage` tampering has no effect on the role in this posture, which is the specific
regression `tests/auth-posture.test.mjs` pins.

### 4.3 The two identity/OTP clients — do not conflate them

There are **two** client modules that call the same pair of flows (`OTP_GENERATE` /
`OTP_VERIFY`, aliased `REQUEST_OTP`/`VERIFY_OTP` in `core/security-actions.js`), for two
different purposes:

| | `core/otp-identity.js` | `core/otp-service.js` |
|---|---|---|
| Purpose | **Sign-in.** Establishes who is calling for the whole session | **Step-up.** Re-confirms the already-signed-in caller before one sensitive write (e.g. `bulk-assignment`'s `otp-modal`) |
| Request shape | `{ email, code }` | `{ requestId, otp, actor, operation, refs, payloadDigest }` |
| Result | A persisted proof (`sessionStorage`), installed as `core/auth.js`'s token provider via `installOtpProvider()` | A one-shot `{ verified: true }`, consumed by `verifyOtpAndExecute()` and discarded |
| Lifetime | Survives a reload (session-scoped), cleared on `signOut()` or a 401 | Single use, tied to one `requestId` |
| Installed at boot? | Yes — `core/boot.js` calls `installOtpProvider()` when `isAuthEnforced()` | No — invoked directly from the module that needs step-up (e.g. `modules/bulk-assignment.js`) |

Both are already implemented and wired; only the flows behind them need to exist for real
(§5).

---

## 5. Server-side obligations — what actually enforces anything

**Client-side authentication does not provide server-side authorization.** Every governed
Power Automate flow must, before doing anything else:

1. **Verify the proof** — signature and expiry, against a secret only the flow estate holds.
2. **Derive identity from the proof only** — never from `userEmail` in the body (which stops
   being sent the moment `auth.enabled` is true, and must not be trusted even if present).
3. **Derive role from `DGO_UserDirectory`**, not from anything the client asserts.
4. **Authorize per action** against the same matrix as `config/rbac.config.js#Roles` — seed it
   into `DGO_RoleCatalogue` with `npm run seed:roles` so client and flow read one table.
5. **Enforce idempotency** — honour the client's `idempotencyKey` (`core/idempotency.js`) so a
   retried write cannot double-apply.
6. **Audit server-side**, logging the proof-derived identity.
7. Refuse with **`401`** for a missing/expired/invalid proof and **`403`** for a valid proof
   whose role does not permit the action — the client distinguishes these.

Full per-flow contracts (request/response shapes, exact obligations) live in
[`../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md`](../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md); one
addition specific to `user-admin:*` writes (`DYNAMIC_ACTIONS`): require `role:assign` on the
**caller**, resolved server-side — it is a plain HTTP endpoint, and a `viewer` posting an
`assign-role` payload must be refused by the flow, not merely hidden by the UI.

---

## 6. The document-portal's verification model (not RBAC)

`document-portal/` is the public intake channel — submission, status tracking, helpdesk. It
carries no staff function: **there are no accounts.** An earlier build embedded a staff
console with hardcoded credentials (`admin`/`password`, etc.) compared in the browser; it and
the credentials were deleted (`docs/forensic/dd2e909/findings.json` **F-029**) — an
unauthenticated static site is not a place to hold staff triage, and the internal platform
already implements that against a real identity.

What the portal has instead is a narrower primitive: **proof that a caller controls an email
address**, used for two independent purposes, each dormant until its flow demands it:

| Purpose | Trigger | Mechanism |
|---|---|---|
| Gate a submission | `SUBMISSION` flow answers `403 {"error":"verification_required"}` | `VERIFY` mails a code → `VERIFY_CONFIRM` returns a single-use proof → the wizard retries `SUBMISSION` with `verification` attached |
| Gate a status read-back | `STATUS` flow answers `403 {"error":"verification_required"}` | Same `VERIFY`/`VERIFY_CONFIRM` round-trip; the retry sends `{ referenceId, verification }` and the `email` field **leaves the request body entirely** |

Nothing here maps to a role. There is no `document-portal` equivalent of `RoleRouteAccess` —
the portal's only access decision is "does this person own this address," and that decision
is made by the flow, never the browser. Both round-trips are fully implemented client-side
and inert until the corresponding flow starts asking for them — see
`document-portal/README.md` §"Configuration" for the full request/response contract table,
including the anti-oracle requirements (a `404` for "wrong reference" and "wrong email" must
be byte-identical, expiry must never be reported as a distinct reason from "not found," etc.).

If a future requirement calls for staff-facing functionality inside the portal, it must reuse
the platform's OTP-identity + RBAC stack (§3–§5), not reintroduce a portal-local account
system — that is precisely what was removed.

---

## 7. Enabling authentication — the combined runbook

Ordered by dependency. Waves are named to match `docs/deployment/RUNBOOK.md`, which
has the full per-flow detail; this is the auth/RBAC-relevant subset.

### Wave 0 — make the directory real (do this first, no auth involved)

Until this is done, **every browser is a `systemAdmin`** with `accessScope: ['all']`, because
of the bootstrap fallback in §4.1.

```bash
npm run seed:roles                                   # regenerate role-catalogue-seed.json
./scripts/setup-sharepoint.ps1 -SiteUrl "…" -WhatIf   # dry run
./scripts/setup-sharepoint.ps1 -SiteUrl "…"           # creates 10 lists, 97 fields, seed rows
```

Populate `DGO_UserDirectory` with one row per real officer (`Role` one of the six catalogue
values, `Status: active`), then extend `FETCH_ALL` to return `users` — returning the
collection **even when empty** (an absent key means "unchanged"; an empty array means "the
directory answered and this caller is not in it," which is what closes the bootstrap
fail-open). Done when an officer sees their real role in `#/diagnostics` and someone outside
the directory is refused every route.

### Waves 1–2 — read and write spine

Not auth-specific, but a precondition: the governed write flows (`DYNAMIC_ACTIONS` and
friends) must exist before enforcing anything on them means something. See
[`FLOW_BUILD_SPEC.md`](../folio-Master-Flows-and-Endpoints/architecture/FLOW_BUILD_SPEC.md) Waves 1–2.

### Wave 3 — enforcement

1. **Build `OTP_GENERATE` and `OTP_VERIFY`** to the contracts in
   [`../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md`](../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md).
   `OTP_VERIFY` must resolve the caller against `DGO_UserDirectory` and return the role it
   found in `claims.roles`.
2. **Retrofit proof verification into every other flow** (§5) — verify → re-read role/status
   from the directory → check the action against the role → `401`/`403` as appropriate.
3. **Flip the switch** at deploy time (already provisioned by `npm run package`):
   ```js
   window.DGO_CONFIG = { auth: { enabled: true, roleSource: 'verified' } };
   ```
   Flipping `enabled` changes four things atomically, by design — they are not independently
   switchable, because any one alone produces a false sense of enforcement:
   - `core/data-client.js` attaches `Authorization: Bearer …`, stops sending `userEmail`,
     blocks unauthenticated requests.
   - `core/current-user.js` resolves identity/role from the verified proof, not `state.users`.
   - `core/auth.js#ensureAuthenticated()` throws instead of no-op.
   - `config/rbac.config.js` is unchanged — same matrix, now fed from a trustworthy source.
4. **No extra step is needed to install the token provider** — `core/boot.js` already calls
   `installOtpProvider()` from `core/otp-identity.js` whenever `isAuthEnforced()` is true. A
   *different* identity provider (MSAL, a broker) can be substituted by calling
   `registerTokenProvider()` with a function returning `{ token, expiresAt, claims }` instead;
   nothing hard-binds OTP.
5. **Verify**: `npm run test:auth` — asserts both postures in separate processes (inert is
   behaviour-preserving; enforced sends no anonymous request and ignores local role
   tampering — the exact `viewer → systemAdmin` regression is pinned as a failing test if the
   local-role path is ever reinstated).

### Wave 4 — the public channel (independent of Wave 3)

Build `SUBMISSION`, `UPLOAD`, `SUPPORT`, `STATUS`, `VERIFY`, `VERIFY_CONFIRM` per
`document-portal/README.md` and [`FLOW_BUILD_SPEC.md`](../folio-Master-Flows-and-Endpoints/architecture/FLOW_BUILD_SPEC.md) §Wave 4. This can happen in parallel
with Wave 3 — the portal is anonymous by design and never touches `DGO_RoleCatalogue`.

```
Wave 0  directory + roles          ← start here, no auth needed, closes the fail-open
   │
Wave 1  read spine
   │
Wave 2  DYNAMIC_ACTIONS + assign
   ├────────────────┐
Wave 3  OTP + proof   Wave 4  public channel      ← independent of each other
```

---

## 8. Verification and regression coverage

| Command | Proves |
|---|---|
| `npm run test:auth` (`tests/auth-posture.test.mjs`) | Both postures, in isolated processes: inert is behaviour-preserving; enforced attaches a bearer token on every governed call and ignores `localStorage` role tampering; both route directly to configured endpoint URLs (no proxy/APIM) |
| `tests/identity-directory.test.mjs` | Directory-served vs. never-configured distinction in `getCurrentUser()` (§4.1) |
| `tests/governance.test.mjs` | Route ↔ provisioning parity (`config/routes.config.js` vs. `config/platform-provisioning.config.js`) |
| `npm run seed:roles -- --check` | `docs/reference/role-catalogue-seed.json` is not stale against `config/rbac.config.js` |
| `tests/hardening.test.mjs`, `tests/portal.spec.js` | The portal's verification round-trip: a `verification_required` response is never rendered as a denial; a flow that doesn't ask sees exactly one call; the email leaves the body once a proof is present; the address never reaches the URL |
| `npm run verify:endpoints` | Whether the 22 wired endpoint URLs (identity included) actually answer, from a machine with tenant egress — **never yet run against the live tenant** as of the last audit |

---

## 9. Known gap and where things stand

Tracked as **G-04** in `docs/audits/CAPABILITY_ASSESSMENT_R11.6.md`:

> No authentication layer is active. `core/data-client.js` sends no `Authorization` header;
> caller identity travels as a plain `userEmail` body field the client controls; RBAC reads
> from `localStorage`, which the same client controls. A `viewer` can edit `localStorage` and
> reload as `systemAdmin`.

Status: **provisioned, inert** — the entire client half (§§2–4, 6) is implemented and tested;
what remains is exclusively the flow-side work in §5 and §7 Wave 3. `authPosture()` /
Diagnostics report this live so it is visible in the running product, not only in this
document. Until Wave 3 lands, treat every role check in this platform as UX, not security.

---

## 10. Quick reference

**Files that define the model:**
- `config/auth.config.js` — the switch (platform)
- `config/rbac.config.js` — roles, permissions, routes, personas (platform)
- `core/auth.js` — token/identity service, posture-aware
- `core/otp-identity.js` — sign-in OTP client + persisted proof
- `core/otp-service.js` + `core/security-actions.js` — step-up OTP client
- `core/current-user.js` — resolves the effective user record for both postures
- `core/action-authority.js` — module-ownership + audit wrapper around governed actions
- `core/directorate-scope.js` — record-level scoping by persona
- `document-portal/config.local.js` — portal endpoints, including `VERIFY`/`VERIFY_CONFIRM`

**Files that define the enablement contract:**
- [`AUTHENTICATION_CONTRACT.md`](./AUTHENTICATION_CONTRACT.md) — the platform activation spec in full
- [`../deployment/RUNBOOK.md`](../deployment/RUNBOOK.md) — every flow, in build order
- [`../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md`](../folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md) — exact request/response shapes for `OTP_GENERATE`, `OTP_VERIFY`, `FETCH_ALL`, `DYNAMIC_ACTIONS` role writes
- [`../../document-portal/README.md`](../../document-portal/README.md) — the portal's endpoint contract, including the verified-read-back specification

**Six roles, for reference:** `systemAdmin`, `userAdmin`, `executive`, `director`,
`operator`, `viewer` — full matrix in §3, generated form in
[`../reference/role-catalogue-seed.json`](../reference/role-catalogue-seed.json).
