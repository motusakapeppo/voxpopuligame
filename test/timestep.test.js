import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStepper } from '../src/timestep.js';

// Fixed-timestep accumulator: converte un frame dt variabile in N passi fissi.
// Deterministico, puro, senza allocazioni per-frame oltre allo stato interno.

test('createStepper: due passi da 1/120 con step 1/120', () => {
  const s = createStepper({ step: 1 / 120, maxFrame: 0.25, maxSteps: 5 });
  const r = s.step(1 / 60);          // 16.6ms a 120Hz = 2 passi
  assert.equal(r.steps, 2, 'attesi 2 passi');
  assert.equal(r.dt, 1 / 120, 'dt fisso');
});

test('createStepper: clamp del frame a maxFrame e maxSteps', () => {
  const s = createStepper({ step: 1 / 120, maxFrame: 0.25, maxSteps: 5 });
  const r = s.step(1.0);             // frame lunghissimo
  assert.equal(r.steps, 5, 'maxSteps deve clampare');
  assert.ok(s.accumulator <= 0.25, 'accumulator deve essere limitato');
});

test('createStepper: dt negativo o NaN non produce passi', () => {
  const s = createStepper({ step: 1 / 120, maxFrame: 0.25, maxSteps: 5 });
  assert.equal(s.step(-1).steps, 0);
  assert.equal(s.step(NaN).steps, 0);
});

test('createStepper: il tempo consumato è steps*step', () => {
  const s = createStepper({ step: 1 / 120, maxFrame: 0.25, maxSteps: 5 });
  const r = s.step(0.05);            // 6 passi possibili, clamp 5
  assert.equal(r.used, r.steps * (1 / 120));
});

test('createStepper: due istanze non condividono stato', () => {
  const a = createStepper({ step: 1 / 120 });
  const b = createStepper({ step: 1 / 120 });
  a.step(0.05);
  assert.equal(b.accumulator, 0, 'lo stato non deve essere condiviso');
});

test('createStepper: passi frammentati accumulano fino a un passo intero', () => {
  const s = createStepper({ step: 1 / 60, maxFrame: 0.25, maxSteps: 5 });
  assert.equal(s.step(1 / 240).steps, 0);   // 1/4 di passo
  assert.equal(s.step(1 / 240).steps, 0);   // 1/2
  assert.equal(s.step(1 / 240).steps, 0);   // 3/4
  assert.equal(s.step(1 / 240).steps, 1);   // 1 passo intero
});
