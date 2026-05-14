/**
 * Caché en memoria para datos del backend.
 * Los datos persisten mientras el tab está abierto (se pierden al refrescar F5).
 * Evita re-fetchear al navegar entre páginas.
 */

const _cache = {};
const _ts    = {};
const _ttl   = {};

const TTL_DEFAULT_MS = 2 * 60 * 60 * 1000;  // 2 horas
export const TTL_DAY_MS  = 24 * 60 * 60 * 1000; // 24 horas

export function getCached(key) {
  if (!_cache[key]) return null;
  const ttl = _ttl[key] ?? TTL_DEFAULT_MS;
  if (Date.now() - _ts[key] > ttl) {
    delete _cache[key];
    delete _ts[key];
    delete _ttl[key];
    return null;
  }
  return _cache[key];
}

export function setCached(key, data, ttlMs = TTL_DEFAULT_MS) {
  _cache[key] = data;
  _ts[key]    = Date.now();
  _ttl[key]   = ttlMs;
}

export function invalidate(key) {
  delete _cache[key];
  delete _ts[key];
  delete _ttl[key];
}

export function invalidateAll() {
  Object.keys(_cache).forEach(k => { delete _cache[k]; delete _ts[k]; delete _ttl[k]; });
}

/**
 * Fetch con caché: si los datos ya están en caché los devuelve,
 * si no, hace el fetch, los guarda y los devuelve.
 */
export async function fetchCached(key, url) {
  const cached = getCached(key);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status}`);
  const data = await res.json();
  setCached(key, data);
  return data;
}
