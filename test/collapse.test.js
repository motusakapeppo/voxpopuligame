// ============================================================================
// COLLAPSE — test del finale. La piramide si RIVELA (persone vere), TREMA,
// CROLLA con fisica ragdoll deterministica e si SETTLE in una maceria che
// diventa lo sfondo del CTA. Niente flip, niente cerchio.
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createCollapse, stepCollapse, drawCollapse, collapseFinished, PHASES,
} from '../src/collapse.js';

const DT = 1 / 60;

// ---------------------------------------------------------------------------
// FASI — flip e circle rimossi, la sequenza è la nuova
// ---------------------------------------------------------------------------
test('PHASES non contiene flip né circle e ha la sequenza nuova', () => {
  const names = PHASES.map(p => p[0]);
  assert.ok(!names.includes('flip'), 'flip ancora presente');
  assert.ok(!names.includes('circle'), 'circle ancora presente');
  assert.deepEqual(names, ['zoomOut', 'revealBodies', 'crack', 'collapse', 'settle']);
});

// ---------------------------------------------------------------------------
// FINITENESS — run completo (10000 step di guardia): nessun NaN/Infinity
// ---------------------------------------------------------------------------
test('run completo fino a done: ogni coordinata resta finita (guard 10000 step)', () => {
  const bodies = [
    { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
    { x: 230, y: 286, w: 60, h: 12 },
  ];
  const c = createCollapse({ bodies, viewW: 480, viewH: 320, supported: 4 });
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) {
    stepCollapse(c, DT);
    for (const f of c.figs) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), `fig non finita allo step ${steps}`);
    }
    if (c.world) {
      for (const rf of c.world.figures) {
        for (const p of rf.parts) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
            `particella non finita allo step ${steps}`);
        }
      }
    }
    steps++;
  }
  assert.ok(collapseFinished(c), `collapse non finito in ${steps} step`);
  assert.ok(steps < 10000, `troppi step: ${steps}`);
});

// ---------------------------------------------------------------------------
// DETERMINISMO — stesso seed → stesse posizioni finali
// ---------------------------------------------------------------------------
test('stesso seed → posizioni finali identiche (deepEqual)', () => {
  const run = () => {
    const bodies = [
      { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
      { x: 230, y: 286, w: 60, h: 12 },
    ];
    const c = createCollapse({ bodies, viewW: 480, viewH: 320, supported: 4, seed: 77 });
    let steps = 0;
    while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
    return c.world.figures.map(f => f.parts.map(p => [p.x, p.y]));
  };
  assert.deepEqual(run(), run());
});

// ---------------------------------------------------------------------------
// SETTLE — le figure riposano vicino al fondo, senza penetrarlo
// ---------------------------------------------------------------------------
test('dopo il settle le figure riposano sul fondo senza penetrarlo', () => {
  const H = 320;
  const bodies = [
    { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
    { x: 230, y: 286, w: 60, h: 12 },
  ];
  const c = createCollapse({ bodies, viewW: 480, viewH: H, supported: 4, seed: 5 });
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
  const EPS = 1.5;
  for (const rf of c.world.figures) {
    for (const p of rf.parts) {
      assert.ok(p.y >= -EPS && p.y <= H + EPS, `particella fuori dal mondo: y=${p.y}`);
      assert.ok(p.y <= H + EPS, `penetrazione nel fondo: y=${p.y}`);
    }
  }
  // la maggior parte delle figure è vicino al fondo (maceria, non nuvola)
  const nearGround = c.world.figures.filter(f =>
    f.parts.some(p => p.y > H - 30)).length;
  assert.ok(nearGround >= c.world.figures.length * 0.6,
    `solo ${nearGround}/${c.world.figures.length} vicino al fondo`);
});

// ---------------------------------------------------------------------------
// NO ARC — il disegno del settle non emette NESSUNA chiamata arc (cerchio rimosso)
// ---------------------------------------------------------------------------
test('drawCollapse sul settle non chiama mai ctx.arc', () => {
  const bodies = [
    { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
    { x: 230, y: 286, w: 60, h: 12 },
  ];
  const c = createCollapse({ bodies, viewW: 480, viewH: 320, supported: 4, seed: 3 });
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop === 'arc') return (...a) => { calls.push(a); };
      // ogni altro metodo canvas: no-op registrato (fillRect, save, restore…)
      if (typeof prop === 'string' && !(prop in t)) t[prop] = () => {};
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
  drawCollapse(ctx, c, 0);
  assert.equal(calls.length, 0, `arc chiamato ${calls.length} volte`);
});

// ---------------------------------------------------------------------------
// BODIES — createCollapse accetta i bodies e costruisce le figure da loro
// ---------------------------------------------------------------------------
test('createCollapse accetta bodies e costruisce figure + mondo ragdoll', () => {
  const bodies = [
    { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
    { x: 230, y: 286, w: 60, h: 12 },
  ];
  const c = createCollapse({ bodies, viewW: 480, viewH: 320, supported: 4 });
  assert.ok(Array.isArray(c.figs) && c.figs.length >= 56 && c.figs.length <= 64,
    `figure=${c.figs.length}, attese 56-64`);
  assert.ok(c.world, 'mondo ragdoll mancante');
  assert.equal(c.world.figures.length, c.figs.length,
    'una ragfigure per figura della griglia');
  assert.ok(Array.isArray(c.world.boxes) && c.world.boxes.length >= bodies.length,
    'i bodies non sono passati al mondo come box');
  // pose distinte: almeno 3 stati diversi nella griglia
  const states = new Set(c.figs.map(f => f.state));
  assert.ok(states.size >= 3, `stati distinti=${states.size}`);
  // profondità nel range 0.4..0.95
  for (const f of c.figs) {
    assert.ok(f.depth >= 0.4 && f.depth <= 0.95, `depth fuori range: ${f.depth}`);
  }
});

// ---------------------------------------------------------------------------
// NO RANDOM — la sorgente non contiene Math.random
// ---------------------------------------------------------------------------
test('la sorgente collapse.js non contiene Math.random', () => {
  const src = readFileSync(new URL('../src/collapse.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('Math.random'), 'Math.random trovato in collapse.js');
});