// ============================================================================
// CLIP DURATIONS — single source of truth per le durate delle 13 clip.
// tools/clip-durations.mjs esporta CLIPS ([[id, secondi], ...]) e clipDur(id).
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIPS, clipDur } from '../tools/clip-durations.mjs';

const EXPECTED = {
  '01-intro': 20,
  '02-vento': 20,
  '03-tuoni': 22,
  '04-baghdad': 20,
  '05-hosonno': 20,
  '06-primoposto': 20,
  '07-tictac': 20,
  '08-tuttofinto': 20,
  '09-edera': 22,
  '10-scendi': 20,
  '11-lafinedelmondo': 22,
  '12-maranatha': 22,
  '13-outro': 20,
};

test('CLIPS contiene esattamente le 13 clip con le durate attese', () => {
  assert.equal(CLIPS.length, 13, `CLIPS ha ${CLIPS.length} elementi, attesi 13`);
  const map = new Map(CLIPS);
  for (const [id, sec] of Object.entries(EXPECTED)) {
    assert.ok(map.has(id), `clip ${id} mancante in CLIPS`);
    assert.equal(map.get(id), sec, `durata ${id} = ${map.get(id)}, attesa ${sec}`);
  }
  assert.equal(map.size, 13, 'CLIPS contiene id extra');
});

test('clipDur(id) ritorna la durata per ogni id noto', () => {
  for (const [id, sec] of Object.entries(EXPECTED)) {
    assert.equal(clipDur(id), sec, `clipDur(${id}) = ${clipDur(id)}, attesa ${sec}`);
  }
});

test('clipDur di un id sconosciuto e sicura (fallback deterministico, non NaN)', () => {
  const d = clipDur('clip-inesistente');
  assert.ok(Number.isFinite(d), `clipDur sconosciuto = ${d}, non finito`);
  assert.ok(d > 0, `clipDur sconosciuto = ${d}, deve essere > 0`);
});