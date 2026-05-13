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

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      if (p.xliff) {
        event.respondWith(Promise.resolve(new Response(XLIFF_STUB, {
          status: 200,
          headers: { 'Content-Type': 'text/xml', 'Content-Length': String(XLIFF_STUB.length) },
        })));
      } else {
        event.respondWith(
          fetch(p.target, { cache: 'no-store' }).catch(() =>
            new Response(new Uint8Array(), { status: 502 })),
        );
      }
      return;
    }
  }
});
