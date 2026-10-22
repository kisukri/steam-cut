// display widths, css px (steam.design cfg / profilev2.css)
// gaps vary ~1px between sources, tweakable in adv
export const LAYOUTS = {
  workshop: {
    key: 'workshop',
    widths: [122.4, 122.4, 122.4, 122.4, 122.4],
    gap: 4,
  },
  artwork: {
    key: 'artwork',
    widths: [506, 100],
    gap: 9,
  },
  featured: {
    key: 'featured',
    widths: [630],
    gap: 0,
  },
};

// removeGaps: cut gaps out of src so seams line up
export function computeSlots(layout, { gap, removeGaps }) {
  const g = removeGaps ? gap : 0;
  const slots = [];
  let x = 0;
  layout.widths.forEach((w, i) => {
    slots.push({ x, w });
    x += w + (i < layout.widths.length - 1 ? g : 0);
  });
  return { slots, total: x };
}

export function outputGeometry(layout, opts, crop) {
  const { slots, total } = computeSlots(layout, opts);
  const scale = opts.scale;
  const displayH = (total * crop.h) / crop.w;
  const stripW = Math.round(total * scale);
  const stripH = Math.max(1, Math.round(displayH * scale));
  const panels = slots.map((s) => {
    const x = Math.round(s.x * scale);
    const w = Math.min(Math.round(s.w * scale), stripW - x);
    return { x, w };
  });
  return { slots, total, displayH, stripW, stripH, panels };
}
