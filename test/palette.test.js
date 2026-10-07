import { test } from 'node:test';
import assert from 'node:assert/strict';
import { C, PALETTE, depthRed, RED_RAMP } from '../src/palette.js';

test('la palette è solo nero + rosso (come la copertina)', () => {
  assert.equal(C.black, '#000000');
  assert.equal(C.redHot, '#e01010');
  for (const v of RED_RAMP) {
    const r = parseInt(v.slice(1, 3), 16);
    const g = parseInt(v.slice(3, 5), 16);
    const b = parseInt(v.slice(5, 7), 16);
    assert.ok(r > g && r > b, `${v} non è rosso dominante`);
  }
});

test('PALETTE non contiene colori fuori tema (oltre al bianco)', () => {
  assert.equal(PALETTE[0], null);
  const off = PALETTE.filter(Boolean)
    .filter(v => v !== C.white)
    .filter(v => {
      const r = parseInt(v.slice(1, 3), 16);
      const g = parseInt(v.slice(3, 5), 16);
      const b = parseInt(v.slice(5, 7), 16);
      return !(g <= r && b <= r);
    });
  assert.deepEqual(off, [], 'nessun colore non-rosso oltre al bianco');
});

test('depthRed restituisce rossi via via più accesi', () => {
  assert.equal(depthRed(0), RED_RAMP[0]);
  assert.equal(depthRed(1), RED_RAMP[RED_RAMP.length - 1]);
});
