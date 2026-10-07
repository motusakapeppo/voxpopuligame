import { C } from './palette.js';

// ⚠️ PLACEHOLDER: sostituire con l'URL reale (pre-save / streaming) prima della distribuzione.
export const CTA_URL = '#';
export const CTA_LABEL = 'Ascolta tutto · Pre-salva';

export function ctaButtonRect(viewW, viewH) {
  const w = 200, h = 24;
  return { x: Math.round((viewW - w) / 2), y: Math.round(viewH / 2 + 34), w, h };
}

export function drawCta(ctx, viewW, viewH, time) {
  const r = ctaButtonRect(viewW, viewH);
  ctx.font = '20px monospace';
  ctx.fillStyle = C.black;  ctx.fillText('VOX POPULI', 93, viewH / 2 - 19);
  ctx.fillStyle = C.redHot; ctx.fillText('VOX POPULI', 92, viewH / 2 - 20);
  ctx.font = '7px monospace';
  ctx.fillStyle = C.red;
  ctx.fillText('MOTUS — concept album · 13 tracce', Math.round(viewW / 2 - 84), viewH / 2 - 6);

  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.fillStyle = `rgba(224,16,16,${0.6 + 0.4 * pulse})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = C.white;
  ctx.font = '9px monospace';
  ctx.fillText(CTA_LABEL, r.x + 22, r.y + 16);
}
