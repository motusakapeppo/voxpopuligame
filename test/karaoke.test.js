// ============================================================================
// KARAOKE — test della tabella generata src/karaoke.js.
// Ogni voce e [start, frase]: start finito, frase stringa, start monotoni.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KARAOKE } from '../src/karaoke.js';

const IDS = [
  '01-intro', '02-vento', '03-tuoni', '04-baghdad', '05-hosonno',
  '06-primoposto', '07-tictac', '08-tuttofinto', '09-edera', '10-scendi',
  '11-lafinedelmondo', '12-maranatha', '13-outro',
];

test('KARAOKE copre esattamente i 13 id', () => {
  assert.equal(Object.keys(KARAOKE).length, 13);
  for (const id of IDS) assert.ok(Array.isArray(KARAOKE[id]), `${id} mancante`);
});

test('ogni voce e [numero finito, stringa]', () => {
  for (const id of IDS) {
    for (const e of KARAOKE[id]) {
      assert.ok(Array.isArray(e) && e.length === 2, `${id}: voce malformata`);
      assert.ok(Number.isFinite(e[0]), `${id}: start non finito (${e[0]})`);
      assert.equal(typeof e[1], 'string', `${id}: frase non stringa`);
      assert.ok(e[1].length > 0, `${id}: frase vuota`);
    }
  }
});

test('gli start sono monotoni crescenti in ogni traccia', () => {
  for (const id of IDS) {
    const arr = KARAOKE[id];
    for (let i = 1; i < arr.length; i++) {
      assert.ok(arr[i][0] >= arr[i - 1][0], `${id}: start non monotono a ${i}`);
    }
  }
});
