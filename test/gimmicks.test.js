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

test('rhythmic: la finestra si apre solo VICINO al battito (stretta)', () => {
  const gm = createGimmick({ gimmick: 'rhythmic' });
  stepGimmick(gm, 0, false);          // phase 0 -> aperta
  assert.equal(gm.ready, true);
  stepGimmick(gm, 0.25, false);       // phase 0.5 -> chiusa
  assert.equal(gm.ready, false);
  // su un giro completo la finestra NON copre la maggior parte del tempo
  let open = 0;
  const g2 = createGimmick({ gimmick: 'rhythmic' });
  for (let i = 0; i < 3000; i++) { stepGimmick(g2, 0.001, false); if (g2.ready) open++; }
  assert.ok(open / 3000 < 0.4, 'finestra troppo larga: ' + (open / 3000));
});

test('hold: accumula TEMPO di pressione (tieni premuto), non pressioni', () => {
  const gm = createGimmick({ gimmick: { kind: 'hold', needed: 0.5 } });
  // 10 pressioni singole (nessun tempo tenuto) NON bastano
  for (let i = 0; i < 10; i++) { stepGimmick(gm, 1 / 60, false); }
  assert.equal(gimmickAccepts(gm), false, 'acceso con sole pressioni');
  // tenendo premuto ~0.55s si accende
  for (let i = 0; i < 36; i++) stepGimmick(gm, 1 / 60, true);
  assert.equal(gimmickAccepts(gm), true, 'non acceso dopo 0.6s di pressione');
  // rilascio -> reset
  stepGimmick(gm, 1 / 60, false);
  assert.equal(gimmickAccepts(gm), false, 'non resettato al rilascio');
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
