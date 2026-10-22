// index: strip -> shared pal -> idx -> panels
// encode: idx frames -> gif
import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.esm.js';

function subsample(full, w, h, step) {
  const out = new Uint8ClampedArray(Math.ceil(w / step) * Math.ceil(h / step) * 4);
  let o = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const s = (y * w + x) * 4;
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
      const palette = quantize(subsample(full, d.w, d.h, d.step), d.colors);
      const index = applyPalette(full, palette);
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
      // gifenc writes full frames, so size ~ frame count
      const full = new Uint8ClampedArray(d.rgba);
      const palette = quantize(subsample(full, d.w, d.h, d.step), d.colors);
      const index = applyPalette(full, palette);
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
        gif.writeFrame(d.frames[i], d.width, d.height, { palette: d.palettes[i], delay: d.delays[i], repeat: 0 });
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
