// Flashpoint archive (.zip) loader.
//
// Flashpoint game zips contain:
//   content.json            — metadata; may include a launchCommand URL
//   content/<host>/<path>   — game files whose paths mirror their HTTP URLs
//
// We extract every file under content/, store them in the Cache API keyed by
// their reconstructed URL (both http:// and https://, lowercased), then tell
// the service worker to serve from that cache before falling back to stubs or
// the network. The launch SWF is determined by launchCommand (if present) or
// by picking the largest .swf in the archive.

export const FLASHPOINT_CACHE_NAME = 'flashpoint-v1';

// Returns true when the file looks like a Flashpoint zip archive.
export function isFlashpointZip(file) {
  return file.name.toLowerCase().endsWith('.zip')
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed';
}

// Parses a Flashpoint archive, populates the Cache API, and returns the SWF
// to load.
//
// Returns { launchUrl: string, launchData: Uint8Array }
// launchUrl — the original game URL (e.g. 'http://host/path/game.swf')
export async function loadFlashpointArchive(file) {
  const buf = await file.arrayBuffer();
  const entries = await readZip(buf);

  // Optional launchCommand in content.json
  let launchCommand = null;
  const metaBytes = entries.get('content.json');
  if (metaBytes) {
    try {
      const meta = JSON.parse(new TextDecoder().decode(metaBytes));
      if (typeof meta.launchCommand === 'string' && meta.launchCommand.trim()) {
        launchCommand = meta.launchCommand.trim();
      }
    } catch (_) {}
  }

  const cache = await caches.open(FLASHPOINT_CACHE_NAME);
  // Clear any previously loaded archive.
  for (const req of await cache.keys()) await cache.delete(req);

  const swfs = []; // { url: string, data: Uint8Array, size: number }

  for (const [path, data] of entries) {
    if (!path.startsWith('content/')) continue;
    const urlPath = path.slice('content/'.length); // "<host>/<path>"
    if (!urlPath || urlPath.endsWith('/')) continue;

    // Store under both schemes, both lowercased, so the SW can find entries
    // regardless of which scheme Ruffle uses or the browser upgrades to.
    const httpUrl  = ('http://'  + urlPath).toLowerCase();
    const httpsUrl = ('https://' + urlPath).toLowerCase();
    const mime = guessMime(path);

    await cache.put(httpUrl,  makeResponse(data, mime));
    await cache.put(httpsUrl, makeResponse(data, mime));

    if (path.toLowerCase().endsWith('.swf')) {
      swfs.push({ url: httpUrl, data, size: data.length });
    }
  }

  if (swfs.length === 0) throw new Error('No SWF files found in archive');

  // Pick launch SWF.
  let launch;
  if (launchCommand) {
    const lcLower = launchCommand.toLowerCase();
    launch = swfs.find(s => s.url === lcLower
      || s.url === lcLower.replace(/^https?:\/\//, 'http://')
      || s.url === lcLower.replace(/^https?:\/\//, 'https://'));
  }
  if (!launch) {
    // Largest SWF is most likely the main game file.
    launch = swfs.slice().sort((a, b) => b.size - a.size)[0];
  }

  return { launchUrl: launch.url, launchData: launch.data };
}

// Removes all entries from the flashpoint cache (call when closing a game).
export async function clearFlashpointCache() {
  try {
    const cache = await caches.open(FLASHPOINT_CACHE_NAME);
    for (const req of await cache.keys()) await cache.delete(req);
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function makeResponse(data, mime) {
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
    },
  });
}

function guessMime(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ({
    swf:  'application/x-shockwave-flash',
    xml:  'text/xml',
    json: 'application/json',
    js:   'application/javascript',
    html: 'text/html',
    htm:  'text/html',
    css:  'text/css',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    txt:  'text/plain',
  })[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Minimal ZIP reader
// Supports stored (method=0) and deflated (method=8) entries.
// Reads the central directory for reliable entry enumeration.
// ---------------------------------------------------------------------------

async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view  = new DataView(buffer);

  // Locate End of Central Directory record (signature 0x06054b50).
  // It's at least 22 bytes; search backwards to skip any trailing comment.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file');

  const numEntries = view.getUint16(eocd + 10, true);
  const cdOffset   = view.getUint32(eocd + 16, true);

  const dec   = new TextDecoder();
  const files = new Map();
  let pos = cdOffset;

  for (let i = 0; i < numEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break; // central dir signature

    const method      = view.getUint16(pos + 10, true);
    const compSize    = view.getUint32(pos + 20, true);
    const uncompSize  = view.getUint32(pos + 24, true);
    const nameLen     = view.getUint16(pos + 28, true);
    const extraLen    = view.getUint16(pos + 30, true);
    const commentLen  = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name        = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

    pos += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue; // directory entry

    // Local file header: skip to compressed data.
    const lhNameLen  = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart  = localOffset + 30 + lhNameLen + lhExtraLen;
    const compData   = bytes.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compData.slice(); // stored — copy to own buffer
    } else if (method === 8) {
      data = await inflate(compData, uncompSize);
    } else {
      continue; // unsupported compression method
    }

    files.set(name, data);
  }

  return files;
}

async function inflate(compData, expectedSize) {
  const stream = new Blob([compData]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
