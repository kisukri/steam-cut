import { LAYOUTS, computeSlots, outputGeometry } from './layout.js';
import { loadSource, DemoSource, drawDemo } from './media.js';
import { captureFrames, exportAnimated, exportStatic, frameCap, estimateFrameBytes, STEAM_LIMIT } from './export.js';
import { UPLOAD_URL, LAYOUT_TARGETS, mainCode, blankCode, mergedCode, showcaseInfo } from './codes.js';
import { LANGS, t, getLang, setLang, applyDom } from './i18n.js';

const $ = (id) => document.getElementById(id);
const STAGE_MAX = 1280; // max stage px
const PREVIEW_MAX_H = 520;
const ALL_SHOWCASES = ['workshop', 'artwork', 'screenshot', 'featured'];

const state = {
  source: null,
  file: null,
  layoutKey: 'workshop',
  crop: { x: 0, y: 0, w: 1, h: 1 },
  gaps: {},
  start: 0,
  end: 0,
  playing: false,
  playClock: 0,
  lastDrawable: null,
  busy: false,
  cancelled: false,
  merge: false, // blank title merged into main
  result: null, // { out, geo, names, layoutKey, sig }
  downloaded: false,
  urls: [],
  panels: [],
};

function init() {
  for (const k in LAYOUTS) state.gaps[k] = LAYOUTS[k].gap;
  buildLangSwitch();
  buildLayoutTabs();
  bindFileInput();
  bindCrop();
  bindTime();
  bindOutput();
  bindFab();
  bindDemo();
  $('clearBtn').addEventListener('click', clearAll);
  bindPresets();
  document.querySelectorAll('a[href="#codes"]').forEach((a) => a.addEventListener('click', () => ($('codesWrap').open = true)));
  $('gap').value = state.gaps[state.layoutKey];
  renderCodePanel($('codePanel'), ALL_SHOWCASES);
  applyLanguage();
  mobileNotice();
}

// phone notice, once per session
function mobileNotice() {
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (window.matchMedia && matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
  if (!isMobile) return;
  try {
    if (sessionStorage.getItem('ssc-mobile-ok')) return;
  } catch (e) {}
  ask('mob.title', 'mob.body', 'mob.ok', { noCancel: true }).then(() => {
    try {
      sessionStorage.setItem('ssc-mobile-ok', '1');
    } catch (e) {}
  });
}

function layout() {
  return LAYOUTS[state.layoutKey];
}

function options() {
  return {
    gap: state.gaps[state.layoutKey],
    removeGaps: $('removeGaps').checked,
    scale: Number($('scale').value),
  };
}

function buildLangSwitch() {
  const box = $('lang');
  for (const k in LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.l = k;
    b.textContent = LANGS[k];
    b.addEventListener('click', () => {
      setLang(k);
      applyLanguage();
    });
    box.appendChild(b);
  }
}

function applyLanguage() {
  applyDom();
  $('lang').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.l === getLang()));
  updateLayoutTabs();
  updatePlayLabel();
  if (state.updateDemoLabel) state.updateDemoLabel();
  if (state.updateDemoToggle) state.updateDemoToggle();
  state.panels.forEach((p) => p.render());
  if (state.source) {
    showFileInfo();
    refresh();
  }
  if (state.result) {
    $('resultHead').textContent = t('show.' + LAYOUT_TARGETS[state.result.layoutKey][0]);
    renderFiles();
    renderUploadGuide();
  }
}

function bindFileInput() {
  const drop = $('drop');
  $('file').addEventListener('change', (e) => e.target.files[0] && openFile(e.target.files[0]));
  ['dragenter', 'dragover'].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    })
  );
  ['dragleave', 'drop'].forEach((type) => drop.addEventListener(type, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) openFile(f);
  });
}

function showFileInfo() {
  const src = state.source;
  const info = $('fileInfo');
  info.removeAttribute('data-i18n');
  info.textContent =
    `${src.kind === 'demo' ? t('demo.name') : state.file.name} · ${t('kind.' + src.kind)} · ${src.width}×${src.height}` +
    (src.animated ? ` · ${src.duration.toFixed(2)} ${t('unit.sec')}` : '');
}

async function openFile(file) {
  stopPlay();
  const info = $('fileInfo');
  info.removeAttribute('data-i18n');
  info.textContent = t('s1.reading');
  try {
    await openSource(await loadSource(file), file);
  } catch (err) {
    info.textContent = '❌ ' + err.message;
  }
}

async function openSource(src, file) {
  {
    if (state.source) state.source.dispose();
    state.source = src;
    state.file = file;
    state.start = 0;
    state.end = src.animated ? src.duration : 0;
    showFileInfo();
    $('stepLayout').hidden = false;
    $('stepOutput').hidden = false;
    setupForSource();
    fitAll();
    await showAt(0);
    updateFab();
    $('clearBtn').hidden = false;
  }
}

function setupForSource() {
  const src = state.source;
  const anim = src.animated;
  $('timeBox').hidden = !anim;
  $('fpsField').hidden = !anim;
  $('colorsField').hidden = !anim;
  $('autoFitField').hidden = !anim;
  // no fps info for video, 'orig' is gif only
  $('fps').querySelector('option[value="0"]').hidden = src.kind !== 'gif';
  $('fps').value = src.kind === 'gif' ? '0' : '15';
  $('scale').value = anim ? '1' : '2';
  if (anim) {
    $('tStart').value = '0';
    $('tEnd').value = src.duration.toFixed(2);
    $('tStart').max = $('tEnd').max = src.duration.toFixed(2);
  }
  const canvas = $('stageCanvas');
  const k = Math.min(1, STAGE_MAX / Math.max(src.width, src.height));
  canvas.width = Math.max(1, Math.round(src.width * k));
  canvas.height = Math.max(1, Math.round(src.height * k));
  sizeStage();
}

function sizeStage() {
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

async function clearAll() {
  if (state.busy) return;
  if (state.result && !state.downloaded) {
    const ok = await ask('dlg.clear.title', 'dlg.clear.body', 'dlg.clear.ok');
    if (!ok) return;
  }
  stopPlay();
  if (state.source) state.source.dispose();
  state.source = null;
  state.file = null;
  state.lastDrawable = null;
  state.result = null;
  state.downloaded = false;
  state.urls.forEach((u) => URL.revokeObjectURL(u));
  state.urls = [];
  state.panels = state.panels.filter((p) => p.box !== $('uploadGuide'));
  estToken++;
  $('file').value = '';
  const info = $('fileInfo');
  info.setAttribute('data-i18n', 's1.sub');
  info.textContent = t('s1.sub');
  ['stepLayout', 'stepOutput', 'stepUpload', 'results'].forEach((id) => ($(id).hidden = true));
  $('uploadGuide').innerHTML = '';
  $('files').innerHTML = '';
  $('mock').innerHTML = '';
  $('outInfo').textContent = '';
  $('estInfo').textContent = '';
  setStatus('');
  setProgress(null);
  $('codesWrap').open = true;
  $('clearBtn').hidden = true;
  updateFab();
}

function buildLayoutTabs() {
  const box = $('layouts');
  for (const key in LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn layout';
    b.dataset.key = key;
    b.addEventListener('click', () => {
      state.layoutKey = key;
      $('gap').value = state.gaps[key];
      updateLayoutTabs();
      refresh();
    });
    box.appendChild(b);
  }
}

function updateLayoutTabs() {
  $('layouts').querySelectorAll('.layout').forEach((b) => {
    const key = b.dataset.key;
    b.classList.toggle('on', key === state.layoutKey);
    b.innerHTML = `${t('layout.' + key)}<small>${t('layout.cols', { n: LAYOUTS[key].widths.length })}</small>`;
  });
  $('layoutDesc').textContent = t('layout.' + state.layoutKey + '.desc');
  $('previewHead').textContent = t('show.' + LAYOUT_TARGETS[state.layoutKey][0]);
}

function clearPreset() {
  $('presets').querySelectorAll('button.on').forEach((x) => x.classList.remove('on'));
}

function fitAll() {
  clearPreset();
  const s = state.source;
  state.crop = { x: 0, y: 0, w: s.width, h: s.height };
  refresh();
}

function fitWidth() {
  clearPreset();
  state.crop.x = 0;
  state.crop.w = state.source.width;
  refresh();
}

function clampCrop() {
  const s = state.source;
  const c = state.crop;
  c.w = Math.max(8, Math.min(c.w, s.width));
  c.h = Math.max(8, Math.min(c.h, s.height));
  c.x = Math.max(0, Math.min(c.x, s.width - c.w));
  c.y = Math.max(0, Math.min(c.y, s.height - c.h));
}

function bindCrop() {
  $('fitAll').addEventListener('click', fitAll);
  $('fitWidth').addEventListener('click', fitWidth);
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
        // keep ratio, shrink w if h overflows
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

  const end = () => (drag = null);
  crop.addEventListener('pointerup', end);
  crop.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => {
    if (!state.source) return;
    sizeStage();
    refresh();
  });
}

function updateCropOverlay() {
  const s = state.source;
  const c = state.crop;
  const el = $('crop');
  el.style.left = (c.x / s.width) * 100 + '%';
  el.style.top = (c.y / s.height) * 100 + '%';
  el.style.width = (c.w / s.width) * 100 + '%';
  el.style.height = (c.h / s.height) * 100 + '%';

  const opt = options();
  const { slots, total } = computeSlots(layout(), opt);
  let html = '';
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

async function showAt(time) {
  drawFrame(await state.source.renderAt(time));
}

function drawFrame(drawable) {
  state.lastDrawable = drawable;
  const canvas = $('stageCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  drawPreview(drawable);
}

// real steam widths incl. gaps
function drawPreview(drawable) {
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

function refresh() {
  if (!state.source) return;
  updateCropOverlay();
  if (state.lastDrawable) drawPreview(state.lastDrawable);
  updateOutInfo();
  scheduleEstimate();
}

function bindTime() {
  const readRange = () => {
    const d = state.source.duration;
    const s = Math.max(0, Math.min(d, Number($('tStart').value) || 0));
    let e = Math.max(0, Math.min(d, Number($('tEnd').value) || d));
    if (e - s < 0.05) e = Math.min(d, s + 0.05);
    state.start = s;
    state.end = e;
    updateOutInfo();
    scheduleEstimate();
  };
  $('tStart').addEventListener('change', () => {
    readRange();
    if (!state.playing) seekPreview(state.start);
  });
  $('tEnd').addEventListener('change', readRange);

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

function updatePlayLabel() {
  $('playBtn').textContent = t(state.playing ? 's2.pause' : 's2.play');
}

function startPlay() {
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

function stopPlay() {
  if (!state.playing) return;
  state.playing = false;
  updatePlayLabel();
  if (state.source && state.source.kind === 'video') state.source.video.pause();
}

function bindOutput() {
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

function currentFps() {
  const fps = Number($('fps').value);
  if (state.source.kind === 'gif') return fps; // 0 = orig
  return fps || 15;
}

function frameEstimate() {
  const src = state.source;
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

function updateOutInfo() {
  if (!state.source) return;
  const geo = outputGeometry(layout(), options(), state.crop);
  const sizes = [...new Set(geo.panels.map((p) => `${p.w}×${geo.stripH}`))].join(' / ');
  const parts = [t('out.files', { n: geo.panels.length, size: sizes })];
  if (state.source.animated) {
    const n = frameEstimate();
    const max = frameCap(geo);
    parts.push(t('out.frames', { n, s: (state.end - state.start).toFixed(2) }));
    if (n > max) parts.push('⚠️ ' + t('out.cap', { max }));
  }
  if (geo.stripH > 2000) parts.push('⚠️ ' + t('out.tall'));
  $('outInfo').textContent = parts.join(' · ');
}

function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

function setProgress(p) {
  $('progress').hidden = p === null;
  if (p !== null) $('bar').style.width = Math.round(p * 100) + '%';
}

// to catch same-settings regen
function settingsSignature() {
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
  });
}

async function generate() {
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
    if (src.animated) {
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
      out = await exportAnimated(cap, { autoFit: $('autoFit').checked, hexify, onStatus: setStatus });
    } else {
      out = await exportStatic(src, { crop: state.crop, geo, bg: $('bg').value, hexify });
    }
    if (state.cancelled) throw new Error(t('st.cancelled'));
    setProgress(1);
    showResult(out, geo, sig);
    const over = out.files.some((f) => f.length > STEAM_LIMIT);
    let msg = t('st.done');
    if (out.frameCount < out.originalFrames) msg += ' ' + t('st.reduced', { a: out.originalFrames, b: out.frameCount });
    if (over) msg += ' ' + t('st.over');
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

// gif-1.gif, gif-2.gif... L->R
function fileNames(key, ext) {
  return LAYOUTS[key].widths.map((_, i) => `${ext}-${i + 1}.${ext}`);
}

function zipName() {
  const raw = state.source && state.source.kind === 'demo' ? 'sample' : (state.file && state.file.name) || 'steam';
  const base = raw.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'steam';
  return `cut_${base}.zip`;
}

function formatSize(n) {
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

function showResult(out, geo, sig) {
  state.urls.forEach((u) => URL.revokeObjectURL(u));
  const key = state.layoutKey;
  state.urls = out.files.map((b) => URL.createObjectURL(new Blob([b], { type: out.mime })));
  state.result = { out, geo, sig, layoutKey: key, gap: state.gaps[key], names: fileNames(key, out.ext), done: out.files.map(() => false) };
  state.downloaded = false;

  const L = LAYOUTS[key];
  const mock = $('mock');
  mock.innerHTML = '';
  state.urls.forEach((url, i) => {
    const img = document.createElement('img');
    img.src = url;
    img.style.width = L.widths[i] + 'px';
    img.style.height = geo.displayH + 'px';
    if (i > 0) img.style.marginLeft = state.result.gap + 'px';
    mock.appendChild(img);
  });
  $('resultHead').textContent = t('show.' + LAYOUT_TARGETS[key][0]);
  renderFiles();
  $('results').hidden = false;
  $('codesWrap').open = false;
  $('stepUpload').hidden = false;
  renderUploadGuide();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFiles() {
  const r = state.result;
  const list = $('files');
  list.innerHTML = '';
  r.out.files.forEach((bytes, i) => {
    const over = bytes.length > STEAM_LIMIT;
    const li = document.createElement('li');
    li.classList.toggle('is-done', r.done[i]);
    li.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="name">${r.names[i]}</span>
      <span class="size ${over ? 'over' : ''}">${formatSize(bytes.length)}${over ? ' · ' + t('res.over') : ''}</span>
      <a class="pill small" href="${state.urls[i]}" download="${r.names[i]}">${t('res.download')}</a>
      <button type="button" class="pill small copycode">${t('res.copyCode')}</button>
      <label class="done"><input type="checkbox" class="switch"${r.done[i] ? ' checked' : ''}>${t('res.uploaded')}</label>`;
    li.querySelector('a').addEventListener('click', () => (state.downloaded = true));
    li.querySelector('.copycode').addEventListener('click', () => copyText(currentUploadCode()));
    li.querySelector('.done input').addEventListener('change', (e) => {
      r.done[i] = e.target.checked;
      li.classList.toggle('is-done', r.done[i]);
      updateDone(true);
    });
    list.appendChild(li);
  });
  updateDone(false);
}

function updateDone(announce) {
  const r = state.result;
  const n = r.done.length;
  const d = r.done.filter(Boolean).length;
  $('doneCount').textContent = n > 1 ? t('res.progress', { d, n }) : '';
  if (announce && n && d === n) toast(t('res.allDone'));
}

async function downloadZip() {
  const r = state.result;
  if (!r) return;
  if (!window.JSZip) {
    alert(t('err.zip'));
    return;
  }
  const zip = new window.JSZip();
  r.out.files.forEach((b, i) => zip.file(r.names[i], b));
  zip.file('README.txt', guideText(r.layoutKey, r.names));
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = zipName();
  a.click();
  state.downloaded = true;
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function stepsFor(key, names) {
  const info = showcaseInfo(key);
  const file = names && names.length > 1 ? t('step.fileList') : names && names.length ? t('step.fileOne', { name: names[0] }) : t('step.fileAny');
  const title = state.merge ? t('step.titleBlank') : key === 'workshop' ? t('step.titleNum') : t('step.titleAny');
  return [
    t('step.open', { url: UPLOAD_URL, file }),
    title,
    t('step.console'),
    names && names.length > 1 ? t('step.saveList') : t('step.save', { repeat: info.repeat }),
    info.place,
  ];
}

function codeBox(label, code, extraBar = '') {
  return `<div class="code-block">
      <div class="code-label"><span>${label}</span>${extraBar}</div>
      <div class="codebox">
        <div class="codebox-bar">
          <span class="dots"><i></i><i></i><i></i></span>
          <span class="title">Console</span>
          <button type="button" class="copy" data-code="${encodeURIComponent(code)}">${t('code.copy')}</button>
        </div>
        <pre></pre>
      </div>
    </div>`;
}

// names optional
function renderCodePanel(box, keys, names) {
  const panel = {
    box,
    keys,
    names,
    current: keys[0],
    render() {
      const key = this.current;
      const info = showcaseInfo(key);
      const main = state.merge ? mergedCode(key) : mainCode(key);
      const tabs =
        keys.length > 1
          ? `<div class="code-tabs">${keys
              .map((k) => `<button type="button" class="seg-btn${k === key ? ' on' : ''}" data-k="${k}">${t('show.' + k)}</button>`)
              .join('')}</div>`
          : '';
      const mergeSwitch = `<label class="switch-row"><input type="checkbox" class="switch merge-toggle"${state.merge ? ' checked' : ''}>${t('code.merge')}</label>`;
      box.innerHTML = `${tabs}
        <p class="code-what">${info.what}</p>
        ${codeBox(t('code.main'), main, mergeSwitch)}
        ${state.merge ? '' : codeBox(t('code.blank'), blankCode()) + `<p class="meta blank-hint">${t('code.blankHint')}</p>`}
        <p class="check">${t('code.check')}</p>
        <ol class="howto">${stepsFor(key, this.names)
          .map((s) => `<li><div>${s}</div></li>`)
          .join('')}</ol>`;
      box.querySelectorAll('.code-block').forEach((b) => {
        const btn = b.querySelector('.copy');
        const code = decodeURIComponent(btn.dataset.code);
        b.querySelector('pre').textContent = code;
        btn.addEventListener('click', () => copyText(code));
      });
      box.querySelector('.merge-toggle').addEventListener('change', (e) => {
        state.merge = e.target.checked;
        state.panels.forEach((p) => p.render());
      });
      box.querySelectorAll('.code-tabs .seg-btn').forEach((b) =>
        b.addEventListener('click', () => {
          this.current = b.dataset.k;
          this.render();
        })
      );
    },
  };
  state.panels = state.panels.filter((p) => p.box !== box);
  state.panels.push(panel);
  panel.render();
}

function renderUploadGuide() {
  const r = state.result;
  renderCodePanel($('uploadGuide'), LAYOUT_TARGETS[r.layoutKey], r.names);
}

function guideText(layoutKey, names) {
  const plain = (s) => s.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
  const saved = state.merge;
  state.merge = false;
  const text = LAYOUT_TARGETS[layoutKey]
    .map((k) => {
      const steps = stepsFor(k, names).map((s, i) => `${i + 1}. ${plain(s)}`).join('\n');
      return `[${t('show.' + k)}]\n${UPLOAD_URL}\n\n${t('zip.code')}:\n${mainCode(k)}\n\n${t('zip.blank')}:\n${blankCode()}\n\n${steps}`;
    })
    .join('\n\n------------------------------\n\n');
  state.merge = saved;
  return `${t('zip.title')}\n\n${text}\n\n${t('zip.note')}\n`;
}

function currentUploadCode() {
  const panel = state.panels.find((p) => p.box === $('uploadGuide'));
  const key = panel ? panel.current : LAYOUT_TARGETS[state.result.layoutKey][0];
  return state.merge ? mergedCode(key) : mainCode(key);
}

let estTimer;
let estToken = 0;
function scheduleEstimate() {
  clearTimeout(estTimer);
  const el = $('estInfo');
  if (!state.source || !state.source.animated) {
    el.textContent = '';
    return;
  }
  estTimer = setTimeout(runEstimate, 500);
}

async function runEstimate() {
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
    });
    if (token !== estToken) return;
    const frames = Math.min(frameEstimate(), frameCap(geo));
    const total = perFrame * frames + 1024;
    if (total <= STEAM_LIMIT) {
      el.textContent = t('est.size', { size: formatSize(total) });
    } else if ($('autoFit').checked) {
      const n = Math.max(2, Math.floor(frames * (STEAM_LIMIT / total) * 0.92));
      const dur = Math.max(0.05, state.end - state.start);
      el.textContent = t('est.over', { n, fps: Math.max(1, Math.round(n / dur)) });
      el.className = 'meta est-info warn';
    } else {
      el.textContent = t('est.overOff');
      el.className = 'meta est-info bad';
    }
  } catch (e) {
    if (token === estToken) el.textContent = '';
  }
}

function bindDemo() {
  $('tryDemo').addEventListener('click', async () => {
    stopPlay();
    await openSource(new DemoSource(), { name: 'sample', size: 0, lastModified: 0 });
    $('stepLayout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // still until play, stops offscreen
  const canvas = $('demoCanvas');
  const src = document.createElement('canvas');
  src.width = src.height = 360;
  const sctx = src.getContext('2d');
  const L = LAYOUTS.workshop;
  const total = L.widths.reduce((a, b) => a + b, 0) + L.gap * (L.widths.length - 1);
  const STILL = 1.2;
  let playing = false;
  let clock0 = 0;

  const draw = (time) => {
    const k = Math.min(1, Math.min(440, $('demoBox').clientWidth - 52) / total);
    const w = Math.round(total * k);
    const h = Math.round(w * 0.9);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    drawDemo(sctx, src.width, src.height, time);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.clearRect(0, 0, total, h / k);
    let x = 0;
    const sh = src.height * 0.9;
    L.widths.forEach((sw) => {
      const sx = (x / total) * src.width;
      ctx.drawImage(src, sx, 0, (sw / total) * src.width, sh, x, 0, sw, h / k);
      x += sw + L.gap;
    });
  };
  const loop = (now) => {
    if (!playing) return;
    draw(STILL + (now - clock0) / 1000);
    requestAnimationFrame(loop);
  };
  const setPlaying = (on) => {
    playing = on;
    state.demoPlaying = on;
    $('demoPlay').textContent = t(on ? 's2.pause' : 's2.play');
    if (on) {
      clock0 = performance.now();
      requestAnimationFrame(loop);
    }
  };
  state.updateDemoLabel = () => ($('demoPlay').textContent = t(playing ? 's2.pause' : 's2.play'));
  $('demoPlay').addEventListener('click', () => setPlaying(!playing));
  new IntersectionObserver((es) => !es[0].isIntersecting && playing && setPlaying(false)).observe(canvas);
  window.addEventListener('resize', () => !playing && !$('demoBox').hidden && draw(STILL));
  setPlaying(false);

  const toggle = $('demoToggle');
  const setOpen = (open) => {
    $('demoBox').hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('on', open);
    toggle.textContent = t(open ? 'demo.hide' : 'demo.show');
    if (open) draw(STILL);
    else setPlaying(false);
  };
  toggle.addEventListener('click', () => setOpen($('demoBox').hidden));
  state.updateDemoToggle = () => (toggle.textContent = t($('demoBox').hidden ? 'demo.show' : 'demo.hide'));
  setOpen(false);
}

function bindPresets() {
  $('presets').querySelectorAll('button').forEach((b) =>
    b.addEventListener('click', () => {
      if (!state.source) return;
      const r = Number(b.dataset.r); // disp h = strip w * r
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
    })
  );
}

// fab: step 2 only, when go btn offscreen
const seen = { go: false, stepLayout: false };
function updateFab() {
  $('fab').hidden = !state.source || state.busy || seen.go || !seen.stepLayout;
}
function bindFab() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => (seen[e.target.id] = e.isIntersecting));
    updateFab();
  });
  io.observe($('go'));
  io.observe($('stepLayout'));
  $('fab').addEventListener('click', () => {
    $('stepOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
    generate();
  });
}

function ask(titleKey, bodyKey, okKey, { noCancel = false } = {}) {
  return new Promise((resolve) => {
    const m = $('modal');
    $('mTitle').textContent = t(titleKey);
    $('mBody').textContent = t(bodyKey);
    $('mOk').textContent = t(okKey);
    $('mCancel').textContent = t('dlg.cancel');
    $('mCancel').hidden = noCancel;
    m.hidden = false;
    const done = (v) => {
      m.hidden = true;
      $('mOk').onclick = $('mCancel').onclick = m.onclick = document.onkeydown = null;
      resolve(v);
    };
    $('mOk').onclick = () => done(true);
    $('mCancel').onclick = () => done(false);
    m.onclick = (e) => e.target === m && done(false);
    document.onkeydown = (e) => e.key === 'Escape' && done(false);
    (noCancel ? $('mOk') : $('mCancel')).focus();
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(t('code.copied'));
}

let toastTimer;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

init();
