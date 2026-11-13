import { captureFrames, estimateFrameBytes, evenPlan, exportAnimated, exportStatic, frameCap, limitMB, sizeLimit } from './export.js';
import { guideFrameOpts, guideOpts, guidePaint, guidePlan, outSeconds, spinOn, stopSpin } from './guide-ui.js';
import { discFrames, evenFrameCounts } from './guide.js';
import { t } from './i18n.js';
import { LAYOUTS, outputGeometry } from './layout.js';
import { refresh, showAt, stopPlay } from './preview.js';
import { downloadZip, showResult } from './results.js';
import { $, isGuide, layout, options, state } from './state.js';
import { ask, formatSize, setProgress, setStatus, updateFab } from './ui.js';

export function bindOutput() {
  ['scale', 'fps', 'colors', 'removeGaps', 'bg', 'dither'].forEach((id) => $(id).addEventListener('change', refresh));
  $('gap').addEventListener('change', () => {
    const v = Number($('gap').value);
    state.gaps[state.layoutKey] = Number.isFinite(v) && v >= 0 ? v : LAYOUTS[state.layoutKey].gap;
    refresh();
  });
  $('go').addEventListener('click', generate);
  $('cancel').addEventListener('click', () => (state.cancelled = true));
  $('zip').addEventListener('click', downloadZip);
}

export function evenFpsList(srcFps) {
  const out = [];
  for (let k = 1; srcFps / k >= 5; k++) if (srcFps / k <= 50.5) out.push(srcFps / k);
  return out;
}
const isEvenFps = (fps, srcFps) => evenFpsList(srcFps).some((f) => Math.abs(f - fps) < 0.26);

export function currentFps() {
  const fps = Number($('fps').value);
  if (state.source.kind === 'gif') return fps;
  return fps || 15;
}

export function frameEstimate() {
  const src = state.source;
  if (isGuide()) return guidePlan().n;
  if (!src.animated) return 1;
  const fps = currentFps();
  if (fps) return Math.max(1, Math.round((state.end - state.start) * fps));
  let n = 0;
  for (let i = 0; i < src.starts.length; i++) {
    const s = src.starts[i];
    if (s + src.delays[i] > state.start * 1000 && s < state.end * 1000) n++;
  }
  return Math.max(1, n);
}

export function updateOutInfo() {
  if (!state.source) return;
  const geo = outputGeometry(layout(), options(), state.crop);
  const sizes = [...new Set(geo.panels.map((p) => `${p.w}×${geo.stripH}`))].join(' / ');
  const parts = [t('out.files', { n: geo.panels.length, size: sizes })];
  if (state.source.animated || (isGuide() && guidePlan().n > 1)) {
    const n = frameEstimate();
    const max = frameCap(geo);
    parts.push(t('out.frames', { n, s: outSeconds().toFixed(2) }));
    if (n > max) parts.push('⚠️ ' + t('out.cap', { max }));
    else if (outSeconds() > 15) parts.push('⚠️ ' + t('out.long', { mb: limitMB(state.layoutKey) }));
    const sf = state.source.fps;
    if (sf && !isGuide() && !isEvenFps(currentFps(), sf)) {
      const have = [...$('fps').options].map((o) => Number(o.value));
      const good = evenFpsList(sf)
        .filter((f) => have.some((v) => Math.abs(v - f) < 0.26))
        .map((f) => Math.round(f))
        .join(' / ');
      parts.push('⚠️ ' + t('out.uneven', { src: +sf.toFixed(2), fps: currentFps(), good }));
    }
  }
  if (geo.stripH > 2000) parts.push('⚠️ ' + t('out.tall'));
  $('outInfo').textContent = parts.join(' · ');
}

export function settingsSignature() {
  const c = state.crop;
  return JSON.stringify({
    f: [state.file.name, state.file.size, state.file.lastModified],
    l: state.layoutKey,
    c: [c.x, c.y, c.w, c.h].map((v) => Math.round(v)),
    t: [state.start, state.end],
    fps: $('fps').value,
    scale: $('scale').value,
    colors: $('colors').value,
    bg: $('bg').value,
    sw: [$('removeGaps').checked, $('autoFit').checked, $('hexify').checked, $('dither').checked],
    fit: $('fitMode').value,
    gap: state.gaps[state.layoutKey],
    g: isGuide() ? state.guide : null,
  });
}

export async function generate() {
  if (state.busy || !state.source) return;
  const sig = settingsSignature();
  if (state.result) {
    if (sig === state.result.sig) {
      const ok = await ask('dlg.same.title', 'dlg.same.body', 'dlg.same.ok');
      if (!ok) {
        $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    } else if (!state.downloaded) {
      const ok = await ask('dlg.unsaved.title', 'dlg.unsaved.body', 'dlg.unsaved.ok');
      if (!ok) {
        $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
  }

  stopPlay();
  stopSpin();
  state.busy = true;
  state.cancelled = false;
  $('clearBtn').disabled = true;
  updateFab();
  $('go').disabled = true;
  $('cancel').hidden = false;
  setProgress(0);
  try {
    const src = state.source;
    const geo = outputGeometry(layout(), options(), state.crop);
    const hexify = $('hexify').checked;
    let out;
    if (isGuide()) {
      const plan = guidePlan();
      const limit = sizeLimit(state.layoutKey);
      const mb = limitMB(state.layoutKey);
      const autoFit = $('autoFit').checked;
      const still = !src.animated && spinOn();
      const period = state.guide.period;
      let n = plan.n;
      for (let tries = 0; ; tries++) {
        const cap = await captureFrames(src, {
          crop: state.crop,
          geo,
          start: state.start,
          end: state.end,
          colors: Number($('colors').value),
          maxFrames: frameCap(geo),
          frames: discFrames(src, { ...guideFrameOpts(), n }),
          expected: n,
          paint: guidePaint(),
          alpha: guideOpts().transparent,
          fixedPalette: !src.animated,
          globalPalette: src.animated,
          dither: src.animated && $('dither').checked,
          isCancelled: () => state.cancelled,
          onProgress: (i, total) => {
            setProgress(Math.min(0.7, (i / total) * 0.7));
            setStatus(t('st.capture', { i, n: total }));
          },
        });
        setProgress(0.75);
        out = await exportAnimated(cap, { autoFit: autoFit && !still, hexify, onStatus: setStatus, limit, mb });
        if (!still || !autoFit || tries >= 4) break;
        const max = Math.max(...out.files.map((f) => f.length));
        if (max <= limit) break;
        const target = Math.floor(n * (limit / max) * 0.95);
        const even = evenFrameCounts(period, target)[0];
        const next = even && even >= target * 0.85 ? even : target;
        if (next < 8 || next >= n) break;
        setStatus(t('st.reencode', { f: next, mb }));
        n = next;
      }
      out.originalFrames = plan.n;
    } else if (src.animated) {
      const limit = sizeLimit(state.layoutKey);
      const mb = limitMB(state.layoutKey);
      const autoFit = $('autoFit').checked;
      const dur = state.end - state.start;
      let fps = currentFps();
      let colors = Number($('colors').value);
      let first = 0;
      const smooth = $('fitMode').value === 'smooth';
      const ladder = smooth
        ? [[1, 6], [2, 16], [2, 40], [3, 999], [4, 999], [6, 999]]
        : [[1, 6], [2, 16], [2, 40]];
      let step = 0;
      const fits = (o) => Math.max(...o.files.map((f) => f.length)) <= limit;
      for (let tries = 0; ; tries++) {
        const cap = await captureFrames(src, {
          crop: state.crop,
          geo,
          start: state.start,
          end: state.end,
          fps,
          bg: $('bg').value,
          colors,
          maxFrames: frameCap(geo),
          globalPalette: true,
          dither: $('dither').checked,
          isCancelled: () => state.cancelled,
          onProgress: (i, n) => {
            setProgress(Math.min(0.7, (i / n) * 0.7));
            setStatus(t('st.capture', { i, n }));
          },
        });
        setProgress(0.75);
        const n = cap.delays.length;
        first = first || n;
        const enc = (o) => exportAnimated(cap, { hexify, limit, mb, tol: ladder[step][0], moveMin: ladder[step][1], ...o });
        out = await enc({ autoFit: autoFit && tries >= 3, onStatus: setStatus });
        if (!autoFit || tries >= 3 || fits(out) || n <= 2) break;
        while (!fits(out) && step < ladder.length - 1 && !state.cancelled) {
          step++;
          setStatus(t('st.requality', { mb }));
          out = await enc({ autoFit: false, onStatus: () => {} });
        }
        if (fits(out)) break;
        let max = Math.max(...out.files.map((f) => f.length));
        const lower = smooth ? COLOR_STEPS.filter(([c]) => c < colors) : [];
        if (lower.length) {
          const cur = COLOR_STEPS.find(([c]) => c <= colors)[1];
          const pick = lower.find(([, k]) => (max * k) / cur <= limit * 0.97) || lower[lower.length - 1];
          colors = pick[0];
          max = (max * pick[1]) / cur;
          setStatus(t('st.requality', { mb }));
          if (max <= limit * 0.97) continue;
        }
        let plan = evenPlan(dur, Math.floor(n * (limit / max) * 0.92));
        if (src.fps) {
          const k = Math.ceil((dur * src.fps) / Math.max(1, Math.floor(n * (limit / max) * 0.92)));
          plan = { fps: src.fps / k, n: Math.max(1, Math.round((dur * src.fps) / k)) };
        }
        if (plan.n >= n) break;
        setStatus(t('st.reencode', { f: plan.n, mb }));
        fps = plan.fps;
      }
      out.softened = step > 2;
      if (colors < Number($('colors').value)) out.colors = colors;
      out.originalFrames = Math.max(first, out.originalFrames);
    } else {
      out = await exportStatic(src, { crop: state.crop, geo, bg: $('bg').value, hexify });
    }
    if (state.cancelled) throw new Error(t('st.cancelled'));
    setProgress(1);
    showResult(out, geo, sig);
    const mb = limitMB(state.layoutKey);
    const over = out.files.some((f) => f.length > sizeLimit(state.layoutKey));
    let msg = t('st.done');
    if (out.frameCount < out.originalFrames) msg += ' ' + t('st.reduced', { a: out.originalFrames, b: out.frameCount, mb });
    else if (out.softened && !out.colors) msg += ' ' + t('st.softened', { mb });
    if (out.colors) msg += (out.frameCount < out.originalFrames ? '，' : ' ') + t('st.colors', { c: out.colors });
    if (over) msg += ' ' + t('st.over', { mb });
    setStatus(msg, over ? 'err' : 'ok');
    if (src.animated) await showAt(state.start);
  } catch (err) {
    console.error(err);
    setStatus('❌ ' + (err.message || err), 'err');
  } finally {
    state.busy = false;
    $('clearBtn').disabled = false;
    updateFab();
    $('go').disabled = false;
    $('cancel').hidden = true;
    setTimeout(() => setProgress(null), 600);
  }
}

const COLOR_STEPS = [
  [256, 1],
  [128, 0.8],
  [64, 0.63],
  [32, 0.48],
];

let estTimer;

let estToken = 0;

export function scheduleEstimate() {
  clearTimeout(estTimer);
  const el = $('estInfo');
  if (!state.source || (!state.source.animated && !isGuide())) {
    el.textContent = '';
    return;
  }
  estTimer = setTimeout(runEstimate, 500);
}

export async function runEstimate() {
  if (!state.source || state.busy || !state.lastDrawable) return;
  const token = ++estToken;
  const el = $('estInfo');
  el.className = 'meta est-info';
  el.textContent = t('est.calc');
  try {
    const geo = outputGeometry(layout(), options(), state.crop);
    const perFrame = await estimateFrameBytes(state.lastDrawable, {
      crop: state.crop,
      geo,
      bg: $('bg').value,
      colors: Number($('colors').value),
      paint: isGuide() ? guidePaint() : undefined,
      alpha: isGuide() && guideOpts().transparent,
      angles: isGuide() && guideOpts().spin ? [0.41, 1.13] : [0],
      shared: true,
      dither: state.source.animated && $('dither').checked,
    });
    if (token !== estToken) return;
    const frames = Math.min(frameEstimate(), frameCap(geo));
    const total = perFrame * frames + 1024;
    const limit = sizeLimit(state.layoutKey);
    const mb = limitMB(state.layoutKey);
    if (total <= limit) {
      el.textContent = t('est.size', { size: formatSize(total) });
    } else if ($('autoFit').checked && !isGuide()) {
      el.textContent = t('est.ceil', { size: formatSize(total), mb });
    } else if ($('autoFit').checked) {
      let n = Math.max(2, Math.floor(frames * (limit / total) * 0.92));
      if (!isGuide()) n = evenPlan(Math.max(0.05, outSeconds()), n).n;
      if (isGuide() && !state.source.animated && spinOn()) {
        const even = evenFrameCounts(state.guide.period, n)[0];
        if (even && even >= n * 0.85) n = even;
      }
      const dur = Math.max(0.05, outSeconds());
      el.textContent = t('est.over', { n, fps: Math.max(1, Math.round(n / dur)), mb });
      el.className = 'meta est-info warn';
    } else {
      el.textContent = t('est.overOff', { mb });
      el.className = 'meta est-info bad';
    }
  } catch (e) {
    if (token === estToken) el.textContent = '';
  }
}

export function cancelEstimate() {
  estToken++;
  clearTimeout(estTimer);
}
