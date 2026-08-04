import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  CONTROLLER_PROTOCOL_VERSION,
  createCrostiniReleaseManifest,
  EXTENSION_PROTOCOL_MAX,
  EXTENSION_PROTOCOL_MIN,
} from "./write-crostini-release-manifest.mjs";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "ok200-crostini-manifest-"));
  const x86_64Path = join(
    directory,
    "ok200-crostini-x86_64-unknown-linux-musl",
  );
  const aarch64Path = join(
    directory,
    "ok200-crostini-aarch64-unknown-linux-musl",
  );
  writeFileSync(x86_64Path, "x86 release bytes\n");
  writeFileSync(aarch64Path, "arm release bytes\n");
  return { aarch64Path, x86_64Path };
}

test("writes the canonical strict two-architecture manifest", () => {
  const manifest = createCrostiniReleaseManifest({
    version: "0.1.0",
    sourceCommit: "0123456789abcdef0123456789abcdef01234567",
    ...fixture(),
  });
  assert.match(manifest, /^ok200-crostini-release-v1\n/);
  assert.match(manifest, /tag=crostini-v0\.1\.0\n/);
  assert.match(manifest, /controller_protocol=2\n/);
  assert.match(manifest, /extension_protocol_min=2\n/);
  assert.match(manifest, /extension_protocol_max=2\n/);
  assert.match(manifest, /runtime=linux-musl-static\n/);
  assert.match(manifest, /x86_64_sha256=[0-9a-f]{64}\n/);
  assert.match(manifest, /aarch64_sha256=[0-9a-f]{64}\n/);
  assert.match(
    manifest,
    /signature_asset=ok200-crostini-release\.manifest\.minisig\n$/,
  );
});

test("keeps release metadata aligned with controller and extension source", () => {
  const controllerSource = readFileSync(
    new URL("../../desktop/crostini/src/lib.rs", import.meta.url),
    "utf8",
  );
  const extensionSource = readFileSync(
    new URL("../../extension/src/lib/crostini-controller.ts", import.meta.url),
    "utf8",
  );
  const releaseSource = readFileSync(
    new URL("../../desktop/crostini/src/release.rs", import.meta.url),
    "utf8",
  );
  const installerSource = readFileSync(
    new URL("../../website/public/install-crostini.sh", import.meta.url),
    "utf8",
  );

  assert.match(
    controllerSource,
    new RegExp(
      `CONTROLLER_PROTOCOL_VERSION: u16 = ${CONTROLLER_PROTOCOL_VERSION};`,
    ),
  );
  assert.match(
    extensionSource,
    new RegExp(`CONTROLLER_PROTOCOL_VERSION = ${CONTROLLER_PROTOCOL_VERSION};`),
  );
  assert.match(
    releaseSource,
    new RegExp(
      `EXTENSION_PROTOCOL_VERSION: u16 = ${CONTROLLER_PROTOCOL_VERSION};`,
    ),
  );
  assert.match(
    installerSource,
    new RegExp(`CONTROLLER_PROTOCOL_VERSION="${CONTROLLER_PROTOCOL_VERSION}"`),
  );
  assert.match(
    installerSource,
    new RegExp(`EXTENSION_PROTOCOL_MIN="${EXTENSION_PROTOCOL_MIN}"`),
  );
  assert.match(
    installerSource,
    new RegExp(`EXTENSION_PROTOCOL_MAX="${EXTENSION_PROTOCOL_MAX}"`),
  );
  assert.equal(EXTENSION_PROTOCOL_MIN, CONTROLLER_PROTOCOL_VERSION);
  assert.equal(EXTENSION_PROTOCOL_MAX, CONTROLLER_PROTOCOL_VERSION);
});

test("rejects prereleases, malformed commits, and misleading asset names", () => {
  const files = fixture();
  assert.throws(() =>
    createCrostiniReleaseManifest({
      version: "0.1.0-dev.1",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
      ...files,
    }),
  );
  assert.throws(() =>
    createCrostiniReleaseManifest({
      version: "0.01.0",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
      ...files,
    }),
  );
  assert.throws(() =>
    createCrostiniReleaseManifest({
      version: "0.1.0",
      sourceCommit: "not-a-commit",
      ...files,
    }),
  );
  assert.throws(() =>
    createCrostiniReleaseManifest({
      version: "0.1.0",
      sourceCommit: "0123456789abcdef0123456789abcdef01234567",
      x86_64Path: files.aarch64Path,
      aarch64Path: files.aarch64Path,
    }),
  );
});
