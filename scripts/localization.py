#!/usr/bin/env python3
"""One offline translation workflow for Android, React ICU and native desktop."""

from __future__ import annotations

import argparse
from contextlib import nullcontext
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "scripts"))
from translation_terms import terminology, terminology_hash

import localization_android as android
from localization_common import Invalid, read_json, json_text, digest, atomic_write, catalog_lock, validate_literals

CATALOGS = {
    "web": ("localization/catalogs/web/en.json", "localization/catalogs/web/{locale}.json"),
    "desktop": ("localization/catalogs/desktop/en.json", "localization/catalogs/desktop/{locale}.json"),
    "extension": ("localization/catalogs/extension/en.json", "localization/catalogs/extension/{locale}.json"),
}


def icu_contracts(messages, locale, root=ROOT, source_messages=None):
    request = {"messages": messages, "locale": locale}
    if source_messages is not None:
        request["sourceMessages"] = source_messages
    result = subprocess.run(["node", str(ROOT / "scripts/localization-icu.mjs")], input=json.dumps(request), text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise Invalid(f"invalid ICU: {result.stderr.strip()}")
    return json.loads(result.stdout)


def native_contract(text):
    if not isinstance(text, str) or not text.strip() or len(text) > 65536:
        raise Invalid("native translation must be nonempty text <=65536 characters")
    tokens = re.findall(r"\{([a-z][a-z0-9_]*)\}", text)
    if re.search(r"[{}]", re.sub(r"\{[a-z][a-z0-9_]*\}", "", text)):
        raise Invalid("invalid native named placeholder")
    return sorted(tokens)


class Workspace:
    def __init__(self, root, platform, locale):
        if platform not in CATALOGS or not re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*", locale) or locale == "en":
            raise Invalid("choose a configured non-English locale and supported platform")
        self.root, self.platform, self.locale = root, platform, locale
        source_path, target_path = CATALOGS[platform]
        self.path = root / target_path.format(locale=locale)
        self.metadata = root / "localization" / platform / f"{locale}.json"
        source = read_json(root / source_path)
        if not isinstance(source, dict) or not 0 < len(source) <= 10000:
            raise Invalid("source catalog must contain 1–10000 entries")
        comments = read_json(root / "localization/catalogs/desktop/en.comments.json") if platform == "desktop" else {}
        texts = {name: value["defaultMessage"] if platform == "web" else value for name, value in source.items()}
        contracts = icu_contracts(texts, "en", root) if platform == "web" else {name: native_contract(value) for name, value in texts.items()}
        self.source = {}
        for name, value in source.items():
            context = [value.get("description", "")] if platform == "web" else [comments.get(name, "") or ("Preserve exact proper names 200 OK Web Server and Web Server for Chrome." if platform == "extension" else "")]
            record = {"kind": "icu" if platform == "web" else "named", "value": texts[name], "context": context, "arguments": contracts[name]}
            record["sourceHash"] = digest(record)
            record["terminologyHash"] = terminology_hash(root, locale, record["value"], context)
            self.source[name] = record
        target = read_json(self.path) if self.path.exists() else {}
        if not isinstance(target, dict):
            raise Invalid("translated catalog must be an object")
        self.translated = {}
        for name, value in target.items():
            if platform == "web" and (not isinstance(value, dict) or not isinstance(value.get("defaultMessage"), str)):
                raise Invalid(f"invalid translated React descriptor: {name}")
            self.translated[name] = value["defaultMessage"] if platform == "web" else value
        self.ledger = read_json(self.metadata) if self.metadata.exists() else {"schemaVersion": 1, "platform": platform, "locale": locale, "resources": {}}
        if self.ledger.get("schemaVersion") != 1 or self.ledger.get("platform") != platform or self.ledger.get("locale") != locale or not isinstance(self.ledger.get("resources"), dict):
            raise Invalid("invalid translation metadata header")

    def translation_hash(self, name):
        return digest({"kind": self.source[name]["kind"], "value": self.translated[name]}) if name in self.translated and name in self.source else None

    def validate_values(self, values):
        for name, text in values.items():
            validate_literals(self.source[name]["value"], text)
            if not isinstance(text, str) or not text.strip() or len(text) > 65536 or any(0xD800 <= ord(c) <= 0xDFFF or ord(c) == 0 for c in text):
                raise Invalid(f"invalid translated text: {name}")
            if self.platform == 'extension':
                limit = {'app_name': 75, 'app_description': 132}.get(name)
                if limit is not None and len(text.encode('utf-16-le')) // 2 > limit:
                    raise Invalid(f'{name}: Chrome manifest text exceeds {limit} characters')
        contracts = icu_contracts(values, self.locale, self.root, {name: self.source[name]["value"] for name in values}) if self.platform == "web" else {name: native_contract(value) for name, value in values.items()}
        for name, contract in contracts.items():
            if contract != self.source[name]["arguments"]:
                raise Invalid(f"{name}: incompatible argument, format, selector or rich-text tag contract")

    def report(self):
        result = {key: [] for key in ("missing", "stale", "obsolete", "conflicting", "invalid", "unreviewed", "terminologyChanged", "terminologyUntracked")}
        current = {name: value for name, value in self.translated.items() if name in self.source}
        # Parse separately when a catalog is damaged so reports identify its key.
        try:
            self.validate_values(current)
        except Invalid:
            for name, value in current.items():
                try: self.validate_values({name: value})
                except Invalid: result["invalid"].append(name)
        for name, record in self.source.items():
            if name not in self.translated:
                result["missing"].append(name)
                continue
            metadata = self.ledger["resources"].get(name, {})
            if metadata.get("sourceHash") != record["sourceHash"]: result["stale"].append(name)
            if metadata.get("translationHash") != self.translation_hash(name): result["conflicting"].append(name)
            if metadata.get("reviewState") != "agent-reviewed" or not metadata.get("reviewer") or metadata.get("reviewer") == metadata.get("translator"): result["unreviewed"].append(name)
            if record["terminologyHash"] is not None:
                if "terminologyHash" not in metadata: result["terminologyUntracked"].append(name)
                elif metadata["terminologyHash"] != record["terminologyHash"]: result["terminologyChanged"].append(name)
        result["obsolete"] = sorted((set(self.translated) | set(self.ledger["resources"])) - set(self.source))
        return result

    def suggestions(self):
        config = self.root / android.CONFIG
        if not config.exists(): return {}
        if self.locale not in read_json(config).get("locales", {}): return {}
        existing = android.Workspace(self.root, self.locale)
        found = {}
        for name, row in existing.source.items():
            if row["kind"] != "string" or name not in existing.translated: continue
            normalized = " ".join(row["value"].split()).casefold()
            found.setdefault(normalized, []).append({"platform": "android", "id": name, "translation": existing.translated[name]["value"], "reviewState": existing.ledger["resources"].get(name, {}).get("reviewState", "unreviewed")})
        return found

    def export(self, all_resources=False):
        report = self.report()
        pending = set().union(*(set(value) for key, value in report.items() if key != "obsolete"))
        suggestions = self.suggestions()
        resources = {}
        for name, record in self.source.items():
            if not all_resources and name not in pending: continue
            resources[name] = {"sourceHash": record["sourceHash"], "terminologyHash": record["terminologyHash"], "kind": record["kind"], "source": record["value"], "context": record["context"], "arguments": record["arguments"], "existingTranslationHash": self.translation_hash(name), "suggestions": suggestions.get(" ".join(record["value"].split()).casefold(), [])}
            if name in self.translated: resources[name]["existingTranslation"] = self.translated[name]
        return {"schemaVersion": 1, "platform": self.platform, "locale": self.locale, "terminology": terminology(self.root, self.locale), "resources": resources}

    def validate_response(self, job, response):
        for value in (job, response):
            if not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("platform") != self.platform or value.get("locale") != self.locale or not isinstance(value.get("resources"), dict):
                raise Invalid("invalid job/response header")
        requested, received = job["resources"], response["resources"]
        if not requested or set(requested) != set(received):
            raise Invalid(f"response keys differ: missing={sorted(set(requested)-set(received))}, unknown={sorted(set(received)-set(requested))}")
        values = {}
        for name, item in received.items():
            if name not in self.source or not isinstance(item, dict) or set(item) != {"sourceHash", "terminologyHash", "kind", "translation"}:
                raise Invalid(f"unknown resource or invalid response record: {name}")
            source = self.source[name]
            exported = requested[name]
            if not isinstance(exported, dict) or exported.get("sourceHash") != source["sourceHash"] or item["sourceHash"] != source["sourceHash"]: raise Invalid(f"stale source: {name}")
            if exported.get("source") != source["value"] or exported.get("context") != source["context"] or exported.get("arguments") != source["arguments"]: raise Invalid(f"source snapshot content differs: {name}")
            if exported.get("terminologyHash") != source["terminologyHash"] or item["terminologyHash"] != source["terminologyHash"]: raise Invalid(f"stale terminology: {name}")
            if exported.get("existingTranslationHash") != self.translation_hash(name): raise Invalid(f"translation changed since export: {name}")
            if item["kind"] != source["kind"]: raise Invalid(f"resource kind mismatch: {name}")
            values[name] = item["translation"]
        self.validate_values(values)

    def import_response(self, job, response, translator, reviewer):
        if not translator or not reviewer or translator == reviewer: raise Invalid("translator and independent reviewer identities must differ")
        self.validate_response(job, response)
        for name, item in response["resources"].items():
            self.translated[name] = item["translation"]
            self.ledger["resources"][name] = {"sourceHash": item["sourceHash"], "terminologyHash": item["terminologyHash"], "translationHash": self.translation_hash(name), "origin": "independently authored translation", "translator": translator, "reviewer": reviewer, "reviewState": "agent-reviewed"}
        self.write()

    def write(self):
        values = {}
        for name, value in sorted(self.translated.items()):
            values[name] = {"defaultMessage": value, "description": self.source.get(name, {}).get("context", [""])[0]} if self.platform == "web" else value
        atomic_write(self.path, json_text(values))
        atomic_write(self.metadata, json_text(self.ledger))

    def prune(self):
        retired = self.report()["obsolete"]
        for name in retired:
            self.translated.pop(name, None)
            old = self.ledger["resources"].pop(name, None)
            if old: self.ledger.setdefault("retired", {})[name] = old
        if retired: self.write()
        return retired


def workspace(root, platform, locale):
    if platform == "android": return android.Workspace(root, locale)
    if platform == "ios":
        from localization_apple import AppleWorkspace
        return AppleWorkspace(root, locale)
    return Workspace(root, platform, locale)


def validate_job(w, job, platform):
    if not isinstance(job, dict) or job.get("schemaVersion") != 1 or job.get("platform") != platform or job.get("locale") != w.locale or not isinstance(job.get("resources"), dict) or not 1 <= len(job["resources"]) <= 100:
        raise Invalid("invalid job header or resource bound")
    current_terms = terminology(w.root, w.locale)
    exported_terms = job.get("terminology")
    if current_terms is None and exported_terms is not None:
        raise Invalid("stale terminology job: register guidance has no configured locale terminology")
    if current_terms is not None and (not isinstance(exported_terms, dict) or
            exported_terms.get("schemaVersion") != current_terms["schemaVersion"] or
            exported_terms.get("locale") != w.locale or
            exported_terms.get("register") != current_terms.get("register")):
        raise Invalid("stale terminology job: register guidance differs from the configured locale; re-export")
    for name, row in job["resources"].items():
        source = w.source.get(name)
        if source is None or not isinstance(row, dict) or row.get("sourceHash") != source["sourceHash"] or row.get("source") != source["value"] or row.get("context") != source["context"] or row.get("kind") != source["kind"] or row.get("arguments") != source["arguments"]:
            raise Invalid(f"stale source job: {name}")
        if row.get("terminologyHash") != terminology_hash(w.root, w.locale, source["value"], source["context"]):
            raise Invalid(f"stale terminology job: {name}")


def already_imported(w, job, response, platform, translator, reviewer):
    validate_job(w, job, platform)
    if not translator or not reviewer or translator == reviewer:
        return False
    if not isinstance(response, dict) or response.get("schemaVersion") != 1 or response.get("platform") != platform or response.get("locale") != w.locale or not isinstance(response.get("resources"), dict) or set(response["resources"]) != set(job["resources"]):
        return False
    for name, row in response["resources"].items():
        source = w.source[name]
        value = w.translated.get(name)
        if platform == "android" and value is not None: value = value["value"]
        metadata = w.ledger["resources"].get(name, {})
        if not isinstance(row, dict) or row.get("kind") != source["kind"] or row.get("sourceHash") != source["sourceHash"] or row.get("terminologyHash") != terminology_hash(w.root, w.locale, source["value"], source["context"]) or row.get("translation") != value or metadata.get("translationHash") != w.translation_hash(name) or metadata.get("sourceHash") != row.get("sourceHash") or metadata.get("terminologyHash") != row.get("terminologyHash") or metadata.get("translator") != translator or metadata.get("reviewer") != reviewer or metadata.get("reviewState") != "agent-reviewed":
            return False
    return True


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv and (argv[0] in ("status", "generate", "run", "qualify") or (argv[0] == "export" and "--locale" in argv)):
        from localization_front import main as front
        try: return front(argv)
        except (Invalid, OSError, ValueError, subprocess.CalledProcessError) as error:
            print(f"localization: {error}", file=sys.stderr); return 1
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help=argparse.SUPPRESS)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("export", "validate-job", "validate-response", "import", "check", "prune", "terms-snapshot", "adopt-terminology"):
        p = commands.add_parser(command)
        p.add_argument("platform", choices=("android", "web", "desktop", "extension", "ios")); p.add_argument("locale")
        if command == "export":
            p.add_argument("--all", action="store_true"); p.add_argument("--batch-size", type=int, default=80); p.add_argument("--out-dir", required=True, type=Path)
        if command in ("validate-response", "import"):
            p.add_argument("--job", required=True, type=Path); p.add_argument("--response", required=True, type=Path)
        if command == "validate-job": p.add_argument("--job", required=True, type=Path)
        if command == "import": p.add_argument("--translator", required=True); p.add_argument("--reviewer", required=True); p.add_argument("--idempotent", action="store_true", help="accept an exact previously imported response and identical review identities")
        if command == "terms-snapshot": p.add_argument("--out", required=True, type=Path)
        if command == "adopt-terminology": p.add_argument("--snapshot", required=True, type=Path); p.add_argument("--reviewer", required=True)
    args = parser.parse_args(argv)
    try:
        with catalog_lock(args.root, args.platform, args.locale) if args.command in ("import", "prune", "adopt-terminology") else nullcontext():
            w = workspace(args.root, args.platform, args.locale)
            if args.command == "export":
                if not 1 <= args.batch_size <= 100: raise Invalid("batch size must be 1–100")
                job = w.export(args.all)
                if args.platform == "android": job["platform"] = "android"
                pairs = list(job["resources"].items())
                for offset in range(0, len(pairs), args.batch_size):
                    path = args.out_dir / f"{args.platform}-{args.locale}-{offset//args.batch_size+1:03d}.json"
                    content = json_text({**job, "resources": dict(pairs[offset:offset+args.batch_size])})
                    if path.exists() and path.read_text(encoding="utf-8") != content: raise Invalid("Frozen export differs; use a new output directory")
                    atomic_write(path, content); print(path)
                print(f"Exported {len(pairs)} {args.platform}/{args.locale} resources", file=sys.stderr)
            elif args.command == "validate-job":
                validate_job(w, read_json(args.job), args.platform); print("Source and terminology snapshots are current; translation revisions ignored")
            elif args.command == "validate-response":
                w.validate_response(read_json(args.job), read_json(args.response)); print("Response valid; catalog unchanged")
            elif args.command == "import":
                job, response = read_json(args.job), read_json(args.response)
                if args.idempotent and already_imported(w, job, response, args.platform, args.translator, args.reviewer): print("Exact reviewed response was already imported; catalog unchanged")
                else: w.import_response(job, response, args.translator, args.reviewer); print("Reviewed response imported")
            elif args.command == "check":
                report = w.report(); print(json_text({"platform": args.platform, "locale": args.locale, "total": len(w.source), **report}), end=""); return int(any(report.values()))
            elif args.command == "prune": print(json_text({"pruned": w.prune()}), end="")
            elif args.command == "terms-snapshot":
                report = w.report(); pending = set(report["terminologyChanged"] + report["terminologyUntracked"])
                job = w.export(True); job["platform"] = args.platform
                job["resources"] = {name: row for name, row in job["resources"].items() if name in pending}
                atomic_write(args.out, json_text(job)); print(f"Exported {len(pending)} terminology-review entries")
            else:
                job = read_json(args.snapshot)
                if not isinstance(job, dict) or job.get("schemaVersion") != 1 or job.get("platform") != args.platform or job.get("locale") != args.locale or not isinstance(job.get("resources"), dict) or not job["resources"] or not args.reviewer: raise Invalid("invalid terminology snapshot/reviewer")
                for name, row in job.get("resources", {}).items():
                    source = w.source.get(name)
                    expected = terminology_hash(args.root, args.locale, source["value"], source["context"]) if source else None
                    if source is None or row.get("sourceHash") != source["sourceHash"] or row.get("existingTranslationHash") != w.translation_hash(name) or row.get("terminologyHash") != expected: raise Invalid(f"stale terminology-review snapshot: {name}")
                    if row.get("source") != source["value"] or row.get("context") != source["context"] or row.get("existingTranslation") != (w.translated[name]["value"] if args.platform == "android" else w.translated[name]): raise Invalid(f"terminology snapshot content differs: {name}")
                    metadata = w.ledger["resources"].get(name, {})
                    if metadata.get("sourceHash") != source["sourceHash"] or metadata.get("translationHash") != w.translation_hash(name) or metadata.get("reviewState") != "agent-reviewed" or not metadata.get("reviewer") or metadata.get("reviewer") == metadata.get("translator"): raise Invalid(f"translation needs source/content review first: {name}")
                    if args.reviewer == metadata.get("translator"): raise Invalid(f"terminology reviewer must be independent from translator: {name}")
                for name, row in job["resources"].items():
                    w.ledger["resources"][name].update({"terminologyHash": row["terminologyHash"], "terminologyReviewer": args.reviewer})
                atomic_write(w.metadata, json_text(w.ledger)); print(f"Recorded independent terminology review for {len(job['resources'])} entries")
            return 0
    except (Invalid, ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"localization: {error}\n")


if __name__ == "__main__": sys.exit(main())
