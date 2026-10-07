import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFx, emitFx, stepFx, drawFx, addEmitter, clamp01, FX_CAP } from '../src/fx.js';

// ctx finto: registra le chiamate e intercetta NaN/Infinity.
function fakeCtx() {
  const calls = [];
  const bad = [];
  const chk = (...vals) => { for (const v of vals) if (!Number.isFinite(v)) bad.push(v); };
  return {
    calls, bad,
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1,
    save() {}, restore() {},
    fillRect(x, y, w, h) { chk(x, y, w, h); calls.push(['fillRect', x, y, w, h]); },
    beginPath() {}, moveTo(x, y) { chk(x, y); }, lineTo(x, y) { chk(x, y); }, stroke() {},
  };
}

test('clamp01 limita e protegge dai non-finiti', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(9), 1);
  assert.equal(clamp01(NaN), 0);
  assert.equal(clamp01(Infinity), 0);
});

test('createFx è deterministico e ha la forma attesa', () => {
  const a = createFx(7), b = createFx(7);
  assert.ok(Array.isArray(a.parts) && Array.isArray(a.pool) && Array.isArray(a.emitters));
  assert.equal(a.seed, 7);
  assert.equal(typeof a.rng, 'function');
  assert.equal(a.rng(), b.rng(), 'stesso seed → stessa sequenza');
});

test('emitFx fa crescere il numero di particelle', () => {
  const fx = createFx(1);
  assert.equal(fx.parts.length, 0);
  const n = emitFx(fx, 'ember', 100, 50, { count: 10 });
  assert.equal(n, 10);
  assert.equal(fx.parts.length, 10);
  emitFx(fx, 'spark', 100, 50, { count: 5 });
  assert.equal(fx.parts.length, 15);
});

test('il cap è rispettato anche emettendo molto', () => {
  const fx = createFx(2);
  for (let i = 0; i < 50; i++) emitFx(fx, 'dust', 10, 10, { count: 30 });
  assert.ok(fx.parts.length <= FX_CAP, `parti=${fx.parts.length} > cap=${FX_CAP}`);
  assert.equal(fx.parts.length, FX_CAP);
});

test('le posizioni restano finite dopo migliaia di step', () => {
  const fx = createFx(3);
  for (const t of ['ember', 'spark', 'dust', 'blood', 'ash', 'drop', 'smoke', 'shock', 'bolt']) {
    emitFx(fx, t, 160, 90, { count: 12 });
  }
  for (let i = 0; i < 5000; i++) {
    stepFx(fx, 0.016, i * 0.5, { H: 180, ambient: { types: ['ember'], rate: 3, xRange: [0, 320], y: 180 } });
    for (const p of fx.parts) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `pos non finita: ${p.x},${p.y}`);
      assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy), `vel non finita: ${p.vx},${p.vy}`);
      assert.ok(Number.isFinite(p.life) && Number.isFinite(p.age), 'vita non finita');
    }
    assert.ok(fx.parts.length <= FX_CAP, 'cap superato durante lo step');
  }
});

test('lo step rimuove prima o poi le particelle morte', () => {
  const fx = createFx(4);
  emitFx(fx, 'spark', 50, 50, { count: 20, life: 0.1 });
  assert.equal(fx.parts.length, 20);
  for (let i = 0; i < 60; i++) stepFx(fx, 0.016, 0, { H: 180 });
  assert.equal(fx.parts.length, 0, 'le scintille non sono morte');
  assert.ok(fx.pool.length > 0, 'il pool non ha riusato gli oggetti');
});

test('il pool viene riusato: nessuna crescita illimitata di oggetti', () => {
  const fx = createFx(5);
  for (let round = 0; round < 30; round++) {
    emitFx(fx, 'spark', 50, 50, { count: 20, life: 0.05 });
    for (let i = 0; i < 10; i++) stepFx(fx, 0.016, 0, { H: 180 });
  }
  assert.ok(fx.pool.length <= FX_CAP, 'pool oltre il cap');
  assert.ok(fx.parts.length <= FX_CAP, 'parti oltre il cap');
});

test('stesso seed → stessa simulazione (determinismo)', () => {
  const run = () => {
    const fx = createFx(42);
    emitFx(fx, 'ember', 100, 100, { count: 8 });
    emitFx(fx, 'blood', 100, 100, { count: 8 });
    for (let i = 0; i < 120; i++) stepFx(fx, 0.016, 0, { H: 180, ambient: { types: ['ash'], rate: 4, xRange: [0, 320], y: 0 } });
    return fx.parts.map(p => [p.type, p.x, p.y, p.life]);
  };
  assert.deepEqual(run(), run());
});

test('seed diversi → simulazioni diverse', () => {
  const run = (seed) => {
    const fx = createFx(seed);
    emitFx(fx, 'ember', 100, 100, { count: 8 });
    for (let i = 0; i < 30; i++) stepFx(fx, 0.016, 0, { H: 180 });
    return fx.parts.map(p => p.x);
  };
  assert.notDeepEqual(run(1), run(2));
});

test('l ambiente spawna dal fondo con il rate richiesto', () => {
  const fx = createFx(6);
  const amb = { types: ['ember'], rate: 3, xRange: [0, 320], y: 180 };
  for (let i = 0; i < 100; i++) stepFx(fx, 0.016, 0, { H: 180, ambient: amb }); // ~1.6s → ~4-5 braci
  assert.ok(fx.parts.length >= 3, `ambiente troppo lento: ${fx.parts.length}`);
  assert.ok(fx.parts.length <= 8, `ambiente troppo veloce: ${fx.parts.length}`);
});

test('addEmitter spara a intervalli regolari', () => {
  const fx = createFx(8);
  addEmitter(fx, 'dust', 10, 10, { rate: 10, count: 1 });
  for (let i = 0; i < 100; i++) stepFx(fx, 0.016, 0, { H: 180 }); // ~1.6s → ~16
  assert.ok(fx.parts.length >= 10, `emettitore fermo: ${fx.parts.length}`);
});

test('drawFx disegna senza toccare il canvas reale e ignora i NaN', () => {
  const fx = createFx(9);
  emitFx(fx, 'ember', 100, 100, { count: 4 });
  emitFx(fx, 'shock', 100, 100, { count: 1 });
  emitFx(fx, 'bolt', 100, 100, { count: 1 });
  emitFx(fx, 'drop', 100, 100, { count: 2 });
  // particella corrotta: NON deve finire nel frame
  fx.parts.push({ type: 'ember', dead: false, age: 0, life: 1, maxLife: 1,
    x: NaN, y: 0, vx: 0, vy: 0, size: 1, alpha: 1, color: '#f00', flicker: false });
  const ctx = fakeCtx();
  drawFx(ctx, fx, 0, 1.5);
  assert.ok(ctx.calls.length > 0, 'drawFx non ha disegnato nulla');
  assert.equal(ctx.bad.length, 0, `coordinate non finite disegnate: ${ctx.bad}`);
  assert.equal(ctx.globalAlpha, 1, 'globalAlpha non ripristinato');
});

test('drawFx non esplode con stato vuoto o malformato', () => {
  const ctx = fakeCtx();
  drawFx(ctx, createFx(1), 0, 0);
  drawFx(ctx, null, 0, 0);
  drawFx(null, createFx(1), 0, 0);
  assert.equal(ctx.bad.length, 0);
});

test('stepFx tollera dt e camY non finiti', () => {
  const fx = createFx(10);
  emitFx(fx, 'ember', 100, 100, { count: 5 });
  stepFx(fx, NaN, NaN, { H: 180 });
  stepFx(fx, Infinity, 0, { H: 180 });
  for (const p of fx.parts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'dt non finito ha corrotto lo stato');
  }
});
