import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose } from '../src/figure.js';

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
