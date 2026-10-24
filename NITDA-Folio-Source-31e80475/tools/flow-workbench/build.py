#!/usr/bin/env python3
"""Assemble the self-contained workbench page.

index.html is generated, never hand-edited. The previous build shipped as a single
1.66 MB line with the catalogue and the application code fused together, which is how
an unbalanced brace in one function went unnoticed while disabling the entire page.
Keeping the sources apart means `node --check app.js` is meaningful.

ON --check, AND WHY IT WAS MISSING FOR SO LONG.

Splitting the sources made `node --check app.js` meaningful. It did not make the BUILD
meaningful: until 2026-09-16 nothing in this repository could tell whether index.html
matched the sources it is generated from. No npm script mentioned flow-workbench at all.
So editing app.js and forgetting to rebuild left a 1.6 MB page — the largest generated
file in the tree — quietly serving the previous application, and hand-editing index.html,
which the paragraph above forbids, was discarded by the next rebuild without a word.
Neither was detectable by any command.

Every other generated artefact here fails the build when it drifts from its source. This
one now does too. The build is deterministic — three string substitutions, no timestamps,
no randomness — so the comparison is exact rather than approximate.

Usage:  python3 build.py
        python3 build.py --check     # compare, write nothing, exit 1 on drift
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def build(check: bool = False) -> int:
    catalog = json.loads((ROOT / 'catalog.json').read_text(encoding='utf-8'))

    declared = catalog.get('flowCount')
    embedded = len(catalog.get('flows', []))
    if declared != embedded:
        print(f'catalog.json declares {declared} flows but carries {embedded}', file=sys.stderr)
        return 1

    excluded = set(catalog.get('excludedTriggerKinds') or [])
    for flow in catalog['flows']:
        kind = (flow['triggers'][0] or {}).get('kind')
        if kind in excluded:
            print(f'excluded trigger kind {kind!r} present: {flow["name"]}', file=sys.stderr)
            return 1

    html = (ROOT / 'template.html').read_text(encoding='utf-8')
    css = (ROOT / 'app.css').read_text(encoding='utf-8')
    app = (ROOT / 'app.js').read_text(encoding='utf-8')

    # </script> inside the JSON would close the tag early.
    blob = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

    html = html.replace('/*__CSS__*/', css)
    html = html.replace('/*__CATALOG__*/', 'const CATALOG=' + blob + ';')
    html = html.replace('/*__APP__*/', app)

    out = ROOT / 'index.html'

    shapes = {
        'schema': 'nitda-all-request-shapes/v2',
        'sourceBoundary': catalog['sourceBoundary'],
        'excludedTriggerKinds': catalog.get('excludedTriggerKinds'),
        'flowCount': embedded,
        'flows': [
            {
                'name': f['name'],
                'workflowId': f['workflowId'],
                'sourcePath': f['sourcePath'],
                'sourceSha256': f['sourceSha256'],
                'triggers': [
                    {
                        'name': t['name'], 'type': t['type'], 'kind': t['kind'],
                        'method': t['method'], 'authentication': t['authentication'],
                        'schema': t['schema'], 'fields': t['fields'],
                        'requiredFields': t['requiredFields'],
                        'allowsAdditionalProperties': t['allowsAdditionalProperties'],
                    }
                    for t in f['triggers']
                ],
            }
            for f in catalog['flows']
        ],
    }
    shapes_path = ROOT / 'ALL_FLOW_REQUEST_SHAPES.json'
    shapes_text = json.dumps(shapes, ensure_ascii=False, indent=2) + '\n'

    # Both outputs are built in memory above, so --check compares without writing anything.
    emitted = ((out, html), (shapes_path, shapes_text))

    if check:
        stale = [
            path for path, text in emitted
            if not path.exists() or path.read_text(encoding='utf-8') != text
        ]
        if stale:
            for path in stale:
                why = 'is missing' if not path.exists() else 'does not match the sources it is built from'
                print(f'{path.name} {why}', file=sys.stderr)
            print('Run: python3 tools/flow-workbench/build.py', file=sys.stderr)
            return 1
        print(f'workbench outputs match their sources ({len(emitted)} files, {embedded} flows)')
        return 0

    for path, text in emitted:
        path.write_text(text, encoding='utf-8')

    fields = sum(len(t['fields']) for f in catalog['flows'] for t in f['triggers'])
    print(f'index.html                  {out.stat().st_size:>9,} bytes')
    print(f'ALL_FLOW_REQUEST_SHAPES.json {shapes_path.stat().st_size:>8,} bytes')
    print(f'flows {embedded}, trigger field records {fields}')
    return 0


if __name__ == '__main__':
    raise SystemExit(build(check='--check' in sys.argv[1:]))
