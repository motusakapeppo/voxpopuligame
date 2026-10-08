import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIRONI, validateGironi, modifierSignature } from '../src/gironi.js';

test('ci sono esattamente 13 gironi con id/audioId unici e ordinati', () => {
  assert.equal(GIRONI.length, 13);
  const ids = GIRONI.map(g => g.id);
  assert.deepEqual(ids, ['01','02','03','04','05','06','07','08','09','10','11','12','13']);
  assert.equal(new Set(GIRONI.map(g => g.audioId)).size, 13);
});

test('ogni girone ha bodies, modifiers, npcScenes e inscription', () => {
  for (const g of GIRONI) {
    assert.ok(Array.isArray(g.bodies) && g.bodies.length > 0, g.id);
    assert.ok(Array.isArray(g.modifiers) && g.modifiers.length > 0, g.id);
    assert.ok(Array.isArray(g.npcScenes), g.id);
    assert.equal(typeof g.inscription.text, 'string');
  }
});

test('solo il girone 09 (EDERA) scende', () => {
  const down = GIRONI.filter(g => g.direction === 'down').map(g => g.id);
  assert.deepEqual(down, ['09']);
});

test('il girone 09 accende il verlet', () => {
  const g9 = GIRONI.find(g => g.id === '09');
  assert.ok(g9.modifiers.some(m => m.kind === 'descent' && m.verlet === true));
});

test('validateGironi passa e rifiuta gironi malformati', () => {
  assert.doesNotThrow(() => validateGironi(GIRONI));
  assert.throws(() => validateGironi([{ id:'01' }]), /malformed/);
});

test('i 13 gironi hanno firme modificatore pairwise distinte', () => {
  const sigs = GIRONI.map(modifierSignature);
  for (const s of sigs) assert.equal(typeof s, 'string');
  assert.equal(new Set(sigs).size, 13, 'firme duplicate: ' + JSON.stringify(sigs));
});

test('ogni girone dichiara un LAYOUT di scalata valido', () => {
  const VALID = ['pyramid', 'wide', 'narrow', 'funnel', 'cavern', 'zigzag', 'stair', 'double'];
  for (const g of GIRONI) {
    assert.ok(g.climb && typeof g.climb.layout === 'string', g.id + ': layout mancante');
    assert.ok(VALID.includes(g.climb.layout), g.id + ': layout sconosciuto ' + g.climb.layout);
  }
  const layouts = GIRONI.map(g => g.climb.layout);
  assert.ok(new Set(layouts).size >= 3, 'meno di 3 layout distinti: ' + JSON.stringify(layouts));
});
