#!/bin/sh
# Automatic setup: sign in once, and the seven flows, the SharePoint lists, the first admin
# operator and the mailer ready to publish are all done. Safe to run again at any time.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 18+ is required: https://nodejs.org"; exit 1; }
node tools/setup.mjs "$@" || { echo "Setup stopped. Read the lines above, fix what they say, and run ./setup.sh again."; exit 1; }
echo
echo "Publish ../dgo-mailer-publish/mailer.html: upload it into the folder that holds the platform's index.html."
