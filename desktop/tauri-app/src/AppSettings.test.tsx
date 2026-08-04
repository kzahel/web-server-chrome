// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppSettings } from "./AppSettings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

describe("AppSettings", () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    invoke.mockResolvedValue({
      autostart: false,
      runInBackground: true,
      showTrayIcon: true,
      trayIconLabel: "Show Icon in System Tray",
    });
    listen.mockResolvedValue(() => undefined);
    container = document.createElement("header");
    container.style.backdropFilter = "blur(8px)";
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<AppSettings />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("portals every required setting and action outside the filtered header", async () => {
    const openButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="app-settings-button"]',
    );
    expect(openButton).not.toBeNull();

    await act(async () => openButton?.click());

    const overlay = document.querySelector<HTMLElement>(
      '[data-testid="app-settings-overlay"]',
    );
    const dialog = document.querySelector<HTMLElement>(
      '[data-testid="app-settings-dialog"]',
    );
    expect(overlay?.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
    expect(dialog?.textContent).toContain("Start at Login");
    expect(dialog?.textContent).toContain("Run in Background");
    expect(dialog?.textContent).toContain("Show Icon in System Tray");
    expect(dialog?.textContent).toContain("Check for Updates");
    expect(dialog?.textContent).toContain("Quit 200 OK");
  });
});
