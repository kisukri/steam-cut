// change the last byte so steam doesn't shrink/recompress it
// gif: 0x3B -> 0x21
// png: IEND len -> 1, add 1 byte
// everyone does this, steam hasn't broken it (yet)

export function hexifyGif(bytes) {
  const out = bytes.slice();
  if (out.length && out[out.length - 1] === 0x3b) out[out.length - 1] = 0x21;
  return out;
}

const IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

export function hexifyPng(bytes) {
  const n = bytes.length;
  const tail = bytes.subarray(n - 12);
  const isStdEnd = IEND.every((b, i) => tail[i] === b);
  if (!isStdEnd) return bytes.slice();
  const out = new Uint8Array(n + 1);
  out.set(bytes);
  out.set([0x01, 0x49, 0x45, 0x4e, 0x44, 0x00, 0xd1, 0x1a, 0x4f, 0xe1], n - 9);
  return out;
}
