import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCrostiniReleaseManifest } from "./write-crostini-release-manifest.mjs";

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
  assert.match(manifest, /runtime=linux-musl-static\n/);
  assert.match(manifest, /x86_64_sha256=[0-9a-f]{64}\n/);
  assert.match(manifest, /aarch64_sha256=[0-9a-f]{64}\n/);
  assert.match(
    manifest,
    /signature_asset=ok200-crostini-release\.manifest\.minisig\n$/,
  );
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
