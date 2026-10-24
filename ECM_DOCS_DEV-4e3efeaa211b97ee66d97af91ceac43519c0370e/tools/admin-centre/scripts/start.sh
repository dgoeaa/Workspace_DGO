#!/usr/bin/env sh
# Start the Folio Central Administration Centre from its own directory.
#   ./scripts/start.sh            http://127.0.0.1:8844
# State (data/, config/admin.token, backups/, evidence/) is written under FOLIO_ADMIN_HOME,
# or this package directory when it is unset. Run scripts/verify.py first on a governed host.
set -eu
cd "$(dirname "$0")/.."
umask 077
exec python3 server.py "$@"
