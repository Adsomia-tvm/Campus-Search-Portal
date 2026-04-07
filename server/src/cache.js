// Simple in-memory TTL cache
class Cache {
  constructor(ttlSeconds = 300) {
    this.store = new Map();
    this.ttl = ttlSeconds * 1000;
    // Cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000).unref();
  }

  key(obj) {
    return JSON.stringify(obj);
  }

  get(k) {
    const entry = this.store.get(k);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.store.delete(k);
      return null;
    }
    return entry.value;
  }

  set(k, value) {
    this.store.set(k, { value, expires: Date.now() + this.ttl });
  }

  del(k) { this.store.delete(k); }

  clear() { this.store.clear(); }

  cleanup() {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expires) this.store.delete(k);
    }
  }

  get size() { return this.store.size; }
}

// 5-minute cache for search results, 10-minute for static data
module.exports = {
  searchCache:  new Cache(300),   // search results — 5 min
  staticCache:  new Cache(600),   // cities, categories — 10 min
  detailCache:  new Cache(300),   // college detail — 5 min
};
