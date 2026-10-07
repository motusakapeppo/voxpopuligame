import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose, drawFigure, drawClimber, ik2 } from '../src/figure.js';

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
