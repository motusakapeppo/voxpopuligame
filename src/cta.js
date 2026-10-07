import { C } from './palette.js';

// ⚠️ PLACEHOLDER: sostituire con l'URL reale (pre-save / streaming) prima della distribuzione.
export const CTA_URL = '#';
export const CTA_LABEL = 'Ascolta tutto · Pre-salva';

export function ctaButtonRect(viewW, viewH) {
  const w = 200, h = 24;
  return { x: Math.round((viewW - w) / 2), y: Math.round(viewH / 2 + 34), w, h };
}

// La schermata finale: la piramide crollata resta come sfondo (maceria), sopra uno
// scrim scuro per far leggere il testo, il titolo, il sottotitolo e il bottone.
// Deterministico, solo palette nero+rosso+bianco.
export function drawCta(ctx, viewW, viewH, time) {
  const r = ctaButtonRect(viewW, viewH);
  const cx = viewW / 2;

  // scrim: banda scura al centro così il testo stacca dalla maceria
  ctx.fillStyle = C.black;
  ctx.globalAlpha = 0.62;
  ctx.fillRect(0, viewH / 2 - 34, viewW, 96);
  ctx.globalAlpha = 1;
  // due capelli rossi sopra/sotto lo scrim: incorniciano la schermata
  ctx.fillStyle = C.redDark;
  ctx.fillRect(0, viewH / 2 - 34, viewW, 1);
  ctx.fillRect(0, viewH / 2 + 61, viewW, 1);

  // titolo con ombra netta
  ctx.font = '20px monospace';
  ctx.fillStyle = C.black;  ctx.fillText('VOX POPULI', cx - 67, viewH / 2 - 19);
  ctx.fillStyle = C.redHot; ctx.fillText('VOX POPULI', cx - 68, viewH / 2 - 20);

  ctx.font = '7px monospace';
  ctx.fillStyle = C.red;
  const sub = 'MOTUS — concept album · 13 tracce';
  ctx.fillText(sub, Math.round(cx - sub.length * 2.1), viewH / 2 - 6);

  // bottone pulsante
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.fillStyle = C.black;   ctx.fillRect(r.x + 1, r.y + 1, r.w, r.h);
  ctx.fillStyle = C.redBright;
  ctx.globalAlpha = 0.7 + 0.3 * pulse;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.white;
  ctx.font = '9px monospace';
  const label = CTA_LABEL;
  ctx.fillText(label, Math.round(cx - label.length * 2.7), r.y + 16);
}
