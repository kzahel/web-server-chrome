const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export function isValidVersion(v: string): boolean {
  return SEMVER_RE.test(v);
}

export function compareVersions(a: string, b: string): number {
  if (!isValidVersion(a) || !isValidVersion(b)) {
    throw new Error(`Invalid version: "${!isValidVersion(a) ? a : b}"`);
  }
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}
