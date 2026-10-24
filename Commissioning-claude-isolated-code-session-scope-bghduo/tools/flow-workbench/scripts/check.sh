#!/usr/bin/env bash
# Verification for the Flow Operations Workbench.
# The shipped v2 build was completely non-functional because of one unbalanced
# brace in the inline script. Any of these checks would have caught it.
set -euo pipefail

cd "$(dirname "$0")/.."
# Provenance re-hashing needs the source definitions. They are present when this
# runs inside the repository; a standalone extraction skips that one check.
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$REPO_ROOT" ] || [ ! -d "$REPO_ROOT/docs/reference/flow-contracts/deployed" ]; then
  REPO_ROOT=""
fi
fail=0

# Termux and other Android environments have no /tmp; TMPDIR points at $PREFIX/tmp.
TMP="${TMPDIR:-/tmp}"

# Node is only needed for the two JavaScript syntax checks. It is not available
# by default on Termux, so those are reported as skipped rather than failing.
HAVE_NODE=0
command -v node >/dev/null 2>&1 && HAVE_NODE=1

step() { printf '%-46s' "$1"; }
pass() { echo "OK"; }
skip() { echo "SKIP ($1)"; }
bad()  { echo "FAIL"; fail=1; }

step "app.js syntax"
if [ "$HAVE_NODE" -eq 0 ]; then skip "no node"
elif node --check app.js 2>/dev/null; then pass
else bad; node --check app.js || true; fi

step "local_agent.py compiles"
if python3 -m py_compile local_agent.py; then pass; else bad; fi

step "build.py reproduces index.html"
if python3 build.py >/dev/null; then pass; else bad; fi

step "index.html inline script syntax"
python3 - <<'PY' > "$TMP/wb_inline.js"
import re, pathlib
html = pathlib.Path('index.html').read_text(encoding='utf-8')
blocks = re.findall(r'<script>(.*?)</script>', html, re.S)
# Skip the catalogue blob; check the application block.
print(blocks[-1])
PY
if [ "$HAVE_NODE" -eq 0 ]; then skip "no node"
elif node --check "$TMP/wb_inline.js" 2>/dev/null; then pass
else bad; node --check "$TMP/wb_inline.js" || true; fi

if [ -n "$REPO_ROOT" ]; then
  step "catalog integrity and provenance"
else
  step "catalog integrity (provenance: no repo)"
fi
if REPO_ROOT="$REPO_ROOT" WB_TMP="$TMP" python3 - <<'PY'
import json, hashlib, os, sys, collections
repo = os.environ.get('REPO_ROOT') or ''
cat = json.load(open('catalog.json', encoding='utf-8'))
flows = cat['flows']
errs = []

if cat['flowCount'] != len(flows):
    errs.append('flowCount %s != %d embedded' % (cat['flowCount'], len(flows)))

excluded = set(cat.get('excludedTriggerKinds') or [])
for f in flows:
    kind = (f['triggers'][0] or {}).get('kind')
    if kind in excluded:
        errs.append('excluded kind %s present: %s' % (kind, f['name']))

if repo:
    for f in flows:
        p = os.path.join(repo, f['sourcePath'])
        if not os.path.exists(p):
            errs.append('missing source: %s' % f['sourcePath'])
            continue
        h = hashlib.sha256(open(p, 'rb').read()).hexdigest()
        if h != f['sourceSha256']:
            errs.append('sha256 mismatch: %s' % f['name'])

# Endpoint profiles are keyed on workflowId + sourceSha256; that pair must be unique.
keys = collections.Counter(f['workflowId'] + '::' + f['sourceSha256'] for f in flows)
for k, n in keys.items():
    if n > 1:
        errs.append('duplicate profile key (%d flows): %s' % (n, k))

if errs:
    print()
    for e in errs:
        print('   ' + e)
    sys.exit(1)

fields = sum(len(t['fields']) for f in flows for t in f['triggers'])
kinds = collections.Counter((f['triggers'][0] or {}).get('kind') or 'other' for f in flows)
open(os.path.join(os.environ.get('WB_TMP') or '/tmp', 'wb_stats.txt'), 'w').write(
    '%d flows, %d trigger field records, kinds: %s\n'
    % (len(flows), fields, dict(kinds)))
PY
then pass; else bad; fi

step "exported shapes match catalog"
if python3 - <<'PY'
import json, sys
cat = json.load(open('catalog.json', encoding='utf-8'))
shp = json.load(open('ALL_FLOW_REQUEST_SHAPES.json', encoding='utf-8'))
if shp['flowCount'] != len(cat['flows']):
    sys.exit('flow count differs')
a = {f['workflowId'] + f['sourceSha256']: f for f in cat['flows']}
b = {f['workflowId'] + f['sourceSha256']: f for f in shp['flows']}
if set(a) != set(b):
    sys.exit('flow sets differ')
for k in a:
    if a[k]['triggers'][0]['fields'] != b[k]['triggers'][0]['fields']:
        sys.exit('fields differ for ' + a[k]['name'])
    if a[k]['triggers'][0]['schema'] != b[k]['triggers'][0]['schema']:
        sys.exit('schema differs for ' + a[k]['name'])
PY
then pass; else bad; fi

echo
[ -f "$TMP/wb_stats.txt" ] && cat "$TMP/wb_stats.txt"
rm -f "$TMP/wb_inline.js" "$TMP/wb_stats.txt"

if [ "$fail" -ne 0 ]; then echo "CHECKS FAILED"; exit 1; fi
if [ "$HAVE_NODE" -eq 0 ]; then
  echo "All checks passed (JavaScript syntax checks skipped: install nodejs to run them)."
else
  echo "All checks passed."
fi
