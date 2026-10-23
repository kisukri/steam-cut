// sample anim, drawn by code so no extra asset. only loads when sample opens
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
