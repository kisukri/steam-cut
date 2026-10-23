// results: file list + downloads
import { LAYOUT_TARGETS } from './codes.js';
import { limitMB, sizeLimit } from './export.js';
import { t } from './i18n.js';
import { LAYOUTS } from './layout.js';
import { $, state } from './state.js';
import { copyText, formatSize, toast } from './ui.js';
import { currentUploadCode, guideText, renderUploadGuide } from './upload-panel.js';

// gif-1.gif, gif-2.gif... left to right, = upload order
export function fileNames(key, ext) {
  return LAYOUTS[key].widths.map((_, i) => `${ext}-${i + 1}.${ext}`);
}

export function zipName() {
  const raw = state.source && state.source.kind === 'demo' ? 'sample' : (state.file && state.file.name) || 'steam';
  const base = raw.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'steam';
  return `cut_${base}.zip`;
}

export function showResult(out, geo, sig) {
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

export function renderFiles() {
  const r = state.result;
  const list = $('files');
  list.innerHTML = '';
  r.out.files.forEach((bytes, i) => {
    const over = bytes.length > sizeLimit(r.layoutKey);
    const li = document.createElement('li');
    li.classList.toggle('is-done', r.done[i]);
    li.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span class="name">${r.names[i]}</span>
      <span class="size ${over ? 'over' : ''}">${formatSize(bytes.length)}${over ? ' · ' + t('res.over', { mb: limitMB(r.layoutKey) }) : ''}</span>
      <a class="pill small" href="${state.urls[i]}" download="${r.names[i]}">${t('res.download')}</a>
      <button type="button" class="pill small copycode">${t('res.copyCode')}</button>
      <label class="done"><input type="checkbox" class="switch"${r.done[i] ? ' checked' : ''}>${t('res.uploaded')}</label>`;
    li.querySelector('a').addEventListener('click', () => (state.downloaded = true));
    const cc = li.querySelector('.copycode');
    if (r.layoutKey === 'guide') cc.remove();
    else cc.addEventListener('click', () => copyText(currentUploadCode()));
    li.querySelector('.done input').addEventListener('change', (e) => {
      r.done[i] = e.target.checked;
      li.classList.toggle('is-done', r.done[i]);
      updateDone(true);
    });
    list.appendChild(li);
  });
  updateDone(false);
}

export function updateDone(announce) {
  const r = state.result;
  const n = r.done.length;
  const d = r.done.filter(Boolean).length;
  $('doneCount').textContent = n > 1 ? t('res.progress', { d, n }) : '';
  if (announce && n && d === n) toast(t('res.allDone'));
}

// jszip ~100KB, only load when zip clicked
let zipLoading;
function loadJSZip() {
  if (window.JSZip) return Promise.resolve();
  zipLoading =
    zipLoading ||
    new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/jszip.min.js', import.meta.url).href;
      s.onload = ok;
      s.onerror = () => {
        zipLoading = null;
        fail(new Error('jszip'));
      };
      document.head.appendChild(s);
    });
  return zipLoading;
}

export async function downloadZip() {
  const r = state.result;
  if (!r) return;
  try {
    await loadJSZip();
  } catch (e) {
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
