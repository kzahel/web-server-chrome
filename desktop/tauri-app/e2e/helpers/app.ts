interface NativeServerConfig {
  root: string;
  port: number;
  host: string;
  cors: boolean;
  spa: boolean;
  directoryListing: boolean;
}

interface NativeServerSnapshot {
  config: NativeServerConfig;
}

async function updateConfig(
  partial: Partial<NativeServerConfig>,
): Promise<void> {
  await browser.execute(async (change: Partial<NativeServerConfig>) => {
    const tauri = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke<T>(command: string, args?: object): Promise<T>;
        };
      }
    ).__TAURI_INTERNALS__;
    const current = await tauri.invoke<NativeServerSnapshot>("server_get");
    await tauri.invoke("server_update_config", {
      config: { ...current.config, ...change },
    });
  }, partial);
}

export async function setDirectory(dir: string): Promise<void> {
  await updateConfig({ root: dir });
}

export async function setPort(port: number): Promise<void> {
  await updateConfig({ port });
}

export async function setOptions(
  options: Partial<NativeServerConfig>,
): Promise<void> {
  await updateConfig(options);
}

export async function clickStart(): Promise<void> {
  const btn = await $('[data-testid="start-btn"]');
  await btn.click();
  const confirm = await $('[data-testid="confirm-start-btn"]');
  if (await confirm.isExisting()) {
    await confirm.click();
  }
}

export async function clickStop(): Promise<void> {
  const btn = await $('[data-testid="stop-btn"]');
  await btn.click();
}

export async function waitForServerUrl(timeout = 15000): Promise<string> {
  const link = await $('[data-testid="server-url"]');
  await link.waitForDisplayed({ timeout });
  return link.getText();
}

export async function getError(): Promise<string | null> {
  const el = await $('[data-testid="error-msg"]');
  if (await el.isExisting()) {
    return el.getText();
  }
  return null;
}

export async function isServerUrlVisible(): Promise<boolean> {
  const link = await $('[data-testid="server-url"]');
  return link.isExisting();
}

export async function getStatus(): Promise<string> {
  return $('[data-testid="server-status"]').getText();
}
