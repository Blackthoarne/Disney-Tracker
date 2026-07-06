// Static file serving with a MIME map and a path-traversal guard.
// Used for public/ (the PWA shell), /modules/* files, and /admin.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, join, sep } from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

export function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] || "application/octet-stream";
}

// Resolve `urlPath` under `rootDir`, refusing anything that escapes root.
// Returns an absolute path or null if the request is unsafe.
export function safeJoin(rootDir, urlPath) {
  const root = resolve(rootDir);
  // Strip query/hash, decode, normalise.
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  // Reject NUL and backslashes outright.
  if (clean.includes("\0")) return null;
  const target = resolve(join(root, clean));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

// Send a file if it exists; returns true if served, false if not found.
// `allowExt` (optional Set) whitelists extensions — used for /modules/*.
export async function sendFile(res, absPath, { allowExt } = {}) {
  if (!absPath) {
    notFound(res);
    return false;
  }
  if (allowExt && !allowExt.has(extname(absPath).toLowerCase())) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return false;
  }
  let info;
  try {
    info = await stat(absPath);
  } catch {
    return false; // caller decides on 404 / index fallback
  }
  if (info.isDirectory()) return false;
  res.writeHead(200, {
    "content-type": mimeFor(absPath),
    "content-length": info.size,
    "cache-control": cacheControlFor(absPath),
  });
  createReadStream(absPath).pipe(res);
  return true;
}

function cacheControlFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".html" || ext === ".json") return "no-cache";
  // Static assets: short cache; Cloudflare handles the edge layer.
  return "public, max-age=300";
}

export function notFound(res, msg = "Not Found") {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end(msg);
}

export default { mimeFor, safeJoin, sendFile, notFound };
