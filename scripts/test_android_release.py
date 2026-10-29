"""Signing gate regressions for numbered and SDK-specific apksigner output."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('verify_apk_signer', Path(__file__).resolve().parents[1] / 'android/scripts/verify-apk-signer.py')
signer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signer)
CERT = 'a' * 64
OTHER = 'b' * 64


class ApkSignerTest(unittest.TestCase):
    def test_numbered_certificate_does_not_use_public_key_digest(self):
        text = f'Signer #1 certificate SHA-256 digest: {CERT}\nSigner #1 public key SHA-256 digest: {OTHER}\n'
        self.assertEqual(signer.verify_signers(text, CERT), 1)

    def test_all_sdk_ranges_require_the_same_pinned_certificate(self):
        text = (f'Signer (minSdkVersion=26, maxSdkVersion=32) certificate SHA-256 digest: {CERT}\n'
                f'Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: {CERT}\n')
        self.assertEqual(signer.verify_signers(text, CERT), 2)
        with self.assertRaises(ValueError):
            signer.verify_signers(text.replace(CERT, OTHER, 1), CERT)

    def test_missing_malformed_wrong_or_additional_signers_fail_closed(self):
        for text in ('', f'Signer #1 public key SHA-256 digest: {CERT}',
                     f'Source Stamp certificate SHA-256 digest: {CERT}',
                     'Signer #1 certificate SHA-256 digest: short',
                     f'Signer #1 certificate SHA-256 digest: {OTHER}',
                     f'Signer #1 certificate SHA-256 digest: {CERT}\nSigner #2 certificate SHA-256 digest: {OTHER}'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                signer.verify_signers(text, CERT)


if __name__ == '__main__':
    unittest.main()
