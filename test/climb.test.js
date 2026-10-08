import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClimb, stepClimb, climbPos, climbProgress, centerCol, rowCols, encounterAt, moveHands, SHAPES, applyShape } from '../src/climb.js';
import { GIRONI } from '../src/gironi.js';

// Il bot di scalata: muove le mani verso l'alto finché non raggiunge la cima.
// Verifica che OGNI girone sia arrampicabile (non più "percorribile a piedi").
function solveClimb(g) {
  const cl = createClimb(g);
  // preme il tasto che punta verso l'obiettivo: ↑ per 'up', ↓ per 'down'
  const act = cl.dir === 1
    ? { left: false, right: false, up: true, down: false }
    : { left: false, right: false, up: false, down: true };
  for (let t = 0; t < 6000; t++) {
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

test('moveHands sposta entrambe le mani e ritorna la differenza reale', () => {
  const cl = createClimb(GIRONI[0]);
  const d1 = moveHands(cl, +3);
  assert.equal(d1, 3);
  assert.equal(cl.lh.r, 3);
  const d2 = moveHands(cl, -5);       // non pu� scendere sotto 0
  assert.equal(cl.lh.r, 0);
  assert.equal(d2, -3);
});

test('i corpi deboli causano un cedimento se sosti sulla loro fila', () => {
  const cl = createClimb(GIRONI[0]);
  // porta le mani su una fila debole
  const weak = [...cl.weakRows][0];
  moveHands(cl, weak);
  assert.ok(cl.weakRows.has(cl.lh.r), 'setup: non sono su una fila debole');
  let collapsed = false;
  for (let i = 0; i < 200; i++) {
    stepClimb(cl, { left:false, right:false, up:false, down:false }, 0.016);
    if (cl.collapseEvent) { collapsed = true; break; }
  }
  assert.ok(collapsed, 'il corpo debole non � mai ceduto');
  assert.ok(cl.lh.r < weak, 'non sono caduto dopo il cedimento');
});

// ---------------------------------------------------------------------------
// V2: parametri di scalata PER-LIVELLO (g.climb). Default = valori storici.
// ---------------------------------------------------------------------------

test('createClimb: senza g.climb usa i valori di default (regressione)', () => {
  const cl = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  assert.equal(cl.reachDur, 0.11, 'REACH_TIME default');
  assert.equal(cl.hang, 11, 'HANG default');
  assert.equal(cl.weakEvery, 8, 'weakEvery default');
});

test('createClimb: g.climb sovrascrive reach/hold/hang/weakEvery', () => {
  const g = { ...GIRONI[0], climb: { reach: 0.2, hold: 0.3, hang: 16, weakEvery: 4 } };
  const cl = createClimb(g);
  assert.equal(cl.reachDur, 0.2);
  assert.equal(cl.holdTime, 0.3);
  assert.equal(cl.hang, 16);
  // le righe deboli ora seguono weakEvery=4, non 8
  const weak = [...cl.weakRows];
  assert.ok(weak.length > 0, 'nessuna fila debole');
  for (let i = 1; i < weak.length; i++)
    assert.equal(weak[i] - weak[i - 1], 4, 'weakEvery non applicato');
});

test('i 13 gironi hanno feel di scalata distinti (non tutti uguali)', () => {
  const sigs = GIRONI.map(g => {
    const cl = createClimb(g);
    return [cl.reachDur, cl.hang, cl.weakEvery].join(',');
  });
  assert.ok(new Set(sigs).size >= 6, 'meno di 6 feel distinti: ' + new Set(sigs).size);
});

// ---------------------------------------------------------------------------
// V3: DIREZIONE reale. Livello 'down' (09 EDERA): si parte dall'alto e si SCENDE.
// ---------------------------------------------------------------------------
test('createClimb direzione down: parte in cima e scende', () => {
  const up = createClimb({ id: 'u', bodies: GIRONI[0].bodies, direction: 'up' });
  const dn = createClimb({ id: 'd', bodies: GIRONI[0].bodies, direction: 'down' });
  assert.equal(up.dir, 1, 'up: dir +1');
  assert.equal(dn.dir, -1, 'down: dir -1');
  // up parte in basso (r=0), down parte in cima (r=nRows-1)
  assert.equal(up.lh.r, 0);
  assert.equal(dn.lh.r, dn.nRows - 1, 'down deve partire in cima');
});

test('stepClimb down: il tasto ↓ fa SCENDERE (r diminuisce), ↑ risale', () => {
  const dn = createClimb({ id: 'd', bodies: GIRONI[0].bodies, direction: 'down' });
  const r0 = Math.max(dn.lh.r, dn.rh.r);
  // ↓ = fisicamente GIÙ: verso l'obiettivo 'down' → r diminuisce
  for (let i = 0; i < 120; i++) stepClimb(dn, { left:false, right:false, up:false, down:true }, 0.016);
  const rDown = Math.max(dn.lh.r, dn.rh.r);
  assert.ok(rDown < r0, 'down: ↓ deve far scendere (r diminuisce)');
  // ↑ = fisicamente SU: si retrocede di una fila → r aumenta
  for (let i = 0; i < 120; i++) stepClimb(dn, { left:false, right:false, up:true, down:false }, 0.016);
  assert.ok(Math.max(dn.lh.r, dn.rh.r) > rDown, 'down: ↑ deve far risalire (r aumenta)');
});

test('stepClimb up: il tasto ↑ fa SALIRE (r aumenta), ↓ scende', () => {
  const up = createClimb({ id: 'u', bodies: GIRONI[0].bodies, direction: 'up' });
  const r0 = Math.max(up.lh.r, up.rh.r);
  for (let i = 0; i < 120; i++) stepClimb(up, { left:false, right:false, up:true, down:false }, 0.016);
  const rUp = Math.max(up.lh.r, up.rh.r);
  assert.ok(rUp > r0, 'up: ↑ deve far salire (r aumenta)');
  for (let i = 0; i < 120; i++) stepClimb(up, { left:false, right:false, up:false, down:true }, 0.016);
  assert.ok(Math.max(up.lh.r, up.rh.r) < rUp, 'up: ↓ deve far scendere (r diminuisce)');
});

test('stepClimb down: reached quando si arriva in BASSO', () => {
  const dn = createClimb({ id: 'd', bodies: GIRONI[0].bodies, direction: 'down' });
  dn.lh.r = 0; dn.rh.r = 0; dn.lhA.r = 0; dn.rhA.r = 0;
  stepClimb(dn, { left:false, right:false, up:false, down:false }, 0.016);
  assert.ok(dn.reached, 'down: reached al fondo');
});

// ---------------------------------------------------------------------------
// BUG B: dopo un movimento laterale le mani restavano offset per sempre e
// l'IK teneva un braccio teso fino a fine livello. A riposo (nessun input,
// nessun reach) le colonne devono derivare dolcemente verso il centro fila.
// ---------------------------------------------------------------------------
test('BUG B: a riposo le mani derivano verso centerCol (niente braccia tese)', () => {
  const cl = createClimb(GIRONI[0]);
  const row = Math.floor(cl.nRows / 2);
  const center = centerCol(cl, row);
  const cs = rowCols(cl, row);
  const left = cs[0], right = cs[cs.length - 1];
  cl.lh = { c: left, r: row }; cl.rh = { c: right, r: row };
  cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
  cl.reach = 0; cl.which = null;
  const d0L = Math.abs(cl.lhA.c - center), d0R = Math.abs(cl.rhA.c - center);
  assert.ok(d0L > 0.5 && d0R > 0.5, 'setup: le mani non sono offsettate');
  let prevL = d0L, prevR = d0R;
  for (let i = 0; i < 120; i++) {
    stepClimb(cl, { left:false, right:false, up:false, down:false }, 0.016);
    const dL = Math.abs(cl.lhA.c - center), dR = Math.abs(cl.rhA.c - center);
    assert.ok(dL <= prevL + 1e-9, `L non monotona a ${i}: ${dL} > ${prevL}`);
    assert.ok(dR <= prevR + 1e-9, `R non monotona a ${i}: ${dR} > ${prevR}`);
    assert.ok(Number.isFinite(cl.lhA.c) && Number.isFinite(cl.rhA.c), 'coord non finita');
    assert.ok(cl.has(Math.round(cl.lhA.c), row) && cl.has(Math.round(cl.rhA.c), row),
      'la deriva ha lasciato un appiglio valido');
    prevL = dL; prevR = dR;
  }
  assert.ok(prevL < d0L - 0.5, 'L non si è avvicinata al centro');
  assert.ok(prevR < d0R - 0.5, 'R non si è avvicinata al centro');
});

// ---------------------------------------------------------------------------
// BUG B (scalata): il rientro non deve funzionare SOLO da fermi. Anche TENENDO
// PREMUTO SU le mani devono convergere verso una coppia larga-quanto-le-spalle,
// così le braccia non restano mai tese a fine livello. Qui: parto con le mani
// molto divaricate e salgo per 400 frame; il divario deve ridursi.
// ---------------------------------------------------------------------------
test('BUG B (in scalata): tenendo SU il divario tra le mani si riduce', () => {
  const cl = createClimb(GIRONI[0]);
  const row = Math.floor(cl.nRows / 2);
  cl.lh = { c: 8, r: row }; cl.rh = { c: 12, r: row };
  cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
  cl.reach = 0; cl.which = null;
  const gap0 = Math.abs(cl.rh.c - cl.lh.c);
  assert.ok(gap0 > 2, 'setup: mani divaricate');
  for (let i = 0; i < 400; i++) stepClimb(cl, { left:false, right:false, up:true, down:false }, 0.016);
  const gap1 = Math.abs(cl.rhA.c - cl.lhA.c);
  assert.ok(gap1 < gap0 - 0.5, `in scalata il divario non si è ridotto: ${gap0} -> ${gap1}`);
  assert.ok(cl.has(Math.round(cl.lhA.c), cl.lh.r) && cl.has(Math.round(cl.rhA.c), cl.rh.r),
    'convergenza ha lasciato appigli validi');
});

// Un movimento laterale esplicito NON deve venire annullato subito: per ~150ms
// la convergenza è sospesa (lateralT), poi riprende.
test('BUG B: la convergenza è sospesa per ~150ms dopo un laterale', () => {
  const cl = createClimb(GIRONI[0]);
  const row = Math.floor(cl.nRows / 2);
  cl.lh = { c: 6, r: row }; cl.rh = { c: 14, r: row };
  cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
  cl.reach = 0; cl.which = null; cl.lateralT = 0.15;
  const before = cl.lhA.c;
  for (let i = 0; i < 6; i++) stepClimb(cl, { left:false, right:false, up:false, down:false }, 0.016);
  assert.ok(Math.abs(cl.lhA.c - before) < 0.02, 'sospensione non attiva: ' + cl.lhA.c);
});

// ---------------------------------------------------------------------------
// V4: SHAPES — varietà strutturale della parete. Ogni girone può scegliere una
// forma (g.climb.shape). Default 'pyramid' = comportamento storico ESATTO.
// La REPAIR PASS garantisce che ogni fila resti non vuota (il bot e i test
// "almeno un appiglio per fila" ci contano).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// V5 LEVELGEN: le 13 tracce devono avere STRUTTURE diverse (colonne/passo/file),
// non solo la stessa griglia 21 colonne. E ognuna deve restare risolvibile.
// ---------------------------------------------------------------------------
test('LEVELGEN: le tracce hanno geometrie strutturalmente diverse', () => {
  const sigs = new Set();
  for (const g of GIRONI) {
    const cl = createClimb(g);
    // firma: numero colonne + passo + file + larghezza fascia di base
    const step = cl.cols.length > 1 ? Math.abs(cl.cols[1] - cl.cols[0]) : 0;
    sigs.add(cl.cols.length + ':' + step.toFixed(1) + ':' + cl.nRows);
    for (let r = 0; r < cl.nRows; r++) assert.ok(cl.holds[r].some(Boolean), `${g.id}: fila ${r} vuota`);
  }
  assert.ok(sigs.size >= 4, 'le tracce condividono la stessa geometria (firme=' + sigs.size + ')');
});

test('LEVELGEN: layout di default = griglia storica (21 colonne, passo 11)', () => {
  const cl = createClimb({ id: '01', bodies: GIRONI[0].bodies });
  assert.equal(cl.cols.length, 21, 'default cols');
  assert.equal(Math.round(Math.abs(cl.cols[1] - cl.cols[0])), 11, 'default colStep');
  assert.equal(cl.layout.cols, 21);
});

test('SHAPES: espone le forme supportate e pyramid è il default', () => {  assert.ok(Array.isArray(SHAPES), 'SHAPES non è un array');
  for (const s of ['pyramid', 'gaps', 'spiral', 'overhang'])
    assert.ok(SHAPES.includes(s), 'shape mancante: ' + s);
  const cl = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  assert.equal(cl.shape, 'pyramid', 'default shape deve essere pyramid');
});

test('applyShape: ogni forma lascia OGNI fila con >=1 appiglio (repair pass)', () => {
  const base = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  for (const shape of SHAPES) {
    const holds = base.holds.map(row => row.slice());
    applyShape(holds, base.nRows, base.cols.length, shape, base.cx, base.cols);
    for (let r = 0; r < base.nRows; r++)
      assert.ok(holds[r].some(Boolean), `${shape}: fila ${r} senza appigli`);
  }
});

test('applyShape: pyramid è identità (nessuna modifica)', () => {
  const base = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  const holds = base.holds.map(row => row.slice());
  applyShape(holds, base.nRows, base.cols.length, 'pyramid', base.cx, base.cols);
  assert.deepEqual(holds, base.holds, 'pyramid non deve modificare la griglia');
});

test('applyShape: gaps rimuove appigli ma la repair pass tiene ogni fila viva', () => {
  const base = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  const holds = base.holds.map(row => row.slice());
  applyShape(holds, base.nRows, base.cols.length, 'gaps', base.cx, base.cols);
  const before = base.holds.flat().filter(Boolean).length;
  const after = holds.flat().filter(Boolean).length;
  assert.ok(after < before, 'gaps non ha rimosso alcun appiglio');
  for (let r = 0; r < base.nRows; r++)
    assert.ok(holds[r].some(Boolean), `gaps: fila ${r} vuota`);
});

test('applyShape: spiral sposta la fascia valida in funzione della fila', () => {
  const base = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  const holds = base.holds.map(row => row.slice());
  applyShape(holds, base.nRows, base.cols.length, 'spiral', base.cx, base.cols);
  // il centro valido di almeno una fila non coincide col centro geometrico
  let shifted = false;
  for (let r = 0; r < base.nRows; r++) {
    const cs = [];
    for (let c = 0; c < base.cols.length; c++) if (holds[r][c]) cs.push(c);
    if (!cs.length) continue;
    const mid = (cs[0] + cs[cs.length - 1]) / 2;
    if (Math.abs(mid - 10) > 0.5) { shifted = true; break; }
  }
  assert.ok(shifted, 'spiral non ha spostato alcuna fascia');
});

test('applyShape: overhang ha larghezza NON monotona (qualche fila più larga di quella sotto)', () => {
  const base = createClimb({ id: 'x', bodies: GIRONI[0].bodies });
  const holds = base.holds.map(row => row.slice());
  applyShape(holds, base.nRows, base.cols.length, 'overhang', base.cx, base.cols);
  const width = r => holds[r].filter(Boolean).length;
  let wider = false;
  for (let r = 1; r < base.nRows; r++) if (width(r) > width(r - 1)) { wider = true; break; }
  assert.ok(wider, 'overhang: nessuna fila più larga di quella sotto');
});

test('createClimb: g.climb.shape viene applicato e registrato', () => {
  const g = { ...GIRONI[0], climb: { ...GIRONI[0].climb, shape: 'gaps' } };
  const cl = createClimb(g);
  assert.equal(cl.shape, 'gaps');
  for (let r = 0; r < cl.nRows; r++)
    assert.ok(cl.holds[r].some(Boolean), `gaps: fila ${r} vuota`);
});

test('createClimb: shape sconosciuta ricade su pyramid (robustezza)', () => {
  const g = { ...GIRONI[0], climb: { ...GIRONI[0].climb, shape: 'boh' } };
  const cl = createClimb(g);
  assert.equal(cl.shape, 'pyramid');
  assert.deepEqual(cl.holds, createClimb(GIRONI[0]).holds);
});

test('il bot risolve TUTTI i gironi con la loro shape', () => {
  for (const g of GIRONI) {
    const r = solveClimb(g);
    assert.ok(r.ok, `${g.id} (${g.climb && g.climb.shape}): bloccato a fila ${r.r}/${r.nRows}`);
  }
});

test('almeno 3 LAYOUT distinti tra i 13 gironi (varieta strutturale)', () => {
  const layouts = GIRONI.map(g => (g.climb && g.climb.layout) || 'pyramid');
  assert.ok(new Set(layouts).size >= 3, 'meno di 3 layout distinti: ' + JSON.stringify(layouts));
});

test('girone 01 resta pyramid-monotono (base >= cima)', () => {
  const cl = createClimb(GIRONI[0]);
  assert.equal(cl.shape, 'pyramid');
  const count = r => cl.holds[r].filter(Boolean).length;
  assert.ok(count(0) >= count(cl.nRows - 1), 'la base deve essere >= della cima');
});
