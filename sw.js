// Service worker that:
//   1. Serves files from a loaded Flashpoint archive (Cache API, "flashpoint-v1").
//   2. Falls back to the Flashpoint legacy server for games without a zip.
//   3. Patches dead / CORS-blocked third-party SWF deps via the PATCHES table.
//   4. Broadcasts every handled fetch event to page clients so the
//      in-app network console can show what Ruffle is requesting.

const SCOPE = self.registration.scope;
const STUB_INCLUDE = new URL('demos/neopets-include-stub.swf',         SCOPE).pathname;
const STUB_BIOS    = new URL('demos/neopets-bios-stub.swf',            SCOPE).pathname;
const STUB_NP9_GS  = new URL('demos/neopets-gaming-system-stub.swf',   SCOPE).pathname;


// Flash's XMLDocument stores <?xml?> in xmlDecl and <!DOCTYPE> in docTypeDecl —
// neither appears in childNodes. The \n between each declaration and <xliff>
// creates the text nodes NP9_Translator.completeHandler navigates by index:
//   doc[0] = "\n"     (between xmlDecl and DOCTYPE)
//   doc[1] = "\n"     (between DOCTYPE and <xliff>)
//   doc[2] = xliff    ← _loc3_  ✓
//   xliff[0]="\n "    xliff[1]=file           ← _loc4_  ✓
//   file[0]="\n  "    file[1]=header
//   file[2]="\n  "    file[3]=body            ← _loc5_  ✓
const XLIFF_STUB = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xliff PUBLIC "-//XLIFF//DTD XLIFF//EN" "http://www.oasis-open.org/committees/xliff/documents/xliff.dtd">\n<xliff version="1.0" xml:lang="en">\n <file datatype="plaintext" original="0" source-language="EN">\n  <header></header>\n  <body>\n  </body>\n </file>\n</xliff>';

const PATCHES = [
  { re: /\/games\/utilities\/flash_bios\/bios\.swf(?:[?#].*)?$/i,          target: STUB_BIOS,    via: 'stub:bios' },
  { re: /\/games\/gaming_system\/np\d+_gaming_system_v\d+\.swf(?:[?#].*)?$/i, target: STUB_NP9_GS,  via: 'stub:gaming-system' },
  { re: /\/games\/gaming_system\/np\d+_include_v\d+\.swf(?:[?#].*)?$/i,      target: STUB_INCLUDE, via: 'stub:include' },
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
      broadcast({ url, via: 'archive', status: 200 });
      // Re-wrap to guarantee CORS headers are present (old cache entries may
      // have been stored before CORS headers were added to makeResponse).
      const h = new Headers(cached.headers);
      h.set('Access-Control-Allow-Origin', '*');
      h.set('Access-Control-Allow-Methods', 'GET, HEAD');
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  } catch (_) {}

  // 2. Legacy-server fallback: for cross-origin requests when a legacy game is
  //    active (no zip). Try this BEFORE stubs so the real game file is served
  //    when the legacy server has it (e.g. include SWFs that would otherwise
  //    be replaced by a minimal stub that the game depends on for callbacks).
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
        // Skip HTML responses: the proxy or legacy server returned an error page
        // with 200 status (catch-all route). Falling through lets the real CDN
        // serve the file, which is critical for Ruffle WASM chunk requests.
        const ct = res.headers.get('Content-Type') || '';
        if (res.ok && !ct.startsWith('text/html')) {
          // Re-wrap headers so Ruffle can always read the body regardless of
          // whether the proxy forwarded CORS headers from the origin server.
          const headers = new Headers(res.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
          return new Response(res.body, { status: res.status, headers });
        }
      }
    } catch (_) {}
  }

  // 3. Neopets numbered-CDN fallback: images1..imagesNN.neopets.com are load-
  //    balanced nodes that time out when offline. Re-fetch from images.neopets.com
  //    via the CORS proxy, which is reachable and serves the same files.
  if (isCrossOrigin) {
    const reqUrl = new URL(url);
    if (/^images\d+\.neopets\.com$/i.test(reqUrl.hostname)) {
      try {
        const fallback = url.replace(reqUrl.hostname, 'images.neopets.com');
        const proxied  = PROXY_BASE + encodeURIComponent(fallback);
        const res      = await fetch(proxied);
        const ct       = res.headers.get('Content-Type') || '';
        if (res.ok && !ct.startsWith('text/html')) {
          broadcast({ url, via: 'cdn-fallback', status: res.status });
          const headers = new Headers(res.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          headers.set('Access-Control-Allow-Methods', 'GET, HEAD');
          return new Response(res.body, { status: res.status, headers });
        }
      } catch (_) {}
    }
  }

  // 4. Stub patches for dead / CORS-blocked third-party deps (fallback when
  //    the legacy server doesn't have the file).
  for (const p of PATCHES) {
    if (p.re.test(url)) {
      broadcast({ url, via: p.via, status: 200 });
      if (p.xliff) {
        return new Response(XLIFF_STUB, {
          status: 200,
          headers: {
            'Content-Type': 'text/xml',
            'Content-Length': String(XLIFF_STUB.length),
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
      // Fetch the stub SWF from our own origin and re-wrap with CORS headers
      // so cross-origin mode: 'cors' requests (from Ruffle) accept the response.
      try {
        const r = await fetch(new URL(p.target, SCOPE).href, { cache: 'no-store' });
        if (r.ok) {
          return new Response(await r.arrayBuffer(), {
            status: 200,
            headers: {
              'Content-Type': r.headers.get('Content-Type') || 'application/x-shockwave-flash',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      } catch (_) {}
      return new Response(new Uint8Array(), {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  // 4. Normal network pass-through for cross-origin requests.
  //    Re-wrap with CORS headers when missing so Ruffle can read responses
  //    from game servers that don't set Access-Control-Allow-Origin
  //    (e.g. swf.neopets.com returning bios.swf with status 200, no CORS).
  if (isCrossOrigin) {
    broadcast({ url, via: 'network', status: null });
    try {
      const resp = await fetch(request);
      // Opaque (no-cors) responses have status 0 and inaccessible body/headers;
      // new Response(..., { status: 0 }) throws a RangeError, so pass them through.
      if (resp.type === 'opaque') return resp;
      if (!resp.headers.has('Access-Control-Allow-Origin')) {
        const h = new Headers(resp.headers);
        h.set('Access-Control-Allow-Origin', '*');
        h.set('Access-Control-Allow-Methods', 'GET, HEAD');
        return new Response(resp.body, { status: resp.status, headers: h });
      }
      return resp;
    } catch (_) {
      return new Response('', { status: 502 });
    }
  }

  // 5. Same-origin pass-through. Broadcast failures on game-like extensions so
  //    the console reveals assets the game tried to load from the wrong base URL
  //    (e.g. relative loadMovie paths when no base was set on player.load).
  const sameResp = await fetch(request).catch(() => null);
  if (!sameResp || !sameResp.ok) {
    const ext = new URL(url).pathname.split('.').pop().toLowerCase();
    if (/^(swf|mp3|xml|flv|jpg|jpeg|png|gif|json|csv|txt)$/.test(ext)) {
      broadcast({ url, via: 'miss', status: sameResp ? sameResp.status : null });
    }
  }
  return sameResp || new Response('', { status: 502 });
}

// Notify all controlled page clients about a handled fetch (for the console).
function broadcast(data) {
  self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
    for (const c of clients) c.postMessage({ type: 'fp-fetch', ...data });
  });
}
