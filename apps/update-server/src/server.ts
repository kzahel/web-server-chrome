import * as http from "node:http";
import { AnalyticsLogger } from "./analytics.js";
import { Cache } from "./cache.js";
import { config } from "./config.js";
import type { LatestJson } from "./github.js";
import { aggregateNotes, fetchReleases, findPlatformUpdate } from "./github.js";
import { NotesStore } from "./notes-store.js";
import { compareVersions, isValidVersion } from "./version.js";

const notesStore = new NotesStore(config.notesCacheFile);

const cache = new Cache<LatestJson>(
  async () => {
    const result = await fetchReleases();
    if (!result) return null;
    notesStore.merge(result.freshNotes);
    return result.latest;
  },
  config.cacheTtlMs,
  config.latestCacheFile,
);

const analytics = new AnalyticsLogger(config.logDir);

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

async function handleUpdateCheck(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  target: string,
  arch: string,
  currentVersion: string,
): Promise<void> {
  const latest = await cache.get();
  if (!latest) {
    sendJson(res, 500, { error: "Unable to fetch release info" });
    return;
  }

  const notes = aggregateNotes(notesStore.getAll(), currentVersion);
  const platform = findPlatformUpdate(latest, target, arch, notes);
  const updateAvailable =
    !!platform && compareVersions(latest.version, currentVersion) > 0;

  analytics.log({
    ts: new Date().toISOString(),
    ip: getClientIp(req),
    target,
    arch,
    currentVersion,
    latestVersion: latest.version,
    updateAvailable,
    userAgent: req.headers["user-agent"] || "",
    cfuId: (req.headers["x-cfu-id"] as string) || "",
    checkReason: (req.headers["x-check-reason"] as string) || "",
  });

  if (!updateAvailable) {
    res.writeHead(204);
    res.end();
    return;
  }

  sendJson(res, 200, platform);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }

  const { pathname } = new URL(req.url || "/", "http://localhost");
  const segments = pathname.split("/").filter(Boolean);

  // GET /health
  if (segments[0] === "health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  // GET /tauri/:target/:arch/:currentVersion
  if (segments[0] === "tauri" && segments.length === 4) {
    const [, target, arch, currentVersion] = segments;
    if (!isValidVersion(currentVersion)) {
      sendJson(res, 400, { error: "Invalid version format" });
      return;
    }
    try {
      await handleUpdateCheck(req, res, target, arch, currentVersion);
    } catch (err) {
      console.error("Update check error:", err);
      sendJson(res, 500, { error: "Internal server error" });
    }
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(config.port, () => {
  console.log(`Update server listening on port ${config.port}`);
});

export { server, cache, notesStore, analytics };
