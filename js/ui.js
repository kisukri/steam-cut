// misc ui: status, progress, dialog, toast, fab
import { generate } from './generate.js';
import { t } from './i18n.js';
import { $, state } from './state.js';

export function setStatus(text, cls = '') {
  const el = $('status');
  el.textContent = text;
  el.className = 'status ' + cls;
}

export function setProgress(p) {
  $('progress').hidden = p === null;
  if (p !== null) $('bar').style.width = Math.round(p * 100) + '%';
}

export function ask(titleKey, bodyKey, okKey, { noCancel = false } = {}) {
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

export async function copyText(text) {
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

export function toast(msg, ms = 2200) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}


export function formatSize(n) {
  return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
}

// phone warning, once per session
export function mobileNotice() {
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

// floating go btn, only when the real one is off screen
const seen = { go: false, stepLayout: false };

export function updateFab() {
  $('fab').hidden = !state.source || state.busy || seen.go || !seen.stepLayout;
}

export function bindFab() {
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
