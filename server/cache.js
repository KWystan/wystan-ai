// ── Simple in-memory TTL cache (CommonJS) ──────────────────────────
// Used by route modules to cache Supabase query results.

function createTTLCache(ttlMs = 30_000) {
  const store = new Map();
  const timers = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.ts > ttlMs) {
        store.delete(key);
        clearTimeout(timers.get(key));
        timers.delete(key);
        return null;
      }
      return entry.data;
    },
    set(key, data) {
      store.set(key, { data, ts: Date.now() });
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => { store.delete(key); timers.delete(key); }, ttlMs));
    },
    del(key) {
      store.delete(key);
      clearTimeout(timers.get(key));
      timers.delete(key);
    },
    /** Clear all keys matching a prefix (e.g. `conv:${userId}:`). */
    clearPrefix(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) this.del(key);
      }
    },
  };
}

module.exports = { createTTLCache };
