"""Bounded JSON, hashes and atomic writes shared by localization adapters."""
import hashlib
import json
import os
from pathlib import Path
import tempfile

MAX_JSON_BYTES = 16 * 1024 * 1024

class Invalid(ValueError):
    """A source, exchange file or catalog violates its checked contract."""


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Invalid(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path: Path):
    if path.stat().st_size > MAX_JSON_BYTES:
        raise Invalid(f"JSON exceeds {MAX_JSON_BYTES} bytes: {path}")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_object)


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def atomic_write(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", dir=path.parent, encoding="utf-8", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)



from contextlib import contextmanager

@contextmanager
def catalog_lock(root, platform, locale):
    """Kernel-owned persistent lock; Apple locales share their catalog file."""
    name = platform if platform == 'ios' else f'{platform}-{locale}'
    path = root / '.local/localization-import-locks' / f'{name}.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as handle:
        if os.name == 'posix':
            import fcntl
            try: fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error: raise Invalid('Another importer owns this catalog') from error
        else:
            import msvcrt
            if path.stat().st_size == 0: handle.write(b'\0'); handle.flush()
            handle.seek(0)
            try: msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error: raise Invalid('Another importer owns this catalog') from error
        try: yield
        finally:
            if os.name == 'posix': fcntl.flock(handle, fcntl.LOCK_UN)
            else:
                handle.seek(0); msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)


def validate_literals(source, target):
    """Protect first-party names, literal addresses, commands and protocol tokens."""
    import re
    from collections import Counter
    pattern = r'200 OK Web Server|200 OK|Web Server for Chrome\b|ChromeOS\b|index\.html|https?://[^\s<>}]+|ok200-crostini(?: [a-z-]+)?|\b(?:HTTP|CORS|SPA|IPv4|IPv6|20080)\b'
    def tokens(value):
        if not isinstance(value, (str, dict)) or (isinstance(value, dict) and not all(isinstance(text, str) for text in value.values())):
            raise Invalid('Translation must contain text')
        text = value if isinstance(value, str) else ' '.join(value.values())
        return Counter(token.rstrip('.,;!?') for token in re.findall(pattern,text))
    expected, received = tokens(source), tokens(target)
    for token, count in expected.items():
        if received[token] < count: raise Invalid(f'Translation changed protected literal: {token}')
