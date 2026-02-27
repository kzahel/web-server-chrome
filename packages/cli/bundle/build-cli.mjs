#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../package.json"), "utf-8"),
);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * esbuild plugin that reads built UI assets from packages/ui/dist/
 * and creates a virtual module exporting them as an ApiUiAssets object.
 */
function uiAssetsPlugin() {
  const uiDistDir = path.join(__dirname, "../../ui/dist");

  return {
    name: "ui-assets",
    setup(build) {
      build.onResolve({ filter: /^virtual:ui-assets$/ }, () => ({
        path: "virtual:ui-assets",
        namespace: "ui-assets",
      }));

      build.onLoad(
        { filter: /^virtual:ui-assets$/, namespace: "ui-assets" },
        () => {
          if (!fs.existsSync(uiDistDir)) {
            console.warn(
              "Warning: packages/ui/dist/ not found. UI will not be embedded.",
            );
            return {
              contents: `export default { getFile() { return undefined; } };`,
              loader: "js",
            };
          }

          const files = collectFiles(uiDistDir, uiDistDir);
          const entries = [];
          let totalSize = 0;

          for (const { relativePath, absolutePath } of files) {
            const data = fs.readFileSync(absolutePath);
            const b64 = data.toString("base64");
            const ext = path.extname(relativePath);
            const mimeType = MIME_TYPES[ext] || "application/octet-stream";
            totalSize += data.length;
            entries.push(
              `  ${JSON.stringify(relativePath)}: { b64: ${JSON.stringify(b64)}, mimeType: ${JSON.stringify(mimeType)} }`,
            );
          }

          console.log(
            `  Embedding ${files.length} UI assets (${(totalSize / 1024).toFixed(1)} KB raw)`,
          );

          const contents = `
const assets = {
${entries.join(",\n")}
};

function base64ToUint8Array(b64) {
  return Buffer.from(b64, 'base64');
}

export default {
  getFile(path) {
    const entry = assets[path];
    if (!entry) return undefined;
    return { data: base64ToUint8Array(entry.b64), mimeType: entry.mimeType };
  }
};
`;
          return { contents, loader: "js" };
        },
      );
    },
  };
}

function collectFiles(dir, baseDir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else {
      results.push({
        relativePath: path.relative(baseDir, fullPath),
        absolutePath: fullPath,
      });
    }
  }
  return results;
}

async function build() {
  console.log("Building CLI bundle...");

  const outfile = path.join(__dirname, "../dist/cli.js");

  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, "../src/index.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile,
    banner: { js: "#!/usr/bin/env node" },
    external: [],
    minify: false,
    sourcemap: false,
    plugins: [uiAssetsPlugin()],
    define: {
      OK200_VERSION: JSON.stringify(packageJson.version),
    },
  });

  if (result.errors.length > 0) {
    console.error("Build failed with errors:");
    for (const err of result.errors) console.error(err);
    process.exit(1);
  }

  fs.chmodSync(outfile, 0o755);

  const sizeKB = (fs.statSync(outfile).size / 1024).toFixed(1);
  console.log(`\nBuild complete: dist/cli.js`);
  console.log(`  Size: ${sizeKB} KB`);
  console.log(`  Version: ${packageJson.version}`);
}

build();
