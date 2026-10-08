import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, advance } from '../src/state.js';

test('advance(playing, defeat): decrementa gironeIndex', () => {
  const s = { ...createState(), phase: 'playing', gironeIndex: 3 };
  const n = advance(s, 'defeat');
  assert.equal(n.gironeIndex, 2);
  assert.equal(n.phase, 'playing');
});

test('advance(playing, defeat): gironeIndex non scende sotto 0', () => {
  const s = { ...createState(), phase: 'playing', gironeIndex: 0 };
  const n = advance(s, 'defeat');
  assert.equal(n.gironeIndex, 0);
  assert.equal(n.phase, 'playing');
});

test('advance(playing, defeat): preserva unlocked (Set copiato)', () => {
  const s = { ...createState(), phase: 'playing', gironeIndex: 2 };
  s.unlocked.add('01-intro');
  s.unlocked.add('02-vento');
  const n = advance(s, 'defeat');
  assert.ok(n.unlocked instanceof Set);
  assert.equal(n.unlocked.size, 2);
  assert.ok(n.unlocked.has('01-intro') && n.unlocked.has('02-vento'));
  assert.notEqual(n.unlocked, s.unlocked, 'unlocked deve essere una copia');
});

test('advance(playing, defeat): non muta lo stato originale', () => {
  const s = { ...createState(), phase: 'playing', gironeIndex: 3 };
  advance(s, 'defeat');
  assert.equal(s.gironeIndex, 3);
  assert.equal(s.phase, 'playing');
});

test('defeat fuori da playing è no-op (title)', () => {
  const s = createState();
  const n = advance(s, 'defeat');
  assert.equal(n.phase, 'title');
  assert.equal(n.gironeIndex, 0);
});

test('defeat fuori da playing è no-op (unlocked)', () => {
  const s = { ...createState(), phase: 'unlocked', gironeIndex: 4 };
  const n = advance(s, 'defeat');
  assert.equal(n.phase, 'unlocked');
  assert.equal(n.gironeIndex, 4);
});
