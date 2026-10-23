// every src has: w, h, duration, animated, renderAt(t), iterate(s, e, fps)
import { parseGIF, decompressFrames } from '../vendor/gifuct.esm.js';
import { t } from './i18n.js';
const AUDIO_RE = /\.(mp3|flac|m4a|aac|mp4a|alac|ogg|opus|wav)$/i;

export async function loadSource(file) {
  const type = file.type || '';
  const name = file.name.toLowerCase();
  if (type.startsWith('audio/') || AUDIO_RE.test(name)) {
    let c;
    try {
      const { extractCover } = await import('./cover.js');
      c = await extractCover(file);
    } catch (e) {
      throw new Error(t(e.message === 'nocover' ? 'err.noCover' : 'err.audioFmt'));
    }
    const src = new ImageSource();
    await src.load(c.blob);
    src.kind = 'audio';
    src.audio = { title: c.title, artist: c.artist };
    return src;
  }
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
    // iphone hevc sometimes hangs or gives audio only, hence timeout
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
      setTimeout(finish, 4000); // seeked just never fires sometimes
      // same t = no seeked event
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
    // browsers play <20ms delay as 100ms, match that
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
    const loaded = new Promise((ok) => {
      img.onload = () => ok(true);
      img.onerror = () => ok(false);
    });
    img.src = this.url;
    // decode() fails on huge imgs (9000px) even tho onload works
    const ok = await img.decode().then(() => true, () => loaded);
    if (!ok || !img.naturalWidth) throw new Error(t('err.image'));
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
