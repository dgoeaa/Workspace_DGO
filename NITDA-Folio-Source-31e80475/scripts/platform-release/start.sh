#!/bin/sh
# Start the Folio platforms from this package.
#   ./start.sh                  all eight
#   ./start.sh runtime portal   the ones named
#   ./start.sh --group staff    one group: public, staff or control
#   ./start.sh --list           what can be started, and where it answers
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required: https://nodejs.org"; exit 1; }
if [ $# -eq 0 ]; then set -- --all; fi
exec node scripts/run-platform.mjs "$@"
