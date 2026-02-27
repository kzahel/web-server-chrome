import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
// @ts-expect-error virtual module provided by esbuild plugin at build time
import uiAssets from "virtual:ui-assets";
import {
  type ApiUiAssets,
  basicLogger,
  createApiInterceptor,
  createNodeServer,
  defaultConfig,
  type Logger,
  NodeCertificateProvider,
  NodeFileSystem,
  prefixedLogger,
  type RequestInterceptor,
  ServerRegistry,
  type TlsOptions,
} from "@ok200/engine";

declare const OK200_VERSION: string;

function parseArgs(args: string[]): {
  root: string;
  port: number;
  host: string;
  cors: boolean;
  spa: boolean;
  upload: boolean;
  noListing: boolean;
  quiet: boolean;
  https: boolean;
  noUi: boolean;
  certPath?: string;
  keyPath?: string;
} {
  let root = ".";
  let port = 8080;
  let host = "127.0.0.1";
  let cors = false;
  let spa = false;
  let upload = false;
  let noListing = false;
  let quiet = false;
  let https = false;
  let noUi = false;
  let certPath: string | undefined;
  let keyPath: string | undefined;

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      port = parseInt(args[++i], 10);
      if (Number.isNaN(port)) {
        console.error("Invalid port number");
        process.exit(1);
      }
    } else if (arg === "--host" || arg === "-H") {
      host = args[++i];
    } else if (arg === "--cors") {
      cors = true;
    } else if (arg === "--spa") {
      spa = true;
    } else if (arg === "--upload") {
      upload = true;
    } else if (arg === "--no-listing") {
      noListing = true;
    } else if (arg === "--quiet" || arg === "-q") {
      quiet = true;
    } else if (arg === "--https" || arg === "-S") {
      https = true;
    } else if (arg === "--cert") {
      certPath = args[++i];
    } else if (arg === "--key") {
      keyPath = args[++i];
    } else if (arg === "--no-ui") {
      noUi = true;
    } else if (arg === "--version" || arg === "-v") {
      console.log(OK200_VERSION);
      process.exit(0);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      root = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
    i++;
  }

  return {
    root,
    port,
    host,
    cors,
    spa,
    upload,
    noListing,
    quiet,
    https,
    noUi,
    certPath,
    keyPath,
  };
}

function printHelp(): void {
  console.log(`
ok200 - serve static files

Usage: ok200 [directory] [options]

Options:
  --port, -p <port>    Port to listen on (default: 8080)
  --host, -H <host>    Host to bind (default: 127.0.0.1)
  --cors               Enable CORS headers
  --spa                SPA mode: serve index.html for missing paths
  --upload             Enable file uploads via PUT/POST
  --no-listing         Disable directory listing
  --quiet, -q          Suppress request logging
  --https, -S          Enable HTTPS with auto-generated self-signed cert
  --cert <path>        Path to PEM certificate file (use with --key)
  --key <path>         Path to PEM private key file (use with --cert)
  --no-ui              Disable management UI and API
  --version, -v        Show version
  --help, -h           Show this help
`);
}

const CACHE_DIR = path.join(os.homedir(), ".ok200");
const CERT_PATH = path.join(CACHE_DIR, "localhost.pem");
const KEY_PATH = path.join(CACHE_DIR, "localhost-key.pem");
const MAX_AGE_MS = 364 * 24 * 60 * 60 * 1000; // ~1 year

async function getOrGenerateCert(logger: Logger): Promise<TlsOptions> {
  // Try loading cached cert
  try {
    const [cert, key, stat] = await Promise.all([
      fs.readFile(CERT_PATH),
      fs.readFile(KEY_PATH),
      fs.stat(CERT_PATH),
    ]);

    if (Date.now() - stat.mtimeMs < MAX_AGE_MS) {
      logger.info("Using cached self-signed certificate from ~/.ok200/");
      return {
        cert: new Uint8Array(cert),
        key: new Uint8Array(key),
      };
    }
  } catch {
    // No cached cert, generate new one
  }

  logger.info("Generating self-signed certificate...");
  const provider = new NodeCertificateProvider();
  const tlsOptions = await provider.generateSelfSigned();

  await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
  await fs.writeFile(CERT_PATH, tlsOptions.cert, { mode: 0o600 });
  await fs.writeFile(KEY_PATH, tlsOptions.key, { mode: 0o600 });

  logger.info("Self-signed certificate saved to ~/.ok200/");
  return tlsOptions;
}

async function resolveTls(
  args: { https: boolean; certPath?: string; keyPath?: string },
  logger: Logger,
): Promise<TlsOptions | undefined> {
  if (!args.https && !args.certPath && !args.keyPath) {
    return undefined;
  }

  if (args.certPath && args.keyPath) {
    const [cert, key] = await Promise.all([
      fs.readFile(args.certPath),
      fs.readFile(args.keyPath),
    ]);
    return {
      cert: new Uint8Array(cert),
      key: new Uint8Array(key),
    };
  }

  if (args.certPath || args.keyPath) {
    console.error("Both --cert and --key must be provided together");
    process.exit(1);
  }

  return getOrGenerateCert(logger);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root);

  const logger = args.quiet
    ? {
        debug: () => {},
        info: () => {},
        warn: console.warn,
        error: console.error,
      }
    : prefixedLogger("ok200", basicLogger());

  const tls = await resolveTls(args, logger);

  const config = {
    ...defaultConfig(root),
    port: args.port,
    host: args.host,
    cors: args.cors,
    spa: args.spa,
    upload: args.upload,
    directoryListing: !args.noListing,
    quiet: args.quiet,
    tls,
  };

  // Set up management API interceptor unless --no-ui
  const authToken = args.noUi ? undefined : crypto.randomUUID();
  let requestInterceptor: RequestInterceptor | undefined;

  if (!args.noUi) {
    const registry = new ServerRegistry();
    registry.register("default", config);
    registry.setStatus("default", "running", config.port);

    const fileSystem = new NodeFileSystem();

    requestInterceptor = createApiInterceptor({
      registry,
      authToken,
      uiAssets: uiAssets as ApiUiAssets,
      fileSystem,
      onStartServer: async (id) => {
        // Single-server mode: server is always "running" since the
        // management API and file server share the same process
        const info = registry.getServer(id);
        if (!info) throw new Error(`Server not found: ${id}`);
        return info;
      },
      onStopServer: async (id) => {
        const info = registry.getServer(id);
        if (!info) throw new Error(`Server not found: ${id}`);
        return info;
      },
      onUpdateConfig: async (id, partial) => {
        registry.updateConfig(id, partial);
        const info = registry.getServer(id);
        if (!info) throw new Error(`Server not found: ${id}`);
        return info;
      },
    });
  }

  const server = createNodeServer({ config, logger, requestInterceptor });

  const port = await server.start();

  const protocol = config.tls ? "https" : "http";
  const url = `${protocol}://${config.host === "0.0.0.0" ? "localhost" : config.host}:${port}`;
  console.log(`\n  ok200 serving ${root}\n`);
  console.log(`  Local:   ${url}`);
  if (config.host === "0.0.0.0") {
    console.log(`  Network: ${protocol}://0.0.0.0:${port}`);
  }
  if (!args.noUi) {
    console.log(`  UI:      ${url}/_api/ui/`);
    if (config.host === "0.0.0.0" && authToken) {
      console.log(
        `  Remote:  ${protocol}://0.0.0.0:${port}/_api/ui/?token=${authToken}`,
      );
    }
  }
  console.log();

  const shutdown = async () => {
    console.log("\nShutting down...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
