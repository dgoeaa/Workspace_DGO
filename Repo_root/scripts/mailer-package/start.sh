#!/bin/sh
# Serve the DGO Correspondence Mailer on http://localhost:8083/
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is required: https://nodejs.org"; exit 1; }
exec node tools/serve.mjs "$@"
