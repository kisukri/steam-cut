import { t, applyDom, initI18n, markLang, mountLangSwitch } from './i18n.js';
import { UPLOAD_URL } from './codes.js';

const $ = (id) => document.getElementById(id);
const COUNT = 9;

function render() {
  applyDom();
  document.title = `${t('faq.title')} · ${t('app.title')}`;
  markLang($('lang'));
  const box = $('faqList');
  const open = [...box.querySelectorAll('details')].map((d) => d.open);
  box.innerHTML = '';
  for (let i = 1; i <= COUNT; i++) {
    const d = document.createElement('details');
    d.open = open[i - 1] || false;
    d.innerHTML = `<summary>${t('faq.q' + i)}</summary><p>${t('faq.a' + i, { url: UPLOAD_URL })}</p>`;
    box.appendChild(d);
  }
}

await initI18n();
mountLangSwitch($('lang'), render);
render();
