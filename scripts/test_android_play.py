"""Play publication, rollout and ledger regressions; no credentials or network."""
from datetime import datetime, timedelta, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('android_play', Path(__file__).with_name('android-play.py'))
play = importlib.util.module_from_spec(spec)
spec.loader.exec_module(play)

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = b'signed candidate fixture'
DIGEST = hashlib.sha256(BUNDLE).hexdigest()
EDIT = f'{play.PUBLISHER}/edits/edit-1'
COMMIT = (f'{EDIT}:commit?changesNotSentForReview=false'
          '&changesInReviewBehavior=ERROR_IF_IN_REVIEW')
NOW = datetime(2026, 11, 2, 18, tzinfo=timezone.utc)


class FakeGoogle:
    def __init__(self, tracks=None, bundles=None, failure=None):
        self.tracks = tracks or {}
        self.bundles = bundles or []
        self.failure = failure
        self.calls = []

    def call(self, method, url, body=None, upload=False):
        self.calls.append((method, url, body))
        if self.failure and self.failure in url:
            raise TimeoutError('unknown remote outcome')
        if method == 'POST' and url == f'{play.PUBLISHER}/edits':
            return {'id': 'edit-1'}
        if method == 'GET' and '/tracks/' in url:
            return {'releases': self.tracks.get(url.rsplit('/', 1)[1], [])}
        if method == 'GET' and url.endswith('/bundles'):
            return {'bundles': self.bundles}
        if upload:
            return {'versionCode': 33, 'sha256': hashlib.sha256(body).hexdigest()}
        return {}

    def methods(self, method):
        return [url for m, url, _ in self.calls if m == method]

    def puts(self):
        return [body for m, _, body in self.calls if m == 'PUT']


class FakeGitHub:
    def __init__(self, deployments=None):
        self.deployments = deployments or []
        self.calls = []

    def call(self, method, url, body=None):
        self.calls.append((method, url, body))
        if method == 'GET':
            environment = re.search(r'environment=([\w-]+)', url)[1]
            return [d for d in reversed(self.deployments) if d['environment'] == environment]
        if url.endswith('/deployments'):
            deployment = {'id': len(self.deployments) + 1, 'created_at': NOW.isoformat(), **body}
            self.deployments.append(deployment)
            return deployment
        return {}


def deployment(created, **payload):
    base = {'versionCode': 33, 'versionName': '1.0.33', 'tag': 'android-v1.0.33', 'plan': 'standard-7d',
            'steps': play.load_policy()['plans']['standard-7d'], 'previousVersionCode': 32,
            'status': 'inProgress', 'userFraction': 0.01}
    return {'id': 1, 'environment': 'play-production', 'created_at': created.isoformat().replace('+00:00', 'Z'),
            'payload': {**base, **payload}}


def ledger(deployments=None):
    return play.Ledger(FakeGitHub(deployments), 'kzahel/web-server-chrome', 'https://run')


def reporting_row(code, rate_metric, rate, users):
    return {'dimensions': [{'dimension': 'versionCode', 'int64Value': str(code)}],
            'metrics': [{'metric': rate_metric, 'decimalValue': {'value': str(rate)}},
                        {'metric': 'distinctUsers', 'decimalValue': {'value': str(users)}}]}


class FakeReporting:
    def __init__(self, rows, end=(2026, 11, 2)):
        self.rows = rows
        self.end = end
        self.queries = []

    def call(self, method, url, body=None):
        if method == 'GET':
            year, month, day = self.end
            return {'freshnessInfo': {'freshnesses': [
                {'aggregationPeriod': 'HOURLY', 'latestEndTime': {'year': 2026, 'month': 1, 'day': 1}},
                {'aggregationPeriod': 'DAILY', 'latestEndTime': {'year': year, 'month': month, 'day': day}}]}}
        self.queries.append(body)
        name = 'crash' if 'crashRate' in url else 'anr' if 'anrRate' in url else 'errors'
        return {'rows': self.rows.get(name, [])}


def error_row(code, report_type, users):
    return {'dimensions': [{'dimension': 'versionCode', 'int64Value': str(code)},
                           {'dimension': 'reportType', 'stringValue': report_type}],
            'metrics': [{'metric': 'errorReportCount', 'decimalValue': {'value': str(users * 2)}},
                        {'metric': 'distinctUsers', 'decimalValue': {'value': str(users)}}]}


def report_rows(new_crash=1, old_crash=2, new_anr=0, old_anr=1):
    return {'errors': [error_row(33, 'CRASH', new_crash), error_row(32, 'CRASH', old_crash),
                       error_row(33, 'APPLICATION_NOT_RESPONDING', new_anr),
                       error_row(32, 'APPLICATION_NOT_RESPONDING', old_anr),
                       error_row(33, 'NON_FATAL', 99)]}


def vitals_rows(new_crash=0.002, new_anr=0.001, users=500, old_crash=0.002, old_anr=0.001):
    return {'crash': [reporting_row(33, 'userPerceivedCrashRate', new_crash, users),
                      reporting_row(32, 'userPerceivedCrashRate', old_crash, 5000)],
            'anr': [reporting_row(33, 'userPerceivedAnrRate', new_anr, users),
                    reporting_row(32, 'userPerceivedAnrRate', old_anr, 5000)]}


PRODUCTION_32 = {'status': 'completed', 'versionCodes': ['32'], 'name': '1.0.32'}


class PublishTest(unittest.TestCase):
    def publish(self, google, track='internal', status='completed', fraction=None):
        return play.publish(google, track, status, 33, '1.0.33', BUNDLE, DIGEST, '• Notes.', fraction)

    def test_internal_uploads_validates_then_commits(self):
        google = FakeGoogle(tracks={'internal': [{'status': 'completed', 'versionCodes': ['28']}]})
        result = self.publish(google)
        self.assertEqual((result['status'], result['uploaded'], result['previousVersionCode']),
                         ('submitted', True, 28))
        self.assertEqual(google.methods('POST')[-2:], [f'{EDIT}:validate', COMMIT])
        self.assertEqual(google.puts(), [{'track': 'internal', 'releases': [{
            'name': '1.0.33', 'versionCodes': ['33'], 'status': 'completed',
            'releaseNotes': [{'language': 'en-US', 'text': '• Notes.'}]}]}])
        self.assertFalse(google.methods('DELETE'))

    def test_production_promotes_only_a_bundle_play_already_holds(self):
        google = FakeGoogle(tracks={'production': [PRODUCTION_32]})
        with self.assertRaisesRegex(ValueError, 'internal testing first'):
            self.publish(google, 'production', 'inProgress', 0.01)
        self.assertFalse(google.puts())
        self.assertFalse(any('uploadType' in url for url in google.methods('POST')))
        self.assertEqual(google.methods('DELETE'), [EDIT])

    def test_staged_production_rollout_reuses_the_internal_bundle(self):
        google = FakeGoogle(tracks={'production': [PRODUCTION_32]},
                            bundles=[{'versionCode': 33, 'sha256': DIGEST}])
        result = self.publish(google, 'production', 'inProgress', 0.01)
        self.assertEqual((result['status'], result['uploaded'], result['previousVersionCode']),
                         ('submitted', False, 32))
        self.assertEqual(google.puts()[0]['releases'][0]['userFraction'], 0.01)
        self.assertFalse(any('uploadType' in url for url in google.methods('POST')))

    def test_rejects_mismatched_bytes_in_play(self):
        google = FakeGoogle(tracks={'production': [PRODUCTION_32]},
                            bundles=[{'versionCode': 33, 'sha256': 'other'}])
        with self.assertRaisesRegex(ValueError, 'checksum'):
            self.publish(google, 'production', 'completed')
        self.assertFalse(google.puts())
        self.assertEqual(google.methods('DELETE'), [EDIT])

    def test_refuses_downgrade_unfinished_rollout_and_unrelated_draft(self):
        for release in ({'status': 'completed', 'versionCodes': ['34']},
                        {'status': 'inProgress', 'versionCodes': ['32'], 'userFraction': 0.1},
                        {'status': 'halted', 'versionCodes': ['32'], 'userFraction': 0.1},
                        {'status': 'draft', 'versionCodes': ['31']}):
            with self.subTest(release=release):
                google = FakeGoogle(tracks={'internal': [release]})
                with self.assertRaises(ValueError):
                    self.publish(google)
                self.assertFalse(google.puts())

    def test_same_release_is_unchanged_and_own_draft_can_be_released(self):
        google = FakeGoogle(tracks={'internal': [{'status': 'completed', 'versionCodes': ['33']}]},
                            bundles=[{'versionCode': 33, 'sha256': DIGEST}])
        self.assertEqual(self.publish(google)['status'], 'unchanged')
        self.assertFalse(google.puts() or COMMIT in google.methods('POST'))
        google = FakeGoogle(tracks={'internal': [{'status': 'draft', 'versionCodes': ['33']}]},
                            bundles=[{'versionCode': 33, 'sha256': DIGEST}])
        self.assertEqual(self.publish(google)['status'], 'submitted')

    def test_check_reads_without_upload_or_change(self):
        google = FakeGoogle(tracks={'internal': [{'status': 'completed', 'versionCodes': ['28']}]})
        result = self.publish(google, status='check')
        self.assertEqual(result['status'], 'access_verified')
        self.assertEqual(result['releases'][0]['versionCodes'], [28])
        self.assertFalse(google.puts() or any('uploadType' in u or ':commit' in u
                                              for u in google.methods('POST')))
        self.assertEqual(google.methods('DELETE'), [EDIT])

    def test_validation_failure_discards_edit_without_commit(self):
        google = FakeGoogle(failure=':validate')
        with self.assertRaises(TimeoutError):
            self.publish(google)
        self.assertEqual(google.methods('DELETE'), [EDIT])
        self.assertNotIn(COMMIT, google.methods('POST'))

    def test_unknown_commit_is_neither_retried_nor_deleted(self):
        google = FakeGoogle(failure=':commit')
        with self.assertRaises(TimeoutError):
            self.publish(google)
        self.assertEqual(google.methods('POST').count(COMMIT), 1)
        self.assertFalse(google.methods('DELETE'))

    def test_fraction_rules(self):
        for track, status, fraction in (('internal', 'inProgress', 0.1), ('production', 'inProgress', None),
                                        ('production', 'inProgress', 1.0), ('production', 'completed', 0.5)):
            with self.subTest(track=track, status=status, fraction=fraction):
                google = FakeGoogle()
                with self.assertRaises(ValueError):
                    self.publish(google, track, status, fraction)
                self.assertFalse(google.calls)

    def test_draft_is_not_reported_as_released(self):
        self.assertEqual(self.publish(FakeGoogle(), status='draft')['status'], 'draft_saved')


class RolloutTest(unittest.TestCase):
    def google(self, status='inProgress', fraction=0.05):
        release = {'status': status, 'versionCodes': ['33'], 'name': '1.0.33',
                   'releaseNotes': [{'language': 'en-US', 'text': 'Notes'}]}
        if fraction is not None:
            release['userFraction'] = fraction
        return FakeGoogle(tracks={'production': [release, PRODUCTION_32]})

    def test_set_raises_fraction_and_keeps_release_notes(self):
        google = self.google()
        result = play.rollout(google, 'set', 33, 0.2)
        self.assertEqual(result['after'], {'status': 'inProgress', 'userFraction': 0.2})
        (release,) = google.puts()[0]['releases']
        self.assertEqual((release['userFraction'], release['releaseNotes'][0]['text']), (0.2, 'Notes'))
        self.assertIn(COMMIT, google.methods('POST'))

    def test_fraction_never_decreases_and_equal_is_unchanged(self):
        with self.assertRaisesRegex(ValueError, 'only increase'):
            play.rollout(self.google(), 'set', 33, 0.01)
        google = self.google()
        self.assertEqual(play.rollout(google, 'set', 33, 0.05)['status'], 'unchanged')
        self.assertFalse(google.puts())

    def test_halt_resume_and_complete(self):
        google = self.google()
        self.assertEqual(play.rollout(google, 'halt', 33)['after'], {'status': 'halted', 'userFraction': 0.05})
        halted = self.google('halted')
        with self.assertRaisesRegex(ValueError, 'Resume'):
            play.rollout(halted, 'set', 33, 0.2)
        self.assertEqual(play.rollout(halted, 'resume', 33)['after'],
                         {'status': 'inProgress', 'userFraction': 0.05})
        google = self.google()
        self.assertEqual(play.rollout(google, 'complete', 33)['after'], {'status': 'completed', 'userFraction': None})
        self.assertNotIn('userFraction', google.puts()[0]['releases'][0])

    def test_requires_a_staged_release_for_the_version(self):
        for google, code in ((FakeGoogle(tracks={'production': [PRODUCTION_32]}), 32),
                             (self.google(), 34)):
            with self.assertRaisesRegex(ValueError, 'No staged'):
                play.rollout(google, 'halt', code)
            self.assertFalse(google.puts())


class AdvanceTest(unittest.TestCase):
    policy = play.load_policy()

    def run_advance(self, created, google=None, rows=None, act=True, **payload):
        google = google or FakeGoogle(tracks={'production': [
            {'status': 'inProgress', 'versionCodes': ['33'], 'userFraction': payload.get('userFraction', 0.01)},
            PRODUCTION_32]})
        log = ledger([deployment(created, **payload)])
        result = play.advance(google, log, FakeReporting(rows or vitals_rows()), self.policy, NOW, act)
        return result, google, log

    def test_waits_for_dwell_time(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=23))
        self.assertEqual((result['outcome'], result['next']), ('waiting', 0.05))
        self.assertEqual(result['vitals']['stats']['crash']['32']['rate'], 0.002)
        self.assertFalse(google.puts())

    def test_advances_to_next_step_and_records_it(self):
        result, google, log = self.run_advance(NOW - timedelta(hours=25))
        self.assertEqual(result['outcome'], 'set')
        self.assertEqual(google.puts()[0]['releases'][0]['userFraction'], 0.05)
        recorded = log.github.deployments[-1]
        self.assertEqual((recorded['environment'], recorded['payload']['userFraction'],
                          recorded['payload']['steps']), ('play-production', 0.05, self.policy['plans']['standard-7d']))

    def test_report_mode_changes_nothing(self):
        result, google, log = self.run_advance(NOW - timedelta(hours=25), act=False)
        self.assertEqual(result['outcome'], 'would_set')
        self.assertFalse(google.puts())
        self.assertEqual(len(log.github.deployments), 1)

    def test_last_step_completes(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=49), userFraction=0.5)
        self.assertEqual(result['outcome'], 'complete')
        self.assertEqual(google.puts()[0]['releases'][0]['status'], 'completed')

    def test_manual_fraction_between_steps_uses_reached_step(self):
        self.assertEqual(play.plan_position(self.policy['plans']['standard-7d'], 0.1), (24, 0.2))
        self.assertEqual(play.plan_position(self.policy['plans']['standard-7d'], 0.005), (24, 0.01))

    def test_vitals_regression_halts(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=25), rows=vitals_rows(new_crash=0.006))
        self.assertEqual(result['outcome'], 'halt')
        self.assertEqual(google.puts()[0]['releases'][0]['status'], 'halted')
        result, _, _ = self.run_advance(NOW - timedelta(hours=25), rows=vitals_rows(new_anr=0.006))
        self.assertEqual(result['outcome'], 'halt')

    def test_too_few_users_or_no_fresh_day_holds(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=25), rows=vitals_rows(users=50))
        self.assertEqual(result['outcome'], 'hold')
        self.assertFalse(google.puts())
        google = FakeGoogle(tracks={'production': [
            {'status': 'inProgress', 'versionCodes': ['33'], 'userFraction': 0.01}, PRODUCTION_32]})
        stale = FakeReporting(vitals_rows(), end=(2026, 11, 1))
        log = ledger([deployment(datetime(2026, 11, 1, 18, tzinfo=timezone.utc))])
        self.assertEqual(play.advance(google, log, stale, self.policy, NOW, True)['outcome'], 'hold')

    def test_console_change_is_a_mismatch_not_an_action(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=25), userFraction=0.01,
                                             google=FakeGoogle(tracks={'production': [
                                                 {'status': 'inProgress', 'versionCodes': ['33'],
                                                  'userFraction': 0.1}]}))
        self.assertEqual(result['outcome'], 'mismatch')
        self.assertFalse(google.puts())

    def test_idle_halted_and_unplanned_take_no_action(self):
        for releases, outcome in (([PRODUCTION_32], 'idle'),
                                  ([{'status': 'halted', 'versionCodes': ['33'], 'userFraction': 0.05}], 'halted')):
            google = FakeGoogle(tracks={'production': releases})
            self.assertEqual(play.advance(google, ledger(), None, self.policy, NOW, True)['outcome'], outcome)
            self.assertFalse(google.puts())
        result, google, _ = self.run_advance(NOW - timedelta(hours=25), steps=None, plan=None)
        self.assertEqual(result['outcome'], 'manual')
        self.assertFalse(google.puts())

    def test_without_any_published_rates_report_counts_decide(self):
        gate = self.policy['gate']
        since = NOW - timedelta(days=2)
        verdict = play.vitals(FakeReporting(report_rows()), gate, 33, 32, since, 0.5)
        self.assertEqual((verdict['decision'], verdict['source']), ('pass', 'reports'))
        self.assertEqual(verdict['stats']['crash'], {'33': 1.0, '32': 2.0})
        # At 50% the previous version's count is the expectation; halt above 2x and the floor.
        verdict = play.vitals(FakeReporting(report_rows(new_crash=9, old_crash=4)), gate, 33, 32, since, 0.5)
        self.assertEqual(verdict['decision'], 'halt')
        verdict = play.vitals(FakeReporting(report_rows(new_crash=7, old_crash=4)), gate, 33, 32, since, 0.5)
        self.assertEqual(verdict['decision'], 'pass')
        # A small rollout scales the expectation down, leaving the floor.
        verdict = play.vitals(FakeReporting(report_rows(new_anr=4, old_anr=40)), gate, 33, 32, since, 0.05)
        self.assertEqual(verdict['decision'], 'pass')
        verdict = play.vitals(FakeReporting(report_rows(new_anr=6, old_anr=40)), gate, 33, 32, since, 0.05)
        self.assertEqual(verdict['decision'], 'halt')

    def test_rates_for_previous_version_hold_without_report_fallback(self):
        rows = vitals_rows(users=50)
        rows.update(report_rows())
        verdict = play.vitals(FakeReporting(rows), self.policy['gate'], 33, 32, NOW - timedelta(days=2), 0.5)
        self.assertEqual((verdict['decision'], verdict['source']), ('hold', 'rates'))

    def test_stale_report_counts_hold(self):
        verdict = play.vitals(FakeReporting(report_rows(), end=(2026, 10, 30)), self.policy['gate'],
                              33, 32, NOW - timedelta(days=2), 0.5)
        self.assertEqual((verdict['decision'], verdict['source']), ('hold', 'reports'))

    def test_scheduled_step_advances_on_report_counts(self):
        result, google, _ = self.run_advance(NOW - timedelta(hours=25), rows=report_rows())
        self.assertEqual((result['outcome'], result['vitals']['source']), ('set', 'reports'))
        self.assertEqual(google.puts()[0]['releases'][0]['userFraction'], 0.05)

    def test_vitals_window_uses_reporting_timezone_dates(self):
        reporting = FakeReporting(vitals_rows())
        play.vitals(reporting, self.policy['gate'], 33, 32, datetime(2026, 11, 1, 2, tzinfo=timezone.utc), 0.5)
        timeline = reporting.queries[0]['timelineSpec']
        self.assertEqual((timeline['startTime']['day'], timeline['endTime']['day'],
                          timeline['startTime']['timeZone']['id']), (31, 2, 'America/Los_Angeles'))
        self.assertEqual(reporting.queries[0]['dimensions'], ['versionCode'])

    def test_weighted_rate_ignores_other_versions(self):
        stats = play.version_stats([reporting_row(33, 'r', 0.01, 100), reporting_row(33, 'r', 0.0, 300),
                                    reporting_row(7, 'r', 0.5, 10)], 'r')
        self.assertEqual(stats[33], {'userDays': 400.0, 'rate': 0.0025})


class NoEvidenceTest(unittest.TestCase):
    def test_empty_report_counts_hold_instead_of_proving_health(self):
        reporting = FakeReporting({})
        result = play.vitals(reporting, play.load_policy()['gate'], 33, 32, NOW - timedelta(days=2), 0.01)
        self.assertEqual(result['decision'], 'hold')


class LedgerTest(unittest.TestCase):
    def test_latest_matches_version_and_decodes_payload(self):
        log = ledger([deployment(NOW, userFraction=0.01),
                      {**deployment(NOW, userFraction=0.05), 'id': 2},
                      {**deployment(NOW, versionCode=34), 'id': 3}])
        log.github.deployments[1]['payload'] = json.dumps(log.github.deployments[1]['payload'])
        found, payload = log.latest(33)
        self.assertEqual((found['id'], payload['userFraction']), (2, 0.05))
        self.assertEqual(log.latest(35), (None, None))

    def test_record_creates_deployment_and_success_status(self):
        log = ledger()
        log.record('play-internal', 'android-v1.0.33', {'versionCode': 33}, 'android-v1.0.33 completed')
        (create, status) = [call for call in log.github.calls if call[0] == 'POST']
        self.assertEqual((create[2]['task'], create[2]['environment'], create[2]['production_environment']),
                         (play.LEDGER_TASK, 'play-internal', False))
        self.assertEqual((status[1], status[2]['state']), ('/repos/kzahel/web-server-chrome/deployments/1/statuses', 'success'))


class CandidateTest(unittest.TestCase):
    def make(self, root, **change):
        bundle = root / 'app-release.aab'
        bundle.write_bytes(BUNDLE)
        receipt = play.make_receipt(bundle, 'a' * 40, '123', 'android-v1.0.33',
                                    '    versionCode = 33\n    versionName = "1.0.33"\n')
        (root / 'build.json').write_text(json.dumps({**receipt, **change}))
        build = hashlib.sha256((root / 'build.json').read_bytes()).hexdigest()
        (root / 'SHA256SUMS').write_text(f'{DIGEST}  ./{bundle.name}\n{build}  ./build.json\n')

    def verify(self, root, run_id='123', tag='android-v1.0.33'):
        return play.verify_candidate(root, 'a' * 40, run_id, tag, '1.0.33', 33)

    def test_receipt_round_trip_and_mismatches(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.make(root)
            self.assertEqual(self.verify(root), (BUNDLE, DIGEST))
            with self.assertRaisesRegex(ValueError, 'runId'):
                self.verify(root, run_id='124')
            with self.assertRaisesRegex(ValueError, 'tag'):
                self.verify(root, tag='android-v1.0.34')
            self.make(root, package='org.example')
            with self.assertRaisesRegex(ValueError, 'package'):
                self.verify(root)
            self.make(root)
            (root / 'app-release.aab').write_bytes(b'tampered')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                self.verify(root)
            self.make(root)
            (root / 'build.json').write_text((root / 'build.json').read_text() + ' ')
            with self.assertRaisesRegex(ValueError, 'receipt checksum'):
                self.verify(root)

    def test_receipt_rejects_wrong_tag_or_name(self):
        with tempfile.TemporaryDirectory() as temp:
            bundle = Path(temp) / 'app-release.aab'
            bundle.write_bytes(BUNDLE)
            gradle = '    versionCode = 33\n    versionName = "1.0.33"\n'
            with self.assertRaisesRegex(ValueError, 'Tag'):
                play.make_receipt(bundle, 'a' * 40, '1', 'android-v1.0.34', gradle)
            other = bundle.with_name('wrong-name.aab')
            other.write_bytes(BUNDLE)
            with self.assertRaisesRegex(ValueError, 'named'):
                play.make_receipt(other, 'a' * 40, '1', '', gradle)


class ProvenanceTest(unittest.TestCase):
    build = {'id': 9, 'head_repository': {'full_name': 'kzahel/web-server-chrome'}, 'event': 'push',
           'head_branch': 'android-v1.0.33', 'head_sha': 'a' * 40, 'path': play.BUILD_WORKFLOW,
           'status': 'completed', 'conclusion': 'success'}

    def test_selects_successful_tag_build_for_exact_commit(self):
        later = {**self.build, 'id': 11}
        self.assertEqual(play.select_build_run([self.build, later], 'kzahel/web-server-chrome', 'android-v1.0.33',
                                               'a' * 40)['id'], 11)
        for change in ({'event': 'workflow_dispatch'}, {'head_sha': 'b' * 40}, {'conclusion': 'failure'},
                       {'head_repository': {'full_name': 'fork/web-server-chrome'}}, {'path': '.github/workflows/x.yml'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                play.select_build_run([{**self.build, **change}], 'kzahel/web-server-chrome', 'android-v1.0.33', 'a' * 40)

    def test_requires_successful_main_ci_for_exact_source(self):
        ci = {**self.build, 'head_branch': 'main', 'path': play.CI_WORKFLOW}
        history = {'a' * 40: [], 'b' * 40: ['compat/deliveries.json', 'compat/captures/x/hello.json'],
                   'c' * 40: ['compat/deliveries.json', 'scripts/android-play.py']}

        def found(*runs):
            run = play.source_ci(list(runs), 'kzahel/web-server-chrome', history.get)
            return run and run['head_sha']

        self.assertEqual(found(ci), 'a' * 40)
        self.assertEqual(found(ci, {**ci, 'id': 12, 'head_sha': 'b' * 40}), 'a' * 40)
        self.assertIsNone(found({**ci, 'id': 12, 'head_sha': 'b' * 40}))
        for change in ({'conclusion': 'cancelled'}, {'head_branch': 'feature'}, {'event': 'pull_request'},
                       {'head_sha': 'c' * 40}, {'head_sha': 'd' * 40},
                       {'head_repository': {'full_name': 'fork/web-server-chrome'}}):
            with self.subTest(change=change):
                self.assertIsNone(found({**ci, **change}))

    def test_tag_format(self):
        self.assertEqual(play.tag_version('android-v1.0.33'), '1.0.33')
        for tag in ('v1.0.33', 'android-v1.0', 'android-v01.0.1', 'android-v1.0.33;x'):
            with self.assertRaises(ValueError):
                play.tag_version(tag)


class NotesAndPolicyTest(unittest.TestCase):
    def test_changelog_section_becomes_plain_bullets(self):
        changelog = ('# Android Changelog\n\n## [1.0.33]\n\n- Enable R8 so the app is\n  smaller.\n\n'
                     '- Fix a crash.\n\n## [1.0.32]\n\n- Old.\n')
        self.assertEqual(play.play_notes(changelog, '1.0.33'), '• Enable R8 so the app is smaller.\n• Fix a crash.')
        with self.assertRaisesRegex(ValueError, '500'):
            play.play_notes('## [1.0.33]\n\n- ' + 'x' * 600 + '\n', '1.0.33')

    def test_policy_plans_are_well_formed(self):
        policy = play.load_policy()
        self.assertIn('standard-7d', policy['plans'])
        for steps in ([{'fraction': 0.5, 'minHours': 1}, {'fraction': 0.2, 'minHours': 1}, {'fraction': 1.0}],
                      [{'fraction': 0.5, 'minHours': 1}],
                      [{'fraction': 0.5}, {'fraction': 1.0}]):
            with self.assertRaises(ValueError):
                play.check_plan('bad', steps)

    def test_privileged_workflows_pin_actions_and_scope_credentials(self):
        workflows = ROOT / '.github/workflows'
        for name in ('android-ci.yml', 'android-play-publish.yml', 'android-play-rollout.yml',
                     'android-play-advance.yml'):
            text = (workflows / name).read_text()
            for line in text.splitlines():
                match = re.match(r'\s*(?:-\s*)?uses:\s+([^\s#]+)', line)
                if match:
                    self.assertRegex(match[1], r'^[\w.-]+/[\w./-]+@[a-f0-9]{40}$', f'{name}: {line}')
            if name != 'android-ci.yml':
                self.assertIn("if: github.ref == 'refs/heads/main'", text)
                self.assertIn('group: android-play\n', text)
                self.assertIn('persist-credentials: false', text)
        build = (workflows / 'android-ci.yml').read_text()
        self.assertNotIn('id-token', build)
        self.assertNotIn('ANDROID_PLAY', build)


if __name__ == '__main__':
    unittest.main()

class LocalizedReleaseNotesTest(unittest.TestCase):
    def test_localized_notes_preserve_verified_english_and_bound_every_language(self):
        self.assertEqual(play.localized_release_notes('English', {'de-DE': 'Deutsch'}),
                         [{'language': 'de-DE', 'text': 'Deutsch'}, {'language': 'en-US', 'text': 'English'}])
        for invalid in [{'en-US': 'Different'}, {'de-DE': ''}, {'de-DE': 'x' * 501}, {'../en': 'Bad'}, {'de-DE': 42}, []]:
            with self.assertRaises(ValueError):
                play.localized_release_notes('English', invalid)

    def test_publication_places_localized_notes_on_the_same_verified_release(self):
        google = FakeGoogle(bundles=[{'versionCode': 33, 'sha256': DIGEST}])
        play.publish(google, 'internal', 'completed', 33, '1.0.33', BUNDLE, DIGEST, 'English', translations={'de-DE': 'Deutsch'})
        self.assertEqual(google.puts()[0]['releases'][0]['releaseNotes'],
                         [{'language': 'de-DE', 'text': 'Deutsch'}, {'language': 'en-US', 'text': 'English'}])
