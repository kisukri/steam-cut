// flow: grab frames -> idx in worker -> gif, shrink till under the limit (5MB, guide 2MB) -> hexify
// keep frames as 1 byte/px idx not rgba, 4x less mem. long vids blew up before
import { hexifyGif, hexifyPng } from './hexify.js';
import { t } from './i18n.js';

export const STEAM_LIMIT = 5 * 1024 * 1024;
// guide img caps at 2MB on steam. stay a bit under in case they mean 2,000,000
export const GUIDE_LIMIT = 2000000;
export const sizeLimit = (key) => (key === 'guide' ? GUIDE_LIMIT : STEAM_LIMIT);
export const limitMB = (key) => (key === 'guide' ? 2 : 5);
const MEMORY_BUDGET = 700 * 1024 * 1024;
const SAMPLE_PIXELS = 20000;
const POOL = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

export function frameCap(geo) {
  return Math.max(100, Math.min(3000, Math.floor(MEMORY_BUDGET / (geo.stripW * geo.stripH))));
}

const WORKER_URL = new URL('./gif-worker.js', import.meta.url);

function makeWorker() {
  return new Worker(WORKER_URL, { type: 'module' });
}

function runOnce(msg, transfer = []) {
  return new Promise((resolve, reject) => {
    const w = makeWorker();
    w.onmessage = (e) => {
      w.terminate();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data);
    };
    w.onerror = (e) => {
      w.terminate();
      reject(new Error(e.message || t('err.worker')));
    };
    w.postMessage(msg, transfer);
  });
}

class IndexPool {
  constructor(n) {
    this.workers = [];
    this.pending = new Map();
    this.next = 0;
    this.seq = 0;
    for (let i = 0; i < n; i++) {
      const w = makeWorker();
      w.onmessage = (e) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data);
      };
      w.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || t('err.worker')));
        this.pending.clear();
      };
      this.workers.push(w);
    }
  }
  run(msg, transfer) {
    const id = ++this.seq;
    const w = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ ...msg, id }, transfer);
    });
  }
  get inflight() {
    return this.pending.size;
  }
  close() {
    this.workers.forEach((w) => w.terminate());
  }
}

function defaultPaint(crop, bg) {
  return (ctx, w, h, drawable) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(drawable, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  };
}

// guide disc passes its own frames/paint, everyone else uses plain crop
export async function captureFrames(source, { crop, geo, start, end, fps, bg, colors, maxFrames, onProgress, isCancelled, frames, paint, expected: exp, alpha = false }) {
  const w = geo.stripW;
  const h = geo.stripH;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const step = Math.max(1, Math.round(Math.sqrt((w * h) / SAMPLE_PIXELS)));
  const expected = Math.min(maxFrames, exp || (source.animated ? estimateFrames(source, start, end, fps) : 1));
  const draw = paint || defaultPaint(crop, bg);
  const panelGeo = geo.panels.map((p) => ({ x: p.x, w: p.w }));
  const pool = new IndexPool(POOL);
  const jobs = [];
  const live = new Set();
  const delays = [];
  let done = 0;

  try {
    for await (const f of frames || source.iterate(start, end, fps)) {
      if (isCancelled && isCancelled()) throw new Error(t('st.cancelled'));
      const { drawable, delay } = f;
      draw(ctx, w, h, drawable, f);
      const rgba = ctx.getImageData(0, 0, w, h).data.buffer;
      const job = pool.run({ type: 'index', rgba, w, h, step, colors, alpha, panels: panelGeo }, [rgba]).then((r) => {
        done++;
        if (onProgress) onProgress(done, expected);
        return r;
      });
      jobs.push(job);
      live.add(job);
      job.then(() => live.delete(job), () => live.delete(job));
      delays.push(delay);
      // don't queue too many or mem spikes
      while (live.size > POOL * 3) await Promise.race(live);
      if (delays.length >= maxFrames) break;
    }
    const results = await Promise.all(jobs);
    return {
      panels: geo.panels.map((_, i) => results.map((r) => r.panels[i])),
      palettes: results.map((r) => r.palette),
      delays,
      widths: geo.panels.map((p) => p.w),
      height: h,
      alpha,
    };
  } finally {
    pool.close();
  }
}

function estimateFrames(source, start, end, fps) {
  if (fps) return Math.max(1, Math.round((end - start) * fps));
  if (source.kind === 'gif') {
    let n = 0;
    for (let i = 0; i < source.starts.length; i++) {
      const s = source.starts[i];
      if (s + source.delays[i] > start * 1000 && s < end * 1000) n++;
    }
    return Math.max(1, n);
  }
  return 1;
}

// drop frames evenly, total time stays the same
function pickFrames(delays, keep) {
  const n = delays.length;
  if (keep >= n) return { idx: delays.map((_, i) => i), delays: delays.slice() };
  const idx = [];
  for (let j = 0; j < keep; j++) idx.push(Math.floor((j * n) / keep));
  const merged = idx.map((s, j) => {
    const stop = j + 1 < idx.length ? idx[j + 1] : n;
    let sum = 0;
    for (let k = s; k < stop; k++) sum += delays[k];
    return sum;
  });
  return { idx, delays: merged };
}

// gif delay is in 1/100s. carry the leftover or it drifts
function toCentiseconds(delays) {
  let acc = 0;
  let used = 0;
  return delays.map((d) => {
    acc += d;
    const target = Math.round(acc / 10) * 10;
    const r = Math.max(20, target - used);
    used += r;
    return r;
  });
}

async function encodeGifs(cap, keep) {
  const { idx, delays } = pickFrames(cap.delays, keep);
  const cs = toCentiseconds(delays);
  const pals = idx.map((i) => cap.palettes[i]);
  const results = await Promise.all(
    cap.panels.map((frames, p) =>
      runOnce({ type: 'encode', frames: idx.map((i) => frames[i]), palettes: pals, delays: cs, width: cap.widths[p], height: cap.height, alpha: cap.alpha })
    )
  );
  return { files: results.map((r) => r.bytes), frameCount: idx.length };
}

export async function exportAnimated(cap, { autoFit, hexify, onStatus, limit = STEAM_LIMIT, mb = 5 }) {
  let keep = cap.delays.length;
  let out;
  for (let attempt = 0; attempt < 6; attempt++) {
    onStatus(attempt === 0 ? t('st.encode', { n: cap.panels.length, f: keep }) : t('st.reencode', { f: keep, mb }));
    out = await encodeGifs(cap, keep);
    const max = Math.max(...out.files.map((f) => f.length));
    if (!autoFit || max <= limit || keep <= 2) break;
    keep = Math.max(2, Math.floor(keep * (limit / max) * 0.92));
  }
  const files = out.files.map((b) => (hexify ? hexifyGif(b) : b));
  return { files, ext: 'gif', mime: 'image/gif', frameCount: out.frameCount, originalFrames: cap.delays.length };
}

export async function exportStatic(source, { crop, geo, bg, hexify }) {
  const c = document.createElement('canvas');
  c.width = geo.stripW;
  c.height = geo.stripH;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(await source.renderAt(0), crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
  const files = [];
  for (const p of geo.panels) {
    const pc = document.createElement('canvas');
    pc.width = p.w;
    pc.height = geo.stripH;
    pc.getContext('2d').drawImage(c, p.x, 0, p.w, geo.stripH, 0, 0, p.w, geo.stripH);
    const blob = await new Promise((r) => pc.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    files.push(hexify ? hexifyPng(bytes) : bytes);
  }
  return { files, ext: 'png', mime: 'image/png', frameCount: 1, originalFrames: 1 };
}

// rough est: encode 1 frame, take the biggest panel
// spinning disc: 0deg compresses way better than the real rotated (blurry) frames,
// so sample a couple of odd angles and take the worst
export async function estimateFrameBytes(drawable, { crop, geo, bg, colors, paint, alpha = false, angles = [0] }) {
  const w = geo.stripW;
  const h = geo.stripH;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  const step = Math.max(1, Math.round(Math.sqrt((w * h) / SAMPLE_PIXELS)));
  let worst = 0;
  for (const angle of angles) {
    ctx.clearRect(0, 0, w, h);
    (paint || defaultPaint(crop, bg))(ctx, w, h, drawable, { angle });
    const rgba = ctx.getImageData(0, 0, w, h).data.buffer;
    const { sizes } = await runOnce(
      { type: 'estimate', rgba, w, h, step, colors, alpha, panels: geo.panels.map((p) => ({ x: p.x, w: p.w })) },
      [rgba]
    );
    worst = Math.max(worst, ...sizes);
  }
  return worst;
}
