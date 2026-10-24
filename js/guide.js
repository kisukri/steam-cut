// the spinning disc for guide icons
// vinyl / cd / plain / square
// glare drawn after rotate so it doesn't spin w/ the disc (looks fake otherwise)
// spin off -> just an animated icon

const TAU = Math.PI * 2;

export function discPlan(source, { start, end, fps, period, spin = true, n: nOverride }) {
  if (!spin) {
    // no spin + still img -> 1 frame, done
    if (!source.animated) return { clip: 0, turns: 0, n: 1 };
    const clip = Math.max(0.1, end - start);
    return { clip, turns: 0, n: Math.max(1, Math.round(clip * fps)) };
  }
  // anim src: whole turns per clip or the loop jumps
  const clip = source.animated ? Math.max(0.1, end - start) : period;
  const turns = source.animated ? Math.max(1, Math.round(clip / period)) : 1;
  // still img: caller can ask for fewer frames (to fit 2MB) instead of dropping some
  const n = !source.animated && nOverride ? nOverride : Math.max(2, Math.round(clip * fps));
  return { clip, turns, n };
}

// frame counts where every frame gets the same whole 1/100s delay -> even spin, no stutter
export function evenFrameCounts(period, maxN) {
  const total = Math.round(period * 100);
  const out = [];
  for (let n = Math.floor(maxN); n >= 8; n--) if (total % n === 0 && total / n >= 2) out.push(n);
  return out;
}

export async function* discFrames(source, opts) {
  const { clip, turns, n } = discPlan(source, opts);
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const drawable = await source.renderAt(source.animated ? opts.start + k * clip : 0);
    yield { drawable, delay: n > 1 ? (clip * 1000) / n : 0, angle: opts.dir * TAU * turns * k };
  }
}

function hole(ctx, r, transparent, bg) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  if (transparent) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = bg;
    ctx.fill();
  }
}

export function paintDisc(ctx, S, drawable, crop, angle, { style, bg, transparent, edge = 44, hole: withHole = true }) {
  if (style === 'square') {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (transparent) ctx.clearRect(0, 0, S, S);
    else {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(S / 2, S / 2);
    ctx.rotate(angle);
    ctx.drawImage(drawable, crop.x, crop.y, crop.w, crop.h, -S / 2, -S / 2, S, S);
    ctx.restore();
    return;
  }
  const R = (S / 2) * 0.96;
  // edge = black rim, % of radius
  const L = R * (1 - Math.min(90, Math.max(5, edge)) / 100);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (transparent) ctx.clearRect(0, 0, S, S);
  else {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
  }
  ctx.translate(S / 2, S / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // spins
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  // a bit past R: the real edge is cut later by a fixed (unrotated) mask
  ctx.arc(0, 0, R + 2, 0, TAU);
  ctx.clip();
  if (style === 'vinyl') {
    ctx.fillStyle = '#0c0c0f';
    ctx.fillRect(-R - 3, -R - 3, R * 2 + 6, R * 2 + 6);
    ctx.lineWidth = Math.max(1, R / 180);
    let i = 0;
    for (let r = L + R * 0.04; r < R * 0.98; r += R / 40, i++) {
      ctx.strokeStyle = `rgba(255,255,255,${i % 4 === 0 ? 0.07 : 0.035})`;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, L, 0, TAU);
    ctx.clip();
    ctx.drawImage(drawable, crop.x, crop.y, crop.w, crop.h, -L, -L, L * 2, L * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(1, R / 90);
    ctx.beginPath();
    ctx.arc(0, 0, L, 0, TAU);
    ctx.stroke();
  } else {
    // solid backing so the rotated cover's soft edges never leave see-through px inside the disc
    // (keeps the transparent area identical every frame -> gif can skip the flashy clear between frames)
    ctx.fillStyle = '#000';
    ctx.fillRect(-R - 3, -R - 3, R * 2 + 6, R * 2 + 6);
    ctx.drawImage(drawable, crop.x, crop.y, crop.w, crop.h, -R, -R, R * 2, R * 2);
  }
  ctx.restore();

  // doesn't spin
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  if (style === 'vinyl') {
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.58, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, R * 2, R * 2);
  } else if (style === 'cd') {
    if (ctx.createConicGradient) {
      const c = ctx.createConicGradient(-Math.PI / 4, 0, 0);
      const hues = [200, 280, 340, 40, 120, 200, 280, 340, 40, 120, 200];
      hues.forEach((h, i) => c.addColorStop(i / (hues.length - 1), `hsla(${h},90%,70%,0.16)`));
      ctx.fillStyle = c;
      ctx.fillRect(-R, -R, R * 2, R * 2);
    }
    const g = ctx.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0.35, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.14)');
    g.addColorStop(0.65, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.fillStyle = 'rgba(210,220,235,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, R / 120);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();

  if (style !== 'plain') {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, R / 120);
    ctx.beginPath();
    ctx.arc(0, 0, R - ctx.lineWidth / 2, 0, TAU);
    ctx.stroke();
    if (withHole) hole(ctx, style === 'cd' ? R * 0.075 : R * 0.035, transparent, bg);
  }
  if (transparent) {
    // fixed edge: rotated clip paths rasterize a hair differently each angle, which made edge px
    // flip between see-through and solid. same mask every frame -> gif can keep frames (no flash)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}
