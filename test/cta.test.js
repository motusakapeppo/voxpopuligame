// ============================================================================
// CTA — test della schermata finale (end-card artistica sopra la maceria).
// Stub ctx che REGISTRA fillRect/fillText con fillStyle/alpha/font: niente DOM.
// Requisiti: layout composto e ancorato, cornice ad angoli (non banda nera),
// contrasto per alone nero + corpo bianco, pulse deterministico, hit-rect del
// bottone coerente col disegno, testo mai oltre lo schermo (shrink-to-fit).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cta from '../src/cta.js';
import { C } from '../src/palette.js';

const { drawCta, ctaButtonRect, ctaFitFont, CTA_URL, CTA_LABEL } = cta;

// --- stub ctx: registra le chiamate e MISURA davvero (advance ~0.6 em) ------
function recCtx() {
  const calls = [];
  let fill = '#000000';
  let alpha = 1;
  let font = '';
  const ctx = {
    calls,
    get fillStyle() { return fill; },
    set fillStyle(v) { fill = v; },
    get globalAlpha() { return alpha; },
    set globalAlpha(v) { alpha = v; },
    get font() { return font; },
    set font(v) { font = v; },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h, fill, alpha }); },
    fillText(text, x, y) { calls.push({ op: 'fillText', text, x, y, fill, alpha, font }); },
    save() {}, restore() {}, setTransform() {},
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(font);
      const fp = m ? +m[1] : 10;
      return { width: (s == null ? '' : String(s)).length * fp * 0.6 };
    },
    textAlign: 'left', textBaseline: 'alphabetic',
  };
  return ctx;
}

// Solo nero/bianco o rosso dominante (r>g && r>b).
function isSafeColor(v) {
  if (typeof v !== 'string') return false;
  if (v === C.black || v === C.white) return true;
  const m = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r > g && r > b;
}

const W = 320, H = 180;

// --- export pubblici intatti -------------------------------------------------
test('cta: export pubblici intatti (URL, LABEL, rect)', () => {
  assert.equal(typeof CTA_URL, 'string');
  assert.equal(typeof CTA_LABEL, 'string');
  assert.equal(typeof ctaButtonRect, 'function');
  assert.equal(typeof drawCta, 'function');
});

// --- rect entro i bordi ------------------------------------------------------
test('ctaButtonRect: dentro i bordi della view', () => {
  for (const [w, h] of [[320, 180], [480, 320], [200, 120]]) {
    const r = ctaButtonRect(w, h);
    assert.ok(r.w > 0 && r.h > 0, 'rect degenere');
    assert.ok(r.x >= 0 && r.y >= 0, 'rect fuori in alto/sinistra');
    assert.ok(r.x + r.w <= w, 'rect sborda a destra');
    assert.ok(r.y + r.h <= h, 'rect sborda in basso');
  }
});

// --- coordinate finite + palette --------------------------------------------
test('drawCta: solo coordinate finite e colori di palette', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 1.23);
  assert.ok(ctx.calls.length > 0, 'nessuna chiamata');
  for (const c of ctx.calls) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'coord non finita: ' + JSON.stringify(c));
    if (c.op === 'fillRect') {
      assert.ok(Number.isFinite(c.w) && Number.isFinite(c.h), 'dim non finita: ' + JSON.stringify(c));
    }
    assert.ok(isSafeColor(c.fill), 'colore fuori palette: ' + String(c.fill));
  }
});

// --- il bottone disegnato combacia col rect ---------------------------------
test('drawCta: il bottone disegnato combacia con ctaButtonRect', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 0.7);
  const r = ctaButtonRect(W, H);
  const hit = ctx.calls.some(c => c.op === 'fillRect'
    && c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h);
  assert.ok(hit, 'nessun fillRect al rect del bottone ' + JSON.stringify(r));
});

// --- determinismo ------------------------------------------------------------
test('drawCta: deterministico (stesse chiamate a parità di tempo)', () => {
  const a = recCtx(), b = recCtx();
  drawCta(a, W, H, 2.5);
  drawCta(b, W, H, 2.5);
  assert.deepEqual(a.calls, b.calls, 'non deterministico');
});

// --- pulse time-based --------------------------------------------------------
test('drawCta: il bottone pulsa nel tempo (alpha diversa a tempi diversi)', () => {
  const a = recCtx(), b = recCtx();
  drawCta(a, W, H, 0);
  drawCta(b, W, H, 0.5);
  const r = ctaButtonRect(W, H);
  const btnAlpha = (ctx) => {
    const c = ctx.calls.find(x => x.op === 'fillRect' && x.x === r.x && x.y === r.y && x.w === r.w && x.h === r.h);
    return c ? c.alpha : null;
  };
  const aa = btnAlpha(a), ba = btnAlpha(b);
  assert.ok(aa != null && ba != null, 'bottone non trovato');
  assert.notEqual(aa, ba, 'il bottone non pulsa (alpha identica)');
});

// --- NIENTE banda nera full-width -------------------------------------------
test('drawCta: nessuna banda nera full-width (contrasto per alone, non stripe)', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 1);
  const fullBand = ctx.calls.filter(c => c.op === 'fillRect' && c.fill === C.black
    && c.w >= W * 0.8);
  assert.equal(fullBand.length, 0, 'banda nera full-width presente: ' + JSON.stringify(fullBand));
});

// --- alone scuro + corpo bianco ---------------------------------------------
test('drawCta: testo leggibile (alone nero >= 4x + corpo bianco)', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 1);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  const white = texts.filter(c => c.fill === C.white);
  const black = texts.filter(c => c.fill === C.black);
  assert.ok(white.length >= 1, 'nessun corpo bianco');
  assert.ok(black.length >= 4 * white.length,
    'alone nero insufficiente: ' + black.length + ' per ' + white.length + ' bianchi');
  assert.ok(white[white.length - 1].alpha >= 0.9, 'corpo troppo tenue');
});

// --- cornice: motivo ad angoli (hairline corte), non banda ------------------
test('drawCta: cornice ad angoli (hairline corte rosse), non banda piena', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 1);
  const shortH = ctx.calls.filter(c => c.op === 'fillRect' && isSafeColor(c.fill)
    && c.fill !== C.black && c.fill !== C.white
    && ((c.w <= 24 && c.h <= 2) || (c.w <= 2 && c.h <= 24)));
  assert.ok(shortH.length >= 8, 'motivo ad angoli insufficiente: ' + shortH.length + ' hairline corte');
});

// --- overflow: titolo/sottotitolo lunghi non sbordano ------------------------
const LONG = ('parola '.repeat(20)).trim();

test('drawCta: titolo/sottotitolo lunghi non sbordano (shrink-to-fit)', () => {
  const ctx = recCtx();
  drawCta(ctx, W, H, 1, { title: LONG, sub: LONG });
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  assert.ok(texts.length > 0, 'nessun testo');
  for (const c of texts) {
    assert.ok(c.x >= 0 && c.x <= W, 'x fuori schermo: ' + c.x);
    ctx.font = c.font;
    const m = ctx.measureText(c.text);
    const w = (m && m.width > 0) ? m.width : c.text.length * 0.62 * 10;
    assert.ok(w <= W, 'testo sborda: ' + c.text.length + ' char @ ' + c.font + ' = ' + Math.round(w) + ' > ' + W);
  }
});

// --- helper puro shrink-to-fit ----------------------------------------------
test('ctaFitFont: riduce la size finché il testo entra', () => {
  assert.equal(typeof ctaFitFont, 'function', 'ctaFitFont non esportato');
  const ctx = recCtx();
  const size = ctaFitFont(ctx, LONG, W - 24, 20);
  ctx.font = 'bold ' + size + 'px monospace';
  const m = ctx.measureText(LONG);
  assert.ok(m.width <= W - 24, 'ctaFitFont non fa entrare il testo: ' + m.width);
  assert.ok(size > 0, 'size non positiva');
});
