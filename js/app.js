// main. wires everything up
import { LAYOUT_TARGETS } from './codes.js';
import { bindDemo } from './demo.js';
import { bindOutput } from './generate.js';
import { bindGuide, updateModeUI, updateSpinLabel } from './guide-ui.js';
import { applyDom, initI18n, markLang, mountLangSwitch, t } from './i18n.js';
import { LAYOUTS } from './layout.js';
import { bindTime, refresh, updatePlayLabel } from './preview.js';
import { renderFiles } from './results.js';
import { bindFileInput, clearAll, showFileInfo } from './source.js';
import { bindCrop, bindPresets, buildLayoutTabs, updateLayoutTabs } from './stage.js';
import { bindPrefs, loadPrefs, resetPrefs } from './prefs.js';
import { $, ALL_SHOWCASES, state } from './state.js';
import { ask, bindFab, mobileNotice } from './ui.js';
import { renderCodePanel, renderUploadGuide } from './upload-panel.js';

export function init() {
  for (const k in LAYOUTS) state.gaps[k] = LAYOUTS[k].gap;
  loadPrefs();
  mountLangSwitch($('lang'), applyLanguage);
  buildLayoutTabs();
  bindFileInput();
  bindCrop();
  bindTime();
  bindOutput();
  bindFab();
  bindDemo();
  bindGuide();
  $('clearBtn').addEventListener('click', clearAll);
  bindPresets();
  bindPrefs();
  $('resetPrefs').addEventListener('click', async () => {
    if (!(await ask('dlg.reset.title', 'dlg.reset.body', 'dlg.reset.ok'))) return;
    resetPrefs();
    location.reload();
  });
  document.querySelectorAll('a[href="#codes"]').forEach((a) => a.addEventListener('click', () => ($('codesWrap').open = true)));
  $('gap').value = state.gaps[state.layoutKey];
  renderCodePanel($('codePanel'), ALL_SHOWCASES);
  applyLanguage();
  mobileNotice();
}

export function applyLanguage() {
  applyDom();
  updateModeUI();
  markLang($('lang'));
  updateLayoutTabs();
  updatePlayLabel();
  updateSpinLabel();
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

await initI18n();
init();
