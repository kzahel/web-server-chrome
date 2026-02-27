import dns from "node:dns";
import fs from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEV_HOST = "local.ok200.app";

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
  plugins: [react(), printDevUrls(), sourcemapIgnoreLogger()],
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
    sourcemap: true,
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
