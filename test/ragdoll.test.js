import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ragCreateWorld, ragAddFigure, ragStep, ragWorldStats, ragSleepRatio,
  RAG_SLEEP_MOTION, RAG_WAKE_MOTION, RAG_SLEEP_FRAMES,
} from '../src/ragdoll.js';

const DT = 1 / 60;

// Mondo piccolo: pavimento a y=170 con un muretto al centro.
function miniWorld() {
  return ragCreateWorld({
    gravity: 80, groundY: 170,
    boxes: [{ x: 150, y: 150, w: 20, h: 20 }],
  });
}

// Figura di prova: 4 particelle (bacino, testa, due piedi) su 3 ossa.
function addTestFigure(world, x, y) {
  return ragAddFigure(world, { x, y, scale: 1 });
}

// ---------------------------------------------------------------------------
// DETERMINISMO
// ---------------------------------------------------------------------------
test('stesso seed → stesse posizioni finali (determinismo)', () => {
  const run = () => {
    const w = ragCreateWorld({ gravity: 80, groundY: 170, seed: 123,
      boxes: [{ x: 150, y: 150, w: 20, h: 20 }] });
    for (let i = 0; i < 8; i++) ragAddFigure(w, { x: 100 + i * 15, y: 60 + (i % 3) * 8 });
    for (let i = 0; i < 240; i++) ragStep(w, DT);
    return w.figures.map(f => f.parts.map(p => [p.x, p.y]));
  };
  assert.deepEqual(run(), run());
});

test('seed diversi → simulazioni diverse', () => {
  const run = (seed) => {
    const w = ragCreateWorld({ gravity: 80, groundY: 170, seed,
      boxes: [{ x: 150, y: 150, w: 20, h: 20 }] });
    ragAddFigure(w, { x: 100, y: 60 });
    ragAddFigure(w, { x: 160, y: 40 });
    for (let i = 0; i < 120; i++) ragStep(w, DT);
    return w.figures.map(f => f.parts.map(p => [p.x, p.y]));
  };
  assert.notDeepEqual(run(1), run(2));
});

// ---------------------------------------------------------------------------
// FINITENESS — freeze guard: 10000 step senza NaN/Infinity
// ---------------------------------------------------------------------------
test('dopo 10000 step tutte le posizioni restano finite', () => {
  const w = miniWorld();
  for (let i = 0; i < 12; i++) ragAddFigure(w, { x: 60 + i * 18, y: 40 + (i % 4) * 10 });
  for (let i = 0; i < 10000; i++) {
    ragStep(w, DT);
    for (const f of w.figures) {
      for (const p of f.parts) {
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
          `pos non finita allo step ${i}: ${p.x},${p.y}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// BONE LENGTH — dopo il settle le ossa rispettano il target (±0.75px)
// ---------------------------------------------------------------------------
test('dopo il settle ogni osso è entro ±0.75px dal target', () => {
  const w = miniWorld();
  for (let i = 0; i < 6; i++) ragAddFigure(w, { x: 80 + i * 25, y: 80 });
  for (let i = 0; i < 600; i++) ragStep(w, DT);
  for (const f of w.figures) {
    for (const b of f.bones) {
      const a = f.parts[b.a], c = f.parts[b.b];
      const dx = c.x - a.x, dy = c.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      assert.ok(Math.abs(len - b.len) <= 0.75,
        `osso ${b.a}-${b.b}: len=${len.toFixed(3)} target=${b.len}`);
    }
  }
});

// ---------------------------------------------------------------------------
// SLEEP — il mondo si addormenta e si sveglia
// ---------------------------------------------------------------------------
test('mondo stabilito → ragSleepRatio > 0.8', () => {
  const w = miniWorld();
  for (let i = 0; i < 5; i++) ragAddFigure(w, { x: 90 + i * 20, y: 100 });
  for (let i = 0; i < 900; i++) ragStep(w, DT);
  assert.ok(ragSleepRatio(w) > 0.8, `sleepRatio=${ragSleepRatio(w).toFixed(3)}`);
});

test('una figura addormentata si sveglia se una vicina si muove veloce', () => {
  const w = ragCreateWorld({ gravity: 80, groundY: 170, seed: 9 });
  const a = ragAddFigure(w, { x: 100, y: 160 });
  const b = ragAddFigure(w, { x: 108, y: 160 });   // vicina: condivide il broadphase
  for (let i = 0; i < 600; i++) ragStep(w, DT);
  assert.ok(a.sleeping && b.sleeping, 'le figure non si sono addormentate');
  // sveglia manualmente solo `a` e spingila: b deve svegliarsi per prossimità
  a.sleeping = false;
  for (const p of a.parts) { p.x += 6; }
  ragStep(w, DT);
  assert.ok(!b.sleeping, 'la vicina non si è svegliata');
});

test('le costanti di sleep esistono con i valori richiesti', () => {
  assert.equal(RAG_SLEEP_MOTION, 0.08);
  assert.equal(RAG_WAKE_MOTION, 0.18);
  assert.equal(RAG_SLEEP_FRAMES, 60);
});

// ---------------------------------------------------------------------------
// NO PENETRATION — nessuna particella dentro un box o sotto il pavimento
// ---------------------------------------------------------------------------
test('nessuna particella penetra i box o il fondo del mondo', () => {
  const w = miniWorld();
  for (let i = 0; i < 10; i++) ragAddFigure(w, { x: 60 + i * 20, y: 30 + (i % 5) * 12 });
  for (let i = 0; i < 1200; i++) ragStep(w, DT);
  const EPS = 0.6;
  for (const f of w.figures) {
    for (const p of f.parts) {
      assert.ok(p.y <= w.groundY + EPS, `sotto il pavimento: y=${p.y}`);
      for (const box of w.boxes) {
        // penetrazione = dentro il box OLTRE l'epsilon (poggiare sulla
        // superficie è fisica corretta, non penetrazione)
        const inside = p.x > box.x + EPS && p.x < box.x + box.w - EPS &&
                       p.y > box.y + EPS && p.y < box.y + box.h - EPS;
        assert.ok(!inside, `particella dentro il box: (${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// NO RANDOM — la sorgente non contiene Math.random
// ---------------------------------------------------------------------------
test('la sorgente non contiene Math.random', () => {
  const src = readFileSync(new URL('../src/ragdoll.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('Math.random'), 'Math.random trovato nella sorgente');
});

// ---------------------------------------------------------------------------
// API — forma minima del mondo e delle figure
// ---------------------------------------------------------------------------
test('ragWorldStats riporta conteggi coerenti', () => {
  const w = miniWorld();
  ragAddFigure(w, { x: 100, y: 100 });
  ragAddFigure(w, { x: 140, y: 100 });
  const s = ragWorldStats(w);
  assert.equal(s.figures, 2);
  assert.ok(s.particles >= 2 * 4, `particles=${s.particles}`);
  assert.ok(s.bones >= 2 * 3, `bones=${s.bones}`);
});

test('ragAddFigure rispetta scale e restituisce la figura', () => {
  const w = miniWorld();
  const f = addTestFigure(w, 100, 100);
  assert.ok(f, 'nessuna figura restituita');
  assert.ok(Array.isArray(f.parts) && f.parts.length >= 3, 'meno di 3 particelle');
  assert.ok(Array.isArray(f.bones) && f.bones.length >= 3, 'meno di 3 ossa');
  assert.equal(typeof f.sleeping, 'boolean');
  const f2 = ragAddFigure(w, { x: 200, y: 100, scale: 2 });
  const span1 = Math.max(...f.parts.map(p => p.y)) - Math.min(...f.parts.map(p => p.y));
  const span2 = Math.max(...f2.parts.map(p => p.y)) - Math.min(...f2.parts.map(p => p.y));
  assert.ok(span2 > span1 * 1.4, `scale non applicata: ${span1} vs ${span2}`);
});

// ---------------------------------------------------------------------------
// T-fix: i parametri del mondo (pair e parametri fisici) DEVONO essere copiati.
// Bug: ragCreateWorld non copiava opts.pair → world.pair undefined → le
// collisioni fra figure erano silenziosamente DISATTIVATE in produzione.
// ---------------------------------------------------------------------------
test('ragCreateWorld copia pair e i parametri fisici dagli opts', () => {
  const w = ragCreateWorld({ pair: true, friction: 0.7, rest: 0.04, pairR: 3.5 });
  assert.equal(w.pair, true, 'pair non copiato (bug: collisioni fra figure disattivate)');
  assert.equal(w.friction, 0.7, 'friction non copiata');
  assert.equal(w.rest, 0.04, 'rest non copiata');
  assert.equal(w.pairR, 3.5, 'pairR non copiata');
});

test('con pair:true due figure sovrapposte si SEPARANO; con pair off no', () => {
  const dist = (w) => {
    const a = w.figures[0], b = w.figures[1];
    return Math.hypot(a.parts[0].x - b.parts[0].x, a.parts[0].y - b.parts[0].y);
  };
  const run = (pair) => {
    const w = ragCreateWorld({ gravity: 80, groundY: 170, seed: 5, pair });
    ragAddFigure(w, { x: 100, y: 100 });
    ragAddFigure(w, { x: 101, y: 100 });   // quasi sovrapposte
    for (let i = 0; i < 120; i++) ragStep(w, 1 / 60);
    return dist(w);
  };
  const dOn = run(true), dOff = run(false);
  assert.ok(dOn > dOff + 1, `pair non separa: on=${dOn.toFixed(2)} off=${dOff.toFixed(2)}`);
});