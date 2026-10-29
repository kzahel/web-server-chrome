#!/usr/bin/env python3
"""Offline Android translation jobs, checked imports and catalog maintenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "scripts"))
from translation_terms import terminology, terminology_hash
SOURCE = Path("android/app/src/main/res/values/strings.xml")
CONFIG = Path("localization/android/locales.json")
MAX_JSON_BYTES = 16 * 1024 * 1024
PLACEHOLDER = re.compile(r"%(?:(?P<index>[1-9][0-9]*)\$)(?P<format>[-#+ 0,(]*[0-9]*(?:\.[0-9]+)?)(?P<type>[sdf])")
QUANTITIES = {"zero", "one", "two", "few", "many", "other"}


from localization_common import Invalid, read_json, json_text, digest, atomic_write, validate_literals

def android_decode(text: str):
    """Decode the Android escape layer after XML decoding (no rich markup)."""
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    escapes = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", "'": "'", '"': '"', "@": "@", "?": "?"}
    def replace(match):
        token = match.group(1)
        if token.startswith("u"):
            return chr(int(token[1:], 16))
        if token not in escapes:
            raise Invalid(f"unsupported Android escape: \\{token}")
        return escapes[token]
    return re.sub(r"\\(u[0-9a-fA-F]{4}|.)", replace, text)


def android_encode(text: str):
    # Quoting preserves significant whitespace. XML and Android escaping are
    # distinct layers; do both exactly once, even for @/? and literal slashes.
    text = text.replace("\\", "\\\\").replace('"', '\\"').replace("'", "\\'")
    text = text.replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r")
    return '"' + escape(text) + '"'


def signature(text: str):
    if not isinstance(text, str) or not text.strip() or len(text) > 65536:
        raise Invalid("translation must be a nonempty string of at most 65536 characters")
    if any((ord(character) < 0x20 and character not in "\t\n\r") or 0xD800 <= ord(character) <= 0xDFFF or ord(character) in {0xFFFE, 0xFFFF} for character in text):
        raise Invalid("translation contains a character forbidden in XML")
    result = {}
    position = 0
    while position < len(text):
        if text[position] != "%":
            position += 1
            continue
        if text.startswith("%%", position):
            position += 2
            continue
        match = PLACEHOLDER.match(text, position)
        if match is None:
            raise Invalid(f"invalid format specifier at {text[position:position + 15]!r}; use positional arguments or %%")
        key = match.group("index")
        token = match.group(0)
        if key in result and result[key] != token:
            raise Invalid(f"argument {key} has inconsistent format specifiers")
        result[key] = token
        position = match.end()
    return result


def catalog(path: Path, *, source=False):
    if not path.exists():
        return {}
    if path.stat().st_size > MAX_JSON_BYTES:
        raise Invalid(f"XML exceeds {MAX_JSON_BYTES} bytes: {path}")
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    tree = ET.fromstring(path.read_text(encoding="utf-8"), parser=parser)
    if tree.tag != "resources":
        raise Invalid(f"expected <resources>: {path}")
    result = {}
    seen = set()
    comments = []
    for element in tree:
        if element.tag is ET.Comment:
            comments.append((element.text or "").strip())
            continue
        if element.tag not in {"string", "plurals"}:
            raise Invalid(f"unsupported resource kind {element.tag}: {path}")
        name = element.get("name", "")
        if not re.fullmatch(r"[a-z][a-z0-9_]*", name) or name in seen:
            raise Invalid(f"invalid or duplicate resource name: {name}")
        seen.add(name)
        if len(seen) > 10000:
            raise Invalid("catalog exceeds 10000 resources")
        context = comments
        comments = []
        if element.get("translatable") == "false":
            if source:
                continue
            raise Invalid(f"nontranslatable resource must not be in translated catalog: {name}")
        def content(node):
            if len(node):
                raise Invalid(f"inline XML markup is unsupported; add explicit handling before importing {name}")
            return android_decode(node.text or "")
        if element.tag == "string":
            value = content(element)
        else:
            value = {}
            for item in element:
                category = item.get("quantity")
                if item.tag != "item" or category not in QUANTITIES or category in value:
                    raise Invalid(f"invalid/duplicate plural category: {name}/{category}")
                value[category] = content(item)
            if "other" not in value:
                raise Invalid(f"plural {name} is missing other")
        result[name] = {"kind": element.tag, "value": value, "context": context, "attributes": {key: value for key, value in element.attrib.items() if key != "name"}}
    return result


def source_records(path: Path):
    result = {}
    for name, record in catalog(path, source=True).items():
        texts = [record["value"]] if record["kind"] == "string" else record["value"].values()
        formats = {}
        required = None
        for text in texts:
            current = signature(text)
            for index, token in current.items():
                if index in formats and formats[index] != token:
                    raise Invalid(f"inconsistent source argument {name}/{index}")
                formats[index] = token
            required = set(current) if required is None else required.intersection(current)
        # A quantity's count can disappear in a target-language branch, even
        # when English prints it. Other shared arguments remain required. A
        # target must still use every source argument somewhere in the resource.
        arguments = {index: token[-1] for index, token in formats.items()}
        integer_arguments = [index for index, kind in arguments.items() if kind == "d"]
        quantity_argument = integer_arguments[0] if record["kind"] == "plurals" and len(integer_arguments) == 1 else None
        if required is not None and quantity_argument is not None:
            required.discard(quantity_argument)
        required_arguments = sorted(required or [], key=int)
        record.update({"arguments": arguments, "formats": formats, "requiredArguments": required_arguments, "quantityArgument": quantity_argument})
        record["sourceHash"] = digest(record)
        result[name] = record
    return result


class Workspace:
    def __init__(self, root: Path, locale: str):
        self.root = root
        config = read_json(root / CONFIG)
        if config.get("schemaVersion") != 1 or locale not in config.get("locales", {}):
            raise Invalid(f"configure locale in {CONFIG}: {locale}")
        self.locale = locale
        self.config = config["locales"][locale]
        self.quantities = set(self.config["quantities"])
        if "other" not in self.quantities or not self.quantities <= QUANTITIES:
            raise Invalid(f"invalid configured quantities for {locale}")
        self.xml = root / self.config["catalog"]
        self.metadata = root / "localization/android" / f"{locale}.json"
        self.source = source_records(root / SOURCE)
        self.translated = catalog(self.xml)
        self.ledger = read_json(self.metadata) if self.metadata.exists() else {"schemaVersion": 1, "locale": locale, "resources": {}}
        if self.ledger.get("schemaVersion") != 1 or self.ledger.get("locale") != locale or not isinstance(self.ledger.get("resources"), dict):
            raise Invalid("invalid translation metadata header")

    def translation_hash(self, name):
        row = self.translated.get(name)
        return digest({"kind": row["kind"], "value": row["value"]}) if row else None

    def terminology_hash(self, name):
        source = self.source[name]
        return terminology_hash(self.root, self.locale, source["value"], source["context"])

    def validate_translation(self, name, value, kind):
        source = self.source[name]
        if kind != source["kind"]:
            raise Invalid(f"resource kind mismatch: {name}")
        if kind == "plurals":
            if not isinstance(value, dict) or set(value) != self.quantities:
                raise Invalid(f"{name}: expected plural categories {sorted(self.quantities)}")
            texts = value.values()
        else:
            texts = [value]
        validate_literals(source["value"], value)
        used = set()
        for text in texts:
            formats = signature(text)
            used.update(formats)
            if not set(formats) <= set(source["formats"]) or any(source["formats"][key] != token for key, token in formats.items()):
                raise Invalid(f"{name}: positional argument/format mismatch")
            if not set(source["requiredArguments"]) <= set(formats):
                raise Invalid(f"{name}: missing required positional argument")
        if used != set(source["formats"]):
            raise Invalid(f"{name}: resource omits positional arguments")

    def report(self):
        reports = {key: [] for key in ("missing", "stale", "obsolete", "conflicting", "invalid", "unreviewed", "terminologyChanged", "terminologyUntracked")}
        for name, source in self.source.items():
            translated = self.translated.get(name)
            metadata = self.ledger["resources"].get(name)
            if translated is None:
                reports["missing"].append(name)
                continue
            try:
                self.validate_translation(name, translated["value"], translated["kind"])
            except Invalid:
                reports["invalid"].append(name)
            if metadata is not None and not isinstance(metadata, dict):
                raise Invalid(f"invalid metadata record: {name}")
            if not metadata or metadata.get("sourceHash") != source["sourceHash"]:
                reports["stale"].append(name)
            if not metadata or metadata.get("translationHash") != self.translation_hash(name):
                reports["conflicting"].append(name)
            if not metadata or metadata.get("reviewState") != "agent-reviewed" or not metadata.get("reviewer") or metadata.get("reviewer") == metadata.get("translator"):
                reports["unreviewed"].append(name)
            expected_terminology = self.terminology_hash(name)
            if expected_terminology is not None:
                if not metadata or "terminologyHash" not in metadata:
                    reports["terminologyUntracked"].append(name)
                elif metadata["terminologyHash"] != expected_terminology:
                    reports["terminologyChanged"].append(name)
        reports["obsolete"] = sorted((set(self.translated) | set(self.ledger["resources"])) - set(self.source))
        return reports

    def export(self, all_resources=False):
        report = self.report()
        pending = set().union(*(set(value) for key, value in report.items() if key != "obsolete"))
        resources = {}
        for name, record in self.source.items():
            if not all_resources and name not in pending:
                continue
            resources[name] = {"sourceHash": record["sourceHash"], "kind": record["kind"], "source": record["value"], "context": record["context"], "arguments": record["arguments"], "formats": record["formats"], "requiredArguments": record["requiredArguments"], "quantityArgument": record["quantityArgument"], "existingTranslationHash": self.translation_hash(name)}
            if self.terminology_hash(name) is not None:
                resources[name]["terminologyHash"] = self.terminology_hash(name)
            if name in self.translated:
                resources[name]["existingTranslation"] = self.translated[name]["value"]
        return {"schemaVersion": 1, "locale": self.locale, "localeGuidance": self.config.get("guidance", {}), "terminology": terminology(self.root, self.locale), "quantities": sorted(self.quantities), "glossary": read_json(self.root / "localization/glossary.json"), "resources": resources}

    def validate_response(self, job, response):
        for value in (job, response):
            if not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("locale") != self.locale or not isinstance(value.get("resources"), dict):
                raise Invalid("invalid job/response header")
        if "platform" in job and response.get("platform") != "android":
            raise Invalid("invalid Android response platform")
        requested = job["resources"]
        received = response["resources"]
        if not requested or set(requested) != set(received):
            raise Invalid(f"response keys differ: missing={sorted(set(requested) - set(received))}, unknown={sorted(set(received) - set(requested))}")
        # Validate the whole response before changing either catalog or metadata.
        for name, item in received.items():
            required_fields = {"sourceHash", "kind", "translation"}
            if name in self.source and self.terminology_hash(name) is not None:
                required_fields.add("terminologyHash")
            if name not in self.source or not isinstance(item, dict) or set(item) != required_fields:
                raise Invalid(f"unknown resource or invalid response record: {name}")
            source = self.source[name]
            exported = requested[name]
            if not isinstance(exported, dict):
                raise Invalid(f"invalid job record: {name}")
            if item["sourceHash"] != source["sourceHash"] or exported.get("sourceHash") != source["sourceHash"]:
                raise Invalid(f"stale source: {name}; export a new job")
            if exported.get("source") != source["value"] or exported.get("context") != source["context"] or exported.get("arguments") != source["arguments"]:
                raise Invalid(f"source snapshot content differs: {name}")
            expected_terminology = self.terminology_hash(name)
            if expected_terminology is not None and (item.get("terminologyHash") != expected_terminology or exported.get("terminologyHash") != expected_terminology):
                raise Invalid(f"stale terminology: {name}; export a new job")
            if exported.get("existingTranslationHash") != self.translation_hash(name):
                raise Invalid(f"translation changed since export: {name}; export a correction job")
            self.validate_translation(name, item["translation"], item["kind"])

    def import_response(self, job, response, translator, reviewer):
        if not translator or not reviewer or translator == reviewer:
            raise Invalid("translator and independent reviewer identities must be nonempty and different (include session/job identity)")
        self.validate_response(job, response)
        received = response["resources"]
        for name, item in received.items():
            self.translated[name] = {"kind": item["kind"], "value": item["translation"]}
            self.ledger["resources"][name] = {"sourceHash": item["sourceHash"], "translationHash": self.translation_hash(name), "origin": "independently authored translation", "translator": translator, "reviewer": reviewer, "reviewState": "agent-reviewed"}
            if "terminologyHash" in item:
                self.ledger["resources"][name].update({"terminologyHash": item["terminologyHash"], "terminologyReviewer": reviewer})
        self.write()

    def write(self):
        lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"]
        for name, record in sorted(self.translated.items()):
            if record["kind"] == "string":
                lines.append(f'    <string name="{name}">{android_encode(record["value"])}</string>')
            else:
                lines.append(f'    <plurals name="{name}">')
                for quantity in ("zero", "one", "two", "few", "many", "other"):
                    if quantity in record["value"]:
                        lines.append(f'        <item quantity="{quantity}">{android_encode(record["value"][quantity])}</item>')
                lines.append("    </plurals>")
        lines.extend(["</resources>", ""])
        # An interrupted two-file promotion is detected as a hash conflict by
        # check/export. Never silently regard a partially promoted pair as reviewed.
        atomic_write(self.xml, "\n".join(lines))
        atomic_write(self.metadata, json_text(self.ledger))

    def prune(self):
        obsolete = self.report()["obsolete"]
        for name in obsolete:
            self.translated.pop(name, None)
            record = self.ledger["resources"].pop(name, None)
            if record:
                self.ledger.setdefault("retired", {})[name] = record
        if obsolete:
            self.write()
        return obsolete


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser("export", help="export missing/stale translation jobs")
    export.add_argument("locale")
    export.add_argument("--all", action="store_true")
    export.add_argument("--batch-size", type=int, default=60)
    export.add_argument("--out-dir", required=True, type=Path)
    import_command = commands.add_parser("import", help="validate and import an independently reviewed response")
    import_command.add_argument("locale")
    import_command.add_argument("--job", required=True, type=Path)
    import_command.add_argument("--response", required=True, type=Path)
    import_command.add_argument("--translator", required=True)
    import_command.add_argument("--reviewer", required=True)
    validate = commands.add_parser("validate-response", help="validate a candidate response without importing it")
    validate.add_argument("locale")
    validate.add_argument("--job", required=True, type=Path)
    validate.add_argument("--response", required=True, type=Path)
    for command in ("check", "prune"):
        child = commands.add_parser(command)
        child.add_argument("locale")
    arguments = parser.parse_args(argv)
    try:
        workspace = Workspace(arguments.root, arguments.locale)
        if arguments.command == "export":
            if not 1 <= arguments.batch_size <= 100:
                raise Invalid("batch size must be between 1 and 100")
            job = workspace.export(arguments.all)
            pairs = list(job["resources"].items())
            for offset in range(0, len(pairs), arguments.batch_size):
                batch = {**job, "resources": dict(pairs[offset:offset + arguments.batch_size])}
                path = arguments.out_dir / f"{arguments.locale}-{offset // arguments.batch_size + 1:03d}.json"
                atomic_write(path, json_text(batch))
                print(path)
            print(f"Exported {len(pairs)} resources for {arguments.locale}", file=sys.stderr)
        elif arguments.command == "import":
            workspace.import_response(read_json(arguments.job), read_json(arguments.response), arguments.translator, arguments.reviewer)
            print(f"Imported {len(read_json(arguments.response)['resources'])} reviewed resources for {arguments.locale}")
        elif arguments.command == "validate-response":
            workspace.validate_response(read_json(arguments.job), read_json(arguments.response))
            print(f"Response is valid for {arguments.locale}; no catalog changed")
        elif arguments.command == "prune":
            print(json_text({"pruned": workspace.prune()}), end="")
        else:
            report = workspace.report()
            print(json_text({"locale": arguments.locale, "total": len(workspace.source), **report}), end="")
            return int(any(report.values()))
        return 0
    except (Invalid, OSError, ET.ParseError, json.JSONDecodeError) as error:
        parser.exit(1, f"localization: {error}\n")


if __name__ == "__main__":
    sys.exit(main())
