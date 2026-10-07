import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose, drawFigure, drawClimber, drawRagdoll, ik2, poseInterp, postureSpring } from '../src/figure.js';

// Verifica che le pose siano articolate (angoli delle ossa) e che cambino
// nel tempo: è ciò che rende il gioco animato e non statico.

const STATES = ['idle', 'walk', 'run', 'climb', 'jump', 'fall', 'push', 'reach', 'tendi', 'spingi', 'scream'];

test('ogni stato produce una posa completa (tronco + 2 braccia + 2 gambe)', () => {
  for (const s of STATES) {
    const p = pose(s, 1.0);
    assert.ok(Array.isArray(p.aL) && p.aL.length === 2, s + ' braccio L');
    assert.ok(Array.isArray(p.aR) && p.aR.length === 2, s + ' braccio R');
    assert.ok(Array.isArray(p.lL) && p.lL.length === 2, s + ' gamba L');
    assert.ok(Array.isArray(p.lR) && p.lR.length === 2, s + ' gamba R');
    assert.equal(typeof p.lean, 'number');
    assert.equal(typeof p.bob, 'number');
  }
});

test('walk/run/climb/idle sono animati: la posa cambia col tempo', () => {
  for (const s of ['walk', 'run', 'climb', 'idle']) {
    const a = pose(s, 0.0), b = pose(s, 1.5);
    const moved = JSON.stringify([a.aL, a.aR, a.lL, a.lR, a.bob]) !==
                  JSON.stringify([b.aL, b.aR, b.lL, b.lR, b.bob]);
    assert.ok(moved, s + ' è statico (non cambia con la fase)');
  }
});

test('walk alterna le gambe (non è un blocco rigido)', () => {
  const a = pose('walk', 0.6);
  assert.notEqual(a.lL[0].toFixed(2), a.lR[0].toFixed(2));
});

test('le pose d\'azione sono riconoscibili: tendi vs spingi', () => {
  const t = pose('tendi', 0);
  const s = pose('spingi', 0);
  assert.ok(t.aL[0] < 0, 'tendi: braccio verso l\'alto (angolo negativo)');
  assert.ok(s.aL[0] > 1, 'spingi: braccio verso il basso (angolo positivo)');
});

test('climb porta le braccia sopra la testa', () => {
  const c = pose('climb', 0.5);
  assert.ok(c.aL[0] < -2 && c.aR[0] < -2, 'braccia in alto');
});

// ---------------------------------------------------------------------------
// TEST AGGIUNTI — dettaglio, squash&stretch, respiro, presa, luce di bordo.
// Stub ctx minimale: nessun DOM, registra le chiamate fillRect.
// ---------------------------------------------------------------------------
function stubCtx() {
  const calls = [];
  const noop = () => {};
  return {
    calls,
    fillRect(x, y, w, h) { calls.push([x, y, w, h]); },
    save: noop, restore: noop, beginPath: noop, moveTo: noop,
    lineTo: noop, stroke: noop, arc: noop,
    globalAlpha: 1, fillStyle: '#000',
  };
}

test('pose: ogni stato restituisce solo numeri finiti (nessun NaN)', () => {
  for (const s of STATES) {
    for (const ph of [0, 0.7, 1.5, 3.3, 6.28]) {
      const p = pose(s, ph);
      for (const k of ['lean', 'bob']) {
        assert.ok(Number.isFinite(p[k]), s + '.' + k + ' non finito');
      }
      for (const k of ['aL', 'aR', 'lL', 'lR']) {
        assert.ok(Number.isFinite(p[k][0]) && Number.isFinite(p[k][1]),
          s + '.' + k + ' non finito');
      }
    }
  }
});

test('drawFigure: detail+stretch+rim non lancia e produce pixel finiti', () => {
  const ctx = stubCtx();
  drawFigure(ctx, 40, 60, { h: 16, state: 'walk', phase: 1.2, detail: true, stretch: 0.5, rim: true });
  assert.ok(ctx.calls.length > 0, 'nessun pixel disegnato');
  for (const [x, y, w, hh] of ctx.calls) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
      'fillRect con coordinate non finite');
  }
});

test('drawFigure: stretch estremo/NaN resta limitato e sicuro', () => {
  for (const st of [-5, -1, 0, 1, 5, NaN, Infinity, -Infinity]) {
    const ctx = stubCtx();
    drawFigure(ctx, 30, 50, { state: 'run', phase: 0.4, stretch: st, detail: true });
    for (const [x, y, w, hh] of ctx.calls) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
        'stretch=' + st + ' ha prodotto coordinate non finite');
    }
  }
});

test('drawFigure: default identico a detail/stretch/rim espliciti a zero', () => {
  const a = stubCtx(), b = stubCtx();
  drawFigure(a, 25, 45, { h: 16, state: 'idle', phase: 0.9 });
  drawFigure(b, 25, 45, { h: 16, state: 'idle', phase: 0.9, detail: false, stretch: 0, rim: false });
  assert.deepEqual(a.calls, b.calls, 'i nuovi default alterano il rendering storico');
});

test('drawClimber: detail+breathe+grip+rim non lancia e resta finito', () => {
  for (const br of [0, 0.5, 1, 3, NaN]) {
    for (const g of [0, 0.5, 1, 2, NaN]) {
      const ctx = stubCtx();
      drawClimber(ctx, 20, 10, 40, 12, { h: 17, phase: 1.1, detail: true, breathe: br, grip: g, rim: true });
      for (const [x, y, w, hh] of ctx.calls) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
          'climber breathe=' + br + ' grip=' + g + ' non finito');
      }
    }
  }
});

test('drawClimber: default identico a detail/breathe/grip/rim espliciti a zero', () => {
  const a = stubCtx(), b = stubCtx();
  drawClimber(a, 20, 10, 40, 12, { h: 17, phase: 0.8 });
  drawClimber(b, 20, 10, 40, 12, { h: 17, phase: 0.8, detail: false, breathe: 0, grip: 1, rim: false });
  assert.deepEqual(a.calls, b.calls, 'i nuovi default alterano il rendering storico');
});

// ---------------------------------------------------------------------------
// IK � le braccia NON sono tentacoli: la mano non supera mai la portata.
// ---------------------------------------------------------------------------
test('ik2: la distanza spalla?mano non supera mai la portata (anti-tentacolo)', () => {
  const l1 = 13, l2 = 13;
  for (const [tx, ty] of [[0, 0], [5, -3], [100, 100], [-200, -50], [0, -999], [1e6, 1e6]]) {
    const r = ik2(20, 30, tx, ty, l1, l2, 1);
    const d = Math.hypot(r.hx - 20, r.hy - 30);
    assert.ok(d <= l1 + l2 + 0.05, 'braccio allungato oltre la portata: ' + d.toFixed(2));
    assert.ok(Number.isFinite(r.ex) && Number.isFinite(r.ey) && Number.isFinite(r.hx) && Number.isFinite(r.hy));
  }
});

test('ik2: gomito e mano restano finiti anche con input degeneri', () => {
  for (const args of [
    [0, 0, 0, 0, 12, 12, 1], [0, 0, 0, 0, 12, 12, -1],
    [0, 0, NaN, NaN, 12, 12, 1], [0, 0, 5, 5, NaN, NaN, 1],
  ]) {
    const r = ik2(...args);
    assert.ok(Number.isFinite(r.hx) && Number.isFinite(r.hy) && Number.isFinite(r.ex) && Number.isFinite(r.ey));
  }
});

test('drawClimber: braccia piegate (gomito non collineare su presa ampia)', () => {
  const a = stubCtx();
  // mani molto distanti: con la vecchia versione il braccio si allungava dritto
  drawClimber(a, 5, 5, 60, 5, { h: 18, bx: 32, by: 40 });
  assert.ok(a.calls.length > 0);
  for (const [x, y, w, hh] of a.calls) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh));
  }
});

// ---------------------------------------------------------------------------
// S-ANAT — interpolazione di posa + molla di postura (active ragdoll).
// ---------------------------------------------------------------------------
const JOINTS = ['aL', 'aR', 'lL', 'lR'];

function assertPoseFinite(p, label) {
  assert.ok(Number.isFinite(p.lean), label + '.lean non finito');
  assert.ok(Number.isFinite(p.bob), label + '.bob non finito');
  for (const k of JOINTS) {
    assert.ok(Array.isArray(p[k]) && p[k].length === 2, label + '.' + k + ' forma errata');
    assert.ok(Number.isFinite(p[k][0]) && Number.isFinite(p[k][1]), label + '.' + k + ' non finito');
  }
}

test('poseInterp: k=0 restituisce esattamente la posa A', () => {
  for (const [sa, pa, sb, pb] of [
    ['walk', 0.4, 'run', 1.1], ['idle', 0.0, 'scream', 2.2], ['climb', 1.3, 'fall', 0.7],
  ]) {
    const got = poseInterp(sa, pa, sb, pb, 0);
    assert.deepEqual(got, pose(sa, pa), 'k=0 non è identico a pose(A)');
  }
});

test('poseInterp: k=1 restituisce esattamente la posa B', () => {
  for (const [sa, pa, sb, pb] of [
    ['walk', 0.4, 'run', 1.1], ['idle', 0.0, 'scream', 2.2], ['climb', 1.3, 'fall', 0.7],
  ]) {
    const got = poseInterp(sa, pa, sb, pb, 1);
    assert.deepEqual(got, pose(sb, pb), 'k=1 non è identico a pose(B)');
  }
});

test('poseInterp: k=0.5 è finito e compreso fra A e B per ogni giunto', () => {
  const A = pose('walk', 0.4), B = pose('run', 1.1);
  const M = poseInterp('walk', 0.4, 'run', 1.1, 0.5);
  assertPoseFinite(M, 'mid');
  for (const k of JOINTS) {
    for (const i of [0, 1]) {
      const lo = Math.min(A[k][i], B[k][i]), hi = Math.max(A[k][i], B[k][i]);
      assert.ok(M[k][i] >= lo - 1e-9 && M[k][i] <= hi + 1e-9,
        k + '[' + i + '] fuori dall\'intervallo A..B');
    }
  }
  for (const k of ['lean', 'bob']) {
    const lo = Math.min(A[k], B[k]), hi = Math.max(A[k], B[k]);
    assert.ok(M[k] >= lo - 1e-9 && M[k] <= hi + 1e-9, k + ' fuori dall\'intervallo A..B');
  }
});

test('poseInterp: k NaN o fuori range viene limitato in modo sicuro', () => {
  for (const k of [NaN, Infinity, -Infinity, -3, 5, undefined]) {
    const got = poseInterp('walk', 0.4, 'run', 1.1, k);
    assertPoseFinite(got, 'k=' + String(k));
  }
  // NaN/undefined → clamp a 0 (posa A); -3 → 0; 5 → 1
  assert.deepEqual(poseInterp('walk', 0.4, 'run', 1.1, NaN), pose('walk', 0.4));
  assert.deepEqual(poseInterp('walk', 0.4, 'run', 1.1, -3), pose('walk', 0.4));
  assert.deepEqual(poseInterp('walk', 0.4, 'run', 1.1, 5), pose('run', 1.1));
});

test('postureSpring: 1 a t=0, 0 a t>=decay, monotona non crescente, finita', () => {
  const decay = 0.4;
  assert.equal(postureSpring(0, decay), 1, 't=0 deve valere 1');
  assert.equal(postureSpring(decay, decay), 0, 't=decay deve valere 0');
  assert.equal(postureSpring(decay + 1, decay), 0, 't>decay deve valere 0');
  let prev = Infinity;
  for (let t = 0; t <= decay + 0.001; t += decay / 20) {
    const v = postureSpring(t, decay);
    assert.ok(Number.isFinite(v), 'non finito a t=' + t);
    assert.ok(v >= 0 && v <= 1, 'fuori [0,1] a t=' + t + ': ' + v);
    assert.ok(v <= prev + 1e-9, 'non monotona a t=' + t);
    prev = v;
  }
  for (const t of [-5, NaN, Infinity, -Infinity, 1e9]) {
    assert.ok(Number.isFinite(postureSpring(t, decay)), 'non finito a t=' + String(t));
  }
  // decay degenere → fallback sicuro, mai NaN
  for (const d of [0, -1, NaN, Infinity]) {
    assert.ok(Number.isFinite(postureSpring(0.1, d)), 'decay=' + String(d) + ' non finito');
  }
});

// figura ragdoll fittizia: 5 particelle {x,y,px,py}
function stubFig() {
  return {
    parts: [
      { x: 30, y: 40, px: 29, py: 39 },   // bacino
      { x: 30, y: 34, px: 29, py: 33 },   // spalle
      { x: 30, y: 31, px: 29, py: 30 },   // testa
      { x: 27, y: 46, px: 26, py: 45 },   // piede L
      { x: 33, y: 46, px: 32, py: 45 },   // piede R
    ],
  };
}

test('drawRagdoll: default identico a chiamata senza nuovo parametro (REGRESSIONE)', () => {
  const a = stubCtx(), b = stubCtx();
  drawRagdoll(a, stubFig(), { h: 14, color: '#f00', thickness: 1, alpha: 1 });
  drawRagdoll(b, stubFig(), { h: 14, color: '#f00', thickness: 1, alpha: 1, posture: 0 });
  assert.deepEqual(a.calls, b.calls, 'posture=0 altera il rendering storico');
  assert.ok(a.calls.length > 0, 'nessun pixel disegnato');
});

test('drawRagdoll: posture>0 differisce dal default e resta finito', () => {
  const base = stubCtx(), braced = stubCtx();
  drawRagdoll(base, stubFig(), { h: 14 });
  drawRagdoll(braced, stubFig(), { h: 14, posture: 0.05 });
  assert.notDeepEqual(braced.calls, base.calls, 'posture>0 non ha effetto');
  for (const [x, y, w, hh] of braced.calls) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
      'posture ha prodotto coordinate non finite');
  }
  // posture degenere non deve mai lanciare né produrre NaN
  for (const p of [NaN, Infinity, -Infinity, -1, 1e9]) {
    const c = stubCtx();
    drawRagdoll(c, stubFig(), { h: 14, posture: p });
    for (const [x, y, w, hh] of c.calls) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
        'posture=' + String(p) + ' non finito');
    }
  }
});

test('drawFigure: breathe default identico a zero (REGRESSIONE) e breathe>0 finito', () => {
  const a = stubCtx(), b = stubCtx();
  drawFigure(a, 25, 45, { h: 16, state: 'idle', phase: 0.9 });
  drawFigure(b, 25, 45, { h: 16, state: 'idle', phase: 0.9, breathe: 0 });
  assert.deepEqual(a.calls, b.calls, 'breathe=0 altera il rendering storico');
  const c = stubCtx();
  drawFigure(c, 25, 45, { h: 16, state: 'idle', phase: 0.9, breathe: 1 });
  for (const [x, y, w, hh] of c.calls) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(hh),
      'breathe ha prodotto coordinate non finite');
  }
});
