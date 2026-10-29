// Submit the already accepted ZIP. Google owns review and final publication.
// Adapted from Yep Anywhere (same author, MIT); keep state-transition tests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identity = {
  id: "lpkjdhnmgkhaabhimpdinmdgejoaejic",
  key: (await readFile(resolve(root, "fullpubkey.txt"), "utf8")).replace(
    /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
    "",
  ),
};
const api = "https://chromewebstore.googleapis.com";

export function versionParts(version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  const parts = version.split(".").map(Number);
  assert(
    parts.every((part) => part <= 65535) && parts.some(Boolean),
    "Invalid store version",
  );
  return parts;
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export async function loadCandidate(directory, expectedRevision) {
  const build = JSON.parse(await readFile(resolve(directory, "build.json")));
  versionParts(build.version);
  assert.equal(build.sourceDirty, false, "Refusing a dirty source build");
  assert.match(expectedRevision, /^[a-f0-9]{40}$/);
  assert.equal(
    build.revision,
    expectedRevision,
    "Candidate source differs from this release",
  );
  assert.equal(build.extensionId, identity.id, "Wrong extension identity");
  assert.equal(build.filename, "ok200-extension.zip");
  const zip = await readFile(resolve(directory, build.filename));
  assert.equal(
    createHash("sha256").update(zip).digest("hex"),
    build.sha256,
    "Candidate checksum differs",
  );
  return { build, zip };
}

export async function publishStore({
  token,
  publisherId,
  candidate,
  checkOnly = false,
  stageOnly = false,
  request = fetch,
  // The release job has a ten-minute bound. Never poll for Google's review.
  pause = () => new Promise((done) => setTimeout(done, 2000)),
}) {
  assert(token, "CWS_ACCESS_TOKEN is required");
  assert.match(publisherId, /^[a-zA-Z0-9_-]+$/, "Invalid publisher ID");
  const name = `publishers/${publisherId}/items/${identity.id}`;
  async function call(method, action, body, upload = false) {
    const response = await request(
      `${api}${upload ? "/upload" : ""}/v2/${name}:${action}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": upload ? "application/zip" : "application/json",
        },
        body:
          body === undefined ? undefined : upload ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(upload ? 180000 : 30000),
        redirect: "error",
      },
    );
    // Never emit credentials, headers or arbitrary API response bodies.
    if (!response.ok)
      throw new Error(
        `Web Store ${action}: HTTP ${response.status}; check the developer dashboard`,
      );
    // cancelSubmission has an empty success response (including HTTP 204).
    if (action === "cancelSubmission") return;
    const value = await response.json();
    assert.equal(value.name, name, "Unexpected store resource");
    assert.equal(value.itemId, identity.id, "Unexpected store item");
    return value;
  }
  const summarize = (revision) =>
    revision && {
      state: revision.state,
      versions: (revision.distributionChannels ?? []).map(
        (channel) => channel.crxVersion,
      ),
    };
  const readStatus = async () => {
    const current = await call("GET", "fetchStatus");
    assert.equal(
      // The API returns PEM; Chrome manifests store the same SPKI bytes as base64.
      current.publicKey?.replace(
        /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
        "",
      ),
      identity.key,
      "Store public key differs from the pinned identity",
    );
    assert(
      !current.takenDown && !current.warned,
      "Resolve the store policy issue before releasing",
    );
    return {
      extensionId: identity.id,
      published: summarize(current.publishedItemRevisionStatus),
      submitted: summarize(current.submittedItemRevisionStatus),
    };
  };
  const active = (submission) =>
    submission && ["PENDING_REVIEW", "STAGED"].includes(submission.state);
  let receipt = await readStatus();
  if (checkOnly) return { status: "authenticated", ...receipt };
  assert(candidate, "A verified candidate is required");
  const { build, zip } = candidate;
  const result = {
    ...receipt,
    version: build.version,
    revision: build.revision,
    sha256: build.sha256,
  };
  const published = receipt.published;
  const submitted = receipt.submitted;
  if (stageOnly)
    assert(
      !active(submitted),
      "Finish the active submission before staging listing changes",
    );
  if (
    published?.versions.includes(build.version) &&
    published.state === "PUBLISHED"
  )
    return { status: "already-published", ...result };
  if (
    active(submitted) &&
    submitted.versions.length &&
    submitted.versions.every((version) => version === build.version)
  )
    return { status: "already-submitted", ...result };
  const requireNewerThanPublished = (published) => {
    for (const version of published?.versions ?? [])
      assert(
        compareVersions(build.version, version) > 0,
        "Refusing an older or reused store version",
      );
  };
  requireNewerThanPublished(published);
  if (active(submitted)) {
    assert(submitted.versions.length, "Pending store version is unknown");
    for (const version of submitted.versions)
      assert(
        compareVersions(build.version, version) > 0,
        "Refusing to replace a newer or equal pending store version",
      );
    // The exact candidate has already passed CI and local integrity checks.
    // Cancel once; never burn the publisher's daily quota by retrying this POST.
    await call("POST", "cancelSubmission");
    result.superseded = submitted;
    for (let attempt = 0; attempt < 30; attempt++) {
      receipt = await readStatus();
      if (!active(receipt.submitted)) break;
      assert.deepEqual(
        receipt.submitted,
        submitted,
        "Submission changed during cancellation; inspect the store",
      );
      if (attempt < 29) await pause();
    }
    assert(
      !active(receipt.submitted),
      "Cancellation is still processing; inspect the store before retrying",
    );
    // Approval can race cancellation. Never upload over a newer publication.
    requireNewerThanPublished(receipt.published);
    result.published = receipt.published;
    result.submitted = receipt.submitted;
  }
  const uploaded = await call("POST", "upload", zip, true);
  let state = uploaded.uploadState;
  for (
    let attempt = 0;
    ["IN_PROGRESS", "UPLOAD_IN_PROGRESS"].includes(state) && attempt < 60;
    attempt++
  ) {
    await pause();
    state = (await call("GET", "fetchStatus")).lastAsyncUploadState;
  }
  assert.equal(
    state,
    "SUCCEEDED",
    "Upload failed or is still processing; inspect the store before retrying",
  );
  if (uploaded.crxVersion)
    assert.equal(
      uploaded.crxVersion,
      build.version,
      "Uploaded store version differs",
    );
  if (stageOnly)
    return { status: "staged-upload", ...result, reviewSubmitted: false };
  const submittedResult = await call("POST", "publish", {
    publishType: "DEFAULT_PUBLISH",
    skipReview: false,
    blockOnWarnings: true,
  });
  assert(
    ["PENDING_REVIEW", "PUBLISHED"].includes(submittedResult.state),
    "Unexpected publication state; inspect the store",
  );
  return { status: "submitted", ...result, state: submittedResult.state };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, directory, receiptPath] = process.argv.slice(2);
  assert(
    ["check", "stage", "publish"].includes(mode) && directory && receiptPath,
    "Usage: publish-store.mjs check|stage|publish candidate-directory receipt.json",
  );
  const receipt = await publishStore({
    token: process.env.CWS_ACCESS_TOKEN,
    publisherId: process.env.CWS_PUBLISHER_ID,
    checkOnly: mode === "check",
    stageOnly: mode === "stage",
    candidate:
      mode !== "check"
        ? await loadCandidate(directory, process.env.GITHUB_SHA)
        : undefined,
  });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
}
