// Service worker that patches dead third-party SWF dependencies.
//
// Some old Flash games (e.g. Neopets pterattack) loadMovie() helpers from
// CDNs that have since gone dark. The game's main timeline stays stop()'d
// waiting forever for an asset that 503s, leaving a black screen.
//
// Intercept those specific URLs and serve a tiny local stub SWF — the byte
// count comparison in the game's "is the dependency loaded" check then
// passes immediately and the main timeline advances.

const STUB_PATH = new URL('demos/neopets-include-stub.swf', self.registration.scope).pathname;

const PATCHES = [
  // Neopets games — Flash bios's high-score include_movie wrapper
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i, target: STUB_PATH },
];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      event.respondWith(
        fetch(p.target, { cache: 'force-cache' }).catch(() =>
          new Response(new Uint8Array(), { status: 502 })),
      );
      return;
    }
  }
});
