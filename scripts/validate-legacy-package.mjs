#!/usr/bin/env node

import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageRoot = path.resolve(process.argv[2] || "legacy");

async function walk(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    const stat = await lstat(absolutePath);
    assert.equal(
      stat.isSymbolicLink(),
      false,
      `package must not contain symlink: ${relativePath}`,
    );
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath, relativePath)));
    } else {
      files.push(relativePath);
    }
  }
  return files;
}

const manifest = JSON.parse(
  await readFile(path.join(packageRoot, "manifest.json"), "utf8"),
);
const files = await walk(packageRoot);
const background = await readFile(
  path.join(packageRoot, "background.js"),
  "utf8",
);
const migration = await readFile(
  path.join(packageRoot, "migration.js"),
  "utf8",
);
const prompt = await readFile(path.join(packageRoot, "migrate.html"), "utf8");
const fallbackUi = await readFile(path.join(packageRoot, "index.html"), "utf8");

assert.equal(
  manifest.version,
  "0.5.4",
  "legacy candidate must be version 0.5.4",
);
assert.equal(
  manifest.manifest_version,
  2,
  "legacy app must remain a packaged Chrome App",
);
assert.equal(manifest.app.background.scripts.at(-2), "migration.js");
assert.equal(manifest.app.background.scripts.at(-1), "background.js");
assert.equal(manifest.externally_connectable.ids.length, 1);
assert.equal(
  manifest.externally_connectable.ids[0],
  "lpkjdhnmgkhaabhimpdinmdgejoaejic",
);
assert.deepEqual(manifest.externally_connectable.matches, [
  "https://ok200.app/*",
]);
assert.ok(files.includes("migrate.html"));
assert.ok(files.includes("migrate.js"));
assert.ok(files.includes("migration.js"));
assert.equal(
  files.some((file) =>
    /(^|\/)\.DS_Store$|__MACOSX|\.zip$|\.map$|(^|\/)test\.html$/i.test(file),
  ),
  false,
  "package contains a development-only or generated file",
);
assert.doesNotMatch(
  background,
  /MIGRATE_ON_SCRIPT_LOAD|showMigrationNags|MIGRATE_ALARM_MINUTES\s*=\s*10/,
);
assert.match(background, /resetMigrationAlarm\(\)/);
assert.match(
  background,
  /maybeShowMigrationPrompt\('onInstalled', true, false\)/,
);
assert.match(migration, /https:\/\/ok200\.app\/migrate/);
assert.doesNotMatch(prompt, /same features and more|You're all set/i);
assert.doesNotMatch(
  fallbackUi,
  /chrome\.google\.com|kyle\.graehl\.org|chromebeat\.com/i,
);

console.log(
  `Validated legacy Chrome App ${manifest.version} package (${files.length} files)`,
);
