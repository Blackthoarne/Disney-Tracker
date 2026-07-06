// Module registry. Scans modules/*/module.json at startup, validates and sorts
// them, and exposes the registry + any per-module server.js routes. No central
// file lists the modules — adding one is dropping in a folder.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";

const REQUIRED = ["id", "title"];

/** @type {{registry: any[], routes: Map<string, Function>}} */
const state = { registry: [], routes: new Map() };

function validate(manifest, dirName) {
  for (const key of REQUIRED) {
    if (!manifest[key]) throw new Error(`module ${dirName}: missing "${key}"`);
  }
  return {
    id: String(manifest.id),
    title: String(manifest.title),
    navLabel: manifest.navLabel || manifest.title,
    tag: manifest.tag || "",
    badges: Array.isArray(manifest.badges) ? manifest.badges : [],
    type: manifest.type || "static", // live | curated | static
    order: Number.isFinite(manifest.order) ? manifest.order : 999,
    slot: manifest.slot || "main", // main | header
    nav: manifest.nav !== false,
    enabled: manifest.enabled !== false,
    hasClient: manifest.hasClient !== false, // set false for pure header widgets that still need client.js? default true
  };
}

// Load (or reload) the registry. Called once at startup.
export async function loadModules() {
  state.registry = [];
  state.routes = new Map();

  let dirs = [];
  try {
    dirs = await readdir(config.modulesDir, { withFileTypes: true });
  } catch {
    return state.registry; // no modules dir yet
  }

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (d.name.startsWith("_")) continue; // _template and friends are skipped
    const dir = join(config.modulesDir, d.name);
    const manifestPath = join(dir, "module.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch (err) {
      console.warn(`Skipping module "${d.name}": ${err.message}`);
      continue;
    }
    let entry;
    try {
      entry = validate(manifest, d.name);
    } catch (err) {
      console.warn(err.message);
      continue;
    }
    if (!entry.enabled) continue;

    // Optional server.js routes → /api/modules/<id>/<path>
    const serverPath = join(dir, "server.js");
    if (await exists(serverPath)) {
      try {
        const mod = await import(pathToFileURL(serverPath).href);
        const routes = mod.default?.routes || mod.routes || {};
        for (const [spec, fn] of Object.entries(routes)) {
          const [m, p] = spec.split(/\s+/);
          const routeKey = `${m.toUpperCase()} /api/modules/${entry.id}${p.startsWith("/") ? p : "/" + p}`;
          state.routes.set(routeKey, fn);
        }
      } catch (err) {
        console.warn(`module ${entry.id} server.js failed to load: ${err.message}`);
      }
    }

    state.registry.push(entry);
  }

  state.registry.sort((a, b) => a.order - b.order);
  return state.registry;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function getRegistry() {
  return state.registry;
}

// Match a server.js route. Returns { fn, params } or null.
export function matchRoute(method, path) {
  const key = `${method.toUpperCase()} ${path}`;
  const fn = state.routes.get(key);
  return fn ? { fn } : null;
}

export default { loadModules, getRegistry, matchRoute };
