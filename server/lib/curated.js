// Curated content: runtime-editable JSON documents in DATA_DIR/curated/.
// Public reads, admin-token writes. Every write snapshots the previous version
// into DATA_DIR/backups/ for one-click restore. On first run, each module's
// shipped seed.json is copied into DATA_DIR/curated/ (after that, /config is
// the source of truth and survives container updates).

import { readFile, writeFile, rename, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export const MODULE_RE = /^[a-z0-9-_]{1,64}$/;
const MAX_DOC = 512 * 1024; // 512 KB per curated doc

export function validModule(module) {
  return typeof module === "string" && MODULE_RE.test(module);
}

// Pure admin-auth decision (extracted so it's unit-testable).
// - No admin token configured ⇒ writes disabled (403).
// - Missing/incorrect Bearer token ⇒ 401.
export function checkAuth(adminToken, authorizationHeader) {
  if (!adminToken) return { ok: false, status: 403, error: "Admin writes are disabled (ADMIN_TOKEN not set)" };
  const m = (authorizationHeader || "").match(/^Bearer\s+(.+)$/i);
  if (!m || m[1] !== adminToken) return { ok: false, status: 401, error: "Unauthorized" };
  return { ok: true };
}

function curatedDir() {
  return join(config.dataDir, "curated");
}
function backupsDir() {
  return join(config.dataDir, "backups");
}
function docPath(module) {
  return join(curatedDir(), `${module}.json`);
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// Copy each module's seed.json into DATA_DIR/curated/ if not already present.
export async function seedCurated() {
  await mkdir(curatedDir(), { recursive: true });
  let dirs = [];
  try {
    dirs = await readdir(config.modulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const seeded = [];
  for (const d of dirs) {
    if (!d.isDirectory() || d.name.startsWith("_")) continue;
    const seedPath = join(config.modulesDir, d.name, "seed.json");
    if (!(await fileExists(seedPath))) continue;
    const manifestPath = join(config.modulesDir, d.name, "module.json");
    let id = d.name;
    try {
      id = JSON.parse(await readFile(manifestPath, "utf8")).id || d.name;
    } catch {
      /* fall back to dir name */
    }
    const target = docPath(id);
    if (await fileExists(target)) continue;
    const seed = await readFile(seedPath, "utf8");
    await atomicWrite(target, seed);
    seeded.push(id);
  }
  return seeded;
}

async function atomicWrite(finalPath, contents) {
  await mkdir(join(finalPath, ".."), { recursive: true });
  const tmp = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contents, "utf8");
  await rename(tmp, finalPath);
}

// Read a curated doc. Falls back to the shipped seed if /config has none yet.
export async function getCurated(module) {
  if (!validModule(module)) throw new Error("Invalid module");
  try {
    return JSON.parse(await readFile(docPath(module), "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    // Fall back to the seed (covers modules added after first-run seeding).
    try {
      return JSON.parse(await readFile(join(config.modulesDir, module, "seed.json"), "utf8"));
    } catch {
      return null;
    }
  }
}

// Write a curated doc, snapshotting the previous version to backups first.
export async function putCurated(module, doc) {
  if (!validModule(module)) throw new Error("Invalid module");
  const serialized = JSON.stringify(doc, null, 2);
  if (Buffer.byteLength(serialized) > MAX_DOC) throw new Error("Document too large");

  // Snapshot the current version (if any) before overwriting.
  const current = await getCurrentRaw(module);
  if (current != null) {
    await mkdir(backupsDir(), { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await atomicWrite(join(backupsDir(), `${module}-${ts}.json`), current);
  }

  await atomicWrite(docPath(module), serialized);
  return doc;
}

async function getCurrentRaw(module) {
  try {
    return await readFile(docPath(module), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function listBackups(module) {
  if (!validModule(module)) throw new Error("Invalid module");
  let files = [];
  try {
    files = await readdir(backupsDir());
  } catch {
    return [];
  }
  const prefix = `${module}-`;
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => ({ name: f, timestamp: f.slice(prefix.length, -5) }));
}

export async function restoreBackup(module, backupName) {
  if (!validModule(module)) throw new Error("Invalid module");
  // Guard the backup filename (no traversal; must belong to this module).
  if (!/^[a-z0-9-_.:]+\.json$/i.test(backupName) || !backupName.startsWith(`${module}-`)) {
    throw new Error("Invalid backup name");
  }
  const raw = await readFile(join(backupsDir(), backupName), "utf8");
  const doc = JSON.parse(raw);
  return putCurated(module, doc); // restoring is itself an edit → it re-backs-up
}

export default {
  validModule,
  checkAuth,
  seedCurated,
  getCurated,
  putCurated,
  listBackups,
  restoreBackup,
};
