import { config } from "./config.js";
import { compareVersions, isValidVersion } from "./version.js";

export interface LatestJson {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, { signature: string; url: string }>;
}

export interface PlatformUpdate {
  version: string;
  notes: string;
  pub_date: string;
  url: string;
  signature: string;
}

export interface VersionNotes {
  version: string;
  notes: string;
}

export interface FetchResult {
  latest: LatestJson;
  freshNotes: VersionNotes[];
}

interface GitHubRelease {
  tag_name: string;
  body?: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

/** Strip the "## Download" section that CI appends to release bodies. */
function stripDownloadSection(body: string): string {
  const idx = body.indexOf("## Download");
  if (idx === -1) return body.trim();
  return body.slice(0, idx).trim();
}

export async function fetchReleases(): Promise<FetchResult | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ok200-update-server",
  };
  if (config.githubToken) {
    headers.Authorization = `Bearer ${config.githubToken}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${config.githubRepo}/releases?per_page=100`,
    { headers },
  );
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }

  const releases = (await res.json()) as GitHubRelease[];
  const tauriReleases = releases.filter((r) =>
    r.tag_name.startsWith(config.tagPrefix),
  );

  const latestRelease = tauriReleases[0];
  if (!latestRelease) return null;

  const asset = latestRelease.assets.find((a) => a.name === "latest.json");
  if (!asset) return null;

  const jsonRes = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "ok200-update-server" },
    redirect: "follow",
  });
  if (!jsonRes.ok) {
    throw new Error(`Failed to fetch latest.json: ${jsonRes.status}`);
  }

  const latest = (await jsonRes.json()) as LatestJson;

  const freshNotes: VersionNotes[] = tauriReleases
    .map((r) => ({
      version: r.tag_name.slice(config.tagPrefix.length),
      notes: r.body ? stripDownloadSection(r.body) : "",
    }))
    .filter((n) => n.notes.length > 0);

  return { latest, freshNotes };
}

/** Aggregate release notes for all versions newer than currentVersion. */
export function aggregateNotes(
  allNotes: VersionNotes[],
  currentVersion: string,
): string {
  const relevant = allNotes.filter(
    (n) =>
      isValidVersion(n.version) &&
      compareVersions(n.version, currentVersion) > 0,
  );
  if (relevant.length === 0) return "";
  if (relevant.length === 1) return relevant[0].notes;
  return relevant.map((n) => `## ${n.version}\n${n.notes}`).join("\n\n");
}

export function findPlatformUpdate(
  latest: LatestJson,
  target: string,
  arch: string,
  notes: string,
): PlatformUpdate | null {
  const key = `${target}-${arch}`;
  const platform = latest.platforms[key];
  if (!platform) return null;

  return {
    version: latest.version,
    notes,
    pub_date: latest.pub_date,
    url: platform.url,
    signature: platform.signature,
  };
}
