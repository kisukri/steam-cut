import { LANGS, t, getLang, setLang, applyDom } from './i18n.js';
import { UPLOAD_URL } from './codes.js';

const $ = (id) => document.getElementById(id);
const COUNT = 8;

function render() {
  applyDom();
  document.title = `${t('faq.title')} · ${t('app.title')}`;
  $('lang').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.l === getLang()));
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

for (const k in LANGS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.l = k;
  b.textContent = LANGS[k];
  b.addEventListener('click', () => {
    setLang(k);
    render();
  });
  $('lang').appendChild(b);
}
render();
