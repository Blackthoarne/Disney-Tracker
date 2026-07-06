// First Light — Disney Edition
// Zero-dependency Node.js server: static host + API proxy/cache + JSON store
// + module registry + curated content. Built on node:http and built-in fetch.

import http from "node:http";
import { config } from "./config.js";
import { safeJoin, sendFile, notFound } from "./lib/static.js";

const startedAt = Date.now();

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

// ---- request router ---------------------------------------------------------

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  // Health check (drives the Docker HEALTHCHECK).
  if (path === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      version: config.version,
      uptime: Math.round((Date.now() - startedAt) / 1000),
      modules: [],
    });
  }

  // Unknown API route.
  if (path.startsWith("/api/")) {
    return sendJson(res, 404, { ok: false, error: "Unknown endpoint" });
  }

  // ---- static: the current single-file app (Phase 1 serves the repo root) ----
  const rel = path === "/" ? "/index.html" : path;
  const abs = safeJoin(config.repoRoot, rel);
  if (await sendFile(res, abs)) return;

  return notFound(res);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("Unhandled request error:", err);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Internal error" });
    else res.end();
  });
});

server.listen(config.port, () => {
  console.log(
    `First Light listening on :${config.port}  (data=${config.dataDir}, tz=${config.tz})`
  );
});

export { server, handle };
