// Favorites persistence layer.
// Games are stored by their Flashpoint UUID with title and logo URL.

const KEY = 'fcp:favorites';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

function save(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
}

let _store = load();

export function isFavorite(id) { return id in _store; }

export function getFavoriteList() { return Object.values(_store); }

export function getFavoriteIds() { return new Set(Object.keys(_store)); }

export function toggleFavorite(id, info) {
  if (id in _store) delete _store[id];
  else _store[id] = { id, title: info?.title || '', logoUrl: info?.logoUrl || null };
  save(_store);
}
