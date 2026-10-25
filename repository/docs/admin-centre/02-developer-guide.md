# Admin Centre developer guide — version 2.1

**Status:** current, version 2.1. Its steps operate the Administration Centre only; estate commissioning steps live in [`docs/deployment/RUNBOOK.md`](../deployment/RUNBOOK.md).

Source structure, runtime, data access, extension, testing and secure maintenance for [`tools/admin-centre/`](../../tools/admin-centre/). Supersedes [`source-1.0/02_Admin_Centre_Developer_Guide.docx`](../governance/RETIRED_RECORDS.md).

## 1. Baseline

| Item | Value |
|---|---|
| Language | Python 3.9+ (standard library only) and browser JavaScript (ES5 syntax, evergreen-browser APIs, no build) |
| Server | `http.server.ThreadingHTTPServer`, HTTP/1.1 keep-alive |
| Database | SQLite 3, WAL, foreign keys on, `busy_timeout` 30 s |
| Client | `static/` — no framework, no bundler, no CDN |
| Brand | `static/brand/`, synced by `npm run brand:sync` from `styles/dgo-design-system/` |
| Authentication | Bootstrap bearer token + named operator tokens |
| Runtime URL | http://127.0.0.1:8844 |
| Installation | None. `npm ci` is needed only for the Playwright spec. |

## 2. Layout

```
tools/admin-centre/
  server.py                 the whole back end
  README.md
  config/settings.json      non-secret settings (committed)
  static/index.html         shell, lock screen, dialog and sheet hosts
  static/app.js             client: API, routing, views, forms, actions
  static/app.css            page styles — tokens only
  static/brand/             generated; do not edit
  scripts/start.sh          start from the package directory, umask 077
  scripts/verify.py         read-only installation verifier
  tests/test_admin_centre.py
  tests/test_flow_owner.py     the flow-owner connector against tests/fake_microsoft.py
  tests/fake_microsoft.py      stand-in identity platform and flow service; asserts on any /scopes/admin/ call
  # runtime state under $FOLIO_ADMIN_HOME (git-ignored when it is the package directory):
  config/admin.token  data/folio_admin.db  backups/  evidence/provisioning.json
```

## 3. Local development

```bash
npm run start:centre                      # state under the system temp dir; Vault token wired from the Capsule
# or, from the package directory:
python3 tools/admin-centre/server.py      # state beside the code, git-ignored
cat "$FOLIO_ADMIN_HOME/config/admin.token"   # or tools/admin-centre/config/admin.token
```

Useful environment variables: `FOLIO_ADMIN_FLOW_API` and `FOLIO_ADMIN_LOGIN` (point the flow-owner connector at `tests/fake_microsoft.py` on loopback — `python3 tools/admin-centre/tests/fake_microsoft.py 8931` then both `=http://127.0.0.1:8931`; production values are restricted to Microsoft hosts), `FOLIO_ADMIN_TENANT` (override the tenant derived from the environment), `FOLIO_ADMIN_HOME`, `FOLIO_ADMIN_PORT`, `FOLIO_ADMIN_MONITOR=0` (no background probes), `FOLIO_ADMIN_ACCESS_LOG=0`, `FOLIO_ADMIN_REPO` (where the registers are), `FOLIO_VAULT_ADMIN_TOKEN` or `FOLIO_VAULT_TOKEN_FILE`. `python3 server.py --check` provisions if needed and prints the chain and counts without serving.

## 4. Request flow

1. `Handler.dispatch` checks the Host header, then serves `/healthz` or a static file, or authenticates for `/api/`.
2. `App.authenticate` returns a `Principal` (role, name, kind) or raises 401/429.
3. The route table (`route_table`) matches path, then method (405 when only the method is wrong); writes check `Origin` and read a JSON body ≤ 64 KB.
4. Read routes check `perm` in the table. Write handlers validate their fields (`text`, `choice`), then call `App.mutate`.
5. `mutate` resolves actor, reason and correlation ID; audits `Denied` and raises 403 if the role lacks the permission; otherwise runs the handler's `work(con, actor, reason, corr)` inside `Store.tx()` and appends the audit event **in the same transaction**. An `ApiError` raised inside `work` (except 404) is audited `Failed` separately.
6. Responses carry the security headers; when a request is refused before its body is read, the connection is closed so keep-alive cannot desynchronise.

## 5. Data access rules

- A new connection per request (`Store.connect`); foreign keys on every connection.
- Writes only through `Store.tx()` — it takes the process write lock and `BEGIN IMMEDIATE`.
- Parameterised SQL for every value. Table and column names come only from constants in `server.py`.
- Never update or delete `audit` rows. Never store a token, signed URL or password; the credential guard runs on every free-text field via `App.text`.
- UTC ISO-8601 (`...Z`) in storage; the client renders in `timezone`.

## 6. Adding a read API

1. Add the table to `SCHEMA` (and to `MIGRATIONS` if it extends a 1.0 table), and to `App.LISTS` with its filterable and searchable columns if it is a list.
2. Add one line to `route_table` with the permission (`'read'` for every role).
3. Document it in [01-design.md §6](01-design.md#6-api) — `tests/admin-centre.test.mjs` fails on an undocumented route.
4. Add a case to `tests/test_admin_centre.py`, and to `scripts/verify.py` if the table has a mandatory count.

## 7. Adding a mutation

```python
def close_widget(self, p, wid, body):
    note = self.text(body, 'note', max_len=2000)           # validation first: 400s are not audited

    def work(con, actor, reason, corr):                       # inside one transaction
        r = con.execute('SELECT * FROM widgets WHERE id=?', (wid,)).fetchone()
        if not r:
            raise ApiError(404, 'not found')                  # not audited
        if r['state'] == 'Closed':
            raise ApiError(409, 'already closed')             # audited Failed
        con.execute("UPDATE widgets SET state='Closed' WHERE id=?", (wid,))
        return {'id': wid, '_target': f'widget:{wid}'}        # _target names the audit target
    return self.mutate(p, body, 'widget.close', 'widget.close', f'widget:{wid}', work)
```

Then add the permission to `PERMISSIONS`, the route with `perm=None, body=True` (the handler checks), the client action, the docs and a test. Name audit targets `kind:id` so the record's timeline can find them.

## 8. Audit chain

For each event the server reads the latest `event_hash` (or `GENESIS`), joins `event_id|actor|action|target|reason|result|correlation_id|previous_hash|created_at` with vertical bars, and stores the SHA-256 of the UTF-8 bytes as `event_hash`. `Store.verify_chain` and `scripts/verify.py` recompute it independently. Results are `Succeeded`, `Failed` or `Denied`.

## 9. Client rules

- All calls through `api()`, which adds the bearer token and, for bootstrap sessions, the actor.
- Every value into markup through `esc()`; never `eval`, `new Function` or string timers; never a `style=""` in markup (CSP) — set widths through the CSSOM as `after()` does.
- The token lives in `sessionStorage` only. `localStorage` is used by the brand kit for the theme and nothing else.
- A view is `{title, load(), draw(data), after?, open?, live?, perm?}` in `VIEWS`; buttons are `data-action` handled by `ACTIONS`; forms go through `form()` so validation, the credential guard, busy state and server errors behave the same everywhere.
- Colours, sizes and radii in `app.css` are `--dgo-*`/`--bk-*` tokens; `npm run test:brand` fails on a literal.

## 10. Schema maintenance

Forward-only. Add columns to `MIGRATIONS` with a default; never drop or rename. Bump `SCHEMA_VERSION` and `version` in settings. Back up (`POST /api/backups`), start the new build (migration runs at start), run `scripts/verify.py`. `test_migrates_a_1_0_database_forward` is the model for a migration test.

## 11. Testing

```bash
npm run test:admincentre                  # server (34) and flow-owner (10) suites + repository parity suite
npx playwright test tests/admin-centre.spec.js    # browser journey (needs npm ci)
npm run test:brand                        # brand package in step, no literal colours
python3 tools/admin-centre/scripts/verify.py      # an installation
```

The checklist from 1.0 is covered by named tests: 401 without a token, 400 `reason required`, 400 `invalid json`, audit count increases, the chain verifies after mutations, metacharacters render as text (one encoder, asserted), restart preserves records.

## 12. Secure release

1. `npm run brand:sync -- --check`, `npm run test:admincentre`, the Playwright spec.
2. Review the diff for secrets; `npm run test:secrets` runs in CI.
3. On the host: stop, back up database and token separately, deploy, start, `scripts/verify.py` → PASS, smoke `GET /api/summary`.
4. Record the release as a controlled change in the Centre and verify it with the smoke evidence.

## 13. The flow-owner connector

`FlowOwner` in `server.py` holds the delegated session. Add an owner action by calling `self.owner.call(method, '/flows/{id}/…')` inside a `mutate()` work function, after `require_governed(flow_id)`. Never add a path under `/scopes/admin/` — `tests/admin-centre.test.mjs` and the fake both fail on it. Never persist anything from a token response, never pass on an `inputsLink`/`outputsLink`, and run any error text through `mask_credentials` before storing it.

## 14. Standards

Small handlers, explicit names, one route table, one permission map, stable JSON error shape, no new dependency without approval, every new setting documented in [01 §8](01-design.md#8-runtime-configuration) and `DESCRIPTIONS` with its bounds in `MUTABLE`.
