// open / clear files
import { cancelEstimate } from './generate.js';
import { stopSpin, updateModeUI } from './guide-ui.js';
import { t } from './i18n.js';
import { loadSource } from './media.js';
import { showAt, stopPlay } from './preview.js';
import { fitAll, resetCropHistory, selectLayout, sizeStage, squareCrop } from './stage.js';
import { $, isGuide, MAX_CLIP, STAGE_MAX, state } from './state.js';
import { ask, setProgress, setStatus, toast, updateFab } from './ui.js';

export function bindFileInput() {
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

export function showFileInfo() {
  const src = state.source;
  const info = $('fileInfo');
  info.removeAttribute('data-i18n');
  const name =
    src.kind === 'demo'
      ? t('demo.name')
      : src.kind === 'audio' && src.audio.title
        ? src.audio.title + (src.audio.artist ? ' - ' + src.audio.artist : '')
        : state.file.name;
  info.textContent =
    `${name} · ${t('kind.' + src.kind)} · ${src.width}×${src.height}` +
    (src.animated ? ` · ${src.duration.toFixed(2)} ${t('unit.sec')}` : '');
}

export async function openFile(file) {
  stopPlay();
  const info = $('fileInfo');
  info.removeAttribute('data-i18n');
  info.textContent = t('s1.reading');
  try {
    await openSource(await loadSource(file), file);
  } catch (err) {
    // bad new file shouldn't kill the one already loaded
    if (state.source) {
      showFileInfo();
      toast('❌ ' + err.message, 5000);
    } else info.textContent = '❌ ' + err.message;
  }
}

export async function openSource(src, file) {
  {
    if (state.source) state.source.dispose();
    state.source = src;
    state.file = file;
    state.start = 0;
    state.end = src.animated ? Math.min(src.duration, MAX_CLIP) : 0;
    showFileInfo();
    $('stepLayout').hidden = false;
    $('stepOutput').hidden = false;
    setupForSource();
    fitAll();
    resetCropHistory();
    await showAt(0);
    // music -> go straight to vinyl + fill player text
    if (src.kind === 'audio') {
      import('./player.js').then((m) => m.fillPlayerFrom(file));
      state.guide.style = 'vinyl';
      $('gStyle').querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.v === 'vinyl'));
      if (isGuide()) squareCrop();
      else selectLayout('guide');
    }
    updateFab();
    $('clearBtn').hidden = false;
  }
}

export function setupForSource() {
  const src = state.source;
  const anim = src.animated;
  $('timeBox').hidden = !anim;
  // can't read video fps, so 'orig' is gif only
  $('fps').querySelector('option[value="0"]').hidden = src.kind !== 'gif';
  $('fps').value = src.kind === 'gif' ? '0' : isGuide() ? '25' : '15';
  $('scale').value = anim || isGuide() ? '1' : '2';
  updateModeUI();
  if (anim) {
    $('tStart').value = '0';
    $('tEnd').value = +state.end.toFixed(2);
    $('tStart').max = $('tEnd').max = src.duration.toFixed(2);
  }
  const canvas = $('stageCanvas');
  const k = Math.min(1, STAGE_MAX / Math.max(src.width, src.height));
  canvas.width = Math.max(1, Math.round(src.width * k));
  canvas.height = Math.max(1, Math.round(src.height * k));
  sizeStage();
}

export async function clearAll() {
  if (state.busy) return;
  if (state.result && !state.downloaded) {
    const ok = await ask('dlg.clear.title', 'dlg.clear.body', 'dlg.clear.ok');
    if (!ok) return;
  }
  stopPlay();
  stopSpin();
  if (state.source) state.source.dispose();
  state.source = null;
  state.file = null;
  state.lastDrawable = null;
  state.result = null;
  state.downloaded = false;
  state.urls.forEach((u) => URL.revokeObjectURL(u));
  state.urls = [];
  state.panels = state.panels.filter((p) => p.box !== $('uploadGuide'));
  cancelEstimate();
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
