// Bind an inspected ZIP to its source revision for the publishing job.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [zipPath, outputPath] = process.argv.slice(2);
assert(
  zipPath && outputPath,
  "Usage: record-extension-build.mjs ZIP BUILD_JSON",
);
assert.equal(basename(zipPath), "ok200-extension.zip");
const manifest = JSON.parse(
  execFileSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" }),
);
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      filename: basename(zipPath),
      version: manifest.version,
      extensionId: "lpkjdhnmgkhaabhimpdinmdgejoaejic",
      revision: git("rev-parse", "HEAD"),
      sourceDirty: git("status", "--porcelain").length !== 0,
      sha256: createHash("sha256").update(readFileSync(zipPath)).digest("hex"),
    },
    null,
    2,
  )}\n`,
);
