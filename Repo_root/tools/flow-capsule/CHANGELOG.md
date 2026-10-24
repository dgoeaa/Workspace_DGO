# Changelog
## 2.1.0-termux.1 - 2026-10-20
- Browser calls: `FLOWCAP_ALLOWED_ORIGINS` answers a listed origin on `/invoke` and `/health` only, with a preflight for `POST` and `PUT`. Admin routes never answer one.
- File pass-through: `PUT /invoke/{alias}` sends one `application/octet-stream` body unchanged, up to `FLOWCAP_MAX_UPLOAD_BYTES`, with the `X-Upload-Ticket` header.
- The rate limit counts each caller separately (the `X-Forwarded-For` entry added by a proxy in `FLOWCAP_TRUSTED_PROXIES`), so one visitor on a shared token cannot use up everyone's share.
## 2.0.0-termux.1 - 2026-09-04
- Initial native Termux installer.
- Added compatibility, package, storage, security, versioning, service, validation, diagnostics, repair, backup, rollback, and conservative uninstall workflows.
- Added automated syntax, interface, compatibility, security, and idempotency tests.
