// Service worker that patches dead / CORS-blocked third-party SWF deps.
//
// Some old Flash games (e.g. Neopets pterattack) loadMovie() helpers from
// CDNs that either no longer respond or never sent CORS headers — both
// fatal when the game runs on a third-party origin in Ruffle.
//
// For each patched URL we *try the real upstream first* — many of the
// dependencies are still served correctly with CORS — and only fall back
// to a local stub when the upstream fails. The stubs are hand-built SWFs
// that satisfy the structural checks the host game performs (byte-loaded
// gate, a _parent._parent.play() call, etc.) so no cross-origin fetch is
// actually needed when we end up using them.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf', SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',    SCOPE).pathname;

const PATCHES = [
  // Neopets "live bios" loader. swf.neopets.com still returns 200 but
  // without CORS headers — Ruffle's fetch fails. images.neopets.com serves
  // the same file with CORS, so we passthrough there.
  { re: /\/games\/utilities\/flash_bios\/bios\.swf(?:[?#].*)?$/i, target: STUB_BIOS },
  // High-score / include wrappers. Some hosts 503 these; images.neopets.com
  // still serves them. Try real first.
  { re: /\/games\/gaming_system\/np6_include_v1\.swf(?:[?#].*)?$/i, target: STUB_INCLUDE },
  { re: /\/games\/high_scores\/include_movie\.swf(?:[?#].*)?$/i,    target: STUB_INCLUDE },
];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function tryReal(request) {
  // Re-issue the original request from SW context. If upstream replies with
  // a 2xx (and CORS is OK enough for Ruffle to read it later), use it.
  const res = await fetch(request);
  if (!res.ok) throw new Error('upstream ' + res.status);
  return res;
}

async function serveStub(target) {
  try {
    return await fetch(target, { cache: 'no-store' });
  } catch {
    return new Response(new Uint8Array(), { status: 502 });
  }
}

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      event.respondWith(tryReal(event.request).catch(() => serveStub(p.target)));
      return;
    }
  }
});
