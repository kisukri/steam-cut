// shared state + small helpers
import { LAYOUTS } from './layout.js';

export const $ = (id) => document.getElementById(id);

export const STAGE_MAX = 1280; // stage canvas max px

export const PREVIEW_MAX_H = 520;

// max clip sec. longer just turns into a slideshow at 5MB
export const MAX_CLIP = 20;
export const ALL_SHOWCASES = ['workshop', 'artwork', 'screenshot', 'featured', 'guide'];

export const state = {
  source: null,
  file: null,
  layoutKey: 'workshop',
  crop: { x: 0, y: 0, w: 1, h: 1 },
  gaps: {},
  start: 0,
  end: 0,
  playing: false,
  playClock: 0,
  lastDrawable: null,
  busy: false,
  cancelled: false,
  merge: false, // blank title code merged into main one
  guide: { style: 'vinyl', period: 4, dir: 1, transparent: true, spin: true, edge: 44, hole: true },
  spin: { on: false, angle: 0, last: 0 },
  userLock: false,
  result: null, // { out, geo, names, layoutKey, sig }
  downloaded: false,
  urls: [],
  panels: [],
};

export function layout() {
  return LAYOUTS[state.layoutKey];
}

export function options() {
  return {
    gap: state.gaps[state.layoutKey],
    removeGaps: $('removeGaps').checked,
    scale: Number($('scale').value),
  };
}

export function isGuide() {
  return state.layoutKey === 'guide';
}
