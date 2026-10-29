"""Cross-process import ownership and preservation of literal product contracts."""
from pathlib import Path
import tempfile
import unittest
from localization_common import Invalid, catalog_lock, validate_literals

class CommonTest(unittest.TestCase):
    def test_import_locks_are_exclusive_and_release_without_unlinking(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with catalog_lock(root,'ios','de'):
                with self.assertRaises(Invalid):
                    with catalog_lock(root,'ios','fr'): pass
            with catalog_lock(root,'ios','fr'): pass
            self.assertTrue((root/'.local/localization-import-locks/ios.lock').is_file())

    def test_literal_protocol_and_command_values_are_not_translated(self):
        source = 'Open 200 OK Web Server at https://ok200.app. Never forward 20080. Run ok200-crostini update.'
        validate_literals(source, '200 OK Web Server auf https://ok200.app öffnen. 20080 niemals weiterleiten. ok200-crostini update ausführen.')
        for old,new in [('https://ok200.app','https://example.com'),('20080','8080'),('ok200-crostini update','ok200-crostini aktualisieren')]:
            with self.assertRaises(Invalid): validate_literals(source,source.replace(old,new))
