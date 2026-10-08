import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGrip, gripHit, stepGrip, gripRatio, gripOutcome } from '../src/grip.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('createGrip: defaults completi e v iniziale a 1', () => {
  const g = createGrip();
  assert.equal(g.v, 1);
  assert.deepEqual(g.cfg, {
    hitWind: 0.12, hitQuake: 0.26, hitDebris: 0.22,
    hitIvy: 0.14, hitMash: 0.5, regen: 0.055, scale: 1,
  });
});

test('createGrip: override parziale da g.grip, defaults per il resto', () => {
  const g = createGrip({ grip: { hitMash: 0.9, regen: 0.5 } });
  assert.equal(g.cfg.hitMash, 0.9);
  assert.equal(g.cfg.regen, 0.5);
  assert.equal(g.cfg.hitWind, 0.12);
  assert.equal(g.cfg.hitQuake, 0.26);
});

test('gripHit: sottrae e clampa a 0 (mai negativo)', () => {
  const g = createGrip();
  gripHit(g, 0.3);
  assert.ok(Math.abs(g.v - 0.7) < 1e-9, 'v atteso 0.7, trovato ' + g.v);
  gripHit(g, 5);
  assert.equal(g.v, 0, 'v deve clampare a 0');
});

test('stepGrip: rigenera monotono e finito, clamp a 1', () => {
  const g = createGrip();
  gripHit(g, 0.5);
  let prev = g.v;
  for (let i = 0; i < 2000; i++) {
    stepGrip(g, 0.016);
    assert.ok(Number.isFinite(g.v), 'v non finito');
    assert.ok(g.v >= prev - 1e-12, 'regen non monotona');
    assert.ok(g.v <= 1, 'v oltre 1');
    prev = g.v;
  }
  assert.equal(g.v, 1, 'dopo abbastanza tempo v torna a 1');
});

test('gripRatio: clamp01 di v', () => {
  const g = createGrip();
  assert.equal(gripRatio(g), 1);
  g.v = 1.7; assert.equal(gripRatio(g), 1);
  g.v = -0.4; assert.equal(gripRatio(g), 0);
  g.v = 0.42; assert.equal(gripRatio(g), 0.42);
});

test('gripOutcome: null finché v>0', () => {
  const g = createGrip();
  assert.equal(gripOutcome(g, 5, 0), null);
  gripHit(g, 0.5);
  assert.equal(gripOutcome(g, 5, 0), null);
});

test('gripOutcome: v==0 e curRow>startRow => fall', () => {
  const g = createGrip();
  gripHit(g, 1);
  assert.equal(g.v, 0);
  assert.equal(gripOutcome(g, 3, 0), 'fall');
});

test('gripOutcome: v==0 e curRow<=startRow => defeat', () => {
  const g = createGrip();
  gripHit(g, 1);
  assert.equal(gripOutcome(g, 0, 0), 'defeat');
  assert.equal(gripOutcome(g, 0, 4), 'defeat');
});

test('deterministico: stessa sequenza => stesso risultato su run diverse', () => {
  const run = () => {
    const g = createGrip();
    const seq = [0.1, 0.2, 0.05, 0.45, 0.3];
    const out = [];
    for (const a of seq) { gripHit(g, a); stepGrip(g, 0.05); out.push(g.v); }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('grip.js non usa Math.random (determinismo puro)', () => {
  const src = readFileSync(join(__dirname, '..', 'src', 'grip.js'), 'utf8');
  assert.ok(!/Math\.random/.test(src), 'grip.js contiene Math.random');
});
