// Parse just enough of an SWF header to read the stage dimensions.
// The first three bytes are the signature: FWS (uncompressed), CWS (zlib),
// or ZWS (LZMA). After the 8-byte header the next bytes are the FrameSize
// RECT: a 5-bit nBits field followed by four signed nBits fields
// (Xmin, Xmax, Ymin, Ymax) in twips (1/20 px).

export async function readSwfDimensions(buf) {
  const all = new Uint8Array(buf);
  if (all.length < 9) return null;
  const sig = String.fromCharCode(all[0], all[1], all[2]);
  let body;
  if (sig === 'FWS') {
    body = all.subarray(8);
  } else if (sig === 'CWS') {
    try {
      const stream = new Blob([all.subarray(8)]).stream()
        .pipeThrough(new DecompressionStream('deflate'));
      body = await readAll(stream, 64); // 64 bytes is more than enough for the RECT
    } catch (_) {
      return null;
    }
  } else {
    // ZWS (LZMA) — not handled here. Fall back silently.
    return null;
  }
  return parseFrameSize(body);
}

async function readAll(stream, atLeast) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (total < atLeast) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try { reader.cancel(); } catch (_) {}
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function parseFrameSize(body) {
  if (body.length < 1) return null;
  const nBits = body[0] >>> 3;
  const totalBits = 5 + nBits * 4;
  const totalBytes = (totalBits + 7) >>> 3;
  if (body.length < totalBytes) return null;

  let bitPos = 5;
  const readSBits = (n) => {
    let value = 0;
    let signBit = 0;
    for (let i = 0; i < n; i++) {
      const pos = bitPos + i;
      const bit = (body[pos >>> 3] >>> (7 - (pos & 7))) & 1;
      if (i === 0) signBit = bit;
      value = (value << 1) | bit;
    }
    bitPos += n;
    if (signBit && n > 0) value -= (1 << n);
    return value;
  };

  const xmin = readSBits(nBits);
  const xmax = readSBits(nBits);
  const ymin = readSBits(nBits);
  const ymax = readSBits(nBits);
  const w = (xmax - xmin) / 20;
  const h = (ymax - ymin) / 20;
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}
