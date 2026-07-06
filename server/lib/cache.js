// TTL cache with stale-on-error semantics.
// One server-side fetch feeds every connected device, and if upstream is
// down we keep serving the last good value flagged `stale: true` so the
// dashboard degrades gracefully instead of erroring in the park.

export class TTLCache {
  constructor() {
    /** @type {Map<string, {value:any, fetchedAt:number, expiresAt:number}>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<any>>} in-flight loaders (dedupe) */
    this.inflight = new Map();
  }

  /**
   * Return the cached value for `key`, refreshing via `loader` when stale.
   * Resolves to { value, fetchedAt, stale, cached }.
   *  - cached: served without calling the loader this time
   *  - stale : loader failed and we fell back to a previous value
   */
  async fetch(key, ttlMs, loader) {
    const now = Date.now();
    const hit = this.entries.get(key);

    if (hit && now < hit.expiresAt) {
      return { value: hit.value, fetchedAt: hit.fetchedAt, stale: false, cached: true };
    }

    // Deduplicate concurrent refreshes for the same key.
    if (this.inflight.has(key)) {
      try {
        const value = await this.inflight.get(key);
        const e = this.entries.get(key);
        return { value, fetchedAt: e?.fetchedAt ?? now, stale: false, cached: true };
      } catch {
        // fall through to the stale path below
      }
    }

    const p = (async () => loader())();
    this.inflight.set(key, p);
    try {
      const value = await p;
      const fetchedAt = Date.now();
      this.entries.set(key, { value, fetchedAt, expiresAt: fetchedAt + ttlMs });
      return { value, fetchedAt, stale: false, cached: false };
    } catch (err) {
      if (hit) {
        // Serve the last good value, flagged stale.
        return { value: hit.value, fetchedAt: hit.fetchedAt, stale: true, cached: true, error: String(err?.message || err) };
      }
      throw err; // nothing to fall back to
    } finally {
      this.inflight.delete(key);
    }
  }

  peek(key) {
    return this.entries.get(key) || null;
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }
}

export default TTLCache;
