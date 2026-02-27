/**
 * Native entry point for QuickJS (Android).
 *
 * This file is bundled into engine.native.js and loaded by the Android app.
 * It creates a web server using native adapters and exposes control functions
 * to the Kotlin host via global functions.
 */

/// <reference path="./adapters/native/bindings.d.ts" />

import { defaultConfig } from "./config/server-config.js";
import { createNativeServer } from "./presets/native.js";

// Polyfill global APIs that QuickJS doesn't provide
// @ts-expect-error -- polyfill for QuickJS
globalThis.setTimeout = __ok200_set_timeout;
// @ts-expect-error -- polyfill for QuickJS
globalThis.clearTimeout = __ok200_clear_timeout;
// @ts-expect-error -- polyfill for QuickJS
globalThis.setInterval = __ok200_set_interval;
// @ts-expect-error -- polyfill for QuickJS
globalThis.clearInterval = __ok200_clear_interval;

// Polyfill console
globalThis.console = {
  log: (...args: unknown[]) =>
    __ok200_console_log("info", args.map(String).join(" ")),
  info: (...args: unknown[]) =>
    __ok200_console_log("info", args.map(String).join(" ")),
  warn: (...args: unknown[]) =>
    __ok200_console_log("warn", args.map(String).join(" ")),
  error: (...args: unknown[]) =>
    __ok200_console_log("error", args.map(String).join(" ")),
  debug: (...args: unknown[]) =>
    __ok200_console_log("debug", args.map(String).join(" ")),
} as Console;

// Polyfill TextEncoder/TextDecoder
// @ts-expect-error -- polyfill for QuickJS
globalThis.TextEncoder = class TextEncoder {
  encode(str: string): Uint8Array {
    return new Uint8Array(__ok200_text_encode(str));
  }
};

// @ts-expect-error -- polyfill for QuickJS
globalThis.TextDecoder = class TextDecoder {
  decode(data: Uint8Array | ArrayBuffer): string {
    const buffer =
      data instanceof ArrayBuffer ? data : (data.buffer as ArrayBuffer);
    return __ok200_text_decode(buffer);
  }
};

let server: ReturnType<typeof createNativeServer> | null = null;

function reportState(running: boolean, port = 0, host = "", error?: string) {
  const state = JSON.stringify({ running, port, host, error: error || null });
  __ok200_report_state(state);
}

// Expose engine control functions to Kotlin host

// @ts-expect-error -- exposed to Kotlin
globalThis.__ok200_engine_start = (configJson: string) => {
  try {
    const parsed = JSON.parse(configJson) as { port?: number; host?: string };
    const port = parsed.port ?? 8080;
    const host = parsed.host || "0.0.0.0";

    // Root path "/" means "serve from the root" — the native filesystem
    // adapter uses the root URI provided by the Kotlin host, so the path
    // here is relative within that root.
    const config = defaultConfig("/");
    config.port = port;
    config.host = host;
    config.directoryListing = true;
    config.cors = true;

    if (server) {
      // Stop existing server first
      server.stop().catch(() => {});
    }

    server = createNativeServer({
      config,
      logger: {
        debug: (msg: string) => __ok200_console_log("debug", msg),
        info: (msg: string) => __ok200_console_log("info", msg),
        warn: (msg: string) => __ok200_console_log("warn", msg),
        error: (msg: string) => __ok200_console_log("error", msg),
      },
    });

    server
      .start()
      .then((actualPort: number) => {
        console.info(`Server started on ${host}:${actualPort}`);
        reportState(true, actualPort, host);
      })
      .catch((err: Error) => {
        console.error(`Failed to start server: ${err.message}`);
        reportState(false, 0, "", err.message);
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Engine start error: ${message}`);
    reportState(false, 0, "", message);
  }
};

// @ts-expect-error -- exposed to Kotlin
globalThis.__ok200_engine_stop = () => {
  if (server) {
    server
      .stop()
      .then(() => {
        console.info("Server stopped");
        reportState(false);
      })
      .catch((err: Error) => {
        console.error(`Failed to stop server: ${err.message}`);
      });
    server = null;
  } else {
    reportState(false);
  }
};

console.info("200 OK engine loaded");
