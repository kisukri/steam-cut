// guide mode ui: disc options + spin preview
import { currentFps } from './generate.js';
import { discPlan, paintDisc } from './guide.js';
import { t } from './i18n.js';
import { refresh } from './preview.js';
import { squareCrop } from './stage.js';
import { $, isGuide, state } from './state.js';

export function guideFrameOpts() {
  return { start: state.start, end: state.end, fps: currentFps() || 25, period: state.guide.period, dir: state.guide.dir, spin: spinOn() };
}

// square + spin looks dumb, so no
export function spinOn() {
  return state.guide.spin && state.guide.style !== 'square';
}

export function guidePlan() {
  return discPlan(state.source, guideFrameOpts());
}

export function outSeconds() {
  return isGuide() ? guidePlan().clip : state.end - state.start;
}

export function guideOpts() {
  return { ...state.guide, spin: spinOn(), bg: $('bg').value };
}

export function guidePaint() {
  const crop = { ...state.crop };
  const opts = guideOpts();
  return (ctx, w, h, drawable, f) => paintDisc(ctx, w, drawable, crop, f.angle || 0, opts);
}

export function enterGuide() {
  if (!state.source) return;
  if (state.source.kind !== 'gif' && Number($('fps').value) < 25) $('fps').value = '25';
  $('scale').value = '1';
  if ($('bg').value === '#000000') $('bg').value = '#1b2838';
  squareCrop();
}

export function updateModeUI() {
  const g = isGuide();
  $('guideOpts').hidden = !g;
  const music = g && !!state.source && state.source.kind === 'audio';
  $('playerCtl').hidden = !music;
  $('work').classList.toggle('guide', g);
  $('stripMock').hidden = g;
  $('guideMock').hidden = !g;
  $('gmNote').hidden = !g;
  if (!music) {
    $('scTitle').textContent = t('sc.titlePh');
    $('scDesc').textContent = '';
  }
  const sq = state.guide.style === 'square';
  $('spinRow').hidden = !g || !spinOn();
  $('gPeriodRow').hidden = !spinOn();
  $('gDirRow').hidden = !spinOn();
  $('gSpin').closest('label').hidden = sq;
  $('gEdgeRow').hidden = state.guide.style !== 'vinyl';
  $('gHoleRow').hidden = state.guide.style !== 'vinyl' && state.guide.style !== 'cd';
  $('gTLabel').textContent = t(sq ? 'g.transparentSq' : 'g.transparent');
  $('gTEm').textContent = t(sq ? 'g.transparentSq.em' : 'g.transparent.em');
  if (!spinOn()) {
    stopSpin();
    state.spin.angle = 0;
  }

  $('fitWidth').hidden = g;
  $('presets').hidden = g;
  $('legendGap').hidden = g;
  $('lockRatio').disabled = g;
  $('lockRatio').checked = g || state.userLock;
  const src = state.source;
  if (src) {
    const outAnim = src.animated || (g && spinOn());
    $('fpsField').hidden = !outAnim;
    $('colorsField').hidden = !outAnim;
    $('autoFitField').hidden = !outAnim;
  }
}

// steam shows it at 160px, keep the same
const GUIDE_CSS = 160;

export function drawGuidePreview(drawable) {
  const S = GUIDE_CSS;
  const dpr = window.devicePixelRatio || 1;
  const canvas = $('guideCanvas');
  canvas.width = canvas.height = Math.round(S * dpr);
  paintDisc(canvas.getContext('2d'), canvas.width, drawable, state.crop, state.spin.angle, guideOpts());
}

export function updateSpinLabel() {
  $('spinBtn').textContent = t(state.spin.on ? 'g.stop' : 'g.spin');
}

export function stopSpin() {
  state.spin.on = false;
  updateSpinLabel();
}

export function startSpin() {
  state.spin.on = true;
  state.spin.last = performance.now();
  updateSpinLabel();
  const loop = (now) => {
    if (!state.spin.on || !isGuide() || !state.lastDrawable) return;
    const dt = (now - state.spin.last) / 1000;
    state.spin.last = now;
    state.spin.angle = (state.spin.angle + (state.guide.dir * Math.PI * 2 * dt) / state.guide.period) % (Math.PI * 2);
    drawGuidePreview(state.lastDrawable);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export function bindGuide() {
  const styleBtns = $('gStyle').querySelectorAll('.seg-btn');
  const syncStyle = () => styleBtns.forEach((b) => b.classList.toggle('on', b.dataset.v === state.guide.style));
  styleBtns.forEach((b) =>
    b.addEventListener('click', () => {
      state.guide.style = b.dataset.v;
      syncStyle();
      updateModeUI();
      refresh();
    })
  );
  syncStyle();
  $('gPeriod').addEventListener('change', () => {
    state.guide.period = Number($('gPeriod').value) || 4;
    refresh();
  });
  $('gDir').addEventListener('change', () => {
    state.guide.dir = Number($('gDir').value) || 1;
    refresh();
  });
  $('gSpin').addEventListener('change', () => {
    state.guide.spin = $('gSpin').checked;
    if (!state.guide.spin) {
      stopSpin();
      state.spin.angle = 0;
    }
    updateModeUI();
    refresh();
  });
  $('gEdge').addEventListener('input', () => {
    state.guide.edge = Number($('gEdge').value) || 44;
    $('gEdgeVal').textContent = state.guide.edge + '%';
    if (state.lastDrawable) drawGuidePreview(state.lastDrawable);
  });
  $('gEdge').addEventListener('change', refresh);
  $('gHole').addEventListener('change', () => {
    state.guide.hole = $('gHole').checked;
    refresh();
  });
  $('gTransparent').addEventListener('change', () => {
    state.guide.transparent = $('gTransparent').checked;
    refresh();
  });
  $('lockRatio').addEventListener('change', () => {
    if (!isGuide()) state.userLock = $('lockRatio').checked;
  });
  $('spinBtn').addEventListener('click', () => (state.spin.on ? stopSpin() : startSpin()));
  updateSpinLabel();
}
