#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("DevTools connection closed"));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const [extensionArgument, artifactArgument] = process.argv.slice(2);
if (!extensionArgument || !artifactArgument) {
  throw new Error(
    "usage: browser-smoke.mjs <unpacked-extension-directory> <artifact-directory>",
  );
}

const extensionDirectory = path.resolve(extensionArgument);
const artifactDirectory = path.resolve(artifactArgument);
const manifestPath = path.join(extensionDirectory, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const chromeBinary = resolveChromeBinary();
const scratchDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "ok200-extension-browser-"),
);
const profileDirectory = path.join(scratchDirectory, "profile");

fs.mkdirSync(artifactDirectory, { recursive: true });
const browserLogPath = path.join(artifactDirectory, "chrome.log");
const browserLog = fs.createWriteStream(browserLogPath, { flags: "w" });
const browser = spawn(
  chromeBinary,
  [
    "--headless=new",
    "--disable-dev-shm-usage",
    "--disable-features=DisableLoadExtensionCommandLineSwitch,DisableDisableExtensionsExceptCommandLineSwitch",
    `--disable-extensions-except=${extensionDirectory}`,
    `--load-extension=${extensionDirectory}`,
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-allow-origins=*",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);

browser.stdout.pipe(browserLog);
browser.stderr.pipe(browserLog);

let devtools;
try {
  devtools = await waitForDevTools(profileDirectory, browser);
  const backgroundTarget = await waitForTarget(
    devtools.port,
    (target) =>
      target.type === "service_worker" &&
      target.url.startsWith("chrome-extension://") &&
      target.url.endsWith("/sw.js"),
    browser,
  );
  const extensionId = new URL(backgroundTarget.url).hostname;
  const popupUrl = `chrome-extension://${extensionId}/${manifest.action.default_popup}`;
  const popupTarget = await createTarget(devtools.port, popupUrl);
  const client = await CdpClient.connect(popupTarget.webSocketDebuggerUrl);

  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 340,
      height: 500,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.reload", { ignoreCache: true });

    const result = await waitForPopup(client);
    verifyPopup(result, manifest, extensionId);

    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    fs.writeFileSync(
      path.join(artifactDirectory, "popup.png"),
      Buffer.from(screenshot.data, "base64"),
    );
    fs.writeFileSync(
      path.join(artifactDirectory, "result.json"),
      `${JSON.stringify(result, null, 2)}\n`,
    );

    console.log(
      `Browser smoke passed in ${path.basename(chromeBinary)}: extension ${extensionId}, popup ${result.viewport.width}x${result.viewport.height}`,
    );
  } finally {
    client.close();
  }
} catch (error) {
  console.error(
    `Browser smoke failed. Diagnostics: ${browserLogPath}\n${error instanceof Error ? error.stack : error}`,
  );
  process.exitCode = 1;
} finally {
  browser.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => browser.once("exit", resolve)),
    delay(3_000),
  ]);
  if (browser.exitCode === null) browser.kill("SIGKILL");
  browserLog.end();
  fs.rmSync(scratchDirectory, { recursive: true, force: true });
}

function resolveChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(
      "Chrome/Chromium was not found; set CHROME_BIN to the browser executable",
    );
  }
  return match;
}

async function waitForDevTools(profile, child) {
  const activePortPath = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    assertBrowserAlive(child);
    if (fs.existsSync(activePortPath)) {
      const [portLine] = fs.readFileSync(activePortPath, "utf8").split("\n");
      const port = Number(portLine);
      if (Number.isInteger(port) && port > 0) return { port };
    }
    await delay(100);
  }
  throw new Error("Chrome did not publish a DevTools port within 20 seconds");
}

async function waitForTarget(port, predicate, child) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    assertBrowserAlive(child);
    const targets = await jsonRequest(`http://127.0.0.1:${port}/json/list`);
    const target = targets.find(predicate);
    if (target) return target;
    await delay(100);
  }
  throw new Error("Chrome did not activate the packaged extension");
}

async function createTarget(port, url) {
  return jsonRequest(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,
    { method: "PUT" },
  );
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`DevTools returned HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function waitForPopup(client) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const evaluation = await client.send("Runtime.evaluate", {
      expression: `(() => {
        const primary = [...document.querySelectorAll("a, button")]
          .find((element) => element.textContent?.trim() === "Get the Desktop App");
        const rect = primary?.getBoundingClientRect();
        return {
          title: document.title,
          readyState: document.readyState,
          text: document.body?.innerText || "",
          manifest: chrome.runtime.getManifest(),
          location: location.href,
          viewport: { width: innerWidth, height: innerHeight },
          primary: primary && rect ? {
            tag: primary.tagName,
            href: primary.getAttribute("href"),
            text: primary.textContent?.trim(),
            rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left,
              width: rect.width, height: rect.height },
            display: getComputedStyle(primary).display,
            visibility: getComputedStyle(primary).visibility,
          } : null,
        };
      })()`,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(
        `Popup evaluation failed: ${evaluation.exceptionDetails.text}`,
      );
    }
    const value = evaluation.result?.value;
    if (value?.text?.includes("Get the Desktop App")) return value;
    await delay(100);
  }
  throw new Error("Popup did not reach the missing-native-host recovery state");
}

function verifyPopup(result, expectedManifest, extensionId) {
  assert(result.title === "200 OK Web Server", "unexpected popup title");
  assert(
    result.location ===
      `chrome-extension://${extensionId}/${expectedManifest.action.default_popup}`,
    "popup did not boot from the packaged extension",
  );
  assert(result.manifest.name === "200 OK Web Server", "wrong manifest name");
  assert(
    result.manifest.version === expectedManifest.version,
    "runtime manifest version differs from the inspected package",
  );
  assert(
    JSON.stringify(result.manifest.permissions) ===
      JSON.stringify(["nativeMessaging"]),
    "runtime permissions differ from the inspected package",
  );
  assert(
    !Object.hasOwn(expectedManifest, "content_security_policy"),
    "package must use Chrome's strict default extension-page CSP",
  );
  assert(
    result.text.includes("Install the desktop app"),
    "missing native host does not produce the supported recovery",
  );
  assert(
    !result.text.includes("local.ok200.app") &&
      !result.text.includes("localhost:"),
    "popup exposes a private development origin",
  );
  assert(result.viewport.width === 340, "popup viewport width was not applied");
  assert(
    result.viewport.height === 500,
    "popup viewport height was not applied",
  );
  assert(result.primary, "missing primary recovery action");
  assert(result.primary.tag === "A", "primary recovery action must be a link");
  assert(
    result.primary.href === "https://ok200.app/download",
    "primary recovery action has an unexpected destination",
  );
  assert(
    result.primary.display !== "none" &&
      result.primary.visibility === "visible",
    "primary recovery action is hidden",
  );
  const rect = result.primary.rect;
  assert(rect.width > 0 && rect.height > 0, "primary action has no hit target");
  assert(
    rect.left >= 0 &&
      rect.top >= 0 &&
      rect.right <= result.viewport.width &&
      rect.bottom <= result.viewport.height,
    "primary action is outside the supported popup viewport",
  );
}

function assertBrowserAlive(child) {
  if (child.exitCode !== null) {
    throw new Error(`Chrome exited early with status ${child.exitCode}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
