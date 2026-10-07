// ============================================================================
// ART — test dei nuovi helper puri (profondità atmosferica) e del disegno
// deterministico di parete/skyline/giocatore/titolo.
// Stub ctx che REGISTRA ogni fillRect con fillStyle/alpha: niente DOM.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  artDepthTone, artSkylineLayer, artFogAlpha, artSeed,
  drawWall, drawSkyline, drawPlayer, drawTitle, artPerf,
} from '../src/art.js';
import { C, RED_RAMP } from '../src/palette.js';
import { createClimb } from '../src/climb.js';
import { wall, TOP_Y } from '../src/gironi.js';

// --- stub ctx: registra le chiamate di disegno ------------------------------
function recCtx() {
  const calls = [];
  let fill = '#000000';
  let alpha = 1;
  let gradCount = 0;
  const mkGrad = () => ({
    __grad: true, stops: [],
    addColorStop(o, c) { this.stops.push([o, c]); },
  });
  const norm = v => (v && typeof v === 'object' && v.__grad) ? '__grad__' : v;
  const ctx = {
    calls,
    get gradCount() { return gradCount; },
    get fillStyle() { return fill; },
    set fillStyle(v) { fill = norm(v); },
    get globalAlpha() { return alpha; },
    set globalAlpha(v) { alpha = v; },
    fillRect(x, y, w, h) { calls.push({ op: 'fillRect', x, y, w, h, fill, alpha }); },
    fillText(x, y) { calls.push({ op: 'fillText', x, y, fill, alpha }); },
    save() { calls.push({ op: 'save' }); },
    restore() { calls.push({ op: 'restore' }); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {},
    translate() {}, scale() {}, rotate() {}, setTransform() {},
    measureText: () => ({ width: 0 }),
    drawImage() { calls.push({ op: 'drawImage' }); },
    createLinearGradient: (...a) => { gradCount++; return mkGrad(); },
    createRadialGradient: (...a) => { gradCount++; return mkGrad(); },
    createPattern: () => ({}),
    imageSmoothingEnabled: false,
    globalCompositeOperation: 'source-over',
    font: '', textAlign: 'left', textBaseline: 'alphabetic',
    lineWidth: 1, strokeStyle: '#000000',
  };
  return ctx;
}

// Solo nero/bianco o rosso dominante (r>g && r>b); i gradienti dello stub
// sono foschie nere → ammessi.
function isSafeColor(v) {
  if (v === '__grad__') return true;
  if (typeof v !== 'string') return false;
  if (v === C.black || v === C.white) return true;
  const m = /^#([0-9a-fA-F]{6})$/.exec(v);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r > g && r > b;
}

function assertFiniteCalls(ctx, label) {
  assert.ok(ctx.calls.length > 0, label + ': nessuna chiamata registrata');
  for (const c of ctx.calls) {
    if (c.op !== 'fillRect') continue;
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.w) && Number.isFinite(c.h),
      label + ': fillRect non finito ' + JSON.stringify(c));
    assert.ok(isSafeColor(c.fill), label + ': colore fuori palette ' + String(c.fill));
  }
}

function rampIndex(color) { return RED_RAMP.indexOf(color); }
function fakeGirone() { return { id: '01', bodies: wall(TOP_Y, 720) }; }

// --- helper puri -------------------------------------------------------------
test('artDepthTone: colori di palette, finiti e monotoni (più vicino = più acceso)', () => {
  for (const d of [-1, 0, 0.2, 0.5, 0.8, 1, 2, NaN, Infinity]) {
    const col = artDepthTone(d);
    assert.ok(RED_RAMP.includes(col), 'tono non in rampa: ' + String(col));
  }
  assert.equal(artDepthTone(0), RED_RAMP[0]);
  assert.equal(artDepthTone(1), RED_RAMP[RED_RAMP.length - 1]);
  let prev = -1;
  for (let d = 0; d <= 1.0001; d += 0.05) {
    const i = rampIndex(artDepthTone(d));
    assert.ok(i >= prev, 'tono non monotono a depth=' + d.toFixed(2));
    prev = i;
  }
});

test('artSkylineLayer: strati distinti, monotoni e deterministici', () => {
  const N = 3;
  const layers = [];
  for (let i = 0; i < N; i++) layers.push(artSkylineLayer(i, N));
  for (const L of layers) {
    for (const k of ['f', 'base', 'h', 'step', 'al']) assert.ok(Number.isFinite(L[k]), k + ' non finito');
    assert.ok(RED_RAMP.includes(L.col), 'colore strato non in rampa');
  }
  for (let i = 1; i < N; i++) {
    assert.ok(layers[i].f > layers[i - 1].f, 'parallasse non crescente');
    assert.ok(rampIndex(layers[i].col) >= rampIndex(layers[i - 1].col), 'tono non crescente');
    assert.ok(layers[i].h > layers[i - 1].h, 'altezza non crescente');
  }
  assert.ok(new Set(layers.map(L => L.col)).size >= 2, 'strati senza toni distinti');
  assert.deepEqual(artSkylineLayer(1, 3), artSkylineLayer(1, 3), 'non deterministico');
});

test('artFogAlpha: massimo in alto (o in basso), monotono e clampato', () => {
  const H = 180;
  assert.equal(artFogAlpha(0, H, 0.8), 0.8);
  assert.equal(artFogAlpha(H, H, 0.8), 0);
  let prev = Infinity;
  for (let y = 0; y <= H; y += 10) {
    const a = artFogAlpha(y, H, 0.8);
    assert.ok(Number.isFinite(a) && a >= 0 && a <= 1, 'alpha fuori range');
    assert.ok(a <= prev + 1e-9, 'fog non decrescente verso il basso');
    prev = a;
  }
  assert.equal(artFogAlpha(0, H, 0.8, false), 0);
  assert.equal(artFogAlpha(H, H, 0.8, false), 0.8);
  assert.equal(artFogAlpha(NaN, H, 0.8), 0);
  assert.equal(artFogAlpha(0, 0, 0.8), 0);
});

test('artSeed: deterministico, finito, distingue stringhe diverse', () => {
  assert.equal(artSeed('01-intro'), artSeed('01-intro'));
  assert.ok(Number.isFinite(artSeed('x')) && artSeed('x') >= 0);
  assert.notEqual(artSeed('01-intro'), artSeed('02-vento'));
  assert.equal(artSeed(undefined), artSeed(''));
});

// --- disegno su stub ---------------------------------------------------------
test('drawWall (senza DOM): coordinate finite, colori di palette, deterministico', () => {
  const a = recCtx(), b = recCtx();
  const g1 = fakeGirone(), g2 = fakeGirone();
  drawWall(a, g1, createClimb(g1), 120, 3.3, 320, 180, 0.5);
  drawWall(b, g2, createClimb(g2), 120, 3.3, 320, 180, 0.5);
  assertFiniteCalls(a, 'drawWall');
  assert.deepEqual(a.calls, b.calls, 'drawWall non deterministico');
});

test('drawWall: la folla usa più toni (profondità atmosferica)', () => {
  const g = fakeGirone();
  const ctx = recCtx();
  drawWall(ctx, g, createClimb(g), 120, 3.3, 320, 180, 0);
  const tones = new Set(ctx.calls
    .filter(c => c.op === 'fillRect' && typeof c.fill === 'string' && c.fill !== C.black && c.fill !== C.white)
    .map(c => c.fill));
  assert.ok(tones.size >= 2, 'un solo tono per la folla: niente profondità');
});

test('drawSkyline: coordinate finite, colori di palette, deterministico', () => {
  const a = recCtx(), b = recCtx();
  drawSkyline(a, '04-baghdad', 200, 5.5, 320, 180, 0.4);
  drawSkyline(b, '04-baghdad', 200, 5.5, 320, 180, 0.4);
  assertFiniteCalls(a, 'drawSkyline');
  assert.deepEqual(a.calls, b.calls, 'drawSkyline non deterministico');
});

test('drawPlayer: coordinate finite e colori di palette per ogni gesto', () => {
  for (const action of ['idle', 'tendi', 'spingi']) {
    const g = fakeGirone();
    const ctx = recCtx();
    drawPlayer(ctx, createClimb(g), 100, 2.2, action);
    assertFiniteCalls(ctx, 'drawPlayer/' + action);
  }
});

test('drawTitle: coordinate finite, colori di palette, deterministico', () => {
  const a = recCtx(), b = recCtx();
  drawTitle(a, 320, 180, 4.4);
  drawTitle(b, 320, 180, 4.4);
  assertFiniteCalls(a, 'drawTitle');
  assert.deepEqual(a.calls, b.calls, 'drawTitle non deterministico');
});

test('input non finiti: nessuna coordinata NaN su stub', () => {
  const g = fakeGirone();
  const w = recCtx(); drawWall(w, g, createClimb(g), NaN, NaN, 320, 180, NaN);
  assertFiniteCalls(w, 'drawWall/NaN');
  const s = recCtx(); drawSkyline(s, '01-intro', NaN, NaN, 320, 180, NaN);
  assertFiniteCalls(s, 'drawSkyline/NaN');
  const p = recCtx(); drawPlayer(p, createClimb(g), NaN, NaN, 'idle');
  assertFiniteCalls(p, 'drawPlayer/NaN');
  const t = recCtx(); drawTitle(t, 320, 180, NaN);
  assertFiniteCalls(t, 'drawTitle/NaN');
});

// --- S-REND: cache dei gradienti + scia lazy ---------------------------------
// I gradienti di foschia dipendono solo da H (non dal tempo): vanno creati una
// volta e riusati. createLinearGradient è costoso → zero allocazioni per frame.

test('drawSkyline: chiamate ripetute identiche e gradienti NON ricreati (cache)', () => {
  const ctx = recCtx();
  drawSkyline(ctx, '04-baghdad', 200, 5.5, 320, 180, 0.4);
  const first = ctx.calls.slice();
  const g1 = ctx.gradCount;
  drawSkyline(ctx, '04-baghdad', 200, 5.5, 320, 180, 0.4);
  const second = ctx.calls.slice(first.length);
  assert.deepEqual(second, first, 'drawSkyline: output diverso tra chiamate ripetute');
  assert.ok(g1 <= 1, 'drawSkyline: troppi createLinearGradient alla prima chiamata: ' + g1);
  assert.equal(ctx.gradCount, g1, 'drawSkyline: gradienti ricreati alla seconda chiamata');
});

test('drawTitle: chiamate ripetute identiche e gradienti NON ricreati (cache)', () => {
  const ctx = recCtx();
  drawTitle(ctx, 320, 180, 4.4);
  const first = ctx.calls.slice();
  const g1 = ctx.gradCount;
  drawTitle(ctx, 320, 180, 4.4);
  const second = ctx.calls.slice(first.length);
  assert.deepEqual(second, first, 'drawTitle: output diverso tra chiamate ripetute');
  assert.ok(g1 <= 2, 'drawTitle: troppi createLinearGradient alla prima chiamata: ' + g1);
  assert.equal(ctx.gradCount, g1, 'drawTitle: gradienti ricreati alla seconda chiamata');
});

test('drawSkyline: H diverso → nuovo gradiente (chiave di cache corretta)', () => {
  const ctx = recCtx();
  drawSkyline(ctx, '01-intro', 0, 0, 320, 180, 0);
  const g1 = ctx.gradCount;
  drawSkyline(ctx, '01-intro', 0, 0, 320, 240, 0);
  assert.ok(ctx.gradCount > g1, 'H diverso deve ricreare il gradiente (chiave errata)');
});

test('drawPlayer idle: nessuna scia allocata (trail lazy) e output stabile', () => {
  const g = fakeGirone();
  const before = artPerf.trailAllocs;
  const ctx = recCtx();
  drawPlayer(ctx, createClimb(g), 100, 2.2, 'idle');
  assert.equal(artPerf.trailAllocs, before, 'idle non deve allocare la scia');
  // nessun fillRect 2x2 con alpha di scia (0 < a < 0.55)
  const trailDraws = ctx.calls.filter(c =>
    c.op === 'fillRect' && c.w === 2 && c.h === 2 && c.alpha > 0 && c.alpha < 0.55);
  assert.equal(trailDraws.length, 0, 'idle non deve disegnare la scia');
  const ctx2 = recCtx();
  drawPlayer(ctx2, createClimb(g), 100, 2.2, 'idle');
  assert.deepEqual(ctx2.calls, ctx.calls, 'drawPlayer/idle non deterministico');
});

test('drawPlayer tendi: la scia viene allocata solo col gesto attivo', () => {
  const g = fakeGirone();
  const before = artPerf.trailAllocs;
  const ctx = recCtx();
  drawPlayer(ctx, createClimb(g), 100, 2.2, 'tendi');
  assert.ok(artPerf.trailAllocs > before, 'il gesto tendi deve allocare la scia');
  assertFiniteCalls(ctx, 'drawPlayer/tendi');
});

// ---------------------------------------------------------------------------
// W2-D: dithering Bayer 4x4 + rampa tono (palette-safe). Puro e deterministico.
// ---------------------------------------------------------------------------
import { dither4x4, rampTone } from '../src/art.js';

const BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];

test('dither4x4: matrice di Bayer normalizzata, deterministica e ciclica', () => {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = dither4x4(x, y);
    assert.ok(v >= 0 && v < 1, 'fuori [0,1): ' + v);
    assert.equal(v, dither4x4(x + 4, y + 4), 'non ciclica su 4: ' + x + ',' + y);
    assert.equal(v, dither4x4(x, y), 'non deterministica');
  }
  assert.equal(dither4x4(0, 0), BAYER4[0][0] / 16);
  assert.equal(dither4x4(1, 0), BAYER4[0][1] / 16);
  assert.equal(dither4x4(0, 1), BAYER4[1][0] / 16);
  assert.equal(dither4x4(3, 3), BAYER4[3][3] / 16);
});

test('dither4x4: gestisce indici negativi (ciclo vero)', () => {
  assert.equal(dither4x4(-1, -1), dither4x4(3, 3));
  assert.equal(dither4x4(-4, 0), dither4x4(0, 0));
});

test('rampTone: ramp-safe (rosso dominante) e monotona in luminosita', () => {
  let prev = -1;
  for (let i = 0; i <= 10; i++) {
    const c = rampTone(i / 10);
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    assert.ok(r >= g && r >= b, 'non rosso-dominante a depth ' + (i / 10) + ': ' + c);
    const lum = r + g + b;
    assert.ok(lum >= prev, 'non monotona: ' + lum + ' < ' + prev);
    prev = lum;
  }
  assert.equal(rampTone(0), rampTone(0));
});
