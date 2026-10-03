import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function read(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function loadMigrationHelpers() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(await read("legacy/migration.js"), context);
  return context;
}

test("legacy migration detects supported platforms without treating Linux as ChromeOS", async () => {
  const helpers = await loadMigrationHelpers();
  assert.equal(
    helpers.getMigrationPlatform("Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)"),
    "chromeos",
  );
  assert.equal(
    helpers.getMigrationPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"),
    "windows",
  );
  assert.equal(
    helpers.getMigrationPlatform(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    ),
    "macos",
  );
  assert.equal(
    helpers.getMigrationPlatform("Mozilla/5.0 (X11; Linux x86_64)"),
    "linux",
  );
  assert.equal(
    helpers.getMigrationPlatform("Mozilla/5.0 (Linux; Android 16)"),
    "android",
  );
});

test("legacy migration routes every platform through the stable owned page", async () => {
  const helpers = await loadMigrationHelpers();
  assert.equal(
    helpers.getMigrationUrl("chromeos"),
    "https://ok200.app/migrate?ref=legacy-app&platform=chromeos",
  );
  assert.match(
    helpers.getMigrationNotificationCopy("windows", false).message,
    /ok200\.app\/migrate/,
  );
  assert.match(
    helpers.getMigrationNotificationCopy("chromeos", false).message,
    /Remove it now/,
  );
  assert.doesNotMatch(
    helpers.getMigrationNotificationCopy("windows", false).message,
    /available as a Chrome Extension/i,
  );
  assert.match(
    helpers.getMigrationNotificationCopy("windows", true).title,
    /Remove the old Web Server app/,
  );
});

test("legacy migration reminder is due no more than once every seven days", async () => {
  const helpers = await loadMigrationHelpers();
  const now = Date.UTC(2026, 7, 7);
  const day = 24 * 60 * 60 * 1000;
  assert.equal(helpers.MIGRATION_ALARM_MINUTES, 7 * 24 * 60);
  assert.equal(helpers.isMigrationReminderDue(0, 0, now), true);
  assert.equal(helpers.isMigrationReminderDue(now - 6 * day, 0, now), false);
  assert.equal(helpers.isMigrationReminderDue(now - 7 * day, 0, now), true);
  assert.equal(
    helpers.isMigrationReminderDue(now - 8 * day, now + day, now),
    false,
  );
});

test("0.5.4 package configuration uses the bounded migration policy", async () => {
  const manifest = JSON.parse(await read("legacy/manifest.json"));
  const backgroundScripts = manifest.app.background.scripts;
  const background = await read("legacy/background.js");
  assert.equal(manifest.version, "0.5.4");
  assert.ok(backgroundScripts.includes("migration.js"));
  assert.ok(
    backgroundScripts.indexOf("migration.js") <
      backgroundScripts.indexOf("background.js"),
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
  assert.match(background, /checkForNewExtension/);
  assert.match(background, /OS !== 'chromeos'/);
  assert.match(background, /typeof chrome\.browser\.openTab === 'function'/);
  assert.match(background, /window\.open\(url\)/);
  assert.match(background, /chrome\.notifications\.onButtonClicked/);
  assert.match(background, /\{ showConfirmDialog: true \}/);
  assert.match(background, /migrationRemindersDisabledAt/);
  assert.doesNotMatch(background, /replacement extension detected, skipping/);
});

test("legacy prompt and public migration page distinguish the extension from the server", async () => {
  const prompt = await read("legacy/migrate.html");
  const page = await read("website/src/pages/migrate.astro");
  assert.doesNotMatch(prompt, /same features and more|You're all set/i);
  assert.match(prompt, /can be removed now/);
  assert.doesNotMatch(prompt, /before removing this old app/i);
  assert.match(prompt, /id="uninstall-btn"/);
  assert.match(prompt, /id="stop-btn"/);
  assert.match(page, /does\s+not contain the web server by itself/);
  assert.match(page, /can be\s+removed now/);
  assert.doesNotMatch(page, /Keep the old app until/i);
  assert.match(page, /\/download\?ref=legacy-app/);
  assert.match(page, /\/chromeos\?ref=legacy-app/);
  assert.match(
    page,
    /play\.google\.com\/store\/apps\/details\?id=app\.ok200\.android/,
  );
  assert.match(page, /chromewebstore\.google\.com\/detail/);
});

test("0.5.4 and the generally available extension retain the additive ping contract", async () => {
  const legacyManifest = JSON.parse(await read("legacy/manifest.json"));
  const extensionManifest = JSON.parse(
    await read("extension/public/manifest.json"),
  );
  const extensionWorker = await read("extension/src/sw.ts");
  assert.deepEqual(legacyManifest.externally_connectable.ids, [
    "lpkjdhnmgkhaabhimpdinmdgejoaejic",
  ]);
  assert.ok(
    extensionManifest.externally_connectable.ids.includes(
      "ofhbbkphhbklhfoeikjpcbhemlocgigb",
    ),
  );
  assert.match(extensionWorker, /message\.type === "ping"/);
  assert.match(extensionWorker, /installed:\s*true/);
});

test("post-uninstall and legacy fallback links use owned migration and support routes", async () => {
  const uninstallPage = await read("website/src/pages/uninstall.astro");
  const legacyFallback = await read("legacy/index.html");
  assert.match(uninstallPage, /\/migrate\?ref=legacy-uninstall/);
  assert.doesNotMatch(uninstallPage, /You're all set/i);
  assert.match(legacyFallback, /https:\/\/ok200\.app\/support\?ref=legacy-app/);
  assert.match(legacyFallback, /https:\/\/ok200\.app\/migrate\?ref=legacy-app/);
  assert.doesNotMatch(legacyFallback, /chrome\.google\.com/);
});
