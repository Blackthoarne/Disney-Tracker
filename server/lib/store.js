// Persistent JSON key/value store backed by files in DATA_DIR/store/.
// Shared across all devices (fixes the localStorage-island problem for
// favorites). Atomic writes (tmp + rename) survive a power cut mid-write.

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export const KEY_RE = /^[a-z0-9-_]{1,64}$/;
export const MAX_BODY = 256 * 1024; // 256 KB

export function validKey(key) {
  return typeof key === "string" && KEY_RE.test(key);
}

function storeDir() {
  return join(config.dataDir, "store");
}

function keyPath(key) {
  return join(storeDir(), `${key}.json`);
}

export async function readKey(key) {
  if (!validKey(key)) throw new Error("Invalid key");
  try {
    const raw = await readFile(keyPath(key), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeKey(key, value) {
  if (!validKey(key)) throw new Error("Invalid key");
  const dir = storeDir();
  await mkdir(dir, { recursive: true });
  const serialized = JSON.stringify(value, null, 2);
  if (Buffer.byteLength(serialized) > MAX_BODY) throw new Error("Payload too large");
  const finalPath = keyPath(key);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, serialized, "utf8");
  await rename(tmpPath, finalPath); // atomic on POSIX
  return value;
}

export default { validKey, readKey, writeKey, KEY_RE, MAX_BODY };
