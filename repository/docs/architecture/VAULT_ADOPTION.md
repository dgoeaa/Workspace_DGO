# Decision: when Folio Vault stops being optional

**Status:** Decided; the portal's Vault mode is built and waits on a deployed Vault (step 1) · **Applies to:** Folio Vault (`tools/flow-capsule/`),
NITDA Document Portal, Folio Workspace

## Where things stand

Every application calls its Power Automate flows directly with a signed URL. That is the
approved architecture (see [`docs/PLATFORM.md`](../PLATFORM.md); the proxy history below was §6 of the former
`PLATFORM_DOCUMENTATION.md`, retired on 2026-09-24 and kept in git history). An authenticating proxy was built
and removed because a platform that needs a server kept alive before it can be used is one
that mostly is not used.

Folio Vault exists beside that model. It holds each signed URL and exposes an alias. Today
nothing routes through it: `core/capsule-client.js` administers a Vault (list, verify, enable,
disable, roll back) and deliberately has no `/invoke`. That is why it is optional.

## What direct calls cost

| | Direct call | Through the Vault |
|---|---|---|
| Where the signature ends up | Every browser | The Vault only |
| Revoke one endpoint | Rotate the signature and redeploy | Disable the alias, immediately |
| Version history and rollback | None | Retained, with re-verification |
| Record of each call | None | One audit row per invocation |
| Rate limit | Only what the flow implements | 120 calls a minute per visitor by default |

For the Workspace, the audience is staff and the cost is acceptable during the pilot. For the
Document Portal it is not: every configured URL is readable by any visitor, and each flow is
the only control that exists.

## Decision

1. **The Vault stays optional for the Workspace** while authentication is inert and endpoints
   are pilot-only.
2. **The Vault becomes required for the Document Portal before public launch.** The portal's
   `SUBMISSION`, `UPLOAD`, `SUPPORT`, `VERIFY`, `VERIFY_CONFIRM`, `STATUS` and `WRITEBACK` calls go
   to `/invoke/{alias}` instead of the flow URLs. WRITEBACK was added by the owner on 2026-10-20,
   so no portal flow is left called directly.
3. **The invoke token is not treated as a secret.** A token held in a browser can be read by
   anyone. What the Vault adds is instant disable, rate limiting, audit and rollback. It does not
   make the credential secret, so every flow keeps the anonymous-caller obligations in
   `document-portal/README.md`. Full secrecy requires the Vault to be called from a server or
   the flows to validate tokens (`docs/architecture/AUTHENTICATION_CONTRACT.md`).

## What is done, and what waits

Routing the portal through the Vault before a Vault is deployed would put the public channel
into a failure state with no working fallback. So the portal's Vault mode is built and switched
off: it turns on only when `config.local.js` carries a `vault` address and token.

Done on 2026-10-20:

- **Step 3.** `document-portal/js/core.js` calls `/invoke/portal.<name>` with the token when the
  `vault` block is filled (`portal.submission`, `portal.upload`, `portal.support`, `portal.verify`,
  `portal.verify-confirm`, `portal.status`, `portal.writeback`), and the direct URLs otherwise.
- **Step 4.** The Vault answers browser calls from the origins in `FLOWCAP_ALLOWED_ORIGINS`,
  on `/invoke` and `/health` only.
- **Uploads.** `PUT /invoke/{alias}` passes a file through unchanged with its `X-Upload-Ticket`.
- **Rate limit per visitor.** One visitor can no longer use up the shared token's limit.

Still open: step 1, then step 2, then step 5. At deployment the portal's Content-Security-Policy
(`document-portal/.htaccess`, `connect-src`) must also list the Vault's address, or the browser
blocks the calls.

The steps, in order:

1. A deployed Vault behind HTTPS with a service account and a backup routine
   (`tools/flow-capsule/README.md`, *Deploy on Linux*).
2. The seven portal flows registered as aliases and verified by the identity handshake.
3. The portal's endpoint layer (`document-portal/js/core.js`) taught a Vault mode: base URL plus
   alias per key, the invoke token in the `Authorization` header, and direct mode kept as the
   fallback while both exist.
4. CORS on the Vault for the portal's origin only.
5. `npm run package` refusing a public portal package that still carries direct flow URLs.

Owner for step 1 is IT operations; steps 2–5 are engineering once step 1 exists.
