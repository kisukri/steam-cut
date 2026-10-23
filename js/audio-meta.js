// song name/artist from tags, length from <audio>. tags can be junk, fall back to filename
import { readTags } from './cover.js';

export function readDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (fn, v) => {
      clearTimeout(timer);
      a.removeAttribute('src');
      URL.revokeObjectURL(url);
      fn(v);
    };
    const timer = setTimeout(() => done(reject, new Error('timeout')), 10000);
    a.preload = 'metadata';
    a.onloadedmetadata = () => (Number.isFinite(a.duration) && a.duration > 0 ? done(resolve, a.duration) : done(reject, new Error('nodur')));
    a.onerror = () => done(reject, new Error('decode'));
    a.src = url;
  });
}

export async function readAudioMeta(file) {
  const [tags, dur] = await Promise.allSettled([readTags(file), readDuration(file)]);
  const tg = tags.status === 'fulfilled' && tags.value ? tags.value : {};
  return {
    title: tg.title || file.name.replace(/\.[^.]+$/, ''),
    artist: tg.artist || '',
    duration: dur.status === 'fulfilled' ? dur.value : NaN,
  };
}
