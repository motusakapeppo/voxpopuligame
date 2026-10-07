import { C } from './palette.js';

// ⚠️ PLACEHOLDER: sostituire con l'URL reale (pre-save / streaming) prima della distribuzione.
export const CTA_URL = '#';
export const CTA_LABEL = 'Ascolta tutto · Pre-salva';

// ---------------------------------------------------------------------------
// HIT-RECT del bottone. Deve combaciare ESATTAMENTE con il rettangolo disegnato
// da drawCta (main.js usa questo rect per il click). Responsive: non sborda mai.
// ---------------------------------------------------------------------------
export function ctaButtonRect(viewW, viewH) {
  const w0 = Number.isFinite(viewW) ? viewW : 320;
  const h0 = Number.isFinite(viewH) ? viewH : 180;
  const w = Math.min(200, Math.max(80, Math.round(w0 - 40)));
  const h = 24;
  return { x: Math.round((w0 - w) / 2), y: Math.round(h0 / 2 + 34), w, h };
}

// ---------------------------------------------------------------------------
// SHRINK-TO-FIT (puro): la size più grande (intera) con cui `text` entra in
// `maxW` al font monospace bold. Misura col font REALE del disegno. Mai NaN.
// ---------------------------------------------------------------------------
export function ctaFitFont(ctx, text, maxW, startSize) {
  const t = text == null ? '' : String(text);
  const limit = Number.isFinite(maxW) ? maxW : 320;
  let size = Number.isFinite(startSize) ? startSize : 20;
  const widthAt = (sz) => {
    const px = Math.max(1, Math.round(sz));
    ctx.font = 'bold ' + px + 'px monospace';
    const m = ctx.measureText(t);
    return (m && Number.isFinite(m.width) && m.width > 0) ? m.width : t.length * px * 0.62;
  };
  let guard = 0;
  while (size > 1 && widthAt(size) > limit && guard++ < 400) size -= 1;
  return size;
}

// ---------------------------------------------------------------------------
// TESTO con contrasto "che abbraccia il glifo": ombra morbida offset + alone
// nero a 8 direzioni + corpo colorato. Stessa tecnica delle liriche pixel:
// NIENTE banda full-width, il testo resta amalgamato alla maceria ma leggibile.
// ---------------------------------------------------------------------------
function haloText(ctx, text, x, y, size, color, alpha) {
  const px = Math.max(1, Math.round(size));
  ctx.font = 'bold ' + px + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // ombra morbida: copia nera offset (1,2), alpha ridotta → profondità
  ctx.globalAlpha = 0.45; ctx.fillStyle = C.black;
  ctx.fillText(text, x + 1, y + 2);
  // alone solido: 4 ortogonali + 4 diagonali a 1px
  ctx.globalAlpha = 0.95; ctx.fillStyle = C.black;
  ctx.fillText(text, x - 1, y);
  ctx.fillText(text, x + 1, y);
  ctx.fillText(text, x, y - 1);
  ctx.fillText(text, x, y + 1);
  ctx.fillText(text, x - 1, y - 1);
  ctx.fillText(text, x + 1, y - 1);
  ctx.fillText(text, x - 1, y + 1);
  ctx.fillText(text, x + 1, y + 1);
  // corpo: colore pieno, il tono più leggibile
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// LA SCHERMATA FINALE — end-card composta sopra la maceria (piramide crollata).
// Layout ancorato: cornice ad angoli (hairline rosse, eco della piramide),
// titolo + divisore a piramide + credito, poi il bottone pulsante. Contrasto
// per alone (non stripe). Deterministico, solo palette nero+rosso+bianco.
// ---------------------------------------------------------------------------
export function drawCta(ctx, viewW, viewH, time, opts) {
  const w = Number.isFinite(viewW) ? viewW : 320;
  const h = Number.isFinite(viewH) ? viewH : 180;
  const t = Number.isFinite(time) ? time : 0;
  const o = opts || {};
  const title = o.title != null ? String(o.title) : 'VOX POPULI';
  const sub = o.sub != null ? String(o.sub) : 'MOTUS — concept album · 13 tracce';
  const cx = Math.round(w / 2);
  const MARGIN = 12;
  const maxW = Math.max(40, w - MARGIN * 2);

  const hair = (x, y, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh));
  };

  // --- CORNICE: motivo ad angoli (L-bracket) in rosso, eco della piramide ----
  const inset = 8, len = 22;
  const red = C.red, redD = C.redDark;
  // alto-sinistra
  hair(inset, inset, len, 1, red);            hair(inset, inset, 1, len, red);
  // alto-destra
  hair(w - inset - len, inset, len, 1, red); hair(w - inset - 1, inset, 1, len, red);
  // basso-sinistra
  hair(inset, h - inset - 1, len, 1, red);   hair(inset, h - inset - len, 1, len, red);
  // basso-destra
  hair(w - inset - len, h - inset - 1, len, 1, red); hair(w - inset - 1, h - inset - len, 1, len, red);

  // --- BLOCCO TITOLO (ancorato in alto, centrato) ----------------------------
  const titleY = Math.round(h * 0.30);
  const titleSize = ctaFitFont(ctx, title, maxW, 20);
  haloText(ctx, title, cx, titleY, titleSize, C.white, 1);

  // divisore a PIRAMIDE (3 hairline decrescenti) — motivo della cover
  const divY = titleY + 8;
  for (let i = 0; i < 3; i++) {
    const ww = 18 - i * 6;
    hair(cx - ww / 2, divY + i * 2, ww, 1, i === 0 ? red : redD);
  }

  // credito / sottotitolo
  const subY = titleY + 24;
  const subSize = ctaFitFont(ctx, sub, maxW, 8);
  haloText(ctx, sub, cx, subY, subSize, C.red, 0.95);

  // --- BOTTONE (pulsante, deterministico) ------------------------------------
  const r = ctaButtonRect(w, h);
  // ombra netta offset (non coincide col rect: l'hit-rect resta pulito)
  ctx.fillStyle = C.black; ctx.globalAlpha = 0.5;
  ctx.fillRect(r.x + 2, r.y + 2, r.w, r.h);
  ctx.globalAlpha = 1;
  // base: alpha pulsante time-based (0.6..1.0)
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  ctx.fillStyle = C.redBright;
  ctx.globalAlpha = 0.6 + 0.4 * pulse;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  // filo superiore acceso + filo inferiore scuro: volume
  hair(r.x, r.y, r.w, 1, C.redHot);
  hair(r.x, r.y + r.h - 1, r.w, 1, C.redDeep);
  // etichetta centrata col rect, con alone
  const labelSize = ctaFitFont(ctx, CTA_LABEL, r.w - 12, 9);
  haloText(ctx, CTA_LABEL, Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2 + labelSize * 0.35), labelSize, C.white, 1);

  ctx.textAlign = 'left';
}
