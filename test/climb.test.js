import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClimb, stepClimb, climbPos, climbProgress, centerCol, rowCols, encounterAt } from '../src/climb.js';
import { GIRONI } from '../src/gironi.js';

// Il bot di scalata: muove le mani verso l'alto finché non raggiunge la cima.
// Verifica che OGNI girone sia arrampicabile (non più "percorribile a piedi").
function solveClimb(g) {
  const cl = createClimb(g);
  const noInput = { left: false, right: false, up: false, down: false };
  for (let t = 0; t < 6000; t++) {
    const act = { left: false, right: false, up: true, down: false };
    stepClimb(cl, act, 0.016);
    if (cl.reached) return { ok: true, steps: t };
  }
  return { ok: false, r: Math.max(cl.lhA.r, cl.rhA.r), nRows: cl.nRows };
}

for (const g of GIRONI) {
  test(`girone ${g.id} ${g.title} è arrampicabile fino in cima`, () => {
    const r = solveClimb(g);
    assert.ok(r.ok, `${g.id}: bloccato a fila ${r.r}/${r.nRows}`);
  });
}

test('la griglia di appigli si restringe salendo (piramide)', () => {
  const g = GIRONI[0];
  const cl = createClimb(g);
  const count = r => cl.holds[r].filter(Boolean).length;
  assert.ok(count(0) >= count(cl.nRows - 1), 'la base è più larga della cima');
});

test('il movimento di mano è animato nel tempo', () => {
  const cl = createClimb(GIRONI[0]);
  const before = climbPos(cl);
  // avvia il ciclo di salita, poi avanza finché la mano non si è spostata
  stepClimb(cl, { left: false, right: false, up: true, down: false }, 0.016);
  let moved = false;
  for (let i = 0; i < 30; i++) {
    stepClimb(cl, { left: false, right: false, up: false, down: false }, 0.016);
    const mid = climbPos(cl);
    if (mid.ly !== before.ly || mid.ry !== before.ry || mid.tx !== before.tx) { moved = true; break; }
  }
  assert.ok(moved, 'le mani non si muovono');
});

test('climbProgress va da 0 (base) a 1 (cima)', () => {
  const cl = createClimb(GIRONI[0]);
  assert.ok(climbProgress(cl) < 0.2);
  cl.lhA.r = cl.nRows - 1; cl.rhA.r = cl.nRows - 1;
  assert.equal(climbProgress(cl), 1);
});

test('a ogni fila esiste almeno un appiglio valido', () => {
  for (const g of GIRONI) {
    const cl = createClimb(g);
    for (let r = 0; r < cl.nRows; r++)
      assert.ok(cl.holds[r].some(Boolean), `${g.id}: fila ${r} senza appigli`);
  }
});

// REGRESSIONE: durante l'animazione le coordinate sono float. Se xOf/yOf
// restituissero undefined, il disegno produrrebbe NaN e il Bresenham
// entrerebbe in loop infinito → freeze del gioco. Mai più.
test('xOf/yOf non producono mai undefined o NaN, nemmeno con indici float', () => {
  const cl = createClimb(GIRONI[0]);
  for (const c of [-3, -0.7, 0, 1.5, 3.4, 6.9, 10, 99]) {
    assert.ok(Number.isFinite(cl.xOf(c)), 'xOf(' + c + ') non finito');
    assert.ok(Number.isFinite(cl.yOf(c)), 'yOf(' + c + ') non finito');
  }
});

test('dopo molti input laterali le posizioni restano finite', () => {
  const cl = createClimb(GIRONI[0]);
  const acts = [{ left: 1 }, { right: 1 }, { up: 1 }, { left: 1 }, { down: 1 }];
  for (let i = 0; i < 60; i++) {
    const a = acts[i % acts.length];
    stepClimb(cl, { left: !!a.left, right: !!a.right, up: !!a.up, down: !!a.down }, 0.016);
    const p = climbPos(cl);
    for (const v of [p.lx, p.ly, p.rx, p.ry, p.tx, p.ty])
      assert.ok(Number.isFinite(v), 'posizione non finita a iterazione ' + i);
  }
});

test('centerCol restituisce una colonna valida e vicina al centro', () => {
  const cl = createClimb(GIRONI[0]);
  for (let r = 0; r < cl.nRows; r++) {
    const c = centerCol(cl, r);
    assert.ok(cl.has(c, r), `centerCol(${r}) = ${c} non è un appiglio`);
    // la più centrale: nessun'altra colonna valida è più vicina a cx
    for (const cc of rowCols(cl, r))
      assert.ok(Math.abs(cl.xOf(c) - cl.cx) <= Math.abs(cl.xOf(cc) - cl.cx) + 0.001,
        `centerCol(${r})=${c} non è la più centrale`);
  }
});

test('encounterAt scatta quando il giocatore è sulla fila dell incontro', () => {
  const cl = createClimb(GIRONI[0]);
  const encs = [{ row: 5, resolved: false, kind: 'hand' }, { row: 12, resolved: false, kind: 'sleeper' }];
  cl.lh = { c: 3, r: 5 }; cl.rh = { c: 4, r: 5 };
  assert.ok(encounterAt(cl, encs), 'incontro non attivato sulla sua fila');
  assert.equal(encounterAt(cl, encs).row, 5);
  cl.lh = { c: 3, r: 11 }; cl.rh = { c: 4, r: 11 };
  assert.equal(encounterAt(cl, encs).row, 12, 'incontro adiacente non attivato');
});

test('encounterAt ignora gli incontri già risolti', () => {
  const cl = createClimb(GIRONI[0]);
  const encs = [{ row: 5, resolved: true, kind: 'hand' }];
  cl.lh = { c: 3, r: 5 }; cl.rh = { c: 4, r: 5 };
  assert.equal(encounterAt(cl, encs), null, 'un incontro risolto è stato riattivato');
});
