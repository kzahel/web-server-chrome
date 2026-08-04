describe("200 OK Desktop settings E2E", () => {
  afterEach(async () => {
    const close = await $('button[aria-label="Close app settings"]');
    if (await close.isExisting()) await close.click();
  });

  it("shows every desktop setting and action in a body-level dialog", async () => {
    const open = await $('[data-testid="app-settings-button"]');
    await open.click();

    const dialog = await $('[data-testid="app-settings-dialog"]');
    await dialog.waitForDisplayed({ timeout: 5000 });

    const placement = await browser.execute(() => {
      const overlay = document.querySelector(
        '[data-testid="app-settings-overlay"]',
      );
      const dialogElement = document.querySelector(
        '[data-testid="app-settings-dialog"]',
      );
      const rect = dialogElement?.getBoundingClientRect();
      return {
        overlayParent: overlay?.parentElement?.tagName,
        withinViewport: Boolean(
          rect &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth,
        ),
      };
    });

    expect(placement.overlayParent).toBe("BODY");
    expect(placement.withinViewport).toBe(true);

    const text = await dialog.getText();
    expect(text).toContain("Start at Login");
    expect(text).toContain("Run in Background");
    expect(text).toMatch(/Show Icon in (System Tray|Menu Bar)/);
    expect(text).toContain("Check for Updates");
    expect(text).toContain("Quit 200 OK");
  });
});
