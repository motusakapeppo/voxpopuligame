import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMash, startMash, mashHit, stepMash, mashRatio, mashDone, MASH_DUR } from '../src/mash.js';

test('createMash parte inattivo e pulito', () => {
  const m = createMash();
  assert.equal(m.active, false);
  assert.equal(m.progress, 0);
  assert.equal(m.won, false);
  assert.equal(m.lost, false);
});

test('startMash attiva la lotta con una barra minima', () => {
  const m = startMash(createMash(), { kind: 'grabber' });
  assert.equal(m.active, true);
  assert.ok(m.progress > 0 && m.progress < 1);
  assert.equal(m.timeLeft, MASH_DUR);
});

test('martellare riempie la barra e fa vincere', () => {
  const m = startMash(createMash(), { kind: 'grabber' });
  for (let i = 0; i < 20 && m.active; i++) mashHit(m);
  assert.equal(m.won, true);
  assert.equal(m.active, false);
  assert.equal(mashDone(m), true);
});

test('se non martelli, la barra cala e perdi allo scadere del tempo', () => {
  const m = startMash(createMash(), { kind: 'grabber' });
  for (let i = 0; i < 300 && m.active; i++) stepMash(m, 0.016);
  assert.equal(m.lost, true);
  assert.equal(m.won, false);
  assert.equal(mashRatio(m), 0);
});

test('stepMash tollera dt non finito', () => {
  const m = startMash(createMash(), { kind: 'grabber' });
  assert.doesNotThrow(() => stepMash(m, NaN));
  assert.ok(Number.isFinite(m.progress));
});

test('mashRatio resta sempre in 0..1', () => {
  const m = createMash();
  for (const p of [-5, 0, 0.5, 5, NaN]) { m.progress = p; const r = mashRatio(m); assert.ok(r >= 0 && r <= 1); }
});
