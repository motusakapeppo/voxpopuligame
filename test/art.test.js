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
    fillText(text, x, y) { calls.push({ op: 'fillText', text, x, y, fill, alpha, font: ctx.font }); },
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

// ---------------------------------------------------------------------------
// VC: npcScenes � varieta' visiva per girone (scene authored ma mai disegnate).
// ---------------------------------------------------------------------------
import { drawNpcScenes } from '../src/art.js';

function fakeGironeScenes(scenes) {
  return { id: '01', npcScenes: scenes, bodies: [], modifiers: [] };
}

test('drawNpcScenes: coordinate finite e colori palette-safe', () => {
  const ctx = recCtx();
  drawNpcScenes(ctx, fakeGironeScenes(['seaWall', 'clocks', 'snakes']), null, 0, 1.5, 320, 180);
  assert.ok(ctx.calls.length > 0, 'nessun disegno');
  for (const c of ctx.calls) {
    if (c.op === 'fillRect') assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'coord non finita');
    if (c.fill && c.fill.startsWith('#') && c.fill !== '#f5f5f5' && c.fill !== '#000000') {
      const r = parseInt(c.fill.slice(1, 3), 16), g = parseInt(c.fill.slice(3, 5), 16), b = parseInt(c.fill.slice(5, 7), 16);
      assert.ok(r >= g && r >= b, 'colore non rosso-dominante: ' + c.fill);
    }
  }
});

test('drawNpcScenes: deterministico', () => {
  const a = recCtx(), b = recCtx();
  const g = fakeGironeScenes(['wetCrowd', 'raisedFists']);
  drawNpcScenes(a, g, null, 0, 1.5, 320, 180);
  drawNpcScenes(b, g, null, 0, 1.5, 320, 180);
  assert.deepEqual(a.calls, b.calls, 'non deterministico');
});

test('drawNpcScenes: scene diverse -> disegni diversi', () => {
  const a = recCtx(), b = recCtx();
  drawNpcScenes(a, fakeGironeScenes(['seaWall']), null, 0, 1.5, 320, 180);
  drawNpcScenes(b, fakeGironeScenes(['clocks']), null, 0, 1.5, 320, 180);
  assert.notDeepEqual(a.calls, b.calls, 'scene diverse devono disegnare diversamente');
  assert.ok(a.calls.length > 0 && b.calls.length > 0);
});

test('drawNpcScenes: scene vuote/sconosciute -> nessun errore', () => {
  const ctx = recCtx();
  drawNpcScenes(ctx, fakeGironeScenes([]), null, 0, 1, 320, 180);
  drawNpcScenes(ctx, { id: '01' }, null, 0, 1, 320, 180);
  drawNpcScenes(ctx, null, null, 0, 1, 320, 180);
  assert.ok(true);
});

// ---------------------------------------------------------------------------
// LAYOUT: bande dell'overlay UI — mai sovrapposte (bug: barra mash / testi).
// overlayBands(H) è PURA: ritorna {y0,y1} disgiunti per ogni elemento.
// ---------------------------------------------------------------------------
import { overlayBands, drawUIOverlay, shouldDrawLyrics } from '../src/art.js';

const BAND_KEYS = ['inscription', 'lyric', 'chapter', 'mash', 'threatMsg', 'prompt', 'flow'];

test('overlayBands: bande finite, ordinate e pairwise disgiunte', () => {
  for (const H of [180, 240, 120]) {
    const b = overlayBands(H);
    for (const k of BAND_KEYS) {
      assert.ok(b[k], 'banda mancante: ' + k);
      assert.ok(Number.isFinite(b[k].y0) && Number.isFinite(b[k].y1), k + ': non finita');
      assert.ok(b[k].y0 < b[k].y1, k + ': vuota');
    }
    for (let i = 0; i < BAND_KEYS.length; i++) {
      for (let j = i + 1; j < BAND_KEYS.length; j++) {
        const a = b[BAND_KEYS[i]], c = b[BAND_KEYS[j]];
        assert.ok(a.y1 <= c.y0 || c.y1 <= a.y0,
          'bande sovrapposte: ' + BAND_KEYS[i] + ' vs ' + BAND_KEYS[j] + ' @H=' + H);
      }
    }
  }
  // H non finito → fallback sicuro (180)
  assert.deepEqual(overlayBands(NaN), overlayBands(180));
});

test('drawUIOverlay: tutti gli elementi attivi → coordinate finite e dentro le bande', () => {
  const S = 3, W = 320, H = 180;
  const ctx = recCtx();
  const o = {
    inscription: '01 — INTRO',
    threatMsg: 'vento forte',
    chapterT: 1.0,
    chapterTitle: 'CAPITOLO PRIMO',
    prompt: '◀ tendi ▶',
    promptK: 1,
    flow: 0.5,
    beat: 0.5,
    mash: { active: true, progress: 0.5, hits: 3, won: false, lost: false },
  };
  drawUIOverlay(ctx, S, W, H, o);
  const B = overlayBands(H);
  const bands = BAND_KEYS.map(k => B[k]);
  const inSomeBand = y => bands.some(b => y >= b.y0 - 0.6 && y <= b.y1 + 0.6);
  for (const c of ctx.calls) {
    if (c.op === 'fillRect') {
      assert.ok([c.x, c.y, c.w, c.h].every(Number.isFinite), 'fillRect non finito: ' + JSON.stringify(c));
      assert.ok(inSomeBand(c.y / S) && inSomeBand((c.y + c.h) / S), 'fillRect fuori bande: ' + JSON.stringify(c));
    } else if (c.op === 'fillText') {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'fillText non finito: ' + JSON.stringify(c));
      assert.ok(inSomeBand(c.y / S), 'fillText fuori bande: ' + JSON.stringify(c));
    }
  }
  // ogni elemento noto sta nella SUA banda (niente collisioni tra elementi)
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  const inBand = (y, b) => y >= b.y0 - 0.6 && y <= b.y1 + 0.6;
  const check = (txt, band) => {
    const hits = texts.filter(c => c.text === txt);
    assert.ok(hits.length >= 1, 'testo non disegnato: ' + txt);
    for (const c of hits) assert.ok(inBand(c.y / S, band), txt + ' fuori banda: y=' + (c.y / S));
  };
  check(o.inscription, B.inscription);
  check(o.chapterTitle, B.chapter);
  check(o.threatMsg.toUpperCase(), B.threatMsg);
  check(o.prompt, B.prompt);
  check('TI AFFERRA — MARTELLA!', B.mash);
});

test('shouldDrawLyrics: true per playing/mash/unlocked, false per title/cta/collapse', () => {
  for (const p of ['playing', 'mash', 'unlocked']) assert.equal(shouldDrawLyrics(p), true, p);
  for (const p of ['title', 'cta', 'collapse', '', null, undefined, 'boh']) {
    assert.equal(shouldDrawLyrics(p), false, String(p));
  }
});

// ---------------------------------------------------------------------------
// T8: VARIETY — oggetti di missione sulla parete + HUD missione in banda.
// ---------------------------------------------------------------------------
import { drawVariety, drawMissionHUD } from '../src/art.js';

// climb finto: xOf/yOf lineari, cx = centro
function fakeClimb() {
  return { xOf: c => 20 + c * 24, yOf: r => 40 + r * 24, cx: 3 };
}

function fakeVariety() {
  return {
    id: 'v1',
    mission: { text: 'Raccogli i ricordi', target: 3, current: 1, done: false },
    items: [
      { id: 'a', kind: 'item',   name: 'nodo',   effect: '+1', at: 0, row: 2, c: 2, collected: false }, // y=88 in view
      { id: 'b', kind: 'friend', name: 'amico',  effect: 'aiuto', at: 1, row: 3, c: 4, collected: false }, // y=112 in view
      { id: 'c', kind: 'enemy',  name: 'rivale', effect: 'danno', at: 2, row: 4, c: 1, collected: false }, // y=136 in view
      { id: 'd', kind: 'egg',    name: 'uovo',   effect: '?', at: 3, row: 5, c: 5, collected: false }, // y=160 in view
      { id: 'e', kind: 'item',   name: 'preso',  effect: '+1', at: 4, row: 2, c: 2, collected: true },  // collected -> mai
      { id: 'f', kind: 'item',   name: 'fuori',  effect: '+1', at: 5, row: -5, c: 2, collected: false }, // y=-80 culled
      { id: 'g', kind: 'item',   name: 'sotto',  effect: '+1', at: 6, row: 20, c: 2, collected: false }, // y=520 culled
    ],
  };
}

test('drawVariety: disegna gli item in vista, culla i fuori schermo, ignora i collected', () => {
  const ctx = recCtx();
  drawVariety(ctx, fakeVariety(), fakeClimb(), 0, 2.5, 320, 180);
  assert.ok(ctx.calls.length > 0, 'nessun pixel disegnato');
  for (const c of ctx.calls) {
    if (c.op === 'fillRect') {
      assert.ok([c.x, c.y, c.w, c.h].every(Number.isFinite), 'fillRect non finito: ' + JSON.stringify(c));
      assert.ok(c.y >= -24 && c.y <= 180 + 24, 'fillRect fuori view: ' + JSON.stringify(c));
    }
  }
  // i collected non devono produrre nulla: confronto con la varietà senza di essi
  const v2 = fakeVariety();
  v2.items = v2.items.filter(it => !it.collected);
  const ctx2 = recCtx();
  drawVariety(ctx2, v2, fakeClimb(), 0, 2.5, 320, 180);
  assert.deepEqual(ctx.calls, ctx2.calls, 'i collected hanno disegnato qualcosa');
});

test('drawVariety: deterministico e NaN-safe', () => {
  const a = recCtx(), b = recCtx();
  drawVariety(a, fakeVariety(), fakeClimb(), 0, 2.5, 320, 180);
  drawVariety(b, fakeVariety(), fakeClimb(), 0, 2.5, 320, 180);
  assert.deepEqual(a.calls, b.calls, 'non deterministico');
  const n = recCtx();
  drawVariety(n, fakeVariety(), fakeClimb(), NaN, NaN, NaN, NaN);
  for (const c of n.calls) {
    if (c.op === 'fillRect') assert.ok([c.x, c.y, c.w, c.h].every(Number.isFinite), 'NaN: ' + JSON.stringify(c));
  }
  // input degeneri: nessun throw
  drawVariety(recCtx(), null, null, 0, 0, 320, 180);
  drawVariety(recCtx(), { items: [] }, fakeClimb(), 0, 0, 320, 180);
  assert.ok(true);
});

test('drawVariety: i 4 kind usano colori distinti (item/friend/enemy/egg)', () => {
  const kinds = ['item', 'friend', 'enemy', 'egg'];
  const colors = kinds.map(kind => {
    const v = { id: 'x', mission: null, items: [{ id: 'i', kind, name: 'n', effect: 'e', at: 0, row: 2, c: 2, collected: false }] };
    const ctx = recCtx();
    drawVariety(ctx, v, fakeClimb(), 0, 2.5, 320, 180);
    return new Set(ctx.calls.filter(c => c.op === 'fillRect').map(c => c.fill));
  });
  for (let i = 0; i < kinds.length; i++) {
    assert.ok(colors[i].size > 0, kinds[i] + ': nessun pixel');
    for (let j = i + 1; j < kinds.length; j++) {
      const shared = [...colors[i]].filter(c => colors[j].has(c));
      assert.ok(shared.length < colors[i].size || shared.length < colors[j].size,
        kinds[i] + ' e ' + kinds[j] + ' disegnano identici');
    }
  }
});

test('drawMissionHUD: testo finito, mostra current/target, done usa colore distinto', () => {
  const S = 3, W = 320, H = 180;
  const ctx = recCtx();
  drawMissionHUD(ctx, S, W, H, { text: 'Raccogli i ricordi', current: 1, target: 3, done: false });
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  assert.ok(texts.length > 0, 'nessun testo');
  for (const c of texts) assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'coord non finita');
  const joined = texts.map(c => c.text).join(' ');
  assert.ok(joined.includes('1/3'), 'current/target mancante: ' + joined);
  const B = overlayBands(H);
  for (const c of texts) assert.ok(c.y / S >= B.mission.y0 - 0.6 && c.y / S <= B.mission.y1 + 0.6,
    'testo fuori banda mission: y=' + (c.y / S));
  // done: colore distinto (redHot) e check
  const done = recCtx();
  drawMissionHUD(done, S, W, H, { text: 'Raccogli i ricordi', current: 3, target: 3, done: true });
  const doneTexts = done.calls.filter(c => c.op === 'fillText');
  assert.ok(doneTexts.some(c => c.fill === C.redHot), 'done non usa redHot');
  assert.ok(doneTexts.map(c => c.text).join(' ').includes('✓'), 'done senza check');
  const notDone = texts.filter(c => c.fill === C.redHot);
  assert.equal(notDone.length, 0, 'stato non-done non deve usare redHot');
  // NaN-safe
  const n = recCtx();
  drawMissionHUD(n, NaN, NaN, NaN, { text: null, current: NaN, target: NaN, done: false });
  for (const c of n.calls) {
    if (c.op === 'fillText' || c.op === 'fillRect') {
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'NaN: ' + JSON.stringify(c));
    }
  }
});

test('overlayBands: include la banda mission e resta pairwise disgiunta', () => {
  for (const H of [180, 240, 120]) {
    const b = overlayBands(H);
    assert.ok(b.mission, 'banda mission mancante');
    assert.ok(Number.isFinite(b.mission.y0) && Number.isFinite(b.mission.y1), 'mission non finita');
    assert.ok(b.mission.y0 < b.mission.y1, 'mission vuota');
    const keys = Object.keys(b);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = b[keys[i]], c = b[keys[j]];
        assert.ok(a.y1 <= c.y0 || c.y1 <= a.y0,
          'bande sovrapposte: ' + keys[i] + ' vs ' + keys[j] + ' @H=' + H);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// T5: ISTERESI DELLA LIRICA — lyricIndexAt(lines, pos, minIdx): l'indice non
// torna MAI indietro quando il chiamante impone un floor (sweep sui bordi).
// ---------------------------------------------------------------------------
import { lyricIndexAt } from '../src/art.js';

test('lyricIndexAt: con minIdx l\'indice non decresce mai (sweep avanti/indietro sui bordi)', () => {
  const lines = [[0, 'a'], [5, 'b'], [10, 'c'], [15, 'd']];
  let min = 0;
  for (let k = 0; k < 3; k++) {
    for (let pos = -2; pos <= 20; pos += 0.25) {
      const idx = lyricIndexAt(lines, pos, min);
      assert.ok(idx >= min, 'indice tornato indietro: ' + idx + ' < ' + min + ' @pos=' + pos);
      min = idx;
    }
    for (let pos = 20; pos >= -2; pos -= 0.25) {
      const idx = lyricIndexAt(lines, pos, min);
      assert.ok(idx >= min, 'indice tornato indietro in discesa: ' + idx + ' < ' + min + ' @pos=' + pos);
      min = idx;
    }
  }
  assert.equal(min, lines.length - 1, 'la sweep non ha raggiunto l\'ultima riga');
});

test('lyricIndexAt: minIdx impone il floor; NaN/omesso → comportamento storico', () => {
  const lines = [[0, 'a'], [5, 'b'], [10, 'c']];
  assert.equal(lyricIndexAt(lines, 0, 2), 2, 'minIdx non applicato');
  assert.equal(lyricIndexAt(lines, 6, 0), 1, 'minIdx 0 non deve cambiare il calcolo');
  assert.equal(lyricIndexAt(lines, 6, NaN), 1, 'minIdx NaN deve essere ignorato');
  assert.equal(lyricIndexAt(lines, 6, undefined), 1, 'minIdx omesso = storico');
  assert.equal(lyricIndexAt(lines, 0, -5), 0, 'minIdx negativo → 0');
  assert.equal(lyricIndexAt([], 3, 2), -1, 'vuoto resta -1');
  assert.equal(lyricIndexAt(lines, NaN, 1), 1, 'pos NaN → 0, poi floor 1');
});

// ---------------------------------------------------------------------------
// T5: MISSIONE — la banda mission sta SOPRA il prompt (slot chiaro), non più
// incollata sotto l'iscrizione; tutte le bande restano disgiunte.
// ---------------------------------------------------------------------------
test('overlayBands: la mission sta tra threatMsg e prompt (slot chiaro)', () => {
  for (const H of [180, 240, 120]) {
    const b = overlayBands(H);
    assert.ok(b.mission.y0 >= b.threatMsg.y1, 'mission non è sotto threatMsg @H=' + H);
    assert.ok(b.mission.y1 <= b.prompt.y0, 'mission non è sopra prompt @H=' + H);
    assert.ok(b.mission.y0 > b.inscription.y1, 'mission ancora incollata all\'iscrizione @H=' + H);
    assert.ok(b.mission.y1 - b.mission.y0 >= 4, 'mission troppo sottile @H=' + H);
  }
});

test('drawMissionHUD: testo centrato nella banda mission (leggibile)', () => {
  const S = 3, W = 320, H = 180;
  const ctx = recCtx();
  drawMissionHUD(ctx, S, W, H, { text: 'Raccogli i ricordi', current: 1, target: 3, done: false });
  const texts = ctx.calls.filter(c => c.op === 'fillText');
  assert.ok(texts.length > 0, 'nessun testo');
  for (const c of texts) {
    assert.ok(Math.abs(c.x - (W / 2) * S) <= S, 'testo non centrato: x=' + c.x);
  }
});

// ---------------------------------------------------------------------------
// T5: OMINI — figure pixel sulla parete. Ogni animazione di OMINI_ANIMS deve
// disegnare DIVERSAMENTE; coordinate intere, palette-safe, deterministiche.
// ---------------------------------------------------------------------------
import { drawOmino } from '../src/art.js';
import { OMINI_ANIMS } from '../src/omini.js';

function fakeOmino(anim, over) {
  return { id: 'om0', row: 2, c: 2, anim, phase: 0.7, resolved: false, verb: null, reactT: 0, ...(over || {}) };
}

test('drawOmino: ogni animazione di OMINI_ANIMS disegna, finita e palette-safe', () => {
  for (const anim of OMINI_ANIMS) {
    const ctx = recCtx();
    drawOmino(ctx, fakeOmino(anim), fakeClimb(), 0, 2.5, false);
    assert.ok(ctx.calls.length > 0, anim + ': nessun pixel');
    assertFiniteCalls(ctx, 'drawOmino/' + anim);
  }
});

test('drawOmino: coordinate INTERE (pixel art) e vicino alla sua fila/colonna', () => {
  const cl = fakeClimb();                 // xOf: 20+c*24, yOf: 40+r*24
  const x0 = cl.xOf(2), y0 = cl.yOf(2);   // 68, 88
  for (const anim of OMINI_ANIMS) {
    const ctx = recCtx();
    drawOmino(ctx, fakeOmino(anim), cl, 0, 2.5, false);
    for (const c of ctx.calls) {
      if (c.op !== 'fillRect') continue;
      assert.ok(Number.isInteger(c.x) && Number.isInteger(c.y) && Number.isInteger(c.w) && Number.isInteger(c.h),
        anim + ': coordinate non intere ' + JSON.stringify(c));
      assert.ok(c.x >= x0 - 20 && c.x <= x0 + 20, anim + ': x lontano dalla colonna: ' + c.x);
      assert.ok(c.y >= y0 - 30 && c.y <= y0 + 12, anim + ': y lontano dalla fila: ' + c.y);
    }
  }
});

test('drawOmino: le 5 animazioni sono tutte DIVERSE tra loro', () => {
  const draws = OMINI_ANIMS.map(anim => {
    const ctx = recCtx();
    drawOmino(ctx, fakeOmino(anim), fakeClimb(), 0, 2.5, false);
    return ctx.calls;
  });
  for (let i = 0; i < draws.length; i++) {
    for (let j = i + 1; j < draws.length; j++) {
      assert.notDeepEqual(draws[i], draws[j],
        OMINI_ANIMS[i] + ' e ' + OMINI_ANIMS[j] + ' disegnano identici');
    }
  }
});

test('drawOmino: deterministico e NaN-safe (camY/time/omino degeneri)', () => {
  const a = recCtx(), b = recCtx();
  drawOmino(a, fakeOmino('tumble'), fakeClimb(), 120, 3.3, true);
  drawOmino(b, fakeOmino('tumble'), fakeClimb(), 120, 3.3, true);
  assert.deepEqual(a.calls, b.calls, 'non deterministico');
  const n = recCtx();
  drawOmino(n, fakeOmino('wave'), fakeClimb(), NaN, NaN, false);
  for (const c of n.calls) {
    if (c.op === 'fillRect') assert.ok([c.x, c.y, c.w, c.h].every(Number.isFinite), 'NaN: ' + JSON.stringify(c));
  }
  // input degeneri: nessun throw
  drawOmino(recCtx(), null, fakeClimb(), 0, 0, false);
  drawOmino(recCtx(), fakeOmino('boh'), fakeClimb(), 0, 0, false);
  drawOmino(recCtx(), fakeOmino('wave'), null, 0, 0, false);
  assert.ok(true);
});

test('drawOmino: culla i fuori schermo (sopra/sotto la view)', () => {
  const cl = fakeClimb();
  const sopra = recCtx();
  drawOmino(sopra, fakeOmino('wave', { row: -5 }), cl, 0, 1, false);   // y=-80
  assert.equal(sopra.calls.length, 0, 'omino sopra la view disegnato');
  const sotto = recCtx();
  drawOmino(sotto, fakeOmino('wave', { row: 20 }), cl, 0, 1, false);    // y=520
  assert.equal(sotto.calls.length, 0, 'omino sotto la view disegnato');
});

test('drawOmino: active evidenzia l\'omino (disegno diverso)', () => {
  const off = recCtx(), on = recCtx();
  drawOmino(off, fakeOmino('wave'), fakeClimb(), 0, 2.5, false);
  drawOmino(on, fakeOmino('wave'), fakeClimb(), 0, 2.5, true);
  assert.notDeepEqual(on.calls, off.calls, 'active non cambia nulla');
});
