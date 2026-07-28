import {
  clickStart,
  clickStop,
  getStatus,
  isServerUrlVisible,
  setDirectory,
  setOptions,
  setPort,
  waitForServerUrl,
} from "../helpers/app";
import {
  cleanupFixtures,
  createFixtures,
  type Fixtures,
} from "../helpers/fixtures";

let fixtures: Fixtures;

before(async () => {
  fixtures = await createFixtures();
});

after(async () => {
  await cleanupFixtures(fixtures);
});

describe("200 OK Desktop E2E", () => {
  afterEach(async () => {
    try {
      const stopBtn = await $('[data-testid="stop-btn"]');
      if (await stopBtn.isExisting()) {
        await stopBtn.click();
        const startBtn = await $('[data-testid="start-btn"]');
        await startBtn.waitForExist({ timeout: 5000 });
      }
    } catch {
      // Session might be gone; ignore
    }
  });

  it("prevents start when no directory is set", async () => {
    await setDirectory("");
    const start = await $('[data-testid="start-btn"]');
    await browser.waitUntil(() =>
      start.isEnabled().then((enabled) => !enabled),
    );
    const assessment = await $('[data-testid="root-assessment"]');
    expect(await assessment.getText()).toContain("Choose a folder");
    expect(await getStatus()).toBe("Stopped");
  });

  it("starts server and displays URL", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("serves file with correct content-type", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/hello.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body).toBe("Hello, world!");
  });

  it("serves index.html for directory", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("<h1>Home</h1>");
  });

  it("returns 404 for missing file", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("blocks path traversal", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/../../etc/passwd`);
    const body = await res.text();
    expect(body).not.toContain("root:");
    expect(res.status).not.toBe(200);
  });

  it("shows directory listing when no index.html", async () => {
    await setDirectory(fixtures.noIndexDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("file-a.txt");
    expect(body).toContain("file-b.txt");
  });

  it("includes CORS headers", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await setOptions({ cors: true });
    await clickStart();
    const url = await waitForServerUrl();

    const res = await fetch(`${url}/`);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("stops server and makes it unavailable", async () => {
    await setDirectory(fixtures.rootDir);
    await setPort(0);
    await clickStart();
    const url = await waitForServerUrl();

    // Verify server is running
    const res = await fetch(`${url}/`);
    expect(res.status).toBe(200);

    // Stop the server
    await clickStop();
    const startBtn = await $('[data-testid="start-btn"]');
    await startBtn.waitForExist({ timeout: 5000 });
    expect(await isServerUrlVisible()).toBe(false);

    // Server should be unreachable
    try {
      await fetch(`${url}/`, { signal: AbortSignal.timeout(2000) });
      // If fetch doesn't throw, the server is still running (unexpected)
      throw new Error("Expected fetch to fail after server stop");
    } catch (e: unknown) {
      // Connection refused or timeout is expected
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).not.toBe("Expected fetch to fail after server stop");
    }
  });
});
