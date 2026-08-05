import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const corpusPath = fileURLToPath(new URL("./corpus-v1.json", import.meta.url));
const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

test("compatibility corpus v1 is complete and uniquely identified", () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.match(corpus.corpusVersion, /^\d+\.\d+\.\d+$/);

  const groups = [
    corpus.nativeHost.cases,
    corpus.nativeHost.recovery,
    corpus.crostiniController.cases,
    corpus.crostiniRelease.cases,
    corpus.desktopUpdater.cases,
    ...Object.values(corpus.persistedSettings),
    corpus.historicalIncompatibilities,
  ];
  const ids = groups.flat().map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, "fixture IDs must be unique");
  for (const id of ids) assert.match(id, /^[a-z0-9-]+$/);

  assert.deepEqual(
    new Set(corpus.nativeHost.cases.map((entry) => entry.direction)),
    new Set(["old-producer-new-consumer", "new-producer-old-consumer"]),
  );
  assert.deepEqual(
    new Set(corpus.crostiniController.cases.map((entry) => entry.direction)),
    new Set([
      "current-current",
      "old-producer-new-consumer",
      "new-producer-old-consumer",
    ]),
  );
  assert.deepEqual(
    new Set(corpus.crostiniRelease.cases.map((entry) => entry.kind)),
    new Set(["manifest", "architecture", "install-version"]),
  );
  assert.deepEqual(
    new Set(corpus.desktopUpdater.cases.map((entry) => entry.mutation)),
    new Set([
      "none",
      "previous-version",
      "future-version",
      "missing-platforms",
      "linux-deb",
    ]),
  );

  for (const [application, fixtures] of Object.entries(
    corpus.persistedSettings,
  )) {
    assert.deepEqual(
      new Set(fixtures.map((entry) => entry.form)),
      new Set(["oldest", "current", "unknown-future", "invalid"]),
      `${application} settings fixtures are incomplete`,
    );
  }
});

test("intentional incompatibilities remain bounded and recoverable", () => {
  assert.ok(corpus.historicalIncompatibilities.length > 0);
  for (const incompatibility of corpus.historicalIncompatibilities) {
    assert.ok(incompatibility.affectedPublicVersions.length >= 2);
    assert.ok(incompatibility.reason.length >= 40);
    assert.ok(incompatibility.recovery.length >= 40);
    assert.ok(incompatibility.removalPoint.length >= 40);
  }
});
