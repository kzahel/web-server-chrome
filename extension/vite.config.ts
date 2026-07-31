import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEV_HOST = "local.ok200.app";
const EXTENSION_ID = "lpkjdhnmgkhaabhimpdinmdgejoaejic";
const CHROME_ID_ALPHABET = "abcdefghijklmnop";
const isChromeWebStoreBuild = process.env.SKIP_INJECT_KEY === "1";

function extensionIdFromPublicKey(base64Key: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(Buffer.from(base64Key, "base64"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .map(
      (byte) => CHROME_ID_ALPHABET[byte >> 4] + CHROME_ID_ALPHABET[byte & 0x0f],
    )
    .join("");
}

const DEVELOPMENT_PUBLIC_KEY = fs
  .readFileSync(resolve(__dirname, "fullpubkey.txt"), "utf-8")
  .replace(/-----BEGIN PUBLIC KEY-----/, "")
  .replace(/-----END PUBLIC KEY-----/, "")
  .replace(/\s/g, "");
const developmentExtensionId = extensionIdFromPublicKey(DEVELOPMENT_PUBLIC_KEY);
if (developmentExtensionId !== EXTENSION_ID) {
  throw new Error(
    `fullpubkey.txt produces ${developmentExtensionId}; expected ${EXTENSION_ID}`,
  );
}

// Only check DNS when starting the dev server (not during build/watch)
const isDevServer =
  process.argv[1]?.includes("vite") && !process.argv.includes("build");
if (isDevServer) {
  dns.lookup(DEV_HOST, (err) => {
    if (err && err.code === "ENOTFOUND") {
      console.log(`
ERROR: Cannot resolve '${DEV_HOST}'

The dev server requires '${DEV_HOST}' to point to localhost.
Add this line to your /etc/hosts file:

  127.0.0.1 ${DEV_HOST}

On Mac/Linux:
  echo "127.0.0.1 ${DEV_HOST}" | sudo tee -a /etc/hosts
`);
      process.exit(1);
    }
  });
}

function sourcemapIgnoreLogger() {
  return {
    name: "sourcemap-ignore-logger",
    writeBundle(
      options: { dir?: string },
      bundle: Record<string, { type: string }>,
    ) {
      const outDir = options.dir || "dist";
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk" && fileName.endsWith(".js")) {
          const mapPath = resolve(outDir, `${fileName}.map`);
          try {
            const mapContent = fs.readFileSync(mapPath, "utf-8");
            const map = JSON.parse(mapContent);
            const sources: string[] = map.sources || [];
            const ignoreList: number[] = [];
            sources.forEach((source: string, index: number) => {
              if (source.includes("node_modules")) {
                ignoreList.push(index);
              }
            });
            map.x_google_ignoreList = ignoreList;
            fs.writeFileSync(mapPath, JSON.stringify(map));
          } catch {
            // Map file might not exist for some chunks
          }
        }
      }
    },
  };
}

function emitManifest() {
  return {
    name: "emit-manifest",
    generateBundle() {
      const manifestPath = resolve(__dirname, "public/manifest.json");
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const manifestJson = JSON.parse(manifestContent);

      if (isChromeWebStoreBuild) {
        delete manifestJson.key;
        manifestJson.externally_connectable.matches =
          manifestJson.externally_connectable.matches.filter(
            (match: string) => !match.startsWith("http://local.ok200.app"),
          );
      } else {
        manifestJson.key = DEVELOPMENT_PUBLIC_KEY;
        console.log(`Injected public key for ${developmentExtensionId}`);
      }

      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(manifestJson, null, 2),
      });
    },
  };
}

function printDevUrls() {
  return {
    name: "print-dev-urls",
    configureServer(server: {
      httpServer?: { once: (event: string, cb: () => void) => void };
    }) {
      server.httpServer?.once("listening", () => {
        console.log(`
Development URLs:

  HMR Dev Server (standalone):
    http://${DEV_HOST}:3001/src/ui/app.html
`);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    printDevUrls(),
    emitManifest(),
    sourcemapIgnoreLogger(),
  ].filter(Boolean),
  server: {
    host: DEV_HOST,
    port: 3001,
    sourcemapIgnoreList: (relativeSourcePath) => {
      return relativeSourcePath.includes("node_modules");
    },
  },
  resolve: {
    alias: {
      "@ok200/engine": resolve(__dirname, "../packages/engine/src/index.ts"),
    },
  },
  build: {
    sourcemap: !isChromeWebStoreBuild,
    minify: false,
    sourcemapIgnoreList: false,
    rollupOptions: {
      input: {
        app: resolve(__dirname, "src/ui/app.html"),
        sw: resolve(__dirname, "src/sw.ts"),
      },
      output: {
        entryFileNames: (chunkInfo: { name: string }) => {
          if (chunkInfo.name === "sw") {
            return "sw.js";
          }
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
