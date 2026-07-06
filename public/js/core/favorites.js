// Server-backed favorites, shared across every device via /api/store/favorites.
// One-time migration from the old localStorage 'flFavorites' island.

const STORE_KEY = "favorites";
const LEGACY_LS_KEY = "flFavorites";

export function createFavorites(api, bus) {
  let cache = [];
  let loaded = false;

  async function load() {
    // Read from the server store first.
    try {
      const server = await api.get(`/api/store/${STORE_KEY}`);
      if (Array.isArray(server)) cache = server;
    } catch (err) {
      if (err.status !== 404) console.warn("favorites load failed:", err.message);
      cache = [];
    }

    // One-time migration from localStorage, if the server has nothing yet.
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_LS_KEY) || "[]");
      if (Array.isArray(legacy) && legacy.length && !cache.length) {
        cache = legacy;
        await save();
        localStorage.removeItem(LEGACY_LS_KEY);
      }
    } catch {
      /* ignore malformed legacy data */
    }

    loaded = true;
    bus.emit("favorites:changed", cache);
    return cache;
  }

  async function save() {
    await api.put(`/api/store/${STORE_KEY}`, cache);
  }

  function list() {
    return cache.slice();
  }

  function has(name) {
    return cache.includes(name);
  }

  async function toggle(name) {
    if (cache.includes(name)) cache = cache.filter((f) => f !== name);
    else cache = [...cache, name];
    bus.emit("favorites:changed", cache);
    try {
      await save();
    } catch (err) {
      console.warn("favorites save failed:", err.message);
    }
  }

  return { load, list, has, toggle, get loaded() { return loaded; } };
}

export default createFavorites;
