#!/usr/bin/env node

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function requireAsset(assetNames, name) {
  if (!assetNames.has(name)) {
    fail(`missing required release asset: ${name}`);
  }
}

export function validateDesktopRelease({ release, latest, tag, repository }) {
  if (!tag.startsWith('desktop-v')) {
    fail(`unexpected desktop tag: ${tag}`);
  }

  const version = tag.slice('desktop-v'.length);
  if (release.tagName !== tag) {
    fail(`release tag ${release.tagName} does not match ${tag}`);
  }
  if (!release.isDraft) {
    fail('release must remain a draft until validation succeeds');
  }
  if (!Array.isArray(release.assets)) {
    fail('release assets are missing');
  }

  const assetNames = new Set();
  for (const asset of release.assets) {
    if (!asset.name || assetNames.has(asset.name)) {
      fail(`missing or duplicate release asset name: ${asset.name ?? '<empty>'}`);
    }
    assetNames.add(asset.name);
    if (!/^sha256:[0-9a-f]{64}$/i.test(asset.digest ?? '')) {
      fail(`release asset ${asset.name} is missing a GitHub SHA-256 digest`);
    }
  }

  const requiredInstallers = [
    `200.OK_${version}_aarch64.dmg`,
    `200.OK_${version}_x64.dmg`,
    `200_OK_${version}_aarch64.pkg`,
    `200_OK_${version}_x64.pkg`,
    `200.OK_${version}_x64-setup.exe`,
    `200.OK_${version}_x64_en-US.msi`,
    `200.OK_${version}_amd64.AppImage`,
    `200.OK_${version}_amd64.deb`,
    `200.OK-${version}-1.x86_64.rpm`,
    'latest.json',
  ];
  for (const name of requiredInstallers) {
    requireAsset(assetNames, name);
  }

  if (latest.version !== version) {
    fail(`latest.json version ${latest.version} does not match ${version}`);
  }

  const requiredPlatforms = [
    'darwin-aarch64',
    'darwin-x86_64',
    'linux-x86_64',
    'windows-x86_64',
  ];
  if (!latest.platforms || typeof latest.platforms !== 'object') {
    fail('latest.json platforms are missing');
  }
  for (const platform of requiredPlatforms) {
    if (!latest.platforms[platform]) {
      fail(`latest.json is missing platform ${platform}`);
    }
  }

  const expectedUrlPrefix =
    `https://github.com/${repository}/releases/download/${tag}/`;
  for (const [platform, metadata] of Object.entries(latest.platforms)) {
    if (typeof metadata.signature !== 'string' || metadata.signature.length < 32) {
      fail(`latest.json platform ${platform} has no usable signature`);
    }
    if (typeof metadata.url !== 'string' || !metadata.url.startsWith(expectedUrlPrefix)) {
      fail(`latest.json platform ${platform} has an unexpected URL: ${metadata.url}`);
    }

    const assetName = decodeURIComponent(metadata.url.slice(expectedUrlPrefix.length));
    requireAsset(assetNames, assetName);
    requireAsset(assetNames, `${assetName}.sig`);
  }

  return { version, requiredInstallers };
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      fail(`invalid argument list near ${name ?? '<end>'}`);
    }
    args[name.slice(2)] = value;
  }
  for (const name of ['release', 'latest', 'tag', 'repository']) {
    if (!args[name]) {
      fail(`missing --${name}`);
    }
  }
  return args;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const result = validateDesktopRelease({
      release: readJson(args.release),
      latest: readJson(args.latest),
      tag: args.tag,
      repository: args.repository,
    });
    console.log(`Validated complete draft desktop release ${result.version}`);
  } catch (error) {
    console.error(`Desktop release validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
