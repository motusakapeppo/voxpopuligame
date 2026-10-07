import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPostDefaults, scanlineAlpha, clamp01, bloomPassOn } from '../src/renderer.js';

test('createPostDefaults restituisce i campi attesi con valori finiti', () => {
  const d = createPostDefaults();
  for (const k of ['bloom', 'bloomThreshold', 'chroma', 'scan', 'grain', 'vignette', 'glitch', 'flash']) {
    assert.ok(Number.isFinite(d[k]), k + ' non finito');
    assert.ok(d[k] >= 0 && d[k] <= 1, k + ' fuori 0..1: ' + d[k]);
  }
});

test('clamp01 limita e protegge dai non-finiti', () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 1);
});

test('scanlineAlpha: righe alternate, clampata, deterministica', () => {
  assert.equal(scanlineAlpha(0, 0.5), 0.5);
  assert.equal(scanlineAlpha(2, 0.5), 0.5);
  assert.equal(scanlineAlpha(1, 0.5), 0);
  assert.equal(scanlineAlpha(3, 0.5), 0);
  assert.equal(scanlineAlpha(0, 5), 1);      // clamp
  assert.equal(scanlineAlpha(NaN, 0.5), 0);  // non finito
});

test('bloomPassOn: il rosso acceso fiorisce, lo scuro no (palette rossa)', () => {
  assert.equal(bloomPassOn(224, 16, 16, 0.45), true);  // C.redHot
  assert.equal(bloomPassOn(88, 8, 8, 0.45), false);    // C.redDark
  assert.equal(bloomPassOn(255, 255, 255, 0.9), true);
  assert.equal(bloomPassOn(0, 0, 0, 0.5), false);
  assert.equal(bloomPassOn(NaN, 0, 0, 0.5), false);    // non finito → false
});
