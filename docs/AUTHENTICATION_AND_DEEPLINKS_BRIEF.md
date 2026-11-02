# Authentication and Deep Links Across the Folio Estate — Implementation Brief

**Scope.** Every authentication and deep-link mechanism implemented across the Folio estate held in this repository: the Folio Workspace (internal platform), the NITDA Document Portal, the DGO Correspondence Mailer, the Folio Central Administration Centre and the Folio Vault, together with the Power Automate flows, SharePoint lists, configuration, tests and governance records that back them.

**Baseline.** `Repo_root/` is the canonical application source (root `README.md`, `package.json`). `repository/` is the byte-preserved retained package and carries the reference documents that `Repo_root/docs/` no longer holds (`AUTHENTICATION_CONTRACT.md`, `IDENTITY.md`, `PLATFORM_ACCESS_SPEC.md`, `DEEPLINK_AUDIT.md`, `NOTICE_LINKS.md`, the flow packages). Paths below are relative to `Repo_root/` unless stated. Section 6 covers the other variant folders.

**Status line.** The estate is NO-GO (`FINAL_READINESS_ASSESSMENT.md`). Authentication on the Workspace is provisioned and inert by configuration; the flow-side enforcement exists in released packages behind one tenant switch. Deep links are implemented on the client and audited against the flow estate.

---

## Part A — Authentication

### A1. Folio Workspace (internal platform)

#### A1.1 Design summary

| Property | Value |
|---|---|
| Identity provider | None external. Emailed one-time code via two Power Automate flows: `OTP_GENERATE` (IP_OTP_GENERATE `e5632336`) and `OTP_VERIFY` (IP_OTP_VERIFY `4dbe6dde`) |
| Proof | Opaque GUID row in a SharePoint ledger (`DGO_SessionProofs`, list `444102d6-…`), not a signed token. Lifetime 4 h, stamped by the flow |
| Transport | `X-DGO-Proof: Bearer <guid>` request header on every governed call (not `Authorization`; see A1.4) |
| Master switch | `AuthConfig.enabled` (`config/auth.config.js`), default `false`; overridable by `window.DGO_CONFIG.auth.enabled` |
| Posture today | **Inert.** Identity is a client-asserted `userEmail` from the `localStorage` profile; RBAC is advisory |
| Server switch | Flow Configuration row `IDENTITY_PROOF_REQUIRED` (`'true'` = proof-only; else proof if present, otherwise `userEmail`) |
| Role source | `DGO_UserDirectory` (`3d591f5b-…` on `DGO_ECM_GOVERNANCE`), resolved by the flow, returned in the proof claims |

#### A1.2 Configuration — `config/auth.config.js`

- `enabled` (false) — master switch; flipping it changes four behaviours at once (header attached, `userEmail` dropped, role from proof, unauthenticated governed calls refused).
- `provider: 'otp'` (fixed), `allowClientAssertedIdentity` (true while inert), `roleSource` ('local' | 'verified'), `renewSkewSeconds` (120).
- `authorizationHeader: 'X-DGO-Proof'` — chosen because a signed Power Automate trigger reads an `Authorization` header as an Entra token and answers 401 "MISE unauthorized" before the flow runs (live test 2026-10-08).
- `identityEndpoints: ['OTP_GENERATE','OTP_VERIFY']` — the only endpoints that may be called without a proof; not configurable.
- `isAuthEnforced()`, `missingActivationConfig()` (names unset OTP endpoint keys), `authPosture()` (development/enforced, surfaced in Diagnostics).
- Endpoint URLs: `config/endpoints.config.js` lines 46-47 and 83-84 declare `OTP_GENERATE` / `OTP_VERIFY` as POST write contracts, read from `window.DGO_CONFIG.endpoints` supplied by the git-ignored `config/config.local.js` (template at repository root `config.local (1).js`).

#### A1.3 Token service — `core/auth.js`

- `registerTokenProvider(fn)` — pluggable acquisition adapter returning `{ token, expiresAt, claims }`.
- `getAccessToken()` — null while inert; when enforced returns the cached token, renews inside the skew window, coalesces concurrent acquisitions into one in-flight promise, audits `audit:auth-token-acquired`.
- `authHeaders()` — `{}` while inert; `{ 'X-DGO-Proof': 'Bearer <token>' }` when enforced.
- `clientMayAssertIdentity()` — true only while inert.
- `getIdentity()` — inert: local profile (`verified:false`, `role:null`); enforced: email/name/role from claims (`source:'verified-proof'`).
- `verifiedRole(claims)` — reads `claims.role` or `claims.roles[0]`, accepting a SharePoint Choice `{Value}`; returns `null` when absent, which callers treat as unauthorised (no local fallback).
- `ensureAuthenticated(action)` — no-op while inert; throws `Authentication required.` or `No platform role is mapped…` when enforced, with audit events `audit:auth-required` / `audit:auth-role-unmapped`.
- `_decodeClaims()` — best-effort JWT payload decode for display only, no verification.
- `clearToken()` — on sign-out or 401.

#### A1.4 OTP identity provider — `core/otp-identity.js`

- **`requestCode(email)`** → `invokeObsidianAction('REQUEST_OTP', { identifier }, { flatPayload:true, skipConfirmation:true })`. Field names `identifier`/`otp_code` at top level and `action` dispatch values `generate`/`verify` are the flows' vocabulary (ITEM-44). Returns `{ sent, expiresAt, reason }`; `sent:false` is reported honestly. Audits `audit:otp-requested` / `audit:otp-request-failed`.
- **`submitCode(email, code)`** → `VERIFY_OTP` with `{ identifier, otp_code }`. Accepts `token | verification | proof`; builds claims from `res.claims` or `{ preferred_username, email, name, roles }`. **Refuses a proof without a usable `expiresAt`** (no fallback lifetime; the 8-hour default was removed 2026-09-22). `parseExpiry()` trims seven-decimal fractions the flow emits to milliseconds. Persists the proof, clears the cached token, audits `audit:otp-verified`.
- **Persistence**: `localStorage['dgo.r11.identity.proof']` = `{ token, expiresAt, claims }` (owner decision 2026-10-20: one sign-in for the whole browser, previously `sessionStorage`). `restore()` migrates a legacy `sessionStorage` copy; an expired proof is removed.
- **Multi-tab**: `watchOtherTabs()` listens to `storage` events and dispatches `dgo:signed-in` / `dgo:signed-out`.
- **Interactive acquisition**: `installOtpProvider()` registers a provider that returns the held proof or, when none is held, calls the registered `setSignInPrompt()` UI and waits; concurrent callers share one prompt; cancel rejects with `SIGN_IN_REQUIRED`.
- **`signOut()`** clears the proof, cached token, audits `audit:signed-out`.
- `isSignedIn()`, `heldIdentity()` (display only).

#### A1.5 Boot sequence — `core/boot.js`, `index.html`

1. `PlatformProvisioner.ensure()` then `isAuthEnforced()` check (lazy import so the inert path does not load identity modules).
2. Enforced: `installOtpProvider()`, `watchOtherTabs(window)`, `setSignInPrompt(() => promptSignIn())` from `shared/sign-in-dialog.js`, then `await getAccessToken()` **before anything is drawn** so a deep link opened while signed out still lands on its task. `window.__DGO_SIGNING_IN__` pauses the 15-second boot watchdog in `index.html` (lines 41-70) while the person fetches a code.
3. Inert: the demonstration welcome experience (`core/welcome-experience.js`) runs instead; it accepts any 6-digit code except `000000` (`config/welcome-experience.config.js` `invalidDemoOtp`) and is never shown when enforced.
4. Shell mounts, then `DeepLinkResolver.resolveInitial()` runs on the next animation frame (see Part B).

#### A1.6 Sign-in UI — `shared/sign-in-dialog.js`

Two-step modal (email → code) with focus trap, `autocomplete="one-time-code"`, `maxlength=10`. Calls `requestCode` then `submitCode`; on success dispatches `dgo:signed-in`; cancel rejects with `SIGN_IN_CANCELLED`. Closes itself if another tab signs in. `shared/shell.js` redraws navigation and route on `dgo:signed-in` and re-issues a refused load; `[data-sign-out]` calls `signOut()` and reloads; `dgo:signed-out` reloads. The identity block (`who()`) reads `getCurrentUser()` when enforced.

#### A1.7 Request path — `core/data-client.js`, `core/security-actions.js`, `core/api.js`

- `DataClient.request(key, payload, options)`: if `key` is not an identity endpoint, `await ensureAuthenticated('endpoint:<key>')`; body gains `userEmail` only when `clientMayAssertIdentity()`; headers `Content-Type`, `X-Correlation-Id`, plus `authHeaders()` unless the key establishes identity. `flatPayload` puts fields at the top level with `correlationId`; otherwise `{ action, payload, requestId, timestamp }`.
- `core/security-actions.js` `ObsidianActionAliases`: `REQUEST_OTP → OTP_GENERATE/requestOtp`, `VERIFY_OTP → OTP_VERIFY/verifyOtp`, `VERIFY_OTP_AND_EXECUTE`. `invokeObsidianAction()` runs the flow-execution confirmation (skipped for sign-in via `skipConfirmation`) and lifts the response envelope.
- `core/otp-service.js` — **step-up OTP** (distinct from sign-in): `requestOtp`/`verifyOtp`/`verifyOtpAndExecute` bind the code to a SHA-256 `payloadDigest` so a verified code cannot be replayed against different data; used by governed actions (`config/platform-provisioning.config.js` lists `request-otp`/`verify-otp` capabilities).

#### A1.8 Identity resolution and RBAC — `core/current-user.js`, `config/rbac.config.js`

- `getCurrentUser()`: enforced → identity and role from the verified proof only (`source:'token-claims'`, `verified:true`); no email or role → `unauthenticated`/`viewer`/`unregistered`. Inert → `state.profile.email` looked up in `state.users` (the `DGO_UserDirectory` collection served by `FETCH_ALL`). The bootstrap administrator (`dgsregistry@nitda.gov.ng`, `systemAdmin`) applies only when **no directory has ever been served** (`state.runtime.directory.served`); `users: []` resolves to `viewer`/`unregistered` (the earlier fail-open that promoted every browser to `systemAdmin` is closed and regression-tested).
- `normalizeUserRecord()`: role resolved through `canonicalRole()` (identity-preserving spelling fold; `Administrator` deliberately does not resolve), unknown role → `viewer` with `roleKnown:false`; status through `canonicalStatus()` (`staged|active|disabled|unregistered`, aliases `enabled`, `inactive`).
- `RoleRouteAccess` — per-role route allow-list (`systemAdmin: *`; `userAdmin`, `executive`, `director`, `operator`, `viewer` rows). `acknowledgment` is open to every role that can be assigned a task (2026-09-30) so emailed links do not meet "Access denied". `explainAccess()` returns the reason (`status-staged`, `status-disabled`, `status-unregistered`, `status-unknown`, `role-unknown`, `route-denied`, `persona-denied`); no fall-through from role to persona (finding F-020). `canAccess()` is the boolean face.
- `Roles`/`Permissions` capability matrix (`user:*`, `role:assign`, `settings:manage`, `audit:view`, `dispatch:approve`, `bulk:assign`, `route:manage`, `executive:*`). `canManageUsers()` gates User Administration, whose writes go to `USER_ADMIN` (`modules/user-admin.js` line 35).
- `accessDenial()` composes the denial screen naming the directory column at fault; `core/router.js` line 37 renders it; `core/link-guard.js` hides links to routes the role cannot open (`watchLinks`, F-21).

#### A1.9 Acknowledgement actor — `core/acknowledgement-service.js`

`resolveAcknowledgementActor()`: enforced → the signed-in identity only (`source:'verified-proof'`); inert → first of form, deep-link context (`actorEmail|email|userEmail|staffEmail` etc.), local profile that names an address. All interpolations into the acknowledgement e-mail are HTML-escaped because several originate in deep-link query parameters.

#### A1.10 Diagnostics and audit

`modules/diagnostics.js` renders `authPosture()` (posture pill, warning, missing config). `modules/operator-hud.js` shows a deep-link inspector. `core/audit-log.js` events: `audit:auth-token-acquired`, `audit:auth-required`, `audit:auth-role-unmapped`, `audit:otp-requested`, `audit:otp-verified`, `audit:otp-verify-denied`, `audit:signed-out`, `audit:access-denied`.

#### A1.11 Backend — the OTP flows (packages `repository/docs/folio-Master-Flows-and-Endpoints/packages/identification-phase4/`)

**IP_OTP_GENERATE (`OTP_GENERATE__IP_OTP_GENERATE__e5632336.paste.json`, in tenant 2026-10-22)**

- Trigger: HTTP POST, authentication `All`; reads `identifier` top-level; switches on `action` = `generate`.
- `Get_Otp_Generate_Directory_User`: `DGO_UserDirectory` filter `Email eq '<identifier>' and Status eq 'active'`; `Condition_Otp_Generate_Known_User`.
- `Compose_OTP_Expiry` = `addMinutes(utcNow(), 5)`; `varRandomOTP` = `rand(100000, 1000000)` (ITEM-82).
- `Create_item_OTP_Record` → list `9421d473-…` (OTP_Transactions on `NITDADGO-EAAACTIVITYTRACKING`): `Title`=identifier, `OTP_Code` (plaintext), `Expires_At`, `Is_Verified:false`, `Attempts:0`.
- Mail "Your Verification Code" via Office 365 to the record's Title; response `{ status:'success', message:'OTP sent', expiry_minutes, request_id }` with allowed-origin CORS from the `Allowed Origins` list.

**IP_OTP_VERIFY (`OTP_VERIFY__IP_OTP_VERIFY__4dbe6dde.paste.json`, in tenant 2026-10-22)**

- Reads `identifier`, `otp_code`; `Get_items_OTP_Attempts` (latest unverified row); `Condition_Attempt_Cap` ≥ 5 → 429; `Get_items_OTP_Verify` filter `Title eq identifier and OTP_Code eq code and Is_Verified eq 0`; `Condition_1` `Expires_At > utcNow()`; `Update_item` sets `Is_Verified:true` (single use); `Update_item_Attempts` on failure.
- `Get_Otp_Directory_User` (`Email eq … and Status eq 'active'`); `Condition_Otp_Known_User` else `{ ok:false, reason:'NOT_A_DIRECTORY_USER' }`.
- **Proof mint**: `Compose_Otp_Proof_Token` = `guid()`, `Compose_Otp_Proof_Expires` = `addHours(utcNow(), 4)`, `Create_Otp_Proof` → `DGO_SessionProofs` (`444102d6-…`) with `Title`=token, `Email`, `Purpose:'internal-session'`, `ExpiresAtUtc`, `CreatedAtUtc`, `Consumed:false`.
- Response: `{ ok:true, valid:true, token, expiresAt, claims:{ preferred_username, email, name, role (directory Role, Choice-safe) } }`; 401 for invalid/expired code.

**Every governed internal flow** (SINGLE_ASSIGNMENT, BULK_ASSIGNMENT, FETCH_ALL, DYNAMIC_ACTIONS, EMAIL_RELATED_TASK, REFERENCE_DATA, GET_DOCS, FETCH_EMAIL_ATTACHMENTS, EMAIL, the AI keys, ACTIVITY_LIFECYCLE, USER_ADMIN) carries the caller gate generated by `scripts/build-identification-phase4.mjs` `callerGate()`:

1. `Get_<tag>_Proof_Mode` reads Flow Configuration `IDENTITY_PROOF_REQUIRED`.
2. `Compose_<tag>_Proof_Token` reads `X-DGO-Proof` / `x-dgo-proof` / `Authorization` / `authorization`, strips `Bearer `.
3. `Get_<tag>_Proof` looks the token up in the proof ledger: `Title eq token and Consumed eq 0 and Purpose eq 'internal-session'`, then checks `ExpiresAtUtc` with `ticks()`.
4. `Compose_<tag>_Identity`/`Gate_Caller`: switch `'true'` → caller is the proof's address or nobody (401); otherwise proof if valid else `userEmail` (Bulk also `requestedBy`). Role is re-read from `DGO_UserDirectory`; route/permission check → 403 (single-assignment, bulk-assignment; `*` and `bulk:assign` pass). REFERENCE_DATA and GET_DOCS enforce the caller only.
5. Run records redact the proof header (`redactProofHeader`, ITEM-89).

SCAN_INTAKE takes its actor from a valid proof, never from a principal header or the body (ITEM-85; `auth-posture` tests).

#### A1.12 SharePoint lists involved

| List | Site | Role |
|---|---|---|
| `DGO_UserDirectory` (`3d591f5b-…`) | DGO_ECM_GOVERNANCE | Identity, `Role` and `Status` Choice columns, `AccessScope`, `PilotCohort` |
| `DGO_SessionProofs` (`444102d6-…`) | DGO_ECM_GOVERNANCE | Internal proof ledger: `Title`(token), `Email`, `Purpose`, `ExpiresAtUtc`, `CreatedAtUtc`, `Consumed`; index on `Title` (`docs/reference/internal-proof-ledger.json`, PROVISIONED) |
| OTP_Transactions (`9421d473-…`) | NITDADGO-EAAACTIVITYTRACKING | Codes: `Title`, `OTP_Code`, `Expires_At`, `Is_Verified`, `Attempts` (ITEM-39) |
| Flow Configuration (`9bc168c3-…`) | NITDADGO-EAAACTIVITYTRACKING | `IDENTITY_PROOF_REQUIRED` switch, allowed origins |
| `DGO_RoleCatalogue` | DGO_ECM_GOVERNANCE | Seeded from `config/rbac.config.js` (`npm run seed:roles`) |

#### A1.13 Contract documents (in `repository/docs/`)

- `architecture/AUTHENTICATION_CONTRACT.md` — postures table; server obligations §2 (verify proof, identity from proof, role from directory, ignore `userEmail`, authorise per action, idempotency, audit); §2a approved lifetimes (code 10 min, one use, six wrong guesses → 429, resend 1/60 s and 5/h; proof 4 h internal, 30 min portal; ±120 s skew); two unbuilt items: a **renew** action on `OTP_VERIFY` and `proofsValidFrom` on `DGO_UserDirectory` for revocation.
- `folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md` — request/response shapes, obligations, directory via `FETCH_ALL users`, `USER_ADMIN` role writes, order of work.
- `PLATFORM.md` §3 — proof is a ledger row because Power Automate has no signing function; revocation is `Consumed`.
- `deployment/PLATFORM_ACCESS_RUNBOOK.md` Part H — switching on is `auth.enabled: true` plus the flow obligations.

#### A1.14 Tests

| Test | Covers |
|---|---|
| `tests/auth-posture.test.mjs` (`npm run test:auth`; not in `test:node`) | Both postures: no header/`userEmail` kept while inert; enforced blocks anonymous calls, attaches `X-DGO-Proof`, drops `userEmail`, ignores local tampering, denies unmapped roles, no proxy; SCAN_INTAKE actor rules; portal intake anonymous |
| `tests/identity-directory.test.mjs` | Directory normalisation, fail-open closed (`users: []` → unregistered), disabled users refused |
| `tests/otp-protocol-contract.test.mjs` (`npm run test:otpprotocol`) | Client body shape vs deployed flow definitions, `flatPayload`, field names |
| `tests/otp-verify-deployed.test.mjs` | The tenant export of IP_OTP_VERIFY holds its hardening |
| `tests/proof-identity.test.mjs` (`npm run test:proofidentity`) | Every Phase-4 package derives the caller from the proof ledger (unconsumed, unexpired, Purpose), something mints it, expiry read once |
| `tests/flow-identity-crosswalk.test.mjs`, `tests/identification-phase4.test.mjs` (in `repository/`) | Package integrity, proof header redaction |
| `tests/deeplinks-signin.spec.js`, `tests/boot-data-deeplinks.spec.js`, `tests/notice-links.spec.js` (Playwright, `DGO_DEV_AUTH=1`, code `000000`) | Sign-in before draw, proof persistence/expiry/migration, multi-tab, sign-out, links through sign-in |
| Dev server `scripts/dev/endpoints.mjs` | Mocks `OTP_GENERATE`/`OTP_VERIFY` (`DEV_OTP='000000'`, 10-min code, 1-h proof) and the step-up OTP |

#### A1.15 Observed divergences between contract and released flow packages

| Item | Contract §2a | IP_OTP_* package |
|---|---|---|
| Code validity | 10 minutes | 5 minutes (`addMinutes(utcNow(),5)`) |
| Attempt cap | 6 wrong guesses → 429 | ≥ 5 → 429 |
| Code storage | hashed (IDENTITY.md) | plaintext `OTP_Code` column |
| Resend rate limit | 1/60 s, 5/h per address | no rate-limit action in OTP_GENERATE |
| Enumeration | unknown address answered identically | unknown address → `Condition_…_Known_User` false branch (different response) |
| Renewal | renew action required | not present |
| Revocation | `proofsValidFrom` | only `Consumed` flag |

#### A1.16 Governance state

Register (`repository/docs/deployment/PRODUCTION_READINESS_REGISTER.json`): G-04 (server-side enforcement) RESOLVED by packages behind `IDENTITY_PROOF_REQUIRED`; ITEM-38/39/43/44/54/55/64/76/82/85/89 RESOLVED; ITEM-56 (OTP allow-list row) ACCEPTED, applied by operator. Root `README.md` item 2 and `APPROVED_AUTHORITY_REVIEW.md` keep authentication **open**: no evidence that the switch is set or that server-side identity and record-level authorization are proven on the five surfaces; the NO-GO stands.

### A2. NITDA Document Portal (`document-portal/`)

#### A2.1 Design summary

| Property | Value |
|---|---|
| Accounts / sessions | None. A tracker is identified by **tracking reference + e-mail** |
| Proof of address | Optional 6-digit e-mailed code: `VERIFY` (`CG_Portal_Verification_Endpoint` `ba47f79b`) then `VERIFY_CONFIRM` (`CG_Portal_Verification_Confirmation_Endpoint` `f96e3448`) returns a single-use opaque `verification` proof (two GUIDs, hyphens stripped) |
| Who decides | The flow: client reacts to `403 {"error":"verification_required"}` from `STATUS`/`SUBMISSION`; `STATUS` is switched by Flow Configuration `STATUS_REQUIRE_VERIFICATION` |
| Storage | **No proof is ever persisted**; closure variable `proof` in `track.js`, cleared after a found result (single use). `localStorage` holds only records/history/outbox under `nitda.portal.*.v2` |
| Endpoint keys | `window.PF_CONFIG.endpoints`: `SUBMISSION`, `UPLOAD`, `SUPPORT`, `VERIFY`, `VERIFY_CONFIRM`, `STATUS`, `WRITEBACK` (`js/data.js` 42-43) |
| Headers | `Content-Type`; `X-Upload-Ticket` on `PUT UPLOAD`; `Authorization: Bearer <vault invoke token>` only in Vault mode. No other auth header |
| Support | `SUPPORT` carries no authentication |

#### A2.2 Client (`js/core.js`, `js/track.js`, `js/submit.js`, `js/support.js`)

- `PF.intake.verifyRequest(email)` → `VERIFY` `{ email }`; 429 → `too-many-requests`; success `{ ok, sent: data.sent===true, expiresAt }`.
- `PF.intake.verifyConfirm(email, code)` → `VERIFY_CONFIRM` `{ email, code }`; any non-ok → `verification-failed`; success `{ ok, verification, expiresAt }`.
- `PF.intake.status(referenceId, email, opts)` → body `{ referenceId, verification }` when a proof is held, otherwise `{ referenceId, email }` (never both); 200 → `found`, 403 `verification_required` → `verification-required`, 404/400 → uniform `denied`, 429 → `unavailable`.
- `PF.intake.submit` adds `verification` on retry after 403; `PF.intake.writeback` `{ referenceId, verification, action (respond|note|withdraw), body }` requires a fresh proof per action (`obtainWritebackProof`/`runWriteback`).
- `track.js`: `lookup()` requires id length ≥ 6 and an e-mail regex; `requireVerification()` runs send → 6-digit check → confirm → re-lookup; `denied()` shows one uniform message; `keepUrl()` rewrites the address to `?id=<id>` and adds `&email=` **only when no proof was used** (README 154-156: a verified lookup must not leave the address in URL, history or Referer).
- `verificationAvailable()` needs both `VERIFY` and `VERIFY_CONFIRM`; `demoMode()` when `SUBMISSION` is empty. The retired staff console key `sessionStorage['nitda.portal.admin']` is removed on load.

#### A2.3 Contracts (`repository/document-portal/README.md`, `repository/docs/folio-Master-Flows-and-Endpoints/deployment/sharepoint/PORTAL_DATA_CONTRACT.md`, `DECISIONS.md` D8/D9/D14)

- `VERIFY`: rate-limit per address and per source; `sent` must be truthful; code to Portal OTP Codes list (`OTP_Code` plaintext per SC-003, `Expires_At`, `Attempts`, `Consumed`, `SourceIp`).
- `VERIFY_CONFIRM`: compare, expire and single-use; proof to `Portal Verification Proofs` (`Email`, `Purpose:'portal-verification'`, `ExpiresAtUtc` 15 min per contract, `Consumed`); consumed on match and on the fifth failed attempt.
- `STATUS`: byte-identical 404 for unknown reference and wrong e-mail; allow-listed projection; verified call must reject any body containing `email`; expired/replayed proof → same 404.
- `WRITEBACK`: `verification` is the only authentication; 401/403 for missing/invalid/expired/consumed proof.
- `_RATE_LIMIT`: bucket `Portal Rate Limits/Title = <ENDPOINT>_IP:<X-Forwarded-For>`, fixed 60-minute window; `VERIFY` 5/h, `VERIFY_CONFIRM` 10/h.
- Proof lifetime 30 min for the public portal (AUTHENTICATION_CONTRACT §2a).

#### A2.4 Deployed flows (`repository/docs/folio-Master-Flows-and-Endpoints/contracts/deployed/`)

| Flow | Observed behaviour |
|---|---|
| `CG_Portal_Verification_Endpoint` | buckets `VERIFY_IP` ≥10/h and `VERIFYADDRESS_EMAIL` ≥5/h; code = 6 chars of a GUID; expiry `addMinutes(utcNow(),10)`; ACAO from allowed-origins list; undelivered/server-error ops alerts |
| `CG_Portal_Verification_Confirmation_Endpoint` | bucket `CONFIRM_IP` ≥20/h; lookup `Email eq … and Consumed eq 0`; state `none|expired|locked(≥5)|match|mismatch` by plain `equals(trim(OTP_Code), code)`; proof `concat(guid,guid)` stripped; **proof expiry 30 min (contract says 15)**; error `verification_failed` |
| `CG_Portal_Status_Check_Endpoint` | bucket `STATUS_IP` ≥30/h; `STATUS_REQUIRE_VERIFICATION` switch; 403 `verification_required`; proof `Title eq '<proof>' and Consumed eq 0`; both not-found and proof-error paths answer `not_found` |
| `CG_Portal_Writeback_Endpoint` | `WRITEBACK_IP` ≥20/h; proof filter `Consumed eq 0 and Purpose eq 'portal-verification'` |
| `CG_Submission_Endpoint` | `SUBMISSION_IP` ≥20/h; reads a proof `Consumed eq 0`; export contains no `verification_required` string |
| `CG_Portal_Support_Endpoint`, `CG_Upload_Endpoint` | `SUPPORT_IP` ≥10/h, `UPLOAD_IP` ≥60/h |

Dev stand-in `scripts/dev/intake.mjs`: `DEV_VERIFY_CODE='123456'`, code 10 min, HMAC-signed proof 30 min, uniform 404, no `WRITEBACK` route.

#### A2.5 Vault mode (`repository/docs/architecture/VAULT_ADOPTION.md`, absent from Repo_root)

Required for the Portal before public launch. `PF.CONFIG.vault = {url, token}` switches every call to `<url>/invoke/portal.<key-lowercased, _→->` with `Authorization: Bearer <invoke token>`; the invoke token is "not treated as a secret", so each flow keeps its anonymous-caller obligations. Done: client mode, aliases (`portal.submission|upload|support|verify|verify-confirm|status|writeback`), CORS, PUT pass-through, per-visitor rate limit. Open: a deployed Vault, the seven aliases registered, `npm run package` refusing direct URLs (not implemented), a portal CSP/`.htaccess` naming the Vault (file absent).

#### A2.6 Tests

`tests/portal.spec.js` (uniform denial, 403 → code round trip with `email` absent from the verified body and from the URL, no-proof path, unavailable/fallback, no tracking id or e-mail leaked on pages), `tests/hardening.test.mjs` D-C2 block (proof/email exclusivity, `proof = null`, proof never in storage), `tests/portal-vault-mode.test.mjs`, `tests/portal-outbox.test.mjs`, `tools/flow-capsule/tests/test_flowcapsule.py` (portal path through the Vault). `tests/portal-wiring.test.mjs` §7 needs registers absent from Repo_root.

#### A2.7 Observed divergences

Proof expiry 30 min in the flow vs 15 min in `PORTAL_DATA_CONTRACT.md`; plain-equality code compare (documented as D9, WDL has no constant-time compare); codes stored in plaintext (SC-003); `VERIFY_IP` limit 10/h vs contract 5/h; `CG_Submission_Endpoint` export carries no `verification_required` branch; no Referrer-Policy or CSP file for the portal in either tree; `track.js` 353/357 and `support.js` 251/257 interpolate `rec.id`/`t.ref` into `innerHTML` without `PF.esc`.


### A3. DGO Correspondence Mailer (`mailer/`)

#### A3.1 Design summary

| Property | Value |
|---|---|
| Identity | Operator e-mail + 8-digit mailed code via flow `DGO_MAIL_AUTH` (endpoint key `MAIL_AUTH`) |
| Session | Opaque 64-hex token, 12 h, held in `sessionStorage['dgo-mailer.session']` as `{ token, email, name, role, expiresAt }` |
| Transport | JSON **body field** `sessionToken` (no header); `credentials:'omit'` |
| Gate | Every route is behind sign-in whenever `settings.endpoints.MAIL_AUTH` is set (`app.js` `needsSignIn()`); with it empty the mailer runs without sign-in |
| Admin path | `operatorKey` (flow-held secret, `__SET_OPERATOR_KEY_AFTER_IMPORT__` placeholder) — used by setup only; the browser strips and never stores it |
| Lists | `DGOMailOperators` (Title = e-mail, `DisplayName`, `Active`, `Role`), `DGOMailSessions` (Title = challengeId then token; `Email`, `Code`, `CodeExpiresAt`, `Attempts`, `Token`, `TokenExpiresAt`, `Status` ∈ Pending/Locked/Active/Revoked/RateLimit) |

#### A3.2 Client

- `js/views/signin.js` — two stages (`email` → `code`), `pattern="[0-9]{8}"`, buttons Sign in / Send a new code / Use a different address; on `CODE_EXPIRED` returns to the email stage; on success `app.afterSignIn()` copies `{name,email}` into `settings.operator` and runs `syncNow()`.
- `js/session.js` — `requestCode(settings,email)` → `{ operation:'requestCode', payload:{ email } }` returns `{ challengeId, expiresAt, message }`; `verifyCode(settings, challengeId, code)` → `verifyCode` returns `{ token, expiresAt, email, name }`, then `whoAmI` with `sessionToken` returns `{ email, name, role, via, expiresAt }`; `signOut()` clears locally first then posts `signOut`. `Session.get()` drops an expired session; `useSessionToken()` registers the token with `api.js`. No renewal exists.
- `js/api.js` — `callFlow()` injects `sessionToken` into the body unless `operatorKey`/`sessionToken` already present; a `SIGN_IN_REQUIRED` error dispatches `dgo-mailer:sign-in-required`; `app.js` clears the session only if the event's token equals the current one. `sender.js` pauses a batch on `SIGN_IN_REQUIRED` (`waitingForSignIn`) and retries on `SIGN_IN_CHECK_FAILED`. `sync.js` gates shared-data calls on `Session.active()`.
- Settings: `js/settings.js` precedence DEFAULTS < `config.js` (`window.DGO_MAILER_CONFIG`) < `config.local.js` (`window.DGO_MAILER_CONFIG_LOCAL`, git-ignored) < saved settings; legacy `localStorage['dgo-mailer.operatorKey']` is purged. "Erase everything" clears `sessionStorage`.
- CSP `connect-src` restricts calls to `*.logic.azure.com`, `*.powerplatform.com`, loopback.

#### A3.3 Flow `DGO_MAIL_AUTH` (`mailer/flows/definitions/DGO_MAIL_AUTH.definition.json`)

- `Compose_Config`: `codeMinutes` 10, `maxCodeAttempts` 5, `sessionHours` 12, `codesPerWindow` 5, `codeWindowMinutes` 10, `allowedOrigin` `https://folio-platform.page.gd`.
- Guard order (identical block in all seven flows): `Condition_Refuse_Unconfigured` (503 `NOT_CONFIGURED`) → `Condition_Check_Session` (`DGOMailSessions` by `Title eq token`, filter `Status eq 'Active' and Token eq token and TokenExpiresAt > utcNow()`, then `DGOMailOperators` `Title eq email and Active eq 1`) → `Compose_Caller` (`via` admin-key/session/none, role from operator row) → `Condition_Refuse_Unauthorised` (401 `SIGN_IN_REQUIRED`, 503 `SIGN_IN_CHECK_FAILED`).
- `requestcode`: `challengeId` = two GUIDs stripped (64 hex), `code` = `rand(10000000,100000000)`, expiry +10 min; operator must exist and be Active; rate row `rate:<email>` capped at 5 per window; challenge row written `Status:'Pending'`; `Send_Code` (Office 365, template `ML-Sign-In-Code`, code in body only, Importance High); **always 200 with a challengeId** ("If this address belongs to a mailer operator, a sign-in code has been mailed"), so unknown addresses are not enumerable; cleanup of Revoked/expired rows.
- `verifycode`: row by `challengeId`; 401 `CODE_EXPIRED` for missing/non-Pending/expired/≥5 attempts; attempt counted with ETag `IF-MATCH` (429 `TRY_AGAIN` if not written); `Locked` at 5; string equality on the code → 401 `CODE_INVALID` "N try(s) left"; `Compose_Token` (64 hex, +12 h); `SP_Activate_Session` re-titles the row to the token, `Status:'Active'`, blanks `Code`; responds `{ token, expiresAt, email, name }`.
- `signout` → `Status:'Revoked'`; `whoami`; `listoperators`/`upsertoperator` admin only (403 `FORBIDDEN`).
- Open operations: `verify`, `healthcheck`, `requestcode`, `verifycode`. The other six flows (`DGO_MAIL_SEND|LOG|DIRECTORY|TEMPLATES|PROVISION|DATA`) open only `verify`/`healthCheck`; `DGO_MAIL_SEND` logs `OperatorEmail` from the session, not the request.
- Setup (`setup.cmd` / `tools/setup.mjs`) signs in to Microsoft by device code to create the flows and lists (PLAN.md T3, 2026-10-22: `DGO_MAIL_AUTH` updated to Mailer 2.1.5).

#### A3.4 Tests

`tests/mailer.test.mjs` (guard order, open-operation sets, session filter, ETag attempt counting, mock journey: stranger gets same answer, code once only, five tries lock, admin-only ops, disable ends session), `tests/mailer.e2e.mjs` (sign-in first, no key in browser, erase signs out), `tests/mailer-setup.test.mjs` (lists provisioned private), `tests/email-fragments.test.mjs` (code in body only). Not covered: `api.js` `sessionToken` injection, the stale-token guard, `sessionStorage` expiry logic.

### A4. Folio Central Administration Centre (`tools/admin-centre/server.py`, standard library)

| Control | Implementation |
|---|---|
| Binding | `127.0.0.1:8844` (`config/settings.json`); refuses non-loopback unless `FOLIO_ADMIN_ALLOW_NONLOOPBACK=1`; Host allow-list (`FOLIO_ADMIN_ALLOWED_HOSTS`); `Origin` must equal `Host` on body routes and `/api/launch` |
| Bootstrap token | `secrets.token_urlsafe(32)` in `config/admin.token` (0600); `Principal('super_admin')`; no expiry; rotated via `POST /api/access/rotate-bootstrap` (`access.manage`) |
| Operator tokens | `fac_` + `token_urlsafe(32)`, SHA-256 digest stored in `operators` table, plaintext returned once; roles `operations|incident_manager|change_manager|platform_admin|auditor|viewer` (never `super_admin`); rotate/disable/enable; no expiry; actor pinned to operator name |
| Bearer handling | `Authorization: Bearer …` exact prefix; `hmac.compare_digest`; 20 failures/IP/300 s → 429; 401 JSON body; unauthenticated routes only `/healthz`, static, `/sections/*`, `/modules/*`, `POST /api/launch` |
| Launch link | `scripts/folio-admin.mjs` writes `config/launch.json` `{codeSha256, expiresAt (10 min), actor}` and opens `http://127.0.0.1:8844/#launch=<code>`; `redeem_launch` compares SHA-256 constant-time, caps 15 min, single use, returns the bootstrap token |
| Permissions | `PERMISSIONS` map (`read`, `alert.*`, `incident.*`, `change.create/decide/progress`, `vault.verify`, `tenant.connect/sync`, `flow.operate/test`, `audit.verify`, `access.manage`, …); `App.require`; denials audited then 403 |
| Maker–checker | checker ≠ maker; only the named checker may Approve/Reject (`change.decide`); cancel by maker or super_admin; notes required on Rejected/Verified/RolledBack |
| Microsoft sign-in | Device code with public clients `1950a258-…` (Azure PowerShell) then `9cee029c-…` (Power Platform CLI); scope `https://service.flow.microsoft.com//.default offline_access openid profile`; tenant from `FOLIO_ADMIN_TENANT` or env id `Default-ca6a4b3f-…`; user-scoped flow API paths only; access token in memory; refresh token persisted only when `FOLIO_MS_SESSION` names a file (0600, schema `folio-ms-session/1`); refresh 120 s before expiry; routes `/api/tenant[/sign-in|/sign-out|/sync]` |
| Audit | `audit` table hash chain `event_hash = sha256(event_id|actor|action|target|reason|result|correlation_id|previous_hash|created_at)`, genesis `GENESIS`; `GET /api/audit/verify`; evidence export `folio-admin-evidence/v2` |
| Web UI token | `static/app.js`: `sessionStorage['folio.admin.token']` and `['folio.admin.actor']` (never `localStorage`, no cookie); removed on Lock, idle timeout (15 min default) and any 401; CSP `connect-src 'self'`, `frame-ancestors 'none'` |
| Outbound | To Power Automate `Authorization: Bearer <MS token>`; to Vault admin routes `Bearer <vault admin>`; to Vault `/invoke` `Bearer <invoke>` **plus** `X-DGO-Proof: Bearer <Folio OTP proof>` for "Test a flow" (read-only keys only; proof never stored) |

Tests: `tools/admin-centre/tests/test_admin_centre.py` (launch code once/expired/cross-origin, every route needs token, Host/Origin refusal, rate limit, maker–checker, operator roles, bootstrap rotation, audit tamper detection, loopback refusal), `test_flow_owner.py` (device sign-in, fall-through on refused app, session persistence), `tests/admin-centre.test.mjs` (static invariants), `tests/admin-centre.spec.js` (Playwright). Note: `npm run test:node` does not run `test:admincentre`, `test:capsule` or `test:folioadmin`, although `tests/admin-centre.test.mjs` line 174 asserts it does. `docs/admin-centre/` is referenced but absent from the tree.

### A5. Folio Vault / Flow Capsule Registry (`tools/flow-capsule/app/flowcapsule.py`)

- **Tokens**: on first start two bootstrap tokens `fc_` + `token_urlsafe(32)` (`bootstrap-admin` role `admin`, `bootstrap-invoke` role `invoke`), stored as salted PBKDF2-HMAC-SHA256 (310,000 iterations) in `tokens(name, role, salt, digest, enabled)`; plaintext written once to `<FLOWCAP_DATA_DIR>/bootstrap-credentials.json` (0600). No expiry, no issuance or rotation API.
- **Check**: `Authorization: Bearer …` → `Store.auth` (`hmac.compare_digest` over enabled tokens); admin route with invoke token → 403; missing/wrong → 401. `/health` is open.
- **Routes**: `/admin/flows` (list, register/rotate, versions, verify, rollback, enable, disable) need `admin`; `POST|PUT /invoke/{alias}` need `invoke`.
- **Alias → signed URL**: `capsules(alias, version, original_url, fingerprint=sha256(url), flow_identity, environment, contract_version, …)`; registration runs `inspect` (https, host suffix `.api.powerplatform.com|.logic.azure.com`, path `/triggers/manual/paths/invoke`, exactly one each of `api-version`, `sp`, `sv`, `sig`) then a live identity handshake `{"_platform":{"operation":"verify","correlationId"}}` requiring `verified, flowIdentity, environment, contractVersion`; invoke re-checks the fingerprint, forwards only `X-DGO-Proof` and `X-Upload-Ticket`, never `Authorization` or cookies; listings and `maskedUrl` never expose `sig`/`sp`/workflow id. Rate limit per token, IP and alias (`FLOWCAP_RATE_LIMIT_PER_MINUTE` 120); CORS only on `/health` and `/invoke/*` for `FLOWCAP_ALLOWED_ORIGINS`. Binding `FLOWCAP_HOST` defaults to loopback but is not enforced in code (README directs loopback or TLS). Audit table is plain rows written on activate/enable/disable/rollback only; `invoke` writes none despite README and `capsule-client.js` claiming per-invocation audit.
- **Workspace client** `core/capsule-client.js`: Admin Suite "Capsule registry" only; `connect({baseUrl, token})` allows plain http only for loopback; token held in module memory, never persisted; **no `invoke`** by design. Alias naming `<system>.<key>` (`runtime.fetch-all`, `portal.submission`, `mailer.*`).
- **Portal Vault mode** `document-portal/js/core.js` lines 357-381: with `PF.CONFIG.vault = {url, token}` every endpoint goes to `<url>/invoke/portal.<name>` with `Authorization: Bearer <invoke token>` (the invoke token sits in the page). `docs/architecture/VAULT_ADOPTION.md` is referenced but absent.
- Tests: `tools/flow-capsule/tests/test_flowcapsule.py` (inspect/mask, atomic storage, header forwarding, CORS, upload, rate limit), `tests/admin-suite.test.mjs` 576-618 (client invariants), `tests/portal-vault-mode.test.mjs`.

---

## Part B — Deep links

### B1. Design summary (Workspace)

| Property | Value |
|---|---|
| Spec | `repository/docs/architecture/PLATFORM_ACCESS_SPEC.md` §8a, requirements DL-1 … DL-5 |
| Parser | `core/deeplink-parse.js` (pure, testable) over the allow-list in `config/deeplink.config.js` |
| Resolver | `core/deeplink-resolver.js` → `State.deepLinkContext`, then `Router.go/render` |
| Link format | Query parameters on the Workspace root, never a `#/route` (the host's browser check drops the fragment, release 41) |
| Production base | `https://folio-platform.page.gd/` (`DeepLinkConfig.productionBase`, owner 2026-10-19; previously `folio-gateway.rf.gd`, `taskack.page.gd`) |
| Audit | `scripts/audit-deeplinks.mjs` → `DEEPLINK_AUDIT.md` (`npm run deeplinks:audit`) over the deployed flow exports |

### B2. Accepted parameters (`config/deeplink.config.js`, first match wins)

| Parameter | Context key | Route | Action | Notes |
|---|---|---|---|---|
| `TaskID`, `taskId`, `ACK`, `AssnPID` | `taskId` | `acknowledgment` | `acknowledge-task` | legacy acknowledgement shapes |
| `item` | `taskId` | `acknowledgment` | `acknowledge-task` | single assignment notice `?item=2109&ref=TASK-2109` |
| `items` (list, max 50) | `taskId` (+ `taskIds`) | `acknowledgment` | `acknowledge-task` | bulk assignment `?items=2109,2110&batch=…` |
| `DGOPID`, `ITEMID` | `referenceId` | `lookup` | `open-document` | incoming-document notices |
| `portal` | `portalRef` | `correspondence` | `open-portal-submission` | `?portal=<reference>` or `?portal=all` |
| `notice` (+ `record`) | `notice` | `admin-suite` | `open-notice` | key must be in `config/notice-links.config.js` |
| `USERSUPPORT`, `support` | `support` | `assistant` | `open-support` | |
| `ref`, `referenceId` | `referenceId` | `lookup` | `open-document` | `ref=TASK-n` is re-routed to acknowledgment (`taskRefPattern /^TASK-(\d+)$/i`) |

- `pathRoutes`: `acknowledge.html`, `index_bulk.html` → acknowledgment; `support.html` → assistant. The forwarder pages `acknowledge.html`, `support.html`, `index_Bulk.html` do `location.replace('./index.html?…&page=<name>' + hash)` so flows are repointed by host only.
- `preserveQueryParams`: `record, batch, title, email, name, source, returnTo, batchId, trackingId, actorEmail, actorName, userEmail, userName, staffEmail, displayName, persona, role, department, unit, phone` ride into `deepLinkContext` (bounded to 256 chars, `MAX_PARAM_LENGTH`).
- `paramsFrom()` merges `?search` and a `#/route?x=1` hash (search wins).

### B3. Resolution and consumption

- `resolveInitial()` (boot, after shell mount): parses `location.href`; a per-tab `sessionStorage['dgo.deeplink.resolved']` key stops a reload from re-resolving the same link once the officer has moved on; `apply()` **replaces** (never merges) `deepLinkContext` with `{ …context, route, action, matchedParam, resolvedAt, source:'deeplink-html' }`, sets `selectedId`, audits `audit:deeplink-resolved`, writes a `ReceiptLedger` row `deeplink-resolved` for acknowledgement links, then `Router.go(route)` (or `Router.render()` when already there).
- `openRef(ref)` (DL-3): the notification bell's **Open** button (`shared/shell.js` line 324) routes through the same parser.
- Consumers mark `openedAt`/`recordPageOpenedAt` and audit `audit:deeplink-opened`: `modules/acknowledgment.js` (`findSelected`, "Opened from your link · item …", loading/not-loaded banners), `modules/lookup.js` (`findLinkedRecord` over activities/tasks/emails/comments/approvals by id or referenceId), `modules/correspondence.js` `openPortalLink()` (Portal submissions tab, linked row first and marked), `modules/admin-suite.js` `takeNotice()`/`noticePanel()` (SharePoint record/list buttons from the allow-list; unknown key opens nothing), `modules/inbox.js`, `shared/record-page.js`, `core/acknowledgement-service.js` (actor and task from context), `modules/operator-hud.js` (inspector).
- `core/router.js`: `path()` strips `?…` after the route; `redirectFor()` (`core/route-redirects.js`, UX-401) sends retired routes to their successors keeping the query and opening the selected record (`dgo:open-linked-record`); access denial rendered per `accessDenial()`.
- Sign-in interplay (DL-1): boot acquires the proof before the resolver runs and the address bar is untouched, so a link opened while signed out lands on its task after the OTP round trip; the welcome tour is suppressed when a link is present.

### B4. Link builders (DL-2, DL-5)

`buildDeepLink(base, { taskId | referenceId })` writes `?TaskID=` or `?ref=` on `productionBase` and **refuses a localhost base**. Used by `core/staff-notice-service.js` `recordUrl()` (staff notices RN-*), `core/report-email-service.js` (report rows), `core/support-service.js` (support requests). `scripts/platforms.config.mjs` carries `prodUrl` per platform (`folio-platform.page.gd/`, `folio-portal.page.gd/`, `folio-platform.page.gd/mailer.html`); `platformHref()` in the shell hides local-only tools on the published host.

### B5. Flow-side links (backend)

- `DEEPLINK_AUDIT.md` (generated): 9 link actions in 3 flows reach inboxes (`DGSO INCOMING AI PROCESSING` `APP_FAST_TRACK_LINK`/`Set_variable_Deeplink[_2]` with the stuck `veggie` text; `IP_Create__Task__for_received_Email_Endpoint` and `Single_Task_Assignment` `Compose_Task_Acknowledgement_Link`/`Compose_SupportLink` on `taskack.page.gd`, and the single-task e-mail's **Acknowledge Receipt**/**Support Access** buttons with `href=""`). ITEM-87 (RESOLVED) records releases 14/15 moving task e-mail links to `folio-platform.page.gd`; the Phase-4 `Single_Task_Assignment` package carries `item=<ID>` plus the Task Reference in `ref=` and `Compose_Config_BaseURL` corrected from a Markdown link.
- `NOTICE_LINKS.md` (owner direction 2026-10-20): ten staff e-mail templates now link to Folio instead of SharePoint lists: `?portal=<reference>` (CG_Submission_Endpoint, CG_Portal_Writeback_Endpoint), `?portal=all` and `?notice=portal-upload-tickets` (CG_Portal_Daily_Sweep), `?notice=portal-support-case&record=<ID>` (CG_Portal_Support_Endpoint), `?notice=http-flow-registry&record=<ID>` (five sends in `04 - GOV - Audit HTTP Flow Registry`, applied in tenant 2026-10-21 via `npm run gov04:update`), `?notice=portal-outbox-receipts` (AUTO_SCHEDULED_SWEEP), `?notice=http-flow-registry-exception&record=<ID>` (06 - GOV). `NoticeTargets` holds the SharePoint addresses (`DGO_HTTPFlowRegistry`, `DGO_HTTPFlowRegistryExceptions`, `Portal Support Cases`, `Portal Upload Tickets`, `Portal Outbox Receipts`); `noticeRecordId()` accepts only `\d{1,9}`.
- Cross-platform: Admin Centre Portfolio cards link to the published Workspace/Portal/Mailer addresses (`PUBLISHED` in `server.py`); the Workspace "Other platforms" menu links to the Centre only on localhost. The Hub `/?to=<platformId>` forwarder (DL-4) is described in the spec; the Hub was retired into the Centre on 2026-10-22 and no `?to=` handling exists in the current tree.

### B6. Other platforms

- **Mailer**: reads no query parameters; hash routes only (`#/`, `#/letter/<id>`, `#/sent[/<id>]`, `#/addressees`, `#/settings[/<tab>]`; unknown → Home; every route behind sign-in when `MAIL_AUTH` is set). Its flows put no link to any Folio platform in any e-mail; the sign-in mail carries the code in the body only. Typed links are sanitised (`js/sanitize.js` `safeUrl`, `rel="noopener noreferrer"`).
- **Admin Centre UI**: hash routes `#/<view>[/<id>]` (`overview, portfolio, health, flows, alerts, incidents, changes, test, estate, configuration, audit, vault, console, packages, access, operations, help`), permission-gated fallback to overview, `#launch=<code>` (`^[A-Za-z0-9_-]{20,128}$`, replaced immediately), no query parameters. Hosted Estate Console reads `#<tab>`.
- **Vault**: no UI; alias in path only.
- **Portal**: see B7.

### B7. Document Portal deep links

| Page | Parameters | Handling |
|---|---|---|
| `track.html` | `id`, `email` | `track.js` 607-615: `id` upper-cased into `#trackId`, `email` into `#trackEmail`; auto-lookup only when both present; `lookup()` validates (id ≥ 6 chars, e-mail regex) |
| `support.html` | `id` or `ref`, `topic`, `email`, `feedback` | `support.js` 284-296: `topic` allow-listed via `topicOf()`; `#cref` checked at submit against `IDPAT = /^NITDA-[A-Z0-9]{5,12}$/` (rejects `NITDA-2026-217`-shaped registry references) |
| `submit.html` | `type` or `service` | accepted only when a key of `PF.CORRESPONDENCE_TYPES` |
| any | `folio-build` | written by the stale-build reload, not a route |

- Internal links: `submit.js` → `track.html?id=<ref>&email=<email>`; `track.js` → `support.html?ref=<id>&topic=…`; `support.js` → `track.html?id=…&email=…`; `home.js`/palette → `submit.html?type=<key>`. No hash routes.
- Flow-built links: base from Flow Configuration `NOTIFY_TRACK_URL`; `CG_Registry_Status_Notifier` (Acknowledged, Progress, ActionRequired, Approved, Declined, Withdrawn), `CG_Submission_Endpoint`, `CG_Portal_Daily_Sweep`, `AUTO_SCHEDULED_SWEEP` build `?id=<ReferenceId>&email=<lower SenderEmail>`; `CG_Portal_Writeback_Endpoint` builds `?id=` only.
- Service worker `sw.js` caches navigations keyed by full URL including query (so `track.html?id=…&email=…` is written to Cache Storage); `404.html` is static and reads no parameters; manifest shortcuts to the three pages. Values are set via `.value`, not `innerHTML`.
- Untested: `support.html`/`submit.html` parameter parsing, the `IDPAT` mismatch, SW caching of query navigations, the e-mail-bearing `trackLink`.

### B8. Tests

`tests/deeplinks.test.mjs` (`npm run test:deeplinks`; 63 assertions; the spec calls it "in the gate", but `Repo_root/package.json` `test:node` does not include it): resolver table and live shapes, `ref=TASK-n`, bounds and list cap, notice allow-list and SharePoint links, no catalogue e-mail links to SharePoint, `buildDeepLink`, bell path, production base, forwarders, audit counts vs runbook, every task-seeing role can open the Acknowledgment Queue, identity endpoints skip the sign-in gate, boot signs in before drawing, enforced actor is the signed-in identity. Playwright: `tests/deeplinks-signin.spec.js`, `tests/boot-data-deeplinks.spec.js` (every link type signed in/out, forwarder page, reload behaviour, new link redraws, first-time officer goes to the task), `tests/notice-links.spec.js`. `tests/gov04-notice-links.test.mjs` checks the GOV-04 rewrite.

---

## Part C — Variant folders (auth and deep-link files compared with `Repo_root/`)

| Folder | Auth/deep-link state |
|---|---|
| `repository/` | Byte-identical to Repo_root for every auth, deep-link, forwarder, shell, boot, mailer, portal and Vault file; holds the reference docs; lacks `tools/admin-centre/server.py` |
| `ECM_DOCS_DEV-4e3efeaa…` | Identical for all target files incl. `server.py`, `flowcapsule.py`, `DGO_MAIL_AUTH.zip`; no `document-portal/` |
| `NITDA-Folio-Source-31e80475`, `Folio-Workspace-Premium (1)`, `NITDA-Folio-Redesign-Final (1)`, `runtime_folio-platform-suite-1.0.2`, `01 Workspace and Mailer v2026.10.21-2` (build v2026.10.21-2, commit 31e80475) | Identical sign-in and deep-link logic (`auth.config.js`, `auth.js`, `otp-identity.js`, `current-user.js`, `rbac.config.js`, `deeplink.config.js`, `deeplink-parse.js`, `deeplink-resolver.js`, `link-guard.js`, forwarders, `sign-in-dialog.js`). Differ: no `core/route-redirects.js`; `router.js` without `redirectFor()` (links land on `#/acknowledgment`/`#/lookup`); `notice-links.config.js` lacks `http-flow-registry-exception`; `boot.js` home module differs, OTP sequence unchanged; `shell.js` UI chrome only. Source-only: `server.py` 2945 lines (console/workbench still listed), `DGO_MAIL_AUTH.zip` older definition whose sign-in e-mail **subject contains the code**; `deeplinks-signin.spec.js` expects old routes. 01/Redesign/`Gen` bundle `mailer.html` with sign-in modules identical to Repo_root's |
| `runtime_folio-platform-suite-1.0.3` | All 20 Workspace target files identical to current Repo_root; no mailer, tools or portal |
| `Commissioning-…-bghduo` (oldest) | Pre-hardening: `authorizationHeader` defaults to `Authorization`, no `identityEndpoints` exemption (sign-in impossible when enforced), proof in `sessionStorage`, no canonical role/status fold, narrower RBAC, `deeplink.config.js` without `item/items/portal/notice/pathRoutes/taskRefPattern/productionBase`, no `deeplink-parse.js`, no forwarders, no sign-in dialog or cross-tab watch, `flowcapsule.py` without header forwarding |
| `Rationalisation_pack`, `Gen` | No target files; `package.json` declares `test:otpdeployed`, `test:otpprotocol`, `test:deeplinks`, `deeplinks:audit` |

**Is authentication switched on in any deployed package?** No. Every `auth.config.js` defaults `enabled` to false; no package contains `config/config.local.js`; the delivered `config.local (1).js` (sha256 matches `runtime_*/PACKAGE_MANIFEST.json`, posture `demo`) sets only `endpoints`, with `OTP_GENERATE: ""` and `OTP_VERIFY: ""`; no `sig=` value is present in any runtime package. `RELEASE_REVIEW.txt` 115-117 records `auth-posture.test.mjs` passing inert 17/17 and the enforced half aborting on a missing `identification-phase3` fixture in `Repo_root`.


---

## Part D — Cross-cutting summary

| Surface | Identity mechanism | Credential held in browser | Transport to backend | Backend check | Deep-link entry |
|---|---|---|---|---|---|
| Workspace | OTP (`OTP_GENERATE`/`OTP_VERIFY`), inert by default | `localStorage['dgo.r11.identity.proof']` (4 h) when enforced; `localStorage` profile `userEmail` when inert | `X-DGO-Proof: Bearer <guid>` header (enforced) / `userEmail` body field (inert) | Proof ledger `DGO_SessionProofs` lookup + `DGO_UserDirectory` role, behind `IDENTITY_PROOF_REQUIRED` | `/?TaskID|item|items|DGOPID|ITEMID|ref|portal|notice|support=` + forwarder pages |
| Document Portal | Reference + e-mail, optional 6-digit code → single-use proof | None persisted (closure variable) | `verification` body field; `X-Upload-Ticket`; Vault `Authorization: Bearer <invoke>` | Portal proof ledger (`Consumed eq 0`, `Purpose 'portal-verification'`), per-IP/per-address rate buckets, `STATUS_REQUIRE_VERIFICATION` | `track.html?id=&email=`, `support.html?ref=&topic=`, `submit.html?type=` |
| Mailer | Operator e-mail + 8-digit code via `DGO_MAIL_AUTH` | `sessionStorage['dgo-mailer.session']` (12 h) | `sessionToken` body field | `DGOMailSessions` Active/unexpired + `DGOMailOperators` Active, same block in all seven flows | None (hash routes only) |
| Admin Centre | Bootstrap token / `fac_` operator tokens / `#launch=` one-time code; Microsoft device-code for flow owner | `sessionStorage['folio.admin.token']` | `Authorization: Bearer` | `hmac.compare_digest`, SHA-256 digests, loopback + Host/Origin checks, role permissions, hash-chained audit | `#/<view>/<id>`, `#launch=<code>` |
| Vault | `fc_` admin/invoke tokens | Workspace: module memory only; Portal: in page config | `Authorization: Bearer`; forwards only `X-DGO-Proof`, `X-Upload-Ticket` | PBKDF2 digests, alias allow-list, URL fingerprint, per-caller rate limit | None (alias in path) |

**Gate coverage.** `Repo_root/package.json` `test:node` includes `test:portalvault` but not `test:auth`, `test:deeplinks`, `test:proofidentity`, `test:otpprotocol`, `test:mailer`, `test:admincentre`, `test:capsule`, `test:folioadmin` or `test:adminsuite`; `tests/admin-centre.test.mjs` line 174 asserts the gate runs `test:admincentre` and therefore fails against the current `package.json`. Several auth suites in `Repo_root` depend on fixtures that only `repository/` holds (`contracts/deployed/`, `packages/identification-phase3`), which is why `RELEASE_REVIEW.txt` records the enforced half of `auth-posture.test.mjs` aborting on ENOENT.

**Reference documents absent from `Repo_root` but present in `repository/`:** `docs/architecture/AUTHENTICATION_CONTRACT.md`, `docs/architecture/PLATFORM_ACCESS_SPEC.md`, `docs/architecture/VAULT_ADOPTION.md`, `docs/folio-Master-Flows-and-Endpoints/contracts/IDENTITY.md`, `…/deployment/DEEPLINK_AUDIT.md`, `…/deployment/NOTICE_LINKS.md`, `…/packages/identification-phase4/`, `document-portal/README.md`. `docs/admin-centre/` is referenced by both trees and exists in neither.
