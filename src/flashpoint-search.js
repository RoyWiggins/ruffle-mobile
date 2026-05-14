// Flashpoint search and download via the CORS proxy.
//
// Flow:
//   searchGames(q, page) → { results: [{id, title, logoUrl}], total }
//   getGameInfo(id)       → { zipUrl, launchCommand }
//   downloadZip(url, onProgress, signal) → ArrayBuffer

const PROXY      = 'https://scratch-blnn7.sprites.app/cors-proxy/?url=';
const BROWSE_BASE = 'https://ooooooooo.ooo';

function proxied(url) {
  return PROXY + encodeURIComponent(url);
}

export async function searchGames(query, page = 1) {
  const url = `${BROWSE_BASE}/browse?query=${encodeURIComponent(query)}&page=${page}`;
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return parseSearchPage(await res.text());
}

function parseSearchPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results = [];
  for (const el of doc.querySelectorAll('div.result')) {
    const a = el.querySelector('a.title');
    if (!a) continue;
    const m = (a.getAttribute('href') || '').match(/[?&]id=([^&]+)/);
    if (!m) continue;
    results.push({
      id:      m[1],
      title:   a.textContent.trim(),
      logoUrl: el.dataset.logo || null,
    });
  }
  const totalText = doc.querySelector('.total')?.textContent || '';
  const total = parseInt(totalText.match(/\d+/)?.[0] || '0', 10);
  return { results, total };
}

export async function getGameInfo(id) {
  const url = `${BROWSE_BASE}/?id=${encodeURIComponent(id)}`;
  const res = await fetch(proxied(url));
  if (!res.ok) throw new Error(`Failed to load game (${res.status})`);
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
  const c = doc.querySelector('.player-container');
  if (!c) throw new Error('Game data not found');
  return {
    zipUrl:        c.dataset.gameZip      || null,
    launchCommand: c.dataset.launchCommand || null,
    legacyServer:  c.dataset.legacyServer  || null,
  };
}

// Download a zip through the proxy, reporting progress via onProgress(0..1).
// Passing an AbortSignal lets the caller cancel mid-download.
export async function downloadZip(zipUrl, onProgress, signal) {
  const res = await fetch(proxied(zipUrl), { signal });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get('content-length')) || 0;

  // No body stream or no content-length — fall back to a single read.
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onProgress?.(1);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received / total);
  }

  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}
