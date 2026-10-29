#!/usr/bin/env python3
"""Publish verified Android release bundles to Google Play and stage rollouts.

Every Play change is one transactional edit, validated before commit and
deleted when anything fails before commit. A commit is never retried: its
outcome may be unknown, so reconcile in Play Console first. GitHub
deployments in the play-internal and play-production environments record
each change and pin the rollout plan approved at promotion.
"""
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
GRADLE = Path('android/app/build.gradle.kts')
CHANGELOG = Path('android/CHANGELOG.md')


def read_version(text):
    names = re.findall(r'^\s*versionName = "([^"\n]+)"\s*$', text, re.M)
    codes = re.findall(r'^\s*versionCode = ([0-9]+)\s*$', text, re.M)
    if len(names) != 1 or len(codes) != 1:
        raise ValueError('Expected exactly one versionName and versionCode')
    if not re.fullmatch(r'(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)', names[0]):
        raise ValueError('Expected a three-part Android version')
    code = int(codes[0])
    if not 1 <= code <= 2100000000:
        raise ValueError('versionCode is outside the Play range')
    return names[0], code


def release_notes(changelog, version):
    matches = list(re.finditer(r'^## \[' + re.escape(version) + r'\](?:\s.*)?$', changelog, re.M))
    if len(matches) != 1:
        raise ValueError(f'Changelog needs exactly one ## [{version}] section')
    notes = re.split(r'^## ', changelog[matches[0].end():], maxsplit=1, flags=re.M)[0].strip()
    if not notes:
        raise ValueError('Release notes must not be empty')
    return notes


PACKAGE = 'app.ok200.android'
PUBLISHER = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE}'
UPLOAD = f'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PACKAGE}'
REPORTING = f'https://playdeveloperreporting.googleapis.com/v1beta1/apps/{PACKAGE}'
GITHUB_API = 'https://api.github.com'
TRACKS = ('internal', 'production')
STATUSES = ('check', 'draft', 'completed', 'inProgress')
ACTIONS = ('set', 'halt', 'resume', 'complete')
LEDGER_TASK = 'play-release'
POLICY = ROOT / 'android/play-rollout.json'
BUILD_WORKFLOW = '.github/workflows/android-ci.yml'
CI_WORKFLOW = '.github/workflows/ci.yml'
TAG = re.compile(r'android-v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))\Z')
MAX_NOTES = 500
REPORTING_ZONE = 'America/Los_Angeles'
EPSILON = 1e-9


def tag_version(tag):
    match = TAG.fullmatch(tag)
    if not match:
        raise ValueError('Use a release tag such as android-v1.0.33')
    return match[1]


def bundle_name(version_name):
    return 'app-release.aab'


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def play_notes(changelog, version):
    """Turn one changelog section into Play's plain-text release notes."""
    items = []
    for line in release_notes(changelog, version).splitlines():
        line = line.strip()
        if not line:
            items.append(None)
        elif line.startswith('- '):
            items.append(['• ' + line[2:]])
        elif items and items[-1] is not None:
            items[-1].append(line)
        else:
            items.append([line])
    notes = '\n'.join(' '.join(item) for item in items if item)
    return check_notes(notes)


def check_notes(notes):
    notes = notes.strip()
    if not notes:
        raise ValueError('Release notes must not be empty')
    if len(notes) > MAX_NOTES:
        raise ValueError(f'Release notes have {len(notes)} characters; Play allows {MAX_NOTES}. '
                         'Shorten the changelog section or supply release notes explicitly')
    return notes


def localized_release_notes(english, translations=None):
    notes = {'en-US': check_notes(english)}
    if translations is not None:
        if not isinstance(translations, dict) or not 1 <= len(translations) <= 100:
            raise ValueError('Localized release notes must be a bounded language-to-text object')
        for language, text in translations.items():
            if not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', language) or not isinstance(text, str):
                raise ValueError('Invalid localized release note')
            notes[language] = check_notes(text)
        if notes['en-US'] != check_notes(english):
            raise ValueError('Localized English release notes differ from the verified changelog')
    return [{'language': language, 'text': text} for language, text in sorted(notes.items())]


def check_fraction(fraction):
    if fraction is None or not 0 < fraction < 1:
        raise ValueError('A staged rollout fraction must be between 0 and 1, exclusive')
    return fraction


def load_policy(path=POLICY):
    policy = json.loads(Path(path).read_text())
    for name, steps in policy['plans'].items():
        check_plan(name, steps)
    gate = policy['gate']
    if gate['minUserDays'] < 1 or gate['maxRegressionFactor'] <= 1:
        raise ValueError('Gate needs a positive user minimum and a regression factor above 1')
    if set(gate['maxRate']) != {'crash', 'anr'}:
        raise ValueError('Gate needs crash and ANR rate limits')
    if gate['reports']['floor'] < 0 or gate['reports']['maxRegressionFactor'] <= 1:
        raise ValueError('Report-count gate needs a non-negative floor and a factor above 1')
    return policy


def check_plan(name, steps):
    fractions = [step['fraction'] for step in steps]
    if not steps or fractions != sorted(set(fractions)) or fractions[-1] != 1.0 or fractions[0] <= 0:
        raise ValueError(f'Plan {name} must strictly increase to a final 1.0 step')
    if any(not isinstance(step.get('minHours'), int) or step['minHours'] < 1 for step in steps[:-1]):
        raise ValueError(f'Plan {name} needs a positive whole minHours on every step before 1.0')


def plan_position(steps, fraction):
    """Return (hours to dwell at fraction, next fraction) for a pinned plan."""
    reached = [step for step in steps if step['fraction'] <= fraction + EPSILON]
    following = [step for step in steps if step['fraction'] > fraction + EPSILON]
    dwell = (reached[-1] if reached else steps[0])['minHours']
    return dwell, following[0]['fraction'] if following else 1.0


# Build receipt and candidate verification; no credentials involved.

def make_receipt(bundle, source, run_id, tag, gradle_text):
    version_name, version_code = read_version(gradle_text)
    if tag and tag_version(tag) != version_name:
        raise ValueError('Tag does not match the Gradle versionName')
    if bundle.name != bundle_name(version_name):
        raise ValueError(f'Bundle must be named {bundle_name(version_name)}')
    return {'schema': 1, 'package': PACKAGE, 'source': source, 'runId': str(run_id), 'tag': tag,
            'versionName': version_name, 'versionCode': version_code,
            'bundle': bundle.name, 'bundleSha256': sha256(bundle.read_bytes())}


def verify_candidate(directory, source, run_id, tag, version_name, version_code):
    receipt = json.loads((directory / 'build.json').read_text())
    expected = {'schema': 1, 'package': PACKAGE, 'source': source, 'runId': str(run_id), 'tag': tag,
                'versionName': version_name, 'versionCode': int(version_code),
                'bundle': bundle_name(version_name)}
    for key, value in expected.items():
        if receipt.get(key) != value:
            raise ValueError(f'Candidate receipt differs: {key}')
    data = (directory / receipt['bundle']).read_bytes()
    digest = sha256(data)
    sums = {}
    for line in (directory / 'SHA256SUMS').read_text().splitlines():
        value, name = line.split(maxsplit=1)
        sums[name.removeprefix('./')] = value
    if not (digest == receipt['bundleSha256'] == sums.get(receipt['bundle'])):
        raise ValueError('Candidate checksum differs')
    if sums.get('build.json') != sha256((directory / 'build.json').read_bytes()):
        raise ValueError('Candidate receipt checksum differs')
    return data, digest


def select_build_run(runs, repository, tag, source):
    matches = [run for run in runs
               if run.get('head_repository', {}).get('full_name') == repository
               and run.get('event') == 'push' and run.get('head_branch') == tag
               and run.get('head_sha') == source and run.get('path') == BUILD_WORKFLOW
               and run.get('status') == 'completed' and run.get('conclusion') == 'success']
    if not matches:
        raise ValueError(f'No successful tag-push Android Release run for {tag} at {source}')
    return max(matches, key=lambda run: run['id'])


def source_ci(runs, repository, changed_paths):
    """Return a successful main CI run covering the tagged source, or None.

    A run qualifies only for the tagged source tree. changed_paths(sha)
    returns paths changed since the source, or None for unrelated history.
    """
    for run in sorted(runs, key=lambda run: run['id'], reverse=True):
        if (run.get('head_repository', {}).get('full_name') == repository
                and run.get('head_branch') == 'main'
                and run.get('event') in ('push', 'workflow_dispatch')
                and run.get('path') == CI_WORKFLOW
                and run.get('status') == 'completed' and run.get('conclusion') == 'success'):
            paths = changed_paths(run['head_sha'])
            if paths is not None and not paths:
                return run
    return None


def changed_since(source, sha):
    if sha == source:
        return []
    try:
        git('merge-base', '--is-ancestor', source, sha)
    except subprocess.CalledProcessError:
        return None
    return git('diff', '--name-only', source, sha).splitlines()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def resolve_tag(tag):
    """Resolve the tag to a main commit and read its version; never trust a supplied SHA."""
    version = tag_version(tag)
    git('fetch', '--no-tags', '--force', 'origin', f'refs/tags/{tag}:refs/tags/{tag}',
        '+refs/heads/main:refs/remotes/origin/main')
    source = git('rev-parse', f'refs/tags/{tag}^{{commit}}')
    try:
        git('merge-base', '--is-ancestor', source, 'refs/remotes/origin/main')
    except subprocess.CalledProcessError:
        raise ValueError(f'{tag} is not on main') from None
    name, code = read_version(git('show', f'{source}:{GRADLE}'))
    if name != version:
        raise ValueError('Tag does not match the tagged Gradle versionName')
    return source, name, code


# Google and GitHub HTTP clients. Response bodies and headers are never
# logged; only the API's own error status and message are surfaced.

class Http:
    def __init__(self, token, base=''):
        if not token:
            raise ValueError('An access token is required')
        self.token = token
        self.base = base

    def call(self, method, url, body=None, upload=False):
        headers = {'Authorization': f'Bearer {self.token}', 'Accept': 'application/json'}
        if upload:
            data = body
            headers['Content-Type'] = 'application/octet-stream'
        else:
            data = None if body is None else json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        request = Request(self.base + url, data=data, method=method, headers=headers)
        try:
            with urlopen(request, timeout=300 if upload else 60) as response:
                content = response.read()
                return json.loads(content) if content else {}
        except HTTPError as error:
            raise RuntimeError(f'{method} {url.split("?")[0]}: HTTP {error.code} {api_error(error)}') from None


def api_error(error):
    try:
        detail = json.loads(error.read())
    except (ValueError, OSError):
        return ''
    if isinstance(detail.get('error'), dict):
        detail = detail['error']
    return f"{detail.get('status', '')} {str(detail.get('message', ''))[:300]}".strip()


class Edit:
    def __init__(self, google):
        self.google = google
        self.id = google.call('POST', f'{PUBLISHER}/edits', {})['id']
        self.path = f'/edits/{quote(self.id, safe="")}'
        self.commit_attempted = False

    def get(self, path):
        return self.google.call('GET', PUBLISHER + self.path + path)

    def put(self, path, body):
        return self.google.call('PUT', PUBLISHER + self.path + path, body)

    def upload_bundle(self, data):
        return self.google.call('POST', f'{UPLOAD}{self.path}/bundles?uploadType=media', data, upload=True)

    def commit(self):
        self.google.call('POST', f'{PUBLISHER}{self.path}:validate', {})
        # A failure past this point has an unknown outcome; never retry or
        # delete. Reconcile in Play Console before dispatching again.
        self.commit_attempted = True
        self.google.call('POST', f'{PUBLISHER}{self.path}:commit?changesNotSentForReview=false'
                         '&changesInReviewBehavior=ERROR_IF_IN_REVIEW', {})


@contextmanager
def edit(google):
    transaction = Edit(google)
    try:
        yield transaction
    finally:
        if not transaction.commit_attempted:
            try:
                google.call('DELETE', PUBLISHER + transaction.path)
            except Exception:
                print('Could not discard the uncommitted edit; reconcile in Play Console', file=sys.stderr)


def codes(release):
    return [int(code) for code in release.get('versionCodes', [])]


def summarize(releases):
    return [{'status': release.get('status'), 'versionCodes': codes(release),
             'userFraction': release.get('userFraction')} for release in releases]


def track_releases(transaction, track):
    return transaction.get(f'/tracks/{track}').get('releases', [])


def completed_code(releases):
    return next((codes(release)[0] for release in releases
                 if release.get('status') == 'completed' and codes(release)), None)


# Play operations.

def publish(google, track, status, version_code, version_name, bundle, digest, notes, fraction=None, translations=None):
    if track not in TRACKS or status not in STATUSES:
        raise ValueError('Unsupported track or release status')
    if status == 'inProgress':
        if track != 'production':
            raise ValueError('Staged rollouts apply to production')
        check_fraction(fraction)
    elif fraction is not None:
        raise ValueError('A user fraction applies only to an inProgress release')
    if status != 'check':
        notes = localized_release_notes(notes, translations)
    with edit(google) as transaction:
        current = track_releases(transaction, track)
        bundles = transaction.get('/bundles').get('bundles', [])
        if status == 'check':
            return {'status': 'access_verified', 'track': track, 'releases': summarize(current),
                    'bundleKnown': any(int(b['versionCode']) == version_code for b in bundles)}
        held = next((b for b in bundles if int(b['versionCode']) == version_code), None)
        uploaded = held is None
        if uploaded:
            if track == 'production':
                raise ValueError('Publish this version to internal testing first; production '
                                 'only promotes a bundle Play already holds')
            held = transaction.upload_bundle(bundle)
        if int(held['versionCode']) != version_code or held.get('sha256') != digest:
            raise ValueError('Play bundle version/checksum differs from the candidate')
        same = [release for release in current if codes(release) == [version_code]]
        if any(release.get('status') == status
               and (status != 'inProgress' or release.get('userFraction') == fraction)
               for release in same):
            return {'status': 'unchanged', 'track': track, 'versionCode': version_code}
        own_draft = [release for release in same if release.get('status') == 'draft']
        if any(release.get('status') in ('inProgress', 'halted')
               or (release.get('status') == 'draft' and release not in own_draft)
               for release in current):
            raise ValueError('The track has an unfinished rollout or another draft; '
                             'finish it with android-play-rollout or in Play Console first')
        latest = max([0] + [code for release in current for code in codes(release)])
        if version_code < latest or (version_code == latest and not own_draft):
            raise ValueError('Refusing to replace a newer or equal release')
        release = {'name': version_name, 'versionCodes': [str(version_code)], 'status': status,
                   'releaseNotes': notes}
        if status == 'inProgress':
            release['userFraction'] = fraction
        transaction.put(f'/tracks/{track}', {'track': track, 'releases': [release]})
        transaction.commit()
        return {'status': 'draft_saved' if status == 'draft' else 'submitted', 'track': track,
                'versionCode': version_code, 'versionName': version_name, 'releaseStatus': status,
                'userFraction': fraction, 'previousVersionCode': completed_code(current),
                'sha256': digest, 'uploaded': uploaded, 'editId': transaction.id}


def rollout(google, action, version_code, fraction=None):
    if action not in ACTIONS:
        raise ValueError('Unsupported rollout action')
    with edit(google) as transaction:
        current = track_releases(transaction, 'production')
        staged = [release for release in current if codes(release) == [version_code]
                  and release.get('status') in ('inProgress', 'halted')]
        if len(staged) != 1:
            raise ValueError(f'No staged production rollout for version code {version_code}')
        release = dict(staged[0])
        before = {'status': release['status'], 'userFraction': release.get('userFraction')}
        if action == 'set':
            check_fraction(fraction)
            if release['status'] != 'inProgress':
                raise ValueError('Resume the halted rollout before changing its fraction')
            if fraction < before['userFraction'] - EPSILON:
                raise ValueError('Rollout fractions only increase; halt the rollout instead')
            if abs(fraction - before['userFraction']) <= EPSILON:
                return {'status': 'unchanged', 'versionCode': version_code, 'before': before, 'after': before}
            release['userFraction'] = fraction
        elif action == 'halt':
            if release['status'] == 'halted':
                return {'status': 'unchanged', 'versionCode': version_code, 'before': before, 'after': before}
            release['status'] = 'halted'
        elif action == 'resume':
            if release['status'] == 'inProgress':
                return {'status': 'unchanged', 'versionCode': version_code, 'before': before, 'after': before}
            release.update(status='inProgress', userFraction=check_fraction(
                fraction if fraction is not None else before['userFraction']))
        else:
            release['status'] = 'completed'
            release.pop('userFraction', None)
        transaction.put('/tracks/production', {'track': 'production', 'releases': [release]})
        transaction.commit()
        after = {'status': release['status'], 'userFraction': release.get('userFraction')}
        return {'status': 'submitted', 'versionCode': version_code, 'before': before, 'after': after,
                'editId': transaction.id}


# Ledger: one GitHub deployment per served Play change.

class Ledger:
    def __init__(self, github, repository, run_url=''):
        self.github = github
        self.repository = repository
        self.run_url = run_url

    def record(self, environment, tag, payload, description):
        deployment = self.github.call('POST', f'/repos/{self.repository}/deployments', {
            'ref': tag, 'task': LEDGER_TASK, 'environment': environment, 'auto_merge': False,
            'required_contexts': [], 'payload': payload, 'description': description[:140],
            'production_environment': environment == 'play-production', 'transient_environment': False,
        })
        self.github.call('POST', f'/repos/{self.repository}/deployments/{deployment["id"]}/statuses', {
            'state': 'success', 'description': description[:140], 'log_url': self.run_url,
            'auto_inactive': True,
        })
        return deployment['id']

    def latest(self, version_code):
        deployments = self.github.call(
            'GET', f'/repos/{self.repository}/deployments?environment=play-production'
            f'&task={LEDGER_TASK}&per_page=100')
        for deployment in deployments:
            payload = deployment.get('payload') or {}
            if isinstance(payload, str):
                payload = json.loads(payload)
            if payload.get('versionCode') == version_code:
                return deployment, payload
        return None, None


def describe(status, fraction):
    return f'{status} {fraction:.0%}' if fraction is not None else status


# Vitals gate.

def reporting_date(value):
    local = value.astimezone(ZoneInfo(REPORTING_ZONE)).date()
    return {'year': local.year, 'month': local.month, 'day': local.day}


def as_date(value):
    return date(value['year'], value['month'], value['day'])


def daily_end(reporting, metric_set):
    info = reporting.call('GET', f'{REPORTING}/{metric_set}')
    for freshness in info.get('freshnessInfo', {}).get('freshnesses', []):
        if freshness.get('aggregationPeriod') == 'DAILY':
            return {key: freshness['latestEndTime'][key] for key in ('year', 'month', 'day')}
    print(f'{metric_set} freshness: {json.dumps(info.get("freshnessInfo"))[:500]}', file=sys.stderr)
    return None


def query_rows(reporting, metric_set, metrics, dimensions, start, end):
    zone = {'id': REPORTING_ZONE}
    body = {'timelineSpec': {'aggregationPeriod': 'DAILY', 'startTime': {**start, 'timeZone': zone},
                             'endTime': {**end, 'timeZone': zone}},
            'dimensions': dimensions, 'metrics': metrics, 'pageSize': 1000}
    rows = []
    while True:
        page = reporting.call('POST', f'{REPORTING}/{metric_set}:query', body)
        rows.extend(page.get('rows', []))
        if not page.get('nextPageToken'):
            print(f'{metric_set}: {len(rows)} rows', file=sys.stderr)
            return rows
        body['pageToken'] = page['nextPageToken']


def row_dimensions(row):
    return {d.get('dimension'): d.get('int64Value') or d.get('stringValue')
            for d in row.get('dimensions', [])}


def row_metrics(row):
    return {m['metric']: float(m['decimalValue']['value'])
            for m in row.get('metrics', []) if 'decimalValue' in m}


def version_stats(rows, rate):
    """User-weighted daily rate and summed daily users (user-days) per version code."""
    totals = {}
    for row in rows:
        code, values = row_dimensions(row).get('versionCode'), row_metrics(row)
        if code is None or rate not in values or 'distinctUsers' not in values:
            continue
        users, weighted = totals.get(int(code), (0.0, 0.0))
        totals[int(code)] = (users + values['distinctUsers'], weighted + values[rate] * values['distinctUsers'])
    return {code: {'userDays': users, 'rate': weighted / users if users else 0.0}
            for code, (users, weighted) in totals.items()}


REPORT_TYPES = {'CRASH': 'crash', 'APPLICATION_NOT_RESPONDING': 'anr'}


def report_stats(rows):
    """Summed daily affected users per error type and version code."""
    stats = {'crash': {}, 'anr': {}}
    for row in rows:
        dimensions, values = row_dimensions(row), row_metrics(row)
        name = REPORT_TYPES.get(dimensions.get('reportType'))
        if name and dimensions.get('versionCode') is not None and 'distinctUsers' in values:
            code = int(dimensions['versionCode'])
            stats[name][code] = stats[name].get(code, 0.0) + values['distinctUsers']
    return stats


def keep_versions(stats, *codes):
    return {name: {str(code): value for code, value in by_code.items() if code in codes}
            for name, by_code in stats.items()}


def evaluate_vitals(gate, stats, version_code, previous_code):
    """stats: {'crash': {code: {...}}, 'anr': {...}} -> pass, hold or halt with reasons."""
    halts, holds = [], []
    for name in ('crash', 'anr'):
        current = stats[name].get(version_code)
        if not current or current['userDays'] < gate['minUserDays']:
            holds.append(f'{name}: fewer than {gate["minUserDays"]} user-days for the rollout version')
            continue
        if current['rate'] > gate['maxRate'][name]:
            halts.append(f'{name}: rate {current["rate"]:.4%} exceeds {gate["maxRate"][name]:.4%}')
            continue
        baseline = stats[name].get(previous_code)
        if (baseline and baseline['userDays'] >= gate['minUserDays']
                and current['rate'] > gate['minRegressionRate']
                and current['rate'] > baseline['rate'] * gate['maxRegressionFactor']):
            halts.append(f'{name}: rate {current["rate"]:.4%} exceeds '
                         f'{gate["maxRegressionFactor"]}x previous {baseline["rate"]:.4%}')
    decision = 'halt' if halts else 'hold' if holds else 'pass'
    return {'decision': decision, 'source': 'rates', 'reasons': halts or holds,
            'stats': keep_versions(stats, version_code, previous_code)}


def evaluate_reports(gate, stats, version_code, previous_code, fraction):
    """Gate on affected-user counts when Play publishes no rates for this app.

    The previous version's count, scaled by the rollout's share of users, is
    the expectation; halt only above both the floor and the factor.
    """
    share = fraction / (1 - fraction) if fraction < 1 else 1.0
    halts = []
    for name in ('crash', 'anr'):
        current = stats[name].get(version_code, 0.0)
        expected = stats[name].get(previous_code, 0.0) * share
        limit = max(gate['floor'], expected * gate['maxRegressionFactor'])
        if current > limit:
            halts.append(f'{name}: {current:g} affected user-days exceed {limit:g} '
                         f'(previous version scaled to {fraction:.0%}: {expected:g})')
    return {'decision': 'halt' if halts else 'pass', 'source': 'reports', 'reasons': halts,
            'stats': keep_versions(stats, version_code, previous_code)}


def report_window(reporting, metric_set, start):
    end = daily_end(reporting, metric_set)
    if end is None:
        return None, f'{metric_set}: Play reports no daily freshness'
    if as_date(end) <= as_date(start):
        return None, f'{metric_set}: daily data ends {as_date(end)}, not after {as_date(start)}'
    return end, None


def vitals(reporting, gate, version_code, previous_code, since, fraction):
    start = reporting_date(since)
    stats = {}
    for name, metric_set, rate in (('crash', 'crashRateMetricSet', 'userPerceivedCrashRate'),
                                   ('anr', 'anrRateMetricSet', 'userPerceivedAnrRate')):
        end, reason = report_window(reporting, metric_set, start)
        if end is None:
            stats = None
            break
        stats[name] = version_stats(query_rows(reporting, metric_set, [rate, 'distinctUsers'],
                                               ['versionCode'], start, end), rate)
    if stats is not None:
        verdict = evaluate_vitals(gate, stats, version_code, previous_code)
        if verdict['decision'] != 'hold' or any(
                previous_code in by_code for by_code in stats.values()):
            return verdict
        rate_reasons = verdict['reasons']
    else:
        rate_reasons = [reason]
    # Play publishes no rates for this app (not even the previous version):
    # fall back to raw crash and ANR report counts.
    end, reason = report_window(reporting, 'errorCountMetricSet', start)
    if end is None:
        return {'decision': 'hold', 'source': 'reports', 'reasons': [reason], 'stats': {},
                'rateReasons': rate_reasons}
    rows = query_rows(reporting, 'errorCountMetricSet', ['errorReportCount', 'distinctUsers'],
                      ['versionCode', 'reportType'], start, end)
    if not any(row_dimensions(row).get('versionCode') in (str(version_code), str(previous_code)) for row in rows):
        return {'decision': 'hold', 'source': 'reports',
                'reasons': ['No report evidence for rollout or previous version'],
                'stats': {}, 'rateReasons': rate_reasons}
    verdict = evaluate_reports(gate['reports'], report_stats(rows), version_code, previous_code, fraction)
    verdict['rateReasons'] = rate_reasons
    return verdict


def advance(google, ledger, reporting, policy, now, act):
    """Take at most one step along the pinned plan of the current rollout."""
    with edit(google) as transaction:
        current = track_releases(transaction, 'production')
    staged = [release for release in current if release.get('status') in ('inProgress', 'halted')]
    if not staged:
        return {'outcome': 'idle', 'releases': summarize(current)}
    release = staged[0]
    version_code = codes(release)[0]
    if release['status'] == 'halted':
        return {'outcome': 'halted', 'versionCode': version_code}
    fraction = release.get('userFraction')
    deployment, payload = ledger.latest(version_code)
    if (payload is None or payload.get('status') != 'inProgress'
            or abs((payload.get('userFraction') or 0) - (fraction or 0)) > EPSILON):
        return {'outcome': 'mismatch', 'versionCode': version_code, 'play': describe('inProgress', fraction),
                'recorded': payload and describe(payload.get('status'), payload.get('userFraction')),
                'reason': 'Play differs from the last recorded step; record the current state with '
                          'android-play-rollout before automation continues'}
    steps = payload.get('steps')
    if not steps:
        return {'outcome': 'manual', 'versionCode': version_code, 'reason': 'No rollout plan was pinned'}
    since = datetime.fromisoformat(deployment['created_at'].replace('Z', '+00:00'))
    dwell, following = plan_position(steps, fraction)
    due = since + timedelta(hours=dwell)
    base = {'versionCode': version_code, 'userFraction': fraction, 'plan': payload.get('plan'),
            'next': following, 'due': due.isoformat()}
    previous = payload.get('previousVersionCode')
    if now < due:
        # A recent snapshot shows what the gate will see; it decides nothing.
        snapshot = vitals(reporting, policy['gate'], version_code, previous, now - timedelta(days=21),
                          fraction)
        return {'outcome': 'waiting', **base, 'vitals': snapshot}
    gate = vitals(reporting, policy['gate'], version_code, previous, since, fraction)
    base['vitals'] = gate
    if gate['decision'] == 'hold':
        return {'outcome': 'hold', **base}
    action = 'halt' if gate['decision'] == 'halt' else 'complete' if following >= 1.0 else 'set'
    if not act:
        return {'outcome': f'would_{action}', **base}
    result = rollout(google, action, version_code, following if action == 'set' else None)
    after = result['after']
    ledger.record('play-production', payload['tag'], {
        **payload, 'status': after['status'], 'userFraction': after['userFraction'],
        'action': f'advance:{action}', 'vitals': gate['stats']},
        f"{payload['tag']} {describe(after['status'], after['userFraction'])} (scheduled)")
    return {'outcome': action, **base, 'result': result}


# Command line.

def github_ledger():
    server = os.environ.get('GITHUB_SERVER_URL', 'https://github.com')
    repository = os.environ['GITHUB_REPOSITORY']
    run_url = f"{server}/{repository}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '')}"
    return Ledger(Http(os.environ.get('GITHUB_TOKEN'), GITHUB_API), repository, run_url)


def write_output(values):
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        for key, value in values.items():
            output.write(f'{key}<<PLAY_EOF\n{value}\nPLAY_EOF\n')


def emit(result, path):
    text = json.dumps(result, indent=2, sort_keys=True) + '\n'
    if path:
        Path(path).write_text(text)
    print(text, end='')


def command_access(args):
    """Verify app-scoped Publisher and Reporting access without committing an edit."""
    google = Http(os.environ.get('PLAY_ACCESS_TOKEN'))
    with edit(google) as transaction:
        releases = track_releases(transaction, args.track)
    reporting = {}
    for metric_set in ('crashRateMetricSet', 'anrRateMetricSet', 'errorCountMetricSet'):
        info = google.call('GET', f'{REPORTING}/{metric_set}')
        reporting[metric_set] = {'name': info.get('name'), 'freshnessInfo': info.get('freshnessInfo', {})}
    emit({'status': 'access_verified', 'package': PACKAGE, 'track': args.track,
          'releases': summarize(releases), 'reporting': reporting, 'committed': False}, args.receipt)


def command_receipt(args):
    receipt = make_receipt(args.bundle, args.source, args.run_id, args.tag,
                           (ROOT / GRADLE).read_text())
    args.out.write_text(json.dumps(receipt, indent=2, sort_keys=True) + '\n')
    print(json.dumps(receipt, sort_keys=True))


def command_verify(args):
    repository = os.environ['GITHUB_REPOSITORY']
    source, name, code = resolve_tag(args.tag)

    def api(path):
        return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repository}/{path}'], text=True))

    runs = api(f'actions/workflows/android-ci.yml/runs?event=push&branch={args.tag}&per_page=100')
    run = select_build_run(runs['workflow_runs'], repository, args.tag, source)
    checks = api('actions/workflows/ci.yml/runs?branch=main&status=success&per_page=100')
    ci = source_ci(checks['workflow_runs'], repository, lambda sha: changed_since(source, sha))
    if ci is None:
        raise ValueError('Full CI must pass on main for the exact tagged source; re-run cancelled CI if needed')
    notes = check_notes(args.notes) if args.notes.strip() else play_notes(
        git('show', f'{source}:{CHANGELOG}'), name)
    values = {'source': source, 'run_id': run['id'], 'ci_sha': ci['head_sha'], 'ci_run_id': ci['id'],
              'version_code': code, 'version_name': name, 'notes': notes}
    write_output(values)
    print(json.dumps(values, indent=2))


def command_verify_candidate(args):
    _, digest = verify_candidate(args.candidate, args.source, args.run_id, args.tag,
                                 args.version_name, args.version_code)
    print(f'Candidate {bundle_name(args.version_name)} verified: {digest}')


def command_publish(args):
    policy = load_policy()
    steps = None
    if args.status == 'inProgress' and args.plan != 'none':
        if args.plan not in policy['plans']:
            raise ValueError(f'Unknown rollout plan {args.plan}')
        steps = policy['plans'][args.plan]
    data, digest = verify_candidate(args.candidate, args.source, args.run_id, args.tag,
                                    args.version_name, args.version_code)
    result = publish(Http(os.environ.get('PLAY_ACCESS_TOKEN')), args.track, args.status,
                     args.version_code, args.version_name, data, digest,
                     args.notes_file.read_text(), args.fraction,
                     json.loads(args.localized_notes_file.read_text()) if args.localized_notes_file else None)
    result.update(tag=args.tag, source=args.source, buildRunId=args.run_id)
    if result['status'] == 'submitted':
        payload = {'versionCode': args.version_code, 'versionName': args.version_name, 'tag': args.tag,
                   'source': args.source, 'sha256': digest, 'status': args.status,
                   'userFraction': args.fraction, 'previousVersionCode': result['previousVersionCode'],
                   'plan': args.plan if steps else None, 'steps': steps, 'action': 'publish'}
        environment = f'play-{args.track}'
        result['deployment'] = github_ledger().record(
            environment, args.tag, payload, f'{args.tag} {describe(args.status, args.fraction)}')
    emit(result, args.receipt)


def command_rollout(args):
    _, name, code = resolve_tag(args.tag)
    result = rollout(Http(os.environ.get('PLAY_ACCESS_TOKEN')), args.action, code, args.fraction)
    result.update(tag=args.tag, action=args.action)
    ledger = github_ledger()
    _, payload = ledger.latest(code)
    after = result['after']
    if result['status'] == 'submitted' or payload is None or payload.get('status') != after['status'] \
            or payload.get('userFraction') != after['userFraction']:
        # Also re-record an unchanged state that the ledger lacks, so a
        # Console change can be acknowledged before automation resumes.
        payload = {**(payload or {'versionCode': code, 'versionName': name, 'tag': args.tag,
                                  'plan': None, 'steps': None}),
                   'status': after['status'], 'userFraction': after['userFraction'],
                   'action': f'rollout:{args.action}'}
        result['deployment'] = ledger.record(
            'play-production', args.tag, payload,
            f'{args.tag} {describe(after["status"], after["userFraction"])}')
    emit(result, args.receipt)


def command_advance(args):
    result = advance(Http(os.environ.get('PLAY_ACCESS_TOKEN')), github_ledger(),
                     Http(os.environ.get('PLAY_ACCESS_TOKEN')), load_policy(),
                     datetime.now(timezone.utc), args.mode == 'act')
    result['mode'] = args.mode
    emit(result, args.receipt)
    if result['outcome'] == 'mismatch':
        return 2
    if result['outcome'] in ('halt', 'would_halt'):
        return 3
    return 0


def fraction_argument(value):
    return None if value in (None, '') else float(value)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)

    access = commands.add_parser('access', help='verify app-scoped store and vitals access without a release')
    access.add_argument('--track', choices=TRACKS, required=True)
    access.add_argument('--receipt', type=Path)
    access.set_defaults(run=command_access)

    receipt = commands.add_parser('receipt', help='write build.json for a signed release bundle')
    receipt.add_argument('--bundle', type=Path, required=True)
    receipt.add_argument('--source', required=True)
    receipt.add_argument('--run-id', required=True)
    receipt.add_argument('--tag', default='')
    receipt.add_argument('--out', type=Path, required=True)
    receipt.set_defaults(run=command_receipt)

    verify = commands.add_parser('verify', help='verify tag provenance and CI; no Play access')
    verify.add_argument('--tag', required=True)
    verify.add_argument('--notes', default='')
    verify.set_defaults(run=command_verify)

    for name, runner in (('verify-candidate', command_verify_candidate), ('publish', command_publish)):
        sub = commands.add_parser(name)
        sub.add_argument('--candidate', type=Path, required=True)
        sub.add_argument('--tag', required=True)
        sub.add_argument('--source', required=True)
        sub.add_argument('--run-id', required=True)
        sub.add_argument('--version-name', required=True)
        sub.add_argument('--version-code', type=int, required=True)
        sub.set_defaults(run=runner)
        if name == 'publish':
            sub.add_argument('--track', choices=TRACKS, required=True)
            sub.add_argument('--status', choices=STATUSES, required=True)
            sub.add_argument('--fraction', type=fraction_argument)
            sub.add_argument('--plan', default='none')
            sub.add_argument('--notes-file', type=Path, required=True)
            sub.add_argument('--localized-notes-file', type=Path,
                             help='Optional language-to-text JSON; English must match the verified notes')
            sub.add_argument('--receipt', type=Path)

    roll = commands.add_parser('rollout', help='set, halt, resume or complete a production rollout')
    roll.add_argument('--tag', required=True)
    roll.add_argument('--action', choices=ACTIONS, required=True)
    roll.add_argument('--fraction', type=fraction_argument)
    roll.add_argument('--receipt', type=Path)
    roll.set_defaults(run=command_rollout)

    step = commands.add_parser('advance', help='take one scheduled step along the pinned plan')
    step.add_argument('--mode', choices=('report', 'act'), default='report')
    step.add_argument('--receipt', type=Path)
    step.set_defaults(run=command_advance)

    args = parser.parse_args(argv)
    return args.run(args) or 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        raise SystemExit(f'error: {error}') from None
