"""Exact local qualification inputs and required commands; no execution."""
from localization import workspace
from localization_common import digest
import hashlib

SURFACES = ["web", "desktop", "extension", "android", "ios"]
HARNESS = ['scripts/localization_front.py', 'scripts/localization_qualification.py',
           'scripts/validate-extension-package.mjs',
           'scripts/qualify-localization.mjs', 'scripts/check-localization.mjs',
           'scripts/check-native-localization.py', 'scripts/generate-localization.mjs',
           'android/scripts/check.sh', 'android/scripts/localization-smoke.sh',
           'android/scripts/test.sh', 'desktop/scripts/check.sh',
           'desktop/crostini/scripts/check.sh', 'ios/scripts/check.sh',
           'extension/scripts/check.sh', 'extension/scripts/browser-check.sh']


def qualification_harness(root):
    def fingerprint(relative):
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError('Qualification inputs must stay within the repository')
        return hashlib.sha256(path.read_bytes()).hexdigest()
    files = {name: fingerprint(name) for name in HARNESS}
    # Runtime edits during an overnight campaign also need deliberate review.
    # Exclude only generated catalogs/language registration, which legitimately
    # grow after each qualified locale. Directory traversal never follows links.
    prefixes = ['packages/ui/src', 'packages/i18n/src', 'desktop/common/src',
                'desktop/core/src', 'desktop/tauri-app/src', 'desktop/tauri-app/src-tauri/src',
                'desktop/crostini/src', 'extension/src', 'android/app/src/main/java',
                'android/app/src/androidTest', 'ios/200OK', 'ios/200OKUITests', 'ios/200OKTests']
    generated = {'packages/i18n/src/generated.ts', 'desktop/common/src/generated_localization.rs',
                 'android/app/src/main/java/app/ok200/android/ui/SupportedLanguages.kt'}
    for prefix in prefixes:
        for path in (root / prefix).rglob('*'):
            relative = path.relative_to(root).as_posix()
            if path.suffix in {'.ts','.tsx','.rs','.kt','.swift'} and relative not in generated:
                files[relative] = fingerprint(relative)
    return files


def qualification_inputs(root, locale, surfaces=SURFACES):
    """Bind a successful local run to exact source, target, ledger and guidance."""
    return {surface: {'source': digest(work.source), 'catalog': digest(work.translated),
                      'ledger': digest(work.ledger)}
            for surface in surfaces for work in [workspace(root, surface, locale)]}


def qualification_commands(locale, directory):
    commands = [['node', 'scripts/check-localization.mjs'], ['pnpm', 'typecheck'], ['pnpm', 'test'],
                ['node', 'scripts/qualify-localization.mjs', '--locale', locale],
                ['desktop/scripts/check.sh'], ['desktop/crostini/scripts/check.sh'],
                ['cargo', 'run', '--manifest-path', 'desktop/Cargo.toml', '-p', 'ok200-desktop',
                 '--example', 'localization_smoke', '--', str(directory / 'native-menu.json'), locale],
                ['extension/scripts/check.sh'], ['extension/scripts/browser-check.sh'],
                ['android/scripts/check.sh'], ['android/scripts/localization-smoke.sh'],
                ['ios/scripts/check.sh']]
    return commands


