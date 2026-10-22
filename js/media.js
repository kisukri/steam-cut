// all srcs: w, h, duration, animated, renderAt(t), iterate(s, e, fps)
import { parseGIF, decompressFrames } from '../vendor/gifuct.esm.js';
import { t } from './i18n.js';

export async function loadSource(file) {
  const type = file.type || '';
  const name = file.name.toLowerCase();
  if (type === 'image/gif' || name.endsWith('.gif')) {
    const src = new GifSource();
    await src.load(file);
    return src;
  }
  if (type.startsWith('video/') || /\.(mp4|webm|mov|m4v|mkv)$/.test(name)) {
    const src = new VideoSource();
    await src.load(file);
    return src;
  }
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|avif)$/.test(name)) {
    const src = new ImageSource();
    await src.load(file);
    return src;
  }
  throw new Error(t('err.unsupported'));
}

class VideoSource {
  constructor() {
    this.kind = 'video';
    this.animated = true;
  }

  async load(file) {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    this.url = URL.createObjectURL(file);
    v.src = this.url;
    // iphone hevc may hang / load audio only
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(t('err.video'))), 15000);
      v.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      v.onerror = () => {
        clearTimeout(timer);
        reject(new Error(t('err.video')));
      };
    });
    this.video = v;
    this.width = v.videoWidth;
    this.height = v.videoHeight;
    this.duration = v.duration;
    if (!this.width || !this.height) throw new Error(t('err.video'));
  }

  seek(t) {
    const v = this.video;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.removeEventListener('seeked', finish);
        resolve();
      };
      v.addEventListener('seeked', finish);
      setTimeout(finish, 4000); // seeked sometimes never fires
      // same t won't fire seeked
      v.currentTime = Math.abs(v.currentTime - t) < 1e-4 ? t + 1e-3 : t;
    });
  }

  async renderAt(t) {
    this.video.pause();
    await this.seek(Math.min(Math.max(0, t), this.duration - 0.001));
    return this.video;
  }

  async *iterate(start, end, fps) {
    this.video.pause();
    const step = 1 / fps;
    const n = Math.max(1, Math.round((end - start) * fps));
    for (let i = 0; i < n; i++) {
      const t = Math.min(start + i * step, this.duration - 0.001);
      await this.seek(t);
      yield { drawable: this.video, delay: 1000 / fps };
    }
  }

  dispose() {
    this.video.pause();
    URL.revokeObjectURL(this.url);
  }
}

class GifSource {
  constructor() {
    this.kind = 'gif';
    this.animated = true;
  }

  async load(file) {
    const buf = await file.arrayBuffer();
    let gif;
    try {
      gif = parseGIF(buf);
    } catch (e) {
      throw new Error(t('err.gif'));
    }
    const frames = decompressFrames(gif, true);
    if (!frames.length) throw new Error(t('err.gifEmpty'));
    this.width = gif.lsd.width;
    this.height = gif.lsd.height;
    this.frames = frames;
    // browsers treat <20ms as 100ms
    this.delays = frames.map((f) => (f.delay && f.delay >= 20 ? f.delay : 100));
    this.starts = [];
    let acc = 0;
    for (const d of this.delays) {
      this.starts.push(acc);
      acc += d;
    }
    this.duration = acc / 1000;
    this.animated = frames.length > 1;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.patch = document.createElement('canvas');
    this.patchCtx = this.patch.getContext('2d');
    this.reset();
  }

  reset() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.index = -1;
    this.saved = null;
  }

  step() {
    const prev = this.frames[this.index];
    if (prev) {
      if (prev.disposalType === 2) {
        const d = prev.dims;
        this.ctx.clearRect(d.left, d.top, d.width, d.height);
      } else if (prev.disposalType === 3 && this.saved) {
        this.ctx.putImageData(this.saved, 0, 0);
      }
    }
    this.index++;
    const f = this.frames[this.index];
    if (f.disposalType === 3) this.saved = this.ctx.getImageData(0, 0, this.width, this.height);
    const d = f.dims;
    if (this.patch.width !== d.width || this.patch.height !== d.height) {
      this.patch.width = d.width;
      this.patch.height = d.height;
    }
    this.patchCtx.putImageData(new ImageData(f.patch, d.width, d.height), 0, 0);
    this.ctx.drawImage(this.patch, d.left, d.top);
  }

  goTo(i) {
    i = Math.max(0, Math.min(this.frames.length - 1, i));
    if (i < this.index) this.reset();
    while (this.index < i) this.step();
    return this.canvas;
  }

  indexAt(t) {
    const ms = (t * 1000) % (this.duration * 1000 || 1);
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= ms) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  async renderAt(t) {
    return this.goTo(this.indexAt(t));
  }

  async *iterate(start, end, fps) {
    const startMs = start * 1000;
    const endMs = end * 1000;
    if (!fps) {
      for (let i = 0; i < this.frames.length; i++) {
        const s = this.starts[i];
        const e = s + this.delays[i];
        if (e <= startMs || s >= endMs) continue;
        const delay = Math.min(e, endMs) - Math.max(s, startMs);
        if (delay < 5) continue;
        this.goTo(i);
        yield { drawable: this.canvas, delay };
      }
      return;
    }
    const n = Math.max(1, Math.round((end - start) * fps));
    for (let k = 0; k < n; k++) {
      this.goTo(this.indexAt(start + k / fps));
      yield { drawable: this.canvas, delay: 1000 / fps };
    }
  }

  dispose() {}
}

class ImageSource {
  constructor() {
    this.kind = 'image';
    this.animated = false;
    this.duration = 0;
  }

  async load(file) {
    this.url = URL.createObjectURL(file);
    const img = new Image();
    img.src = this.url;
    try {
      await img.decode();
    } catch (e) {
      throw new Error(t('err.image'));
    }
    this.img = img;
    this.width = img.naturalWidth;
    this.height = img.naturalHeight;
  }

  async renderAt() {
    return this.img;
  }

  async *iterate() {
    yield { drawable: this.img, delay: 0 };
  }

  dispose() {
    URL.revokeObjectURL(this.url);
  }
}

/* demo */
export function drawDemo(ctx, w, h, time) {
  const p = (time % 4) / 4; // 4s loop
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b1026');
  g.addColorStop(0.55, '#1b1f4b');
  g.addColorStop(1, '#3a1d4f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 70; i++) {
    const x = ((i * 0.381966) % 1) * w;
    const y = (((i * 37) % 100) / 100) * h * 0.7;
    const tw = 0.5 + 0.5 * Math.sin(p * Math.PI * 4 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.6})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.globalCompositeOperation = 'lighter';
  const bands = [
    ['rgba(90,200,255,0.35)', 0.32, 0],
    ['rgba(140,110,255,0.32)', 0.42, 1.7],
    ['rgba(80,255,190,0.22)', 0.5, 3.1],
  ];
  for (const [color, base, off] of bands) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const y = h * base + Math.sin(x / w * Math.PI * 3 + p * Math.PI * 2 + off) * h * 0.06 + Math.sin(x / w * Math.PI * 7 - p * Math.PI * 4 + off) * h * 0.02;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, h * (base - 0.1), 0, h);
    bg.addColorStop(0, color);
    bg.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fill();
  }

  for (let i = 0; i < 24; i++) {
    const sp = (p + i / 24) % 1;
    const x = w * ((i * 0.618) % 1) + Math.sin(sp * Math.PI * 4 + i) * 12;
    const y = h * (1.05 - sp * 1.1);
    const r = 2 + (i % 4);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    glow.addColorStop(0, 'rgba(255,220,160,0.9)');
    glow.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = '#070914';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 10) {
    ctx.lineTo(x, h * 0.82 - Math.abs(Math.sin(x / w * Math.PI * 2.3)) * h * 0.12 - Math.sin(x / w * 17) * h * 0.012);
  }
  ctx.lineTo(w, h);
  ctx.fill();
}

export class DemoSource {
  constructor() {
    this.kind = 'demo';
    this.animated = true;
    this.width = 960;
    this.height = 960;
    this.duration = 4;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d');
  }

  async renderAt(time) {
    drawDemo(this.ctx, this.width, this.height, time);
    return this.canvas;
  }

  async *iterate(start, end, fps) {
    const n = Math.max(1, Math.round((end - start) * fps));
    for (let i = 0; i < n; i++) {
      drawDemo(this.ctx, this.width, this.height, start + i / fps);
      yield { drawable: this.canvas, delay: 1000 / fps };
    }
  }

  dispose() {}
}
