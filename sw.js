// Service worker that patches dead / CORS-blocked third-party SWF deps.
//
// Some old Flash games (e.g. Neopets pterattack, Dubloon Disaster)
// loadMovie() helpers from CDNs that either no longer respond, never sent
// CORS headers, or that we don't want to rely on at all. We unconditionally
// swap the request for a hand-built local stub SWF that satisfies the
// structural checks the game performs (byte-loaded gate, a
// _parent._parent.play() call, _level100.include.* helpers) without any
// cross-origin fetch.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf', SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',    SCOPE).pathname;

const PATCHES = [
  // Neopets "live bios" loader. Different games request this from different
  // hosts (swf.neopets.com, images.neopets.com, ...) — match on path only.
  { re: /\/games\/utilities\/flash_bios\/bios\.swf(?:[?#].*)?$/i, target: STUB_BIOS },
  // Include / high-score wrappers — same idea, host-agnostic.
  { re: /\/games\/gaming_system\/np\d+_include_v\d+\.swf(?:[?#].*)?$/i, target: STUB_INCLUDE },
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i,       target: STUB_INCLUDE },
];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      event.respondWith(
        fetch(p.target, { cache: 'no-store' }).catch(() =>
          new Response(new Uint8Array(), { status: 502 })),
      );
      return;
    }
  }
});
