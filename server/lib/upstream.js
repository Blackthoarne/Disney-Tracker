// Upstream HTTP client. Uses Node's built-in fetch with an AbortController
// timeout and a descriptive User-Agent (the National Weather Service rejects
// requests that don't send one).

import { config } from "../config.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": config.userAgent,
        Accept: "application/json",
        ...headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Upstream ${res.status} ${res.statusText} for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export default { fetchJson };
