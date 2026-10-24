#!/usr/bin/env python3
"""Assemble the self-contained workbench page.

index.html is generated, never hand-edited. The previous build shipped as a single
1.66 MB line with the catalogue and the application code fused together, which is how
an unbalanced brace in one function went unnoticed while disabling the entire page.
Keeping the sources apart means `node --check app.js` is meaningful.

Usage:  python3 build.py
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent


def build() -> int:
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
    out.write_text(html, encoding='utf-8')

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
    (ROOT / 'ALL_FLOW_REQUEST_SHAPES.json').write_text(
        json.dumps(shapes, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    fields = sum(len(t['fields']) for f in catalog['flows'] for t in f['triggers'])
    print(f'index.html                  {out.stat().st_size:>9,} bytes')
    print(f'ALL_FLOW_REQUEST_SHAPES.json {(ROOT / "ALL_FLOW_REQUEST_SHAPES.json").stat().st_size:>8,} bytes')
    print(f'flows {embedded}, trigger field records {fields}')
    return 0


if __name__ == '__main__':
    raise SystemExit(build())
