// fake music player text for the guide showcase
// NOTE steam eats newlines in the desc! bar + controls = 1 line, wraps by width
// font isn't monospace so it's never pixel perfect

export const DOTS = ['⚪️', '●', '○', '◉', '🔘'];

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// "4:03" / "1:02:03" / "243" -> sec, NaN = bad input
export function parseTime(str) {
  const parts = String(str).trim().split(':');
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN;
  return parts.reduce((acc, p) => acc * 60 + Number(p), 0);
}

export function buildBar(pos, dur, len, dot) {
  len = Math.max(5, Math.round(len));
  const k = dur > 0 ? Math.round(Math.min(1, Math.max(0, pos / dur)) * (len - 1)) : 0;
  return '─'.repeat(k) + dot + '─'.repeat(len - 1 - k);
}

// title -> guide title box, desc -> guide description box
export function buildPlayerParts({ title, artist, pos, dur, len, dot, playing }) {
  const btn = playing ? '▐▐' : '►';
  const ctl = `◄◄⠀${btn} ⠀►►⠀⠀　　⠀${fmtTime(pos)}/${fmtTime(dur)}　　 ──○─🔊⠀　　　ᴴᴰ ⚙️ ❐⊏⊐`;
  return { title: [title, artist].filter(Boolean).join(' '), desc: buildBar(pos, dur, len, dot) + ' ' + ctl };
}
