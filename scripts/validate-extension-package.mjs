#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LEGACY_APP_ID = "ofhbbkphhbklhfoeikjpcbhemlocgigb";
const PRODUCTION_SITE_MATCH = "https://ok200.app/*";
const CROSTINI_CONTROLLER_MATCH = "http://penguin.linux.test/*";
const EXPECTED_DESCRIPTION =
  "Launch 200 OK on desktop or ChromeOS; set up and control its ChromeOS Linux server. Successor to Web Server for Chrome.";
const EXPECTED_ICONS = {
  16: "icons/ok-16.png",
  32: "icons/ok-32.png",
  48: "icons/ok-48.png",
  128: "icons/ok-128.png",
};
const REQUIRED_FILES = new Set([
  "icons/ok-16.png",
  "icons/ok-32.png",
  "icons/ok-48.png",
  "icons/ok-128.png",
  "manifest.json",
  "src/ui/app.html",
  "src/ui/crostini.html",
  "sw.js",
]);

const { inputPath, expectedVersion } = parseArguments(process.argv.slice(2));
const packageReader = createPackageReader(inputPath);
const entries = packageReader.entries();
const uniqueEntries = new Set(entries);

assert(
  entries.length === uniqueEntries.size,
  "archive contains duplicate entries",
);
for (const required of REQUIRED_FILES) {
  assert(uniqueEntries.has(required), `missing required file: ${required}`);
}

let scriptAssetCount = 0;
for (const entry of entries) {
  assert(
    !entry.startsWith("/") && !entry.includes(".."),
    `unsafe path: ${entry}`,
  );
  assert(!entry.endsWith(".map"), `source map is not store-safe: ${entry}`);
  assert(
    !entry.endsWith(".ts") && !entry.endsWith(".tsx"),
    `source file is not store-safe: ${entry}`,
  );
  assert(
    entry !== "fullpubkey.txt",
    "development public key file is not store-safe",
  );
  if (REQUIRED_FILES.has(entry)) continue;
  if (/^assets\/[A-Za-z0-9_-]+\.js$/.test(entry)) {
    scriptAssetCount += 1;
    continue;
  }
  if (/^assets\/[A-Za-z0-9_-]+\.css$/.test(entry)) {
    continue;
  }
  throw new Error(`unexpected package file: ${entry}`);
}
assert(scriptAssetCount > 0, "missing compiled JavaScript assets");

const manifestText = packageReader.readText("manifest.json");
const manifest = JSON.parse(manifestText);
assert(manifest.manifest_version === 3, "manifest_version must be 3");
assert(manifest.name === "200 OK Web Server", "unexpected extension name");
assert(manifest.short_name === "200 OK", "unexpected extension short name");
assert(
  manifest.description === EXPECTED_DESCRIPTION,
  "unexpected extension description",
);
assert(
  /^\d+\.\d+\.\d+$/.test(manifest.version),
  "manifest version must use numeric semver",
);
assert(!Object.hasOwn(manifest, "key"), "manifest contains a development key");
assert(
  JSON.stringify(manifest.optional_host_permissions) ===
    JSON.stringify([CROSTINI_CONTROLLER_MATCH]),
  "optional host permissions must contain only the Crostini controller",
);
assert(
  !Object.hasOwn(manifest, "host_permissions"),
  "manifest contains required host permissions",
);
assert(
  !Object.hasOwn(manifest, "content_scripts"),
  "manifest contains unexpected content scripts",
);
assert(
  !Object.hasOwn(manifest, "content_security_policy"),
  "manifest must use Chrome's strict default extension-page CSP",
);
assert(
  JSON.stringify(manifest.permissions) === JSON.stringify(["nativeMessaging"]),
  "permissions must contain only nativeMessaging",
);
assert(
  manifest.background?.service_worker === "sw.js",
  "unexpected service worker path",
);
assert(
  manifest.background?.type === "module",
  "service worker must use module type",
);
assert(
  manifest.action?.default_popup === "src/ui/app.html",
  "unexpected popup path",
);
assert(
  manifest.action?.default_title === "Open 200 OK Web Server",
  "unexpected extension action title",
);
assert(
  JSON.stringify(manifest.icons) === JSON.stringify(EXPECTED_ICONS),
  "unexpected extension icons",
);
assert(
  JSON.stringify(manifest.externally_connectable?.ids) ===
    JSON.stringify([LEGACY_APP_ID]),
  "unexpected externally_connectable ids",
);
assert(
  JSON.stringify(manifest.externally_connectable?.matches) ===
    JSON.stringify([PRODUCTION_SITE_MATCH, CROSTINI_CONTROLLER_MATCH]),
  "unexpected externally_connectable matches",
);
if (expectedVersion) {
  assert(
    manifest.version === expectedVersion,
    `manifest version ${manifest.version} does not match ${expectedVersion}`,
  );
}

for (const entry of entries) {
  if (!/\.(?:html|js|json)$/.test(entry)) continue;
  const text = packageReader.readText(entry);
  assert(
    !text.includes("local.ok200.app"),
    `development origin found in ${entry}`,
  );
  assert(!text.includes("localhost:"), `localhost origin found in ${entry}`);
}

console.log(
  `Validated ${inputPath}: version ${manifest.version}, ${entries.length} files, store-safe manifest`,
);

function parseArguments(args) {
  let input;
  let version;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--expected-version") {
      version = args[index + 1];
      index += 1;
    } else if (!input) {
      input = args[index];
    } else {
      throw new Error(`unexpected argument: ${args[index]}`);
    }
  }
  if (!input) {
    throw new Error(
      "usage: validate-extension-package.mjs <directory-or-zip> [--expected-version VERSION]",
    );
  }
  return { inputPath: path.resolve(input), expectedVersion: version };
}

function createPackageReader(input) {
  const stats = fs.statSync(input);
  if (stats.isDirectory()) {
    return {
      entries: () => listDirectoryFiles(input),
      readText: (entry) => fs.readFileSync(path.join(input, entry), "utf8"),
    };
  }
  assert(
    stats.isFile() && input.endsWith(".zip"),
    "input must be a directory or ZIP",
  );
  return {
    entries: () =>
      execFileSync("unzip", ["-Z1", input], { encoding: "utf8" })
        .split("\n")
        .map((entry) => entry.replace(/^\.\//, ""))
        .filter((entry) => entry && !entry.endsWith("/")),
    readText: (entry) =>
      execFileSync("unzip", ["-p", input, entry], {
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      }),
  };
}

function listDirectoryFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, item.name);
      assert(
        !item.isSymbolicLink(),
        `symbolic link is not allowed: ${itemPath}`,
      );
      if (item.isDirectory()) visit(itemPath);
      else if (item.isFile())
        files.push(path.relative(root, itemPath).split(path.sep).join("/"));
      else throw new Error(`unsupported package entry: ${itemPath}`);
    }
  };
  visit(root);
  return files.sort();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
