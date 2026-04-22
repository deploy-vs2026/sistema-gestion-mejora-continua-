/**
 * Caché en memoria para datos del backend.
 * Los datos persisten mientras el tab está abierto (se pierden al refrescar F5).
 * Evita re-fetchear al navegar entre páginas.
 */

const _cache = {};
const _ts    = {};

const TTL_MS = 5 * 60 * 1000; // 5 minutos

export function getCached(key) {
  if (!_cache[key]) return null;
  if (Date.now() - _ts[key] > TTL_MS) {
    delete _cache[key];
    return null;
  }
  return _cache[key];
}

export function setCached(key, data) {
  _cache[key] = data;
  _ts[key]    = Date.now();
}

export function invalidate(key) {
  delete _cache[key];
  delete _ts[key];
}

export function invalidateAll() {
  Object.keys(_cache).forEach(k => { delete _cache[k]; delete _ts[k]; });
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
