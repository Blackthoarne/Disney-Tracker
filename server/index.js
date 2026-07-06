// First Light — Disney Edition
// Zero-dependency Node.js server: static host + API proxy/cache + JSON store
// + module registry + curated content. Built on node:http and built-in fetch.

import http from "node:http";
import { config } from "./config.js";
import { safeJoin, sendFile, notFound } from "./lib/static.js";
import { TTLCache } from "./lib/cache.js";
import { fetchJson } from "./lib/upstream.js";
import { validKey, readKey, writeKey, MAX_BODY } from "./lib/store.js";
import { loadModules, getRegistry, matchRoute } from "./lib/modules.js";

const startedAt = Date.now();
const cache = new TTLCache();

// Files inside modules/ that may be served to the browser.
const MODULE_EXT = new Set([".js", ".css", ".json", ".html"]);

// ---- upstream URLs ----------------------------------------------------------

const UP = {
  live: () => `https://api.themeparks.wiki/v1/entity/${config.destinationId}/live`,
  schedule: () => `https://api.themeparks.wiki/v1/entity/${config.destinationId}/schedule`,
  forecast: () => `https://api.weather.gov/gridpoints/${config.weatherGrid}/forecast`,
  hourly: () => `https://api.weather.gov/gridpoints/${config.weatherGrid}/forecast/hourly`,
};

const TTL = { live: 60_000, schedule: 15 * 60_000, weather: 10 * 60_000 };

function cachedFetch(key, ttl, url) {
  return cache.fetch(key, ttl, () => fetchJson(url));
}

function envelope(result) {
  return {
    ...result.value,
    meta: {
      fetchedAt: new Date(result.fetchedAt).toISOString(),
      stale: !!result.stale,
      cached: !!result.cached,
      ...(result.error ? { error: result.error } : {}),
    },
  };
}

// ---- tiny helpers -----------------------------------------------------------

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-cache",
  });
  res.end(payload);
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Context handed to module server.js route handlers.
const routeCtx = {
  cache,
  fetchJson,
  config,
  store: { readKey, writeKey },
};

// ---- request router ---------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;
  const method = req.method || "GET";

  // Health check (drives the Docker HEALTHCHECK).
  if (path === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      version: config.version,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      modules: getRegistry().map((m) => m.id),
    });
  }

  // Module registry.
  if (path === "/api/modules" && method === "GET") {
    return sendJson(res, 200, { modules: getRegistry() });
  }

  // Per-module server.js routes: /api/modules/<id>/<path>
  if (path.startsWith("/api/modules/")) {
    const route = matchRoute(method, path);
    if (route) {
      const out = await route.fn(req, res, routeCtx);
      if (!res.headersSent && out !== undefined) sendJson(res, 200, out);
      return;
    }
  }

  // ---- live/park data (proxy + TTL cache + stale-on-error) ----
  if (path === "/api/live" && method === "GET") {
    return sendJson(res, 200, envelope(await cachedFetch("live", TTL.live, UP.live())));
  }
  if (path === "/api/schedule" && method === "GET") {
    return sendJson(res, 200, envelope(await cachedFetch("schedule", TTL.schedule, UP.schedule())));
  }
  if (path === "/api/weather/forecast" && method === "GET") {
    return sendJson(res, 200, envelope(await cachedFetch("forecast", TTL.weather, UP.forecast())));
  }
  if (path === "/api/weather/hourly" && method === "GET") {
    return sendJson(res, 200, envelope(await cachedFetch("hourly", TTL.weather, UP.hourly())));
  }

  // ---- bundled data: all four in parallel, each part carrying its meta ----
  if (path === "/api/data" && method === "GET") {
    const parts = await Promise.allSettled([
      cachedFetch("live", TTL.live, UP.live()),
      cachedFetch("schedule", TTL.schedule, UP.schedule()),
      cachedFetch("forecast", TTL.weather, UP.forecast()),
      cachedFetch("hourly", TTL.weather, UP.hourly()),
    ]);
    const [live, schedule, forecast, hourly] = parts;
    const pack = (settled) =>
      settled.status === "fulfilled"
        ? { value: settled.value.value, meta: envelope(settled.value).meta }
        : { value: null, meta: { stale: true, cached: false, error: String(settled.reason?.message || settled.reason) } };
    return sendJson(res, 200, {
      live: pack(live),
      schedule: pack(schedule),
      forecast: pack(forecast),
      hourly: pack(hourly),
      fetchedAt: new Date().toISOString(),
    });
  }

  // ---- persistent JSON store ----
  if (path.startsWith("/api/store/")) {
    const key = decodeURIComponent(path.slice("/api/store/".length));
    if (!validKey(key)) return sendJson(res, 400, { ok: false, error: "Invalid key" });
    if (method === "GET") {
      const value = await readKey(key);
      if (value === null) return sendJson(res, 404, { ok: false, error: "Not found" });
      return sendJson(res, 200, value);
    }
    if (method === "PUT" || method === "POST") {
      let body;
      try {
        body = await readBody(req);
      } catch {
        return sendJson(res, 413, { ok: false, error: "Payload too large" });
      }
      let parsed;
      try {
        parsed = JSON.parse(body.toString("utf8") || "null");
      } catch {
        return sendJson(res, 400, { ok: false, error: "Invalid JSON" });
      }
      await writeKey(key, parsed);
      return sendJson(res, 200, { ok: true, key });
    }
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  // Unknown API route.
  if (path.startsWith("/api/")) {
    return sendJson(res, 404, { ok: false, error: "Unknown endpoint" });
  }

  // ---- static: module files (/modules/<id>/<file>, whitelisted) ----
  if (path.startsWith("/modules/")) {
    const abs = safeJoin(config.modulesDir, path.slice("/modules".length));
    if (await sendFile(res, abs, { allowExt: MODULE_EXT })) return;
    if (res.headersSent) return; // sendFile already answered (e.g. 403)
    return notFound(res);
  }

  // ---- static: admin editor (/admin) ----
  if (path === "/admin" || path.startsWith("/admin/")) {
    const rel = path === "/admin" || path === "/admin/" ? "/index.html" : path.slice("/admin".length);
    const abs = safeJoin(config.adminDir, rel);
    if (await sendFile(res, abs)) return;
    if (res.headersSent) return;
    return notFound(res);
  }

  // ---- static: public/ (the PWA shell) ----
  const rel = path === "/" ? "/index.html" : path;
  const abs = safeJoin(config.publicDir, rel);
  if (await sendFile(res, abs)) return;

  // SPA-ish fallback: serve the shell for unknown non-file paths.
  if (!path.includes(".")) {
    const shell = safeJoin(config.publicDir, "/index.html");
    if (await sendFile(res, shell)) return;
  }

  return notFound(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("Unhandled request error:", err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Internal error" });
    else res.end();
  });
});

async function start() {
  await loadModules();
  server.listen(config.port, () => {
    console.log(
      `First Light listening on :${config.port}  ` +
        `(data=${config.dataDir}, tz=${config.tz}, modules=${getRegistry().length})`
    );
  });
}

start();

export { server, handle, cache };
