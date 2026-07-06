import { test } from "node:test";
import assert from "node:assert/strict";
import { validKey } from "../lib/store.js";

test("accepts valid store keys", () => {
  for (const k of ["favorites", "settings", "a", "rope-drop", "key_1", "a".repeat(64)]) {
    assert.equal(validKey(k), true, `${k} should be valid`);
  }
});

test("rejects invalid store keys", () => {
  for (const k of [
    "",
    "Favorites",       // uppercase
    "has space",
    "slash/key",
    "../escape",
    "dot.key",
    "a".repeat(65),    // too long
    "emoji😀",
  ]) {
    assert.equal(validKey(k), false, `${k} should be invalid`);
  }
});
