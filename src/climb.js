// ============================================================================
// CLIMB — arrampicata a due mani. Ogni mano ha una PRESA (hold): quando è a 1
// è ben piantata, a 0 è staccata e sta raggiungendo l'appiglio. Le mani si
// muovono ALTERNATE (sinistra, destra, sinistra…): è un vero ciclo di scalata.
// Il bacino pende sotto le mani e le segue con ritardo (dondolio), così il
// corpo "tira su" invece di teletrasportarsi. Tutto deterministico e testabile.
// ============================================================================
import { STEP_Y, TOP_Y } from './gironi.js';
import { resolveLayout, buildGrid } from './levelgen.js';

export const REACH_TIME = 0.11;     // durata di un movimento di mano (s) — più veloce
export const HOLD_TIME = 0.14;      // recupero della presa dopo lo spostamento
const HANG = 11;                    // bacino sotto le mani ≈ 0.5h (posa "X" reale)
const PLANT_PULL = 4;               // quanto il corpo "sale" quando una mano pianta

// V4: FORME della parete. Ogni girone può scegliere una struttura diversa, così
// i brani non si sentono tutti uguali. 'pyramid' = comportamento storico ESATTO.
export const SHAPES = ['pyramid', 'gaps', 'spiral', 'overhang'];

// REPAIR PASS: garantisce che OGNI fila abbia almeno un appiglio. Il bot di
// scalata (nearestCol) e i test "almeno un appiglio per fila" ci contano: senza
// questa pass una forma potrebbe svuotare una fila e bloccare l'ascesa.
function repairRows(holds, nRows, nCols, cx, cols) {
  let center = 0;
  for (let c = 1; c < nCols; c++)
    if (Math.abs(cols[c] - cx) < Math.abs(cols[center] - cx)) center = c;
  for (let r = 0; r < nRows; r++) {
    if (holds[r].some(Boolean)) continue;
    holds[r][center] = true;
  }
}

// Applica una forma alla griglia di appigli (mutazione in place, ritorna holds).
// Deterministico: nessun RNG. `cols` = coordinate x delle colonne, `cx` = centro.
export function applyShape(holds, nRows, nCols, shape, cx, cols) {
  if (shape === 'gaps') {
    // buchi deterministici: alcune prese mancano, la parete è più "rotta"
    for (let r = 0; r < nRows; r++)
      for (let c = 0; c < nCols; c++)
        if ((r * 7 + c * 3) % 11 === 0) holds[r][c] = false;
    repairRows(holds, nRows, nCols, cx, cols);
    return holds;
  }
  if (shape === 'spiral') {
    // la fascia valida si sposta di lato salendo (serpentina deterministica)
    for (let r = 0; r < nRows; r++) {
      const shift = Math.round(Math.sin(r * 0.3) * 4);
      if (shift === 0) continue;
      let lo = -1, hi = -1;
      for (let c = 0; c < nCols; c++) if (holds[r][c]) { if (lo < 0) lo = c; hi = c; }
      if (lo < 0) continue;
      for (let c = 0; c < nCols; c++) holds[r][c] = false;
      for (let c = lo + shift; c <= hi + shift; c++)
        if (c >= 0 && c < nCols) holds[r][c] = true;
    }
    repairRows(holds, nRows, nCols, cx, cols);
    return holds;
  }
  if (shape === 'overhang') {
    // larghezza NON monotona: alcune file sporgono oltre quelle sotto
    for (let r = 0; r < nRows; r++) {
      if (r % 3 !== 1) continue;
      let lo = -1, hi = -1;
      for (let c = 0; c < nCols; c++) if (holds[r][c]) { if (lo < 0) lo = c; hi = c; }
      if (lo < 0) continue;
      for (let c = lo - 2; c <= hi + 2; c++)
        if (c >= 0 && c < nCols) holds[r][c] = true;
    }
    repairRows(holds, nRows, nCols, cx, cols);
    return holds;
  }
  return holds;   // 'pyramid' (default) o sconosciuta: identità
}

// griglia di appigli derivata dal girone: più stretta salendo (piramide)
export function createClimb(g) {
  const cx = 160;
  // V2: parametri di scalata PER-LIVELLO (g.climb), con default = valori storici.
  // Ogni girone può avere il suo "feel": reach/hold più lenti, hang diverso, e una
  // diversa densità di appigli debolli (weakEvery).
  const pc = (g && g.climb) || {};
  const reach = Number.isFinite(pc.reach) ? pc.reach : REACH_TIME;
  const hold = Number.isFinite(pc.hold) ? pc.hold : HOLD_TIME;
  const hang = Number.isFinite(pc.hang) ? pc.hang : HANG;
  const weakEvery = Number.isFinite(pc.weakEvery) && pc.weakEvery > 0 ? pc.weakEvery : 8;
  const bottomY = Math.max(...g.bodies.map(b => b.y));
  // V5 LEVELGEN: layout per-traccia (colonne/passo/larghezza/corsie/file). Il
  // layout di default riproduce ESATTAMENTE la griglia storica.
  const layout = resolveLayout(g);
  const rowStep = Number.isFinite(layout.rowStep) ? layout.rowStep : STEP_Y;
  const nRows = Math.max(2, Math.floor((bottomY - TOP_Y) / rowStep) + 1);
  const grid = buildGrid(layout, nRows);
  const cols = grid.cols;
  const rows = Array.from({ length: nRows }, (_, r) => bottomY - r * rowStep); // r=0 in basso
  const holds = grid.holds;

  // V4: forma della parete (default 'pyramid' = griglia storica invariata).
  const shape = SHAPES.includes(pc.shape) ? pc.shape : 'pyramid';
  applyShape(holds, nRows, cols.length, shape, cx, cols);
  // V5: garanzia finale — ogni fila non vuota (il bot/nearestCol ci contano).
  repairRows(holds, nRows, cols.length, cx, cols);

  const has = (c, r) => c >= 0 && c < cols.length && r >= 0 && r < nRows && holds[r][c];
  const xOf = c => cols[Math.max(0, Math.min(cols.length - 1, Math.round(c)))];
  const yOf = r => rows[Math.max(0, Math.min(nRows - 1, Math.round(r)))];

  // indice della colonna più vicina al centro (dipende dal numero di colonne).
  let c0 = 0;
  for (let c = 1; c < cols.length; c++)
    if (Math.abs(cols[c] - cx) < Math.abs(cols[c0] - cx)) c0 = c;
  // V3: DIREZIONE. 'down' (es. 09 EDERA) = si parte in cima e si SCENDE.
  const dir = (g && g.direction === 'down') ? -1 : 1;
  const startR = dir === 1 ? 0 : nRows - 1;
  // se la mano destra (c0+1) non ha appiglio sulla fila di partenza, usane una valida
  let cR = c0 + 1;
  if (!has(cR, startR)) { const nc = nearestCol({ has, cols, nRows }, cR, startR); cR = nc == null ? c0 : nc; }
  const lh0 = has(c0, startR) ? c0 : (nearestCol({ has, cols, nRows }, c0, startR) ?? 0);
  // posizione iniziale del bacino = centro presa + HANG
  const bx0 = (xOf(lh0) + xOf(cR)) / 2;
  const by0 = yOf(startR) + hang;
  // appigli DEBOLI: ogni tanto un corpo cede mentre ci sali sopra (deterministico
  // per girone, così è sempre lo stesso e testabile)
  const weakRows = new Set();
  const seed = String(g.id || '').split('').reduce((a, ch) => (a + ch.charCodeAt(0)) % 5, 0);
  for (let r = 4 + seed; r < nRows - 3; r += weakEvery) weakRows.add(r);
  return {
    cols, rows, holds, has, xOf, yOf, nRows, cx, dir, shape, layout,
    reachDur: reach, holdTime: hold, hang, weakEvery,
    lh: { c: lh0, r: startR }, rh: { c: cR, r: startR },
    lhA: { c: lh0, r: startR }, rhA: { c: cR, r: startR },  // animati (float)
    lhHold: 1, rhHold: 1,                            // presa 0..1
    bx: bx0, by: by0, vby: 0,                        // bacino (animato)
    lead: 'l',                                      // quale mano sale per prossima
    reach: 0,
    from: null, to: null, which: null,
    weakRows, weakTimer: 0, collapsed: new Set(), collapseEvent: null,
    reached: false, lateralT: 0,
  };
}

// Sposta entrambe le mani di `dr` file (usato da aiuti e spinte). Torna la
// differenza reale applicata, così il chiamante sa quanto sei salito/sceso.
export function moveHands(cl, dr) {
  const nr = Math.max(0, Math.min(cl.nRows - 1, cl.lh.r + dr));
  const lc = nearestCol(cl, cl.lh.c, nr);
  const rc = nearestCol(cl, cl.rh.c, nr);
  const before = cl.lh.r;
  if (lc !== null) cl.lh = { c: lc, r: nr };
  if (rc !== null) cl.rh = { c: rc, r: nr };
  cl.lhA = { ...cl.lh }; cl.rhA = { ...cl.rh };
  cl.reach = 0; cl.which = null;
  cl.lhHold = 1; cl.rhHold = 1;
  return cl.lh.r - before;
}

// Le posizioni correnti di mani e corpo (usate da disegno, camera, effetti).
export function climbPos(cl) {
  const lx = cl.xOf(cl.lhA.c), ly = cl.yOf(cl.lhA.r);
  const rx = cl.xOf(cl.rhA.c), ry = cl.yOf(cl.rhA.r);
  const tx = (lx + rx) / 2;
  return {
    lx, ly, rx, ry, tx,
    bx: cl.bx, by: cl.by,                       // bacino (hip)
    ty: cl.by,                                  // compat: il corpo pende qui
    shx: cl.bx, shy: cl.by - 8,                 // spalle (approssimazione per effetti)
    reachL: cl.lhHold, reachR: cl.rhHold,        // 0 = mano staccata, 1 = piantata
  };
}

// trova la colonna valida più vicina a `c` nella fila `r` (per restringersi salendo)
function nearestCol(cl, c, r) {
  if (cl.has(c, r)) return c;
  for (let d = 1; d < cl.cols.length; d++) {
    if (cl.has(c - d, r)) return c - d;
    if (cl.has(c + d, r)) return c + d;
  }
  return null;
}

// Le colonne valide (appigli) di una fila.
export function rowCols(cl, r) {
  const out = [];
  for (let c = 0; c < cl.cols.length; c++) if (cl.has(c, r)) out.push(c);
  return out;
}

// La colonna valida più centrale di una fila: è lì che sta il corpo del
// giocatore mentre sale, quindi è lì che vanno messi incontri e potenziamenti
// (altrimenti finiscono sui bordi, irraggiungibili).
export function centerCol(cl, r) {
  const cs = rowCols(cl, r);
  if (!cs.length) return 0;
  let best = cs[0];
  for (const c of cs) if (Math.abs(cl.xOf(c) - cl.cx) < Math.abs(cl.xOf(best) - cl.cx)) best = c;
  return best;
}

// Prossima colonna valida spostandosi di lato, con fallback alla più vicina.
function sideCol(cl, hold, dir) {
  let c = hold.c + dir;
  while (c >= 0 && c < cl.cols.length && !cl.has(c, hold.r)) c += dir;
  if (c >= 0 && c < cl.cols.length && cl.has(c, hold.r)) return c;
  return nearestCol(cl, hold.c, hold.r) ?? hold.c;
}

// Avvia il movimento di UNA mano verso un bersaglio (se l'appiglio esiste).
function reachOne(cl, which, target) {
  const cur = which === 'l' ? cl.lh : cl.rh;
  if (!cl.has(target.c, target.r)) return false;
  cl.from = { [which]: { ...(which === 'l' ? cl.lhA : cl.rhA) } };
  cl.to = { [which]: { c: target.c, r: target.r } };
  cl.which = which;
  cl.reach = cl.reachDur;
  if (which === 'l') cl.lhHold = 0; else cl.rhHold = 0;
  return true;
}

// Sceglie la prossima mossa: la mano "lead" prova ad avanzare di una fila VERSO
// l'obiettivo (dir: +1 sale, -1 scende); se non c'è appiglio, l'altra mano; poi
// si alterna. Il bacino segue.
function autoStep(cl) {
  const dir = cl.dir || 1;
  const order = cl.lead === 'l' ? ['l', 'r'] : ['r', 'l'];
  for (const which of order) {
    const cur = which === 'l' ? cl.lh : cl.rh;
    const r = Math.max(0, Math.min(cl.nRows - 1, cur.r + dir));
    // BUG B: invece di conservare l'offset laterale, la mano mira alla COPPIA
    // CENTRALE della nuova riga (sx: centerCol, dx: centerCol+1). Così, salendo,
    // le braccia tornano naturalmente alla posa rilassata.
    const cc = centerCol(cl, r);
    const aim = which === 'l' ? cc : (cl.has(cc + 1, r) ? cc + 1 : cc);
    const c = cl.has(aim, r) ? aim : nearestCol(cl, cur.c, r);
    if (c !== null) {
      reachOne(cl, which, { c, r });
      cl.lead = which === 'l' ? 'r' : 'l';   // alterna
      return true;
    }
  }
  return false;
}

// BUG B: le colonne delle mani convergono verso una COPPIA larga-quanto-le-spalle
// CENTRATA sulla fila: mano sinistra → centerCol, mano destra → centerCol+1 (il
// default storico c0/c0+1). Deterministico, nessun RNG. Funziona SEMPRE — anche
// mentre si scala (tenendo SU): è questo che evita che un braccio resti teso fino
// a fine livello dopo un movimento laterale. Sospesa: (a) sulla mano che sta
// raggiungendo (cl.which), (b) per LATERAL_HOLD secondi dopo un laterale esplicito.
const CONVERGE_RATE = 1.8;   // colonne al secondo
const LATERAL_HOLD = 0.15;   // s di sospensione dopo un movimento laterale
function convergeHands(cl, dt) {
  if ((cl.lateralT || 0) > 0) return;
  for (const which of ['l', 'r']) {
    if (cl.which === which) continue;          // mano in reach: non toccarla
    const hold = which === 'l' ? cl.lh : cl.rh;
    const anim = which === 'l' ? cl.lhA : cl.rhA;
    const cc = centerCol(cl, hold.r);
    const target = which === 'l' ? cc
      : (cl.has(cc + 1, hold.r) ? cc + 1 : cc);
    const dc = target - anim.c;
    if (Math.abs(dc) < 1e-4) { anim.c = target; hold.c = target; continue; }
    const step = Math.sign(dc) * Math.min(Math.abs(dc), CONVERGE_RATE * dt);
    const nc = anim.c + step;
    if (cl.has(Math.round(nc), hold.r)) { anim.c = nc; hold.c = Math.round(nc); }
    else { anim.c = target; hold.c = target; }   // fallback: salta al centro valido
  }
}

export function stepClimb(cl, input, dt) {
  const d = Number.isFinite(dt) ? dt : 0.016;
  // presa: recupera verso 1 quando la mano è ferma
  if (cl.reach <= 0) {
    if (cl.which !== 'l') cl.lhHold = Math.min(1, cl.lhHold + d / (cl.holdTime || HOLD_TIME));
    if (cl.which !== 'r') cl.rhHold = Math.min(1, cl.rhHold + d / (cl.holdTime || HOLD_TIME));
  }

  if (cl.reach > 0) {
    cl.reach -= d;
    const k = 1 - Math.max(0, cl.reach) / cl.reachDur;
    const lerp = (a, b) => a + (b - a) * (k * k * (3 - 2 * k));
    const w = cl.which, to = cl.to && cl.to[w], from = cl.from && cl.from[w];
    if (to && from) {
      const cur = w === 'l' ? cl.lhA : cl.rhA;
      cur.c = lerp(from.c, to.c); cur.r = lerp(from.r, to.r);
      if (k >= 1) { if (w === 'l') cl.lh = { ...to }; else cl.rh = { ...to }; cl.which = null; }
    }
  } else {
    // input manuale FISICO: ↑ = SU, ↓ = GIÙ, SEMPRE, su ogni livello.
    // Il tasto che punta verso l'obiettivo avanza (autoStep); quello opposto
    // retrocede di una fila. ← → spostano una singola mano di lato.
    const dir = cl.dir || 1;
    const advance = dir === 1 ? input.up : input.down;
    const retreat = dir === 1 ? input.down : input.up;
    if (input.left) { reachOne(cl, 'l', { c: sideCol(cl, cl.lh, -1), r: cl.lh.r }); cl.lateralT = LATERAL_HOLD; }
    else if (input.right) { reachOne(cl, 'r', { c: sideCol(cl, cl.rh, 1), r: cl.rh.r }); cl.lateralT = LATERAL_HOLD; }
    else if (advance) autoStep(cl);
    else if (retreat) {
      const rr = Math.max(0, Math.min(cl.nRows - 1, cl.lh.r - dir));
      const rc = nearestCol(cl, cl.lh.c, rr);
      if (rc !== null) reachOne(cl, 'l', { c: rc, r: rr });
    }
  }

  // BUG B: convergenza CONTINUA delle mani verso la coppia spalle (anche in
  // scalata). Sospesa durante la corsa laterale recente e sulla mano in reach.
  if (cl.lateralT > 0) cl.lateralT = Math.max(0, cl.lateralT - d);
  convergeHands(cl, d);

  // bacino: segue il centro delle mani con ritardo (dondolio) e non supera
  // mai la presa. Quando un corpo vicino cede (piantata), dà un "tirone" su.
  const mx = (cl.xOf(cl.lhA.c) + cl.xOf(cl.rhA.c)) / 2;
  const my = (cl.yOf(cl.lhA.r) + cl.yOf(cl.rhA.r)) / 2 + (cl.hang || HANG);
  const k = 1 - Math.pow(0.001, d);         // smorzamento indipendente dal frame
  cl.vby += (my - cl.by) * 8 * d;           // molla verticale (il "tiro su")
  cl.vby *= Math.pow(0.02, d);              // attrito
  cl.by += cl.vby * d + (my - cl.by) * k;
  cl.bx += (mx - cl.bx) * k * 0.8;
  // non salire mai sopra le mani: il bacino resta appeso
  if (cl.by < my - 2) { cl.by = my - 2; cl.vby = Math.max(0, cl.vby); }

  // CORPI DEBOLI: se ti stai aggrappando a una fila debole, il corpo cede e ti
  // trascina INDIETRO (giù in 'up', su in 'down') di 2-3 file.
  if (cl.weakRows && cl.weakRows.has(Math.max(cl.lh.r, cl.rh.r))) {
    cl.weakTimer += d;
    if (cl.weakTimer > 1.4) {
      cl.weakTimer = 0;
      const fell = moveHands(cl, -3 * (cl.dir || 1));
      cl.vby = -40;                     // scossa di caduta
      cl.collapseEvent = { fell, r: Math.max(cl.lh.r, cl.rh.r) };
    }
  } else {
    cl.weakTimer = 0;
  }

  const dir = cl.dir || 1;
  if (dir === 1 ? (cl.lh.r >= cl.nRows - 1 && cl.rh.r >= cl.nRows - 1)
                : (cl.lh.r <= 0 && cl.rh.r <= 0)) cl.reached = true;
}

// Quante file ha scalato (0 = inizio, 1 = obiettivo) — per HUD e fine girone.
export function climbProgress(cl) {
  const r = Math.max(cl.lhA.r, cl.rhA.r) / Math.max(1, cl.nRows - 1);
  const p = (cl.dir || 1) === 1 ? r : 1 - r;
  return Math.max(0, Math.min(1, p));
}

// L'incontro NON risolto che scatta sulla fila corrente del giocatore (e in quella
// sotto). Attivazione per FILA: impossibile mancarlo, gli incontri scandiscono
// l'ascesa invece di restare su un bordo irraggiungibile.
export function encounterAt(cl, encounters) {
  const r = Math.max(cl.lh.r, cl.rh.r);
  for (const e of encounters) {
    if (e.resolved) continue;
    if (Math.abs(e.row - r) <= 1) return e;
  }
  return null;
}
