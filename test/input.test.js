import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInput } from '../src/input.js';

test('axis riflette sinistra/destra', () => {
  const i = createInput();
  assert.equal(i.axis(), 0);
  i.setKey('ArrowRight', true);
  assert.equal(i.axis(), 1);
  i.setKey('ArrowRight', false);
  i.setKey('ArrowLeft', true);
  assert.equal(i.axis(), -1);
});

test('consumeJump è edge-trigger (una volta per pressione)', () => {
  const i = createInput();
  i.setKey('Space', true);
  assert.equal(i.consumeJump(), true);
  assert.equal(i.consumeJump(), false);
  i.setKey('Space', false);
  i.setKey('Space', true);
  assert.equal(i.consumeJump(), true);
});

test('isUp e isDown', () => {
  const i = createInput();
  i.setKey('ArrowUp', true);
  i.setKey('ArrowDown', true);
  assert.equal(i.isUp(), true);
  assert.equal(i.isDown(), true);
});
