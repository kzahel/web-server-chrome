#!/usr/bin/env node

import fs from 'node:fs';

const [releasePath, outputPath] = process.argv.slice(2);
if (!releasePath || !outputPath) {
  console.error('usage: write-release-checksums.mjs RELEASE_JSON OUTPUT');
  process.exit(2);
}

const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const lines = release.assets
  .filter((asset) => asset.name !== 'SHA256SUMS' && !asset.name.endsWith('.sig'))
  .map((asset) => {
    if (/\s/.test(asset.name)) {
      throw new Error(`cannot write checksum for filename with whitespace: ${asset.name}`);
    }
    if (!/^sha256:[0-9a-f]{64}$/i.test(asset.digest ?? '')) {
      throw new Error(`asset has no GitHub SHA-256 digest: ${asset.name}`);
    }
    return `${asset.digest.slice('sha256:'.length)}  ${asset.name}`;
  })
  .sort();

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
