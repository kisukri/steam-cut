import { $, state } from './state.js';

const KEY = 'ssc-prefs';
const SWITCHES = ['removeGaps', 'autoFit', 'hexify'];

export function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}

export function loadPrefs() {
  const p = readPrefs();
  if (p.layoutKey && p.layoutKey in state.gaps) state.layoutKey = p.layoutKey;
  if (p.gaps) for (const k in p.gaps) if (k in state.gaps && Number.isFinite(p.gaps[k])) state.gaps[k] = p.gaps[k];
  if (p.guide) Object.assign(state.guide, p.guide);
  if (typeof p.merge === 'boolean') state.merge = p.merge;
  if (p.colors) $('colors').value = p.colors;
  if (p.fitMode === 'quality' || p.fitMode === 'smooth') $('fitMode').value = p.fitMode;
  if (p.bg) $('bg').value = p.bg;
  SWITCHES.forEach((id) => typeof p[id] === 'boolean' && ($(id).checked = p[id]));

  const g = state.guide;
  $('gPeriod').value = String(g.period);
  $('gDir').value = String(g.dir);
  $('gSpin').checked = g.spin;
  $('gEdge').value = String(g.edge);
  $('gEdgeVal').textContent = g.edge + '%';
  $('gHole').checked = g.hole;
  $('gTransparent').checked = g.transparent;
}

let timer;
let off = false;
export function savePrefs() {
  clearTimeout(timer);
  if (off) return;
  timer = setTimeout(() => {
    const p = {
      layoutKey: state.layoutKey,
      gaps: state.gaps,
      guide: state.guide,
      merge: state.merge,
      colors: $('colors').value,
      fitMode: $('fitMode').value,
      bg: $('bg').value,
      player: readPrefs().player,
    };
    SWITCHES.forEach((id) => (p[id] = $(id).checked));
    if (!$('playerCtl').hidden) p.player = { len: Number($('pLen').value), dot: $('pDot').value, state: $('pState').value };
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch (e) {}
  }, 300);
}

export function resetPrefs() {
  off = true;
  clearTimeout(timer);
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}

export function bindPrefs() {
  ['change', 'click'].forEach((ev) => document.addEventListener(ev, savePrefs));
}
