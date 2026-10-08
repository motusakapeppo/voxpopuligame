// ============================================================================
// GIMMICKS — test del motore delle meccaniche d'interazione per-traccia.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGimmick, stepGimmick, gimmickAccepts, gimmickPrompt, GIMMICK_KINDS } from '../src/gimmicks.js';

test('createGimmick: default = none', () => {
  assert.equal(createGimmick({}).kind, 'none');
});

test('createGimmick: accetta stringa o oggetto', () => {
  assert.equal(createGimmick({ gimmick: 'rhythmic' }).kind, 'rhythmic');
  assert.equal(createGimmick({ gimmick: { kind: 'hold', needed: 1 } }).needed, 1);
});

test('createGimmick: kind sconosciuto -> none', () => {
  assert.equal(createGimmick({ gimmick: 'xyz' }).kind, 'none');
});

test('rhythmic: la finestra si apre vicino al battito e si chiude a metà', () => {
  const gm = createGimmick({ gimmick: 'rhythmic' });
  stepGimmick(gm, 0);          // phase 0 -> aperta
  assert.equal(gm.ready, true);
  stepGimmick(gm, 0.25);       // phase 0.5 -> chiusa
  assert.equal(gm.ready, false);
});

test('hold: accetta solo dopo aver tenuto premuto abbastanza', () => {
  const gm = createGimmick({ gimmick: { kind: 'hold', needed: 0.5 } });
  assert.equal(gimmickAccepts(gm, true), false);
  for (let i = 0; i < 40; i++) gimmickAccepts(gm, true);   // ~0.64s
  assert.equal(gimmickAccepts(gm, true), true);
  assert.equal(gimmickAccepts(gm, false), false);          // rilascio = reset
});

test('shove: scatta ogni `every` secondi', () => {
  const gm = createGimmick({ gimmick: { kind: 'shove', every: 1 } });
  let n = 0;
  for (let i = 0; i < 200; i++) { const r = stepGimmick(gm, 0.016); if (r.shove) n++; }
  assert.ok(n >= 3 && n <= 4, 'shove count ' + n);
});

test('determinismo: stessa sequenza -> stesso stato', () => {
  const run = () => {
    const gm = createGimmick({ gimmick: 'rhythmic' });
    let acc = 0;
    for (let i = 0; i < 100; i++) { stepGimmick(gm, 0.02); if (gm.ready) acc++; }
    return acc;
  };
  assert.equal(run(), run());
});

test('gimmickPrompt: testo non vuoto per i tipi attivi', () => {
  for (const kind of GIMMICK_KINDS.filter(k => k !== 'none')) {
    assert.ok(gimmickPrompt(createGimmick({ gimmick: kind })).length > 0, kind);
  }
});

test('gimmicks.js non usa Math.random', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/gimmicks.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src));
});
