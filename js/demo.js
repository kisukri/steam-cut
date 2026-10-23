// sample box
import { t } from './i18n.js';
import { LAYOUTS } from './layout.js';
import { stopPlay } from './preview.js';
import { openSource } from './source.js';
import { $, state } from './state.js';

let mod;
const loadDemo = async () => (mod = mod || (await import('./demo-src.js')));

export function bindDemo() {
  $('tryDemo').addEventListener('click', async () => {
    stopPlay();
    const { DemoSource } = await loadDemo();
    await openSource(new DemoSource(), { name: 'sample', size: 0, lastModified: 0 });
    $('stepLayout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // don't animate till play, pause when scrolled away (battery)
  const canvas = $('demoCanvas');
  const src = document.createElement('canvas');
  src.width = src.height = 360;
  const sctx = src.getContext('2d');
  const L = LAYOUTS.workshop;
  const total = L.widths.reduce((a, b) => a + b, 0) + L.gap * (L.widths.length - 1);
  const STILL = 1.2;
  let playing = false;
  let clock0 = 0;

  const draw = (time) => {
    const k = Math.min(1, Math.min(440, $('demoBox').clientWidth - 52) / total);
    const w = Math.round(total * k);
    const h = Math.round(w * 0.9);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    if (!mod) return;
    mod.drawDemo(sctx, src.width, src.height, time);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.clearRect(0, 0, total, h / k);
    let x = 0;
    const sh = src.height * 0.9;
    L.widths.forEach((sw) => {
      const sx = (x / total) * src.width;
      ctx.drawImage(src, sx, 0, (sw / total) * src.width, sh, x, 0, sw, h / k);
      x += sw + L.gap;
    });
  };
  const loop = (now) => {
    if (!playing) return;
    draw(STILL + (now - clock0) / 1000);
    requestAnimationFrame(loop);
  };
  const setPlaying = (on) => {
    playing = on;
    state.demoPlaying = on;
    $('demoPlay').textContent = t(on ? 's2.pause' : 's2.play');
    if (on) {
      clock0 = performance.now();
      requestAnimationFrame(loop);
    }
  };
  state.updateDemoLabel = () => ($('demoPlay').textContent = t(playing ? 's2.pause' : 's2.play'));
  $('demoPlay').addEventListener('click', () => setPlaying(!playing));
  new IntersectionObserver((es) => !es[0].isIntersecting && playing && setPlaying(false)).observe(canvas);
  window.addEventListener('resize', () => !playing && !$('demoBox').hidden && draw(STILL));
  setPlaying(false);

  const toggle = $('demoToggle');
  const setOpen = async (open) => {
    if (open) await loadDemo();
    $('demoBox').hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.classList.toggle('on', open);
    toggle.textContent = t(open ? 'demo.hide' : 'demo.show');
    if (open) draw(STILL);
    else setPlaying(false);
  };
  toggle.addEventListener('click', () => setOpen($('demoBox').hidden));
  state.updateDemoToggle = () => (toggle.textContent = t($('demoBox').hidden ? 'demo.show' : 'demo.hide'));
  setOpen(false);
}
