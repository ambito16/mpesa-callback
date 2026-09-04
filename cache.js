const pending = new Map();
const store = new Map();

function now() {
  return Date.now();
}

function set(key, value, ttlMs) {
  const expiresAt = ttlMs ? now() + ttlMs : null;
  store.set(key, { value, expiresAt });
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt && entry.expiresAt < now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function del(key) {
  store.delete(key);
}

async function memoize(key, ttlSeconds, fn) {
  const cached = get(key);
  if (cached !== undefined) return cached;

  if (pending.has(key)) {
    return pending.get(key);
  }

  const p = (async () => {
    try {
      const result = await fn();
      set(key, result, ttlSeconds ? ttlSeconds * 1000 : null);
      return result;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, p);
  return p;
}

module.exports = {
  get,
  set,
  del,
  memoize
};
