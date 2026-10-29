#!/usr/bin/env node
/** Built frontend qualification with deterministic native/controller fixtures. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locale = process.argv[process.argv.indexOf("--locale") + 1] || "de";
const registry = JSON.parse(
  fs.readFileSync(path.join(root, "localization/locales.json"), "utf8"),
);
assert(
  (registry.supportedLocales.web.includes(locale) ||
    (process.env.VITE_OK200_PSEUDO_LOCALES === "1" &&
      registry.testLocales.some((value) => value.tag === locale))) &&
    locale !== "en",
  "Choose a shipping translated locale or an explicitly enabled pseudo-locale",
);
const out = path.join(root, ".local/localization", locale, "browser");
fs.mkdirSync(out, { recursive: true });
execFileSync("pnpm", ["--filter", "@ok200/extension", "build"], {
  cwd: root,
  stdio: "pipe",
});
execFileSync("pnpm", ["--filter", "@ok200/desktop", "build"], {
  cwd: root,
  stdio: "pipe",
});
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const desktop = url.pathname.startsWith("/desktop/");
  const directory = path.join(
    root,
    desktop ? "desktop/tauri-app/dist" : "extension/dist",
  );
  const pathname = desktop ? url.pathname.slice(8) : url.pathname;
  let file = path.resolve(
    directory,
    `.${pathname === "/" ? "/index.html" : pathname}`,
  );
  if (url.pathname.startsWith("/assets/") && !fs.existsSync(file))
    file = path.resolve(root, "desktop/tauri-app/dist", `.${url.pathname}`);
  if (
    (!file.startsWith(`${directory}${path.sep}`) &&
      !file.startsWith(path.join(root, "desktop/tauri-app/dist/assets/"))) ||
    !fs.existsSync(file)
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".html")
      ? "text/html"
      : file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : "application/octet-stream",
  );
  res.end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const report = {
  locale,
  checks: [],
  limitations: [
    "Production frontend assets with deterministic native/controller fixtures; real extension packaging and native runtime gates are separate.",
  ],
  assets: {},
};
for (const [surface, file] of Object.entries({
  desktop: "desktop/tauri-app/dist/index.html",
  extension: "extension/dist/src/ui/app.html",
}))
  report.assets[surface] = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, file)))
    .digest("hex");

async function layout(page, name) {
  await page.locator("body").evaluate((el) => {
    el.querySelectorAll("details").forEach((detail) => {
      detail.open = true;
    });
  });
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
  });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
      .slice(-15)
      .map((el) => ({
        tag: el.tagName,
        cls: el.className,
        text: el.textContent?.slice(0, 100),
        width: el.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right,
      })),
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    `${name}: horizontal document overflow ${JSON.stringify(overflow)}`,
  );
  const axe = await new AxeBuilder({ page }).analyze();
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
  });
  fs.writeFileSync(
    path.join(out, `${name}-axe.json`),
    JSON.stringify(axe.violations, null, 2),
  );
  const blocking = axe.violations.filter((value) =>
    ["serious", "critical"].includes(value.impact),
  );
  assert.equal(
    blocking.length,
    0,
    `${name}: ${blocking.map((value) => value.id).join(", ")}`,
  );
  await page.screenshot({
    path: path.join(out, `${name}.png`),
    fullPage: true,
  });
  report.checks.push(
    `${name}: text, horizontal layout and serious/critical accessibility`,
  );
}
try {
  for (const kind of ["popup", "crostini", "desktop"]) {
    const context = await browser.newContext({
      locale: "de-AT",
      viewport: { width: kind === "popup" ? 340 : 390, height: 800 },
    });
    await context.addInitScript(
      ({ kind, locale }) => {
        // All state is local to this owned browser context. No installed app is contacted.
        localStorage.setItem(
          "ok200.language",
          localStorage.getItem("ok200.language") || locale,
        );
        const settings = {
          automaticUpdates: false,
          cors: false,
          directoryListing: true,
          keepServingOnClose: true,
          lan: false,
          port: 8080,
          root: "/home/test/200 OK",
          spa: false,
        };
        const status = {
          instanceId: "locale-fixture",
          product: "ok200-crostini-controller",
          protocolVersion: 2,
          server: { state: "stopped", url: null },
          settings,
          update: { state: "current" },
          version: "0.1.5",
        };
        const storage = {};
        window.__localeCalls = [];
        window.chrome = {
          runtime: {
            getPlatformInfo: (callback) => callback({ os: "linux" }),
            sendMessage: (_message, callback) =>
              callback?.({ connected: false }),
          },
          permissions: {
            contains: (_permissions, callback) => {
              callback?.(true);
              return Promise.resolve(true);
            },
          },
          storage: {
            local: {
              get: async (key) => ({ [key]: storage[key] }),
              set: async (values) => Object.assign(storage, values),
            },
          },
        };
        const native = {
          id: "default",
          config: {
            root: "/home/test/200 OK",
            port: 8080,
            host: "127.0.0.1",
            cors: false,
            spa: false,
            directoryListing: true,
          },
          status: "stopped",
          startAssessment: {
            allowed: true,
            requiresConfirmation: false,
            risk: "safe",
          },
        };
        const callbacks = new Map();
        let next = 1;
        const events = new Map();
        const emit = (event, payload) => {
          for (const id of events.get(event) || [])
            callbacks.get(id)?.({ event, payload, id });
        };
        const language = () => ({
          preference: localStorage.getItem("fixture.language") || locale,
          systemLanguages: ["de-AT"],
        });
        window.__TAURI_INTERNALS__ = {
          transformCallback: (callback) => {
            const id = next++;
            callbacks.set(id, callback);
            return id;
          },
          unregisterCallback: (id) => callbacks.delete(id),
          invoke: async (command, args = {}) => {
            window.__localeCalls.push(command);
            if (command === "plugin:event|listen") {
              const ids = events.get(args.event) || [];
              ids.push(args.handler);
              events.set(args.event, ids);
              return next++;
            }
            if (command === "plugin:event|unlisten") return;
            if (command === "desktop_language_get") return language();
            if (command === "desktop_language_set") {
              localStorage.setItem("fixture.language", args.preference);
              emit("desktop-language-changed", language());
              return;
            }
            if (command === "desktop_settings_get")
              return {
                autostart: false,
                runInBackground: true,
                showTrayIcon: true,
                trayIconLabel: "Show Icon in Menu Bar",
              };
            if (command === "server_get") return structuredClone(native);
            if (command === "server_start") {
              native.status = "running";
              native.actualPort = 8080;
              emit("server-state", structuredClone(native));
              return structuredClone(native);
            }
            if (command === "server_stop") {
              native.status = "stopped";
              emit("server-state", structuredClone(native));
              return structuredClone(native);
            }
            if (command === "server_update_config") {
              native.config = args.config;
              return structuredClone(native);
            }
            if (command.includes("version")) return "0.1.11";
            if (command.includes("bundle_type")) return "App";
            return null;
          },
        };
        if (kind === "crostini")
          window.fetch = async (url) => {
            const pathname = new URL(url).pathname;
            window.__localeCalls.push(pathname);
            let body;
            if (pathname === "/health") body = { ...status, claimed: false };
            else if (pathname === "/api/claim")
              body = { controllerToken: "fixture-token" };
            else if (
              pathname === "/api/session/open" ||
              pathname === "/api/session/heartbeat"
            )
              body = {
                expiresInSeconds: 75,
                sessionId: "fixture-session",
                status,
              };
            else if (pathname === "/api/server/start") {
              status.server = {
                state: "running",
                url: "http://localhost:8080/",
              };
              body = status;
            } else if (pathname === "/api/server/stop") {
              status.server = { state: "stopped", url: null };
              body = status;
            } else if (pathname === "/api/folders/roots")
              body = { roots: [{ available: true, id: "home", name: "Home" }] };
            else if (pathname === "/api/folders/list")
              body = {
                canSelect: true,
                displayPath: "/home/test",
                entries: [],
                path: [],
                rootId: "home",
                rootName: "Home",
              };
            else body = status;
            return new Response(JSON.stringify(body), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          };
      },
      { kind, locale },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const url =
      kind === "desktop"
        ? `${origin}/desktop/index.html`
        : kind === "popup"
          ? `${origin}/src/ui/app.html`
          : `${origin}/src/ui/crostini.html?claimed=false&instanceId=locale-fixture&port=20080&claimCode=${"a".repeat(64)}`;
    await page.goto(url);
    if (kind === "desktop") {
      await page.getByTestId("start-btn").waitFor();
      await page.getByTestId("start-btn").click();
      await page.getByTestId("stop-btn").waitFor();
      await page.getByTestId("app-settings-button").click();
    }
    await page.locator("select").waitFor();
    await page.waitForFunction(
      (target) => document.documentElement.lang === target,
      locale,
    );
    if (kind === "crostini") {
      try {
        await page.locator(".server-switch").click();
      } catch (error) {
        console.error(
          await page.locator("body").innerText(),
          await page.evaluate(() => window.__localeCalls),
        );
        throw error;
      }
    }
    const commands = await page.evaluate(() => window.__localeCalls.length);
    await page.locator("select").selectOption("en");
    await page.waitForFunction(() => document.documentElement.lang === "en");
    await page.locator("select").selectOption(locale);
    await page.waitForFunction(
      (target) => document.documentElement.lang === target,
      locale,
    );
    const extra = await page.evaluate(
      (start) => window.__localeCalls.slice(start),
      commands,
    );
    assert(
      extra.every((command) => command === "desktop_language_set"),
      `${kind}: locale change sent server/controller commands: ${extra}`,
    );
    if (kind === "desktop") {
      assert.equal(
        await page.getByTestId("stop-btn").count(),
        1,
        "language change lost running state",
      );
      assert.equal(
        await page.getByTestId("selected-folder").textContent(),
        "/home/test/200 OK",
      );
    }
    await layout(page, kind);
    if (kind !== "desktop") {
      await page.reload();
      await page.waitForFunction(
        (target) => document.documentElement.lang === target,
        locale,
      );
      await page.locator("select").waitFor();
      assert.equal(await page.locator("select").inputValue(), locale);
    }
    assert.deepEqual(errors, [], `${kind}: browser errors`);
    report.checks.push(
      `${kind}: switch en/${locale}, persisted choice and no server mutation`,
    );
    await context.close();
  }
  fs.writeFileSync(
    path.join(out, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Qualified ${locale}: ${report.checks.length} production frontend checks; ${out}`,
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
