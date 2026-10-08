// ============================================================================
// OBJECTIVE — test del motore degli obiettivi per-traccia. Puro e deterministico.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createObjective, stepObjective, objectiveHud, OBJECTIVE_KINDS } from '../src/objective.js';

test('createObjective: default = climb', () => {
  const o = createObjective({});
  assert.equal(o.kind, 'climb');
  assert.equal(o.done, false);
  assert.equal(o.failed, false);
});

test('createObjective: legge kind/limit/target dal girone', () => {
  const o = createObjective({ objective: { kind: 'beatClock', limit: 30 } });
  assert.equal(o.kind, 'beatClock');
  assert.equal(o.limit, 30);
});

test('createObjective: kind sconosciuto -> climb (sicuro)', () => {
  const o = createObjective({ objective: { kind: 'blah' } });
  assert.equal(o.kind, 'climb');
});

test('climb: done quando reachedTop', () => {
  const o = createObjective({});
  stepObjective(o, { reachedTop: false }, 0.1);
  assert.equal(o.done, false);
  stepObjective(o, { reachedTop: true }, 0.1);
  assert.equal(o.done, true);
});

test('beatClock: vince in tempo, perde a tempo scaduto', () => {
  const win = createObjective({ objective: { kind: 'beatClock', limit: 10 } });
  stepObjective(win, { reachedTop: true }, 0.1);
  assert.equal(win.done, true);
  const lose = createObjective({ objective: { kind: 'beatClock', limit: 1 } });
  for (let i = 0; i < 100; i++) stepObjective(lose, { reachedTop: false }, 0.02);
  assert.equal(lose.failed, true);
  assert.match(lose.reason, /tempo/);
});

test('survive: vince dopo limit secondi, perde se presa a zero', () => {
  const win = createObjective({ objective: { kind: 'survive', limit: 2 } });
  for (let i = 0; i < 130; i++) stepObjective(win, { gripRatio: 1 }, 0.02);
  assert.equal(win.done, true);
  const lose = createObjective({ objective: { kind: 'survive', limit: 5 } });
  stepObjective(lose, { gripRatio: 0 }, 0.02);
  assert.equal(lose.failed, true);
});

test('collect: vince al raggiungimento del target', () => {
  const o = createObjective({ objective: { kind: 'collect', target: 3 } });
  stepObjective(o, { collected: 2 }, 0.1);
  assert.equal(o.done, false);
  stepObjective(o, { collected: 3 }, 0.1);
  assert.equal(o.done, true);
});

test('escort: vince aiutando target figure', () => {
  const o = createObjective({ objective: { kind: 'escort', target: 2 } });
  stepObjective(o, { helped: 1 }, 0.1);
  assert.equal(o.done, false);
  stepObjective(o, { helped: 2 }, 0.1);
  assert.equal(o.done, true);
});

test('holdGrip: vince in cima con presa>, perde a presa zero', () => {
  const win = createObjective({ objective: { kind: 'holdGrip' } });
  stepObjective(win, { reachedTop: true, gripRatio: 0.8 }, 0.1);
  assert.equal(win.done, true);
  const lose = createObjective({ objective: { kind: 'holdGrip' } });
  stepObjective(lose, { reachedTop: false, gripRatio: 0 }, 0.1);
  assert.equal(lose.failed, true);
});

test('objectiveHud: ritorna text + progress in [0,1] per ogni tipo', () => {
  for (const kind of OBJECTIVE_KINDS) {
    const o = createObjective({ objective: { kind, limit: 10, target: 3 } });
    o.progress = 0.5;
    const h = objectiveHud(o);
    assert.equal(typeof h.text, 'string');
    assert.ok(h.progress >= 0 && h.progress <= 1, kind + ' progress fuori range');
  }
});

test('determinismo: stessa sequenza -> stesso esito (nessun RNG)', () => {
  const run = () => {
    const o = createObjective({ objective: { kind: 'beatClock', limit: 3 } });
    for (let i = 0; i < 200; i++) stepObjective(o, { reachedTop: i > 150 }, 0.02);
    return o.done + '|' + o.failed + '|' + o.reason;
  };
  assert.equal(run(), run());
});

test('objective.js non usa Math.random', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/objective.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(src), 'Math.random trovato in objective.js');
});
