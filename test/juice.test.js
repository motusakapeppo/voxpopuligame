import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createJuice, impact, punch, addFlow, breakFlow, setBpm, stepJuice,
  shakeOffsetJ, punchZoom, flowRatio, bpmFor, FLOW_MAX,
} from '../src/juice.js';

test('createJuice parte neutro', () => {
  const j = createJuice();
  for (const k of ['hitstop', 'punch', 'shake', 'flash', 'flow', 'combo']) {
    assert.ok(Number.isFinite(j[k]), k + ' non finito');
  }
  assert.equal(j.hitstop, 0);
});

test('impact attiva hitstop, shake e flash e resta limitato', () => {
  const j = createJuice();
  impact(j, 2, 1, 0);
  assert.ok(j.hitstop > 0 && j.hitstop <= 0.05, 'hitstop fuori range');
  assert.ok(j.shake > 0 && j.shake <= 6, 'shake fuori range');
  assert.ok(j.flash > 0 && j.flash <= 0.7, 'flash fuori range');
});

test('impact usa i valori di ricerca: ~20ms hitstop, 2-4px shake', () => {
  const j = createJuice();
  impact(j, 1, 1, 0);
  assert.equal(j.hitstop, 0.02, 'hitstop base deve essere 20ms (guida §6)');
  assert.equal(j.shake, 2.2, 'shake base ~2.2px a 320×180 (guida §6)');
});

test('impact con potenza enorme/NaN resta sicuro', () => {
  const j = createJuice();
  impact(j, 1e9, NaN, NaN);
  assert.ok(Number.isFinite(j.shake) && j.shake <= 6);
  impact(j, NaN);
  assert.ok(Number.isFinite(j.hitstop));
});

test('stepJuice fa decadere hitstop/shake/flash e restituisce il battito', () => {
  const j = createJuice();
  impact(j, 2);
  for (let i = 0; i < 60; i++) stepJuice(j, 0.016);
  assert.equal(j.hitstop, 0);
  assert.ok(j.shake < 0.5, 'lo shake non è decaduto');
  assert.ok(j.flash < 0.1, 'il flash non è decaduto');
  assert.ok(j.beat >= 0 && j.beat <= 1, 'battito fuori 0..1');
});

test('il battito pulsa con il BPM', () => {
  const j = createJuice();
  setBpm(j, 120);   // 2 battiti/s → 0.5s per battito
  let peaks = 0, prev = 0;
  for (let i = 0; i < 300; i++) {          // 4.8s
    const b = stepJuice(j, 0.016);
    if (b > 0.9 && prev <= 0.9) peaks++;
    prev = b;
  }
  assert.ok(peaks >= 8 && peaks <= 11, 'battiti attesi ~9-10, trovati ' + peaks);
});

test('flow sale e si limita a FLOW_MAX', () => {
  const j = createJuice();
  for (let i = 0; i < 100; i++) addFlow(j, 0.5);
  assert.equal(flowRatio(j), FLOW_MAX);
  breakFlow(j);
  assert.equal(flowRatio(j), 0);
});

test('punchZoom è 1 a riposo e > 1 durante il punch', () => {
  const j = createJuice();
  assert.equal(punchZoom(j), 1);
  punch(j, 0.1);
  assert.ok(punchZoom(j) > 1);
});

test('shakeOffsetJ è nullo a riposo e finito sempre', () => {
  const j = createJuice();
  const z = shakeOffsetJ(j, 1.23);
  assert.equal(z.x, 0); assert.equal(z.y, 0);
  impact(j, 3, 1, -1);
  for (const t of [0, 0.3, 1.7, NaN]) {
    const o = shakeOffsetJ(j, t);
    assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y));
  }
});

test('bpmFor conosce le 13 tracce e ha un default', () => {
  for (const id of ['01-intro', '07-tictac', '13-outro']) assert.ok(bpmFor(id) > 0);
  assert.ok(bpmFor('xx') > 0);
});
