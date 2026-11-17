// Caches map tiles as you view them (fast reloads, works with poor signal)
// and keeps a copy of the site itself for offline use.
const TILE_CACHE = "tiles-v1";
const SITE_CACHE = "site-v1";
const MAX_TILES = 1500;
const TILE_MAX_AGE = 7 * 24 * 3600 * 1000; // refresh tiles older than a week

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "tile.openstreetmap.org") e.respondWith(tile(req));
  else if (url.origin === location.origin) e.respondWith(site(req));
});

// Tiles: cache first, refresh in the background when older than a week
async function tile(req) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(req);
  const fetchAndStore = fetch(req).then(async (res) => {
    if (!res.ok) return res;
    const headers = new Headers(res.headers);
    headers.set("x-cached-at", String(Date.now()));
    const body = await res.blob();
    await cache.put(req, new Response(body, { status: res.status, headers }));
    trimTiles(cache);
    return new Response(body, { status: res.status, headers: res.headers });
  });
  if (hit) {
    const age = Date.now() - Number(hit.headers.get("x-cached-at") || 0);
    if (age > TILE_MAX_AGE) fetchAndStore.catch(() => {});
    return hit;
  }
  return fetchAndStore;
}

// Keep the tile cache to MAX_TILES entries (oldest first)
let trimming = false;
async function trimTiles(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    const extra = keys.slice(0, Math.max(0, keys.length - MAX_TILES));
    for (const k of extra) await cache.delete(k);
  } finally {
    trimming = false;
  }
}

// Site files: network first so updates show up, cached copy when offline
async function site(req) {
  const cache = await caches.open(SITE_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req, { ignoreSearch: true })) || Response.error();
  }
}
