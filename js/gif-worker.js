import { GIFEncoder, quantize, applyPalette } from '../vendor/gifenc.esm.js';

const GRAY_T = 14;
const luma = (r, g, b) => (r * 77 + g * 150 + b * 29 + 128) >> 8;

function buildPalette(smp, colors, alpha) {
  const room = colors - 1;
  const n = smp.length / 4;
  const odd = new Uint8ClampedArray(smp.length);
  let o = 0;
  for (let p = 0; p < smp.length; p += 4) {
    const r = smp[p];
    const g = smp[p + 1];
    const b = smp[p + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > GRAY_T) {
      odd[o++] = r;
      odd[o++] = g;
      odd[o++] = b;
      odd[o++] = 255;
    }
  }
  const frac = n ? o / 4 / n : 1;
  let palette;
  let gray = 0;
  if (n && frac < 0.02) {
    const extra = frac > 0.0005 ? quantize(odd.slice(0, o), Math.max(2, Math.min(48, room >> 2))) : [];
    gray = Math.max(2, room - extra.length);
    palette = [];
    for (let i = 0; i < gray; i++) {
      const v = Math.round((i * 255) / (gray - 1));
      palette.push([v, v, v]);
    }
    palette.push(...extra);
  } else {
    palette = n ? quantize(smp, room) : [[0, 0, 0]];
  }
  if (alpha) palette.push([0, 0, 0, 0]);
  return { palette, gray };
}

function grayIndex(full, palette, gray, alpha) {
  const solid = alpha ? palette.length - 1 : palette.length;
  const index = new Uint8Array(full.length / 4);
  const k = (gray - 1) / 255;
  const cache = new Map();
  for (let i = 0, p = 0; i < index.length; i++, p += 4) {
    if (alpha && full[p + 3] < 128) {
      index[i] = solid;
      continue;
    }
    const r = full[p];
    const g = full[p + 1];
    const b = full[p + 2];
    const gi = Math.round(luma(r, g, b) * k);
    if (solid === gray || Math.max(r, g, b) - Math.min(r, g, b) <= GRAY_T) {
      index[i] = gi;
      continue;
    }
    const key = (r << 16) | (g << 8) | b;
    let best = cache.get(key);
    if (best === undefined) {
      const gv = palette[gi][0];
      let bd = (r - gv) ** 2 + (g - gv) ** 2 + (b - gv) ** 2;
      best = gi;
      for (let j = gray; j < solid; j++) {
        const c = palette[j];
        const dd = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
        if (dd < bd) {
          bd = dd;
          best = j;
        }
      }
      cache.set(key, best);
    }
    index[i] = best;
  }
  return index;
}

function toIndex(full, w, h, step, colors, alpha, fixed, gray) {
  if (fixed && gray) return { palette: fixed, index: grayIndex(full, fixed, gray, alpha) };
  if (fixed) {
    const solid = alpha ? fixed.slice(0, -1) : fixed;
    const index = applyPalette(full, solid);
    if (alpha) for (let i = 0, p = 3; i < index.length; i++, p += 4) if (full[p] < 128) index[i] = solid.length;
    return { palette: fixed, index };
  }
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

function sameMask(frames, palettes) {
  const tiOf = (pal) => pal.findIndex((c) => c[3] === 0);
  const t0 = tiOf(palettes[0]);
  const f0 = frames[0];
  for (let i = 1; i < frames.length; i++) {
    const ti = tiOf(palettes[i]);
    const f = frames[i];
    for (let p = 0; p < f.length; p++) if ((f[p] === ti) !== (f0[p] === t0)) return false;
  }
  return true;
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
      const { palette, index } = toIndex(full, d.w, d.h, d.step, d.colors, d.alpha, d.palette, d.gray);
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
    if (d.type === 'palette') {
      self.postMessage({ id: d.id, ...buildPalette(new Uint8ClampedArray(d.samples), d.colors, d.alpha) });
      return;
    }
    if (d.type === 'estimate') {
      const full = new Uint8ClampedArray(d.rgba);
      let palette;
      let index;
      if (d.shared) {
        const bp = buildPalette(subsample(full, d.w, d.h, d.step, true), d.colors, d.alpha);
        ({ palette, index } = toIndex(full, d.w, d.h, d.step, d.colors, d.alpha, bp.palette, bp.gray));
      } else ({ palette, index } = toIndex(full, d.w, d.h, d.step, d.colors, d.alpha));
      const sizes = d.panels.map((p) => {
        const out = new Uint8Array(p.w * d.h);
        for (let y = 0; y < d.h; y++) out.set(index.subarray(y * d.w + p.x, y * d.w + p.x + p.w), y * p.w);
        const gif = GIFEncoder();
        gif.writeFrame(out, p.w, d.h, { palette, delay: 100 });
        gif.writeFrame(out, p.w, d.h, { palette: d.shared ? undefined : palette, delay: 100 });
        gif.finish();
        return gif.bytes().length / 2;
      });
      self.postMessage({ id: d.id, sizes });
      return;
    }
    if (d.type === 'encode') {
      const gif = GIFEncoder();
      let dispose = d.alpha ? 2 : -1;
      if (d.alpha && sameMask(d.frames, d.palettes)) dispose = 1;
      const base = d.palettes[0];
      const delta = d.shared && !d.alpha && base.length < 256;
      const keepIdx = base.length;
      const first = delta ? [...base, [0, 0, 0]] : base;
      const tol = d.tol || 0;
      let close = null;
      if (delta && tol > 0) {
        const n = base.length;
        close = new Uint8Array(n * n);
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            const x = base[a];
            const y = base[b];
            if (Math.abs(x[0] - y[0]) <= tol && Math.abs(x[1] - y[1]) <= tol && Math.abs(x[2] - y[2]) <= tol) close[a * n + b] = 1;
          }
        }
      }
      let shown = null;
      for (let i = 0; i < d.frames.length; i++) {
        const pal = d.palettes[i];
        const ti = d.alpha ? pal.findIndex((c) => c[3] === 0) : -1;
        let frame = d.frames[i];
        if (delta && i === 0) shown = frame.slice();
        else if (delta) {
          const out = new Uint8Array(frame.length);
          const n = base.length;
          for (let p = 0; p < frame.length; p++) {
            const a = frame[p];
            const b = shown[p];
            if (a === b || (close && close[a * n + b])) out[p] = keepIdx;
            else {
              out[p] = a;
              shown[p] = a;
            }
          }
          frame = out;
        }
        gif.writeFrame(frame, d.width, d.height, {
          palette: d.shared && i > 0 ? undefined : delta ? first : pal,
          delay: d.delays[i],
          repeat: 0,
          transparent: delta ? i > 0 : ti >= 0,
          transparentIndex: delta ? keepIdx : ti >= 0 ? ti : 0,
          dispose: delta ? 1 : dispose,
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
