"""Apple native catalog round trips, source drift and placeholder failure checks."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from localization_apple import AppleWorkspace, CATALOGS
from localization_common import Invalid

class AppleTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for table, relative in CATALOGS.items():
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({'sourceLanguage':'en','version':'1.0','strings':{'error':{'comment':f'{table} context','localizations':{'en':{'stringUnit':{'state':'translated','value':'Error: %@'}}}}}}))

    def test_roundtrip_preserves_english_and_independent_locale_values(self):
        work = AppleWorkspace(self.root, 'de')
        job = work.export(True)
        response = {'schemaVersion':1,'platform':'ios','locale':'de','resources':{name:{'sourceHash':row['sourceHash'],'terminologyHash':row['terminologyHash'],'kind':row['kind'],'translation':'Fehler: %@'} for name,row in job['resources'].items()}}
        bad = copy.deepcopy(response)
        bad['resources']['Localizable:error']['translation'] = 'Fehler: %d'
        with self.assertRaises(Invalid): work.import_response(job,bad,'a','b')
        self.assertFalse(work.metadata.exists())
        with self.assertRaises(Invalid): work.import_response(job,response,'same','same')
        work.import_response(job,response,'translator/session','reviewer/session')
        self.assertFalse(any(AppleWorkspace(self.root,'de').report().values()))
        self.assertEqual(AppleWorkspace(self.root,'fr').translated,{})
        path = self.root / CATALOGS['Localizable']
        data = json.loads(path.read_text())
        self.assertEqual(data['strings']['error']['localizations']['en']['stringUnit']['value'],'Error: %@')
        data['strings']['error']['comment']='Changed meaning'
        path.write_text(json.dumps(data))
        self.assertIn('Localizable:error',AppleWorkspace(self.root,'de').report()['stale'])

    def test_unsupported_apple_variants_fail_without_losing_data(self):
        path = self.root / CATALOGS['Localizable']; data = json.loads(path.read_text())
        data['strings']['error']['localizations']['en']={'variations':{'plural':{}}}
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(Invalid,'variations'): AppleWorkspace(self.root,'de')
