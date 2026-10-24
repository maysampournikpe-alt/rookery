// Tiny IndexedDB key/value wrapper (falls back to in-memory when storage is unavailable).
const mem = new Map();
let dbp;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      try {
        const r = indexedDB.open('rookery', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      } catch (e) {
        reject(e);
      }
    });
  }
  return dbp;
}

async function tx(mode, fn) {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('kv', mode);
      const res = fn(t.objectStore('kv'));
      t.oncomplete = () => resolve(res.result);
      t.onerror = () => reject(t.error);
    });
  } catch {
    return undefined;
  }
}

export async function kvSet(key, value) {
  mem.set(key, value);
  await tx('readwrite', (s) => s.put(value, key));
}

export async function kvDel(key) {
  mem.delete(key);
  await tx('readwrite', (s) => s.delete(key));
}

export async function kvAll(prefix) {
  const out = new Map();
  for (const [k, v] of mem) if (k.startsWith(prefix)) out.set(k, v);
  const keys = (await tx('readonly', (s) => s.getAllKeys())) || [];
  for (const k of keys) {
    if (!String(k).startsWith(prefix) || out.has(k)) continue;
    const v = await tx('readonly', (s) => s.get(k));
    if (v) out.set(k, v);
  }
  return [...out.values()];
}
