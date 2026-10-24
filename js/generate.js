// step 3: settings, size guess, the go btn
import { captureFrames, estimateFrameBytes, exportAnimated, exportStatic, frameCap, limitMB, sizeLimit } from './export.js';
import { guideFrameOpts, guideOpts, guidePaint, guidePlan, outSeconds, spinOn, stopSpin } from './guide-ui.js';
import { discFrames, evenFrameCounts } from './guide.js';
import { t } from './i18n.js';
import { LAYOUTS, outputGeometry } from './layout.js';
import { refresh, showAt, stopPlay } from './preview.js';
import { downloadZip, showResult } from './results.js';
import { $, isGuide, layout, options, state } from './state.js';
import { ask, formatSize, setProgress, setStatus, updateFab } from './ui.js';

export function bindOutput() {
  ['scale', 'fps', 'colors', 'removeGaps', 'bg'].forEach((id) => $(id).addEventListener('change', refresh));
  $('gap').addEventListener('change', () => {
    const v = Number($('gap').value);
    state.gaps[state.layoutKey] = Number.isFinite(v) && v >= 0 ? v : LAYOUTS[state.layoutKey].gap;
    refresh();
  });
  $('go').addEventListener('click', generate);
  $('cancel').addEventListener('click', () => (state.cancelled = true));
  $('zip').addEventListener('click', downloadZip);
}

export function currentFps() {
  const fps = Number($('fps').value);
  if (state.source.kind === 'gif') return fps; // 0 = keep gif's own fps
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
  }
  if (geo.stripH > 2000) parts.push('⚠️ ' + t('out.tall'));
  $('outInfo').textContent = parts.join(' · ');
}

// so we can ask "same settings, really regen?"
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
    sw: [$('removeGaps').checked, $('autoFit').checked, $('hexify').checked],
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
      // spinning still img: re-render w/ fewer, evenly spaced frames instead of dropping (dropping = jerky spin)
      const still = !src.animated && spinOn();
      const period = state.guide.period;
      let n = plan.n;
      for (let tries = 0; ; tries++) {
        const cap = await captureFrames(src, {
          crop: state.crop,
          geo,
          colors: Number($('colors').value),
          maxFrames: frameCap(geo),
          frames: discFrames(src, { ...guideFrameOpts(), n }),
          expected: n,
          paint: guidePaint(),
          alpha: guideOpts().transparent,
          // still img just rotates, 1 palette for all frames = no color flicker
          fixedPalette: !src.animated,
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
        // whole-1/100s count if it's close, else keep more frames (angles stay even, timing off by <5ms)
        const even = evenFrameCounts(period, target)[0];
        const next = even && even >= target * 0.85 ? even : target;
        if (next < 8 || next >= n) break;
        setStatus(t('st.reencode', { f: next, mb }));
        n = next;
      }
      out.originalFrames = plan.n;
    } else if (src.animated) {
      const cap = await captureFrames(src, {
        crop: state.crop,
        geo,
        start: state.start,
        end: state.end,
        fps: currentFps(),
        bg: $('bg').value,
        colors: Number($('colors').value),
        maxFrames: frameCap(geo),
        isCancelled: () => state.cancelled,
        onProgress: (i, n) => {
          setProgress(Math.min(0.7, (i / n) * 0.7));
          setStatus(t('st.capture', { i, n }));
        },
      });
      setProgress(0.75);
      out = await exportAnimated(cap, { autoFit: $('autoFit').checked, hexify, onStatus: setStatus, limit: sizeLimit(state.layoutKey), mb: limitMB(state.layoutKey) });
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
      // spinning still img uses 1 palette for all frames (see generate)
      shared: isGuide() && !state.source.animated,
    });
    if (token !== estToken) return;
    const frames = Math.min(frameEstimate(), frameCap(geo));
    const total = perFrame * frames + 1024;
    const limit = sizeLimit(state.layoutKey);
    const mb = limitMB(state.layoutKey);
    if (total <= limit) {
      el.textContent = t('est.size', { size: formatSize(total) });
    } else if ($('autoFit').checked) {
      let n = Math.max(2, Math.floor(frames * (limit / total) * 0.92));
      // spinning still img gets re-rendered w/ an even frame count, show that number
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
