#!/usr/bin/env python3
"""Native gates need Python only; never execute model workers."""
import sys
from pathlib import Path
from localization import workspace
from localization_common import read_json

root = Path(__file__).resolve().parents[1]
registry = read_json(root / 'localization/locales.json')
for surface in sys.argv[1:]:
    for locale in registry['supportedLocales'][surface]:
        if locale == 'en': continue
        report = workspace(root,surface,locale).report()
        if any(report.values()): raise SystemExit(f'{surface}/{locale}: {report}')
    print(f'{surface}: registered native catalog/review checks passed')
