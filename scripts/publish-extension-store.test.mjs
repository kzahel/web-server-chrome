import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadCandidate,
  publishStore,
} from "../extension/scripts/publish-store.mjs";

const identity = {
  id: "lpkjdhnmgkhaabhimpdinmdgejoaejic",
  key: (
    await readFile(
      new URL("../extension/fullpubkey.txt", import.meta.url),
      "utf8",
    )
  ).replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, ""),
};
const publisherId = "test-publisher";
const name = `publishers/${publisherId}/items/${identity.id}`;
const revision = "a".repeat(40);
const build = {
  version: "0.1.4",
  extensionId: identity.id,
  revision,
  sourceDirty: false,
  filename: "ok200-extension.zip",
};
const zip = Buffer.from("accepted artifact bytes");
build.sha256 = createHash("sha256").update(zip).digest("hex");
const candidate = { build, zip };
const publishedItemRevisionStatus = {
  state: "PUBLISHED",
  distributionChannels: [{ crxVersion: "0.1.3" }],
};
const status = {
  name,
  itemId: identity.id,
  publicKey: identity.key,
  publishedItemRevisionStatus,
};

function sequence(responses) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, ...options });
      assert(responses.length, "Unexpected extra API call");
      const response = responses.shift();
      if (response === null) return new Response(null, { status: 204 });
      if (response instanceof Response) return response;
      return new Response(
        JSON.stringify({ name, itemId: identity.id, ...response }),
        { status: 200 },
      );
    },
  };
}

test("asynchronous upload submits the accepted bytes only after processing succeeds", async () => {
  const { calls, request } = sequence([
    status,
    { uploadState: "IN_PROGRESS" },
    { ...status, lastAsyncUploadState: "IN_PROGRESS" },
    { ...status, lastAsyncUploadState: "SUCCEEDED" },
    { state: "PENDING_REVIEW" },
  ]);
  const receipt = await publishStore({
    token: "test-token",
    publisherId,
    candidate,
    request,
    pause: async () => {},
  });
  assert.equal(receipt.state, "PENDING_REVIEW");
  assert.deepEqual(
    calls.map((call) => [call.method, call.url.split(":").at(-1)]),
    [
      ["GET", "fetchStatus"],
      ["POST", "upload"],
      ["GET", "fetchStatus"],
      ["GET", "fetchStatus"],
      ["POST", "publish"],
    ],
  );
  assert.equal(calls[1].body, zip);
  assert.match(calls[1].url, /\/upload\/v2\//);
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    publishType: "DEFAULT_PUBLISH",
    skipReview: false,
    blockOnWarnings: true,
  });
});

test("a rerun recognizes the same submission and an older run cannot replace a newer one", async () => {
  for (const version of ["0.1.4", "0.1.5"]) {
    const { request, calls } = sequence([
      {
        ...status,
        submittedItemRevisionStatus: {
          state: "PENDING_REVIEW",
          distributionChannels: [{ crxVersion: version }],
        },
      },
    ]);
    const operation = publishStore({
      token: "test-token",
      publisherId,
      candidate,
      request,
    });
    if (version === build.version)
      assert.equal((await operation).status, "already-submitted");
    else await assert.rejects(operation, /newer or equal pending/);
    assert.equal(calls.length, 1);
  }
});

function pending(state = "PENDING_REVIEW", versions = ["0.1.3"]) {
  return {
    ...status,
    publishedItemRevisionStatus: {
      state: "PUBLISHED",
      distributionChannels: [{ crxVersion: "0.1.1" }],
    },
    submittedItemRevisionStatus: {
      state,
      distributionChannels: versions.map((crxVersion) => ({ crxVersion })),
    },
  };
}

test("a newer verified release cancels once, waits for cancellation, then replaces the submission", async () => {
  for (const state of ["PENDING_REVIEW", "STAGED"]) {
    const previous = pending(state);
    const { calls, request } = sequence([
      previous,
      null,
      previous, // Cancellation may not be visible immediately.
      { ...previous, submittedItemRevisionStatus: { state: "CANCELLED" } },
      { uploadState: "SUCCEEDED", crxVersion: build.version },
      { state: "PENDING_REVIEW" },
    ]);
    const receipt = await publishStore({
      token: "test-token",
      publisherId,
      candidate,
      request,
      pause: async () => {},
    });
    assert.deepEqual(receipt.superseded.versions, ["0.1.3"]);
    assert.equal(receipt.state, "PENDING_REVIEW");
    assert.deepEqual(
      calls.map((call) => call.url.split(":").at(-1)),
      [
        "fetchStatus",
        "cancelSubmission",
        "fetchStatus",
        "fetchStatus",
        "upload",
        "publish",
      ],
    );
    assert.equal(calls[1].method, "POST");
    assert.equal(calls[1].body, undefined);
    assert.equal(calls[4].body, zip);
  }
});

test("unknown, mixed or already published newer versions cannot trigger cancellation", async () => {
  for (const previous of [
    pending("PENDING_REVIEW", []),
    pending("PENDING_REVIEW", ["0.1.3", "0.1.5"]),
    {
      ...pending(),
      publishedItemRevisionStatus: {
        state: "PUBLISHED",
        distributionChannels: [{ crxVersion: "0.1.5" }],
      },
    },
  ]) {
    const { calls, request } = sequence([previous]);
    await assert.rejects(
      publishStore({ token: "test-token", publisherId, candidate, request }),
    );
    assert.equal(calls.length, 1);
  }
});

test("cancellation failures, stalled status and publication races never upload", async () => {
  const previous = pending();
  for (const responses of [
    [previous, new Response(null, { status: 429 })],
    [previous, null, ...Array(30).fill(previous)],
    [previous, null, pending("PENDING_REVIEW", ["0.1.5"])],
    [
      previous,
      null,
      {
        ...status,
        publishedItemRevisionStatus: {
          state: "PUBLISHED",
          distributionChannels: [{ crxVersion: "0.1.5" }],
        },
      },
    ],
  ]) {
    const { calls, request } = sequence(responses);
    await assert.rejects(
      publishStore({
        token: "test-token",
        publisherId,
        candidate,
        request,
        pause: async () => {},
      }),
    );
    assert.equal(
      calls.filter((call) => call.url.endsWith(":cancelSubmission")).length,
      1,
    );
    assert(
      calls.every(
        (call) =>
          !call.url.endsWith(":upload") && !call.url.endsWith(":publish"),
      ),
    );
  }
});

test("status verification is read-only and refuses a different public key", async () => {
  const pem = `-----BEGIN PUBLIC KEY-----\n${identity.key.match(/.{1,64}/g).join("\n")}\n-----END PUBLIC KEY-----\n`;
  const { calls, request } = sequence([{ ...pending(), publicKey: pem }]);
  assert.equal(
    (
      await publishStore({
        token: "test-token",
        publisherId,
        request,
        checkOnly: true,
      })
    ).status,
    "authenticated",
  );
  assert.equal(calls.length, 1);
  const other = sequence([{ ...status, publicKey: "another-key" }]);
  await assert.rejects(
    publishStore({
      token: "test-token",
      publisherId,
      request: other.request,
      checkOnly: true,
    }),
    /public key/,
  );
});

test("failed processing never submits, and HTTP errors do not expose response credentials", async () => {
  const failed = sequence([status, { uploadState: "FAILED" }]);
  await assert.rejects(
    publishStore({
      token: "test-token",
      publisherId,
      candidate,
      request: failed.request,
    }),
    /Upload failed/,
  );
  assert.equal(failed.calls.length, 2);
  await assert.rejects(
    publishStore({
      token: "test-token",
      publisherId,
      checkOnly: true,
      request: async () =>
        new Response("secret-response-content", { status: 403 }),
    }),
    (error) =>
      error.message.includes("HTTP 403") &&
      !error.message.includes("secret-response-content"),
  );
});

test("release artifacts must match the clean source and checksum before a network write", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ya-cws-candidate-"));
  try {
    await writeFile(join(directory, "build.json"), JSON.stringify(build));
    await writeFile(join(directory, build.filename), zip);
    assert.deepEqual((await loadCandidate(directory, revision)).build, build);
    await assert.rejects(
      loadCandidate(directory, "b".repeat(40)),
      /source differs/,
    );
    await writeFile(
      join(directory, "build.json"),
      JSON.stringify({ ...build, sourceDirty: true }),
    );
    await assert.rejects(loadCandidate(directory, revision), /dirty source/);
    await writeFile(join(directory, "build.json"), JSON.stringify(build));
    await writeFile(join(directory, build.filename), "changed bytes");
    await assert.rejects(loadCandidate(directory, revision), /checksum/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("staging uploads verified bytes without review or cancellation", async () => {
  const { calls, request } = sequence([status, { uploadState: "SUCCEEDED" }]);
  const receipt = await publishStore({
    token: "test-token",
    publisherId,
    candidate,
    stageOnly: true,
    request,
  });
  assert.equal(receipt.status, "staged-upload");
  assert.equal(receipt.reviewSubmitted, false);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body, zip);
  assert(
    calls.every(
      (call) =>
        !call.url.endsWith(":publish") &&
        !call.url.endsWith(":cancelSubmission"),
    ),
  );
});

test("staging refuses an active review before any write", async () => {
  const { calls, request } = sequence([
    {
      ...status,
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels: [{ crxVersion: "0.1.3" }],
      },
    },
  ]);
  await assert.rejects(
    publishStore({
      token: "test-token",
      publisherId,
      candidate,
      stageOnly: true,
      request,
    }),
    /active submission/,
  );
  assert.equal(calls.length, 1);
});
