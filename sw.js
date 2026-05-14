// Service worker that:
//   1. Serves files from a loaded Flashpoint archive (Cache API, "flashpoint-v1").
//   2. Falls back to the Flashpoint legacy server for games without a zip.
//   3. Patches dead / CORS-blocked third-party SWF deps via the PATCHES table.
//   4. Broadcasts every cross-origin fetch event to page clients so the
//      in-app network console can show what Ruffle is requesting.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf', SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',    SCOPE).pathname;

const XLIFF_STUB = '<?xml version="1.0"?><xliff version="1.0"><file><body></body></file></xliff>';

const PATCHES = [
  { re: /\/games\/utilities\/flash_bios\/bios\.swf(?:[?#].*)?$/i,          target: STUB_BIOS,    via: 'stub:bios' },
  { re: /\/games\/gaming_system\/np\d+_include_v\d+\.swf(?:[?#].*)?$/i,    target: STUB_INCLUDE, via: 'stub:include' },
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i,           target: STUB_INCLUDE, via: 'stub:include' },
  { re: /\/transcontent\/gettranslationxml\.phtml(?:[?#].*)?$/i, xliff: true, via: 'stub:xliff' },
];

const CACHE_NAME   = 'flashpoint-v1';
// Special cache entry written by flashpoint.js when a legacy game is loaded.
const LEGACY_KEY   = 'https://flashpoint.internal/legacy-server';
const PROXY_BASE   = 'https://scratch-blnn7.sprites.app/cors-proxy/?url=';

const SCOPE_ORIGIN = new URL(SCOPE).origin;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const url    = request.url;
  const isCrossOrigin = new URL(url).origin !== SCOPE_ORIGIN;

  // 1. Flashpoint archive cache (populated from a zip; keys are lowercased).
  try {
    const cache    = await caches.open(CACHE_NAME);
    const urlLower = url.toLowerCase();
    const cached   = (await cache.match(urlLower))
      || (await cache.match(urlLower.replace(/^https:\/\//, 'http://')))
      || (await cache.match(urlLower.replace(/^http:\/\//, 'https://')));
    if (cached) {
      if (isCrossOrigin) broadcast({ url, via: 'archive', status: 200 });
      return cached;
    }
  } catch (_) {}

  // 2. Stub patches for dead / CORS-blocked third-party deps.
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      if (isCrossOrigin) broadcast({ url, via: p.via, status: 200 });
      if (p.xliff) {
        return new Response(XLIFF_STUB, {
          status: 200,
          headers: { 'Content-Type': 'text/xml', 'Content-Length': String(XLIFF_STUB.length) },
        });
      }
      return fetch(new URL(p.target, SCOPE).href, { cache: 'no-store' }).catch(() =>
        new Response(new Uint8Array(), { status: 502 }));
    }
  }

  // 3. Legacy-server fallback: for cross-origin requests when a legacy game is
  //    active (no zip). Mirrors every request as
  //    legacyServer/<hostname><pathname> through the CORS proxy, exactly as
  //    9o3o does. Covers level SWFs and other assets the archive doesn't have.
  if (isCrossOrigin) {
    try {
      const cache     = await caches.open(CACHE_NAME);
      const legacyRes = await cache.match(LEGACY_KEY);
      if (legacyRes) {
        const legacyBase = (await legacyRes.text()).replace(/\/$/, '');
        const reqUrl     = new URL(url);
        const legacyUrl  = legacyBase + '/' + reqUrl.hostname + reqUrl.pathname;
        const proxied    = PROXY_BASE + encodeURIComponent(legacyUrl);
        const res        = await fetch(proxied);
        broadcast({ url, via: 'legacy', status: res.status });
        if (res.ok) return res;
      }
    } catch (_) {}
  }

  // 4. Normal network pass-through.
  if (isCrossOrigin) broadcast({ url, via: 'network', status: null });
  return fetch(request);
}

// Notify all controlled page clients about a handled fetch (for the console).
function broadcast(data) {
  self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
    for (const c of clients) c.postMessage({ type: 'fp-fetch', ...data });
  });
}
