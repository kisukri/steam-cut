// worker. 'index': whole strip -> 1 shared palette -> idx -> cut panels
// 'encode': idx frames -> gif bytes
// shared pal = panels' colors match at the seams
import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.esm.js';

// alpha: quantize only solid px, last idx = transparent
// don't use gifenc oneBitAlpha, it made parts of the face see-through
function toIndex(full, w, h, step, colors, alpha) {
  if (!alpha) {
    const palette = quantize(subsample(full, w, h, step), colors);
    return { palette, index: applyPalette(full, palette) };
  }
  const smp = subsample(full, w, h, step, true);
  const palette = smp.length ? quantize(smp, colors - 1) : [[0, 0, 0]];
  const index = applyPalette(full, palette);
  const ti = palette.length;
  for (let i = 0, p = 3; i < index.length; i++, p += 4) if (full[p] < 128) index[i] = ti;
  palette.push([0, 0, 0, 0]);
  return { palette, index };
}

function subsample(full, w, h, step, opaqueOnly) {
  const out = new Uint8ClampedArray(Math.ceil(w / step) * Math.ceil(h / step) * 4);
  let o = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const s = (y * w + x) * 4;
      if (opaqueOnly && full[s + 3] < 128) continue;
      out[o++] = full[s];
      out[o++] = full[s + 1];
      out[o++] = full[s + 2];
      out[o++] = 255;
    }
  }
  return out.slice(0, o);
}

self.onmessage = (e) => {
  const d = e.data;
  try {
    if (d.type === 'index') {
      const full = new Uint8ClampedArray(d.rgba);
      const { palette, index } = toIndex(full, d.w, d.h, d.step, d.colors, d.alpha);
      const panels = d.panels.map((p) => {
        const out = new Uint8Array(p.w * d.h);
        for (let y = 0; y < d.h; y++) {
          const s = y * d.w + p.x;
          out.set(index.subarray(s, s + p.w), y * p.w);
        }
        return out;
      });
      self.postMessage({ id: d.id, palette, panels }, panels.map((p) => p.buffer));
      return;
    }
    if (d.type === 'estimate') {
      // gifenc writes full frames, so size ≈ frames × per-frame
      const full = new Uint8ClampedArray(d.rgba);
      const { palette, index } = toIndex(full, d.w, d.h, d.step, d.colors, d.alpha);
      const sizes = d.panels.map((p) => {
        const out = new Uint8Array(p.w * d.h);
        for (let y = 0; y < d.h; y++) out.set(index.subarray(y * d.w + p.x, y * d.w + p.x + p.w), y * p.w);
        const gif = GIFEncoder();
        gif.writeFrame(out, p.w, d.h, { palette, delay: 100 });
        gif.writeFrame(out, p.w, d.h, { palette, delay: 100 });
        gif.finish();
        return gif.bytes().length / 2;
      });
      self.postMessage({ id: d.id, sizes });
      return;
    }
    if (d.type === 'encode') {
      const gif = GIFEncoder();
      for (let i = 0; i < d.frames.length; i++) {
        const pal = d.palettes[i];
        const ti = d.alpha ? pal.findIndex((c) => c[3] === 0) : -1;
        gif.writeFrame(d.frames[i], d.width, d.height, {
          palette: pal,
          delay: d.delays[i],
          repeat: 0,
          transparent: ti >= 0,
          transparentIndex: ti >= 0 ? ti : 0,
          dispose: d.alpha ? 2 : -1,
        });
      }
      gif.finish();
      const bytes = gif.bytes();
      self.postMessage({ bytes }, [bytes.buffer]);
      return;
    }
    throw new Error('unknown task: ' + d.type);
  } catch (err) {
    self.postMessage({ id: d.id, error: String((err && err.message) || err) });
  }
};
