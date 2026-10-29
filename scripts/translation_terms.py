"""Shared offline terminology context and review fingerprints."""

import hashlib
import json
from pathlib import Path
import re


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def terminology(root: Path, locale: str):
    path = root / "localization/terminology" / f"{locale}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != 1 or data.get("locale") != locale or not isinstance(data.get("terms"), dict) or not isinstance(data.get("register"), str) or not data["register"].strip() or len(data["register"]) > 8192:
        raise ValueError(f"invalid shared terminology: {path}")
    return data


def relevant_terms(root: Path, locale: str, source, context=()):
    data = terminology(root, locale)
    if data is None:
        return None
    text = " ".join([source if isinstance(source, str) else " ".join(source.values()), *context])
    terms = {}
    for identifier, entry in data["terms"].items():
        if any(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.IGNORECASE) for term in entry["sourceTerms"]):
            terms[identifier] = entry
    glossary_path = root / "localization/glossary.json"
    glossary = json.loads(glossary_path.read_text()) if glossary_path.exists() else {"terms": []}
    definitions = [entry for entry in glossary.get("terms", []) if re.search(r"(?<!\w)" + re.escape(entry["term"]) + r"(?!\w)", text, re.IGNORECASE)]
    return {"locale": locale, "register": data.get("register", ""), "terms": terms, "definitions": definitions}


def terminology_hash(root: Path, locale: str, source, context=()):
    relevant = relevant_terms(root, locale, source, context)
    return digest(relevant) if relevant is not None else None
