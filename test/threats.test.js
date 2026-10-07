import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THREATS, applyThreat, applyPickup, createThreatState, stepThreats, pickupPositions } from '../src/threats.js';
import { createClimb, stepClimb } from '../src/climb.js';
import { GIRONI } from '../src/gironi.js';

const noInput = { left: false, right: false, up: false, down: false };

test('ogni girone ha una definizione di ostacoli/aiuti', () => {
  for (const g of GIRONI) {
    assert.ok(THREATS[g.audioId], `${g.audioId} senza THREATS`);
    const d = THREATS[g.audioId];
    assert.ok(Array.isArray(d.auto), `${g.audioId} auto non array`);
    assert.ok(Array.isArray(d.pickups), `${g.audioId} pickups non array`);
  }
});

test('almeno 8 gironi hanno un pericolo (non tutti vuoti)', () => {
  const withHazard = GIRONI.filter(g => (THREATS[g.audioId]?.auto || []).length > 0);
  assert.ok(withHazard.length >= 8, `solo ${withHazard.length} gironi con pericoli`);
});

test('un pericolo modifica davvero la presa (non è solo un messaggio)', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  // prima sale di qualche fila, altrimenti a fila 0 non può scendere
  for (let i = 0; i < 60; i++) stepClimb(cl, { left: false, right: false, up: true, down: false }, 0.016);
  const before = { l: { ...cl.lh }, r: { ...cl.rh } };
  const msg = applyThreat('quake', cl, st);
  assert.ok(msg, 'nessun messaggio dal terremoto');
  const moved = cl.lh.r !== before.l.r || cl.rh.r !== before.r.r ||
                cl.lh.c !== before.l.c || cl.rh.c !== before.r.c;
  assert.ok(moved, 'il terremoto non ha spostato le mani');
});

test('lo scudo assorbe il pericolo (debris) una volta', () => {
  const cl = createClimb(GIRONI[3]);
  const st = createThreatState();
  st.shield = 1;
  const m1 = applyThreat('debris', cl, st);
  assert.ok(/scudo/i.test(m1), 'lo scudo non ha assorbito: ' + m1);
  assert.equal(st.shield, 0, 'lo scudo non si è consumato');
});

test('un aiuto spinge verso l alto (gust)', () => {
  const cl = createClimb(GIRONI[1]);
  const st = createThreatState();
  const r0 = Math.max(cl.lh.r, cl.rh.r);
  applyPickup('gust', cl, st);
  assert.ok(Math.max(cl.lh.r, cl.rh.r) >= r0, 'la raffica non ha aiutato');
});

test('il caffe attiva la velocità', () => {
  const cl = createClimb(GIRONI[4]);
  const st = createThreatState();
  applyPickup('coffee', cl, st);
  assert.ok(st.speed > 0, 'la velocità non si è attivata');
});

test('stepThreats fa scattare un pericolo col tempo', () => {
  const cl = createClimb(GIRONI[1]);   // vento ogni 3.2s
  const st = createThreatState();
  let fired = false;
  for (let i = 0; i < 400; i++) {      // ~6.4s
    const msg = stepThreats(GIRONI[1], cl, st, 0.016, 0);
    if (msg) fired = true;
  }
  assert.ok(fired, 'nessun pericolo scattato in 6s');
});

test('la raccolta di un aiuto restituisce la posizione', () => {
  const pos = pickupPositions(GIRONI[1]);
  assert.ok(pos.length >= 1, 'IL VENTO DAL SUD senza aiuto');
  assert.ok(pos[0].kind, 'aiuto senza tipo');
});
