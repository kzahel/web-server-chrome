"""Campaign drift, resume and evidence guards. No model calls or devices."""
import copy
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from localization_common import Invalid, digest, read_json
import localization_qualification as qualification
import localization_front as front

SPEC = importlib.util.spec_from_file_location('campaign', Path(__file__).with_name('localization-campaign.py'))
campaign = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(campaign)


class CampaignTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.work = self.root / '.local/campaign'
        self.manifest = self.root / campaign.MANIFEST
        self.data = read_json(campaign.ROOT / campaign.MANIFEST)
        self.registry = read_json(campaign.ROOT / 'localization/locales.json')
        self.write(campaign.MANIFEST, self.data)
        self.write('localization/locales.json', self.registry)
        self.terms = read_json(campaign.ROOT / 'localization/terminology/de.json')
        self.write('localization/terminology/de.json', self.terms)
        for name in campaign.IMPLEMENTATION:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('frozen input')
        self.source = {'message': {'value': 'Stop', 'kind': 'named', 'context': ['Server control'],
                                   'arguments': [], 'sourceHash': 'source', 'terminologyHash': 'terms'}}
        self.target = {'message': 'Arrêter'}
        self.ledger = {'reviewer': 'separate-session'}
        self.issues = {}
        self.fake = lambda *_: SimpleNamespace(source=self.source, translated=self.target,
            ledger=self.ledger, report=lambda: self.issues)
        p = patch.object(campaign, 'workspace', side_effect=self.fake)
        p.start(); self.addCleanup(p.stop)
        p = patch.object(qualification, 'workspace', side_effect=self.fake)
        p.start(); self.addCleanup(p.stop)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding='utf-8')

    def plan(self):
        return campaign.make_plan(self.root, self.manifest, self.work)

    def ready(self):
        row = self.data['locales'][0]
        terms = {**self.terms, 'locale': 'fr', 'register': row['register']}
        self.write('localization/terminology/fr.json', terms)
        for surface in campaign.SURFACES:
            self.registry['supportedLocales'][surface].append('fr')
        self.write('localization/locales.json', self.registry)
        self.write('localization/android/locales.json', {'locales': {'fr': {
            'catalog': 'android/app/src/main/res/values-fr/strings.xml', 'quantities': row['androidQuantities']}}})
        evidence = {'schemaVersion': 2, 'locale': 'fr', 'platform': 'darwin',
            'inputs': qualification.qualification_inputs(self.root, 'fr'),
            'harness': qualification.qualification_harness(self.root),
            'checks': qualification.qualification_commands('fr', self.work / 'fr'),
            'androidApis': [28, 35], 'completedAt': '2026-10-29T12:00:00Z',
            'limitations': ['Bounded local runtime evidence only']}
        self.write('.local/campaign/fr/qualification.json', evidence)
        return evidence

    def test_plan_has_french_first_all_surfaces_and_bounded_exact_argv(self):
        plan = self.plan()
        self.assertEqual(17, len(plan['locales']))
        self.assertEqual('fr', plan['locales'][0]['tag'])
        self.assertEqual(85, plan['resourceCount'])
        for row in plan['locales']:
            self.assertEqual(campaign.SURFACES, [job['surface'] for job in row['jobs']])
            for job in row['jobs']:
                self.assertIn('acceptEdits', job['run'])
                self.assertIn('--import-reviewed', job['run'])
                self.assertEqual('2', job['run'][job['run'].index('--concurrency')+1])
                self.assertNotIn('shell', job['run'])

    def test_resume_rejects_altered_commands_source_context_or_harness(self):
        plan = self.plan()
        campaign.verify_plan(self.root, plan, self.manifest, self.work)
        changed = copy.deepcopy(plan)
        changed['locales'][0]['jobs'][0]['run'][0] = 'unreviewed-command'
        with self.assertRaises(Invalid): campaign.verify_plan(self.root, changed, self.manifest, self.work)
        self.source['message']['context'] = ['Different meaning']
        with self.assertRaises(Invalid): campaign.verify_plan(self.root, plan, self.manifest, self.work)
        self.source['message']['context'] = ['Server control']
        (self.root / campaign.IMPLEMENTATION[0]).write_text('changed shared context')
        with self.assertRaises(Invalid): campaign.verify_plan(self.root, plan, self.manifest, self.work)

    def test_target_imports_and_terms_do_not_change_frozen_english(self):
        plan = self.plan()
        self.target['message'] = 'New reviewed target'
        self.source['message']['terminologyHash'] = 'locale-specific-guidance'
        campaign.verify_plan(self.root, plan, self.manifest, self.work)

    def test_cli_roundtrip_never_overwrites_a_different_active_plan(self):
        with patch.object(campaign, 'ROOT', self.root), contextlib.redirect_stdout(io.StringIO()):
            args = ['--work-dir','.local/campaign']
            campaign.main(['plan',*args])
            campaign.main(['verify',*args])
            campaign.main(['handoff',*args])
            original = (self.work / 'plan.json').read_bytes()
            self.assertIn('Do not publish', (self.work / 'supervisor.md').read_text())
            self.source['message']['value'] = 'Changed English'
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                campaign.main(['plan',*args])
            self.assertEqual(original, (self.work / 'plan.json').read_bytes())

    def test_manifest_rejects_missing_duplicate_unsafe_or_wrong_profiles(self):
        for mutation in ['duplicate', 'missing', 'qualifier', 'quantity', 'register', 'worker', 'publish']:
            value = copy.deepcopy(self.data)
            if mutation == 'duplicate': value['locales'].append(value['locales'][0])
            elif mutation == 'missing': value['locales'].pop()
            elif mutation == 'qualifier': value['locales'][0]['androidQualifier'] = '../../outside'
            elif mutation == 'quantity': value['locales'][0]['androidQuantities'] = ['many']
            elif mutation == 'register': value['locales'][0]['register'] = 'du'
            elif mutation == 'worker': value['workerSettings']['concurrency'] = 3
            else: value['bounds']['publish'] = True
            with self.subTest(mutation=mutation), self.assertRaises(Invalid):
                campaign.validate_manifest(value, self.registry)

    def test_profile_cldr_and_script_region_probes_are_valid(self):
        campaign.locale_runtime_check(self.data)
        self.data['locales'][0]['androidQuantities'] = ['other']
        with self.assertRaises(Exception): campaign.locale_runtime_check(self.data)

    def test_paths_reject_escape_and_state_outside_local_including_symlinks(self):
        for path in ['../escape', 'localization/state', '.local']:
            with self.subTest(path=path), self.assertRaises(Invalid): campaign.state_path(self.root, path)
        with tempfile.TemporaryDirectory() as outside:
            (self.root / '.local').mkdir()
            (self.root / '.local/link').symlink_to(outside, target_is_directory=True)
            with self.assertRaises(Invalid): campaign.state_path(self.root, '.local/link/subdir')

    def test_registration_alone_never_completes_and_full_receipt_is_resumable(self):
        plan = self.plan()
        with self.assertRaises(Invalid): campaign.completion(self.root, plan, self.work, 'fr')
        self.ready()
        record = campaign.completion(self.root, plan, self.work, 'fr')
        self.assertEqual(digest(plan), record['planHash'])
        self.write('.local/campaign/completed/fr.json', record)
        first = campaign.status(self.root, plan, self.work)[0]
        self.assertTrue(first['qualified'])
        self.ledger['reviewer'] = 'different-review'
        first = campaign.status(self.root, plan, self.work)[0]
        self.assertFalse(first['qualified'])
        self.assertIn('stale', first['qualification'])

    def test_record_rejects_missing_native_checks_wrong_api_stale_inputs_or_harness(self):
        plan = self.plan()
        evidence = self.ready()
        for mutation in ['missing-check', 'wrong-api', 'old-schema', 'wrong-platform', 'stale-target', 'old-harness']:
            value = copy.deepcopy(evidence)
            if mutation == 'missing-check': value['checks'].pop()
            elif mutation == 'wrong-api': value['androidApis'] = [35]
            elif mutation == 'old-schema': value['schemaVersion'] = 1
            elif mutation == 'wrong-platform': value['platform'] = 'linux'
            elif mutation == 'stale-target': value['inputs']['web']['catalog'] = 'old'
            else: value['harness'] = {}
            self.write('.local/campaign/fr/qualification.json', value)
            with self.subTest(mutation=mutation), self.assertRaises(Invalid):
                campaign.completion(self.root, plan, self.work, 'fr')

    def test_preview_incomplete_or_wrong_native_destination_cannot_record(self):
        plan = self.plan()
        self.ready()
        self.issues['unreviewed'] = ['message']
        with self.assertRaises(Invalid): campaign.completion(self.root, plan, self.work, 'fr')
        self.issues.clear()
        self.registry['previewLocales']['ios'].append('fr')
        self.write('localization/locales.json', self.registry)
        with self.assertRaises(Invalid): campaign.completion(self.root, plan, self.work, 'fr')
        self.registry['previewLocales']['ios'].clear()
        self.write('localization/locales.json', self.registry)
        self.write('localization/android/locales.json', {'locales': {}})
        with self.assertRaises(Invalid): campaign.completion(self.root, plan, self.work, 'fr')

    def test_qualification_hash_tracks_catalog_and_ledger_separately(self):
        before = qualification.qualification_inputs(self.root, 'fr')
        self.target['message'] = 'Different'
        after = qualification.qualification_inputs(self.root, 'fr')
        self.assertNotEqual(before['web']['catalog'], after['web']['catalog'])
        self.assertEqual(before['web']['ledger'], after['web']['ledger'])
        self.ledger['reviewer'] = 'another'
        self.assertNotEqual(after, qualification.qualification_inputs(self.root, 'fr'))

    def test_runtime_edit_invalidates_plan_and_receipt_but_generated_registration_can_grow(self):
        runtime = self.root / 'packages/ui/src/runtime.ts'
        runtime.parent.mkdir(parents=True)
        runtime.write_text('first')
        plan = self.plan()
        self.ready()
        generated = self.root / 'packages/i18n/src/generated.ts'
        generated.parent.mkdir(parents=True)
        generated.write_text('growing locale registry')
        campaign.verify_plan(self.root, plan, self.manifest, self.work)
        campaign.completion(self.root, plan, self.work, 'fr')
        runtime.write_text('changed behavior')
        with self.assertRaises(Invalid): campaign.verify_plan(self.root, plan, self.manifest, self.work)
        with self.assertRaises(Invalid): campaign.completion(self.root, plan, self.work, 'fr')


class QualificationOrchestrationTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.directory = self.root / '.local/fr'
        registry = {'localeDefinitions': {'fr': {}}, 'catalogs': dict.fromkeys(campaign.SURFACES),
                    'supportedLocales': dict.fromkeys(campaign.SURFACES, ['en','de','fr'])}
        path = self.root / 'localization/locales.json'
        path.parent.mkdir()
        path.write_text(json.dumps(registry))
        self.inputs = {'input': 'same'}
        for target, attribute, value in [
            (front, 'ROOT', self.root), (front.sys, 'platform', 'darwin'),
            (front.platform, 'machine', lambda: 'arm64'),
            (front, 'workspace', lambda *_: SimpleNamespace(report=lambda: {}, translated={'text':'value'})),
            (front, 'qualification_harness', lambda *_: {'script': 'same'}),
            (front, 'qualification_inputs', lambda *_: self.inputs),
        ]:
            p = patch.object(target, attribute, value)
            p.start(); self.addCleanup(p.stop)
        self.argv = ['qualify','--locale','fr','--all-surfaces','--work-dir',str(self.directory)]

    def test_full_success_records_exact_native_commands_and_both_owned_apis(self):
        with patch.object(front.subprocess, 'run') as run:
            front.main(self.argv)
        evidence = read_json(self.directory / 'qualification.json')
        self.assertEqual([28,35], evidence['androidApis'])
        self.assertEqual(self.inputs, evidence['inputs'])
        self.assertTrue(all(command in evidence['checks'] for command in qualification.qualification_commands('fr',self.directory)))
        emulator = [call.kwargs['env']['OK200_LOCALIZATION_SYSTEM_IMAGE'] for call in run.call_args_list
                    if call.args[0] == ['android/scripts/localization-smoke.sh']]
        self.assertEqual(['system-images;android-28;google_apis;arm64-v8a',
                          'system-images;android-35;google_apis;arm64-v8a'], emulator)

    def test_failed_native_run_or_midrun_input_change_never_emits_success(self):
        def fail(command, **_):
            if command == ['ios/scripts/check.sh']:
                raise RuntimeError('native failure')
        with patch.object(front.subprocess, 'run', side_effect=fail), self.assertRaises(RuntimeError):
            front.main(self.argv)
        self.assertFalse((self.directory / 'qualification.json').exists())
        with patch.object(front.subprocess, 'run'), patch.object(front, 'qualification_inputs', side_effect=[{'old':1},{'new':2}]), self.assertRaises(Invalid):
            front.main(self.argv)
        self.assertFalse((self.directory / 'qualification.json').exists())


if __name__ == '__main__':
    unittest.main()
