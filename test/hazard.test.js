// ============================================================================
// HAZARD — classificazione pura dei messaggi dei pericoli (severità della
// presa). Deterministico, NaN-safe, nessun Math.random.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hazardSeverity } from '../src/hazard.js';

const CFG = { hitWind: 0.10, hitQuake: 0.22, hitDebris: 0.18, hitIvy: 0.12, hitMash: 0.45, regen: 0.10 };

test('hazardSeverity: vento/pioggia/scivol -> hitWind', () => {
  assert.equal(hazardSeverity('il vento ti sposta', CFG), 0.10);
  assert.equal(hazardSeverity('la pioggia ti fa scivolare', CFG), 0.10);
  assert.equal(hazardSeverity('SCIVOLI giu', CFG), 0.10);
});

test('hazardSeverity: tuono -> hitQuake', () => {
  assert.equal(hazardSeverity('il tuono ti stordisce', CFG), 0.22);
  assert.equal(hazardSeverity('TUONO', CFG), 0.22);
});

test('hazardSeverity: tempo/detrito/cranio -> hitDebris', () => {
  assert.equal(hazardSeverity('il tempo ti sfugge', CFG), 0.18);
  assert.equal(hazardSeverity('un detrito ti colpisce', CFG), 0.18);
  assert.equal(hazardSeverity('scudo: cranio duro', CFG), 0.18);
});

test('hazardSeverity: edera -> hitIvy', () => {
  assert.equal(hazardSeverity('l edera ti tira', CFG), 0.12);
});

test('hazardSeverity: messaggio non classificato -> 0.08', () => {
  assert.equal(hazardSeverity('qualcosa di strano', CFG), 0.08);
  assert.equal(hazardSeverity('', CFG), 0.08);
  assert.equal(hazardSeverity(null, CFG), 0.08);
  assert.equal(hazardSeverity(undefined, CFG), 0.08);
});

test('hazardSeverity: cfg assente o valori non finiti -> default', () => {
  assert.equal(hazardSeverity('il vento ti sposta'), 0.10);
  assert.equal(hazardSeverity('il tuono ti stordisce', {}), 0.22);
  assert.equal(hazardSeverity('un detrito ti colpisce', { hitDebris: NaN }), 0.18);
  assert.equal(hazardSeverity('l edera ti tira', { hitIvy: Infinity }), 0.12);
  assert.equal(hazardSeverity('il vento ti sposta', { hitWind: 'x' }), 0.10);
});

test('hazardSeverity: override della cfg rispettato', () => {
  assert.equal(hazardSeverity('il vento ti sposta', { hitWind: 0.5 }), 0.5);
  assert.equal(hazardSeverity('il tuono ti stordisce', { hitQuake: 0.9 }), 0.9);
});

test('hazardSeverity: sempre finito e >= 0', () => {
  const msgs = ['vento', 'tuono', 'tempo', 'detrito', 'cranio', 'edera', 'pioggia', 'scivol', 'boh', ''];
  for (const m of msgs) {
    const v = hazardSeverity(m, CFG);
    assert.ok(Number.isFinite(v) && v >= 0, `${m}: ${v}`);
  }
});

test('hazard.js non usa Math.random (determinismo puro)', () => {
  const src = readFileSync(new URL('../src/hazard.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src), 'hazard.js contiene Math.random');
});
