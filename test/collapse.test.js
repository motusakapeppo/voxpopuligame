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
  collapseUpright,
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
  assert.ok(Array.isArray(c.figs) && c.figs.length >= 100 && c.figs.length <= 170,
    `figure=${c.figs.length}, attese 100-170`);
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

// ---------------------------------------------------------------------------
// TORQUE — all'atterraggio la figura RUOTA: testa e piedi ricevono spostamenti
// orizzontali di SEGNO OPPOSTO (non più una pura traslazione che la fa scivolare).
// ---------------------------------------------------------------------------
const BODIES = [
  { x: 200, y: 300, w: 60, h: 12 }, { x: 260, y: 300, w: 60, h: 12 },
  { x: 230, y: 286, w: 60, h: 12 },
];

// Esegue il crollo e, per ogni figura, misura lo spostamento orizzontale di
// testa (parts[2]) e piede (parts[3]) nel primo step dopo il contatto: è la
// risposta immediata al momento applicato all'atterraggio.
function landingDisplacements(seed, supported = 4) {
  const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported, seed });
  const seen = new Set();
  const pending = [];
  const out = [];
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) {
    stepCollapse(c, DT);
    steps++;
    for (let i = 0; i < c.world.figures.length; i++) {
      const rf = c.world.figures[i];
      if (rf.landed && !seen.has(i)) {
        seen.add(i);
        pending.push({ i, hx: rf.parts[2].x, fx: rf.parts[3].x, at: steps });
      }
    }
    for (let k = pending.length - 1; k >= 0; k--) {
      const p = pending[k];
      if (steps - p.at >= 1) {
        const rf = c.world.figures[p.i];
        out.push({ dh: rf.parts[2].x - p.hx, df: rf.parts[3].x - p.fx });
        pending.splice(k, 1);
      }
    }
  }
  return out;
}

test('torque: all\'atterraggio testa e piedi si spostano in direzioni opposte', () => {
  const disp = landingDisplacements(11);
  assert.ok(disp.length >= 20, `atterraggi catturati=${disp.length}, attesi >=20`);
  let opposite = 0;
  for (const d of disp) {
    const sh = Math.sign(d.dh), sf = Math.sign(d.df);
    if (sh !== 0 && sf !== 0 && sh !== sf) opposite++;
  }
  assert.ok(opposite >= disp.length * 0.6,
    `segno opposto in ${opposite}/${disp.length} figure (atteso >=60%)`);
});

// ---------------------------------------------------------------------------
// KEEP / SUPPORTED — supported diversi → keep diversi → stato assestato diverso.
// `keep` non è più morto: ancora i "fedeli" eretti, quindi il numero di figure
// ancora in piedi alla fine cresce con supported.
// ---------------------------------------------------------------------------
test('keep/supported: supported diversi → keep e figure erette misurano diverso', () => {
  const run = (supported) => {
    const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported, seed: 42 });
    let steps = 0;
    while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
    return { keep: c.keep, upright: collapseUpright(c), total: c.figs.length };
  };
  const lo = run(1), hi = run(8);
  assert.ok(lo.keep >= 3 && lo.keep <= lo.total, `keep fuori range: ${lo.keep}`);
  assert.ok(hi.keep > lo.keep, `keep non varia con supported: ${lo.keep} vs ${hi.keep}`);
  assert.ok(hi.upright > lo.upright,
    `figure erette non variano: ${lo.upright} vs ${hi.upright}`);
});

// ---------------------------------------------------------------------------
// NO EXPLOSION — il crollo NON è un blast: dopo il settle la pila resta dentro
// l'impronta della base (max |x-cx| <= ~1.3× la semi-ampiezza della base) e la
// velocità orizzontale subito dopo il crack→collapse è piccola (< ~1.5 px/frame).
// ---------------------------------------------------------------------------
function baseHalfSpan(c) {
  const base = c.figs.filter(f => f.row === 0).map(f => f.x);
  return (Math.max(...base) - Math.min(...base)) / 2;
}

test('no explosion: la pila resta dentro l\'impronta della base', () => {
  const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported: 4, seed: 9 });
  const cx = 480 / 2;
  const half = baseHalfSpan(c);
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
  let maxOut = 0;
  for (const rf of c.world.figures) {
    for (const p of rf.parts) maxOut = Math.max(maxOut, Math.abs(p.x - cx));
  }
  assert.ok(maxOut <= half * 1.3 + 2,
    `spread ${maxOut.toFixed(1)} > ${(half * 1.3 + 2).toFixed(1)} (base half-span ${half})`);
});

test('no explosion: velocità orizzontale piccola subito dopo il crack→collapse', () => {
  const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported: 4, seed: 9 });
  let steps = 0;
  while (c.phase !== 'collapse' && steps < 10000) { stepCollapse(c, DT); steps++; }
  // primi 10 frame di crollo: cattura l'impulso di rilascio (buckle), non un blast
  let maxVx = 0;
  for (let k = 0; k < 10 && !collapseFinished(c); k++) {
    stepCollapse(c, DT);
    for (const rf of c.world.figures) {
      for (const p of rf.parts) maxVx = Math.max(maxVx, Math.abs(p.x - p.px));
    }
  }
  assert.ok(maxVx < 1.5, `velocità orizzontale ${maxVx.toFixed(2)} >= 1.5 (esplosione)`);
});

// ---------------------------------------------------------------------------
// VERTICAL-DRIVEN — lo spostamento verticale medio domina l'orizzontale: le
// figure cadono per gravità, non vengono lanciate di lato.
// ---------------------------------------------------------------------------
test('vertical-driven: lo spostamento verticale medio domina l\'orizzontale', () => {
  const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported: 4, seed: 9 });
  const start = c.world.figures.map(f => f.parts.map(p => ({ x: p.x, y: p.y })));
  let steps = 0;
  while (!collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
  let sumDy = 0, sumDx = 0, n = 0;
  for (let i = 0; i < c.world.figures.length; i++) {
    const rf = c.world.figures[i];
    for (let k = 0; k < rf.parts.length; k++) {
      sumDy += Math.abs(rf.parts[k].y - start[i][k].y);
      sumDx += Math.abs(rf.parts[k].x - start[i][k].x);
      n++;
    }
  }
  assert.ok(sumDy / n > sumDx / n,
    `avg|dy|=${(sumDy / n).toFixed(2)} <= avg|dx|=${(sumDx / n).toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// CASCADE — a inizio crollo la struttura cede dal basso: le file basse (non
// fedeli) si sono mosse più di quelle alte, che sono ancora trattenute.
// ---------------------------------------------------------------------------
test('cascade: a inizio crollo le file basse si muovono più di quelle alte', () => {
  const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported: 4, seed: 9 });
  const start = c.world.figures.map(f => f.parts.map(p => ({ x: p.x, y: p.y })));
  let steps = 0;
  while (c.phase !== 'collapse' && steps < 10000) { stepCollapse(c, DT); steps++; }
  const t0 = steps;
  while (steps - t0 < 30 && !collapseFinished(c) && steps < 10000) { stepCollapse(c, DT); steps++; }
  const byRow = new Map();
  for (let i = 0; i < c.world.figures.length; i++) {
    const rf = c.world.figures[i];
    const row = c.figs[i].row;
    let d = 0;
    for (let k = 0; k < rf.parts.length; k++) {
      d += Math.hypot(rf.parts[k].x - start[i][k].x, rf.parts[k].y - start[i][k].y);
    }
    d /= rf.parts.length;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(d);
  }
  const avg = (row) => { const a = byRow.get(row) || [0]; return a.reduce((s, v) => s + v, 0) / a.length; };
  const baseAvg = (avg(1) + avg(2)) / 2;   // righe basse non-fedeli (la 0 è il nucleo fedele)
  const topAvg = (avg(12) + avg(13)) / 2;  // righe alte, ancora trattenute
  assert.ok(baseAvg > topAvg + 0.5,
    `base ${baseAvg.toFixed(2)} non > top ${topAvg.toFixed(2)} (cascata non bottom-up)`);
});

// ---------------------------------------------------------------------------
// DETERMINISMO + FINITEZZA — 10000 step di guardia con keep/supported attivi:
// nessun NaN/Infinity e stesso seed → stesso stato finale (incl. erette).
// ---------------------------------------------------------------------------
test('determinismo + finitezza dopo 10000 step con keep/supported', () => {
  const run = () => {
    const c = createCollapse({ bodies: BODIES, viewW: 480, viewH: 320, supported: 6, seed: 123 });
    let steps = 0;
    while (!collapseFinished(c) && steps < 10000) {
      stepCollapse(c, DT);
      for (const rf of c.world.figures) {
        for (const p of rf.parts) {
          assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
            `particella non finita allo step ${steps}`);
        }
      }
      steps++;
    }
    assert.ok(steps < 10000, `troppi step: ${steps}`);
    return {
      upright: collapseUpright(c),
      pos: c.world.figures.map(f => f.parts.map(p => [p.x, p.y])),
    };
  };
  const a = run(), b = run();
  assert.deepEqual(a.pos, b.pos, 'posizioni finali non deterministiche');
  assert.equal(a.upright, b.upright, 'conteggio erette non deterministico');
});