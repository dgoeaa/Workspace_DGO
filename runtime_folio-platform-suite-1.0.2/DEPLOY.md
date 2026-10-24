# Deploying — Internal operations platform

Self-contained deployment package. **Build `f4e797added9eea9`, posture demo.**

> **DEMO PACKAGE.** No endpoint is provisioned. It boots, renders and exercises every
> screen, and transmits nothing. Do not present it as a live deployment.



## First: check the endpoints answer

```
python3 -m http.server 8080          # or any static server, from this directory
```

Open **http://localhost:8080/ENDPOINT-CHECK.html** and press *Run the check*. It calls each
flow from your browser — the same URL, method and request shape the platform uses — and tells
you which answered, which refused the signature, and which were never reached at all.

**No server, or the wrong directory?** Open `ENDPOINT-CHECK-STANDALONE.html` instead. It has
the configuration and the whole flow catalogue inlined and needs no other file — you can open
it straight off the disk.

Read probes run on their own. Writes are behind a tick box, and anything they create is
tagged `__DGO_PROBE__` so it can be found and deleted. The other tabs go further: every
declared route probed separately, a console for sending your own request, the whole estate
with a repoint helper, and a downloadable report that carries no URLs.

## Deploy

Serve this directory as a static site. There is nothing to build, install or keep running:
219 files, 2.8 MB, entry `index.html`.
Every request goes directly from the browser to the configured flow.

## Before you deploy

```
npm run package:verify -- --verify <this directory>
```

Recomputes every file hash against `PACKAGE_MANIFEST.json` and re-validates the endpoint
set. A package that does not verify must not be deployed.

## What is in it

- `PACKAGE_MANIFEST.json` — every file, its size and its SHA-256, plus the endpoint
  provisioning record. Signatures are redacted; the manifest is safe to share.
- `ENDPOINT_PROVISIONING.md` — what is wired, what is not, and how to rotate.
- `ENDPOINT-CHECK.html` — **the workbench you can actually run.** Serve this directory and
  open it in a browser. Six tabs: every endpoint probed the way the platform calls it; every
  declared route probed separately; a console for sending anything you like and reading the
  whole response; the full estate with a repoint helper; a downloadable report carrying no
  URLs; and what this browser is. It keeps four outcomes apart — the flow answered, the
  signature was refused, the flow is gone, and *nothing was reached* — because a CORS
  rejection and a revoked signature look identical and lead to opposite actions.
- `ENDPOINT-CHECK-STANDALONE.html` — the same workbench with the configuration and the
  whole flow catalogue inlined. **No server and no other file: open it from anywhere,
  including straight off the disk.** It carries the endpoint URLs. **This is a credential.**
- `FLOW_CATALOGUE.json` — **every endpoint URL in full, unredacted**: the 0
  wired here, the flow each one reached and the reference document that establishes it, and
  every other flow in the documented estate that no key currently calls. This is what you
  read when a live probe answers wrongly and you need to point a key somewhere else.
  **This is a credential.**
- `config/config.local.js` — the provisioned endpoint URLs, in the form the browser reads.
  **This is a credential.**

## The obligation this package cannot discharge

Each flow is called directly, so each flow is the only place authentication, authorisation,
validation and rate limiting can happen. No file in this package can do it for them, and no
check in it can prove they do. See `docs/architecture/AUTHENTICATION_CONTRACT.md` §2.
