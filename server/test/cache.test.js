import { test } from "node:test";
import assert from "node:assert/strict";
import { TTLCache } from "../lib/cache.js";

test("returns fresh value and caches within TTL", async () => {
  const c = new TTLCache();
  let calls = 0;
  const loader = async () => ({ n: ++calls });

  const a = await c.fetch("k", 10_000, loader);
  assert.equal(a.value.n, 1);
  assert.equal(a.cached, false);
  assert.equal(a.stale, false);

  const b = await c.fetch("k", 10_000, loader);
  assert.equal(b.value.n, 1, "second call within TTL is served from cache");
  assert.equal(b.cached, true);
  assert.equal(calls, 1, "loader not called again within TTL");
});

test("refreshes after TTL expires", async () => {
  const c = new TTLCache();
  let calls = 0;
  const loader = async () => ({ n: ++calls });

  await c.fetch("k", 0, loader); // TTL 0 => always stale
  const b = await c.fetch("k", 0, loader);
  assert.equal(b.value.n, 2);
  assert.equal(calls, 2);
});

test("serves last good value flagged stale on loader error", async () => {
  const c = new TTLCache();
  let mode = "ok";
  const loader = async () => {
    if (mode === "fail") throw new Error("upstream down");
    return { ok: true };
  };

  await c.fetch("k", 0, loader); // seed a good value
  mode = "fail";
  const r = await c.fetch("k", 0, loader);
  assert.equal(r.stale, true);
  assert.deepEqual(r.value, { ok: true });
  assert.match(r.error, /upstream down/);
});

test("throws when there is no value to fall back to", async () => {
  const c = new TTLCache();
  await assert.rejects(
    () => c.fetch("k", 0, async () => { throw new Error("boom"); }),
    /boom/
  );
});
