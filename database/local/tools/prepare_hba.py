"""Prepare a backup/candidate in a NEW external directory. Never edits/reloads PostgreSQL."""
from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROLE = 'sentinela_local_reader'
DATABASE = 'sentinela_dev_operacional'
EXPECTED = [
    ['local', 'all', ROLE, 'reject'],
    ['local', 'replication', ROLE, 'reject'],
    ['host', DATABASE, ROLE, '127.0.0.1/32', 'scram-sha-256'],
    ['host', 'all', ROLE, '0.0.0.0/0', 'reject'],
    ['host', 'all', ROLE, '::/0', 'reject'],
    ['host', 'replication', ROLE, '0.0.0.0/0', 'reject'],
    ['host', 'replication', ROLE, '::/0', 'reject'],
]


def records(text):
    return [line.split('#', 1)[0].split() for line in text.splitlines()
            if line.split('#', 1)[0].strip()]


def validate_fragment(text):
    # Exact supported grammar, not a general replacement for PostgreSQL's parser.
    if records(text) != EXPECTED:
        raise ValueError('Unexpected HBA fragment, order, role, address or authentication method.')


def decision(database, address=None):
    for rule in EXPECTED:
        if address is None:
            if rule[0] == 'local' and rule[1] in (database, 'all'):
                return rule[-1]
        elif rule[0] == 'host':
            # PostgreSQL keyword all does not include physical replication.
            if rule[1] != database and not (rule[1] == 'all' and database != 'replication'):
                continue
            ip = ipaddress.ip_address(address)
            network = ipaddress.ip_network(rule[3])
            if ip.version == network.version and ip in network:
                return rule[-1]
    return None


def prepare(source: Path, output: Path):
    source = source.resolve(strict=True)
    output = output.resolve()
    if output.exists() or output.is_relative_to(source.parent):
        raise ValueError('Use a new directory outside the active configuration directory.')
    raw = source.read_bytes()
    if raw.startswith(b'\xef\xbb\xbf'):
        raise ValueError('Source BOM requires manual review; original bytes will not be rewritten.')
    original = raw.decode('utf-8')
    if any(ROLE in row for row in records(original)):
        raise ValueError('Existing reader-specific rules require manual reconciliation.')
    fragment = (ROOT / 'hba/sentinela_local_reader.conf').read_bytes()
    validate_fragment(fragment.decode('utf-8'))
    candidate = fragment + b'\n' + raw
    # Prefix first, entire original suffix byte-for-byte. Includes remain after the prefix.
    assert candidate.endswith(raw)
    output.mkdir(parents=True, exist_ok=False)
    for name, data in [('pg_hba.original.conf', raw), ('pg_hba.candidate.conf', candidate)]:
        with (output / name).open('xb') as stream:
            stream.write(data)
    manifest = {
        'source': str(source),
        'original_sha256': hashlib.sha256(raw).hexdigest(),
        'candidate_sha256': hashlib.sha256(candidate).hexdigest(),
        'original_suffix_preserved': True,
        'validation': 'Offline exact-prefix validation only; not server parser/runtime certification.',
    }
    with (output / 'manifest.json').open('x', encoding='utf-8') as stream:
        json.dump(manifest, stream, indent=2)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        manifest = prepare(args.source, args.output_dir)
    except (ValueError, OSError, UnicodeError):
        raise SystemExit('HBA preparation refused. Review source, destination and fragment; no active file edited.')
    print(json.dumps({k: v for k, v in manifest.items() if k != 'source'}))


if __name__ == '__main__':
    main()
