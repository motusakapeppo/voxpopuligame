import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, GIRONE_ENCOUNTERS, createEncounters, activeEncounter, resolveEncounter, isAutoKind } from '../src/encounters.js';
import { GIRONI } from '../src/gironi.js';

test('ogni girone ha incontri definiti e ogni incontro ha i due verbi', () => {
  for (const g of GIRONI) {
    const kinds = GIRONE_ENCOUNTERS[g.id];
    assert.ok(Array.isArray(kinds) && kinds.length >= 1, g.id + ' senza incontri');
    for (const k of kinds) {
      assert.ok(KINDS[k], g.id + ': tipo sconosciuto ' + k);
      assert.ok(KINDS[k].tendi && KINDS[k].spingi, k + ' senza entrambi i verbi');
    }
  }
});

test('gli incontri sono piazzati su una mensola reale', () => {
  for (const g of GIRONI) {
    const bodies = g.bodies.map(b => ({ ...b }));
    const encs = createEncounters(g, bodies);
    assert.ok(encs.length >= 1, g.id);
    for (const e of encs) {
      const onLedge = bodies.some(b => Math.abs((e.y + e.h) - b.y) <= 1 && e.x >= b.x - 2 && e.x <= b.x + b.w);
      assert.ok(onLedge, `${g.id}/${e.kind}: incontro non appoggiato a una mensola`);
    }
  }
});

test('resolveEncounter applica l\'effetto e marca risolto', () => {
  const e = { id: 't', kind: 'falling', resolved: false, verb: null };
  const eff = resolveEncounter(e, 'tendi');
  assert.equal(e.resolved, true);
  assert.equal(e.verb, 'tendi');
  assert.equal(eff.loyal, KINDS.falling.tendi.loyal); // afferrare = +2 lealtà
});

test('activeEncounter trova solo l\'incontro vicino e non risolto', () => {
  const encs = [{ id:'a', kind:'hand', x:100, y:100, w:9, h:11, resolved:false },
                { id:'b', kind:'hand', x:300, y:300, w:9, h:11, resolved:false }];
  const near = activeEncounter(encs, { x:100, y:100, w:8, h:14 });
  assert.equal(near.id, 'a');
  const far = activeEncounter(encs, { x:200, y:200, w:8, h:14 });
  assert.equal(far, null);
});

test('tutti i tipi sono usati almeno una volta nei 13 gironi', () => {
  const used = new Set(Object.values(GIRONE_ENCOUNTERS).flat());
  for (const k of Object.keys(KINDS)) assert.ok(used.has(k), 'tipo mai usato: ' + k);
});

test('i nuovi tipi helper/grabber esistono ed hanno entrambi i verbi', () => {
  for (const k of ['helper', 'grabber']) {
    assert.ok(KINDS[k], 'manca ' + k);
    assert.ok(KINDS[k].tendi && KINDS[k].spingi, k + ' senza entrambi i verbi');
  }
  assert.equal(isAutoKind('helper'), true);
  assert.equal(isAutoKind('grabber'), true);
  assert.equal(isAutoKind('hand'), false);
  assert.equal(isAutoKind('pusher'), false);
});

test('ogni girone ha almeno un incontro automatico o un pericolo specifico', () => {
  for (const g of GIRONI) {
    const kinds = GIRONE_ENCOUNTERS[g.id] || [];
    assert.ok(kinds.length >= 1, g.id + ' senza incontri');
    for (const k of kinds) assert.ok(KINDS[k], g.id + ': tipo sconosciuto ' + k);
  }
});

// ---------------------------------------------------------------------------
// V3b: gli 11 incontri devono avere vettori MECCANICI (dy/loyal/fall) DISTINTI.
// ---------------------------------------------------------------------------
import { KINDS as _K } from '../src/encounters.js';

const mech = e => JSON.stringify([e.dy, e.loyal, e.fall]);

test('V3b: i tipi d incontro hanno vettori meccanici distinti', () => {
  const seen = new Map();
  for (const k of Object.keys(_K)) {
    const s = mech(_K[k].tendi) + '|' + mech(_K[k].spingi);
    assert.ok(!seen.has(s), 'duplicato meccanico: ' + k + ' == ' + seen.get(s));
    seen.set(s, k);
  }
});

test('V3b: sleeper e siren differiscono meccanicamente', () => {
  assert.notEqual(mech(_K.sleeper.tendi) + mech(_K.sleeper.spingi),
                  mech(_K.siren.tendi) + mech(_K.siren.spingi),
                  'sleeper/siren identici meccanicamente');
});
