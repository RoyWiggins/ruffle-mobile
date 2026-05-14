// Service worker that:
//   1. Serves files from a loaded Flashpoint archive (Cache API, "flashpoint-v1").
//   2. Patches dead / CORS-blocked third-party SWF deps via the PATCHES table.
//
// Flashpoint archives are loaded by src/flashpoint.js, which populates the
// "flashpoint-v1" cache with every file from the zip keyed by its
// reconstructed URL (both http:// and https://, lowercased).  The SW checks
// that cache first so the game's own HTTP requests are answered from the local
// archive rather than the network.
//
// Some old Flash games (e.g. Neopets pterattack, Dubloon Disaster)
// loadMovie() helpers from CDNs that either no longer respond, never sent
// CORS headers, or that we don't want to rely on at all.  We unconditionally
// swap the request for a hand-built local stub SWF.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf', SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',    SCOPE).pathname;

// Minimal valid XLIFF that makes np.lang.Translator.translate() succeed without
// setting any IDS_* variables. The game will use _level0.__resolve fallbacks.
const XLIFF_STUB = '<?xml version="1.0"?><xliff version="1.0"><file><body></body></file></xliff>';

const PATCHES = [
  // Neopets "live bios" loader. Different games request this from different
  // hosts (swf.neopets.com, images.neopets.com, ...) — match on path only.
  { re: /\/games\/utilities\/flash_bios\/bios\.swf(?:[?#].*)?$/i, target: STUB_BIOS },
  // Include / high-score wrappers — same idea, host-agnostic.
  { re: /\/games\/gaming_system\/np\d+_include_v\d+\.swf(?:[?#].*)?$/i, target: STUB_INCLUDE },
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i,        target: STUB_INCLUDE },
  // Dead translation endpoint. Return a minimal valid XLIFF so translation
  // "succeeds" and gameTranslationSuccess gets set via the event dispatch.
  { re: /\/transcontent\/gettranslationxml\.phtml(?:[?#].*)?$/i, xliff: true },
];

const FLASHPOINT_CACHE_NAME = 'flashpoint-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  event.respondWith(handleFetch(event.request));
});

async function handleFetch(request) {
  const url = request.url;

  // 1. Flashpoint archive cache (case-insensitive: all keys are lowercased).
  //    Check both http and https variants since Ruffle may use either.
  try {
    const cache = await caches.open(FLASHPOINT_CACHE_NAME);
    const urlLower = url.toLowerCase();
    const cached = (await cache.match(urlLower))
      || (await cache.match(urlLower.replace(/^https:\/\//, 'http://')))
      || (await cache.match(urlLower.replace(/^http:\/\//, 'https://')));
    if (cached) return cached;
  } catch (_) {}

  // 2. Stub patches for dead / CORS-blocked third-party deps.
  for (const p of PATCHES) {
    if (p.re.test(url)) {
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

  // 3. Normal network fetch.
  return fetch(request);
}
