// layout tabs + crop box + undo
import { LAYOUT_TARGETS } from './codes.js';
import { enterGuide, stopSpin, updateModeUI } from './guide-ui.js';
import { t } from './i18n.js';
import { computeSlots, LAYOUTS, outputGeometry } from './layout.js';
import { refresh } from './preview.js';
import { $, isGuide, layout, options, state } from './state.js';
import { syncCodeTab } from './upload-panel.js';

export function sizeStage() {
  const src = state.source;
  if (!src) return;
  const wrap = document.querySelector('.stage-wrap');
  const aw = Math.max(100, wrap.clientWidth - 36);
  const ah = Math.max(200, window.innerHeight * 0.6);
  const k = Math.min(aw / src.width, ah / src.height);
  const canvas = $('stageCanvas');
  canvas.style.width = Math.round(src.width * k) + 'px';
  canvas.style.height = Math.round(src.height * k) + 'px';
}

export function buildLayoutTabs() {
  const box = $('layouts');
  for (const key in LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn layout';
    b.dataset.key = key;
    b.addEventListener('click', () => selectLayout(key));
    box.appendChild(b);
  }
}

export function selectLayout(key) {
  const wasGuide = isGuide();
  state.layoutKey = key;
  resetCropHistory();
  $('gap').value = state.gaps[key];
  if (isGuide() && !wasGuide) enterGuide();
  if (!isGuide() && wasGuide) stopSpin();
  updateModeUI();
  updateLayoutTabs();
  syncCodeTab();
  refresh();
}

export function updateLayoutTabs() {
  $('layouts').querySelectorAll('.layout').forEach((b) => {
    const key = b.dataset.key;
    b.classList.toggle('on', key === state.layoutKey);
    const tag = key === 'guide' ? t('layout.guide.tag') : t('layout.cols', { n: LAYOUTS[key].widths.length });
    b.innerHTML = `${t('layout.' + key)}<small>${tag}</small>`;
  });
  $('layoutDesc').textContent = t('layout.' + state.layoutKey + '.desc');
  $('previewHead').textContent = t('show.' + LAYOUT_TARGETS[state.layoutKey][0]);
}

// undo/redo for crop. wipe on new file / layout switch
const past = [];
const future = [];
const sameCrop = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);

export function updateUndoBtns() {
  $('undoBtn').disabled = !past.length;
  $('redoBtn').disabled = !future.length;
}

export function resetCropHistory() {
  past.length = future.length = 0;
  updateUndoBtns();
}

// pass the crop from BEFORE the change
export function pushCrop(prev) {
  if (!state.source || sameCrop(prev, state.crop)) return;
  past.push({ ...prev });
  if (past.length > 50) past.shift();
  future.length = 0;
  updateUndoBtns();
}

function stepCrop(from, to) {
  if (!state.source || !from.length) return;
  to.push({ ...state.crop });
  state.crop = from.pop();
  clampCrop();
  clearPreset();
  updateUndoBtns();
  refresh();
}

export const undoCrop = () => stepCrop(past, future);
export const redoCrop = () => stepCrop(future, past);

// wrap btn actions so they're undoable
function undoable(fn) {
  return (...a) => {
    if (!state.source) return;
    const prev = { ...state.crop };
    fn(...a);
    pushCrop(prev);
  };
}

export function clearPreset() {
  $('presets').querySelectorAll('button.on').forEach((x) => x.classList.remove('on'));
}

export function fitAll() {
  clearPreset();
  if (isGuide()) return squareCrop();
  const s = state.source;
  state.crop = { x: 0, y: 0, w: s.width, h: s.height };
  refresh();
}

export function fitWidth() {
  clearPreset();
  state.crop.x = 0;
  state.crop.w = state.source.width;
  refresh();
}

export function clampCrop() {
  const s = state.source;
  const c = state.crop;
  c.w = Math.max(8, Math.min(c.w, s.width));
  c.h = Math.max(8, Math.min(c.h, s.height));
  if (isGuide()) c.w = c.h = Math.min(c.w, c.h);
  c.x = Math.max(0, Math.min(c.x, s.width - c.w));
  c.y = Math.max(0, Math.min(c.y, s.height - c.h));
}

export function bindCrop() {
  $('fitAll').addEventListener('click', undoable(fitAll));
  $('fitWidth').addEventListener('click', undoable(fitWidth));
  $('undoBtn').addEventListener('click', undoCrop);
  $('redoBtn').addEventListener('click', redoCrop);
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !state.source || $('stepLayout').hidden) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) undoCrop();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redoCrop();
    else return;
    e.preventDefault();
  });
  updateUndoBtns();
  const crop = $('crop');
  let drag = null;

  crop.addEventListener('pointerdown', (e) => {
    if (!state.source) return;
    e.preventDefault();
    crop.setPointerCapture(e.pointerId);
    const rect = $('stage').getBoundingClientRect();
    drag = {
      mode: e.target.dataset.h || 'move',
      x0: e.clientX,
      y0: e.clientY,
      c0: { ...state.crop },
      k: state.source.width / rect.width,
      ratio: state.crop.w / state.crop.h,
    };
  });

  crop.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x0) * drag.k;
    const dy = (e.clientY - drag.y0) * drag.k;
    const c0 = drag.c0;
    const s = state.source;
    let { x, y, w, h } = c0;
    if (drag.mode === 'move') {
      x = c0.x + dx;
      y = c0.y + dy;
    } else {
      const west = drag.mode.includes('w');
      const north = drag.mode.includes('n');
      let right = c0.x + c0.w;
      let bottom = c0.y + c0.h;
      let left = c0.x;
      let top = c0.y;
      if (west) left = Math.min(right - 8, Math.max(0, c0.x + dx));
      else right = Math.max(left + 8, Math.min(s.width, right + dx));
      if (north) top = Math.min(bottom - 8, Math.max(0, c0.y + dy));
      else bottom = Math.max(top + 8, Math.min(s.height, bottom + dy));
      w = right - left;
      h = bottom - top;
      if ($('lockRatio').checked) {
        // keep ratio, shrink w if h runs off
        h = w / drag.ratio;
        const maxH = north ? bottom : s.height - top;
        if (h > maxH) {
          h = maxH;
          w = h * drag.ratio;
        }
      }
      x = west ? right - w : left;
      y = north ? bottom - h : top;
    }
    state.crop = { x, y, w, h };
    clampCrop();
    clearPreset();
    refresh();
  });

  const end = () => {
    if (drag) pushCrop(drag.c0);
    drag = null;
  };
  crop.addEventListener('pointerup', end);
  crop.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => {
    if (!state.source) return;
    sizeStage();
    refresh();
  });
}

export function updateCropOverlay() {
  const s = state.source;
  const c = state.crop;
  const el = $('crop');
  el.style.left = (c.x / s.width) * 100 + '%';
  el.style.top = (c.y / s.height) * 100 + '%';
  el.style.width = (c.w / s.width) * 100 + '%';
  el.style.height = (c.h / s.height) * 100 + '%';

  const opt = options();
  const { slots, total } = computeSlots(layout(), opt);
  const round = isGuide() && state.guide.style !== 'square';
  $('cropGuides').classList.toggle('round', round);
  let html = round ? '<div class="circle"></div>' : '';
  slots.forEach((sl, i) => {
    if (i === 0) return;
    const prevEnd = slots[i - 1].x + slots[i - 1].w;
    if (opt.removeGaps && sl.x > prevEnd) {
      html += `<div class="gapband" style="left:${(prevEnd / total) * 100}%;width:${((sl.x - prevEnd) / total) * 100}%"></div>`;
    } else {
      html += `<div class="cut" style="left:${(sl.x / total) * 100}%"></div>`;
    }
  });
  $('cropGuides').innerHTML = html;

  const geo = outputGeometry(layout(), opt, c);
  $('cropInfo').textContent = t('s2.cropInfo', {
    w: Math.round(c.w),
    h: Math.round(c.h),
    dw: Math.round(geo.total),
    dh: Math.round(geo.displayH),
  });
}

export function bindPresets() {
  $('presets').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', undoable(() => {
      const r = Number(b.dataset.r); // h = strip w * r
      const s = state.source;
      let cw = s.width;
      let ch = cw * r;
      if (ch > s.height) {
        ch = s.height;
        cw = ch / r;
      }
      state.crop = { x: (s.width - cw) / 2, y: (s.height - ch) / 2, w: cw, h: ch };
      refresh();
      $('presets').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    }))
  );
}

export function squareCrop() {
  const s = state.source;
  const side = Math.min(s.width, s.height);
  state.crop = { x: (s.width - side) / 2, y: (s.height - side) / 2, w: side, h: side };
  refresh();
}
