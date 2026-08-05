import { type ChildProcess, execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Options } from "@wdio/types";

const BINARY_PATH = process.env.OK200_E2E_BINARY
  ? path.resolve(process.env.OK200_E2E_BINARY)
  : path.resolve(__dirname, "../../target/debug/ok200-desktop");

const CARGO_BIN = path.join(os.homedir(), ".cargo", "bin");
const TAURI_DRIVER = process.env.TAURI_DRIVER || "tauri-driver";
const ARTIFACT_DIR = path.resolve(
  process.env.OK200_E2E_ARTIFACTS || path.join(__dirname, "artifacts"),
);

let tauriDriver: ChildProcess | null = null;
let driverLog: fs.WriteStream | null = null;

async function isPortReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForPort(port: number, timeout = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isPortReady(port)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Port ${port} not ready within ${timeout}ms`);
}

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    tsNodeOpts: {
      project: "./tsconfig.json",
    },
  },
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      "tauri:options": {
        application: BINARY_PATH,
      },
    } as unknown as WebdriverIO.Capabilities,
  ],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  async onPrepare() {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    // Build if needed
    if (!process.env.SKIP_BUILD) {
      console.log("Building Tauri app (debug, no-bundle)...");
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      env.PATH = `${CARGO_BIN}:${env.PATH}`;
      execSync("pnpm tauri build --debug --no-bundle", {
        cwd: path.resolve(__dirname, ".."),
        stdio: "inherit",
        env,
      });
    }

    if (await isPortReady(4444)) {
      throw new Error(
        "Port 4444 already has a WebDriver server; stop it before running the owned E2E session",
      );
    }

    console.log("Starting tauri-driver...");
    driverLog = fs.createWriteStream(
      path.join(ARTIFACT_DIR, "tauri-driver.log"),
    );
    tauriDriver = spawn(TAURI_DRIVER, [], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":99" },
    });
    tauriDriver.stdout?.on("data", (data: Buffer) => {
      process.stdout.write(`[tauri-driver] ${data}`);
      driverLog?.write(data);
    });
    tauriDriver.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[tauri-driver] ${data}`);
      driverLog?.write(data);
    });
    tauriDriver.on("error", (err) => {
      console.error("tauri-driver spawn error:", err);
    });
    tauriDriver.on("exit", (code, signal) => {
      console.log(`tauri-driver exited: code=${code} signal=${signal}`);
      tauriDriver = null;
    });

    await waitForPort(4444);
    console.log("tauri-driver ready on port 4444");
  },

  async afterTest(test, _context, result) {
    if (result.passed) return;
    const safeName = test.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const screenshot = path.join(
      ARTIFACT_DIR,
      `${safeName || "failed-test"}.png`,
    );
    try {
      await browser.saveScreenshot(screenshot);
      console.log(`Saved failure screenshot to ${screenshot}`);
    } catch (error) {
      console.error("Could not capture failure screenshot:", error);
    }
  },

  onComplete() {
    if (tauriDriver) {
      console.log("Killing tauri-driver...");
      tauriDriver.kill();
      tauriDriver = null;
    }
    driverLog?.end();
    driverLog = null;
  },
};
