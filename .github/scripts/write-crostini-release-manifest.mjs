#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

export const MANIFEST_NAME = "ok200-crostini-release.manifest";
export const SIGNATURE_NAME = "ok200-crostini-release.manifest.minisig";
export const CONTROLLER_PROTOCOL_VERSION = 2;
export const EXTENSION_PROTOCOL_MIN = 2;
export const EXTENSION_PROTOCOL_MAX = 2;

const ARCHITECTURES = ["x86_64", "aarch64"];
const MAX_ASSET_BYTES = 64 * 1024 * 1024;

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`invalid final Crostini version: ${version}`);
  }
}

function validateCommit(commit) {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`invalid source commit: ${commit}`);
  }
}

function describeAsset(path, arch) {
  const expectedName = `ok200-crostini-${arch}-unknown-linux-musl`;
  if (basename(path) !== expectedName) {
    throw new Error(`${arch} asset must be named ${expectedName}`);
  }
  const size = statSync(path).size;
  if (size <= 0 || size > MAX_ASSET_BYTES) {
    throw new Error(`${expectedName} has invalid size ${size}`);
  }
  return { name: expectedName, sha256: sha256(path), size };
}

export function createCrostiniReleaseManifest({
  version,
  sourceCommit,
  x86_64Path,
  aarch64Path,
}) {
  validateVersion(version);
  validateCommit(sourceCommit);
  const assets = {
    x86_64: describeAsset(x86_64Path, "x86_64"),
    aarch64: describeAsset(aarch64Path, "aarch64"),
  };
  const lines = [
    "ok200-crostini-release-v1",
    `version=${version}`,
    `tag=crostini-v${version}`,
    "repository=kzahel/web-server-chrome",
    `source_commit=${sourceCommit}`,
    `controller_protocol=${CONTROLLER_PROTOCOL_VERSION}`,
    `extension_protocol_min=${EXTENSION_PROTOCOL_MIN}`,
    `extension_protocol_max=${EXTENSION_PROTOCOL_MAX}`,
    "runtime=linux-musl-static",
  ];
  for (const arch of ARCHITECTURES) {
    const asset = assets[arch];
    lines.push(`${arch}_asset=${asset.name}`);
    lines.push(`${arch}_sha256=${asset.sha256}`);
    lines.push(`${arch}_size=${asset.size}`);
  }
  lines.push(`manifest_asset=${MANIFEST_NAME}`);
  lines.push(`signature_asset=${SIGNATURE_NAME}`);
  return `${lines.join("\n")}\n`;
}

function main() {
  const [version, sourceCommit, x86_64Path, aarch64Path, outputPath] =
    process.argv.slice(2);
  if (
    !version ||
    !sourceCommit ||
    !x86_64Path ||
    !aarch64Path ||
    !outputPath ||
    process.argv.length !== 7
  ) {
    throw new Error(
      "usage: write-crostini-release-manifest.mjs <version> <commit> <x86_64-binary> <aarch64-binary> <output>",
    );
  }
  writeFileSync(
    outputPath,
    createCrostiniReleaseManifest({
      version,
      sourceCommit,
      x86_64Path,
      aarch64Path,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
