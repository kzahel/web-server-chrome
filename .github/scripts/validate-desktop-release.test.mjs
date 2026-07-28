import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateDesktopRelease } from "./validate-desktop-release.mjs";

const tag = "desktop-v1.2.3";
const repository = "kzahel/web-server-chrome";
const version = "1.2.3";
const digest = `sha256:${"a".repeat(64)}`;

function fixture() {
  const installerAssets = [
    `200.OK_${version}_aarch64.dmg`,
    `200.OK_${version}_x64.dmg`,
    `200_OK_${version}_aarch64.pkg`,
    `200_OK_${version}_x64.pkg`,
    `200.OK_${version}_x64-setup.exe`,
    `200.OK_${version}_x64_en-US.msi`,
    `200.OK_${version}_amd64.AppImage`,
    `200.OK_${version}_amd64.deb`,
    `200.OK-${version}-1.x86_64.rpm`,
    "latest.json",
  ];
  const updaterAssets = {
    "darwin-aarch64": "200.OK_aarch64.app.tar.gz",
    "darwin-x86_64": "200.OK_x64.app.tar.gz",
    "linux-x86_64": `200.OK_${version}_amd64.AppImage`,
    "windows-x86_64": `200.OK_${version}_x64-setup.exe`,
  };
  const names = new Set(installerAssets);
  for (const name of Object.values(updaterAssets)) {
    names.add(name);
    names.add(`${name}.sig`);
  }

  return {
    release: {
      tagName: tag,
      isDraft: true,
      assets: [...names].map((name) => ({ name, digest })),
    },
    latest: {
      version,
      platforms: Object.fromEntries(
        Object.entries(updaterAssets).map(([platform, name]) => [
          platform,
          {
            signature: "signed-updater-metadata-that-is-long-enough",
            url: `https://github.com/${repository}/releases/download/${tag}/${name}`,
          },
        ]),
      ),
    },
  };
}

test("accepts a complete draft release", () => {
  const data = fixture();
  assert.equal(
    validateDesktopRelease({ ...data, tag, repository }).version,
    version,
  );
});

test("rejects an already-public release", () => {
  const data = fixture();
  data.release.isDraft = false;
  assert.throws(
    () => validateDesktopRelease({ ...data, tag, repository }),
    /must remain a draft/,
  );
});

test("rejects a missing installer", () => {
  const data = fixture();
  data.release.assets = data.release.assets.filter(
    (asset) => asset.name !== `200.OK_${version}_x64_en-US.msi`,
  );
  assert.throws(
    () => validateDesktopRelease({ ...data, tag, repository }),
    /missing required release asset/,
  );
});

test("rejects missing updater target coverage", () => {
  const data = fixture();
  delete data.latest.platforms["windows-x86_64"];
  assert.throws(
    () => validateDesktopRelease({ ...data, tag, repository }),
    /missing platform windows-x86_64/,
  );
});

test("rejects updater URLs outside the tagged GitHub release", () => {
  const data = fixture();
  data.latest.platforms["linux-x86_64"].url =
    "https://example.com/200.OK_1.2.3_amd64.AppImage";
  assert.throws(
    () => validateDesktopRelease({ ...data, tag, repository }),
    /unexpected URL/,
  );
});

test("writes stable checksums only for assets retained in the release", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "ok200-release-test-"),
  );
  try {
    const releasePath = path.join(directory, "release.json");
    const outputPath = path.join(directory, "SHA256SUMS");
    fs.writeFileSync(
      releasePath,
      JSON.stringify({
        assets: [
          { name: "z.pkg.sig", digest },
          { name: "z.pkg", digest: `sha256:${"b".repeat(64)}` },
          { name: "a.dmg", digest },
        ],
      }),
    );

    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("./write-release-checksums.mjs", import.meta.url),
        ),
        releasePath,
        outputPath,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      fs.readFileSync(outputPath, "utf8"),
      `${"a".repeat(64)}  a.dmg\n${"b".repeat(64)}  z.pkg\n`,
    );
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
