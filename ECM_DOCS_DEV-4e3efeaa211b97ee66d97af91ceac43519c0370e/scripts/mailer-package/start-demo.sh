#!/bin/sh
# Serve the mailer wired to the mock flows (nothing is emailed). Operator key: mock-operator-key-0001
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is required: https://nodejs.org"; exit 1; }
exec node tools/serve.mjs --mock "$@"
