#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const tauriDirectory = path.resolve(scriptDirectory, "..", "src-tauri");
const desktopDirectory = path.resolve(scriptDirectory, "..", "..");
const binariesDirectory = path.join(tauriDirectory, "binaries");

const explicitTarget =
  process.env.TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE;
const rustcVersion = execFileSync("rustc", ["-vV"], {
  encoding: "utf8",
});
const hostTriple = rustcVersion
  .split(/\r?\n/)
  .find((line) => line.startsWith("host: "))
  ?.slice("host: ".length);
const triple = explicitTarget || hostTriple;

if (!triple) {
  throw new Error("prepare-sidecar: rustc did not report a host triple");
}

console.log(`prepare-sidecar: triple=${triple}`);

const hostBinary = "ok200-host";
const extension = triple.includes("windows") ? ".exe" : "";
const destination = path.join(
  binariesDirectory,
  `${hostBinary}-${triple}${extension}`,
);

fs.mkdirSync(binariesDirectory, { recursive: true });

if (process.env.CI === "true" && fs.existsSync(destination)) {
  console.log(
    `prepare-sidecar: ${destination} already exists (CI), skipping build`,
  );
  process.exit(0);
}

const cargoArguments = ["build", "--release", "-p", hostBinary];
if (explicitTarget) {
  cargoArguments.push("--target", triple);
}

console.log(`prepare-sidecar: building ${hostBinary}...`);
execFileSync("cargo", cargoArguments, {
  cwd: desktopDirectory,
  stdio: "inherit",
});

const source = explicitTarget
  ? path.join(
      desktopDirectory,
      "target",
      triple,
      "release",
      `${hostBinary}${extension}`,
    )
  : path.join(
      desktopDirectory,
      "target",
      "release",
      `${hostBinary}${extension}`,
    );

if (!fs.existsSync(source)) {
  throw new Error(`prepare-sidecar: built binary not found at ${source}`);
}

fs.copyFileSync(source, destination);
console.log(`prepare-sidecar: copied ${source} -> ${destination}`);

const developmentDestination = path.join(
  binariesDirectory,
  `${hostBinary}${extension}`,
);
fs.copyFileSync(source, developmentDestination);

if (process.platform === "darwin") {
  for (const binary of [destination, developmentDestination]) {
    try {
      execFileSync("codesign", ["--force", "--sign", "-", binary], {
        stdio: "ignore",
      });
    } catch {
      // Ad-hoc signing is a local development convenience. Release signing
      // remains the responsibility of the Tauri release workflow.
    }
  }
  console.log("prepare-sidecar: re-signed binaries");
}

console.log("prepare-sidecar: done");
