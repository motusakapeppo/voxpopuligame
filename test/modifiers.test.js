import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModState, applyModifier } from '../src/modifiers.js';

function ctx() {
  return { player:{ x:0,y:0,w:8,h:12,vx:0,vy:0,onGround:true },
           world:{ bodies:[], gravity:0.5 }, time:0, events:[] };
}

test('wind sposta il giocatore orizzontalmente', () => {
  const mod = { kind:'wind', period:4, strength:2.5 };
  const st = createModState(mod);
  const c = ctx();
  const x0 = c.player.x;
  applyModifier(mod, c, 0.1, st);
  applyModifier(mod, c, 0.1, st);
  applyModifier(mod, c, 0.1, st);
  assert.notEqual(c.player.x, x0);
});

test('quake emette evento quake all\'intervallo previsto', () => {
  const mod = { kind:'quake', every:5, shakeT:0.8, shakeAmp:6 };
  const st = createModState(mod);
  const c = ctx();
  for (let t=0; t<5.1; t+=0.1) applyModifier(mod, c, 0.1, st);
  assert.ok(c.events.includes('quake'));
});

test('fallingBlades emette un evento blade a intervalli', () => {
  const mod = { kind:'fallingBlades', every:3, speed:3 };
  const st = createModState(mod);
  const c = ctx();
  for (let t=0; t<3.1; t+=0.1) applyModifier(mod, c, 0.1, st);
  assert.ok(c.events.includes('blade'));
});

test('timer fa crescere il tempo trascorso', () => {
  const mod = { kind:'timer', total:35, collapseSpeed:0.6 };
  const st = createModState(mod);
  const c = ctx();
  applyModifier(mod, c, 5, st);
  assert.ok(st.elapsed >= 5);
});
