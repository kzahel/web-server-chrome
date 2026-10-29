"""Integration tests for platform adapters and terminology-bound reviews."""

import copy
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("shared_localization", Path(__file__).with_name("localization.py"))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class SharedLocalizationTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.write("localization/catalogs/web/en.json", {
            "files": {"defaultMessage": "{count, plural, =0 {No files} one {# file} other {# files}}", "description": "Verified files count"},
            "link": {"defaultMessage": "Open <link>{name}</link>", "description": "A safe supplied link element"},
            "size": {"defaultMessage": "{bytes, number}", "description": "Downloaded bytes"},
            "select": {"defaultMessage": "{state, select, paused {Paused} other {Active}}", "description": "Torrent state"},
        })
        self.write("localization/catalogs/desktop/en.json", {"show": "Show 200 OK", "complete": "{name} finished downloading."})
        self.write("localization/catalogs/desktop/en.comments.json", {"show": "Tray label", "complete": "Torrent completion notification"})
        self.write("localization/glossary.json", {"terms": [{"term": "verified", "definition": "Hash passed"}]})
        self.terms = {"schemaVersion": 1, "locale": "de", "register": "du", "terms": {"verified": {"sourceTerms": ["verified"], "preferred": "Verifiziert", "meaning": "Hash passed"}}}
        self.write("localization/terminology/de.json", self.terms)

    def write(self, name, value):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")

    def workspace(self, platform="web"):
        return tool.Workspace(self.root, platform, "de")

    def response(self, job):
        return {"schemaVersion": 1, "platform": job["platform"], "locale": "de", "resources": {
            name: {"sourceHash": row["sourceHash"], "terminologyHash": row["terminologyHash"], "kind": row["kind"], "translation": row["source"]}
            for name, row in job["resources"].items()
        }}

    def import_all(self, platform="web"):
        workspace = self.workspace(platform)
        job = workspace.export(True)
        workspace.import_response(job, self.response(job), "translation/session", "review/session")
        return job

    def test_platform_roundtrip_and_incremental_export(self):
        for platform in ("web", "desktop"):
            with self.subTest(platform=platform):
                self.import_all(platform)
                workspace = self.workspace(platform)
                self.assertFalse(any(workspace.report().values()))
                self.assertEqual({}, workspace.export()["resources"])
                first = workspace.path.read_bytes()
                workspace.write()
                self.assertEqual(first, workspace.path.read_bytes())

    def test_exact_response_keys_kind_and_platform(self):
        workspace = self.workspace()
        job = workspace.export()
        for change in ("missing", "unknown", "kind", "platform", "value-type", "blank-value", "extra-field"):
            value = self.response(job)
            if change == "missing": value["resources"].pop("link")
            elif change == "unknown": value["resources"]["extra"] = value["resources"]["link"]
            elif change == "kind": value["resources"]["link"]["kind"] = "named"
            elif change == "platform": value["platform"] = "desktop"
            elif change == "value-type": value["resources"]["link"]["translation"] = 42
            elif change == "blank-value": value["resources"]["link"]["translation"] = "  \n\t"
            else: value["resources"]["link"]["ignored"] = True
            with self.subTest(change=change), self.assertRaises(tool.Invalid):
                workspace.validate_response(job, value)
        self.assertFalse(workspace.path.exists())

    def test_icu_arguments_types_selectors_tags_and_exact_cases(self):
        workspace = self.workspace()
        job = workspace.export()
        for name, translation in (
            ("link", "Öffnen <script>{name}</script>"),
            ("link", "Öffnen {name}"),
            ("link", "Öffnen <link>{other}</link>"),
            ("size", "{bytes}"),
            ("select", "{state, select, stopped {Pausiert} other {Aktiv}}"),
            ("files", "{count, plural, one {# Datei} other {# Dateien}}"),
            ("files", "{count, plural, offset:1 =0 {Keine} one {# Datei} other {# Dateien}}"),
            ("files", "{count, plural, =0 {Keine} few {# Dateien} other {# Dateien}}"),
            ("files", "{count, plural, =0 {Keine} one {# Datei}}"),
        ):
            response = self.response(job)
            response["resources"][name]["translation"] = translation
            with self.subTest(translation=translation), self.assertRaises(tool.Invalid): workspace.validate_response(job, response)

    def test_icu_allows_reordered_arguments_and_german_plural_phrasing(self):
        workspace = self.workspace()
        job = workspace.export()
        response = self.response(job)
        response["resources"]["files"]["translation"] = "{count, plural, =0 {Keine Dateien} one {Eine Datei} other {# Dateien}}"
        response["resources"]["link"]["translation"] = "<link>{name}</link> öffnen"
        workspace.validate_response(job, response)

    def test_icu_scopes_keep_arguments_tags_and_dynamic_pounds_in_their_branch(self):
        pairs = (
            ("{state, select, paused {{pausedName}} other {{activeName}}}",
             "{state, select, paused {{activeName}} other {{pausedName}}}"),
            ("{state, select, paused {<link>{name}</link>} other {<em>{name}</em>}}",
             "{state, select, paused {<em>{name}</em>} other {<link>{name}</link>}}"),
            ("<link>{name}</link> {count}", "{name} <link>{count}</link>"),
            ("{count, plural, one {# file} other {# files}}",
             "{count, plural, one {Eine Datei} other {0 Dateien}}"),
            ("{outer, plural, one {# row} other {# rows: {inner, plural, one {# file} other {# files}}}}",
             "{outer, plural, one {Eine Zeile} other {0 Zeilen: {inner, plural, one {Eine Datei} other {# Dateien}}}}"),
        )
        for source, translation in pairs:
            with self.subTest(source=source):
                # The original exported argument contract remains stable and
                # intentionally lacks branch/tag scope; pairwise validation
                # catches semantics without changing any frozen sourceHash.
                self.assertEqual(tool.icu_contracts({"x": source}, "en"), tool.icu_contracts({"x": translation}, "de"))
                with self.assertRaisesRegex(tool.Invalid, "branch/tag boundary"):
                    tool.icu_contracts({"x": translation}, "de", source_messages={"x": source})

    def test_icu_scopes_allow_reordering_locale_categories_and_constant_number_words(self):
        source = "{count, plural, =0 {# files} one {# file} other {# files}}"
        valid = (
            ("de", "{count, plural, =0 {Keine Dateien} one {Eine Datei} other {# Dateien}}"),
            ("de", "{count, plural, =0 {Keine Dateien} other {# Dateien}}"),
            ("ja", "{count, plural, =0 {ファイルなし} other {# ファイル}}"),
        )
        for locale, translation in valid:
            with self.subTest(locale=locale, translation=translation):
                tool.icu_contracts({"x": translation}, locale, source_messages={"x": source})
        select = "{state, select, paused {{name}: <link>{action}</link>} other {{otherName}}}"
        reordered = "{state, select, other {{otherName}} paused {<link>{action}</link>: {name}}}"
        tool.icu_contracts({"x": reordered}, "de", source_messages={"x": select})
        self.assertEqual(tool.icu_contracts({"x": source}, "en"), tool.icu_contracts({"x": source}, "en", source_messages={"x": source}))

    def test_named_placeholders_reject_unknown_missing_and_malformed(self):
        workspace = self.workspace("desktop")
        job = workspace.export()
        for translation in ("Download fertig.", "{file} ist fertig.", "{name ist fertig.", "{name} {name} fertig."):
            response = self.response(job)
            response["resources"]["complete"]["translation"] = translation
            with self.subTest(translation=translation), self.assertRaises(tool.Invalid): workspace.validate_response(job, response)

    def test_reviewed_corrections_replace_xml_authority_and_reject_races(self):
        self.import_all("desktop")
        workspace = self.workspace("desktop")
        job = workspace.export(True)
        response = self.response(job)
        response["resources"]["show"]["translation"] = "200 OK anzeigen"
        workspace.import_response(job, response, "correction/session", "review/new-session")
        fresh = self.workspace("desktop")
        self.assertEqual("200 OK anzeigen", fresh.translated["show"])
        with self.assertRaisesRegex(tool.Invalid, "changed since export"): fresh.validate_response(job, response)

    def test_source_comment_and_translation_edits_are_visible(self):
        self.import_all("desktop")
        self.write("localization/catalogs/desktop/en.comments.json", {"show": "Menu action, not a status", "complete": "Torrent completion notification"})
        workspace = self.workspace("desktop")
        self.assertEqual(["show"], workspace.report()["stale"])
        target = json.loads(workspace.path.read_text())
        target["complete"] = "{name} ist fertig."
        self.write(str(workspace.path.relative_to(self.root)), target)
        self.assertEqual(["complete"], self.workspace("desktop").report()["conflicting"])

    def test_terminology_changes_invalidate_only_impacted_reviews(self):
        self.import_all()
        job = self.workspace().export(True)
        self.terms["terms"]["verified"]["preferred"] = "Geprüft"
        self.write("localization/terminology/de.json", self.terms)
        workspace = self.workspace()
        self.assertEqual(["files"], workspace.report()["terminologyChanged"])
        self.assertEqual({"files"}, set(workspace.export()["resources"]))
        with self.assertRaisesRegex(tool.Invalid, "stale terminology"): workspace.validate_response(job, self.response(job))
        self.terms["register"] = "Sie"
        self.write("localization/terminology/de.json", self.terms)
        self.assertEqual(set(self.workspace().source), set(self.workspace().report()["terminologyChanged"]))

    def test_glossary_definition_changes_invalidate_impacted_reviews(self):
        self.import_all()
        self.write("localization/glossary.json", {"terms": [{"term": "verified", "definition": "All selected files have passed both integrity lanes"}]})
        self.assertEqual(["files"], self.workspace().report()["terminologyChanged"])

    def test_prune_keeps_origin_history(self):
        self.import_all("desktop")
        self.write("localization/catalogs/desktop/en.json", {"show": "Show 200 OK"})
        workspace = self.workspace("desktop")
        self.assertEqual(["complete"], workspace.prune())
        self.assertEqual("translation/session", workspace.ledger["retired"]["complete"]["translator"])

    def test_independent_review_is_required(self):
        workspace = self.workspace()
        job = workspace.export()
        with self.assertRaisesRegex(tool.Invalid, "independent"): workspace.import_response(job, self.response(job), "same", "same")

    def test_duplicate_json_keys_rejected(self):
        path = self.root / "duplicate.json"
        path.write_text('{"platform":"web","platform":"desktop"}')
        with self.assertRaisesRegex(tool.Invalid, "duplicate"): tool.read_json(path)

    def test_resume_validation_ignores_prior_import_but_binds_source_and_terms(self):
        workspace = self.workspace()
        job = workspace.export()
        workspace.import_response(job, self.response(job), "translation/session", "review/session")
        current = self.workspace()
        tool.validate_job(current, job, "web")
        forged = copy.deepcopy(job)
        forged["terminology"]["register"] = "Guidance not bound to these resource hashes"
        with self.assertRaisesRegex(tool.Invalid, "register guidance"):
            tool.validate_job(current, forged, "web")
        changed = copy.deepcopy(job)
        changed["resources"]["link"]["source"] = "Different English with a forged old hash"
        with self.assertRaisesRegex(tool.Invalid, "stale source job"): tool.validate_job(current, changed, "web")
        self.terms["register"] = "Sie"
        self.write("localization/terminology/de.json", self.terms)
        with self.assertRaisesRegex(tool.Invalid, "stale terminology job"): tool.validate_job(self.workspace(), job, "web")

    def test_crash_resume_accepts_only_identical_reviewed_import(self):
        workspace = self.workspace("desktop")
        job = workspace.export()
        response = self.response(job)
        workspace.import_response(job, response, "translation/session", "review/session")
        current = self.workspace("desktop")
        self.assertTrue(tool.already_imported(current, job, response, "desktop", "translation/session", "review/session"))
        self.assertFalse(tool.already_imported(current, job, response, "desktop", "translation/session", "different-review/session"))
        altered = copy.deepcopy(response)
        altered["resources"]["show"]["translation"] = "Something else"
        self.assertFalse(tool.already_imported(current, job, altered, "desktop", "translation/session", "review/session"))

    def test_source_snapshot_text_cannot_be_forged_under_an_old_hash(self):
        workspace = self.workspace()
        job = workspace.export()
        response = self.response(job)
        job["resources"]["link"]["source"] = "Another English sentence"
        with self.assertRaisesRegex(tool.Invalid, "snapshot content differs"): workspace.validate_response(job, response)

    def test_terminology_adoption_retains_original_review_and_rejects_stale_snapshots(self):
        self.import_all("desktop")
        workspace = self.workspace("desktop")
        before = copy.deepcopy(workspace.ledger["resources"])
        for row in workspace.ledger["resources"].values(): row.pop("terminologyHash")
        tool.atomic_write(workspace.metadata, tool.json_text(workspace.ledger))
        snapshot = self.root / "terms.json"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(0, tool.main(["--root", str(self.root), "terms-snapshot", "desktop", "de", "--out", str(snapshot)]))
            self.assertEqual(0, tool.main(["--root", str(self.root), "adopt-terminology", "desktop", "de", "--snapshot", str(snapshot), "--reviewer", "terminology-review/session"]))
        current = self.workspace("desktop")
        self.assertFalse(any(current.report().values()))
        for name, row in current.ledger["resources"].items():
            self.assertEqual(before[name]["reviewer"], row["reviewer"])
            self.assertEqual(before[name]["translator"], row["translator"])
            self.assertEqual("terminology-review/session", row["terminologyReviewer"])
        self.terms["register"] = "Sie"
        self.write("localization/terminology/de.json", self.terms)
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            tool.main(["--root", str(self.root), "adopt-terminology", "desktop", "de", "--snapshot", str(snapshot), "--reviewer", "another-review/session"])


if __name__ == "__main__": unittest.main()
