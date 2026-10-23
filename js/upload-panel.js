// upload steps + code panels
import { blankCode, GUIDE_URL, GUIDE_URL_STEAM, LAYOUT_TARGETS, mainCode, mergedCode, showcaseInfo, UPLOAD_URL } from './codes.js';
import { t } from './i18n.js';
import { $, layout, state } from './state.js';
import { copyText } from './ui.js';

// code tab at the bottom follows the layout
export function syncCodeTab() {
  const panel = state.panels.find((p) => p.box === $('codePanel'));
  if (!panel) return;
  panel.current = LAYOUT_TARGETS[state.layoutKey][0];
  panel.render();
}

export function stepsFor(key, names) {
  const info = showcaseInfo(key);
  if (key === 'guide') {
    const file = names && names.length ? t('step.fileOne', { name: names[0] }) : t('step.fileAny');
    return [
      t('gstep.open', { url: GUIDE_URL, file }) + `<br><span class="meta">${t('gstep.alt', { url: GUIDE_URL_STEAM })}</span>`,
      t('gstep.title'),
      t('gstep.save'),
      t('gstep.public'),
      info.place,
    ];
  }
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

export function codeBox(label, code, extraBar = '') {
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
export function renderCodePanel(box, keys, names) {
  const panel = {
    box,
    keys,
    names,
    current: keys[0],
    render() {
      const key = this.current;
      const info = showcaseInfo(key);
      const main = key === 'guide' ? '' : state.merge ? mergedCode(key) : mainCode(key);
      const tabs =
        keys.length > 1
          ? `<div class="code-tabs">${keys
              .map((k) => `<button type="button" class="seg-btn${k === key ? ' on' : ''}" data-k="${k}">${t('show.' + k)}</button>`)
              .join('')}</div>`
          : '';
      const mergeSwitch = `<label class="switch-row"><input type="checkbox" class="switch merge-toggle"${state.merge ? ' checked' : ''}>${t('code.merge')}</label>`;
      const codes =
        key === 'guide'
          ? ''
          : `${codeBox(t('code.main'), main, mergeSwitch)}
        ${state.merge ? '' : codeBox(t('code.blank'), blankCode()) + `<p class="meta blank-hint">${t('code.blankHint')}</p>`}
        <p class="check">${t('code.check')}</p>`;
      box.innerHTML = `${tabs}
        <p class="code-what">${info.what}</p>
        ${codes}
        <ol class="howto">${stepsFor(key, this.names)
          .map((s) => `<li><div>${s}</div></li>`)
          .join('')}</ol>`;
      box.querySelectorAll('.code-block').forEach((b) => {
        const btn = b.querySelector('.copy');
        const code = decodeURIComponent(btn.dataset.code);
        b.querySelector('pre').textContent = code;
        btn.addEventListener('click', () => copyText(code));
      });
      const mt = box.querySelector('.merge-toggle');
      if (mt) mt.addEventListener('change', (e) => {
        state.merge = e.target.checked;
        state.panels.forEach((p) => p.render());
      });
      box.querySelectorAll('.code-tabs .seg-btn').forEach((b) =>
        b.addEventListener('click', () => {
          // hold the height so a shorter tab (guide) doesn't make the page jump
          box.style.minHeight = box.offsetHeight + 'px';
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

export function renderUploadGuide() {
  const r = state.result;
  renderCodePanel($('uploadGuide'), LAYOUT_TARGETS[r.layoutKey], r.names);
}

export function guideText(layoutKey, names) {
  const plain = (s) => s.replace(/<br>/g, ' ').replace(/<[^>]+>/g, '');
  const saved = state.merge;
  state.merge = false;
  const text = LAYOUT_TARGETS[layoutKey]
    .map((k) => {
      const steps = stepsFor(k, names).map((s, i) => `${i + 1}. ${plain(s)}`).join('\n');
      if (k === 'guide') return `[${t('show.guide')}]\n${GUIDE_URL}\n\n${steps}`;
      return `[${t('show.' + k)}]\n${UPLOAD_URL}\n\n${t('zip.code')}:\n${mainCode(k)}\n\n${t('zip.blank')}:\n${blankCode()}\n\n${steps}`;
    })
    .join('\n\n------------------------------\n\n');
  state.merge = saved;
  return `${t('zip.title')}\n\n${text}\n\n${t('zip.note')}\n`;
}

export function currentUploadCode() {
  const panel = state.panels.find((p) => p.box === $('uploadGuide'));
  const key = panel ? panel.current : LAYOUT_TARGETS[state.result.layoutKey][0];
  return state.merge ? mergedCode(key) : mainCode(key);
}
