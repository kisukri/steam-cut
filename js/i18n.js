// lang pick order: ?lang= > saved > browser > zh
// 1 file per lang, only load the one we need
export const LANGS = { zh: '中文', en: 'EN', ja: '日本語' };
const DEFAULT = 'zh';
const STORE_KEY = 'ssc-lang';

const D = {};

export async function loadLang(l) {
  if (!D[l]) D[l] = (await import(`./lang/${l}.js`)).default;
}

function pickInitial() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && LANGS[q]) return q;
  } catch (e) {}
  try {
    const s = localStorage.getItem(STORE_KEY);
    if (s && LANGS[s]) return s;
  } catch (e) {}
  for (const l of navigator.languages || [navigator.language || '']) {
    const k = String(l).toLowerCase().slice(0, 2);
    if (LANGS[k]) return k;
  }
  return DEFAULT;
}

let lang = pickInitial();

export function getLang() {
  return lang;
}

export async function initI18n() {
  await loadLang(lang);
}

export async function setLang(l) {
  if (!LANGS[l]) return;
  await loadLang(l);
  lang = l;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch (e) {}
}

export function t(key, vars) {
  let s = (D[lang] && D[lang][key]) ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
  return s;
}

export function applyDom(root = document) {
  document.documentElement.lang = { ja: 'ja', zh: 'zh-CN', en: 'en' }[lang];
  document.title = t('app.title');
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml, el.dataset.i18nVars ? JSON.parse(el.dataset.i18nVars) : undefined);
  });
}

// lang btns, faq page uses this too
export function mountLangSwitch(box, onChange) {
  for (const k in LANGS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.l = k;
    b.textContent = LANGS[k];
    b.addEventListener('click', async () => {
      await setLang(k);
      onChange();
    });
    box.appendChild(b);
  }
}

export function markLang(box) {
  box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.l === lang));
}
