#!/usr/bin/env python3
"""Freeze and inspect the supervised locale queue. Never starts model workers."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

from localization import workspace
from localization_common import Invalid, atomic_write, digest, json_text, read_json
from translation_terms import terminology
from localization_qualification import qualification_inputs, qualification_commands, qualification_harness, HARNESS

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path('localization/campaigns/remaining-app-languages.json')
SURFACES = ['web', 'desktop', 'extension', 'android', 'ios']
SETTINGS = {'model': 'gpt-6.1-sol', 'effort': 'high', 'serviceTier': 'normal',
            'permissionMode': 'acceptEdits', 'concurrency': 2, 'batchSize': 80,
            'jobsPerWorker': 3, 'timeoutSeconds': 1800}
IMPLEMENTATION = [
    'localization/glossary.json', 'scripts/localization-campaign.py',
    'scripts/localization.py', 'scripts/localization_common.py',
    'scripts/localization_android.py', 'scripts/localization_apple.py',
    'scripts/localization_workers.py', 'scripts/localization-codex.py',
    'scripts/translation_terms.py', 'scripts/localization_front.py', 'scripts/localization_qualification.py',
    'scripts/localization-icu.mjs', 'scripts/generate-localization.mjs',
    'scripts/check-localization.mjs', 'scripts/check-native-localization.py',
    'scripts/qualify-localization.mjs', 'android/scripts/localization-smoke.sh',
    'ios/scripts/check.sh', 'desktop/scripts/check.sh',
    'extension/scripts/check.sh', 'extension/scripts/browser-check.sh',
]
IMPLEMENTATION = list(dict.fromkeys(IMPLEMENTATION + HARNESS))


def contained(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise Invalid('Campaign paths must stay within the repository')
    return path


def state_path(root, relative):
    path = contained(root, relative)
    if not path.is_relative_to((root / '.local').resolve()) or path == (root / '.local').resolve():
        raise Invalid('Campaign state needs its own directory under ignored .local/')
    return path


def validate_manifest(data, registry):
    if (data.get('schemaVersion') != 1 or data.get('platforms') != SURFACES
            or data.get('baselineLocales') != ['en', 'de']
            or data.get('targetDistribution') != 'release-input'
            or data.get('workerSettings') != SETTINGS
            or data.get('bounds') != {'minimumFreeGiB': 10, 'stopBelowFreeGiB': 4,
                                      'maximumHours': 10, 'publish': False}):
        raise Invalid('Campaign baseline, surfaces, worker settings or bounds differ')
    rows = data.get('locales', [])
    expected = set(registry['localeDefinitions']) - {'en', 'de'}
    tags = [row.get('tag') for row in rows]
    if not rows or tags[0] != 'fr' or len(tags) != len(set(tags)) or set(tags) != expected:
        raise Invalid('Queue must contain French first and all 17 remaining locales exactly once')
    for surface in SURFACES:
        if not {'en', 'de'} <= set(registry['supportedLocales'][surface]):
            raise Invalid(f'Preserve the English/German baseline: {surface}')
    for row in rows:
        tag = row['tag']
        qualifier = tag.replace('-', '-r')
        if (not re.fullmatch(r'[a-z]{2}(?:-[A-Z]{2})?', tag)
                or row.get('androidQualifier') != qualifier or row.get('direction') != 'ltr'
                or not isinstance(row.get('register'), str) or not 20 <= len(row['register']) <= 8192
                or not row.get('name')):
            raise Invalid(f'Invalid locale register/resource profile: {tag}')
        quantities = row.get('androidQuantities', [])
        if ('other' not in quantities or len(quantities) != len(set(quantities))
                or not set(quantities) <= {'zero', 'one', 'two', 'few', 'many', 'other'}):
            raise Invalid(f'Invalid quantity profile: {tag}')
        probes = row.get('systemLocaleProbes', [])
        if not probes or any(not isinstance(probe, str) or not re.fullmatch(r'[A-Za-z0-9-]{2,64}', probe) for probe in probes):
            raise Invalid(f'Missing System-language probes: {tag}')
    return data


def source_snapshot(root):
    # Apple source and target translations share files. Freeze normalized English
    # records, not entire .xcstrings documents that imports legitimately change.
    sources, counts = {}, {}
    for surface in SURFACES:
        work = workspace(root, surface, 'de')
        records = {key: {k: v for k, v in row.items() if k != 'terminologyHash'}
                   for key, row in work.source.items()}
        sources[surface] = digest(records)
        counts[surface] = len(records)
    files = {name: hashlib.sha256(contained(root, name).read_bytes()).hexdigest()
             for name in IMPLEMENTATION}
    files.update(qualification_harness(root))
    return {'sources': sources, 'files': files}, counts


def make_plan(root, manifest, work):
    registry = read_json(root / 'localization/locales.json')
    data = validate_manifest(read_json(manifest), registry)
    frozen, counts = source_snapshot(root)
    profiles = []
    for row in data['locales']:
        directory = str((work / row['tag']).relative_to(root))
        jobs = []
        for surface in SURFACES:
            exported, state = f'{directory}/{surface}', f'{directory}/{surface}-run'
            jobs.append({'surface': surface,
                'export': ['python3', 'scripts/localization.py', 'export', surface, row['tag'],
                           '--batch-size', '80', '--out-dir', exported],
                'run': ['python3', 'scripts/localization-codex.py', 'run', '--platform', surface,
                        '--locale', row['tag'], '--jobs', exported, '--work-dir', state,
                        '--model', SETTINGS['model'], '--effort', 'high', '--service-tier', 'normal',
                        '--permission-mode', 'acceptEdits', '--concurrency', '2',
                        '--jobs-per-worker', '3', '--timeout-seconds', '1800', '--import-reviewed']})
        profiles.append({**row, 'jobs': jobs,
            'qualify': ['python3', 'scripts/localization.py', 'qualify', '--locale', row['tag'],
                        '--all-surfaces', '--work-dir', directory]})
    return {'schemaVersion': 1, 'manifestHash': digest(data), 'frozenInputs': frozen,
            'sourceCounts': counts, 'resourceCount': sum(counts.values()) * len(profiles),
            'workerSettings': SETTINGS, 'locales': profiles,
            'execution': 'One supervising agent; sequential surfaces/imports/native qualification; no publication'}


def locale_runtime_check(data):
    # Use the platform's CLDR data rather than guessing quantity categories.
    script = """let text='';for await(const part of process.stdin)text+=part;
for(const row of JSON.parse(text)){
 if(Intl.getCanonicalLocales(row.tag)[0]!==row.tag)throw Error('Noncanonical '+row.tag);
 const categories=Intl.PluralRules.supportedLocalesOf([row.tag]).length && new Intl.PluralRules(row.tag).resolvedOptions().pluralCategories;
 if(JSON.stringify([...categories].sort())!==JSON.stringify([...row.androidQuantities].sort()))throw Error('Plural profile differs: '+row.tag);
 for(const probe of row.systemLocaleProbes)if(Intl.getCanonicalLocales(probe)[0]!==probe)throw Error('Noncanonical probe '+probe);
}"""
    subprocess.run(['node','--input-type=module','-e',script],input=json_text(data['locales']),
                   text=True,capture_output=True,check=True,timeout=30)


def verify_plan(root, plan, manifest, work):
    if plan != make_plan(root, manifest, work):
        raise Invalid('Source/context/profile/implementation or command drift; reconcile frozen jobs explicitly')


def profile(plan, locale):
    for row in plan['locales']:
        if row['tag'] == locale:
            return row
    raise Invalid('Choose a queued locale')


def terminology_ready(root, row):
    terms = terminology(root, row['tag'])
    if terms is None or not terms['register'].startswith(row['register']):
        return False
    schema = terminology(root, 'de')['terms']
    return set(terms['terms']) == set(schema) and all(
        value.get('sourceTerms') == schema[key]['sourceTerms'] and
        value.get('meaning') == schema[key]['meaning'] and
        isinstance(value.get('preferred'), str) and bool(value['preferred'].strip())
        for key, value in terms['terms'].items())


def completion(root, plan, work, locale):
    row = profile(plan, locale)
    if not terminology_ready(root, row):
        raise Invalid('Finish locale-specific shared terminology before recording qualification')
    registry = read_json(root / 'localization/locales.json')
    for surface in SURFACES:
        if locale not in registry['supportedLocales'][surface] or locale in registry['previewLocales'].get(surface, []):
            raise Invalid(f'Locale is not an ordinary release input: {surface}/{locale}')
        if any(workspace(root, surface, locale).report().values()):
            raise Invalid(f'Incomplete/stale/unreviewed catalog: {surface}/{locale}')
    android = read_json(root / 'localization/android/locales.json')['locales'].get(locale)
    if android != {'catalog': f'android/app/src/main/res/values-{row["androidQualifier"]}/strings.xml',
                   'quantities': row['androidQuantities']}:
        raise Invalid('Android resource destination or quantities differ from the reviewed profile')
    directory = work / locale
    evidence = read_json(directory / 'qualification.json')
    inputs = qualification_inputs(root, locale)
    if (evidence.get('schemaVersion') != 2 or evidence.get('locale') != locale
            or evidence.get('inputs') != inputs or evidence.get('harness') != qualification_harness(root)
            or evidence.get('platform') != 'darwin'
            or evidence.get('androidApis') != [28, 35]
            or not evidence.get('completedAt') or not evidence.get('limitations')
            or any(command not in evidence.get('checks', []) for command in qualification_commands(locale, directory))):
        raise Invalid('Missing/stale full five-surface macOS qualification; registration is not runtime evidence')
    return {'schemaVersion': 1, 'locale': locale, 'planHash': digest(plan),
            'inputs': inputs, 'qualificationHash': digest(evidence),
            'terminologyHash': digest(terminology(root, locale))}


def status(root, plan, work):
    registry = read_json(root / 'localization/locales.json')
    result = []
    for row in plan['locales']:
        locale = row['tag']
        surfaces = {}
        for surface in SURFACES:
            try:
                report = workspace(root, surface, locale).report()
                issues = {key: len(value) for key, value in report.items() if value}
            except (ValueError, KeyError, OSError) as error:
                issues = {'unconfiguredOrInvalid': str(error)}
            surfaces[surface] = {'issues': issues, 'reviewComplete': not issues,
                'releaseRegistered': locale in registry['supportedLocales'][surface]}
        record = work / 'completed' / f'{locale}.json'
        qualified, reason = False, 'not recorded'
        if record.exists():
            try:
                qualified = read_json(record) == completion(root, plan, work, locale)
                reason = 'current' if qualified else 'record differs from current inputs'
            except (ValueError, KeyError, OSError) as error:
                reason = str(error)
        result.append({'locale': locale, 'terminologyReady': terminology_ready(root, row),
                       'surfaces': surfaces, 'qualified': qualified, 'qualification': reason})
    return result


def environment_check(root, minimum=10):
    if os.name != 'posix':
        raise Invalid('Local worker ownership requires macOS/Linux; full qualification requires macOS')
    names = ['codex', 'node', 'pnpm', 'cargo', 'java', 'adb', 'emulator']
    missing = [name for name in names if shutil.which(name) is None]
    if missing:
        raise Invalid('Source the shell profile/Android environment; missing: ' + ', '.join(missing))
    login = subprocess.run(['codex', 'login', 'status'], capture_output=True, text=True, timeout=30)
    if login.returncode or 'Logged in using ChatGPT' not in login.stdout + login.stderr:
        raise Invalid('Existing local ChatGPT login required; no provider/account substitution')
    free = shutil.disk_usage(root).free / 1024**3
    if free < minimum:
        raise Invalid(f'Campaign requires {minimum} GiB free; available {free:.1f}')
    return {'chatgptCliLogin': True, 'freeGiB': round(free, 1), 'workersStarted': 0}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'verify', 'status', 'record', 'handoff'])
    parser.add_argument('--manifest', type=Path, default=MANIFEST)
    parser.add_argument('--work-dir', type=Path, default=Path('.local/localization-overnight'))
    parser.add_argument('--locale')
    parser.add_argument('--check-env', action='store_true')
    args = parser.parse_args(argv)
    try:
        manifest, work = contained(ROOT, args.manifest), state_path(ROOT, args.work_dir)
        locale_runtime_check(read_json(manifest))
        path = work / 'plan.json'
        if path.is_symlink():
            raise Invalid('Plan must not be a symlink')
        if args.command == 'plan':
            plan = make_plan(ROOT, manifest, work)
            if path.exists() and read_json(path) != plan:
                raise Invalid('Existing plan differs; preserve active state and reconcile or choose a new directory')
            atomic_write(path, json_text(plan))
            output = {'plan': str(path.relative_to(ROOT)), 'locales': len(plan['locales']),
                      'resources': plan['resourceCount'], 'sourceCounts': plan['sourceCounts']}
        else:
            plan = read_json(path)
            verify_plan(ROOT, plan, manifest, work)
            output = {'planCurrent': True}
            if args.command == 'status':
                output['locales'] = status(ROOT, plan, work)
            elif args.command == 'record':
                value = completion(ROOT, plan, work, args.locale)
                atomic_write(work / 'completed' / f'{args.locale}.json', json_text(value))
                output['recorded'] = args.locale
            elif args.command == 'handoff':
                handoff = work / 'supervisor.md'
                atomic_write(handoff, '# Supervised remaining-language campaign\n\n'
                    'Read AGENTS.md, CLAUDE.md, docs/topics/localization.md and '
                    'docs/runbooks/localization-overnight.md. Execute that runbook for at most 10 hours.\n\n'
                    f'Frozen plan: `{path.relative_to(ROOT)}`. State: `{work.relative_to(ROOT)}`. '
                    'Use only the reviewed argv arrays after verify; never shell-eval JSON. '
                    'Start French, then the first unqualified locale. Keep at most two local workers '
                    'total, sequential surfaces/imports and serialized native tests. Independent '
                    'translator/reviewer sessions are mandatory. Stop on quota/auth/source drift '
                    'or <4 GiB disk; no rerouting. Preserve English/German and completed locales. '
                    'Record and commit only fully qualified release inputs; follow the current '
                    'session authorization for pushes. Do not publish, sign, tag, change global '
                    'power settings, touch arbitrary physical devices, or claim full production '
                    'acceptance. Always leave a resumable checkpoint and join owned workers.\n')
                output['handoff'] = str(handoff.relative_to(ROOT))
        if args.check_env:
            output['environment'] = environment_check(ROOT, 10 if args.command in ['plan', 'handoff'] else 4)
        output['workersStartedByThisCommand'] = 0
        print(json_text(output), end='')
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f'localization campaign: {error}\n')


if __name__ == '__main__':
    main()
