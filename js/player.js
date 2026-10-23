// player text ctrls, only for music files. lazy loaded
import { t } from './i18n.js';
import { readAudioMeta } from './audio-meta.js';
import { DOTS, fmtTime, parseTime, buildPlayerParts } from './player-text.js';
import { readPrefs } from './prefs.js';

const $ = (id) => document.getElementById(id);
const st = { title: '', artist: '', dur: 326, pos: 243, len: 44, dot: DOTS[0], playing: true };
let parts = { title: '', desc: '' };

function render() {
  parts = buildPlayerParts(st);
  $('scTitle').textContent = parts.title;
  $('scDesc').textContent = parts.desc;
  $('pRange').max = String(Math.max(1, Math.round(st.dur)));
  $('pRange').value = String(Math.round(st.pos));
  $('pLenVal').textContent = String(st.len);
}

function setTimeField(id, sec) {
  $(id).value = fmtTime(sec);
  $(id).classList.remove('bad');
}

function bindTimeInput(id, apply) {
  $(id).addEventListener('change', () => {
    const v = parseTime($(id).value);
    if (!Number.isFinite(v)) {
      $(id).classList.add('bad');
      $(id).title = t('p.badTime');
      return;
    }
    $(id).classList.remove('bad');
    apply(v);
    render();
  });
}

export async function fillPlayerFrom(file) {
  initPlayer();
  const m = await readAudioMeta(file);
  st.title = m.title;
  st.artist = m.artist;
  $('pTitle').value = st.title;
  $('pArtist').value = st.artist;
  if (Number.isFinite(m.duration)) {
    st.dur = m.duration;
    st.pos = Math.round(st.dur * 0.75);
    setTimeField('pTotal', st.dur);
    setTimeField('pPos', st.pos);
  }
  render();
}

let ready = false;
export function initPlayer() {
  if (ready) return;
  ready = true;
  const pp = readPrefs().player || {};
  if (pp.len >= 15 && pp.len <= 70) st.len = pp.len;
  if (DOTS.includes(pp.dot)) st.dot = pp.dot;
  if (pp.state) st.playing = pp.state !== 'paused';
  $('pTitle').addEventListener('input', () => {
    st.title = $('pTitle').value;
    render();
  });
  $('pArtist').addEventListener('input', () => {
    st.artist = $('pArtist').value;
    render();
  });
  bindTimeInput('pTotal', (v) => {
    st.dur = Math.max(1, Math.round(v));
    st.pos = Math.min(st.pos, st.dur);
    setTimeField('pTotal', st.dur);
    setTimeField('pPos', st.pos);
  });
  bindTimeInput('pPos', (v) => {
    st.pos = Math.min(Math.round(v), st.dur);
    setTimeField('pPos', st.pos);
  });
  $('pRange').addEventListener('input', () => {
    st.pos = Number($('pRange').value);
    setTimeField('pPos', st.pos);
    render();
  });
  $('pLen').addEventListener('input', () => {
    st.len = Number($('pLen').value);
    render();
  });
  $('pDot').innerHTML = DOTS.map((d) => `<option value="${d}">${d}</option>`).join('');
  $('pDot').addEventListener('change', () => {
    st.dot = $('pDot').value;
    render();
  });
  $('pState').addEventListener('change', () => {
    st.playing = $('pState').value === 'playing';
    render();
  });
  $('pCopyTitle').addEventListener('click', () => copy(parts.title));
  $('pCopyDesc').addEventListener('click', () => copy(parts.desc));

  $('pTitle').value = st.title;
  $('pArtist').value = st.artist;
  setTimeField('pTotal', st.dur);
  setTimeField('pPos', st.pos);
  $('pLen').value = String(st.len);
  $('pDot').value = st.dot;
  $('pState').value = st.playing ? 'playing' : 'paused';
  render();
}

async function copy(text) {
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
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = t('p.copied');
  el.classList.add('show');
  clearTimeout(copy.timer);
  copy.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

