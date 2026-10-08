// ============================================================================
// LYRICS OVERLAY — test dell'indice puro e del disegno full-res delle liriche.
// Stub ctx che REGISTRA fillText/fillRect con fillStyle/alpha/font: niente DOM.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lyricIndexAt, drawLyricsOverlay, drawLyricsPixel } from '../src/art.js';
import { C } from '../src/palette.js';

// --- stub ctx: registra le chiamate e MISURA davvero (advance ~0.6 em) --------
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
    // misura realistica: monospace bold ~0.6 em per carattere, come il canvas
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(font);
      const fp = m ? +m[1] : 10;
      return { width: (s == null ? '' : String(s)).length * fp * 0.6 };
    },
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

// --- S6/S7: leggibilità e overflow -------------------------------------------

const LONG = ('parola '.repeat(13)).trim();   // 90 caratteri, spazi ogni 7

// larghezza stimata in px DEVICE: font px * advance monospace conservativo * len
function estWidth(call) {
  const m = /(\d+(?:\.\d+)?)px/.exec(call.font || '');
  return m ? (+m[1]) * 0.62 * call.text.length : Infinity;
}

test('drawLyricsOverlay: riga lunghissima non sborda (shrink o wrap)', () => {
  const S = 3, W = 320;
  const ctx = recCtx();
  drawLyricsOverlay(ctx, S, [[0, LONG]], 1, W, 180, 2);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  assert.ok(texts.length > 0, 'nessun testo disegnato');
  for (const c of texts) {
    assert.ok(c.x >= 0 && c.x <= W * S, 'x fuori schermo: ' + c.x);
    const est = estWidth(c);
    assert.ok(est <= W * S * 0.95,
      'testo sborda: ' + c.text.length + ' char @ ' + c.font + ' = ' + Math.round(est) + ' > ' + Math.round(W * S * 0.95));
  }
  const white = texts.filter(c => c.fill === C.white);
  assert.ok(white.length >= 1, 'nessun corpo bianco');
  const m = /(\d+(?:\.\d+)?)px/.exec(white[white.length - 1].font);
  const shrunk = +m[1] < 10 * S;          // sotto il vecchio floor di 10px logici
  const wrapped = white.length >= 2;      // oppure mandata a capo su >= 2 righe
  assert.ok(shrunk || wrapped, 'né shrink né wrap: ' + m[1] + 'px, ' + white.length + ' righe bianche');
});

test('drawLyricsOverlay: riga attiva ben visibile (bianco alpha >= 0.9, banda >= 0.55)', () => {
  const ctx = recCtx();
  drawLyricsOverlay(ctx, 3, LINES, 6, 320, 180, 2);
  const white = ctx.calls.filter(c => c.op === 'fillText' && c.fill === C.white);
  assert.ok(white.length >= 1, 'nessun corpo bianco');
  assert.ok(white[white.length - 1].alpha >= 0.9,
    'corpo attivo troppo tenue: alpha ' + white[white.length - 1].alpha);
  const band = ctx.calls.filter(c => c.op === 'fillRect' && c.fill === C.black && c.alpha >= 0.55);
  assert.ok(band.length >= 1, 'banda scura sotto alpha 0.55');
});

// ISTERESI: il render deve rispettare il floor minIdx (indice mai indietro) —
// senza, l'utente vede righe sbagliate/flippare veloci. Param opzionale,
// retrocompatibile quando omesso.
test('drawLyricsPixel: minIdx (isteresi) blocca il regresso dell\'indice', () => {
  const W = 320, H = 180;
  // a pos=1 l'indice naturale è 0 ('prima riga'); con minIdx=2 deve restare 2.
  const ctx = recCtx();
  drawLyricsPixel(ctx, LINES, 1, 2, W, H, 2);
  const texts = ctx.calls.filter(c => c.op === 'fillText').map(c => c.text);
  assert.ok(texts.includes('terza riga'), 'con minIdx=2 deve mostrare l\'indice 2, non la 0: ' + JSON.stringify(texts));
  assert.ok(!texts.includes('prima riga'), 'non deve regredire alla riga 0');
  // retrocompatibile: senza minIdx torna il comportamento storico (indice 0)
  const ctx2 = recCtx();
  drawLyricsPixel(ctx2, LINES, 1, 2, W, H);
  const t2 = ctx2.calls.filter(c => c.op === 'fillText').map(c => c.text);
  assert.ok(t2.includes('prima riga'), 'senza minIdx comportamento storico');
});

test('drawLyricsPixel: PROTAGONISTA pixel leggibile (bianco + alone nero, NIENTE banda full-width)', () => {
  const W = 320, H = 180;
  const ctx = recCtx();
  drawLyricsPixel(ctx, LINES, 6, 2, W, H);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  assert.ok(texts.length > 0, 'nessun testo disegnato');
  const white = texts.filter(c => c.fill === C.white);
  assert.ok(white.length >= 1, 'nessun corpo bianco (il pixel deve essere leggibile)');
  assert.ok(white[white.length - 1].alpha >= 0.9, 'corpo troppo tenue: alpha ' + white[white.length - 1].alpha);
  // alone scuro: >= 4 passaggi neri PER RIGA attiva (4 direzioni + diagonali)
  const black = texts.filter(c => c.fill === C.black);
  assert.ok(black.length >= 4 * white.length,
    'alone nero insufficiente: ' + black.length + ' passaggi per ' + white.length + ' righe');
  // NIENTE banda scura a piena larghezza: un fillRect nero che copre ~tutta la
  // larghezza (>= W*0.8) con alpha alto (>= 0.5) è VIETATO. Un piccolo backing
  // scoped (width < W*0.8) con alpha <= 0.35 è ammesso, o nessun rettangolo.
  const fullBand = ctx.calls.filter(c => c.op === 'fillRect' && c.fill === C.black
    && c.w >= W * 0.8 && c.alpha >= 0.5);
  assert.equal(fullBand.length, 0, 'banda scura full-width ancora presente: ' + JSON.stringify(fullBand));
  const scoped = ctx.calls.filter(c => c.op === 'fillRect' && c.fill === C.black);
  for (const b of scoped) {
    assert.ok(b.w < W * 0.8, 'backing troppo largo (non scoped): w=' + b.w);
    assert.ok(b.alpha <= 0.35, 'backing troppo opaco: alpha=' + b.alpha);
  }
});

test('drawLyricsPixel: ombra morbida sotto il testo (copia nera offset, alpha ridotta)', () => {
  const W = 320, H = 180;
  const ctx = recCtx();
  drawLyricsPixel(ctx, LINES, 6, 2, W, H);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  const white = texts.filter(c => c.fill === C.white);
  const shadow = texts.filter(c => c.fill === C.black && c.alpha > 0 && c.alpha < 0.9);
  assert.ok(shadow.length >= 1, 'nessuna ombra morbida (copia nera a alpha ridotta)');
  // l'ombra è offsetta rispetto al corpo bianco (dx/dy != 0)
  const body = white[white.length - 1];
  const off = shadow.some(s => s.text === body.text && (s.x !== body.x || s.y !== body.y));
  assert.ok(off, 'ombra non offsetta rispetto al corpo');
});

// La larghezza VERA dell'unità di testo disegnata deve entrare nello schermo.
// (Il centro x non basta: il testo può sbordare a sinistra/destra.)
function realWidth(ctx, call) {
  ctx.font = call.font;
  const m = ctx.measureText(call.text);
  return (m && m.width > 0) ? m.width : call.text.length * 0.62 * (/(\d+(?:\.\d+)?)px/.exec(call.font || '') ? +/(\d+(?:\.\d+)?)px/.exec(call.font)[1] : 10);
}

test('drawLyricsPixel: nessun testo sborda (larghezza reale entro lo schermo)', () => {
  const W = 320, H = 180;
  const ctx = recCtx();
  drawLyricsPixel(ctx, LINES, 6, 2, W, H);
  for (const c of ctx.calls.filter(x => x.op === 'fillText')) {
    const hw = realWidth(ctx, c) / 2;
    assert.ok(c.x - hw >= -0.5, 'sborda a sinistra: x=' + c.x + ' hw=' + Math.round(hw));
    assert.ok(c.x + hw <= W + 0.5, 'sborda a destra: x=' + c.x + ' hw=' + Math.round(hw));
  }
});

test('drawLyricsPixel: riga lunga (come 01-intro) va a capo e non sborda', () => {
  const W = 320, H = 180;
  const REAL = 'E scopro ogni giorno che passa un pezzetto di me che si stacca dal cranio ah';
  const ctx = recCtx();
  drawLyricsPixel(ctx, [[0, REAL]], 1, 2, W, H);
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  const white = texts.filter(c => c.fill === C.white);
  assert.ok(white.length >= 2, 'riga lunga: attese >=2 righe bianche (wrap), avute ' + white.length);
  for (const c of texts) {
    const hw = realWidth(ctx, c) / 2;
    assert.ok(c.x - hw >= -0.5 && c.x + hw <= W + 0.5, 'sborda: x=' + c.x + ' hw=' + Math.round(hw));
  }
  // il font delle righe avvolte deve restare leggibile (>= 9 logici)
  const m = /(\d+(?:\.\d+)?)px/.exec(white[0].font);
  assert.ok(+m[1] >= 9, 'font troppo piccolo dopo il wrap: ' + m[1] + 'px');
});
