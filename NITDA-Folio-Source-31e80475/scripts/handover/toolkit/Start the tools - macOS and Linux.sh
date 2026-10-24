#!/bin/sh
# NITDA Folio Administrator Toolkit: starts, configures and opens Folio Administration (the Administration Centre and
# the Folio Vault) on this computer only, in one step. Read 00 Read Me First.pdf first. Press Ctrl-C to stop.
# Everything it keeps is in ~/NITDA-Folio-Tools-Data (set FOLIO_TOOLS_DATA to keep it elsewhere).
command -v node >/dev/null 2>&1 || { echo "Node.js 22 or later is needed: https://nodejs.org/"; exit 1; }
cd "$(dirname "$0")/Programs" || exit 1
exec node scripts/folio-admin.mjs "$@"
