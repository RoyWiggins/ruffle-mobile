// Service worker that patches dead / CORS-blocked third-party SWF deps.
//
// Some old Flash games (e.g. Neopets pterattack) loadMovie() helpers from
// CDNs that either no longer respond or never sent CORS headers — both
// fatal when the game runs on a third-party origin in Ruffle.
//
// We serve hand-built local stub SWFs that satisfy the structural checks
// the game performs (byte-loaded gate, a _parent._parent.play() call) so
// no actual cross-origin fetch is needed.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf', SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',    SCOPE).pathname;

const PATCHES = [
  // Neopets "live bios" loader. Real bios.swf still returns 200 from
  // swf.neopets.com but lacks CORS headers — Ruffle's fetch fails. Our 71-
  // byte stub just runs `_parent._parent.play()` on frame 1, which is the
  // only action the real bios's finishBios() ultimately takes.
  { re: /\/\/swf\.neopets\.com\/games\/utilities\/flash_bios\/bios\.swf/i, target: STUB_BIOS },
  // High-score / include wrappers — both endpoints now 503. Serve the
  // 28-byte include stub so the byte-count load gate passes.
  { re: /\/games\/gaming_system\/np6_include_v1\.swf(?:[?#].*)?$/i, target: STUB_INCLUDE },
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i,    target: STUB_INCLUDE },
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
