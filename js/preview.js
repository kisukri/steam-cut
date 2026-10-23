// preview + playback
import { scheduleEstimate, updateOutInfo } from './generate.js';
import { drawGuidePreview } from './guide-ui.js';
import { t } from './i18n.js';
import { computeSlots } from './layout.js';
import { updateCropOverlay } from './stage.js';
import { $, isGuide, layout, MAX_CLIP, options, PREVIEW_MAX_H, state } from './state.js';
import { toast } from './ui.js';

export async function showAt(time) {
  drawFrame(await state.source.renderAt(time));
}

export function drawFrame(drawable) {
  state.lastDrawable = drawable;
  const canvas = $('stageCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  drawPreview(drawable);
}

// real steam widths, w/ gaps
export function drawPreview(drawable) {
  if (isGuide()) return drawGuidePreview(drawable);
  const L = layout();
  const opt = options();
  const c = state.crop;
  const { slots, total } = computeSlots(L, opt);
  const gap = state.gaps[state.layoutKey];
  const shownW = L.widths.reduce((a, b) => a + b, 0) + gap * (L.widths.length - 1);
  const shownH = (total * c.h) / c.w;
  const box = document.querySelector('.preview-box');
  const pad = parseFloat(getComputedStyle(box).paddingLeft) || 0;
  const availW = Math.max(100, box.clientWidth - pad * 2 - 20);
  const k = Math.min(1, PREVIEW_MAX_H / shownH, availW / shownW);
  const dpr = window.devicePixelRatio || 1;
  const canvas = $('previewCanvas');
  const cw = Math.round(shownW * k);
  const ch = Math.max(1, Math.round(shownH * k));
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  ctx.clearRect(0, 0, shownW, shownH);
  ctx.imageSmoothingQuality = 'high';
  let dx = 0;
  slots.forEach((sl, i) => {
    const sx = c.x + (sl.x / total) * c.w;
    const sw = (sl.w / total) * c.w;
    ctx.fillStyle = $('bg').value;
    ctx.fillRect(dx, 0, sl.w, shownH);
    ctx.drawImage(drawable, sx, c.y, sw, c.h, dx, 0, sl.w, shownH);
    dx += L.widths[i] + gap;
  });
}

export function refresh() {
  if (!state.source) return;
  updateCropOverlay();
  if (state.lastDrawable) drawPreview(state.lastDrawable);
  updateOutInfo();
  scheduleEstimate();
}

export function bindTime() {
  const readRange = (which) => {
    const d = state.source.duration;
    let s = Math.max(0, Math.min(d, Number($('tStart').value) || 0));
    let e = Math.max(0, Math.min(d, Number($('tEnd').value) || d));
    if (e < s) [s, e] = [e, s];
    if (e - s < 0.05) e = Math.min(d, s + 0.05);
    if (e - s < 0.05) s = Math.max(0, e - 0.05);
    if (e - s > MAX_CLIP + 0.001) {
      // keep what they just typed, move the other end
      if (which === 'start') e = s + MAX_CLIP;
      else s = e - MAX_CLIP;
      toast(t('out.maxClip', { n: MAX_CLIP }), 3500);
    }
    state.start = s;
    state.end = e;
    // put the fixed values back in the boxes
    $('tStart').value = +s.toFixed(2);
    $('tEnd').value = +e.toFixed(2);
    updateOutInfo();
    scheduleEstimate();
  };
  $('tStart').addEventListener('change', () => {
    readRange('start');
    if (!state.playing) seekPreview(state.start);
  });
  $('tEnd').addEventListener('change', () => readRange('end'));

  let pending = false;
  let queued = null;
  const seekPreview = async (time) => {
    queued = time;
    if (pending) return;
    pending = true;
    while (queued !== null) {
      const tt = queued;
      queued = null;
      await showAt(tt);
    }
    pending = false;
  };
  $('scrub').addEventListener('input', (e) => {
    stopPlay();
    const time = (Number(e.target.value) / 1000) * state.source.duration;
    $('timeInfo').textContent = t('s2.now', { t: time.toFixed(2) });
    seekPreview(time);
  });
  $('playBtn').addEventListener('click', () => (state.playing ? stopPlay() : startPlay()));
}

export function updatePlayLabel() {
  $('playBtn').textContent = t(state.playing ? 's2.pause' : 's2.play');
}

export function startPlay() {
  const src = state.source;
  if (!src || !src.animated) return;
  state.playing = true;
  updatePlayLabel();
  if (src.kind === 'video') {
    src.video.currentTime = state.start;
    src.video.play().catch(() => {});
  }
  state.playClock = performance.now();
  const loop = () => {
    if (!state.playing) return;
    if (src.kind === 'video') {
      const v = src.video;
      if (v.currentTime >= state.end || v.ended) {
        v.currentTime = state.start;
        if (v.paused) v.play().catch(() => {});
      }
      drawFrame(v);
      $('scrub').value = String((v.currentTime / src.duration) * 1000);
    } else {
      const span = state.end - state.start;
      const time = state.start + (((performance.now() - state.playClock) / 1000) % span);
      src.renderAt(time).then(drawFrame);
      $('scrub').value = String((time / src.duration) * 1000);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  updatePlayLabel();
  if (state.source && state.source.kind === 'video') state.source.video.pause();
}
