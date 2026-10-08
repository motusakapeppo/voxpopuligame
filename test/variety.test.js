// ============================================================================
// VARIETY — test del motore di contenuti per girone (missioni, oggetti, amici,
// nemici, easter egg). Deterministico, raggiungibile, distinto per livello.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIETY, VARIETY_IDS, createVariety, stepVariety } from '../src/variety.js';
import { GIRONI } from '../src/gironi.js';
import { createClimb } from '../src/climb.js';

const KINDS = ['item', 'friend', 'enemy', 'egg'];
const EFFECTS = ['loyal+1', 'loyal-1', 'boost', 'firm', 'reveal', 'egg'];

test('VARIETY copre esattamente i 13 id (audioId)', () => {
  assert.equal(VARIETY_IDS.length, 13);
  for (const g of GIRONI) {
    assert.ok(VARIETY[g.audioId], `manca varietà per ${g.audioId}`);
    assert.ok(VARIETY_IDS.includes(g.audioId));
  }
});

test('ogni girone ha: 1 missione (target 2..4), >=3 oggetti, >=1 amico, >=1 nemico, >=1 easter egg', () => {
  for (const id of VARIETY_IDS) {
    const v = VARIETY[id];
    assert.ok(v.mission && typeof v.mission.text === 'string' && v.mission.text.length > 0, `${id}: missione assente`);
    assert.ok(Number.isFinite(v.mission.target) && v.mission.target >= 2 && v.mission.target <= 4, `${id}: target ${v.mission.target}`);
    assert.ok(Array.isArray(v.items) && v.items.length >= 3, `${id}: <3 oggetti`);
    for (const kind of ['friend', 'enemy', 'egg']) {
      assert.ok(v.items.some(it => it.kind === kind), `${id}: manca un ${kind}`);
    }
  }
});

test('ogni oggetto è ben formato (kind/name/at/effect)', () => {
  for (const id of VARIETY_IDS) {
    for (const it of VARIETY[id].items) {
      assert.ok(KINDS.includes(it.kind), `${id}: kind "${it.kind}"`);
      assert.ok(typeof it.name === 'string' && it.name.length > 0, `${id}: nome oggetto vuoto`);
      assert.ok(Number.isFinite(it.at) && it.at > 0 && it.at < 1, `${id}: at ${it.at}`);
      assert.ok(EFFECTS.includes(it.effect), `${id}: effect "${it.effect}"`);
    }
  }
});

test('i nomi degli oggetti sono distinti su TUTTI i gironi (varietà reale)', () => {
  const seen = new Map();
  for (const id of VARIETY_IDS) {
    for (const it of VARIETY[id].items) {
      assert.ok(!seen.has(it.name), `nome duplicato "${it.name}" (${id} vs ${seen.get(it.name)})`);
      seen.set(it.name, id);
    }
  }
});

test('createVariety: deterministico e ogni oggetto su una riga raggiungibile (colonna centrale)', () => {
  for (const g of GIRONI) {
    const cl = createClimb(g);
    const a = createVariety(g, cl);
    const b = createVariety(g, cl);
    assert.deepEqual(a, b, `${g.audioId}: non deterministico`);
    assert.equal(a.items.length, VARIETY[g.audioId].items.length);
    assert.equal(a.mission.current, 0);
    assert.equal(a.mission.done, false);
    for (const it of a.items) {
      assert.ok(Number.isFinite(it.row) && it.row >= 1 && it.row <= cl.nRows - 2, `${g.audioId}: row ${it.row} fuori range`);
      assert.ok(Number.isFinite(it.c), `${g.audioId}: c non finito`);
      assert.ok(cl.has(it.c, it.row), `${g.audioId}: oggetto non su un appiglio (c=${it.c}, r=${it.row})`);
    }
  }
});

test('stepVariety: raccoglie per fila e fa avanzare la missione', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const v = createVariety(g, cl);
  const target = v.items[0];
  cl.lh.r = target.row; cl.rh.r = target.row;   // simula essere su quella fila
  const r = stepVariety(v, cl);
  assert.ok(r.collected.length >= 1, 'nessun oggetto raccolto sulla fila');
  assert.ok(v.items.find(it => it.id === target.id).collected, 'oggetto non marcato raccolto');
  assert.ok(v.mission.current >= 1, 'missione non avanzata');
});

test('stepVariety: completa la missione esattamente quando raggiunge il target', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const v = createVariety(g, cl);
  const collectedIds = new Set();
  let doneAt = -1;
  for (let step = 0; step < 500 && !v.mission.done; step++) {
    // sali una fila per volta: prima o poi passi su tutte le righe
    cl.lh.r = Math.min(cl.nRows - 1, step % cl.nRows);
    cl.rh.r = cl.lh.r;
    const r = stepVariety(v, cl);
    for (const c of r.collected) collectedIds.add(c.name);
    if (r.missionDone) doneAt = step;
  }
  assert.ok(v.mission.done, 'missione mai completata');
  assert.equal(v.mission.current, v.mission.target, 'current != target alla fine');
  assert.ok(doneAt >= 0, 'missionDone mai segnalato');
});

test('stepVariety: nessuna raccolta doppia e ritorna {collected, missionDone}', () => {
  const g = GIRONI[1];
  const cl = createClimb(g);
  const v = createVariety(g, cl);
  const first = v.items.find(it => it.kind === 'item');
  cl.lh.r = first.row; cl.rh.r = first.row;
  const r1 = stepVariety(v, cl);
  const r2 = stepVariety(v, cl);
  assert.ok(r1.collected.some(c => c.name === first.name));
  assert.ok(!r2.collected.some(c => c.name === first.name), 'raccolto due volte');
  assert.ok(Array.isArray(r2.collected));
  assert.equal(typeof r2.missionDone, 'boolean');
});
