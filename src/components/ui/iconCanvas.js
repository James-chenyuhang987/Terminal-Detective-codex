import { ICON_PATHS, resolveIconName } from './iconData.js';

export function drawIcon(ctx, name, x, y, size = 24, color = '#c5a66f') {
  if (!ctx || typeof Path2D === 'undefined') return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 0;
  for (const path of ICON_PATHS[resolveIconName(name)]) ctx.stroke(new Path2D(path));
  ctx.restore();
}
