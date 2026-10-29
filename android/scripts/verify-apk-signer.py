#!/usr/bin/env python3
"""Require the pinned upload certificate for every SDK-specific APK signer."""
import re
import sys
from pathlib import Path


def verify_signers(text, expected):
    if not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise ValueError('Expected one lowercase SHA-256 upload certificate fingerprint')
    # apksigner prints either a numbered signer or a platform SDK range.
    # See AOSP check_target_files_signatures.py: both are signing certificates,
    # distinct from the separately printed public-key and SourceStamp digests.
    pattern = re.compile(r'Signer (?:#[1-9][0-9]*|\(minSdkVersion=[0-9]+, maxSdkVersion=[0-9]+\))'
                         r' certificate SHA-256 digest: ([a-fA-F0-9]{64})')
    digests = []
    for line in text.splitlines():
        if line.startswith('Signer ') and 'certificate SHA-256 digest:' in line:
            match = pattern.fullmatch(line.strip())
            if not match:
                raise ValueError('Unrecognized APK signing certificate output')
            digests.append(match[1].lower())
    if not digests:
        raise ValueError('No APK signing certificate fingerprint found')
    if set(digests) != {expected}:
        raise ValueError('APK signer differs from the pinned upload certificate')
    return len(digests)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: verify-apk-signer.py apksigner-output expected-sha256')
    try:
        count = verify_signers(Path(sys.argv[1]).read_text(), sys.argv[2])
    except ValueError as error:
        raise SystemExit(str(error)) from None
    print(f'Verified pinned upload certificate across {count} APK signer entries')
