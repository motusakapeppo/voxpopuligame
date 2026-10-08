// ============================================================================
// OMINI — i piccoli che popolano la scala. Modulo PURO e DETERMINISTICO:
// nessun DOM, nessun Math.random. Lo spawn è guidato dalla fila del giocatore
// e ruota le animazioni in modo deterministico dal seme del girone.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClimb } from '../src/climb.js';
import { GIRONI } from '../src/gironi.js';
import { OMINI_ANIMS, createOmini, stepOmini, ominoAt, resolveOmino } from '../src/omini.js';

// Guida un omino su TUTTE le file (una alla volta, così nessuno scade durante
// la salita) e registra la sequenza di spawn: [row, c, anim].
function spawnLog(g) {
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  const log = [];
  let seen = 0;
  for (let r = 0; r <= cl.nRows - 1; r++) {
    cl.lh.r = r; cl.rh.r = r;
    stepOmini(o, cl, 0.016);
    while (seen < o.spawned) {
      const om = o.list.find(x => x.id === `om${seen}`);
      log.push(om ? [om.row, om.c, om.anim] : null);
      seen++;
    }
  }
  return log;
}

test('OMINI_ANIMS: almeno 4 animazioni, tutte uniche', () => {
  assert.ok(Array.isArray(OMINI_ANIMS), 'OMINI_ANIMS non è un array');
  assert.ok(OMINI_ANIMS.length >= 4, `meno di 4 animazioni: ${OMINI_ANIMS.length}`);
  assert.equal(new Set(OMINI_ANIMS).size, OMINI_ANIMS.length, 'animazioni duplicate');
  for (const a of OMINI_ANIMS) assert.equal(typeof a, 'string');
});

test('createOmini: struttura iniziale attesa', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  assert.deepEqual(o.list, []);
  assert.equal(o.t, 0);
  assert.equal(o.nextRow, 4);
  assert.equal(o.spawnEvery, 5);
  assert.equal(o.spawned, 0);
  assert.ok(Number.isFinite(o.rng), 'rng non finito');
});

test('determinismo: due createOmini con lo stesso g.id -> sequenza di spawn identica', () => {
  for (const g of GIRONI) {
    const a = spawnLog(g);
    const b = spawnLog(g);
    assert.deepEqual(a, b, `${g.id}: sequenza di spawn non deterministica`);
    assert.ok(a.length >= 1, `${g.id}: nessuno spawn`);
  }
});

test('gli spawn cadono sempre nelle file 1..nRows-2', () => {
  for (const g of GIRONI) {
    const cl = createClimb(g);
    const log = spawnLog(g);
    for (const entry of log) {
      assert.ok(entry, `${g.id}: spawn perso`);
      const [row] = entry;
      assert.ok(row >= 1 && row <= cl.nRows - 2, `${g.id}: spawn a fila ${row} fuori range (nRows=${cl.nRows})`);
    }
  }
});

test('stepOmini: spawna quando il giocatore raggiunge nextRow e avanza di spawnEvery', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  cl.lh.r = 3; cl.rh.r = 3;
  stepOmini(o, cl, 0.016);
  assert.equal(o.spawned, 0, 'spawnato troppo presto');
  cl.lh.r = 4; cl.rh.r = 4;
  stepOmini(o, cl, 0.016);
  assert.equal(o.spawned, 1, 'non spawnato alla fila 4');
  assert.equal(o.list[0].row, 4);
  assert.equal(o.nextRow, 9, 'nextRow non avanzato di spawnEvery');
  assert.ok(OMINI_ANIMS.includes(o.list[0].anim), 'anim non valida');
  assert.equal(o.list[0].resolved, false);
  assert.equal(o.list[0].verb, null);
  assert.equal(o.list[0].reactT, 0);
});

test('stepOmini: la lista è limitata (cap) e gli scaduti vengono rimossi', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  for (let r = 0; r <= cl.nRows - 1; r++) {
    cl.lh.r = r; cl.rh.r = r;
    stepOmini(o, cl, 0.016);
    assert.ok(o.list.length <= 12, `lista oltre il cap: ${o.list.length}`);
  }
  // risolto da tempo -> scade
  const om = o.list[0];
  if (om) {
    resolveOmino(o, om, 'tendi');
    for (let i = 0; i < 200; i++) stepOmini(o, cl, 0.016);
    assert.ok(!o.list.includes(om), 'omino risolto non rimosso dopo la reazione');
  }
});

test('resolveOmino: tendi -> helped (-24, +1); spingi -> shoved (+48, -1)', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  cl.lh.r = 4; cl.rh.r = 4;
  stepOmini(o, cl, 0.016);
  const om = o.list[0];
  const help = resolveOmino(o, om, 'tendi');
  assert.deepEqual(help, { dy: -24, loyal: 1, event: 'helped' });
  assert.equal(om.resolved, true);
  assert.equal(om.verb, 'tendi');

  cl.lh.r = 9; cl.rh.r = 9;
  stepOmini(o, cl, 0.016);
  const om2 = o.list.find(x => x.id === 'om1');
  const push = resolveOmino(o, om2, 'spingi');
  assert.deepEqual(push, { dy: 48, loyal: -1, event: 'shoved' });
  assert.equal(om2.resolved, true);
  assert.equal(om2.verb, 'spingi');

  assert.notDeepEqual(help, push, 'i vettori help/push devono essere distinti');
});

test('ominoAt: il più vicino non risolto entro |dr| <= 1, altrimenti null', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  cl.lh.r = 4; cl.rh.r = 4;
  stepOmini(o, cl, 0.016);
  const om = o.list[0];
  assert.equal(ominoAt(o, cl), om, 'omino sulla fila corrente non trovato');
  cl.lh.r = 5; cl.rh.r = 5;
  assert.equal(ominoAt(o, cl), om, 'omino adiacente (dr=1) non trovato');
  cl.lh.r = 6; cl.rh.r = 6;
  assert.equal(ominoAt(o, cl), null, 'omino fuori raggio trovato');
});

test('ominoAt ignora gli omini già risolti', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const o = createOmini(g, cl);
  cl.lh.r = 4; cl.rh.r = 4;
  stepOmini(o, cl, 0.016);
  const om = o.list[0];
  resolveOmino(o, om, 'spingi');
  assert.equal(ominoAt(o, cl), null, 'un omino risolto è stato riattivato');
});

test('nessun Math.random nel modulo (determinismo puro)', () => {
  const src = readFileSync(new URL('../src/omini.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src), 'omini.js usa Math.random');
});
