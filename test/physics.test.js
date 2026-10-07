import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBody, bodyPhase, applyWeight, decayBody, rectsOverlap, stepPlayer } from '../src/physics.js';

test('bodyPhase segue le soglie di stress', () => {
  const b = createBody({ x:0, y:0, w:16, h:8, stable:3 });
  assert.equal(bodyPhase(b), 'stable');
  b.stress = 3; assert.equal(bodyPhase(b), 'strain');
  b.stress = 5; assert.equal(bodyPhase(b), 'yield');
});

test('applyWeight e decayBody fanno cedere il corpo', () => {
  const b = createBody({ x:0, y:0, w:16, h:8, stable:2 });
  applyWeight(b, 1); applyWeight(b, 1);
  assert.equal(decayBody(b, 1), true); // cede
  assert.equal(b.y, 2);                 // scivola di 2px
});

test('rectsOverlap è corretto', () => {
  assert.equal(rectsOverlap({x:0,y:0,w:10,h:10}, {x:5,y:5,w:10,h:10}), true);
  assert.equal(rectsOverlap({x:0,y:0,w:10,h:10}, {x:20,y:0,w:10,h:10}), false);
});

test('stepPlayer applica gravità e atterra su un corpo', () => {
  const p = { x:0, y:-20, w:8, h:12, vx:0, vy:0, onGround:false };
  const ground = createBody({ x:-8, y:0, w:32, h:8, stable:99 });
  const world = { bodies:[ground], gravity:0.5, solidAt:null };
  const input = { axis:()=>0, isUp:()=>false, consumeJump:()=>false, isDown:()=>false };
  for (let i=0;i<20;i++) stepPlayer(p, world, input, 1);
  assert.equal(p.onGround, true);
  assert.equal(p.y, -12); // top del player = top del corpo (0) - altezza (12)
});

test('stepPlayer: il salto dà velocità verso l\'alto', () => {
  const p = { x:0, y:0, w:8, h:12, vx:0, vy:0, onGround:true };
  const world = { bodies:[], gravity:0.5, solidAt:null };
  let jumped = false;
  const input = { axis:()=>0, isUp:()=>false, consumeJump:()=>{ const v=!jumped; jumped=true; return v; }, isDown:()=>false };
  stepPlayer(p, world, input, 1);
  assert.ok(p.vy < 0);
});
