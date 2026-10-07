// ============================================================================
// LYRIC ALIGN — test del nucleo puro alignLines() e dei dati reali.
// Verifica il bug risolto: lo start di una riga e l'onset della PAROLA cantata,
// non l'inizio del segmento whisper.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { alignLines } from '../tools/align-core.mjs';

const words = JSON.parse(readFileSync('tools/_words.json', 'utf8'));
const official = JSON.parse(readFileSync('tools/_official.json', 'utf8'));

// --- dati reali -------------------------------------------------------------

test('03-tuoni: la riga "tuoni" parte all onset della parola (16.3..16.9), non 7.25', () => {
  const out = alignLines(official['03-tuoni'], words['03-tuoni'].words, { window: 12 });
  const line = out.find(e => /tuoni/.test(e[1]));
  assert.ok(line, 'riga con "tuoni" non trovata');
  assert.ok(line[0] >= 16.3 && line[0] <= 16.9, `start ${line[0]} fuori [16.3,16.9]`);
  assert.notEqual(line[0], 7.25, 'start ancora ancorato al segmento (bug)');
});

test('11-lafinedelmondo: "È la fine del mondo" parte >= 8.0', () => {
  const out = alignLines(official['11-lafinedelmondo'], words['11-lafinedelmondo'].words, { window: 12 });
  const line = out.find(e => /fine del mondo/.test(e[1]));
  assert.ok(line, 'riga "fine del mondo" non trovata');
  assert.ok(line[0] >= 8.0, `start ${line[0]} < 8.0`);
});

test('gli start sono monotoni crescenti su tutte le tracce', () => {
  for (const id of Object.keys(words)) {
    const out = alignLines(official[id] || [], (words[id] && words[id].words) || [], { window: 12 });
    for (let i = 1; i < out.length; i++) {
      assert.ok(out[i][0] >= out[i - 1][0], `${id}: start non monotono a ${i} (${out[i - 1][0]} -> ${out[i][0]})`);
    }
  }
});

// --- sintetico: la regola (c) respinge le righe non cantate -----------------

test('alignLines respinge "Non mi va" quando l ultimo token non e cantato', () => {
  const out = alignLines(
    ['Non mi va'],
    [[0, 0.3, 'non'], [0.3, 0.5, 'mi'], [0.5, 0.9, 'sento']],
  );
  assert.deepEqual(out, []);
});

test('alignLines accetta una riga con ultimo token cantato', () => {
  const out = alignLines(
    ['Quando ci sono i tuoni'],
    [[0, 0.2, 'quando'], [0.2, 0.4, 'ci'], [0.4, 0.6, 'sono'], [0.6, 0.8, 'i'], [0.8, 1.0, 'tuoni']],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0][0], 0);
  assert.equal(out[0][1], 'Quando ci sono i tuoni');
});

test('alignLines scarta le righe consecutive identiche', () => {
  const out = alignLines(
    ['Ciao mondo', 'Ciao mondo'],
    [[0, 0.3, 'ciao'], [0.3, 0.6, 'mondo'], [1.0, 1.3, 'ciao'], [1.3, 1.6, 'mondo']],
  );
  assert.equal(out.length, 1);
});
