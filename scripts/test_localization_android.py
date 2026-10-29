"""Regression tests for checked translation imports and Android escape layers."""

import copy
import json
from pathlib import Path
import tempfile
import unittest

import localization_android as tool


class LocalizationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / tool.SOURCE
        self.source.parent.mkdir(parents=True)
        self.source.write_text('''<resources>
<!-- Product identity. -->
<string name="brand" translatable="false">200 OK</string>
<!-- %1$s is the user's folder name. -->
<string name="folder">Open %1$s</string>
<string name="episode">Episode %1$02d</string>
<string name="plain">Plain text</string>
<plurals name="count"><item quantity="one">%1$d file</item><item quantity="other">%1$d files</item></plurals>
<plurals name="named"><item quantity="one">Folder %1$s: one file</item><item quantity="other">Folder %1$s: %2$d files</item></plurals>
</resources>''', encoding="utf-8")
        config = self.root / tool.CONFIG
        config.parent.mkdir(parents=True)
        config.write_text(json.dumps({"schemaVersion": 1, "locales": {
            locale: {"catalog": f"draft/{locale}/strings.xml", "quantities": quantities}
            for locale, quantities in {"de": ["one", "other"], "pl": ["one", "few", "many", "other"], "ru": ["one", "few", "many", "other"]}.items()
        }}), encoding="utf-8")
        (self.root / "localization/glossary.json").write_text('{"terms": []}', encoding="utf-8")

    def workspace(self, locale="de"):
        return tool.Workspace(self.root, locale)

    def response(self, job):
        quantities = job["quantities"]
        resources = {}
        for name, resource in job["resources"].items():
            value = resource["source"]
            if resource["kind"] == "plurals":
                value = {quantity: value.get(quantity, value["other"]) for quantity in quantities}
            resources[name] = {"sourceHash": resource["sourceHash"], "kind": resource["kind"], "translation": value}
        return {"schemaVersion": 1, "locale": job["locale"], "resources": resources}

    def import_all(self):
        workspace = self.workspace()
        job = workspace.export()
        workspace.import_response(job, self.response(job), "translator/session-a", "reviewer/session-b")
        return workspace, job

    def test_export_context_exclusion_and_incremental_completion(self):
        workspace = self.workspace()
        job = workspace.export()
        self.assertNotIn("brand", job["resources"])
        self.assertIn("user's folder", job["resources"]["folder"]["context"][0])
        self.assertEqual(job["resources"]["folder"]["arguments"], {"1": "s"})
        workspace.import_response(job, self.response(job), "model/session-a", "model/session-b")
        fresh = self.workspace()
        self.assertFalse(any(fresh.report().values()))
        self.assertEqual(fresh.export()["resources"], {})

    def test_changed_english_and_context_invalidate_existing_review(self):
        self.import_all()
        for before, after in (("Plain text", "Changed text"), ("user's folder name", "chosen download directory")):
            self.source.write_text(self.source.read_text().replace(before, after))
        workspace = self.workspace()
        self.assertEqual(set(workspace.report()["stale"]), {"plain", "folder"})
        self.assertEqual(set(workspace.export()["resources"]), {"plain", "folder"})

    def test_stale_response_rejected_without_writing(self):
        workspace = self.workspace()
        job = workspace.export()
        response = self.response(job)
        self.source.write_text(self.source.read_text().replace("Plain text", "Changed text"))
        with self.assertRaisesRegex(tool.Invalid, "stale source"):
            self.workspace().import_response(job, response, "translator", "reviewer")
        self.assertFalse(workspace.xml.exists())
        self.assertFalse(workspace.metadata.exists())

    def test_unknown_missing_duplicate_and_wrong_type_responses(self):
        workspace = self.workspace()
        job = workspace.export()
        for change in ("missing", "unknown", "type", "kind", "record"):
            response = self.response(job)
            if change == "missing":
                response["resources"].pop("plain")
            elif change == "unknown":
                response["resources"]["extra"] = copy.deepcopy(response["resources"]["plain"])
            elif change == "type":
                response["resources"]["plain"]["translation"] = 42
            elif change == "kind":
                response["resources"]["plain"]["kind"] = "plurals"
            else:
                response["resources"]["plain"]["unknown"] = "ignored?"
            with self.subTest(change=change), self.assertRaises(tool.Invalid):
                workspace.validate_response(job, response)
            self.assertFalse(workspace.xml.exists())
        path = self.root / "duplicate.json"
        path.write_text('{"locale":"de","locale":"pl"}')
        with self.assertRaisesRegex(tool.Invalid, "duplicate JSON key"):
            tool.read_json(path)

    def test_placeholder_types_indices_width_missing_and_percent(self):
        workspace = self.workspace()
        job = workspace.export()
        for key, value in (("folder", "Öffnen %1$d"), ("folder", "Öffnen %2$s"), ("folder", "Öffnen"), ("episode", "Folge %1$d"), ("plain", "100% fertig"), ("plain", "Falsch %s")):
            response = self.response(job)
            response["resources"][key]["translation"] = value
            with self.subTest(value=value), self.assertRaises(tool.Invalid):
                workspace.validate_response(job, response)
        response = self.response(job)
        response["resources"]["plain"]["translation"] = "100%% fertig"
        workspace.validate_response(job, response)

    def test_target_plural_categories_and_resource_argument_contract(self):
        for locale in ("de", "pl", "ru"):
            workspace = self.workspace(locale)
            job = workspace.export()
            response = self.response(job)
            # A target-language singular phrase may omit its count; every
            # argument must nevertheless appear somewhere in the resource.
            response["resources"]["count"]["translation"]["one"] = "Eine Datei"
            workspace.validate_response(job, response)
            response["resources"]["count"]["translation"].pop("other")
            with self.subTest(locale=locale), self.assertRaisesRegex(tool.Invalid, "plural categories"):
                workspace.validate_response(job, response)
        workspace = self.workspace()
        job = workspace.export()
        response = self.response(job)
        response["resources"]["count"]["translation"] = {"one": "Datei", "other": "Dateien"}
        with self.assertRaisesRegex(tool.Invalid, "omits positional"):
            workspace.validate_response(job, response)
        response = self.response(job)
        response["resources"]["named"]["translation"]["one"] = "Eine Datei"
        with self.assertRaisesRegex(tool.Invalid, "missing required"):
            workspace.validate_response(job, response)

    def test_correction_import_replaces_reviewed_xml_and_rejects_races(self):
        workspace, old_job = self.import_all()
        correction_job = self.workspace().export(all_resources=True)
        response = self.response(correction_job)
        response["resources"]["plain"]["translation"] = "Korrigierter Text"
        self.workspace().import_response(correction_job, response, "translator/correction", "reviewer/correction")
        self.assertEqual(self.workspace().translated["plain"]["value"], "Korrigierter Text")
        with self.assertRaisesRegex(tool.Invalid, "changed since export"):
            self.workspace().validate_response(old_job, self.response(old_job))
        with self.assertRaisesRegex(tool.Invalid, "changed since export"):
            self.workspace().validate_response(correction_job, response)

    def test_manual_xml_change_is_a_conflict_and_can_be_reviewed_again(self):
        workspace, _ = self.import_all()
        workspace.xml.write_text(workspace.xml.read_text().replace("Plain text", "Handkorrektur"))
        fresh = self.workspace()
        self.assertEqual(fresh.report()["conflicting"], ["plain"])
        job = fresh.export()
        response = self.response(job)
        response["resources"]["plain"]["translation"] = "Handkorrektur"
        fresh.import_response(job, response, "maintainer/correction", "model/review")
        self.assertFalse(any(self.workspace().report().values()))

    def test_prune_removes_obsolete_xml_and_preserves_origin_history(self):
        workspace, _ = self.import_all()
        self.source.write_text(self.source.read_text().replace('<string name="plain">Plain text</string>', ""))
        fresh = self.workspace()
        self.assertEqual(fresh.report()["obsolete"], ["plain"])
        self.assertEqual(fresh.prune(), ["plain"])
        refreshed = self.workspace()
        self.assertNotIn("plain", refreshed.translated)
        self.assertNotIn("plain", refreshed.ledger["resources"])
        self.assertEqual(refreshed.ledger["retired"]["plain"]["translator"], "translator/session-a")
        self.assertFalse(any(refreshed.report().values()))

    def test_android_escapes_roundtrip_without_double_escaping(self):
        workspace = self.workspace()
        job = workspace.export()
        response = self.response(job)
        text = '  @Frage? "Größe" & <Ordner> \'Apostroph\' \\ Pfad\nZweite\tZeile  '
        response["resources"]["plain"]["translation"] = text
        workspace.import_response(job, response, "translator", "reviewer")
        fresh = self.workspace()
        self.assertEqual(fresh.translated["plain"]["value"], text)
        original = fresh.xml.read_bytes()
        fresh.write()
        self.assertEqual(original, fresh.xml.read_bytes())
        self.assertFalse(any(fresh.report().values()))

    def test_independent_reviewer_required(self):
        workspace = self.workspace()
        job = workspace.export()
        with self.assertRaisesRegex(tool.Invalid, "independent reviewer"):
            workspace.import_response(job, self.response(job), "same/session", "same/session")

    def test_xml_control_characters_rejected_before_import(self):
        workspace = self.workspace()
        job = workspace.export()
        for text in ("Null\x00", "Surrogate\ud800", "Noncharacter\ufffe"):
            response = self.response(job)
            response["resources"]["plain"]["translation"] = text
            with self.assertRaisesRegex(tool.Invalid, "forbidden in XML"):
                workspace.import_response(job, response, "translator", "reviewer")
        self.assertFalse(workspace.xml.exists())

    def test_shared_terminology_is_separate_from_existing_source_review(self):
        workspace, old_job = self.import_all()
        previous_source = workspace.ledger["resources"]["folder"]["sourceHash"]
        terms_path = self.root / "localization/terminology/de.json"
        terms_path.parent.mkdir(parents=True)
        terms = {"schemaVersion": 1, "locale": "de", "register": "du", "terms": {
            "folder": {"sourceTerms": ["folder"], "preferred": "Ordner", "meaning": "User-selected folder"},
        }}
        terms_path.write_text(json.dumps(terms))
        fresh = self.workspace()
        self.assertEqual(set(fresh.source), set(fresh.report()["terminologyUntracked"]))
        self.assertEqual(previous_source, fresh.source["folder"]["sourceHash"])
        job = fresh.export()
        response = self.response(job)
        for name, row in response["resources"].items(): row["terminologyHash"] = job["resources"][name]["terminologyHash"]
        fresh.import_response(job, response, "translation/terms", "review/terms")
        terms["terms"]["folder"]["preferred"] = "Downloadordner"
        terms_path.write_text(json.dumps(terms))
        changed = self.workspace()
        self.assertEqual(["folder", "named"], changed.report()["terminologyChanged"])
        with self.assertRaisesRegex(tool.Invalid, "stale terminology"):
            changed.validate_response(job, response)


if __name__ == "__main__":
    unittest.main()
