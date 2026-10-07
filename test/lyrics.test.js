// ============================================================================
// LYRICS OVERLAY — test dell'indice puro e del disegno full-res delle liriche.
// Stub ctx che REGISTRA fillText/fillRect con fillStyle/alpha/font: niente DOM.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lyricIndexAt, drawLyricsOverlay } from '../src/art.js';
import { C } from '../src/palette.js';

// --- stub ctx: registra le chiamate di disegno ------------------------------
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
    measureText: () => ({ width: 0 }),
    textAlign: 'left', textBaseline: 'alphabetic',
  };
  return ctx;
}

const LINES = [[0, 'prima riga'], [5, 'seconda riga'], [10, 'terza riga']];

// --- lyricIndexAt (puro) -----------------------------------------------------
test('lyricIndexAt: vuoto → -1', () => {
  assert.equal(lyricIndexAt([], 3), -1);
  assert.equal(lyricIndexAt(null, 3), -1);
  assert.equal(lyricIndexAt(undefined, 3), -1);
});

test('lyricIndexAt: pos prima della prima → 0', () => {
  assert.equal(lyricIndexAt(LINES, -1), 0);
  assert.equal(lyricIndexAt([[3, 'a'], [7, 'b']], 1), 0);
});

test('lyricIndexAt: tra le voci → indice corretto (bordi inclusi)', () => {
  assert.equal(lyricIndexAt(LINES, 0), 0);
  assert.equal(lyricIndexAt(LINES, 4.9), 0);
  assert.equal(lyricIndexAt(LINES, 5), 1);
  assert.equal(lyricIndexAt(LINES, 7), 1);
  assert.equal(lyricIndexAt(LINES, 10), 2);
});

test('lyricIndexAt: dopo l\'ultima → ultimo indice', () => {
  assert.equal(lyricIndexAt(LINES, 100), 2);
  assert.equal(lyricIndexAt(LINES, Infinity), 2);
});

test('lyricIndexAt: NaN sicuro → 0', () => {
  assert.equal(lyricIndexAt(LINES, NaN), 0);
  assert.equal(lyricIndexAt([[3, 'a'], [7, 'b']], NaN), 0);
});

// --- drawLyricsOverlay (stub) ------------------------------------------------
test('drawLyricsOverlay: vuoto → nessuna chiamata', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, 3, [], 1, 320, 180, 2);
  drawLyricsOverlay(ctx, 3, null, 1, 320, 180, 2);
  assert.equal(ctx.calls.length, 0);
});

test('drawLyricsOverlay: outline >= 3 passaggi neri + corpo bianco', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, 3, LINES, 6, 320, 180, 2);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  const black = texts.filter(c => c.fill === C.black);
  const white = texts.filter(c => c.fill === C.white);
  assert.ok(black.length >= 3, 'outline insufficiente: ' + black.length + ' passaggi neri');
  assert.ok(white.length >= 1, 'nessun passaggio bianco per la riga attiva');
  // il corpo attivo è l'ULTIMO passaggio bianco e usa la riga corrente
  assert.equal(white[white.length - 1].text, 'seconda riga');
});

test('drawLyricsOverlay: banda scura dietro la riga con alpha >= 0.4', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, 3, LINES, 6, 320, 180, 2);
  const band = ctx.calls.filter(c => c.op === 'fillRect' && c.fill === C.black && c.alpha >= 0.4);
  assert.ok(band.length >= 1, 'nessuna banda scura con alpha >= 0.4');
});

test('drawLyricsOverlay: riga precedente fantasma in rosso (alpha bassa)', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, 3, LINES, 6, 320, 180, 2);
  const ghost = ctx.calls.filter(c => c.op === 'fillText' && c.fill === C.red && c.alpha < 0.4);
  assert.ok(ghost.length >= 1, 'nessun fantasma della riga precedente');
  assert.equal(ghost[0].text, 'prima riga');
});

test('drawLyricsOverlay: size floor >= 10px logici (scalata per S)', () => {
  const S = 3;
  const ctx = recCtx();
  drawLyricsOverlay(ctx, S, LINES, 6, 320, 180, 2);
  const white = ctx.calls.filter(c => c.op === 'fillText' && c.fill === C.white);
  const m = /(\d+)px/.exec(white[white.length - 1].font);
  assert.ok(m, 'font senza px: ' + white[white.length - 1].font);
  assert.ok(+m[1] >= 10 * S, 'size sotto il floor: ' + m[1] + 'px (S=' + S + ')');
});

test('drawLyricsOverlay: deterministico e coordinate finite', () => {
  const a = recCtx(), b = recCtx();
  drawLyricsOverlay(a, 3, LINES, 6, 320, 180, 2);
  drawLyricsOverlay(b, 3, LINES, 6, 320, 180, 2);
  assert.deepEqual(a.calls, b.calls, 'non deterministico');
  for (const c of a.calls) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'coordinata non finita: ' + JSON.stringify(c));
  }
});

test('drawLyricsOverlay: input non finiti → nessuna coordinata NaN', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, NaN, LINES, NaN, NaN, NaN, NaN);
  for (const c of ctx.calls) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'coordinata non finita: ' + JSON.stringify(c));
  }
});
