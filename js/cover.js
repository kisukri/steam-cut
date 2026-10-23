// dig cover art out of music files (+ title/artist while we're there)
// mp3 = ID3v2 APIC/PIC, flac = PICTURE, m4a = moov/udta/meta/ilst/covr
// no libs on purpose, these formats are simple enough

const td = (enc) => new TextDecoder(enc);

function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49) return 'image/webp';
  return '';
}

/* id3 - v2.2/2.3/2.4 all slightly diff, ugh */
const synch = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function id3Text(data) {
  const enc = data[0];
  let body = data.subarray(1);
  let s;
  if (enc === 1 || enc === 2) s = td(enc === 2 ? 'utf-16be' : 'utf-16').decode(body);
  else s = td(enc === 3 ? 'utf-8' : 'latin1').decode(body);
  return s.replace(/\0+$/, '').split('\0')[0].trim();
}

// skip \0-terminated str. utf16 ends w/ \0\0 on even offset, got bitten by this
function skipStr(b, o, enc) {
  if (enc === 1 || enc === 2) {
    while (o + 1 < b.length && !(b[o] === 0 && b[o + 1] === 0)) o += 2;
    return o + 2;
  }
  while (o < b.length && b[o] !== 0) o++;
  return o + 1;
}

function parseId3(b) {
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
  const ver = b[3];
  const flags = b[5];
  const end = Math.min(b.length, 10 + synch(b, 6));
  let o = 10;
  if (flags & 0x40 && ver >= 3) o += ver === 4 ? synch(b, o) : be32(b, o) + 4; // ext hdr, v4 size is synchsafe
  const out = { pics: [] };
  const v22 = ver === 2;
  const hdr = v22 ? 6 : 10;
  while (o + hdr <= end) {
    const id = td('latin1').decode(b.subarray(o, o + (v22 ? 3 : 4)));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size = v22 ? (b[o + 3] << 16) | (b[o + 4] << 8) | b[o + 5] : ver === 4 ? synch(b, o + 4) : be32(b, o + 4);
    const data = b.subarray(o + hdr, o + hdr + size);
    o += hdr + size;
    if (!size) continue;
    if (id === 'TIT2' || id === 'TT2') out.title = id3Text(data);
    else if (id === 'TPE1' || id === 'TP1') out.artist = id3Text(data);
    else if (id === 'APIC' || id === 'PIC') {
      const enc = data[0];
      let p = 1;
      if (id === 'PIC') p += 3; // v2.2: 3 char fmt like JPG
      else p = skipStr(data, p, 0); // mime always latin1
      const type = data[p];
      p = skipStr(data, p + 1, enc);
      out.pics.push({ type, data: data.subarray(p) });
    }
  }
  return out;
}

/* flac */
function parseFlac(b) {
  if (b[0] !== 0x66 || b[1] !== 0x4c || b[2] !== 0x61 || b[3] !== 0x43) return null;
  const out = { pics: [] };
  let o = 4;
  for (;;) {
    if (o + 4 > b.length) break;
    const last = b[o] & 0x80;
    const type = b[o] & 0x7f;
    const len = (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
    const d = b.subarray(o + 4, o + 4 + len);
    if (type === 6) {
      const ptype = be32(d, 0);
      let p = 4;
      p += 4 + be32(d, p); // mime
      p += 4 + be32(d, p); // desc
      p += 16; // w h depth colors, don't need
      const n = be32(d, p);
      out.pics.push({ type: ptype, data: d.subarray(p + 4, p + 4 + n) });
    } else if (type === 4) {
      // vorbis comments are LE (!) unlike the rest
      const le = (q) => d[q] | (d[q + 1] << 8) | (d[q + 2] << 16) | (d[q + 3] << 24);
      let p = 4 + le(0);
      const cnt = le(p);
      p += 4;
      for (let i = 0; i < cnt && p < d.length; i++) {
        const l = le(p);
        const kv = td('utf-8').decode(d.subarray(p + 4, p + 4 + l));
        p += 4 + l;
        const k = kv.slice(0, kv.indexOf('=')).toUpperCase();
        const v = kv.slice(kv.indexOf('=') + 1);
        if (k === 'TITLE') out.title = v;
        else if (k === 'ARTIST') out.artist = v;
      }
    }
    o += 4 + len;
    if (last) break;
  }
  return out;
}

/* m4a */
function atoms(b, start, end, cb) {
  let o = start;
  while (o + 8 <= end) {
    let size = be32(b, o);
    const type = td('latin1').decode(b.subarray(o + 4, o + 8));
    let hdr = 8;
    if (size === 1) {
      size = be32(b, o + 12); // 64bit size, low word is fine, nobody has 4GB songs
      hdr = 16;
    } else if (size === 0) size = end - o;
    if (size < hdr) break;
    cb(type, o + hdr, o + size);
    o += size;
  }
}

function parseMp4(b) {
  if (td('latin1').decode(b.subarray(4, 8)) !== 'ftyp') return null;
  const out = { pics: [] };
  const dataOf = (s, e, fn) =>
    atoms(b, s, e, (t, ds, de) => {
      if (t === 'data') fn(b.subarray(ds + 8, de)); // skip type+locale
    });
  const walk = (s, e) =>
    atoms(b, s, e, (t, ds, de) => {
      if (t === 'moov' || t === 'udta' || t === 'ilst') walk(ds, de);
      else if (t === 'meta') walk(ds + 4, de); // meta is a full atom, +4
      else if (t === 'covr') dataOf(ds, de, (d) => out.pics.push({ type: 3, data: d }));
      else if (t === '©nam') dataOf(ds, de, (d) => (out.title = td('utf-8').decode(d)));
      else if (t === '©ART') dataOf(ds, de, (d) => (out.artist = td('utf-8').decode(d)));
    });
  walk(0, b.length);
  return out;
}

// -> { pics, title, artist }, null = no idea what this is
export async function readTags(file) {
  const b = new Uint8Array(await file.arrayBuffer());
  // some flac/wav have id3 glued in front, check what's after
  const id3 = parseId3(b);
  const rest = id3 ? b.subarray(Math.min(b.length, 10 + synch(b, 6))) : b;
  const more = parseFlac(rest) || parseMp4(rest);
  if (!id3 && !more) return null;
  return {
    pics: [...(id3 ? id3.pics : []), ...(more ? more.pics : [])],
    title: (id3 && id3.title) || (more && more.title) || '',
    artist: (id3 && id3.artist) || (more && more.artist) || '',
  };
}

// -> { blob, title, artist }. throws 'nocover' / 'format'
export async function extractCover(file) {
  const r = await readTags(file);
  if (!r) throw new Error('format');
  const pic = r.pics.find((p) => p.type === 3) || r.pics[0];
  if (!pic || !pic.data.length) throw new Error('nocover');
  const mime = sniff(pic.data);
  if (!mime) throw new Error('nocover');
  return { blob: new Blob([pic.data], { type: mime }), title: r.title || '', artist: r.artist || '' };
}
