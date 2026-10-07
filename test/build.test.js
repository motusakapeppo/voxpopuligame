import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundleModules } from '../tools/build.mjs';

test('bundleModules rimuove import/export e concatena in ordine', () => {
  const out = bundleModules({
    'a.js': "export const A = 1;\nimport { B } from './b.js';\nconsole.log(B);",
    'b.js': "export const B = 2;",
  }, ['b.js', 'a.js']);
  assert.ok(!/^\s*export\b/m.test(out));
  assert.ok(!/^\s*import\b/m.test(out));
  assert.ok(out.indexOf('const B = 2') < out.indexOf('const A = 1'));
});

test('bundleModules avvolge in una IIFE', () => {
  const out = bundleModules({ 'a.js': 'export const A = 1;' }, ['a.js']);
  assert.ok(out.trim().startsWith('(function(){'));
});
