// Central configuration, parsed once from the environment.
// Zero dependencies — plain process.env reads with sensible defaults.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const env = process.env;

function num(value, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  // Network
  port: num(env.PORT, 8080),

  // Persistent data root. In Docker this is /config (a VOLUME); locally ./data.
  dataDir: resolve(env.DATA_DIR || resolve(repoRoot, "data")),

  // Repo paths (shipped, read-only at runtime).
  repoRoot,
  publicDir: resolve(repoRoot, "public"),
  modulesDir: resolve(repoRoot, "modules"),
  adminDir: resolve(repoRoot, "admin"),

  // Timezone (park-local). Node reads process.env.TZ natively.
  tz: env.TZ || "America/New_York",

  // Admin gate. Unset ⇒ curated writes + /admin are disabled (defense in depth).
  adminToken: env.ADMIN_TOKEN || "",

  // Upstream identifiers.
  destinationId: env.DESTINATION_ID || "e957da41-3552-4cf6-b636-5babc5cbc4e5",
  weatherGrid: env.WEATHER_GRID || "MLB/20,61",

  // App version (kept in sync with package.json manually; cheap + dep-free).
  version: "1.0.0",

  // A descriptive User-Agent — NWS rejects requests without one.
  userAgent:
    "FirstLight-Disney/1.0 (self-hosted dashboard; https://github.com/Blackthoarne/Disney-Tracker)",
};

export default config;
