#!/usr/bin/env python3
"""Build the distributable workbench package.

Produces dist/nitda-flow-workbench.zip containing everything needed to run the
workbench on a machine with Python 3.7+ and a browser, plus a MANIFEST.json that
records the SHA-256 of every packaged file.

Usage:  python3 scripts/package.py
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent.parent
DIST = HERE / 'dist'
NAME = 'nitda-flow-workbench'

# Runtime first, then the sources the page is generated from, then verification.
CONTENTS = [
    'index.html',
    'local_agent.py',
    'README.md',
    'ALL_FLOW_REQUEST_SHAPES.json',
    'catalog.json',
    'app.js',
    'app.css',
    'template.html',
    'build.py',
    'scripts/check.sh',
    'scripts/e2e.sh',
    'scripts/browser-test.mjs',
    'scripts/layout-test.mjs',
    'scripts/package.py',
]


def main() -> int:
    # Always package a freshly generated page rather than whatever is on disk.
    if subprocess.run([sys.executable, 'build.py'], cwd=HERE).returncode != 0:
        print('build failed', file=sys.stderr)
        return 1

    missing = [f for f in CONTENTS if not (HERE / f).exists()]
    if missing:
        print('missing from package: %s' % ', '.join(missing), file=sys.stderr)
        return 1

    catalog = json.loads((HERE / 'catalog.json').read_text(encoding='utf-8'))
    flows = catalog['flows']
    kinds = {}
    for f in flows:
        k = (f['triggers'][0] or {}).get('kind') or 'other'
        kinds[k] = kinds.get(k, 0) + 1

    files = []
    for rel in CONTENTS:
        raw = (HERE / rel).read_bytes()
        files.append({
            'path': rel,
            'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(),
        })

    manifest = {
        'package': NAME,
        'schema': 'nitda-flow-workbench-package/v1',
        'builtAtUtc': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'catalogSchema': catalog['schema'],
        'sourceBoundary': catalog['sourceBoundary'],
        'excludedTriggerKinds': catalog.get('excludedTriggerKinds'),
        'flowCount': len(flows),
        'triggerKinds': kinds,
        'triggerFieldRecords': sum(len(t['fields']) for f in flows for t in f['triggers']),
        'actionCount': sum(f.get('actionCount', 0) for f in flows),
        'requires': {'python': '>=3.7', 'browser': 'any modern browser',
                     'node': '>=18 (only for scripts/e2e.sh)'},
        'entryPoints': {
            'inspect': 'open index.html',
            'send': 'python3 local_agent.py, then open http://127.0.0.1:8765',
            'verify': './scripts/check.sh',
        },
        'containsCredentials': False,
        'files': files,
    }

    DIST.mkdir(exist_ok=True)
    zip_path = DIST / (NAME + '.zip')
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        z.writestr(NAME + '/MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
        for rel in CONTENTS:
            info = zipfile.ZipInfo(NAME + '/' + rel)
            info.compress_type = zipfile.ZIP_DEFLATED
            # Preserve the executable bit on the shell scripts.
            info.external_attr = (0o755 if rel.endswith(('.sh', '.py')) else 0o644) << 16
            z.writestr(info, (HERE / rel).read_bytes())

    (DIST / 'MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')

    print('%s' % zip_path)
    print('  %d files, %d flows, %s' % (len(CONTENTS) + 1, len(flows), kinds))
    print('  %,d bytes compressed'.replace(',', '') % zip_path.stat().st_size)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
