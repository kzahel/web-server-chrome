"""Small campaign front door; native catalogs and offline commands remain reusable."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from localization_common import Invalid, atomic_write, digest, json_text, read_json
from localization import workspace

ROOT = Path(__file__).resolve().parents[1]

def status():
    registry = read_json(ROOT / 'localization/locales.json')
    rows = []
    for surface in registry['catalogs']:
        for locale in dict.fromkeys(registry['supportedLocales'][surface] + registry['previewLocales'].get(surface, [])):
            if locale == 'en': continue
            work = workspace(ROOT, surface, locale)
            rows.append({'surface':surface,'locale':locale,'availability':'release-input' if locale in registry['supportedLocales'][surface] else 'preview','total':len(work.source),**{key:len(value) for key,value in work.report().items()}})
    print(json_text(rows),end='')
    return 0

def main(argv):
    if argv == ['status']: return status()
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command',required=True)
    sub.add_parser('generate')
    for name in ['export','run','qualify']:
        p = sub.add_parser(name)
        p.add_argument('--locale',required=True)
        p.add_argument('--surface',action='append',choices=['web','desktop','extension','android','ios'])
        p.add_argument('--all-surfaces',action='store_true')
        p.add_argument('--work-dir',type=Path)
        if name == 'export': p.add_argument('--batch-size',type=int,default=80)
        if name == 'run':
            p.add_argument('--model',required=True)
            p.add_argument('--effort',default='high',choices=['low','medium','high','xhigh','max'])
            p.add_argument('--resume',action='store_true',help='Exact validated outputs are always reused')
            p.add_argument('--concurrency',type=int,choices=range(1,4),default=2)
    args = parser.parse_args(argv)
    if args.command == 'generate':
        subprocess.run(['node','scripts/generate-localization.mjs'],cwd=ROOT,check=True); return 0
    registry = read_json(ROOT / 'localization/locales.json')
    if args.locale == 'en' or args.locale not in registry['localeDefinitions']: raise Invalid('Choose a defined non-English locale')
    surfaces = args.surface or list(registry['catalogs'])
    directory = (args.work_dir or ROOT / '.local/localization' / args.locale).resolve()
    if not directory.is_relative_to(ROOT / '.local'): raise Invalid('Campaign state must stay under ignored .local/')
    if args.command == 'qualify':
        subprocess.run(['node','scripts/check-localization.mjs'],cwd=ROOT,check=True)
        subprocess.run(['pnpm','typecheck'],cwd=ROOT,check=True)
        subprocess.run(['pnpm','test'],cwd=ROOT,check=True)
        commands = {
            'web':['node','scripts/qualify-localization.mjs','--locale',args.locale],
            'desktop':['desktop/scripts/check.sh'],
            'extension':['extension/scripts/check.sh'],
            'android':['android/scripts/check.sh'],
            'ios':['ios/scripts/check.sh'],
        }
        evidence = {'locale':args.locale,'catalogHashes':{},'checks':[],'limitations':['No store delivery, signed production install, physical-device or three-OS runtime qualification is inferred.']}
        for surface in surfaces:
            work = workspace(ROOT,surface,args.locale)
            if any(work.report().values()): raise Invalid(f'Unqualified catalog: {surface}/{args.locale}')
            subprocess.run(commands[surface],cwd=ROOT,check=True,env={**os.environ,'OK200_TEST_LOCALE':args.locale})
            extra = []
            if surface == 'android': extra = [['android/scripts/localization-smoke.sh']]
            if surface == 'desktop':
                extra = [['desktop/crostini/scripts/check.sh']]
                if sys.platform == 'darwin': extra += [['cargo','run','--manifest-path','desktop/Cargo.toml','-p','ok200-desktop','--example','localization_smoke','--',str(directory/'native-menu.json'),args.locale]]
            if surface == 'extension': extra = [['extension/scripts/browser-check.sh']]
            for command in extra:
                directory.mkdir(parents=True,exist_ok=True)
                subprocess.run(command,cwd=ROOT,check=True,env={**os.environ,'OK200_TEST_LOCALE':args.locale})
                evidence['checks'].append(command)
            evidence['checks'].append(commands[surface])
            evidence['catalogHashes'][surface]=digest(work.translated)
        atomic_write(directory / 'qualification.json',json_text(evidence));return 0
    if args.command == 'export':
        for surface in surfaces:
            subprocess.run([sys.executable,'scripts/localization.py','export',surface,args.locale,'--batch-size',str(args.batch_size),'--out-dir',str(directory/surface)],cwd=ROOT,check=True)
        return 0
    # One supervising process, sequential surfaces, at most the selected number
    # of model workers overall. Catalog writes occur only after independent review.
    for surface in surfaces:
        jobs = directory/surface
        if not list(jobs.glob('*.json')):
            if any(workspace(ROOT,surface,args.locale).report().values()): raise Invalid(f'Export frozen jobs before run: {surface}')
            continue
        subprocess.run([sys.executable,'scripts/localization-codex.py','run','--platform',surface,'--locale',args.locale,'--jobs',str(jobs),'--work-dir',str(directory/f'{surface}-run'),'--model',args.model,'--effort',args.effort,'--concurrency',str(args.concurrency),'--import-reviewed'],cwd=ROOT,check=True)
    return 0
