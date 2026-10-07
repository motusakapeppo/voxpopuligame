import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModState, applyModifier } from '../src/modifiers.js';

function ctx() {
  return { player:{ x:0,y:0,w:8,h:12,vx:0,vy:0,onGround:true },
           world:{ bodies:[], gravity:0.5 }, time:0, events:[] };
}

function run(mod, seconds, dt = 0.1) {
  const st = createModState(mod);
  const c = ctx();
  for (let t = 0; t < seconds; t += dt) applyModifier(mod, c, dt, st);
  return { st, c };
}

function runTrack(mod, seconds, dt = 0.1) {
  const st = createModState(mod);
  const c = ctx();
  let maxShake = 0, maxQuakeT = 0;
  for (let t = 0; t < seconds; t += dt) {
    applyModifier(mod, c, dt, st);
    maxShake = Math.max(maxShake, c.effects.shake);
    maxQuakeT = Math.max(maxQuakeT, c.effects.quakeT);
  }
  return { st, c, maxShake, maxQuakeT };
}

function count(c, name) { return c.events.filter(e => e === name).length; }

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

// --- parametri precedentemente morti: ognuno deve produrre un effetto osservabile ---

test('wind.dust emette eventi dust a cadenza legata alla forza', () => {
  const withDust = run({ kind:'wind', period:4, strength:2.5, dust:true }, 8);
  const noDust   = run({ kind:'wind', period:4, strength:2.5 }, 8);
  assert.ok(count(withDust.c, 'dust') > 0, 'dust attivo deve emettere');
  assert.equal(count(noDust.c, 'dust'), 0, 'senza dust nessun evento');
  assert.ok(Number.isFinite(withDust.c.effects.dust));
  const strong = run({ kind:'wind', period:4, strength:5, dust:true }, 8);
  assert.ok(count(strong.c, 'dust') > count(withDust.c, 'dust'), 'forza maggiore -> più dust');
});

test('quake.shakeAmp/shakeT scalano effects.shake e effects.quakeT', () => {
  const big   = runTrack({ kind:'quake', every:5, shakeT:0.8, shakeAmp:6 }, 5.05);
  const small = runTrack({ kind:'quake', every:5, shakeT:0.2, shakeAmp:2 }, 5.05);
  assert.ok(big.maxShake > small.maxShake, 'ampiezza maggiore -> shake maggiore');
  assert.ok(big.maxQuakeT > small.maxQuakeT, 'durata maggiore -> quakeT maggiore');
  assert.ok(Number.isFinite(big.c.effects.shake) && Number.isFinite(big.c.effects.quakeT));
});

test('fallingBlades.speed controlla la cadenza degli eventi blade', () => {
  const fast = run({ kind:'fallingBlades', every:3, speed:3 }, 6.1);
  const slow = run({ kind:'fallingBlades', every:3, speed:1 }, 6.1);
  assert.ok(count(fast.c, 'blade') > count(slow.c, 'blade'), 'speed maggiore -> più blade');
  assert.ok(Number.isFinite(fast.c.effects.bladeRate));
});

test('sleep.wakeTouchEvery emette wake all\'intervallo', () => {
  const a = run({ kind:'sleep', dimTo:0.35, wakeTouchEvery:1.2 }, 3.7);
  const b = run({ kind:'sleep', dimTo:0.35, wakeTouchEvery:0.5 }, 3.7);
  assert.ok(count(a.c, 'wake') >= 3, 'intervallo 1.2 -> almeno 3 wake');
  assert.ok(count(b.c, 'wake') > count(a.c, 'wake'), 'intervallo minore -> più wake');
  assert.ok(Number.isFinite(a.c.effects.wake));
});

test('timer.collapseSpeed rampa effects.pressure e scala col valore', () => {
  const fast = run({ kind:'timer', total:35, collapseSpeed:0.6 }, 1);
  const slow = run({ kind:'timer', total:35, collapseSpeed:0.1 }, 1);
  assert.ok(fast.c.effects.pressure > slow.c.effects.pressure, 'collapseSpeed maggiore -> pressure maggiore');
  assert.ok(fast.c.effects.pressure >= 0 && fast.c.effects.pressure <= 1);
  const over = run({ kind:'timer', total:5, collapseSpeed:0.6 }, 6);
  assert.equal(over.c.effects.pressure, 1, 'oltre il totale -> pressure 1');
  assert.ok(over.c.events.includes('flood'), 'oltre il totale -> flood');
});

test('illusion.fakeRatio/flames modulano la frequenza dei fake', () => {
  const hi = run({ kind:'illusion', fakeRatio:0.8, flames:false }, 10);
  const lo = run({ kind:'illusion', fakeRatio:0.2, flames:false }, 10);
  assert.ok(count(hi.c, 'fake') > count(lo.c, 'fake'), 'ratio maggiore -> più fake');
  const flame   = run({ kind:'illusion', fakeRatio:0.4, flames:true }, 10);
  const noFlame = run({ kind:'illusion', fakeRatio:0.4, flames:false }, 10);
  assert.ok(count(flame.c, 'fake') > count(noFlame.c, 'fake'), 'flames -> più fake');
  assert.ok(Number.isFinite(hi.c.effects.fake));
});

test('descent.verlet/ivy accendono effects.verlet e emettono ivy', () => {
  const d = run({ kind:'descent', verlet:true, verletFor:15, ivy:true }, 3.5);
  assert.equal(d.c.effects.verlet, true);
  assert.ok(count(d.c, 'ivy') >= 3, 'ivy -> almeno 3 eventi');
  assert.equal(d.c.effects.ivy, 1);
  assert.ok(Number.isFinite(d.c.effects.verletPhase));
  const noIvy = run({ kind:'descent', verlet:true, verletFor:15 }, 3.5);
  assert.equal(count(noIvy.c, 'ivy'), 0, 'senza ivy nessun evento');
});

test('rain.slip/pushers: slip attivo e N push esatti', () => {
  const r = run({ kind:'rain', slip:true, pushers:3 }, 7);
  assert.equal(r.c.effects.slip, 1);
  assert.equal(count(r.c, 'push'), 3, 'pushers=3 -> esattamente 3 push');
  assert.ok(Number.isFinite(r.c.player.vx));
  const r1 = run({ kind:'rain', slip:true, pushers:1 }, 7);
  assert.equal(count(r1.c, 'push'), 1, 'pushers=1 -> esattamente 1 push');
  const noSlip = run({ kind:'rain', pushers:0 }, 7);
  assert.equal(noSlip.c.effects.slip, 0, 'senza slip -> slip 0');
});

test('handhold.hands/final: hands attivo e cadenza calm se final', () => {
  const h = run({ kind:'handhold', hands:true }, 5);
  assert.equal(h.c.effects.hands, 1);
  assert.equal(h.c.effects.calm, false);
  assert.equal(count(h.c, 'calm'), 0, 'non-final -> nessun calm');
  const f = run({ kind:'handhold', hands:true, final:true }, 5);
  assert.equal(f.c.effects.calm, true);
  assert.ok(count(f.c, 'calm') >= 2, 'final -> cadenza calm');
});

test('effects.verlet ed effects.elapsed derivano osservabili finiti', () => {
  const d = run({ kind:'descent', verlet:true, verletFor:15, ivy:true }, 2);
  assert.ok(Number.isFinite(d.c.effects.verletPhase));
  const t = run({ kind:'timer', total:35, collapseSpeed:0.6 }, 5);
  assert.ok(Number.isFinite(t.c.effects.elapsed));
  assert.ok(Number.isFinite(t.c.effects.elapsedNorm));
  assert.ok(t.c.effects.elapsedNorm > 0 && t.c.effects.elapsedNorm <= 1);
});

test('tutti i campi numerici di effects sono finiti per ogni kind', () => {
  const kinds = [
    { kind:'tutorial' },
    { kind:'wind', period:4, strength:2.5, dust:true },
    { kind:'quake', every:5, shakeT:0.8, shakeAmp:6 },
    { kind:'fallingBlades', every:3, speed:3 },
    { kind:'sleep', dimTo:0.35, wakeTouchEvery:1.2 },
    { kind:'rivals', count:3, pushForce:2 },
    { kind:'timer', total:35, collapseSpeed:0.6 },
    { kind:'illusion', fakeRatio:0.4, flames:true },
    { kind:'descent', verlet:true, verletFor:15, ivy:true },
    { kind:'rain', slip:true, pushers:3 },
    { kind:'risingWater', riseSpeed:0.8 },
    { kind:'handhold', hands:true, final:true },
  ];
  for (const mod of kinds) {
    const { c } = run(mod, 3);
    for (const [k, v] of Object.entries(c.effects)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), mod.kind + '.' + k);
    }
  }
});
