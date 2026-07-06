import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point DATA_DIR at a throwaway dir BEFORE importing the lib (config reads env
// once at import time).
process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "fl-curated-"));

const { checkAuth, putCurated, getCurated, listBackups } = await import("../lib/curated.js");

test("checkAuth: disabled when no admin token configured", () => {
  const r = checkAuth("", "Bearer whatever");
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("checkAuth: 401 on missing or wrong Bearer token", () => {
  assert.equal(checkAuth("secret", undefined).status, 401);
  assert.equal(checkAuth("secret", "Bearer nope").status, 401);
  assert.equal(checkAuth("secret", "Basic secret").status, 401);
});

test("checkAuth: ok on correct Bearer token", () => {
  const r = checkAuth("secret", "Bearer secret");
  assert.equal(r.ok, true);
});

test("putCurated writes the doc and snapshots the previous version", async () => {
  await putCurated("dole-whip", { module: "dole-whip", groups: [{ title: "v1", items: [] }] });
  let backups = await listBackups("dole-whip");
  assert.equal(backups.length, 0, "first write has nothing to back up");

  await putCurated("dole-whip", { module: "dole-whip", groups: [{ title: "v2", items: [] }] });
  const doc = await getCurated("dole-whip");
  assert.equal(doc.groups[0].title, "v2");

  backups = await listBackups("dole-whip");
  assert.equal(backups.length, 1, "second write snapshots the previous version");
});
