"""
Zenodo deposition script for GateSyntax / HERMES User Interface.

Usage:
    python _zenodo_upload.py <YOUR_ZENODO_TOKEN>

Get a token at: https://zenodo.org/account/settings/applications/tokens/new/
Required scopes: deposit:write  deposit:actions

This script creates a DRAFT deposition. You review and publish manually
at https://zenodo.org/deposit so you retain full control over the DOI.
"""
import sys, json, pathlib, mimetypes
import urllib.request, urllib.parse

BASE = 'https://zenodo.org/api'

METADATA = {
    'metadata': {
        'title':       'GateSyntax / HERMES User Interface -- Declassification No. 8',
        'upload_type': 'software',
        'description': (
            'Full multi-platform declarative UI runtime. A single .ui file syntax '
            'that runs natively in C#/WPF, Python/Textual, Python/PyQt6, Java/JavaFX, '
            'TypeScript/React, and TypeScript/Vanilla-DOM without changing a line of markup. '
            'Includes the GateSyntax Integrador -- a domain-agnostic live-binding layer '
            'in all six languages. Designed by Iaconous Worthyson. Coded by Claude Code.'
        ),
        'creators': [
            {'name': 'Worthyson, Iaconous', 'affiliation': 'Independent'}
        ],
        'keywords': [
            'declarative UI', 'cross-platform', 'live binding',
            'domain-specific language', 'UI runtime', 'GateSyntax', 'HERMES'
        ],
        'access_right': 'open',
        'license':      'other-open',
        'notes': (
            'OpenTimestamps Bitcoin blockchain proofs for README.md, CLAUDE.md, '
            'and SPEC.md are included as .ots files in this deposit. '
            'Source repository: https://github.com/IACONOUS-WORTHYSON/GateSyntax-Hermes-UI'
        ),
    }
}

FILES_TO_UPLOAD = [
    'README.md',
    'CLAUDE.md',
    'SPEC.md',
    'README.md.ots',
    'CLAUDE.md.ots',
    'SPEC.md.ots',
]


def api(method: str, path: str, token: str,
        data: bytes | None = None, content_type: str = 'application/json') -> dict:
    url = f'{BASE}{path}'
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            'Authorization':  f'Bearer {token}',
            'Content-Type':   content_type,
        },
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'HTTP {e.code} on {method} {path}: {body[:400]}')
        sys.exit(1)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    token = sys.argv[1].strip()
    print('Creating deposition draft ...')

    dep = api('POST', '/deposit/depositions', token,
              data=json.dumps(METADATA).encode(),
              content_type='application/json')

    dep_id  = dep['id']
    bucket  = dep['links']['bucket']
    html    = dep['links']['html']
    print(f'  Deposition ID : {dep_id}')
    print(f'  Draft URL     : {html}')

    for fname in FILES_TO_UPLOAD:
        p = pathlib.Path(fname)
        if not p.exists():
            print(f'  SKIP (not found): {fname}')
            continue
        print(f'  Uploading {fname} ...', end=' ', flush=True)
        file_data = p.read_bytes()
        upload_url = f'{bucket}/{urllib.parse.quote(fname)}'
        req = urllib.request.Request(
            upload_url,
            data=file_data,
            method='PUT',
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type':  'application/octet-stream',
            },
        )
        with urllib.request.urlopen(req) as r:
            resp = json.loads(r.read())
        print(f'OK ({resp.get("size", "?")} bytes)')

    print(f'\nDraft ready at: {html}')
    print('Review the metadata and click PUBLISH to get your DOI.')
    print('The DOI will be in the form: 10.5281/zenodo.<id>')


if __name__ == '__main__':
    main()
